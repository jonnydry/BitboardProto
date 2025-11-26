// ============================================
// VOTING SERVICE
// ============================================
// Cryptographically verified voting system for BitBoard
// Ensures one vote per user (pubkey) per post using Nostr signatures
//
// Key Principles:
// 1. Each vote is a signed Nostr event (kind 7 reaction)
// 2. One vote per pubkey per post (cryptographically enforced)
// 3. Votes are verified by checking signatures
// 4. Equal influence - each user gets exactly one vote
// 5. Vote changes are tracked (switch from up to down)

import { type Event as NostrEvent, verifyEvent } from 'nostr-tools';
import { nostrService } from './nostrService';
import { rateLimiter } from './rateLimiter';
import { voteDeduplicator } from './messageDeduplicator';
import { NOSTR_KINDS } from '../types';

// ============================================
// TYPES
// ============================================

export interface Vote {
  eventId: string;        // Nostr event ID of the vote
  postId: string;         // Post being voted on
  voterPubkey: string;    // Voter's public key (unique identifier)
  direction: 'up' | 'down';
  timestamp: number;
  isVerified: boolean;    // Whether signature was verified
}

export interface VoteTally {
  postId: string;
  upvotes: number;
  downvotes: number;
  score: number;
  uniqueVoters: number;   // Number of unique pubkeys that voted
  votes: Map<string, Vote>; // pubkey -> vote (ensures one per user)
  lastUpdated: number;
}

export interface VoteResult {
  success: boolean;
  error?: string;
  vote?: Vote;
  newTally?: VoteTally;
}

// ============================================
// PURE HELPERS
// ============================================

/**
 * Compute the score delta for a vote change.
 * Centralizes the \"one vote per user per post\" rule:
 * - First vote: +/-1
 * - Switching direction: +/-2
 * - Retracting: -/+1
 */
