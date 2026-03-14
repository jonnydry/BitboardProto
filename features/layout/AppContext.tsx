import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import {
  Post,
  UserState,
  ViewMode,
  Board,
  ThemeId,
  NostrIdentity,
  SortMode,
  BoardType,
} from '../../types';
import { nostrService } from '../../services/nostrService';
import { identityService } from '../../services/identityService';
import { bookmarkService } from '../../services/bookmarkService';
import { listService } from '../../services/listService';
import { reportService } from '../../services/reportService';
import { logger } from '../../services/loggingService';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { FeatureFlags } from '../../config';
import { useTheme } from '../../hooks/useTheme';
import { useUrlPostRouting } from '../../hooks/useUrlPostRouting';
import { useNostrFeed } from '../../hooks/useNostrFeed';
import { useCommentsLoader } from '../../hooks/useCommentsLoader';
import { useVoting } from '../../hooks/useVoting';
import { useCommentVoting } from '../../hooks/useCommentVoting';
import { useAppDerivedData } from './useAppDerivedData';
import { useAppEventHandlers } from './useAppEventHandlers';
import { useAppLifecycle } from './useAppLifecycle';
import { usePostDecryption } from '../../hooks/usePostDecryption';
import { usePhaseTwoServices } from './usePhaseTwoServices';
import { followServiceV2 } from '../../services/followServiceV2';

import { usePostStore } from '../../stores/postStore';
import { useBoardStore } from '../../stores/boardStore';
import { useUIStore } from '../../stores/uiStore';
import { useUserStoreEffects, useUserStore } from '../../stores/userStore';

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
  feedFilter: 'all' | 'topic' | 'location' | 'following';
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
  decryptionFailedBoardIds: Set<string>;

  // Encryption actions
  removeFailedDecryptionKey: (boardId: string) => void;

  // Actions
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  setBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  setViewMode: (mode: ViewMode) => void;
  setSelectedBitId: (id: string | null) => void;
  setActiveBoardId: (id: string | null) => void;
  setTheme: (theme: ThemeId) => void;
  setLocationBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  setFeedFilter: (filter: 'all' | 'topic' | 'location' | 'following') => void;
  setSearchQuery: (query: string) => void;
  setSortMode: (mode: SortMode) => void;
  setProfileUser: (user: { username: string; pubkey?: string } | null) => void;
  setEditingPostId: (id: string | null) => void;
  setUserState: React.Dispatch<React.SetStateAction<UserState>>;
  setHasMorePosts: (hasMore: boolean) => void;
  setOldestTimestamp: (timestamp: number | null) => void;

  // Event handlers
  handleCreatePost: (
    newPostData: Omit<
      Post,
      | 'id'
      | 'timestamp'
      | 'score'
      | 'commentCount'
      | 'comments'
      | 'nostrEventId'
      | 'upvotes'
      | 'downvotes'
    >,
  ) => Promise<void>;
  handleCreateBoard: (
    newBoardData: Omit<Board, 'id' | 'memberCount' | 'nostrEventId'>,
  ) => Promise<void>;
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

// AppProvider now uses Zustand stores directly (no Context providers needed)
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize user store effects (replaces useEffect from UserProvider)
  useUserStoreEffects();

  return <AppProviderInternal>{children}</AppProviderInternal>;
};

