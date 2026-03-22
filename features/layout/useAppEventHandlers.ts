import React, { useCallback } from 'react';
import type { Board, Post, UserState } from '../../types';
import { ViewMode } from '../../types';
import { nostrService } from '../../services/nostr/NostrService';
import { identityService } from '../../services/identityService';
import { toastService } from '../../services/toastService';
import { logger } from '../../services/loggingService';
import { UIConfig } from '../../config';
import { makeUniqueBoardId } from '../../services/boardIdService';
import { boardRateLimiter } from '../../services/boardRateLimiter';
import { useAppCommentHandlers } from './useAppCommentHandlers';
import { useAppFeedHandlers } from './useAppFeedHandlers';
import { useAppNavigationHandlers } from './useAppNavigationHandlers';
import { useAppPostMutationHandlers } from './useAppPostMutationHandlers';

interface UseAppEventHandlersProps {
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  boards: Board[];
  activeBoard: Board | null;
  setBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  boardsById: Map<string, Board>;
  postsById: Map<string, Post>;
  userState: UserState;
  setUserState: React.Dispatch<React.SetStateAction<UserState>>;
  setViewMode: (mode: ViewMode) => void;
  setActiveBoardId: (id: string | null) => void;
  setEditingPostId: (id: string | null) => void;
  getRelayHint: () => string;
  oldestTimestamp: number | null;
  hasMorePosts: boolean;
  setOldestTimestamp: (timestamp: number | null) => void;
  setHasMorePosts: (hasMore: boolean) => void;
  locationBoards: Board[];
}

export const useAppEventHandlers = ({
  setPosts,
  boards,
  activeBoard,
  setBoards,
  boardsById,
  postsById,
  userState,
  setUserState: _setUserState,
  setViewMode,
  setActiveBoardId,
  setEditingPostId,
  getRelayHint,
  oldestTimestamp,
  hasMorePosts,
  setOldestTimestamp,
  setHasMorePosts,
  locationBoards,
}: UseAppEventHandlersProps) => {
  // Navigation handlers now read directly from Zustand stores — no props needed
  const navigationHandlers = useAppNavigationHandlers();

  const feedHandlers = useAppFeedHandlers({
    activeBoard,
    oldestTimestamp,
    hasMorePosts,
    postsById,
    boardsById,
    setPosts,
    setOldestTimestamp,
    setHasMorePosts,
  });

  const commentHandlers = useAppCommentHandlers({
    postsById,
    boardsById,
    userState,
    setPosts,
    getRelayHint,
  });

  const postMutationHandlers = useAppPostMutationHandlers({
    boardsById,
    postsById,
    userState,
    setPosts,
    setViewMode,
    setEditingPostId,
    getRelayHint,
  });

  const handleCreateBoard = useCallback(
    async (newBoardData: Omit<Board, 'id' | 'memberCount' | 'nostrEventId'>) => {
      if (!userState.identity) {
        toastService.push({
          type: 'error',
          message: 'Identity required to create boards',
          detail: 'Please connect your Nostr identity first',
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: 'create-board-no-identity',
        });
        return;
      }

      const rateCheck = boardRateLimiter.canCreateBoard(userState.identity.pubkey);
      if (!rateCheck.allowed) {
        const resetIn = rateCheck.resetAt
          ? boardRateLimiter.formatResetTime(rateCheck.resetAt)
          : 'later';
        toastService.push({
          type: 'error',
          message: 'Board creation limit reached',
          detail: `You can create ${boardRateLimiter.getLimit()} boards per day. Try again in ${resetIn}.`,
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: 'create-board-rate-limit',
        });
        return;
      }

      const existingIds = new Set<string>([...boards, ...locationBoards].map((board) => board.id));
      const id = makeUniqueBoardId(newBoardData.name, existingIds);

      const newBoard: Board = {
        ...newBoardData,
        id,
        memberCount: 1,
        createdBy: userState.identity.pubkey,
      };

      try {
        const unsigned = nostrService.buildBoardEvent(newBoard, userState.identity.pubkey);
        const signed = await identityService.signEvent(unsigned);
        const event = await nostrService.publishSignedEvent(signed);
        newBoard.nostrEventId = event.id;
        boardRateLimiter.recordCreation(userState.identity.pubkey, newBoard.id);
      } catch (error) {
        logger.error('App', 'Failed to publish board to Nostr', error);
        const errMsg = error instanceof Error ? error.message : String(error);
        toastService.push({
          type: 'error',
          message: 'Failed to publish board to Nostr (saved locally)',
          detail: `${errMsg} — ${getRelayHint()}`,
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: 'publish-board-failed',
        });
      }

      setBoards((prev) => [...prev, newBoard]);
      setActiveBoardId(newBoard.id);
      setViewMode(ViewMode.FEED);
    },
    [
      boards,
      locationBoards,
      userState.identity,
      getRelayHint,
      setBoards,
      setActiveBoardId,
      setViewMode,
    ],
  );

  return {
    handleCreatePost: postMutationHandlers.handleCreatePost,
    handleCreateBoard,
    handleComment: commentHandlers.handleComment,
    handleEditComment: commentHandlers.handleEditComment,
    handleDeleteComment: commentHandlers.handleDeleteComment,
    handleViewBit: navigationHandlers.handleViewBit,
    navigateToBoard: navigationHandlers.navigateToBoard,
    returnToFeed: navigationHandlers.returnToFeed,
    handleLocationBoardSelect: navigationHandlers.handleLocationBoardSelect,
    handleViewProfile: navigationHandlers.handleViewProfile,
    handleEditPost: navigationHandlers.handleEditPost,
    handleSavePost: postMutationHandlers.handleSavePost,
    handleDeletePost: postMutationHandlers.handleDeletePost,
    handleTagClick: navigationHandlers.handleTagClick,
    handleSearch: navigationHandlers.handleSearch,
    handleSeedPost: postMutationHandlers.handleSeedPost,
    loadMorePosts: feedHandlers.loadMorePosts,
    getBoardName: feedHandlers.getBoardName,
    refreshProfileMetadata: feedHandlers.refreshProfileMetadata,
    handleRetryPost: postMutationHandlers.handleRetryPost,
  };
};
