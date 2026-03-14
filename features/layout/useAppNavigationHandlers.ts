import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Board } from '../../types';
import { ViewMode } from '../../types';

interface UseAppNavigationHandlersArgs {
  setViewMode: (mode: ViewMode) => void;
  setSelectedBitId: (id: string | null) => void;
  setActiveBoardId: (id: string | null) => void;
  setLocationBoards: Dispatch<SetStateAction<Board[]>>;
  setProfileUser: (user: { username: string; pubkey?: string } | null) => void;
  setEditingPostId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
}

export function useAppNavigationHandlers({
  setViewMode,
  setSelectedBitId,
  setActiveBoardId,
  setLocationBoards,
  setProfileUser,
  setEditingPostId,
  setSearchQuery,
}: UseAppNavigationHandlersArgs) {
  const handleViewBit = useCallback(
    (postId: string) => {
      setSelectedBitId(postId);
      setViewMode(ViewMode.SINGLE_BIT);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setSelectedBitId, setViewMode],
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
      setLocationBoards((prev) => {
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
