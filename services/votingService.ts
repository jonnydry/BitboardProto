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
//
// ============================================
// BITS ECONOMY ↔ NOSTR VOTES MAPPING
// ============================================
// The local "bits" economy gates access to casting Nostr votes:
//
// **Cryptographic Model (Nostr):**
//   - One vote per pubkey per post (enforced by signature verification)
//   - Votes are permanent, verifiable, and decentralized
//   - Each vote is a signed event stored on relays
//
// **Economic Model (Bits):**
//   - Bits are a local UI gating mechanism (not stored on-chain)
//   - First vote on a post costs 1 bit (spent locally)
//   - Switching vote direction is FREE (bit stays locked on that post)
//   - Retracting vote refunds 1 bit (returned locally)
//   - Bits prevent spam but don't affect cryptographic vote counts
//
// **Mapping Rules:**
//   1. 1 Bit = Permission to cast 1 cryptographic vote (one-time cost per post)
//   2. Bits are spent BEFORE the Nostr vote is published
//   3. If Nostr publish fails, bit is refunded (rollback)
//   4. Bits are local-only; Nostr votes are global and permanent
//   5. Multiple users can vote on same post (each spends their own bit)
//   6. Bits reset daily; Nostr votes persist forever
//
// **Why This Design:**
//   - Bits provide UX gating (prevent accidental spam)
//   - Nostr provides cryptographic verification (prevent vote manipulation)
//   - Economic model (bits) matches cryptographic model (one vote per pubkey)
//   - Both systems enforce "one vote per user per post" independently

import { type Event as NostrEvent, verifyEvent } from 'nostr-tools';
import { nostrService } from './nostrService';
import { rateLimiter } from './rateLimiter';
import { voteDeduplicator } from './messageDeduplicator';
import { NOSTR_KINDS } from '../types';
import type { NostrIdentity } from '../types';
import { identityService } from './identityService';

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

// Pure helpers (exported for UI + unit tests)
export type { OptimisticVoteUpdate, VoteRollback } from './voteMath';
export { computeBitCost, computeOptimisticUpdate, computeRollback, computeVoteScoreDelta } from './voteMath';

// ============================================
// VOTING SERVICE CLASS
// ============================================

class VotingService {
  // Cache of vote tallies per post (LRU cache with max 1000 entries)
  private voteTallies: Map<string, VoteTally> = new Map();
  private readonly MAX_CACHE_SIZE = 1000;
  
  // Track user's own votes (for UI state)
  private userVotes: Map<string, Map<string, 'up' | 'down'>> = new Map(); // pubkey -> (postId -> direction)

  // Track in-flight requests to prevent duplicates
  private inFlightRequests: Map<string, Promise<VoteTally>> = new Map();

  // Cleanup interval for stale cache
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  // Web Worker for vote verification
  private worker: Worker | null = null;
  private workerPromises = new Map<string, { resolve: (results: any) => void; reject: (error: any) => void }>();
  private workerRequestId = 0;
  private workerReady = false;

  constructor() {
    // Start periodic cleanup
    this.startPeriodicCleanup();
    
    // Try to initialize Web Worker
    this.initWorker();
  }

