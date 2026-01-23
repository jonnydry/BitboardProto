/**
 * Backward compatibility layer for Context hooks
 * Provides same API as Context hooks but uses Zustand stores internally
 * Allows gradual migration without breaking existing code
 */

import {
  usePostStore,
  usePost,
  useSelectedPostId,
  useSelectedPost,
} from '../stores/postStore';
import {
  useViewMode,
  useTheme,
  useSearchQuery,
  useSortMode,
  useProfileUser,
  useEditingPostId,
  useUIStore,
} from '../stores/uiStore';
import {
  useUserState,
  useIdentity,
  useIsMuted,
  useUserStore,
} from '../stores/userStore';
import {
  useBoards as useBoardsFromStore,
  useLocationBoards,
  useActiveBoardId,
  useBoardsById,
  useTopicBoards,
  useGeohashBoards,
  useActiveBoard,
  useBoardById,
  useBoardStore,
} from '../stores/boardStore';
import type { Post } from '../types';

// Posts Context compatibility
export const usePosts = () => {
  const posts = usePostStore((state) => state.posts);
  const selectedPostId = useSelectedPostId();
  const markPostAccessed = usePostStore((state) => state.markPostAccessed);
  const setPosts = usePostStore((state) => state.setPosts);
  const setSelectedPostId = usePostStore((state) => state.setSelectedPostId);
  const postsById = usePostStore((state) => {
    const map = new Map<string, Post>();
    state.posts.forEach((p) => map.set(p.id, p));
    return map;
  });

  return {
    posts,
    postsById,
    setPosts,
    markPostAccessed,
    selectedPostId,
    setSelectedPostId,
  };
};

// UI Context compatibility
export const useUI = () => {
  const viewMode = useViewMode();
  const theme = useTheme();
  const searchQuery = useSearchQuery();
  const sortMode = useSortMode();
  const profileUser = useProfileUser();
  const editingPostId = useEditingPostId();
  const setViewMode = useUIStore((state) => state.setViewMode);
  const setTheme = useUIStore((state) => state.setTheme);
  const setSearchQuery = useUIStore((state) => state.setSearchQuery);
  const setSortMode = useUIStore((state) => state.setSortMode);
  const setProfileUser = useUIStore((state) => state.setProfileUser);
  const setEditingPostId = useUIStore((state) => state.setEditingPostId);

  return {
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
};

// User Context compatibility
export const useUser = () => {
  const userState = useUserState();
  const isMuted = useUserStore((state) => state.isMuted);
  const setUserState = useUserStore((state) => state.setUserState);
  const toggleMute = useUserStore((state) => state.toggleMute);
  const handleIdentityChange = useUserStore((state) => state.handleIdentityChange);

  return {
    userState,
    isMuted,
    setUserState,
    toggleMute,
    handleIdentityChange,
  };
};

// Boards Context compatibility
export const useBoards = () => {
  const boards = useBoardsFromStore();
  const locationBoards = useLocationBoards();
  const activeBoardId = useActiveBoardId();
  const boardsById = useBoardsById();
  const topicBoards = useTopicBoards();
  const geohashBoards = useGeohashBoards();
  const activeBoard = useActiveBoard();
  const setBoards = useBoardStore((state) => state.setBoards);
  const setLocationBoards = useBoardStore((state) => state.setLocationBoards);
  const setActiveBoardId = useBoardStore((state) => state.setActiveBoardId);

  return {
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
};

// Re-export store hooks for direct access (preferred for new code)
export {
  usePost,
  useSelectedPost,
  useViewMode,
  useTheme,
  useSearchQuery,
  useSortMode,
  useProfileUser,
  useEditingPostId,
  useUserState,
  useIdentity,
  useIsMuted,
  useActiveBoard,
  useBoardById,
};
