import { useCallback } from 'react';
import type { Board } from '../../types';
import { ViewMode } from '../../types';
import { useUIStore } from '../../stores/uiStore';
import { usePostStore } from '../../stores/postStore';
import { useBoardStore } from '../../stores/boardStore';

/**
 * Navigation handlers that read directly from Zustand stores.
 * Can be used from any component — no need to go through AppContext.
 */
export function useAppNavigationHandlers() {
  const setViewMode = useUIStore((s) => s.setViewMode);
  const setSearchQuery = useUIStore((s) => s.setSearchQuery);
  const setProfileUser = useUIStore((s) => s.setProfileUser);
  const setEditingPostId = useUIStore((s) => s.setEditingPostId);
  const openDesktopThreadModal = useUIStore((s) => s.openDesktopThreadModal);
  const setSelectedBitId = usePostStore((s) => s.setSelectedPostId);
  const setActiveBoardId = useBoardStore((s) => s.setActiveBoardId);
  const setLocationBoards = useBoardStore((s) => s.setLocationBoards);

  const handleViewBit = useCallback(
    (postId: string) => {
      setSelectedBitId(postId);
      if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
        openDesktopThreadModal(postId);
      } else {
        setViewMode(ViewMode.SINGLE_BIT);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [openDesktopThreadModal, setSelectedBitId, setViewMode],
  );

  const navigateToBoard = useCallback(
    (boardId: string | null) => {
      setActiveBoardId(boardId);
      setSelectedBitId(null);
      setViewMode(ViewMode.FEED);
    },
    [setActiveBoardId, setSelectedBitId, setViewMode],
  );

  const returnToFeed = useCallback(() => {
    setSelectedBitId(null);
    setViewMode(ViewMode.FEED);
  }, [setSelectedBitId, setViewMode]);

  const handleLocationBoardSelect = useCallback(
    (board: Board) => {
      setLocationBoards((prev: Board[]) => {
        if (prev.some((candidate) => candidate.id === board.id)) return prev;
        return [...prev, board];
      });
      setActiveBoardId(board.id);
      setViewMode(ViewMode.FEED);
    },
    [setLocationBoards, setActiveBoardId, setViewMode],
  );

  const handleViewProfile = useCallback(
    (username: string, pubkey?: string) => {
      setProfileUser({ username, pubkey });
      setViewMode(ViewMode.USER_PROFILE);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setProfileUser, setViewMode],
  );

  const handleEditPost = useCallback(
    (postId: string) => {
      setEditingPostId(postId);
      setViewMode(ViewMode.EDIT_POST);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setEditingPostId, setViewMode],
  );

  const handleTagClick = useCallback(
    (tag: string) => {
      setSearchQuery(tag);
      setActiveBoardId(null);
      setViewMode(ViewMode.FEED);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setSearchQuery, setActiveBoardId, setViewMode],
  );

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
    },
    [setSearchQuery],
  );

  return {
    handleViewBit,
    navigateToBoard,
    returnToFeed,
    handleLocationBoardSelect,
    handleViewProfile,
    handleEditPost,
    handleTagClick,
    handleSearch,
  };
}
