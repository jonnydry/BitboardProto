import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { MapPin, Share2, Lock, ChevronUp, Calendar } from 'lucide-react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Board, Post, SortMode } from '../../types';
import { BoardType, ViewMode } from '../../types';
import { SearchBar } from '../../components/SearchBar';
import { SortSelector } from '../../components/SortSelector';
import { PostItem } from '../../components/PostItem';
import { PostSkeleton, InlineLoadingSkeleton } from '../../components/PostSkeleton';
import { LoadingPhaseIndicator, type LoadingPhase } from '../../components/LoadingSkeletons';
import { ShareBoardLink } from '../../components/ShareBoardLink';
import { encryptedBoardService } from '../../services/encryptedBoardService';
// Import Zustand store selectors
import { usePostStore } from '../../stores/postStore';
import { useUIStore, useViewMode, useSearchQuery, useSortMode } from '../../stores/uiStore';
import { useUserState } from '../../stores/userStore';
import { useActiveBoard, useBoardsById } from '../../stores/boardStore';

const FEED_VIRTUALIZE_THRESHOLD = 25;

// Time chunk definitions
type TimeChunk = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'earlier';

const TIME_CHUNK_LABELS: Record<TimeChunk, string> = {
  today: 'TODAY',
  yesterday: 'YESTERDAY',
  this_week: 'THIS WEEK',
  this_month: 'THIS MONTH',
  earlier: 'EARLIER',
};

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
  feedFilter?: 'all' | 'topic' | 'location';

  getBoardName: (postId: string) => string | undefined;
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
  // Get data from Zustand stores instead of props
  const viewMode = useViewMode();
  const searchQuery = useSearchQuery();
  const sortMode = useSortMode();
  const activeBoard = useActiveBoard();
  const userState = useUserState();
  const boardsById = useBoardsById();
  const setSortModeStore = useUIStore((state) => state.setSortMode);
  const setSearchQueryStore = useUIStore((state) => state.setSearchQuery);
  
  const {
    sortedPosts,
    feedFilter,
    getBoardName,
    knownUsers,
    bookmarkedIdSet,
    reportedPostIdSet,
    isNostrConnected,
    loaderRef,
    isLoadingMore,
    hasMorePosts,
    isInitialLoading = false,
    onSetViewMode,
    onSearch,
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
    onToggleBookmark,
    onToggleMute,
    isMuted,
    onRetryPost,
  } = props;
  
  // Use store setters when available, fallback to props
  const handleSetSortMode = useCallback((m: SortMode) => {
    setSortModeStore(m);
    props.setSortMode(m);
  }, [setSortModeStore, props]);
  
  const handleSearch = useCallback((q: string) => {
    setSearchQueryStore(q);
    onSearch(q);
  }, [setSearchQueryStore, onSearch]);

  const [showShareModal, setShowShareModal] = useState(false);
  const [showJumpToTop, setShowJumpToTop] = useState(false);
  const [activeTimeChunk, setActiveTimeChunk] = useState<TimeChunk | null>(null);

  // Check if this is an encrypted board that we can share (we have the key)
  const canShareBoard = activeBoard?.isEncrypted && encryptedBoardService.hasBoardKey(activeBoard.id);

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
        timeoutId = setTimeout(() => {
          handleScroll();
          lastExecTime = Date.now();
        }, throttleDelay - (currentTime - lastExecTime));
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
      (chunk) => postsByTimeChunk[chunk].posts.length > 0
    );
  }, [postsByTimeChunk]);

  // Check if we should show a time header before this post
  const shouldShowTimeHeader = useCallback((post: Post, index: number): TimeChunk | null => {
    const chunk = getTimeChunk(post.timestamp);
    if (postsByTimeChunk[chunk].firstIndex === index) {
      return chunk;
    }
    return null;
  }, [postsByTimeChunk]);

  const shouldVirtualizeFeed = viewMode === ViewMode.FEED && sortedPosts.length > FEED_VIRTUALIZE_THRESHOLD;

  // Track measured post heights for dynamic sizing
  const postHeights = React.useRef<Map<number, number>>(new Map());
  const averageHeight = React.useRef<number>(520); // Fallback initial estimate

  const feedVirtualizer = useWindowVirtualizer({
    count: shouldVirtualizeFeed ? sortedPosts.length + 1 : 0,
    estimateSize: (index) => {
      // Use measured height if available
      const measured = postHeights.current.get(index);
      if (measured) {
        // Update running average for better future estimates
        const currentAvg = averageHeight.current;
        averageHeight.current = (currentAvg * 0.9) + (measured * 0.1); // Exponential moving average
        return measured;
      }
      
      // Use running average if we have measurements, otherwise fallback
      return averageHeight.current;
    },
    overscan: 6,
    measureElement: (element) => {
      if (!element) return;
      
      // Find the index of this element in the virtual items
      const virtualItems = feedVirtualizer.getVirtualItems();
      const item = virtualItems.find(item => item.element === element);
      
      if (item && item.index >= 0) {
        const height = element.getBoundingClientRect().height;
        postHeights.current.set(item.index, height);
        
        // Update running average
        const currentAvg = averageHeight.current;
        averageHeight.current = (currentAvg * 0.9) + (height * 0.1);
      }
    },
  });
  
  // Clear height cache when posts change significantly
  React.useEffect(() => {
    if (sortedPosts.length === 0) {
      postHeights.current.clear();
      averageHeight.current = 520; // Reset to default
    }
  }, [sortedPosts.length]);

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
        <SearchBar onSearch={handleSearch} placeholder="Search posts, users, tags..." />
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

        <SortSelector currentSort={sortMode} onSortChange={handleSetSortMode} />

        {/* Time Chunk Navigation */}
        {sortedPosts.length > 10 && availableChunks.length > 1 && (
          <div className="flex items-center gap-1 mt-3 overflow-x-auto pb-1">
            <Calendar size={12} className="text-terminal-dim flex-shrink-0" />
            {availableChunks.map((chunk) => (
              <button
                key={chunk}
                onClick={() => {
                  const header = document.querySelector(`[data-time-chunk="${chunk}"]`);
                  if (header) {
                    header.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }}
                className={`text-[10px] px-2 py-0.5 border transition-colors whitespace-nowrap flex-shrink-0 ${
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
                  <div
                    data-time-chunk={timeHeader}
                    className="flex items-center gap-2 py-2 mt-4 first:mt-0 border-b border-terminal-dim/30 mb-2"
                  >
                    <Calendar size={14} className="text-terminal-dim" />
                    <span className="text-xs text-terminal-dim uppercase tracking-wider font-bold">
                      {TIME_CHUNK_LABELS[timeHeader]}
                    </span>
                    <span className="text-[10px] text-terminal-dim/50">
                      ({postsByTimeChunk[timeHeader].posts.length} posts)
                    </span>
                  </div>
                )}
                <PostItem
                  post={post}
                  boardName={getBoardName(post.id)}
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
              </React.Fragment>
            );
          })}

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

      {/* Jump to top FAB */}
      {showJumpToTop && (
        <button
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
  if (prevProps.hasMorePosts !== nextProps.hasMorePosts) return false;
  if (prevProps.isInitialLoading !== nextProps.isInitialLoading) return false;
  
  // Compare sets (bookmarkedIdSet, reportedPostIdSet, knownUsers)
  if (prevProps.bookmarkedIdSet !== nextProps.bookmarkedIdSet) return false;
  if (prevProps.reportedPostIdSet !== nextProps.reportedPostIdSet) return false;
  if (prevProps.knownUsers !== nextProps.knownUsers) return false;
  
  // Compare other essential props
  if (prevProps.feedFilter !== nextProps.feedFilter) return false;
  if (prevProps.isNostrConnected !== nextProps.isNostrConnected) return false;
  
  // Ignore handler props - they should be stable callbacks
  // Ignore viewMode, searchQuery, sortMode, activeBoard, userState - now from stores
  
  return true; // Props are equal, skip re-render
});







