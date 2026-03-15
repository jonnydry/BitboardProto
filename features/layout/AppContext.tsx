import React, { createContext, useContext, useCallback, useMemo, useEffect } from 'react';
import { Post, UserState, ViewMode, Board, NostrIdentity, SortMode, BoardType } from '../../types';
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
import { usePostStore } from '../../stores/postStore';
import { useBoardStore } from '../../stores/boardStore';
import { useUIStore } from '../../stores/uiStore';
import { trendingScore } from '../../services/nostr/shared';
import { useUserStoreEffects, useUserStore } from '../../stores/userStore';

interface AppContextType {
  // State
  posts: Post[];
  boards: Board[];
  viewMode: ViewMode;
  activeBoardId: string | null;
  locationBoards: Board[];
  profileUser: { username: string; pubkey?: string } | null;
  editingPostId: string | null;
  userState: UserState;

  // Computed values
  postsById: Map<string, Post>;
  sortedPosts: Post[];
  knownUsers: Set<string>;
  selectedPost: Post | null;
  activeBoard: Board | null;
  topicBoards: Board[];
  decryptionFailedBoardIds: Set<string>;

  // Encryption actions
  removeFailedDecryptionKey: (boardId: string) => void;

  // Actions
  setViewMode: (mode: ViewMode) => void;
  setLocationBoards: React.Dispatch<React.SetStateAction<Board[]>>;

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
  navigateToBoard: (boardId: string | null) => void;
  returnToFeed: () => void;
  handleIdentityChange: (identity: NostrIdentity | null) => void;
  handleViewProfile: (username: string, pubkey?: string) => void;
  handleEditPost: (postId: string) => void;
  handleSavePost: (postId: string, updates: Partial<Post>) => void;
  handleDeletePost: (postId: string) => Promise<void>;
  handleTagClick: (tag: string) => void;
  handleVote: (postId: string, direction: 'up' | 'down') => void;
  handleCommentVote: (postId: string, commentId: string, direction: 'up' | 'down') => void;
  handleToggleBookmark: (postId: string) => void;
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
  // selectedBitId now lives in postStore as the single source of truth
  const selectedBitId = usePostStore((state) => state.selectedPostId);
  const setSelectedBitId = usePostStore((state) => state.setSelectedPostId);

  const posts = usePostStore((state) => state.posts);
  const setPosts = usePostStore((state) => state.setPosts);
  const markPostAccessed = usePostStore((state) => state.markPostAccessed);

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
  const setEditingPostId = useUIStore((state) => state.setEditingPostId);
  const feedFilter = useUIStore((state) => state.feedFilter);
  const setIsNostrConnected = useUIStore((state) => state.setIsNostrConnected);
  const hasMorePosts = useUIStore((state) => state.hasMorePosts);
  const setHasMorePosts = useUIStore((state) => state.setHasMorePosts);
  const oldestTimestamp = useUIStore((state) => state.oldestTimestamp);
  const setOldestTimestamp = useUIStore((state) => state.setOldestTimestamp);
  const bookmarkedIds = useUIStore((state) => state.bookmarkedIds);
  const setBookmarkedIds = useUIStore((state) => state.setBookmarkedIds);
  const reportedPostIds = useUIStore((state) => state.reportedPostIds);
  const setReportedPostIds = useUIStore((state) => state.setReportedPostIds);

  const userState = useUserStore((state) => state.userState);
  const setUserState = useUserStore((state) => state.setUserState);
  const toggleMute = useUserStore((state) => state.toggleMute);
  const isMuted = useUserStore((state) => state.isMuted);
  const handleIdentityChange = useUserStore((state) => state.handleIdentityChange);
  const followingPubkeys = useUserStore((state) => state.followingPubkeys);
  const setFollowingPubkeys = useUserStore((state) => state.setFollowingPubkeys);

  // Initialize bookmarkedIds and reportedPostIds from services on mount
  useEffect(() => {
    setBookmarkedIds(bookmarkService.getBookmarkedIds());
    setReportedPostIds(reportService.getReportsByType('post').map((r) => r.targetId));
  }, [setBookmarkedIds, setReportedPostIds]);

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

  const postsCtx = {
    posts,
    postsById,
    setPosts,
    markPostAccessed,
  };

  const boardsCtx = {
    boards,
    locationBoards,
    activeBoardId,
    boardsById,
    topicBoards,
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
        return sorted.sort(
          (a, b) =>
            trendingScore(b.score, b.commentCount, b.timestamp, now) -
            trendingScore(a.score, a.commentCount, a.timestamp, now),
        );
      }
      case SortMode.COMMENTS:
        return sorted.sort((a, b) => b.commentCount - a.commentCount);
      case SortMode.TOP:
      default:
        return sorted.sort((a, b) => b.score - a.score);
    }
  }, [decryptedPosts, derivedSortedPosts, filteredPosts, uiCtx.sortMode]);

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
    setPosts: postsCtx.setPosts,
    boards: boardsCtx.boards,
    setBoards: boardsCtx.setBoards,
    boardsById: boardsCtx.boardsById,
    postsById: postsCtx.postsById,
    userState: userCtx.userState,
    setUserState: userCtx.setUserState,
    setViewMode: uiCtx.setViewMode,
    setActiveBoardId: boardsCtx.setActiveBoardId,
    setEditingPostId: uiCtx.setEditingPostId,
    getRelayHint,
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
    activeBoardId: boardsCtx.activeBoardId,
    locationBoards: boardsCtx.locationBoards,
    profileUser: uiCtx.profileUser,
    editingPostId: uiCtx.editingPostId,
    userState: userCtx.userState,

    // Computed values (aggregated from focused contexts)
    postsById: postsCtx.postsById,
    sortedPosts,
    knownUsers,
    selectedPost,
    activeBoard: boardsCtx.activeBoard,
    topicBoards: boardsCtx.topicBoards,
    decryptionFailedBoardIds,
    removeFailedDecryptionKey: removeFailedKey,

    // Actions (delegated to focused contexts)
    setViewMode: uiCtx.setViewMode,
    setLocationBoards: boardsCtx.setLocationBoards,

    // Event handlers
    handleCreatePost: eventHandlers.handleCreatePost,
    handleCreateBoard: eventHandlers.handleCreateBoard,
    handleComment: eventHandlers.handleComment,
    handleEditComment: eventHandlers.handleEditComment,
    handleDeleteComment: eventHandlers.handleDeleteComment,
    navigateToBoard: eventHandlers.navigateToBoard,
    returnToFeed: eventHandlers.returnToFeed,
    handleIdentityChange: userCtx.handleIdentityChange,
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