export function computeVoteScoreDelta(
  previousDirection: 'up' | 'down' | null,
  newDirection: 'up' | 'down'
): number {
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

// ============================================
// VOTING SERVICE CLASS
// ============================================

class VotingService {
  // Cache of vote tallies per post
  private voteTallies: Map<string, VoteTally> = new Map();
  
  // Track user's own votes (for UI state)
  private userVotes: Map<string, Map<string, 'up' | 'down'>> = new Map(); // pubkey -> (postId -> direction)

  // ----------------------------------------
  // VOTE VERIFICATION
  // ----------------------------------------

  /**
   * Verify a Nostr vote event is valid
   * Checks signature and event structure
   */
  verifyVoteEvent(event: NostrEvent): boolean {
    // 1. Verify the cryptographic signature
    if (!verifyEvent(event)) {
      console.warn('[Voting] Invalid signature for vote event:', event.id);
      return false;
    }

    // 2. Verify it's a reaction event (kind 7)
    if (event.kind !== NOSTR_KINDS.REACTION) {
      console.warn('[Voting] Invalid event kind for vote:', event.kind);
      return false;
    }

    // 3. Verify it has a valid vote content (+ or -)
    if (event.content !== '+' && event.content !== '-') {
      console.warn('[Voting] Invalid vote content:', event.content);
      return false;
    }

    // 4. Verify it references a post (has 'e' tag)
    const postTag = event.tags.find(t => t[0] === 'e');
    if (!postTag || !postTag[1]) {
      console.warn('[Voting] Vote missing post reference');
      return false;
    }

    return true;
  }

  /**
   * Extract vote data from a verified Nostr event
   */
  private eventToVote(event: NostrEvent, isVerified: boolean): Vote | null {
    const postTag = event.tags.find(t => t[0] === 'e');
    if (!postTag) return null;

    return {
      eventId: event.id,
      postId: postTag[1],
      voterPubkey: event.pubkey,
      direction: event.content === '+' ? 'up' : 'down',
      timestamp: event.created_at * 1000,
      isVerified,
    };
  }

  // ----------------------------------------
  // VOTE TALLYING
  // ----------------------------------------

  /**
   * Process a vote event and update tally
   * Ensures one vote per pubkey per post
   */
  processVoteEvent(event: NostrEvent): Vote | null {
    // Verify the vote
    const isVerified = this.verifyVoteEvent(event);
    if (!isVerified) return null;

    const vote = this.eventToVote(event, isVerified);
    if (!vote) return null;

    // Get or create tally for this post
    let tally = this.voteTallies.get(vote.postId);
    if (!tally) {
      tally = {
        postId: vote.postId,
        upvotes: 0,
        downvotes: 0,
        score: 0,
        uniqueVoters: 0,
        votes: new Map(),
        lastUpdated: Date.now(),
      };
      this.voteTallies.set(vote.postId, tally);
    }

    // Check if this user already voted
    const existingVote = tally.votes.get(vote.voterPubkey);
    
    if (existingVote) {
      // User already voted - only update if newer timestamp
      if (vote.timestamp > existingVote.timestamp) {
        // Remove old vote from count
        if (existingVote.direction === 'up') {
          tally.upvotes--;
        } else {
          tally.downvotes--;
        }
        
        // Add new vote
        if (vote.direction === 'up') {
          tally.upvotes++;
        } else {
          tally.downvotes++;
        }
        
        tally.votes.set(vote.voterPubkey, vote);
      }
    } else {
      // New vote from this user
      if (vote.direction === 'up') {
        tally.upvotes++;
      } else {
        tally.downvotes++;
      }
      
      tally.votes.set(vote.voterPubkey, vote);
      tally.uniqueVoters++;
    }

    // Update score
    tally.score = tally.upvotes - tally.downvotes;
    tally.lastUpdated = Date.now();

    return vote;
  }

  /**
   * Fetch and process all votes for a post
   * Returns deduplicated tally with one vote per pubkey
   * Each vote is cryptographically verified
   */
  async fetchVotesForPost(postId: string): Promise<VoteTally> {
    // Check cache first
    const cached = this.voteTallies.get(postId);
    if (cached && Date.now() - cached.lastUpdated < 30000) { // 30 second cache
      return cached;
    }

    // Fetch raw vote events from Nostr
    const voteEvents = await nostrService.fetchVoteEvents(postId);
    
    // Create fresh tally
    const tally: VoteTally = {
      postId,
      upvotes: 0,
      downvotes: 0,
      score: 0,
      uniqueVoters: 0,
      votes: new Map(),
      lastUpdated: Date.now(),
    };

    // Process each vote event
    // Sort by timestamp to ensure latest vote per user wins
    const sortedEvents = [...voteEvents].sort(
      (a, b) => a.created_at - b.created_at
    );

    for (const event of sortedEvents) {
      // Cryptographically verify each vote
      const isVerified = this.verifyVoteEvent(event);
      if (!isVerified) {
        console.warn('[Voting] Rejected unverified vote from:', event.pubkey.slice(0, 8));
        continue;
      }

      const vote = this.eventToVote(event, isVerified);
      if (!vote) continue;

      // Check for existing vote from this pubkey (one vote per user)
      const existingVote = tally.votes.get(vote.voterPubkey);
      
      if (existingVote) {
        // User changed their vote - remove old count
        if (existingVote.direction === 'up') {
          tally.upvotes--;
        } else {
          tally.downvotes--;
        }
      } else {
        // New unique voter
        tally.uniqueVoters++;
      }

      // Add new/updated vote
      if (vote.direction === 'up') {
        tally.upvotes++;
      } else {
        tally.downvotes++;
      }
      
      tally.votes.set(vote.voterPubkey, vote);
    }

    tally.score = tally.upvotes - tally.downvotes;
    this.voteTallies.set(postId, tally);

    console.log(`[Voting] Post ${postId.slice(0, 8)}: ${tally.uniqueVoters} unique voters, score ${tally.score}`);

    return tally;
  }

  // ----------------------------------------
  // CASTING VOTES
  // ----------------------------------------

  /**
   * Cast a vote on a post
   * Returns the vote result with verification status
   */
  async castVote(
    postId: string,
    direction: 'up' | 'down',
    userPubkey: string,
    privateKey: Uint8Array
  ): Promise<VoteResult> {
    // Rate limit check
    if (!rateLimiter.allowVote(userPubkey)) {
      return {
        success: false,
        error: 'Rate limit exceeded. Please wait before voting again.',
      };
    }

    // Check for duplicate vote attempt (local check)
    if (voteDeduplicator.isVoteDuplicate(userPubkey, postId)) {
      // User already voted - this is a vote change
      console.log('[Voting] Vote change detected for post:', postId);
    }

    try {
      // Publish vote to Nostr
      const event = await nostrService.publishVote(postId, direction, privateKey);
      
      // Mark as processed
      voteDeduplicator.markVoteProcessed(userPubkey, postId);

      // Create vote object
      const vote: Vote = {
        eventId: event.id,
        postId,
        voterPubkey: userPubkey,
        direction,
        timestamp: Date.now(),
        isVerified: true, // We just created it
      };

      // Update local tally
      let tally = this.voteTallies.get(postId);
      if (!tally) {
        tally = {
          postId,
          upvotes: 0,
          downvotes: 0,
          score: 0,
          uniqueVoters: 0,
          votes: new Map(),
          lastUpdated: Date.now(),
        };
        this.voteTallies.set(postId, tally);
      }

      // Handle existing vote from this user
      const existingVote = tally.votes.get(userPubkey);
      if (existingVote) {
        if (existingVote.direction === 'up') {
          tally.upvotes--;
        } else {
          tally.downvotes--;
        }
      } else {
        tally.uniqueVoters++;
      }

      // Add new vote
      if (direction === 'up') {
        tally.upvotes++;
      } else {
        tally.downvotes++;
      }
      
      tally.votes.set(userPubkey, vote);
      tally.score = tally.upvotes - tally.downvotes;
      tally.lastUpdated = Date.now();

      // Track user's vote
      let userVoteMap = this.userVotes.get(userPubkey);
      if (!userVoteMap) {
        userVoteMap = new Map();
        this.userVotes.set(userPubkey, userVoteMap);
      }
      userVoteMap.set(postId, direction);

      return {
        success: true,
        vote,
        newTally: tally,
      };
    } catch (error) {
      console.error('[Voting] Failed to cast vote:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to publish vote',
      };
    }
  }

  // ----------------------------------------
  // USER VOTE QUERIES
  // ----------------------------------------

  /**
   * Get user's vote on a specific post
   */
  getUserVote(userPubkey: string, postId: string): 'up' | 'down' | null {
    // Check local cache first
    const userVoteMap = this.userVotes.get(userPubkey);
    if (userVoteMap?.has(postId)) {
      return userVoteMap.get(postId) || null;
    }

    // Check tally
    const tally = this.voteTallies.get(postId);
    if (tally) {
      const vote = tally.votes.get(userPubkey);
      if (vote) {
        return vote.direction;
      }
    }

    return null;
  }

  /**
   * Get all of a user's votes (for restoring state)
   */
  getUserVotes(userPubkey: string): Map<string, 'up' | 'down'> {
    return this.userVotes.get(userPubkey) || new Map();
  }

  /**
   * Check if user has voted on a post
   */
  hasUserVoted(userPubkey: string, postId: string): boolean {
    return this.getUserVote(userPubkey, postId) !== null;
  }

  // ----------------------------------------
  // TALLY QUERIES
  // ----------------------------------------

  /**
   * Get cached tally for a post (doesn't fetch)
   */
  getCachedTally(postId: string): VoteTally | null {
    return this.voteTallies.get(postId) || null;
  }

  /**
   * Get score for a post
   */
  getScore(postId: string): number {
    const tally = this.voteTallies.get(postId);
    return tally?.score || 0;
  }

  /**
   * Get unique voter count for a post
   */
  getUniqueVoterCount(postId: string): number {
    const tally = this.voteTallies.get(postId);
    return tally?.uniqueVoters || 0;
  }

  // ----------------------------------------
  // CACHE MANAGEMENT
  // ----------------------------------------

  /**
   * Clear all cached tallies
   */
  clearCache(): void {
    this.voteTallies.clear();
    this.userVotes.clear();
  }

  /**
   * Clear cache for a specific post
   */
  clearPostCache(postId: string): void {
    this.voteTallies.delete(postId);
  }

  /**
   * Invalidate stale caches (older than maxAge)
   */
  invalidateStaleCache(maxAgeMs: number = 60000): void {
    const now = Date.now();
    for (const [postId, tally] of this.voteTallies.entries()) {
      if (now - tally.lastUpdated > maxAgeMs) {
        this.voteTallies.delete(postId);
      }
    }
  }
}

// Export singleton instance
export const votingService = new VotingService();

