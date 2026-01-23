import React, { useCallback } from 'react';
import type { Post } from '../types';
import { votingService, computeOptimisticUpdate, computeRollback } from '../services/votingService';
import { logger } from '../services/loggingService';
import { useUserStore } from '../stores/userStore';
import { usePostStore } from '../stores/postStore';

export function useVoting(args: {
  postsById: Map<string, Post>;
}) {
  const { postsById } = args;

  // Use selective Zustand selectors instead of full userState object
  const userBits = useUserStore((state) => state.userState.bits);
  const userIdentity = useUserStore((state) => state.userState.identity);
  const votedPosts = useUserStore((state) => state.userState.votedPosts);
  const setUserState = useUserStore((state) => state.setUserState);
  
  // Use targeted post update instead of array mapping
  const updatePost = usePostStore((state) => state.updatePost);
  const getPost = usePostStore((state) => (id: string) => state.posts.find(p => p.id === id));

  const handleVote = useCallback(
    async (postId: string, direction: 'up' | 'down') => {
      const post = postsById.get(postId);
      if (!post) {
        logger.warn('Vote', 'Post not found');
        return;
      }

      const currentVote = votedPosts[postId];

      if (!userIdentity) {
        logger.warn('Vote', 'No identity - connect an identity to vote.');
        return;
      }

      if (!currentVote && userBits <= 0) {
        logger.warn('Vote', 'Insufficient bits');
        return;
      }

      const optimisticUpdate = computeOptimisticUpdate(
        currentVote ?? null,
        direction,
        userBits,
        votedPosts,
        postId
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
            post.authorPubkey
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
            const rollback = computeRollback(optimisticUpdate, votedPosts, postId);
            setUserState((prev) => ({
              ...prev,
              bits: prev.bits + rollback.bitAdjustment,
              votedPosts: rollback.previousVotedPosts,
            }));
            // Get latest post from store for rollback
            const currentPost = getPost(postId) || post;
            // Use targeted update for rollback
            updatePost(postId, {
              score: currentPost.score + rollback.scoreDelta,
            });
          }
        } catch (error) {
          logger.error('Vote', 'Error publishing', error);
          // Best-effort rollback for publish exceptions
          const rollback = computeRollback(optimisticUpdate, votedPosts, postId);
          setUserState((prev) => ({
            ...prev,
            bits: prev.bits + rollback.bitAdjustment,
            votedPosts: rollback.previousVotedPosts,
          }));
          // Get latest post from store for rollback
          const currentPost = getPost(postId) || post;
          // Use targeted update for rollback
          updatePost(postId, {
            score: currentPost.score + rollback.scoreDelta,
          });
        }
      }
    },
    [postsById, updatePost, setUserState, votedPosts, userBits, userIdentity, getPost]
  );

  return { handleVote };
}