  /**
   * Start periodic cleanup of stale cache entries
   */
  private startPeriodicCleanup(): void {
    if (this.cleanupInterval) return;
    
    this.cleanupInterval = setInterval(() => {
      this.invalidateStaleCache(5 * 60 * 1000); // 5 minutes
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Initialize Web Worker for vote verification (if supported)
   */
  private initWorker(): void {
    if (typeof Worker === 'undefined') {
      console.log('[Voting] Web Workers not supported, using main thread verification');
      return;
    }

    try {
      this.worker = new Worker(
        new URL('./workers/voteVerifier.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (e: MessageEvent) => {
        const { type, id, results, error } = e.data;

        if (type === 'ready') {
          this.workerReady = true;
          console.log('[Voting] Web Worker initialized successfully');
          return;
        }

        const promise = this.workerPromises.get(id);
        if (!promise) return;

        this.workerPromises.delete(id);

        if (error) {
          promise.reject(new Error(error));
        } else {
          promise.resolve(results);
        }
      };

      this.worker.onerror = (error) => {
        console.error('[Voting] Web Worker error:', error);
        this.worker = null;
        this.workerReady = false;
      };
    } catch (e) {
      console.warn('[Voting] Failed to initialize Web Worker:', e);
      this.worker = null;
      this.workerReady = false;
    }
  }

  /**
   * Verify vote events using Web Worker (if available) or fallback to main thread
   */
  private async verifyVoteEventsBatch(events: NostrEvent[]): Promise<Map<string, boolean>> {
    if (this.worker && this.workerReady) {
      return this.verifyVoteEventsWorker(events);
    } else {
      return this.verifyVoteEventsMainThread(events);
    }
  }

  /**
   * Verify vote events using Web Worker
   */
  private verifyVoteEventsWorker(events: NostrEvent[]): Promise<Map<string, boolean>> {
    return new Promise((resolve, reject) => {
      const id = `verify-${this.workerRequestId++}`;
      
      this.workerPromises.set(id, { resolve, reject });

      // Send batch to worker
      this.worker!.postMessage({ id, events });
    }).then((results: Array<{ id: string; pubkey: string; valid: boolean }>) => {
      // Convert results array to Map
      const resultMap = new Map<string, boolean>();
      for (const result of results) {
        resultMap.set(result.id, result.valid);
      }
      return resultMap;
    });
  }

  /**
   * Verify vote events on main thread (fallback)
   */
  private verifyVoteEventsMainThread(events: NostrEvent[]): Map<string, boolean> {
    const results = new Map<string, boolean>();
    for (const event of events) {
      results.set(event.id, verifyEvent(event));
    }
    return results;
  }

  /**
   * Stop periodic cleanup (for testing/cleanup)
   */
  private stopPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Cleanup worker
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.workerReady = false;
    }
  }

  /**
   * Ensure cache doesn't exceed max size (LRU eviction)
   */
  private enforceCacheLimit(): void {
    if (this.voteTallies.size <= this.MAX_CACHE_SIZE) {
      return;
    }

    // Sort by lastUpdated and remove oldest entries
    const entries = Array.from(this.voteTallies.entries());
    entries.sort((a, b) => a[1].lastUpdated - b[1].lastUpdated);
    
    // Remove oldest 10% of entries
    const removeCount = Math.floor(this.MAX_CACHE_SIZE * 0.1);
    for (let i = 0; i < removeCount; i++) {
      this.voteTallies.delete(entries[i][0]);
    }
  }

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
   * Implements request deduplication to prevent duplicate network calls
   */
  async fetchVotesForPost(postId: string): Promise<VoteTally> {
    // Check cache first
    const cached = this.voteTallies.get(postId);
    if (cached && Date.now() - cached.lastUpdated < 30000) { // 30 second cache
      return cached;
    }

    // Check if request is already in-flight
    const inFlight = this.inFlightRequests.get(postId);
    if (inFlight) {
      return inFlight;
    }

    // Create new request promise
    const requestPromise = this._fetchVotesForPostInternal(postId);
    this.inFlightRequests.set(postId, requestPromise);

    // Clean up when done
    requestPromise.finally(() => {
      this.inFlightRequests.delete(postId);
    });

    return requestPromise;
  }

  /**
   * Internal method to fetch votes (called by fetchVotesForPost)
   */
  private async _fetchVotesForPostInternal(postId: string): Promise<VoteTally> {
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

    // Batch verify all events (using Web Worker if available)
    const verificationResults = await this.verifyVoteEventsBatch(voteEvents);

    // Process each vote event
    // Sort by timestamp to ensure latest vote per user wins
    const sortedEvents = [...voteEvents].sort(
      (a, b) => a.created_at - b.created_at
    );

    for (const event of sortedEvents) {
      // Check verification result from batch
      const isSignatureValid = verificationResults.get(event.id) ?? false;
      
      if (!isSignatureValid) {
        console.warn('[Voting] Invalid signature for vote from:', event.pubkey.slice(0, 8));
        continue;
      }

      // Additional validation (kind, content, tags)
      if (event.kind !== NOSTR_KINDS.REACTION) {
        console.warn('[Voting] Invalid event kind for vote:', event.kind);
        continue;
      }

      if (event.content !== '+' && event.content !== '-') {
        console.warn('[Voting] Invalid vote content:', event.content);
        continue;
      }

      const postTag = event.tags.find(t => t[0] === 'e');
      if (!postTag || !postTag[1]) {
        console.warn('[Voting] Vote missing post reference');
        continue;
      }

      const vote = this.eventToVote(event, isSignatureValid);
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
    
    // Enforce cache limit (LRU eviction)
    this.enforceCacheLimit();

    console.log(`[Voting] Post ${postId.slice(0, 8)}: ${tally.uniqueVoters} unique voters, score ${tally.score}`);

    return tally;
  }

  /**
   * Batch fetch votes for multiple posts
   * More efficient than calling fetchVotesForPost multiple times
   * Reduces network round-trips by batching requests
   */
  async fetchVotesForPosts(postIds: string[]): Promise<Map<string, VoteTally>> {
    const results = new Map<string, VoteTally>();
    
    // Filter out cached posts
    const uncachedPostIds: string[] = [];
    const now = Date.now();
    
    for (const postId of postIds) {
      const cached = this.voteTallies.get(postId);
      if (cached && now - cached.lastUpdated < 30000) {
        results.set(postId, cached);
      } else {
        uncachedPostIds.push(postId);
      }
    }

    if (uncachedPostIds.length === 0) {
      return results;
    }

    // Batch fetch vote events for all uncached posts
    // Note: nostr-tools SimplePool can handle multiple queries efficiently
    const voteEventPromises = uncachedPostIds.map(postId => 
      nostrService.fetchVoteEvents(postId).catch(error => {
        console.error(`[Voting] Failed to fetch votes for post ${postId.slice(0, 8)}:`, error);
        return [];
      })
    );

    const voteEventArrays = await Promise.all(voteEventPromises);

    // Collect all events for batch verification
    const allEvents: NostrEvent[] = [];
    const eventToPostMap = new Map<string, string>(); // event.id -> postId
    
    for (let i = 0; i < uncachedPostIds.length; i++) {
      const postId = uncachedPostIds[i];
      const events = voteEventArrays[i];
      for (const event of events) {
        allEvents.push(event);
        eventToPostMap.set(event.id, postId);
      }
    }

    // Batch verify all events at once (using Web Worker if available)
    const verificationResults = await this.verifyVoteEventsBatch(allEvents);

    // Process each post's votes
    for (let i = 0; i < uncachedPostIds.length; i++) {
      const postId = uncachedPostIds[i];
      const voteEvents = voteEventArrays[i];

      const tally: VoteTally = {
        postId,
        upvotes: 0,
        downvotes: 0,
        score: 0,
        uniqueVoters: 0,
        votes: new Map(),
        lastUpdated: Date.now(),
      };

      // Sort by timestamp to ensure latest vote per user wins
      const sortedEvents = [...voteEvents].sort(
        (a, b) => a.created_at - b.created_at
      );

      for (const event of sortedEvents) {
        // Check verification result from batch
        const isSignatureValid = verificationResults.get(event.id) ?? false;
        
        if (!isSignatureValid) {
          console.warn('[Voting] Invalid signature for vote from:', event.pubkey.slice(0, 8));
          continue;
        }

        // Additional validation (kind, content, tags)
        if (event.kind !== NOSTR_KINDS.REACTION) {
          continue;
        }

        if (event.content !== '+' && event.content !== '-') {
          continue;
        }

        const postTag = event.tags.find(t => t[0] === 'e');
        if (!postTag || !postTag[1]) {
          continue;
        }

        const vote = this.eventToVote(event, isSignatureValid);
        if (!vote) continue;

        const existingVote = tally.votes.get(vote.voterPubkey);
        
        if (existingVote) {
          if (existingVote.direction === 'up') {
            tally.upvotes--;
          } else {
            tally.downvotes--;
          }
        } else {
          tally.uniqueVoters++;
        }

        if (vote.direction === 'up') {
          tally.upvotes++;
        } else {
          tally.downvotes++;
        }
        
        tally.votes.set(vote.voterPubkey, vote);
      }

      tally.score = tally.upvotes - tally.downvotes;
      this.voteTallies.set(postId, tally);
      results.set(postId, tally);
    }

    // Enforce cache limit after batch update
    this.enforceCacheLimit();

    return results;
  }

  /**
   * Batch fetch votes for multiple comments
   * Comments use the same vote mechanism as posts (kind 7 reactions)
   * This is an alias for fetchVotesForPosts since the underlying mechanism is identical
   */
  async fetchVotesForComments(commentIds: string[]): Promise<Map<string, VoteTally>> {
    return this.fetchVotesForPosts(commentIds);
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
    identity: NostrIdentity,
    postAuthorPubkey?: string
  ): Promise<VoteResult> {
    const userPubkey = identity.pubkey;
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
      // Build + sign + publish vote to Nostr
      const unsigned = nostrService.buildVoteEvent(postId, direction, userPubkey, { postAuthorPubkey });
      const signed = await identityService.signEvent(unsigned);
      const event = await nostrService.publishSignedEvent(signed);
      
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
   * Get all of a user's comment votes (for restoring state)
   * Comments use the same vote tracking as posts
   */
  getUserCommentVotes(userPubkey: string): Map<string, 'up' | 'down'> {
    // Comment votes are tracked in the same userVotes map
    // since comments are just Nostr events like posts
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
    this.inFlightRequests.clear();
  }

  /**
   * Cleanup resources (call on app shutdown)
   */
  cleanup(): void {
    this.stopPeriodicCleanup();
    this.clearCache();
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

