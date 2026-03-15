import { useCallback } from 'react';
import type { Post } from '../types';
import { votingService, computeOptimisticUpdate, computeRollback } from '../services/votingService';
import { logger } from '../services/loggingService';
import { useUserStore } from '../stores/userStore';
import { usePostStore } from '../stores/postStore';

export function useVoting(args: { postsById: Map<string, Post> }) {
  const { postsById } = args;

  // Use selective Zustand selectors for identity (needed for early return check)
  // Bits and votedPosts are read from store.getState() inside the callback to avoid stale closures
  const userIdentity = useUserStore((state) => state.userState.identity);
  const setUserState = useUserStore((state) => state.setUserState);

  // Use targeted post update instead of array mapping
  const updatePost = usePostStore((state) => state.updatePost);

  const handleVote = useCallback(
    async (postId: string, direction: 'up' | 'down') => {
      const post = postsById.get(postId);
      if (!post) {
        logger.warn('Vote', 'Post not found');
        return;
      }

      // Read current vote state directly from store to avoid stale closures
      const currentVotedPosts = useUserStore.getState().userState.votedPosts;
      const currentVote = currentVotedPosts[postId];

      if (!userIdentity) {
        logger.warn('Vote', 'No identity - connect an identity to vote.');
        return;
      }

      const currentBits = useUserStore.getState().userState.bits;

      if (!currentVote && currentBits <= 0) {
        logger.warn('Vote', 'Insufficient bits');
        return;
      }
      const optimisticUpdate = computeOptimisticUpdate(
        currentVote ?? null,
        direction,
        currentBits,
        currentVotedPosts,
        postId,
      );

      setUserState((prev) => ({
        ...prev,
        bits: optimisticUpdate.newBits,
        votedPosts: optimisticUpdate.newVotedPosts,
      }));

      // Use targeted update instead of array mapping
      updatePost(postId, {
        score: post.score + optimisticUpdate.scoreDelta,
      });

      if (userIdentity && post?.nostrEventId) {
        try {
          const result = await votingService.castVote(
            post.nostrEventId,
            direction,
            userIdentity,
            post.authorPubkey,
          );

          if (result.success && result.newTally) {
            // Use targeted update instead of array mapping
            updatePost(postId, {
              upvotes: result.newTally.upvotes,
              downvotes: result.newTally.downvotes,
              score: result.newTally.score,
              uniqueVoters: result.newTally.uniqueVoters,
              votesVerified: true,
            });
            logger.debug('Vote', `Verified: ${result.newTally.uniqueVoters} unique voters`);
          } else if (result.error) {
            logger.error('Vote', `Failed: ${result.error}`);
            const freshVotedPosts = useUserStore.getState().userState.votedPosts;
            const rollback = computeRollback(optimisticUpdate, freshVotedPosts, postId);
            setUserState((prev) => ({
              ...prev,
              bits: prev.bits + rollback.bitAdjustment,
              votedPosts: rollback.previousVotedPosts,
            }));
            // Get latest post from store for rollback
            const currentPost = usePostStore.getState().posts.find((p) => p.id === postId) || post;
            updatePost(postId, {
              score: currentPost.score + rollback.scoreDelta,
            });
          }
        } catch (error) {
          logger.error('Vote', 'Error publishing', error);
          // Best-effort rollback for publish exceptions
          const freshVotedPosts = useUserStore.getState().userState.votedPosts;
          const rollback = computeRollback(optimisticUpdate, freshVotedPosts, postId);
          setUserState((prev) => ({
            ...prev,
            bits: prev.bits + rollback.bitAdjustment,
            votedPosts: rollback.previousVotedPosts,
          }));
          // Get latest post from store for rollback
          const currentPost = usePostStore.getState().posts.find((p) => p.id === postId) || post;
          updatePost(postId, {
            score: currentPost.score + rollback.scoreDelta,
          });
        }
      }
    },
    [postsById, updatePost, setUserState, userIdentity],
  );

  return { handleVote };
}
