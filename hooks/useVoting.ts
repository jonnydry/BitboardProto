import { useCallback } from 'react';
import type { Post, UserState } from '../types';
import { identityService } from '../services/identityService';
import { votingService, computeOptimisticUpdate, computeRollback } from '../services/votingService';

export function useVoting(args: {
  postsById: Map<string, Post>;
  userState: UserState;
  setUserState: React.Dispatch<React.SetStateAction<UserState>>;
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
}) {
  const { postsById, userState, setUserState, setPosts } = args;

  const handleVote = useCallback(
    async (postId: string, direction: 'up' | 'down') => {
      const post = postsById.get(postId);

      const currentUserState = userState;
      const currentVote = currentUserState.votedPosts[postId];

      if (!currentUserState.identity) {
        console.warn('[Vote] No identity - connect an identity to vote.');
        return;
      }

      if (!currentVote && currentUserState.bits <= 0) {
        console.warn('[Vote] Insufficient bits');
        return;
      }

      const optimisticUpdate = computeOptimisticUpdate(
        currentVote ?? null,
        direction,
        currentUserState.bits,
        currentUserState.votedPosts,
        postId
      );

      setUserState((prev) => ({
        ...prev,
        bits: optimisticUpdate.newBits,
        votedPosts: optimisticUpdate.newVotedPosts,
      }));

      setPosts((currentPosts) =>
        currentPosts.map((p) => (p.id === postId ? { ...p, score: p.score + optimisticUpdate.scoreDelta } : p))
      );

      if (currentUserState.identity && post?.nostrEventId) {
        try {
          const result = await votingService.castVote(
            post.nostrEventId,
            direction,
            currentUserState.identity,
            post.authorPubkey
          );

          if (result.success && result.newTally) {
            setPosts((currentPosts) =>
              currentPosts.map((p) =>
                p.id === postId
                  ? {
                      ...p,
                      upvotes: result.newTally!.upvotes,
                      downvotes: result.newTally!.downvotes,
                      score: result.newTally!.score,
                      uniqueVoters: result.newTally!.uniqueVoters,
                      votesVerified: true,
                    }
                  : p
              )
            );
            console.log(`[Vote] Verified: ${result.newTally.uniqueVoters} unique voters`);
          } else if (result.error) {
            console.error('[Vote] Failed:', result.error);
            const rollback = computeRollback(optimisticUpdate, currentUserState.votedPosts, postId);
            setUserState((prev) => ({
              ...prev,
              bits: prev.bits + rollback.bitAdjustment,
              votedPosts: rollback.previousVotedPosts,
            }));
            setPosts((currentPosts) =>
              currentPosts.map((p) => (p.id === postId ? { ...p, score: p.score + rollback.scoreDelta } : p))
            );
          }
        } catch (error) {
          console.error('[Vote] Error publishing:', error);
          // Best-effort rollback for publish exceptions
          const rollback = computeRollback(optimisticUpdate, currentUserState.votedPosts, postId);
          setUserState((prev) => ({
            ...prev,
            bits: prev.bits + rollback.bitAdjustment,
            votedPosts: rollback.previousVotedPosts,
          }));
          setPosts((currentPosts) =>
            currentPosts.map((p) => (p.id === postId ? { ...p, score: p.score + rollback.scoreDelta } : p))
          );
        }
      }
    },
    [postsById, setPosts, setUserState, userState]
  );

  return { handleVote };
}
