import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { MapPin, Share2, Lock, ChevronUp, Calendar, Radio, Plus } from 'lucide-react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Post, SortMode } from '../../types';
import { BoardType, ViewMode } from '../../types';
import { SortSelector } from '../../components/SortSelector';
import { PostSkeleton } from '../../components/PostSkeleton';
import { LoadingPhaseIndicator } from '../../components/LoadingSkeletons';
import { ShareBoardLink } from '../../components/ShareBoardLink';
import { encryptedBoardService } from '../../services/encryptedBoardService';
import {
  useUIStore,
  useViewMode,
  useSearchQuery,
  useSortMode,
  useFeedFilter,
  useHasMorePosts,
} from '../../stores/uiStore';
import { useActiveBoard } from '../../stores/boardStore';
import { useAppNavigationHandlers } from '../layout/useAppNavigationHandlers';
import {
  FeedLoaderRow,
  FeedPostCard,
  TIME_CHUNK_LABELS,
  TimeChunk,
  TimeChunkHeader,
} from './feedParts';

const FEED_VIRTUALIZE_THRESHOLD = 25;

function getTimeChunk(timestamp: number): TimeChunk {
  const now = new Date();
  const postDate = new Date(timestamp);

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(today);
  monthAgo.setMonth(monthAgo.getMonth() - 1);

  if (postDate >= today) return 'today';
  if (postDate >= yesterday) return 'yesterday';
  if (postDate >= weekAgo) return 'this_week';
  if (postDate >= monthAgo) return 'this_month';
  return 'earlier';
}

