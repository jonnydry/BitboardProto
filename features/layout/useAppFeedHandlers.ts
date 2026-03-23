import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Board, Post } from '../../types';
import { BoardType } from '../../types';
import { nostrService } from '../../services/nostr/NostrService';
import { toastService } from '../../services/toastService';
import { logger } from '../../services/loggingService';
import { UIConfig } from '../../config';
import { buildFetchPostsArgs, resolveNostrFeedScope } from '../../services/nostr/nostrFeedScope';
import {
  appendUniqueNostrPosts,
  getOldestPostTimestamp,
  processFetchedPostEvents,
} from '../../services/nostr/nostrFeedPosts';
import { mergePostsWithIndexer } from '../../services/indexerFeedClient';

interface UseAppFeedHandlersArgs {
  activeBoard: Board | null;
  oldestTimestamp: number | null;
  hasMorePosts: boolean;
  postsById: Map<string, Post>;
  boardsById: Map<string, Board>;
  setPosts: Dispatch<SetStateAction<Post[]>>;
  setOldestTimestamp: (timestamp: number | null) => void;
  setHasMorePosts: (hasMore: boolean) => void;
}

export function useAppFeedHandlers({
  activeBoard,
  oldestTimestamp,
  hasMorePosts,
  postsById,
  boardsById,
  setPosts,
  setOldestTimestamp,
  setHasMorePosts,
}: UseAppFeedHandlersArgs) {
  const loadMorePosts = useCallback(async () => {
    if (!oldestTimestamp || !hasMorePosts) return;

    try {
      const loadMoreLimit = UIConfig.POSTS_LOAD_MORE_COUNT;
      const scope = resolveNostrFeedScope(activeBoard);
      if (scope.mode === 'community') {
        setHasMorePosts(false);
        return;
      }
      const fetchArgs = buildFetchPostsArgs(scope, {
        limit: loadMoreLimit,
        until: Math.floor(oldestTimestamp / 1000) - 1,
      });
      let olderPosts = await nostrService.fetchPosts(fetchArgs);
      olderPosts = await mergePostsWithIndexer(olderPosts, {
        boardId: fetchArgs.boardId,
        boardAddress: fetchArgs.boardAddress,
        geohash: fetchArgs.geohash,
        limit: loadMoreLimit,
        until: fetchArgs.until,
      });

      if (olderPosts.length === 0) {
        setHasMorePosts(false);
        return;
      }

      const { processedPosts, oldestMs } = await processFetchedPostEvents(olderPosts);

      setPosts((prev) => appendUniqueNostrPosts(prev, processedPosts));

      if (oldestMs !== null) {
        setOldestTimestamp(oldestMs);
      } else {
        setOldestTimestamp(getOldestPostTimestamp(processedPosts));
      }

      setHasMorePosts(olderPosts.length >= loadMoreLimit);
    } catch (error) {
      logger.error('App', 'Failed to load more posts', error);
      toastService.push({
        type: 'error',
        message: 'Failed to load more posts',
        detail: error instanceof Error ? error.message : String(error),
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'load-more-failed',
      });
    }
  }, [activeBoard, oldestTimestamp, hasMorePosts, setPosts, setOldestTimestamp, setHasMorePosts]);

  const getBoardName = useCallback(
    (postId: string) => {
      const post = postsById.get(postId);
      if (!post) return undefined;
      const board = boardsById.get(post.boardId);
      return board?.name;
    },
    [postsById, boardsById],
  );

  const refreshProfileMetadata = useCallback(
    async (pubkeys: string[]) => {
      const unique = Array.from(new Set(pubkeys.filter(Boolean)));
      if (unique.length === 0) return;

      try {
        await nostrService.fetchProfiles(unique, { force: true });

        setPosts((prev) =>
          prev.map((post) => {
            const nextAuthor =
              post.authorPubkey && unique.includes(post.authorPubkey)
                ? nostrService.getDisplayName(post.authorPubkey)
                : post.author;

            const nextComments = post.comments.map((comment) => {
              if (!comment.authorPubkey || !unique.includes(comment.authorPubkey)) return comment;
              return { ...comment, author: nostrService.getDisplayName(comment.authorPubkey) };
            });

            return {
              ...post,
              author: nextAuthor,
              comments: nextComments,
            };
          }),
        );

        toastService.push({
          type: 'success',
          message: 'Profile refreshed',
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: `profile-refresh-${unique.join(',')}`,
        });
      } catch (error) {
        toastService.push({
          type: 'error',
          message: 'Failed to refresh profile',
          detail: error instanceof Error ? error.message : String(error),
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: `profile-refresh-failed-${unique.join(',')}`,
        });
      }
    },
    [setPosts],
  );

  const isGeohashBoard = useCallback(
    (boardId: string) => boardsById.get(boardId)?.type === BoardType.GEOHASH,
    [boardsById],
  );

  return {
    loadMorePosts,
    getBoardName,
    refreshProfileMetadata,
    isGeohashBoard,
  };
}