// Internal provider that aggregates from focused contexts
const AppProviderInternal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State for things not handled by focused contexts
  const [selectedBitId, setSelectedBitId] = useState<string | null>(null);
  const [feedFilter, setFeedFilter] = useState<'all' | 'topic' | 'location' | 'following'>('all');
  const [followingPubkeys, setFollowingPubkeys] = useState<string[]>(() =>
    followServiceV2.getFollowingPubkeys(),
  );
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() =>
    bookmarkService.getBookmarkedIds(),
  );
  const [reportedPostIds, setReportedPostIds] = useState<string[]>(() =>
    reportService.getReportsByType('post').map((r) => r.targetId),
  );
  const [isNostrConnected, setIsNostrConnected] = useState(false);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [oldestTimestamp, setOldestTimestamp] = useState<number | null>(null);

  const posts = usePostStore((state) => state.posts);
  const setPosts = usePostStore((state) => state.setPosts);
  const markPostAccessed = usePostStore((state) => state.markPostAccessed);
  const setSelectedPostId = usePostStore((state) => state.setSelectedPostId);

  const boards = useBoardStore((state) => state.boards);
  const locationBoards = useBoardStore((state) => state.locationBoards);
  const activeBoardId = useBoardStore((state) => state.activeBoardId);
  const setBoards = useBoardStore((state) => state.setBoards);
  const setLocationBoards = useBoardStore((state) => state.setLocationBoards);
  const setActiveBoardId = useBoardStore((state) => state.setActiveBoardId);

  const viewMode = useUIStore((state) => state.viewMode);
  const theme = useUIStore((state) => state.theme);
  const searchQuery = useUIStore((state) => state.searchQuery);
  const sortMode = useUIStore((state) => state.sortMode);
  const profileUser = useUIStore((state) => state.profileUser);
  const editingPostId = useUIStore((state) => state.editingPostId);
  const setViewMode = useUIStore((state) => state.setViewMode);
  const setTheme = useUIStore((state) => state.setTheme);
  const setSearchQuery = useUIStore((state) => state.setSearchQuery);
  const setSortMode = useUIStore((state) => state.setSortMode);
  const setProfileUser = useUIStore((state) => state.setProfileUser);
  const setEditingPostId = useUIStore((state) => state.setEditingPostId);

  const userState = useUserStore((state) => state.userState);
  const setUserState = useUserStore((state) => state.setUserState);
  const toggleMute = useUserStore((state) => state.toggleMute);
  const isMuted = useUserStore((state) => state.isMuted);
  const handleIdentityChange = useUserStore((state) => state.handleIdentityChange);

  const postsById = useMemo(() => {
    const map = new Map<string, Post>();
    posts.forEach((post) => map.set(post.id, post));
    return map;
  }, [posts]);

  const boardsById = useMemo(() => {
    const map = new Map<string, Board>();
    boards.forEach((board) => map.set(board.id, board));
    locationBoards.forEach((board) => map.set(board.id, board));
    return map;
  }, [boards, locationBoards]);

  const activeBoard = useMemo(() => {
    if (!activeBoardId) return null;
    return boardsById.get(activeBoardId) || null;
  }, [activeBoardId, boardsById]);

  const topicBoards = useMemo(() => {
    return boards.filter((board) => board.type === BoardType.TOPIC);
  }, [boards]);

  const geohashBoards = useMemo(() => {
    const geohashMap = new Map<string, Board>();
    boards
      .filter((board) => board.type === BoardType.GEOHASH)
      .forEach((board) => geohashMap.set(board.id, board));
    locationBoards.forEach((board) => geohashMap.set(board.id, board));
    return Array.from(geohashMap.values());
  }, [boards, locationBoards]);

  const postsCtx = {
    posts,
    postsById,
    setPosts,
    markPostAccessed,
    setSelectedPostId,
  };

  const boardsCtx = {
    boards,
    locationBoards,
    activeBoardId,
    boardsById,
    topicBoards,
    geohashBoards,
    activeBoard,
    setBoards,
    setLocationBoards,
    setActiveBoardId,
  };

  const uiCtx = {
    viewMode,
    theme,
    searchQuery,
    sortMode,
    profileUser,
    editingPostId,
    setViewMode,
    setTheme,
    setSearchQuery,
    setSortMode,
    setProfileUser,
    setEditingPostId,
  };

  const userCtx = {
    userState,
    setUserState,
    toggleMute,
    isMuted,
    handleIdentityChange,
  };

  // Get relay hint helper
  const getRelayHint = useCallback(() => {
    const connected = nostrService.getConnectedCount();
    const total = nostrService.getRelays().length;
    const state = connected > 0 ? 'Some relays are reachable.' : 'No relays appear reachable.';
    return `${state} Relays: ${connected}/${total}. Open RELAYS to adjust/retry.`;
  }, []);

  const mutedPubkeys = useMemo(
    () => userCtx.userState.mutedPubkeys || [],
    [userCtx.userState.mutedPubkeys],
  );
  const {
    filteredPosts,
    sortedPosts: derivedSortedPosts,
    knownUsers,
    selectedPost,
    bookmarkedIdSet,
    reportedPostIdSet,
  } = useAppDerivedData({
    posts: postsCtx.posts,
    postsById: postsCtx.postsById,
    boardsById: boardsCtx.boardsById,
    activeBoardId: boardsCtx.activeBoardId,
    feedFilter,
    followingPubkeys,
    mutedPubkeys,
    searchQuery: uiCtx.searchQuery,
    sortMode: uiCtx.sortMode,
    selectedBitId,
    bookmarkedIds,
    reportedPostIds,
    markPostAccessed: postsCtx.markPostAccessed,
    setSelectedPostId: postsCtx.setSelectedPostId,
  });

  // Decrypt encrypted posts/comments if we have the keys
  const {
    posts: decryptedPosts,
    failedBoardIds: decryptionFailedBoardIds,
    removeFailedKey,
  } = usePostDecryption(filteredPosts, boardsCtx.boardsById);

  const sortedPosts = useMemo(() => {
    if (decryptedPosts === filteredPosts) {
      return derivedSortedPosts;
    }

    const sorted = [...decryptedPosts];

    switch (uiCtx.sortMode) {
      case SortMode.NEWEST:
        return sorted.sort((a, b) => b.timestamp - a.timestamp);
      case SortMode.OLDEST:
        return sorted.sort((a, b) => a.timestamp - b.timestamp);
      case SortMode.TRENDING: {
        const now = Date.now();
        const hour = 1000 * 60 * 60;
        return sorted.sort((a, b) => {
          const ageA = (now - a.timestamp) / hour;
          const ageB = (now - b.timestamp) / hour;
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
  }, [decryptedPosts, derivedSortedPosts, filteredPosts, uiCtx.sortMode]);

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
    setSelectedBitId,
  });

  // Nostr feed hook with focused context setters
  useNostrFeed({
    setPosts: postsCtx.setPosts,
    setBoards: boardsCtx.setBoards,
    setIsNostrConnected,
    setOldestTimestamp,
    setHasMorePosts,
  });

  useCommentsLoader({
    selectedBitId,
    postsById: postsCtx.postsById,
    setPosts: postsCtx.setPosts,
  });

  const { handleVote } = useVoting({
    postsById: postsCtx.postsById,
  });

  const { handleCommentVote } = useCommentVoting({
    postsById: postsCtx.postsById,
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
    setOldestTimestamp,
    setHasMorePosts,
    locationBoards: boardsCtx.locationBoards,
  });

  // Infinite scroll hook
  const { loaderRef, isLoading: isLoadingMore } = useInfiniteScroll(
    eventHandlers.loadMorePosts,
    hasMorePosts && uiCtx.viewMode === ViewMode.FEED,
    { threshold: 300 },
  );

  // Effects
  usePhaseTwoServices({ pubkey: userCtx.userState.identity?.pubkey });
  useAppLifecycle({
    boards: boardsCtx.boards,
    posts: postsCtx.posts,
    setBookmarkedIds,
    setReportedPostIds,
    setFollowingPubkeys,
    setUserState: userCtx.setUserState,
    setActiveBoardId: boardsCtx.setActiveBoardId,
    setViewMode: uiCtx.setViewMode,
  });

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
    decryptionFailedBoardIds,
    removeFailedDecryptionKey: removeFailedKey,

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
    handleToggleBookmark: async (postId: string) => {
      // 1. Update locally
      bookmarkService.toggleBookmark(postId);

      // 2. Persist to Nostr (NIP-51) if identity is available
      if (userCtx.userState.identity && FeatureFlags.ENABLE_LISTS) {
        try {
          const currentBookmarked = bookmarkService.getBookmarkedIds();
          const unsigned = listService.buildBookmarksList({
            eventIds: currentBookmarked,
            pubkey: userCtx.userState.identity.pubkey,
          });
          const signed = await identityService.signEvent(unsigned);
          nostrService.publishSignedEvent(signed).catch((err) => {
            logger.warn('AppContext', 'Failed to publish bookmarks to Nostr', err);
          });
        } catch (err) {
          logger.warn('AppContext', 'Failed to sign bookmarks event', err);
        }
      }
    },
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

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