export function FeedView(props: {
  sortedPosts: Post[];

  getBoardName: (postId: string) => string | undefined;
  knownUsers: Set<string>;

  onVote: (postId: string, direction: 'up' | 'down') => void;
  onComment: (postId: string, content: string, parentCommentId?: string) => void;
  onEditComment: (postId: string, commentId: string, content: string) => void;
  onDeleteComment: (postId: string, commentId: string) => void;
  onCommentVote?: (postId: string, commentId: string, direction: 'up' | 'down') => void;
  onDeletePost: (postId: string) => void;

  onToggleBookmark: (id: string) => void;
  onSeedPost?: (post: Post) => void;

  loaderRef: React.RefObject<HTMLDivElement>;
  isLoadingMore: boolean;
  onToggleMute?: (pubkey: string) => void;
  isMuted?: (pubkey: string) => boolean;
  isInitialLoading?: boolean;
  onRetryPost?: (postId: string) => void;
}) {
  // Get data from Zustand stores instead of props
  const viewMode = useViewMode();
  const searchQuery = useSearchQuery();
  const sortMode = useSortMode();
  const activeBoard = useActiveBoard();
  const feedFilter = useFeedFilter();
  const hasMorePosts = useHasMorePosts();
  const setSortModeStore = useUIStore((state) => state.setSortMode);
  const setViewMode = useUIStore((state) => state.setViewMode);

  // Navigation handlers from Zustand-based hook
  const { handleViewBit, handleViewProfile, handleEditPost, handleTagClick } =
    useAppNavigationHandlers();

  const {
    sortedPosts,
    getBoardName,
    knownUsers,
    loaderRef,
    isLoadingMore,
    isInitialLoading = false,
    onVote,
    onComment,
    onEditComment,
    onDeleteComment,
    onCommentVote,
    onDeletePost,
    onToggleBookmark,
    onSeedPost,
    onToggleMute,
    isMuted,
    onRetryPost,
  } = props;

  const canPaginateBoard = activeBoard?.source !== 'nostr-community';
  const showHasMorePosts = hasMorePosts && canPaginateBoard;

  const handleSetSortMode = useCallback(
    (m: SortMode) => {
      setSortModeStore(m);
    },
    [setSortModeStore],
  );

  const [showShareModal, setShowShareModal] = useState(false);
  const [showJumpToTop, setShowJumpToTop] = useState(false);
  const [activeTimeChunk, setActiveTimeChunk] = useState<TimeChunk | null>(null);
  // Check if this is an encrypted board that we can share (we have the key)
  const canShareBoard =
    activeBoard?.isEncrypted && encryptedBoardService.hasBoardKey(activeBoard.id);

  // Track scroll position for "Jump to top" button (throttled)
  useEffect(() => {
    let lastExecTime = 0;
    let timeoutId: NodeJS.Timeout | null = null;
    const throttleDelay = 100; // Throttle to 100ms

    const handleScroll = () => {
      const scrollY = window.scrollY;
      setShowJumpToTop(scrollY > 800);

      // Determine which time chunk is currently in view (throttled DOM queries)
      const timeHeaders = document.querySelectorAll('[data-time-chunk]');
      let lastVisibleChunk: TimeChunk | null = null;
      timeHeaders.forEach((header) => {
        const rect = header.getBoundingClientRect();
        if (rect.top < 200) {
          lastVisibleChunk = header.getAttribute('data-time-chunk') as TimeChunk;
        }
      });
      setActiveTimeChunk(lastVisibleChunk);
    };

    // Throttled scroll handler
    const throttledHandleScroll = () => {
      const currentTime = Date.now();

      if (currentTime - lastExecTime > throttleDelay) {
        handleScroll();
        lastExecTime = currentTime;
      } else {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(
          () => {
            handleScroll();
            lastExecTime = Date.now();
          },
          throttleDelay - (currentTime - lastExecTime),
        );
      }
    };

    window.addEventListener('scroll', throttledHandleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', throttledHandleScroll);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const handleJumpToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleJumpToChunk = useCallback((chunk: TimeChunk) => {
    const header = document.querySelector(`[data-time-chunk="${chunk}"]`);
    if (header) {
      header.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Group posts by time chunks for navigation
  const postsByTimeChunk = useMemo(() => {
    const chunks: Record<TimeChunk, { posts: Post[]; firstIndex: number }> = {
      today: { posts: [], firstIndex: -1 },
      yesterday: { posts: [], firstIndex: -1 },
      this_week: { posts: [], firstIndex: -1 },
      this_month: { posts: [], firstIndex: -1 },
      earlier: { posts: [], firstIndex: -1 },
    };

    sortedPosts.forEach((post, index) => {
      const chunk = getTimeChunk(post.timestamp);
      if (chunks[chunk].firstIndex === -1) {
        chunks[chunk].firstIndex = index;
      }
      chunks[chunk].posts.push(post);
    });

    return chunks;
  }, [sortedPosts]);

  // Available time chunks (non-empty ones)
  const availableChunks = useMemo(() => {
    return (Object.keys(postsByTimeChunk) as TimeChunk[]).filter(
      (chunk) => postsByTimeChunk[chunk].posts.length > 0,
    );
  }, [postsByTimeChunk]);

  // Check if we should show a time header before this post
  const shouldShowTimeHeader = useCallback(
    (post: Post, index: number): TimeChunk | null => {
      const chunk = getTimeChunk(post.timestamp);
      if (postsByTimeChunk[chunk].firstIndex === index) {
        return chunk;
      }
      return null;
    },
    [postsByTimeChunk],
  );

  const shouldVirtualizeFeed =
    viewMode === ViewMode.FEED && sortedPosts.length > FEED_VIRTUALIZE_THRESHOLD;

  const feedVirtualizer = useWindowVirtualizer({
    count: shouldVirtualizeFeed ? sortedPosts.length + 1 : 0,
    estimateSize: () => 520,
    overscan: 6,
  });

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
      onEditComment(postId, commentId, content);
    },
    [onEditComment],
  );

  const handleDeleteComment = useCallback(
    (postId: string, commentId: string) => {
      onDeleteComment(postId, commentId);
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
      onDeletePost(postId);
    },
    [onDeletePost],
  );

  const handleToggleBookmark = useCallback(
    (id: string) => {
      onToggleBookmark(id);
    },
    [onToggleBookmark],
  );

  const handleToggleMute = useCallback(
    (pubkey: string) => {
      onToggleMute?.(pubkey);
    },
    [onToggleMute],
  );

  const handleRetryPost = useCallback(
    (postId: string) => {
      onRetryPost?.(postId);
    },
    [onRetryPost],
  );

  const emptyState = useMemo(() => {
    if (activeBoard?.source === 'nostr-community') {
      return (
        <div className="border border-terminal-dim p-12 text-center text-terminal-dim flex flex-col items-center gap-4">
          <Radio size={48} className="opacity-20" />
          <div>
            <p className="font-bold">&gt; NO APPROVED POSTS FOUND</p>
            <p className="text-xs mt-2">
              This external community does not have any approved notes on your current relays yet.
            </p>
          </div>
          <button
            onClick={() => setViewMode(ViewMode.DISCOVER_NOSTR)}
            className="ui-button-secondary mt-4 px-4 py-2 text-sm"
          >
            Discover Nostr
          </button>
        </div>
      );
    }

    // Location-specific empty state
    if (feedFilter === 'location') {
      return (
        <div className="border border-terminal-dim p-12 text-center text-terminal-dim flex flex-col items-center gap-4">
          <MapPin size={48} className="opacity-20" />
          <div>
            <p className="font-bold">&gt; NO LOCATION CHANNELS FOUND</p>
            <p className="text-xs mt-2">Enable location access to discover nearby channels.</p>
          </div>
          <button
            onClick={() => setViewMode(ViewMode.LOCATION)}
            className="ui-button-secondary mt-4 px-4 py-2 text-sm"
          >
            Scan Nearby
          </button>
        </div>
      );
    }

    // Topic-specific empty state
    if (feedFilter === 'topic') {
      return (
        <div className="border border-terminal-dim p-12 text-center text-terminal-dim flex flex-col items-center gap-4">
          <div className="text-4xl opacity-20">¯\\_(ツ)_/¯</div>
          <div>
            <p className="font-bold">&gt; NO TOPIC BOARDS FOUND</p>
            <p className="text-xs mt-2">Browse available boards or create your own.</p>
          </div>
          <button
            onClick={() => setViewMode(ViewMode.BROWSE_BOARDS)}
            className="ui-button-secondary mt-4 px-4 py-2 text-sm"
          >
            Browse Boards
          </button>
        </div>
      );
    }

    // Default empty state
    return (
      <div className="border border-terminal-dim p-12 text-center text-terminal-dim flex flex-col items-center gap-4">
        <div className="text-4xl opacity-20">¯\\_(ツ)_/¯</div>
        <div>
          <p className="font-bold">&gt; NO DATA PACKETS FOUND</p>
          <p className="text-xs mt-2">Be the first to transmit on this frequency.</p>
        </div>
        <button
          onClick={() => setViewMode(ViewMode.CREATE)}
          className="ui-button-secondary mt-4 px-4 py-2 text-sm"
        >
          Init Bit
        </button>
      </div>
    );
  }, [activeBoard?.source, feedFilter, setViewMode]);

  return (
    <div className="min-w-0 space-y-2">
      <div className="mb-4 border-b border-terminal-dim/30 pb-3">
        <div className="flex flex-col gap-3">
          <div className="border border-terminal-dim/25 bg-terminal-bg/40 p-4 md:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-terminal uppercase tracking-widest text-terminal-text flex items-center gap-2">
                    {activeBoard?.type === BoardType.GEOHASH && <MapPin size={20} />}
                    {activeBoard?.isEncrypted && <Lock size={18} className="text-terminal-text" />}
                    {searchQuery
                      ? `SEARCH: "${searchQuery}"`
                      : activeBoard
                        ? activeBoard.type === BoardType.GEOHASH
                          ? `#${activeBoard.geohash}`
                          : `// ${activeBoard.name}`
                        : feedFilter === 'location'
                          ? 'GEO_CHANNELS'
                          : feedFilter === 'topic'
                            ? 'TOPIC_BOARDS'
                            : '// GLOBAL_FEED'}
                  </h2>
                  <span className="text-sm text-terminal-dim">{sortedPosts.length} signals</span>
                  {canShareBoard && (
                    <button
                      onClick={() => setShowShareModal(true)}
                      className="flex items-center gap-1 border border-terminal-dim px-2 py-1 text-xs uppercase text-terminal-dim transition-colors hover:border-terminal-text hover:text-terminal-text"
                      title="Share this encrypted board"
                    >
                      <Share2 size={12} />
                      SHARE
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs uppercase tracking-wide text-terminal-dim">
                  {searchQuery
                    ? `${sortedPosts.length} results found`
                    : activeBoard
                      ? activeBoard.description
                      : feedFilter === 'location'
                        ? 'Location-based channels near you'
                        : feedFilter === 'topic'
                          ? 'Topic-based discussion boards'
                          : 'aggregating top signals from public sectors'}
                </p>
              </div>

              <SortSelector currentSort={sortMode} onSortChange={handleSetSortMode} />
            </div>
          </div>

          {/* Time Chunk Navigation */}
          {sortedPosts.length > 10 && availableChunks.length > 1 && (
            <div className="flex items-center gap-1 overflow-x-auto">
              <Calendar size={12} className="text-terminal-dim flex-shrink-0" />
              {availableChunks.map((chunk) => (
                <button
                  key={chunk}
                  onClick={() => handleJumpToChunk(chunk)}
                  className={`text-xs px-2 py-1 border transition-colors whitespace-nowrap flex-shrink-0 ${
                    activeTimeChunk === chunk
                      ? 'border-terminal-text text-terminal-text bg-terminal-text/10'
                      : 'border-terminal-dim/50 text-terminal-dim hover:border-terminal-text hover:text-terminal-text'
                  }`}
                >
                  {TIME_CHUNK_LABELS[chunk]} ({postsByTimeChunk[chunk].posts.length})
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Initial loading state with phase indicator */}
      {isInitialLoading && sortedPosts.length === 0 && (
        <div className="space-y-4">
          <LoadingPhaseIndicator currentPhase="posts" />
          <PostSkeleton count={3} />
        </div>
      )}

      {/* Empty state (only show if not loading) */}
      {!isInitialLoading && sortedPosts.length === 0 && emptyState}

      {!shouldVirtualizeFeed && !isInitialLoading && (
        <>
          {sortedPosts.map((post, index) => {
            const timeHeader = shouldShowTimeHeader(post, index);
            return (
              <React.Fragment key={post.id}>
                {/* Time chunk header */}
                {timeHeader && (
                  <TimeChunkHeader
                    chunk={timeHeader}
                    postCount={postsByTimeChunk[timeHeader].posts.length}
                  />
                )}
                <FeedPostCard
                  post={post}
                  getBoardName={getBoardName}
                  knownUsers={knownUsers}
                  onVote={handleVote}
                  onComment={handleComment}
                  onEditComment={handleEditComment}
                  onDeleteComment={handleDeleteComment}
                  onCommentVote={handleCommentVote}
                  onViewBit={handleViewBit}
                  onViewProfile={handleViewProfile}
                  onEditPost={handleEditPost}
                  onDeletePost={handleDeletePost}
                  onTagClick={handleTagClick}
                  onToggleBookmark={handleToggleBookmark}
                  onSeedPost={onSeedPost}
                  onToggleMute={handleToggleMute}
                  isMuted={isMuted}
                  onRetryPost={handleRetryPost}
                />
              </React.Fragment>
            );
          })}

          <FeedLoaderRow
            loaderRef={loaderRef}
            isLoadingMore={isLoadingMore}
            hasMorePosts={showHasMorePosts}
            postCount={sortedPosts.length}
          />
        </>
      )}

      {shouldVirtualizeFeed && (
        <div style={{ height: feedVirtualizer.getTotalSize(), position: 'relative' }}>
          {feedVirtualizer.getVirtualItems().map((virtualRow) => {
            const isLoaderRow = virtualRow.index === sortedPosts.length;

            if (isLoaderRow) {
              return (
                <FeedLoaderRow
                  key="feed-loader-row"
                  loaderRef={loaderRef}
                  isLoadingMore={isLoadingMore}
                  hasMorePosts={showHasMorePosts}
                  postCount={sortedPosts.length}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                />
              );
            }

            const post = sortedPosts[virtualRow.index];
            const timeHeader = shouldShowTimeHeader(post, virtualRow.index);

            return (
              <div
                key={post.id}
                ref={feedVirtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {timeHeader && (
                  <TimeChunkHeader
                    chunk={timeHeader}
                    postCount={postsByTimeChunk[timeHeader].posts.length}
                  />
                )}
                <FeedPostCard
                  post={post}
                  getBoardName={getBoardName}
                  knownUsers={knownUsers}
                  onVote={handleVote}
                  onComment={handleComment}
                  onEditComment={handleEditComment}
                  onDeleteComment={handleDeleteComment}
                  onCommentVote={handleCommentVote}
                  onViewBit={handleViewBit}
                  onViewProfile={handleViewProfile}
                  onEditPost={handleEditPost}
                  onDeletePost={handleDeletePost}
                  onTagClick={handleTagClick}
                  onToggleBookmark={handleToggleBookmark}
                  onSeedPost={onSeedPost}
                  onToggleMute={handleToggleMute}
                  isMuted={isMuted}
                  onRetryPost={handleRetryPost}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Share encrypted board modal */}
      {showShareModal && activeBoard && (
        <ShareBoardLink board={activeBoard} onClose={() => setShowShareModal(false)} />
      )}

      {/* New Bit FAB — persistent (feed only); mirrors jump-to-top on the right */}
      <button
        type="button"
        onClick={() => setViewMode(ViewMode.CREATE)}
        className="fixed bottom-24 md:bottom-8 left-4 md:left-8 z-30 w-12 h-12 bg-terminal-text text-black rounded-sm shadow-hard flex items-center justify-center hover:brightness-110 hover:scale-110 transition-all"
        aria-label="New bit"
        title="New bit"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      {/* Jump to top FAB */}
      {showJumpToTop && (
        <button
          type="button"
          onClick={handleJumpToTop}
          className="fixed bottom-24 md:bottom-8 right-4 md:right-8 z-30 w-12 h-12 bg-terminal-text text-black rounded-sm shadow-hard flex items-center justify-center hover:brightness-110 hover:scale-110 transition-all"
          aria-label="Jump to top"
          title="Jump to top"
        >
          <ChevronUp size={24} />
        </button>
      )}
    </div>
  );
}

// Memoize FeedView to prevent unnecessary re-renders
// Only re-render when essential props change (sortedPosts, loading states)
export const MemoizedFeedView = React.memo(FeedView, (prevProps, nextProps) => {
  // Compare sortedPosts array reference (should be stable with Zustand)
  if (prevProps.sortedPosts !== nextProps.sortedPosts) return false;

  // Compare loading states
  if (prevProps.isLoadingMore !== nextProps.isLoadingMore) return false;
  if (prevProps.isInitialLoading !== nextProps.isInitialLoading) return false;

  // Compare sets (knownUsers)
  if (prevProps.knownUsers !== nextProps.knownUsers) return false;

  // Ignore handler props - they should be stable callbacks
  // feedFilter, hasMorePosts, viewMode, searchQuery, sortMode, activeBoard - now from stores

  return true; // Props are equal, skip re-render
});
