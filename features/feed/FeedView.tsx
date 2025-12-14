import React, { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Board, Post, SortMode, UserState } from '../../types';
import { BoardType, ViewMode } from '../../types';
import { SearchBar } from '../../components/SearchBar';
import { SortSelector } from '../../components/SortSelector';
import { PostItem } from '../../components/PostItem';

const FEED_VIRTUALIZE_THRESHOLD = 25;

export function FeedView(props: {
  sortedPosts: Post[];
  searchQuery: string;
  sortMode: SortMode;
  setSortMode: (m: SortMode) => void;
  activeBoard: Board | null;
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
  onViewBit: (postId: string) => void;
  onViewProfile: (username: string, pubkey?: string) => void;
  onEditPost: (postId: string) => void;
  onTagClick: (tag: string) => void;

  bookmarkedIdSet: Set<string>;
  reportedPostIdSet: Set<string>;
  onToggleBookmark: (id: string) => void;

  isNostrConnected: boolean;

  loaderRef: React.RefObject<HTMLDivElement>;
  isLoadingMore: boolean;
  hasMorePosts: boolean;
}) {
  const {
    sortedPosts,
    searchQuery,
    sortMode,
    setSortMode,
    activeBoard,
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
    onViewBit,
    onViewProfile,
    onEditPost,
    onTagClick,
    bookmarkedIdSet,
    reportedPostIdSet,
    onToggleBookmark,
    isNostrConnected,
    loaderRef,
    isLoadingMore,
    hasMorePosts,
  } = props;

  const shouldVirtualizeFeed = viewMode === ViewMode.FEED && sortedPosts.length > FEED_VIRTUALIZE_THRESHOLD;

  const feedVirtualizer = useWindowVirtualizer({
    count: shouldVirtualizeFeed ? sortedPosts.length + 1 : 0,
    estimateSize: () => 520,
    overscan: 6,
  });

  const emptyState = useMemo(() => {
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
  }, [onSetViewMode]);

  return (
    <div className="space-y-2">
      <div className="mb-4">
        <SearchBar onSearch={onSearch} placeholder="Search posts, users, tags..." />
      </div>

      <div className="flex flex-col gap-4 mb-6 pb-2 border-b border-terminal-dim/30">
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-2xl font-terminal uppercase tracking-widest text-terminal-text flex items-center gap-2">
              {activeBoard?.type === BoardType.GEOHASH && <MapPin size={20} />}
              {searchQuery
                ? `SEARCH: \"${searchQuery}\"`
                : activeBoard
                  ? activeBoard.type === BoardType.GEOHASH
                    ? `#${activeBoard.geohash}`
                    : `// ${activeBoard.name}`
                  : 'GLOBAL_FEED'}
            </h2>
            <p className="text-xs text-terminal-dim mt-1">
              {searchQuery
                ? `${sortedPosts.length} results found`
                : activeBoard
                  ? activeBoard.description
                  : 'AGGREGATING TOP SIGNALS FROM PUBLIC SECTORS'}
            </p>
          </div>
          <span className="text-xs border border-terminal-dim px-2 py-1">SIGNAL_COUNT: {sortedPosts.length}</span>
        </div>

        <SortSelector currentSort={sortMode} onSortChange={setSortMode} />
      </div>

      {sortedPosts.length === 0 && emptyState}

      {!shouldVirtualizeFeed && (
        <>
          {sortedPosts.map((post) => (
            <PostItem
              key={post.id}
              post={post}
              boardName={getBoardName(post.id)}
              userState={userState}
              knownUsers={knownUsers}
              onVote={onVote}
              onComment={onComment}
              onEditComment={onEditComment}
              onDeleteComment={onDeleteComment}
              onViewBit={onViewBit}
              onViewProfile={onViewProfile}
              onEditPost={onEditPost}
              onTagClick={onTagClick}
              isBookmarked={bookmarkedIdSet.has(post.id)}
              onToggleBookmark={onToggleBookmark}
              hasReported={reportedPostIdSet.has(post.id)}
              isNostrConnected={isNostrConnected}
            />
          ))}

          <div ref={loaderRef} className="py-8 text-center">
            {isLoadingMore && (
              <div className="flex items-center justify-center gap-3 text-terminal-dim">
                <div className="animate-pulse">▓▓▓</div>
                <span className="text-sm uppercase tracking-wider">Loading more signals...</span>
                <div className="animate-pulse">▓▓▓</div>
              </div>
            )}
            {!hasMorePosts && sortedPosts.length > 0 && (
              <div className="text-xs text-terminal-dim uppercase tracking-wider border border-terminal-dim/30 inline-block px-4 py-2">
                END_OF_FEED // All signals loaded
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
                  className="py-8 text-center"
                >
                  {isLoadingMore && (
                    <div className="flex items-center justify-center gap-3 text-terminal-dim">
                      <div className="animate-pulse">▓▓▓</div>
                      <span className="text-sm uppercase tracking-wider">Loading more signals...</span>
                      <div className="animate-pulse">▓▓▓</div>
                    </div>
                  )}
                  {!hasMorePosts && sortedPosts.length > 0 && (
                    <div className="text-xs text-terminal-dim uppercase tracking-wider border border-terminal-dim/30 inline-block px-4 py-2">
                      END_OF_FEED // All signals loaded
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
                  onVote={onVote}
                  onComment={onComment}
                  onEditComment={onEditComment}
                  onDeleteComment={onDeleteComment}
                  onViewBit={onViewBit}
                  onViewProfile={onViewProfile}
                  onEditPost={onEditPost}
                  onTagClick={onTagClick}
                  isBookmarked={bookmarkedIdSet.has(post.id)}
                  onToggleBookmark={onToggleBookmark}
                  hasReported={reportedPostIdSet.has(post.id)}
                  isNostrConnected={isNostrConnected}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

