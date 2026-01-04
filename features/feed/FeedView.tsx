import React, { useMemo, useCallback, useState } from 'react';
import { MapPin, Share2, Lock } from 'lucide-react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Board, Post, SortMode, UserState } from '../../types';
import { BoardType, ViewMode } from '../../types';
import { SearchBar } from '../../components/SearchBar';
import { SortSelector } from '../../components/SortSelector';
import { PostItem } from '../../components/PostItem';
import { PostSkeleton, InlineLoadingSkeleton } from '../../components/PostSkeleton';
import { ShareBoardLink } from '../../components/ShareBoardLink';
import { encryptedBoardService } from '../../services/encryptedBoardService';

const FEED_VIRTUALIZE_THRESHOLD = 25;

export function FeedView(props: {
  sortedPosts: Post[];
  searchQuery: string;
  sortMode: SortMode;
  setSortMode: (m: SortMode) => void;
  activeBoard: Board | null;
  feedFilter?: 'all' | 'topic' | 'location';
  viewMode: ViewMode;
  onSetViewMode: (m: ViewMode) => void;
  onSearch: (q: string) => void;

  getBoardName: (postId: string) => string | undefined;
  userState: UserState;
  knownUsers: Set<string>;

  onVote: (postId: string, direction: 'up' | 'down') => void;
  onComment: (postId: string, content: string, parentCommentId?: string) => void;
  onEditComment: (postId: string, commentId: string, content: string) => void;
  onDeleteComment: (postId: string, commentId: string) => void;
  onCommentVote?: (postId: string, commentId: string, direction: 'up' | 'down') => void;
  onViewBit: (postId: string) => void;
  onViewProfile: (username: string, pubkey?: string) => void;
  onEditPost: (postId: string) => void;
  onDeletePost: (postId: string) => void;
  onTagClick: (tag: string) => void;

  bookmarkedIdSet: Set<string>;
  reportedPostIdSet: Set<string>;
  onToggleBookmark: (id: string) => void;

  isNostrConnected: boolean;

  loaderRef: React.RefObject<HTMLDivElement>;
  isLoadingMore: boolean;
  hasMorePosts: boolean;
  onToggleMute?: (pubkey: string) => void;
  isMuted?: (pubkey: string) => boolean;
  isInitialLoading?: boolean;
  onRetryPost?: (postId: string) => void;
}) {
  const {
    sortedPosts,
    searchQuery,
    sortMode,
    setSortMode,
    activeBoard,
    feedFilter,
    viewMode,
    onSetViewMode,
    onSearch,
    getBoardName,
    userState,
    knownUsers,
    onVote,
    onComment,
    onEditComment,
    onDeleteComment,
    onCommentVote,
    onViewBit,
    onViewProfile,
    onEditPost,
    onDeletePost,
    onTagClick,
    bookmarkedIdSet,
    reportedPostIdSet,
    onToggleBookmark,
    isNostrConnected,
    loaderRef,
    isLoadingMore,
    hasMorePosts,
    onToggleMute,
    isMuted,
    isInitialLoading = false,
    onRetryPost,
  } = props;

  const [showShareModal, setShowShareModal] = useState(false);

  // Check if this is an encrypted board that we can share (we have the key)
  const canShareBoard = activeBoard?.isEncrypted && encryptedBoardService.hasBoardKey(activeBoard.id);

  const shouldVirtualizeFeed = viewMode === ViewMode.FEED && sortedPosts.length > FEED_VIRTUALIZE_THRESHOLD;

  const feedVirtualizer = useWindowVirtualizer({
    count: shouldVirtualizeFeed ? sortedPosts.length + 1 : 0,
    estimateSize: () => 520,
    overscan: 6,
  });

  // Stabilize callbacks to prevent PostItem re-renders
  const handleVote = useCallback((postId: string, direction: 'up' | 'down') => {
    onVote(postId, direction);
  }, [onVote]);

  const handleComment = useCallback((postId: string, content: string, parentCommentId?: string) => {
    onComment(postId, content, parentCommentId);
  }, [onComment]);

  const handleEditComment = useCallback((postId: string, commentId: string, content: string) => {
    onEditComment(postId, commentId, content);
  }, [onEditComment]);

  const handleDeleteComment = useCallback((postId: string, commentId: string) => {
    onDeleteComment(postId, commentId);
  }, [onDeleteComment]);

  const handleCommentVote = useCallback((postId: string, commentId: string, direction: 'up' | 'down') => {
    onCommentVote?.(postId, commentId, direction);
  }, [onCommentVote]);

  const handleViewBit = useCallback((postId: string) => {
    onViewBit(postId);
  }, [onViewBit]);

  const handleViewProfile = useCallback((username: string, pubkey?: string) => {
    onViewProfile(username, pubkey);
  }, [onViewProfile]);

  const handleEditPost = useCallback((postId: string) => {
    onEditPost(postId);
  }, [onEditPost]);

  const handleDeletePost = useCallback((postId: string) => {
    onDeletePost(postId);
  }, [onDeletePost]);

  const handleTagClick = useCallback((tag: string) => {
    onTagClick(tag);
  }, [onTagClick]);

  const handleToggleBookmark = useCallback((id: string) => {
    onToggleBookmark(id);
  }, [onToggleBookmark]);

  const handleToggleMute = useCallback((pubkey: string) => {
    onToggleMute?.(pubkey);
  }, [onToggleMute]);

  const handleRetryPost = useCallback((postId: string) => {
    onRetryPost?.(postId);
  }, [onRetryPost]);

  const emptyState = useMemo(() => {
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
            onClick={() => onSetViewMode(ViewMode.LOCATION)}
            className="mt-4 px-4 py-2 border border-terminal-dim hover:bg-terminal-dim hover:text-white transition-colors uppercase text-sm"
          >
            [ SCAN_NEARBY ]
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
            onClick={() => onSetViewMode(ViewMode.BROWSE_BOARDS)}
            className="mt-4 px-4 py-2 border border-terminal-dim hover:bg-terminal-dim hover:text-white transition-colors uppercase text-sm"
          >
            [ BROWSE_BOARDS ]
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
          onClick={() => onSetViewMode(ViewMode.CREATE)}
          className="mt-4 px-4 py-2 border border-terminal-dim hover:bg-terminal-dim hover:text-white transition-colors uppercase text-sm"
        >
          [ INIT_BIT ]
        </button>
      </div>
    );
  }, [feedFilter, onSetViewMode]);

  return (
    <div className="space-y-2">
      <div className="mb-4">
        <SearchBar onSearch={onSearch} placeholder="Search posts, users, tags..." />
      </div>

      <div className="flex flex-col gap-4 mb-6 pb-2 border-b border-terminal-dim/30">
        <div className="flex justify-between items-end">
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
                        : 'GLOBAL_FEED'}
              </h2>
              {canShareBoard && (
                <button
                  onClick={() => setShowShareModal(true)}
                  className="flex items-center gap-1 text-xs border border-terminal-dim px-2 py-1 text-terminal-dim hover:border-terminal-text hover:text-terminal-text transition-colors uppercase"
                  title="Share this encrypted board"
                >
                  <Share2 size={12} />
                  SHARE
                </button>
              )}
            </div>
            <p className="text-xs text-terminal-dim mt-1">
              {searchQuery
                ? `${sortedPosts.length} results found`
                : activeBoard
                  ? activeBoard.description
                  : feedFilter === 'location'
                    ? 'Location-based channels near you'
                    : feedFilter === 'topic'
                      ? 'Topic-based discussion boards'
                      : 'AGGREGATING TOP SIGNALS FROM PUBLIC SECTORS'}
            </p>
          </div>
          <span className="text-xs border border-terminal-dim px-2 py-1">SIGNAL_COUNT: {sortedPosts.length}</span>
        </div>

        <SortSelector currentSort={sortMode} onSortChange={setSortMode} />
      </div>

      {/* Initial loading state with skeleton */}
      {isInitialLoading && sortedPosts.length === 0 && (
        <PostSkeleton count={5} />
      )}

      {/* Empty state (only show if not loading) */}
      {!isInitialLoading && sortedPosts.length === 0 && emptyState}

      {!shouldVirtualizeFeed && !isInitialLoading && (
        <>
          {sortedPosts.map((post) => (
            <PostItem
              key={post.id}
              post={post}
              boardName={getBoardName(post.id)}
              userState={userState}
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
              isBookmarked={bookmarkedIdSet.has(post.id)}
              onToggleBookmark={handleToggleBookmark}
              hasReported={reportedPostIdSet.has(post.id)}
              isNostrConnected={isNostrConnected}
              onToggleMute={handleToggleMute}
              isMuted={isMuted}
              onRetryPost={handleRetryPost}
            />
          ))}

          <div ref={loaderRef} className="py-4">
            {isLoadingMore && <InlineLoadingSkeleton />}
            {!hasMorePosts && sortedPosts.length > 0 && (
              <div className="text-center py-4">
                <div className="text-xs text-terminal-dim uppercase tracking-wider border border-terminal-dim/30 inline-block px-4 py-2">
                  END_OF_FEED // All signals loaded
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {shouldVirtualizeFeed && (
        <div style={{ height: feedVirtualizer.getTotalSize(), position: 'relative' }}>
          {feedVirtualizer.getVirtualItems().map((virtualRow) => {
            const isLoaderRow = virtualRow.index === sortedPosts.length;

            if (isLoaderRow) {
              return (
                <div
                  key="feed-loader-row"
                  ref={loaderRef}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="py-4"
                >
                  {isLoadingMore && <InlineLoadingSkeleton />}
                  {!hasMorePosts && sortedPosts.length > 0 && (
                    <div className="text-center py-4">
                      <div className="text-xs text-terminal-dim uppercase tracking-wider border border-terminal-dim/30 inline-block px-4 py-2">
                        END_OF_FEED // All signals loaded
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            const post = sortedPosts[virtualRow.index];

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
                <PostItem
                  post={post}
                  boardName={getBoardName(post.id)}
                  userState={userState}
                  knownUsers={knownUsers}
                  onVote={handleVote}
                  onComment={handleComment}
                  onEditComment={handleEditComment}
                  onDeleteComment={handleDeleteComment}
                  onCommentVote={handleCommentVote}
                  onViewBit={handleViewBit}
                  onViewProfile={handleViewProfile}
                  onEditPost={handleEditPost}
                  onTagClick={handleTagClick}
                  isBookmarked={bookmarkedIdSet.has(post.id)}
                  onToggleBookmark={handleToggleBookmark}
                  hasReported={reportedPostIdSet.has(post.id)}
                  isNostrConnected={isNostrConnected}
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
        <ShareBoardLink
          board={activeBoard}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  );
}







