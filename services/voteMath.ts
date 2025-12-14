// ============================================
// VOTE MATH (Pure helpers)
// ============================================
// Isolated from votingService to keep unit tests fast and side-effect free.

/**
 * Optimistic update state for UI.
 * Calculated before publishing vote to Nostr.
 */
export interface OptimisticVoteUpdate {
  /** Bit cost/refund for this vote action */
  bitCost: number;
  /** New votedPosts state after optimistic update */
  newVotedPosts: Record<string, 'up' | 'down'>;
  /** New bits count after optimistic update */
  newBits: number;
  /** Score delta to apply optimistically */
  scoreDelta: number;
  /** Previous vote direction (for rollback) */
  previousVote: 'up' | 'down' | null;
}

/**
 * Rollback state if vote fails.
 */
export interface VoteRollback {
  /** Bit adjustment to revert optimistic update */
  bitAdjustment: number;
  /** Previous votedPosts state to restore */
  previousVotedPosts: Record<string, 'up' | 'down'>;
  /** Score delta to revert */
  scoreDelta: number;
}

/**
 * Calculate bit cost for a vote action.
 * Returns the bit cost (positive = spend, negative = refund, 0 = free)
 */
export function computeBitCost(previousVote: 'up' | 'down' | null, newDirection: 'up' | 'down'): number {
  if (previousVote === newDirection) {
    // Retracting vote - refund bit
    return -1;
  }
  if (!previousVote) {
    // New vote - costs 1 bit
    return 1;
  }
  // Switching vote direction - free (bit stays locked)
  return 0;
}

/**
 * Compute the score delta for a vote change.
 * Centralizes the "one vote per user per post" rule:
 * - First vote: +/-1
 * - Switching direction: +/-2
 * - Retracting: -/+1
 */
export function computeVoteScoreDelta(previousDirection: 'up' | 'down' | null, newDirection: 'up' | 'down'): number {
  if (previousDirection === newDirection) {
    // Retract vote
    return newDirection === 'up' ? -1 : 1;
  }

  if (previousDirection) {
    // Switch direction
    return newDirection === 'up' ? 2 : -2;
  }

  // First vote on this post
  return newDirection === 'up' ? 1 : -1;
}

/**
 * Calculate optimistic update state for a vote.
 * Centralizes all optimistic update logic.
 */
export function computeOptimisticUpdate(
  currentVote: 'up' | 'down' | null,
  newDirection: 'up' | 'down',
  currentBits: number,
  currentVotedPosts: Record<string, 'up' | 'down'>,
  postId: string
): OptimisticVoteUpdate {
  const bitCost = computeBitCost(currentVote, newDirection);
  const scoreDelta = computeVoteScoreDelta(currentVote, newDirection);

  if (currentVote === newDirection) {
    // Retracting vote
    const updated = { ...currentVotedPosts };
    delete updated[postId];
    return {
      bitCost,
      newVotedPosts: updated,
      newBits: currentBits + 1,
      scoreDelta,
      previousVote: currentVote,
    };
  }

  // New vote or switching
  const updated = { ...currentVotedPosts };
  updated[postId] = newDirection;
  const finalBits = !currentVote ? currentBits - 1 : currentBits;
  return {
    bitCost,
    newVotedPosts: updated,
    newBits: finalBits,
    scoreDelta,
    previousVote: currentVote,
  };
}

/**
 * Calculate rollback state if vote fails.
 * Reverses the optimistic update.
 */
export function computeRollback(
  optimisticUpdate: OptimisticVoteUpdate,
  originalVotedPosts: Record<string, 'up' | 'down'>,
  postId: string
): VoteRollback {
  // To revert, subtract the bitCost (reverses the optimistic change)
  const bitAdjustment = -optimisticUpdate.bitCost;

  // Restore previous votedPosts state
  const previousVotedPosts = optimisticUpdate.previousVote
    ? { ...originalVotedPosts, [postId]: optimisticUpdate.previousVote }
    : (() => {
        const v = { ...originalVotedPosts };
        delete v[postId];
        return v;
      })();

  return {
    bitAdjustment,
    previousVotedPosts,
    scoreDelta: -optimisticUpdate.scoreDelta,
  };
}
