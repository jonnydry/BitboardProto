import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Post, UserState, ViewMode, Board, ThemeId, BoardType, NostrIdentity, SortMode } from '../../types';
import { nostrService } from '../../services/nostrService';
import { identityService } from '../../services/identityService';
import { bookmarkService } from '../../services/bookmarkService';
import { reportService } from '../../services/reportService';
import { toastService } from '../../services/toastService';
import { encryptedBoardService } from '../../services/encryptedBoardService';
import { searchService } from '../../services/searchService';
import { logger } from '../../services/loggingService';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { FeatureFlags, StorageKeys, UIConfig } from '../../config';
import { useTheme } from '../../hooks/useTheme';
import { useUrlPostRouting } from '../../hooks/useUrlPostRouting';
import { useNostrFeed } from '../../hooks/useNostrFeed';
import { useCommentsLoader } from '../../hooks/useCommentsLoader';
import { useVoting } from '../../hooks/useVoting';
import { useCommentVoting } from '../../hooks/useCommentVoting';
import { useAppEventHandlers } from './useAppEventHandlers';
import { votingService } from '../../services/votingService';
import { rateLimiter } from '../../services/rateLimiter';
import { nostrEventDeduplicator, voteDeduplicator } from '../../services/messageDeduplicator';

// Import new focused contexts
import { PostsProvider, usePosts } from './contexts/PostsContext';
import { BoardsProvider, useBoards } from './contexts/BoardsContext';
import { UserProvider, useUser } from './contexts/UserContext';
import { UIProvider, useUI } from './contexts/UIContext';

const MAX_CACHED_POSTS = 200;

interface AppContextType {
  // State
  posts: Post[];
  boards: Board[];
  viewMode: ViewMode;
  selectedBitId: string | null;
  activeBoardId: string | null;
  theme: ThemeId;
  isNostrConnected: boolean;
  locationBoards: Board[];
  feedFilter: 'all' | 'topic' | 'location';
  searchQuery: string;
  sortMode: SortMode;
  profileUser: { username: string; pubkey?: string } | null;
  editingPostId: string | null;
  bookmarkedIds: string[];
  reportedPostIds: string[];
  userState: UserState;
  hasMorePosts: boolean;
  oldestTimestamp: number | null;

  // Computed values
  boardsById: Map<string, Board>;
  postsById: Map<string, Post>;
  filteredPosts: Post[];
  sortedPosts: Post[];
  knownUsers: Set<string>;
  selectedPost: Post | null;
  activeBoard: Board | null;
  topicBoards: Board[];
  geohashBoards: Board[];
  bookmarkedIdSet: Set<string>;
  reportedPostIdSet: Set<string>;

  // Actions
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  setBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  setViewMode: (mode: ViewMode) => void;
  setSelectedBitId: (id: string | null) => void;
  setActiveBoardId: (id: string | null) => void;
  setTheme: (theme: ThemeId) => void;
  setLocationBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  setFeedFilter: (filter: 'all' | 'topic' | 'location') => void;
  setSearchQuery: (query: string) => void;
  setSortMode: (mode: SortMode) => void;
  setProfileUser: (user: { username: string; pubkey?: string } | null) => void;
  setEditingPostId: (id: string | null) => void;
  setUserState: React.Dispatch<React.SetStateAction<UserState>>;
  setHasMorePosts: (hasMore: boolean) => void;
  setOldestTimestamp: (timestamp: number | null) => void;

  // Event handlers
  handleCreatePost: (newPostData: Omit<Post, 'id' | 'timestamp' | 'score' | 'commentCount' | 'comments' | 'nostrEventId' | 'upvotes' | 'downvotes'>) => Promise<void>;
  handleCreateBoard: (newBoardData: Omit<Board, 'id' | 'memberCount' | 'nostrEventId'>) => Promise<void>;
  handleComment: (postId: string, content: string, parentCommentId?: string) => Promise<void>;
  handleEditComment: (postId: string, commentId: string, nextContent: string) => Promise<void>;
  handleDeleteComment: (postId: string, commentId: string) => Promise<void>;
  handleViewBit: (postId: string) => void;
  navigateToBoard: (boardId: string | null) => void;
  returnToFeed: () => void;
  handleIdentityChange: (identity: NostrIdentity | null) => void;
  handleLocationBoardSelect: (board: Board) => void;
  handleViewProfile: (username: string, pubkey?: string) => void;
  handleEditPost: (postId: string) => void;
  handleSavePost: (postId: string, updates: Partial<Post>) => void;
  handleDeletePost: (postId: string) => Promise<void>;
  handleTagClick: (tag: string) => void;
  handleVote: (postId: string, direction: 'up' | 'down') => void;
  handleCommentVote: (postId: string, commentId: string, direction: 'up' | 'down') => void;
  handleToggleBookmark: (postId: string) => void;
  handleSearch: (query: string) => void;
  loadMorePosts: () => Promise<void>;
  getThemeColor: (id: ThemeId) => string;
  getBoardName: (postId: string) => string | undefined;
  refreshProfileMetadata: (pubkeys: string[]) => Promise<void>;
  handleRetryPost: (postId: string) => Promise<void>;
  toggleMute: (pubkey: string) => void;
  isMuted: (pubkey: string) => boolean;

