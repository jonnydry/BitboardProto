import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Post, ViewMode } from '../types';
import { PostItem } from './PostItem';
import { ArrowLeft, Bookmark, Trash2, Globe, Loader2, AlertTriangle } from 'lucide-react';
import { bookmarkService } from '../services/bookmarkService';
import { listService } from '../services/listService';
import { identityService } from '../services/identityService';
import { nostrService } from '../services/nostr/NostrService';
import { toastService } from '../services/toastService';
import { logger } from '../services/loggingService';
import { votingService } from '../services/votingService';
import { FeatureFlags, UIConfig } from '../config';
import { useUIStore } from '../stores/uiStore';
import { useUserStore } from '../stores/userStore';
import { usePostStore } from '../stores/postStore';
import { useAppNavigationHandlers } from '../features/layout/useAppNavigationHandlers';

interface BookmarksProps {
  knownUsers?: Set<string>;
  onVote: (postId: string, direction: 'up' | 'down') => void;
  onComment: (postId: string, content: string, parentCommentId?: string) => void;
  onEditComment?: (postId: string, commentId: string, content: string) => void;
  onDeleteComment?: (postId: string, commentId: string) => void;
  onCommentVote?: (postId: string, commentId: string, direction: 'up' | 'down') => void;
  onDeletePost?: (postId: string) => void;
}

