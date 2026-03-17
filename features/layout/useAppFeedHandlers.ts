import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import type { Board, Post } from '../../types';
import { BoardType } from '../../types';
import { nostrService } from '../../services/nostr/NostrService';
import { votingService } from '../../services/votingService';
import { toastService } from '../../services/toastService';
import { logger } from '../../services/loggingService';
import { UIConfig } from '../../config';

interface UseAppFeedHandlersArgs {
  oldestTimestamp: number | null;
  hasMorePosts: boolean;
  postsById: Map<string, Post>;
  boardsById: Map<string, Board>;
  setPosts: Dispatch<SetStateAction<Post[]>>;
  setOldestTimestamp: (timestamp: number | null) => void;
  setHasMorePosts: (hasMore: boolean) => void;
}

export function useAppFeedHandlers({
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
      const olderPosts = await nostrService.fetchPosts({
        limit: loadMoreLimit,
        until: Math.floor(oldestTimestamp / 1000) - 1,
      });

      if (olderPosts.length === 0) {
        setHasMorePosts(false);
        return;
      }

      const convertedPosts = olderPosts.map((event) => nostrService.eventToPost(event));
      const postsWithNostrIds = convertedPosts.filter((post) => post.nostrEventId);
      const postIds = postsWithNostrIds.map((post) => post.nostrEventId!);
      const voteTallies = await votingService.fetchVotesForPosts(postIds);

      const postsWithVotes = convertedPosts.map((post) => {
        if (!post.nostrEventId) return post;
        const tally = voteTallies.get(post.nostrEventId);
        if (!tally) return post;
        return {
          ...post,
          upvotes: tally.upvotes,
          downvotes: tally.downvotes,
          score: tally.score,
          uniqueVoters: tally.uniqueVoters,
          votesVerified: true,
        };
      });

      try {
        const editEvents = await nostrService.fetchPostEdits(postIds, { limit: 300 });
        if (editEvents.length > 0) {
          const latestByRoot = new Map<string, { created_at: number; event: NostrEvent }>();
          for (const event of editEvents) {
            const parsed = nostrService.eventToPostEditUpdate(event);
            if (!parsed) continue;
            const existing = latestByRoot.get(parsed.rootPostEventId);
            if (!existing || event.created_at > existing.created_at) {
              latestByRoot.set(parsed.rootPostEventId, { created_at: event.created_at, event });
            }
          }

          for (let i = 0; i < postsWithVotes.length; i++) {
            const post = postsWithVotes[i];
            const rootId = post.nostrEventId;
            if (!rootId) continue;
            const latest = latestByRoot.get(rootId);
            if (!latest) continue;
            const parsed = nostrService.eventToPostEditUpdate(latest.event);
            if (!parsed) continue;
            postsWithVotes[i] = { ...post, ...parsed.updates };
          }
        }
      } catch (error) {
        logger.warn('App', 'Failed to fetch post edits for pagination', error);
      }

      setPosts((prev) => {
        const existingIds = new Set(prev.map((post) => post.nostrEventId).filter(Boolean));
        const newPosts = postsWithVotes.filter((post) => !existingIds.has(post.nostrEventId));
        return [...prev, ...newPosts];
      });

      const timestamps = postsWithVotes.map((post) => post.timestamp);
      if (timestamps.length > 0) {
        setOldestTimestamp(Math.min(...timestamps));
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
  }, [oldestTimestamp, hasMorePosts, setPosts, setOldestTimestamp, setHasMorePosts]);

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