  // Hooks
  loaderRef: React.RefObject<HTMLDivElement>;
  isLoadingMore: boolean;
}

const AppContext = createContext<AppContextType | null>(null);

// AppProvider now wraps focused contexts for backward compatibility
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <UIProvider>
      <UserProvider>
        <BoardsProvider>
          <PostsProvider>
            <AppProviderInternal>
              {children}
            </AppProviderInternal>
          </PostsProvider>
        </BoardsProvider>
      </UserProvider>
    </UIProvider>
  );
};

// Internal provider that aggregates from focused contexts
const AppProviderInternal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State for things not handled by focused contexts
  const [selectedBitId, setSelectedBitId] = useState<string | null>(null);
  const [feedFilter, setFeedFilter] = useState<'all' | 'topic' | 'location'>('all');
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => bookmarkService.getBookmarkedIds());
  const [reportedPostIds, setReportedPostIds] = useState<string[]>(() =>
    reportService.getReportsByType('post').map(r => r.targetId)
  );
  const [isNostrConnected, setIsNostrConnected] = useState(false);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [oldestTimestamp, setOldestTimestamp] = useState<number | null>(null);

  // Access focused contexts
  const postsCtx = usePosts();
  const boardsCtx = useBoards();
  const userCtx = useUser();
  const uiCtx = useUI();

  // Get relay hint helper
  const getRelayHint = useCallback(() => {
    const connected = nostrService.getConnectedCount();
    const total = nostrService.getRelays().length;
    const state = connected > 0 ? 'Some relays are reachable.' : 'No relays appear reachable.';
    return `${state} Relays: ${connected}/${total}. Open RELAYS to adjust/retry.`;
  }, []);

  // Track search worker results
  const [workerSearchIds, setWorkerSearchIds] = useState<Set<string> | null>(null);
  const lastSearchQuery = useRef<string>('');

  // Update search worker index when posts change
  useEffect(() => {
    searchService.updateIndex(postsCtx.posts);
  }, [postsCtx.posts]);

  // Perform search using worker (async, non-blocking)
  useEffect(() => {
    const query = uiCtx.searchQuery.trim();
    
    // Skip if query hasn't changed
    if (query === lastSearchQuery.current) return;
    lastSearchQuery.current = query;

    if (!query) {
      // Clear worker results when no query
      setWorkerSearchIds(null);
      return;
    }

    // Use worker for search (non-blocking)
    if (searchService.isWorkerReady()) {
      searchService.search(query).then(ids => {
        // Only update if this is still the current query
        if (lastSearchQuery.current === query) {
          setWorkerSearchIds(new Set(ids));
        }
      }).catch((error) => {
        // Fallback to null (will use main thread)
        logger.warn('AppContext', 'Search worker failed, falling back to main thread', error);
        setWorkerSearchIds(null);
      });
    }
  }, [uiCtx.searchQuery]);

  // Computed values (aggregated from focused contexts)
  const filteredPosts = useMemo(() => {
    let result = postsCtx.posts;

    // Filter by board
    if (boardsCtx.activeBoardId) {
      result = result.filter(p => p.boardId === boardsCtx.activeBoardId);
    } else {
      result = result.filter(p => {
        const board = boardsCtx.boardsById.get(p.boardId);
        if (!board?.isPublic) return false;

        if (feedFilter === 'topic') return board.type === BoardType.TOPIC;
        if (feedFilter === 'location') return board.type === BoardType.GEOHASH;
        return true;
      });
    }

    // Filter muted users
    if (userCtx.userState.mutedPubkeys && userCtx.userState.mutedPubkeys.length > 0) {
      const mutedSet = new Set(userCtx.userState.mutedPubkeys);
      result = result.filter(p => !p.authorPubkey || !mutedSet.has(p.authorPubkey));
    }

    // Apply search filter
    if (uiCtx.searchQuery.trim()) {
      // Use worker results if available, otherwise fallback to main thread
      if (workerSearchIds) {
        result = result.filter(p => workerSearchIds.has(p.id));
      } else {
        // Fallback: main thread search (only if worker not ready)
        const query = uiCtx.searchQuery.toLowerCase().trim();
        result = result.filter((p) => {
          const board = boardsCtx.boardsById.get(p.boardId);
          const boardName = board?.name?.toLowerCase() ?? '';

          const inPost =
            p.title.toLowerCase().includes(query) ||
            p.content.toLowerCase().includes(query) ||
            p.author.toLowerCase().includes(query) ||
            boardName.includes(query) ||
            p.tags.some((tag) => tag.toLowerCase().includes(query));

          if (inPost) return true;

          // Also search comments (author + content)
          return p.comments.some(
            (c) =>
              c.author.toLowerCase().includes(query) ||
              c.content.toLowerCase().includes(query)
          );
        });
      }
    }

    return result;
  }, [postsCtx.posts, boardsCtx.activeBoardId, boardsCtx.boardsById, feedFilter, uiCtx.searchQuery, userCtx.userState.mutedPubkeys, workerSearchIds]);

  const sortedPosts = useMemo(() => {
    const sorted = [...filteredPosts];

    switch (uiCtx.sortMode) {
      case SortMode.NEWEST:
        return sorted.sort((a, b) => b.timestamp - a.timestamp);
      case SortMode.OLDEST:
        return sorted.sort((a, b) => a.timestamp - b.timestamp);
      case SortMode.TRENDING: {
        // Trending = recent posts with high engagement (score + comments weighted by recency)
        const now = Date.now();
        const HOUR = 1000 * 60 * 60;
        return sorted.sort((a, b) => {
          const ageA = (now - a.timestamp) / HOUR;
          const ageB = (now - b.timestamp) / HOUR;
          const trendA = (a.score + a.commentCount * 2) / Math.pow(ageA + 2, 1.5);
          const trendB = (b.score + b.commentCount * 2) / Math.pow(ageB + 2, 1.5);
          return trendB - trendA;
        });
      }
      case SortMode.COMMENTS:
        return sorted.sort((a, b) => b.commentCount - a.commentCount);
      case SortMode.TOP:
      default:
        return sorted.sort((a, b) => b.score - a.score);
    }
  }, [filteredPosts, uiCtx.sortMode]);

  const knownUsers = useMemo(() => {
    const users = new Set<string>();
    postsCtx.posts.forEach(post => {
      users.add(post.author);
      post.comments.forEach(comment => {
        users.add(comment.author);
      });
    });
    return users;
  }, [postsCtx.posts]);

  const selectedPost = useMemo(() => {
    const post = selectedBitId ? postsCtx.postsById.get(selectedBitId) || null : null;
    
    // Mark post as accessed for LRU cache
    if (post && selectedBitId) {
      postsCtx.markPostAccessed(selectedBitId);
      postsCtx.setSelectedPostId(selectedBitId);
    }
    
    return post;
  }, [selectedBitId, postsCtx]);

  const bookmarkedIdSet = useMemo(() => new Set(bookmarkedIds), [bookmarkedIds]);
  const reportedPostIdSet = useMemo(() => new Set(reportedPostIds), [reportedPostIds]);

  // Theme colors map
  const themeColors = useMemo(() => {
    return new Map<ThemeId, string>([
      [ThemeId.AMBER, '#ffb000'],
      [ThemeId.PHOSPHOR, '#00ff41'],
      [ThemeId.PLASMA, '#00f0ff'],
      [ThemeId.VERMILION, '#ff4646'],
      [ThemeId.SLATE, '#c8c8c8'],
      [ThemeId.PATRIOT, '#ffffff'],
      [ThemeId.SAKURA, '#ffb4dc'],
      [ThemeId.BITBORING, '#ffffff'],
    ]);
  }, []);

  // Hooks
  useTheme(uiCtx.theme);
  useUrlPostRouting({
    viewMode: uiCtx.viewMode,
    selectedBitId,
    setViewMode: uiCtx.setViewMode,
    setSelectedBitId
  });

  // Nostr feed hook with focused context setters
  useNostrFeed({
    setPosts: postsCtx.setPosts,
    setBoards: boardsCtx.setBoards,
    setIsNostrConnected,
    setOldestTimestamp,
    setHasMorePosts
  });

  useCommentsLoader({
    selectedBitId,
    postsById: postsCtx.postsById,
    setPosts: postsCtx.setPosts
  });

  const { handleVote } = useVoting({
    postsById: postsCtx.postsById,
    userState: userCtx.userState,
    setUserState: userCtx.setUserState,
    setPosts: postsCtx.setPosts
  });

  const { handleCommentVote } = useCommentVoting({
    postsById: postsCtx.postsById,
    userState: userCtx.userState,
    setUserState: userCtx.setUserState,
    setPosts: postsCtx.setPosts
  });

  // Event handlers (imported from separate file with updated context access)
  const eventHandlers = useAppEventHandlers({
    posts: postsCtx.posts,
    setPosts: postsCtx.setPosts,
    boards: boardsCtx.boards,
    setBoards: boardsCtx.setBoards,
    boardsById: boardsCtx.boardsById,
    postsById: postsCtx.postsById,
    userState: userCtx.userState,
    setUserState: userCtx.setUserState,
    setViewMode: uiCtx.setViewMode,
    setSelectedBitId,
    setActiveBoardId: boardsCtx.setActiveBoardId,
    setLocationBoards: boardsCtx.setLocationBoards,
    setProfileUser: uiCtx.setProfileUser,
    setEditingPostId: uiCtx.setEditingPostId,
    getRelayHint,
    setSearchQuery: uiCtx.setSearchQuery,
    oldestTimestamp,
    hasMorePosts,
    locationBoards: boardsCtx.locationBoards,
  });

  // Infinite scroll hook
  const { loaderRef, isLoading: isLoadingMore } = useInfiniteScroll(
    eventHandlers.loadMorePosts,
    hasMorePosts && uiCtx.viewMode === ViewMode.FEED,
    { threshold: 300 }
  );

  // Effects
  useEffect(() => {
    // Subscribe to bookmark changes
    const unsubscribe = bookmarkService.subscribe(() => {
      setBookmarkedIds(bookmarkService.getBookmarkedIds());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    // Subscribe to report changes
    const unsubscribe = reportService.subscribe(() => {
      setReportedPostIds(reportService.getReportsByType('post').map(r => r.targetId));
    });
    return unsubscribe;
  }, []);

  // Ensure identity is loaded
  useEffect(() => {
    let cancelled = false;

    identityService
      .getIdentityAsync()
      .then((identity) => {
        if (cancelled) return;
        if (!identity) return;

        userCtx.setUserState((prev) => {
          // If user already has an identity in state, don't override it.
          if (prev.hasIdentity || prev.identity) return prev;

          const isGuestHandle = prev.username.startsWith('u/guest_');
          return {
            ...prev,
            identity,
            hasIdentity: true,
            username: identity.displayName && isGuestHandle ? identity.displayName : prev.username,
          };
        });
      })
      .catch((err) => {
        // Non-fatal: app can run in guest mode
        logger.warn('App', 'Failed to load identity', err);
        toastService.push({
          type: 'error',
          message: 'Failed to load identity (guest mode)',
          detail: err instanceof Error ? err.message : String(err),
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: 'identity-load-failed',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [userCtx]);

  // Handle encrypted board share links (URL fragment contains key)
  useEffect(() => {
    const shareData = encryptedBoardService.handleShareLink();
    if (shareData) {
      logger.info('App', `Received encrypted board share link: ${shareData.boardId}`);

      // Navigate to the board
      boardsCtx.setActiveBoardId(shareData.boardId);
      uiCtx.setViewMode(ViewMode.FEED);

      // Show success toast
      toastService.push({
        type: 'success',
        message: 'Encrypted board access granted',
        detail: `You now have access to board ${shareData.boardId}`,
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'encrypted-board-access',
      });
    }
  }, [boardsCtx, uiCtx]);

  // Cleanup on unmount and beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      nostrService.cleanup();
      votingService.cleanup();
      rateLimiter.stopCleanup();
      nostrEventDeduplicator.stopCleanup();
      voteDeduplicator.stopCleanup();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      nostrService.cleanup();
      votingService.cleanup();
      rateLimiter.stopCleanup();
      nostrEventDeduplicator.stopCleanup();
      voteDeduplicator.stopCleanup();
    };
  }, []);

  // Offline persistence
  useEffect(() => {
    if (!FeatureFlags.ENABLE_OFFLINE_MODE) return;
    if (typeof localStorage === 'undefined') return;

    const id = window.setTimeout(() => {
      try {
        const postsToStore = postsCtx.posts.slice(0, MAX_CACHED_POSTS);
        localStorage.setItem(
          StorageKeys.POSTS_CACHE,
          JSON.stringify({ savedAt: Date.now(), posts: postsToStore })
        );
        localStorage.setItem(
          StorageKeys.BOARDS_CACHE,
          JSON.stringify({ savedAt: Date.now(), boards: boardsCtx.boards })
        );
      } catch {
        // Ignore quota / serialization errors
      }
    }, 500);

    return () => window.clearTimeout(id);
  }, [boardsCtx.boards, postsCtx.posts]);

  // Create aggregated context value from focused contexts
  const contextValue: AppContextType = {
    // State (aggregated from focused contexts)
    posts: postsCtx.posts,
    boards: boardsCtx.boards,
    viewMode: uiCtx.viewMode,
    selectedBitId,
    activeBoardId: boardsCtx.activeBoardId,
    theme: uiCtx.theme,
    isNostrConnected,
    locationBoards: boardsCtx.locationBoards,
    feedFilter,
    searchQuery: uiCtx.searchQuery,
    sortMode: uiCtx.sortMode,
    profileUser: uiCtx.profileUser,
    editingPostId: uiCtx.editingPostId,
    bookmarkedIds,
    reportedPostIds,
    userState: userCtx.userState,
    hasMorePosts,
    oldestTimestamp,

    // Computed values (aggregated from focused contexts)
    boardsById: boardsCtx.boardsById,
    postsById: postsCtx.postsById,
    filteredPosts,
    sortedPosts,
    knownUsers,
    selectedPost,
    activeBoard: boardsCtx.activeBoard,
    topicBoards: boardsCtx.topicBoards,
    geohashBoards: boardsCtx.geohashBoards,
    bookmarkedIdSet,
    reportedPostIdSet,

    // Actions (delegated to focused contexts)
    setPosts: postsCtx.setPosts,
    setBoards: boardsCtx.setBoards,
    setViewMode: uiCtx.setViewMode,
    setSelectedBitId,
    setActiveBoardId: boardsCtx.setActiveBoardId,
    setTheme: uiCtx.setTheme,
    setLocationBoards: boardsCtx.setLocationBoards,
    setFeedFilter,
    setSearchQuery: uiCtx.setSearchQuery,
    setSortMode: uiCtx.setSortMode,
    setProfileUser: uiCtx.setProfileUser,
    setEditingPostId: uiCtx.setEditingPostId,
    setUserState: userCtx.setUserState,
    setHasMorePosts,
    setOldestTimestamp,

    // Event handlers
    handleCreatePost: eventHandlers.handleCreatePost,
    handleCreateBoard: eventHandlers.handleCreateBoard,
    handleComment: eventHandlers.handleComment,
    handleEditComment: eventHandlers.handleEditComment,
    handleDeleteComment: eventHandlers.handleDeleteComment,
    handleViewBit: eventHandlers.handleViewBit,
    navigateToBoard: eventHandlers.navigateToBoard,
    returnToFeed: eventHandlers.returnToFeed,
    handleIdentityChange: userCtx.handleIdentityChange,
    handleLocationBoardSelect: eventHandlers.handleLocationBoardSelect,
    handleViewProfile: eventHandlers.handleViewProfile,
    handleEditPost: eventHandlers.handleEditPost,
    handleSavePost: eventHandlers.handleSavePost,
    handleDeletePost: eventHandlers.handleDeletePost,
    handleTagClick: eventHandlers.handleTagClick,
    handleVote,
    handleCommentVote,
    handleToggleBookmark: (postId: string) => bookmarkService.toggleBookmark(postId),
    handleSearch: eventHandlers.handleSearch,
    loadMorePosts: eventHandlers.loadMorePosts,
    getThemeColor: (id: ThemeId) => themeColors.get(id) || '#fff',
    getBoardName: eventHandlers.getBoardName,
    refreshProfileMetadata: eventHandlers.refreshProfileMetadata,
    handleRetryPost: eventHandlers.handleRetryPost,
    toggleMute: userCtx.toggleMute,
    isMuted: userCtx.isMuted,

    // Hooks
    loaderRef,
    isLoadingMore,
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