export const Bookmarks: React.FC<BookmarksProps> = ({
  knownUsers,
  onVote,
  onComment,
  onEditComment,
  onDeleteComment,
  onCommentVote,
  onDeletePost,
}) => {
  // Read state from Zustand stores
  const bookmarkedIds = useUIStore((s) => s.bookmarkedIds);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const userState = useUserStore((s) => s.userState);
  const toggleMute = useUserStore((s) => s.toggleMute);
  const isMuted = useUserStore((s) => s.isMuted);
  const posts = usePostStore((s) => s.posts);
  const setPosts = usePostStore((s) => s.setPosts);

  // Navigation handlers
  const { handleViewBit, handleViewProfile, handleEditPost, handleTagClick } =
    useAppNavigationHandlers();

  const onClose = useCallback(() => setViewMode(ViewMode.FEED), [setViewMode]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState(false);
  const [isHydratingBookmarks, setIsHydratingBookmarks] = useState(false);
  const hydrateRequestRef = useRef(0);

  const missingBookmarkHexKey = useMemo(() => {
    const inStore = new Set(posts.map((p) => p.id));
    return bookmarkedIds
      .filter((id) => !inStore.has(id) && /^[0-9a-f]{64}$/i.test(id))
      .slice()
      .sort()
      .join('\n');
  }, [bookmarkedIds, posts]);

  // Re-fetch bookmarked posts from relays when IDs exist but posts were evicted from the LRU cache
  useEffect(() => {
    if (!missingBookmarkHexKey) {
      setIsHydratingBookmarks(false);
      return;
    }

    const fetchable = missingBookmarkHexKey.split('\n').filter(Boolean);
    const reqId = ++hydrateRequestRef.current;
    let cancelled = false;
    setIsHydratingBookmarks(true);

    void (async () => {
      try {
        const events = await nostrService.fetchPostsByIds(fetchable);
        if (cancelled || reqId !== hydrateRequestRef.current) return;

        if (events.length === 0) return;

        let converted = events.map((event) => nostrService.eventToPost(event));
        const nostrIds = converted.map((p) => p.nostrEventId).filter(Boolean) as string[];
        const voteTallies = await votingService.fetchVotesForPosts(nostrIds);
        if (cancelled || reqId !== hydrateRequestRef.current) return;

        converted = converted.map((post) => {
          if (!post.nostrEventId) return post;
          const tally = voteTallies.get(post.nostrEventId);
          if (!tally) return post;
          return {
            ...post,
            upvotes: tally.upvotes,
            downvotes: tally.downvotes,
            score: tally.score,
            uniqueVoters: tally.uniqueVoters,
            votesVerified: true,
          };
        });

        setPosts((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const newPosts = converted.filter((p) => !existingIds.has(p.id));
          if (newPosts.length === 0) return prev;
          return [...newPosts, ...prev];
        });

        const pubkeys = Array.from(
          new Set(converted.map((p) => p.authorPubkey).filter(Boolean) as string[]),
        );
        if (pubkeys.length > 0) {
          await nostrService.fetchProfiles(pubkeys);
          if (cancelled || reqId !== hydrateRequestRef.current) return;
          setPosts((prev) =>
            prev.map((p) =>
              p.authorPubkey
                ? { ...p, author: nostrService.getDisplayName(p.authorPubkey) }
                : p,
            ),
          );
        }
      } catch (e) {
        logger.warn('Bookmarks', 'Failed to load saved posts from relays', e);
      } finally {
        if (!cancelled && reqId === hydrateRequestRef.current) {
          setIsHydratingBookmarks(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [missingBookmarkHexKey, setPosts]);

  // Get bookmarked posts in order
  const bookmarkedPosts = useMemo(() => {
    const postsMap = new Map(posts.map((p) => [p.id, p]));
    return bookmarkedIds.map((id) => postsMap.get(id)).filter((p): p is Post => p !== undefined);
  }, [posts, bookmarkedIds]);

  const handleClearAll = () => {
    bookmarkService.clearAll();
    setIsConfirmingClearAll(false);
    toastService.push({
      type: 'success',
      message: 'Bookmarks cleared',
      detail: 'All saved posts were removed from this device.',
      durationMs: UIConfig.TOAST_DURATION_MS,
    });
  };

  const handleSyncWithNostr = useCallback(async () => {
    if (!userState.identity) return;

    setIsSyncing(true);
    try {
      // 1. Fetch bookmarks from Nostr
      const remoteList = await listService.fetchBookmarks(userState.identity.pubkey);

      if (remoteList && remoteList.eventIds.length > 0) {
        // 2. Merge with local bookmarks
        const localIds = bookmarkService.getBookmarkedIds();
        const mergedIds = Array.from(new Set([...localIds, ...remoteList.eventIds]));

        // 3. Update local service
        mergedIds.forEach((id) => {
          if (!localIds.includes(id)) {
            bookmarkService.toggleBookmark(id); // This will add it
          }
        });

        // 4. If we added new ones from local, push back to Nostr
        if (mergedIds.length > remoteList.eventIds.length) {
          const unsigned = listService.buildBookmarksList({
            eventIds: mergedIds,
            pubkey: userState.identity.pubkey,
          });
          const signed = await identityService.signEvent(unsigned);
          await nostrService.publishSignedEvent(signed);
        }

        toastService.push({
          type: 'success',
          message: 'Bookmarks synced with Nostr',
          detail: `Found ${remoteList.eventIds.length} remote bookmarks.`,
          durationMs: UIConfig.TOAST_DURATION_MS,
        });
      } else if (bookmarkedIds.length > 0) {
        // No remote list, but we have local bookmarks - push them
        const unsigned = listService.buildBookmarksList({
          eventIds: bookmarkedIds,
          pubkey: userState.identity.pubkey,
        });
        const signed = await identityService.signEvent(unsigned);
        await nostrService.publishSignedEvent(signed);

        toastService.push({
          type: 'success',
          message: 'Bookmarks published to Nostr',
          durationMs: UIConfig.TOAST_DURATION_MS,
        });
      }
    } catch (error) {
      console.error('[Bookmarks] Sync error:', error);
      toastService.push({
        type: 'error',
        message: 'Failed to sync bookmarks',
        detail: error instanceof Error ? error.message : String(error),
        durationMs: UIConfig.TOAST_DURATION_MS,
      });
    } finally {
      setIsSyncing(false);
    }
  }, [userState.identity, bookmarkedIds]);

  // Stabilize callbacks to prevent PostItem re-renders
  const handleVote = useCallback(
    (postId: string, direction: 'up' | 'down') => {
      onVote(postId, direction);
    },
    [onVote],
  );

  const handleComment = useCallback(
    (postId: string, content: string, parentCommentId?: string) => {
      onComment(postId, content, parentCommentId);
    },
    [onComment],
  );

  const handleEditComment = useCallback(
    (postId: string, commentId: string, content: string) => {
      onEditComment?.(postId, commentId, content);
    },
    [onEditComment],
  );

  const handleDeleteComment = useCallback(
    (postId: string, commentId: string) => {
      onDeleteComment?.(postId, commentId);
    },
    [onDeleteComment],
  );

  const handleCommentVote = useCallback(
    (postId: string, commentId: string, direction: 'up' | 'down') => {
      onCommentVote?.(postId, commentId, direction);
    },
    [onCommentVote],
  );

  const handleDeletePost = useCallback(
    (postId: string) => {
      onDeletePost?.(postId);
    },
    [onDeletePost],
  );

  const handleToggleBookmark = useCallback((id: string) => {
    bookmarkService.toggleBookmark(id);
  }, []);

  const handleToggleMute = useCallback(
    (pubkey: string) => {
      toggleMute(pubkey);
    },
    [toggleMute],
  );

  // Virtualization for large lists (>25 items)
  const VIRTUALIZE_THRESHOLD = 25;
  const parentRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = bookmarkedPosts.length > VIRTUALIZE_THRESHOLD;

  // Always call the hook (React rules), but use count=0 when not virtualizing
  const rowVirtualizer = useWindowVirtualizer({
    count: shouldVirtualize ? bookmarkedPosts.length : 0,
    estimateSize: () => 250,
    scrollMargin: parentRef.current?.offsetTop ?? 0,
    overscan: 5,
  });

  return (
    <div className="animate-fade-in">
      <button
        onClick={onClose}
        className="flex items-center gap-2 text-terminal-dim hover:text-terminal-text mb-4 uppercase text-sm font-bold group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        BACK TO FEED
      </button>

      {/* Header */}
      <div className="flex justify-between items-end mb-6 pb-2 border-b border-terminal-dim/30">
        <div>
          <h2 className="text-2xl font-terminal uppercase tracking-widest text-terminal-text flex items-center gap-2">
            <Bookmark size={24} />
            SAVED_BITS
          </h2>
          <p className="text-xs text-terminal-dim mt-1">
            {bookmarkedPosts.length} {bookmarkedPosts.length === 1 ? 'post' : 'posts'} saved
          </p>
        </div>

        {bookmarkedPosts.length > 0 && (
          <div className="flex items-center gap-2">
            {userState.identity && FeatureFlags.ENABLE_LISTS && (
              <button
                onClick={handleSyncWithNostr}
                disabled={isSyncing}
                className="flex items-center gap-2 text-xs text-terminal-text hover:bg-terminal-text hover:text-black border border-terminal-text px-2 py-1 transition-colors uppercase font-bold"
                title="Sync bookmarks with Nostr (NIP-51)"
              >
                {isSyncing ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
                {isSyncing ? 'SYNCING...' : 'SYNC_NOSTR'}
              </button>
            )}
            <button
              onClick={() => setIsConfirmingClearAll(true)}
              className="flex items-center gap-2 text-xs text-terminal-dim hover:text-terminal-alert border border-terminal-dim hover:border-terminal-alert px-2 py-1 transition-colors uppercase font-bold"
            >
              <Trash2 size={12} />
              CLEAR_ALL
            </button>
          </div>
        )}
      </div>

      {isConfirmingClearAll && bookmarkedPosts.length > 0 && (
        <div className="mb-6 space-y-3 border border-terminal-alert bg-terminal-alert/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="mt-0.5 text-terminal-alert" />
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-terminal-alert">
                Remove all saved posts?
              </p>
              <p className="mt-1 text-sm text-terminal-dim">
                This clears {bookmarkedPosts.length} bookmarked{' '}
                {bookmarkedPosts.length === 1 ? 'post' : 'posts'} from this device.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setIsConfirmingClearAll(false)}
              className="border border-terminal-dim px-3 py-2 text-xs uppercase tracking-wide text-terminal-dim transition-colors hover:border-terminal-text hover:text-terminal-text"
            >
              Cancel
            </button>
            <button
              onClick={handleClearAll}
              className="border border-terminal-alert bg-terminal-alert px-3 py-2 text-xs uppercase tracking-wide text-black transition-colors hover:opacity-90"
            >
              Confirm Clear All
            </button>
          </div>
        </div>
      )}

      {/* Bookmarked Posts */}
      {bookmarkedPosts.length === 0 ? (
        isHydratingBookmarks ? (
          <div className="border border-terminal-dim p-12 text-center text-terminal-dim flex flex-col items-center gap-4">
            <Loader2 size={40} className="animate-spin text-terminal-text opacity-60" />
            <p className="text-sm font-bold uppercase tracking-wide">Loading saved posts…</p>
            <p className="text-xs max-w-sm">
              Fetching from relays (saved bits can drop out of the feed cache while bookmarks stay on
              this device).
            </p>
          </div>
        ) : (
          <div className="border border-terminal-dim p-12 text-center text-terminal-dim flex flex-col items-center gap-4">
            <div className="text-4xl opacity-20">
              <Bookmark size={48} />
            </div>
            <div>
              <p className="font-bold">&gt; NO SAVED BITS</p>
              <p className="text-xs mt-2">
                {bookmarkedIds.length > 0
                  ? 'Could not load these saves from relays (offline, or IDs are not Nostr events). Try CLEAR_ALL or save again from the feed.'
                  : 'Click the bookmark icon on any post to save it here.'}
              </p>
            </div>
          </div>
        )
      ) : shouldVirtualize && rowVirtualizer ? (
        <div ref={parentRef} className="relative">
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const post = bookmarkedPosts[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <PostItem
                    post={post}
                    userState={userState}
                    knownUsers={knownUsers}
                    onVote={handleVote}
                    onComment={handleComment}
                    onEditComment={handleEditComment}
                    onDeleteComment={handleDeleteComment}
                    onCommentVote={handleCommentVote}
                    onViewBit={handleViewBit}
                    onViewProfile={handleViewProfile}
                    onTagClick={handleTagClick}
                    onEditPost={handleEditPost}
                    onDeletePost={handleDeletePost}
                    onToggleBookmark={handleToggleBookmark}
                    onToggleMute={handleToggleMute}
                    isMuted={isMuted}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {bookmarkedPosts.map((post) => (
            <PostItem
              key={post.id}
              post={post}
              userState={userState}
              knownUsers={knownUsers}
              onVote={handleVote}
              onComment={handleComment}
              onEditComment={handleEditComment}
              onDeleteComment={handleDeleteComment}
              onCommentVote={handleCommentVote}
              onViewBit={handleViewBit}
              onViewProfile={handleViewProfile}
              onTagClick={handleTagClick}
              onEditPost={handleEditPost}
              onDeletePost={handleDeletePost}
              onToggleBookmark={handleToggleBookmark}
              onToggleMute={handleToggleMute}
              isMuted={isMuted}
            />
          ))}
        </div>
      )}
    </div>
  );
};
