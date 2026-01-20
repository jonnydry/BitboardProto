// ============================================
// WEB OF TRUST SERVICE
// ============================================
// Calculates trust scores based on follow graph distance.
// Used for spam filtering without centralized moderation.
//
// Key concepts:
// - Distance 0: Self (the user)
// - Distance 1: Direct follows (people you follow)
// - Distance 2: Friends of friends (people your follows follow)
// - Distance N+: Further degrees of separation
//
// Trust decays with distance - closer connections are more trusted.

import { type Event as NostrEvent } from 'nostr-tools';
import { type WoTScore, NOSTR_KINDS } from '../types';
import { nostrService } from './nostr/NostrService';
import { logger } from './loggingService';

// ============================================
// CONSTANTS
// ============================================

const WOT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_GRAPH_DEPTH = 3; // How many hops to traverse
const MAX_FOLLOWS_PER_LEVEL = 500; // Limit to prevent explosion
const TRUST_DECAY_FACTOR = 0.5; // Trust halves with each hop

// ============================================
// WOT SERVICE CLASS
// ============================================

class WoTService {
  // Cache of contact lists (pubkey -> followed pubkeys)
  private contactListCache: Map<string, { follows: string[]; timestamp: number }> = new Map();
  
  // Cache of computed WoT scores for a given root pubkey
  private wotCache: Map<string, { scores: Map<string, WoTScore>; timestamp: number }> = new Map();
  
  // Track in-flight requests
  private inFlightRequests: Map<string, Promise<Map<string, WoTScore>>> = new Map();

  // The current user's pubkey (set when identity is established)
  private userPubkey: string | null = null;

  // ----------------------------------------
  // INITIALIZATION
  // ----------------------------------------

  /**
   * Set the current user's pubkey for WoT calculations
   */
  setUserPubkey(pubkey: string | null): void {
    if (this.userPubkey !== pubkey) {
      this.userPubkey = pubkey;
      // Clear WoT cache when user changes
      this.wotCache.clear();
    }
  }

  /**
   * Get the current user's pubkey
   */
  getUserPubkey(): string | null {
    return this.userPubkey;
  }

  // ----------------------------------------
  // CONTACT LIST FETCHING
  // ----------------------------------------

  /**
   * Fetch a user's contact list (who they follow)
   */
  async fetchContactList(pubkey: string): Promise<string[]> {
    // Check cache
    const cached = this.contactListCache.get(pubkey);
    if (cached && Date.now() - cached.timestamp < WOT_CACHE_TTL_MS) {
      return cached.follows;
    }

    try {
      const event = await nostrService.fetchContactListEvent(pubkey);
      if (!event) {
        this.contactListCache.set(pubkey, { follows: [], timestamp: Date.now() });
        return [];
      }

      const follows = nostrService.parseContactList(event);
      this.contactListCache.set(pubkey, { follows, timestamp: Date.now() });
      return follows;
    } catch (error) {
      logger.error('WoT', `Failed to fetch contact list for ${pubkey.slice(0, 8)}`, error);
      return [];
    }
  }

  /**
   * Batch fetch contact lists for multiple pubkeys
   */
  async fetchContactLists(pubkeys: string[]): Promise<Map<string, string[]>> {
    const results = new Map<string, string[]>();
    const uncached: string[] = [];

    // Check cache first
    for (const pubkey of pubkeys) {
      const cached = this.contactListCache.get(pubkey);
      if (cached && Date.now() - cached.timestamp < WOT_CACHE_TTL_MS) {
        results.set(pubkey, cached.follows);
      } else {
        uncached.push(pubkey);
      }
    }

    if (uncached.length === 0) {
      return results;
    }

    // Fetch uncached in parallel (with limit)
    const BATCH_SIZE = 20;
    for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
      const batch = uncached.slice(i, i + BATCH_SIZE);
      const promises = batch.map(pk => this.fetchContactList(pk));
      const lists = await Promise.all(promises);
      
      for (let j = 0; j < batch.length; j++) {
        results.set(batch[j], lists[j]);
      }
    }

    return results;
  }

  // ----------------------------------------
  // WEB OF TRUST COMPUTATION
  // ----------------------------------------

  /**
   * Build the Web of Trust graph starting from a root pubkey
   * Returns a map of pubkey -> WoTScore
   */
  async buildWoTGraph(rootPubkey: string, maxDepth: number = MAX_GRAPH_DEPTH): Promise<Map<string, WoTScore>> {
    // Check cache
    const cacheKey = `${rootPubkey}:${maxDepth}`;
    const cached = this.wotCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < WOT_CACHE_TTL_MS) {
      return cached.scores;
    }

    // Check in-flight
    const inFlight = this.inFlightRequests.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    // Build graph
    const request = this._buildWoTGraphInternal(rootPubkey, maxDepth);
    this.inFlightRequests.set(cacheKey, request);

    try {
      const scores = await request;
      this.wotCache.set(cacheKey, { scores, timestamp: Date.now() });
      return scores;
    } finally {
      this.inFlightRequests.delete(cacheKey);
    }
  }

  private async _buildWoTGraphInternal(
    rootPubkey: string,
    maxDepth: number
  ): Promise<Map<string, WoTScore>> {
    const scores = new Map<string, WoTScore>();
    
    // Add self at distance 0
    scores.set(rootPubkey, {
      pubkey: rootPubkey,
      distance: 0,
      score: 1.0, // Full trust for self
      followedBy: [],
    });

    // BFS traversal of follow graph
    let currentLevel: string[] = [rootPubkey];
    let depth = 0;

    while (depth < maxDepth && currentLevel.length > 0) {
      depth++;
      const nextLevel: string[] = [];
      
      // Fetch contact lists for current level
      const contactLists = await this.fetchContactLists(currentLevel);
      
      for (const [followerPubkey, follows] of contactLists) {
        // Limit follows per person to prevent explosion
        const limitedFollows = follows.slice(0, MAX_FOLLOWS_PER_LEVEL);
        
        for (const followedPubkey of limitedFollows) {
          const existing = scores.get(followedPubkey);
          
          if (existing) {
            // Already seen at equal or closer distance
            // Add to followedBy if not already there
            if (!existing.followedBy.includes(followerPubkey)) {
              existing.followedBy.push(followerPubkey);
            }
          } else {
            // New pubkey discovered
            const score = Math.pow(TRUST_DECAY_FACTOR, depth);
            scores.set(followedPubkey, {
              pubkey: followedPubkey,
              distance: depth,
              score,
              followedBy: [followerPubkey],
            });
            nextLevel.push(followedPubkey);
          }
        }
      }

      currentLevel = nextLevel;
      
      // Log progress
      logger.debug('WoT', `Depth ${depth}: discovered ${nextLevel.length} new pubkeys, total ${scores.size}`);
    }

    logger.info('WoT', `Built WoT graph with ${scores.size} pubkeys up to depth ${maxDepth}`);
    return scores;
  }

  // ----------------------------------------
  // TRUST QUERIES
  // ----------------------------------------

  /**
   * Get the WoT score for a specific pubkey
   * Returns null if pubkey is not in the trust graph
   */
  async getScore(pubkey: string): Promise<WoTScore | null> {
    if (!this.userPubkey) {
      return null;
    }

    const graph = await this.buildWoTGraph(this.userPubkey);
    return graph.get(pubkey) || null;
  }

  /**
   * Get the trust distance to a pubkey
   * Returns Infinity if not in the trust graph
   */
  async getDistance(pubkey: string): Promise<number> {
    const score = await this.getScore(pubkey);
    return score?.distance ?? Infinity;
  }

  /**
   * Check if a pubkey is within a certain trust distance
   */
  async isWithinDistance(pubkey: string, maxDistance: number): Promise<boolean> {
    const distance = await this.getDistance(pubkey);
    return distance <= maxDistance;
  }

  /**
   * Check if a pubkey is trusted (within default distance of 2)
   */
  async isTrusted(pubkey: string, maxDistance: number = 2): Promise<boolean> {
    return this.isWithinDistance(pubkey, maxDistance);
  }

  /**
   * Filter a list of pubkeys to only those within trust distance
   */
  async filterTrusted(pubkeys: string[], maxDistance: number = 2): Promise<string[]> {
    if (!this.userPubkey) {
      return pubkeys; // No filtering if no user
    }

    const graph = await this.buildWoTGraph(this.userPubkey);
    return pubkeys.filter(pk => {
      const score = graph.get(pk);
      return score && score.distance <= maxDistance;
    });
  }

  /**
   * Get scores for multiple pubkeys (batch)
   */
  async getScores(pubkeys: string[]): Promise<Map<string, WoTScore>> {
    if (!this.userPubkey) {
      return new Map();
    }

    const graph = await this.buildWoTGraph(this.userPubkey);
    const results = new Map<string, WoTScore>();
    
    for (const pubkey of pubkeys) {
      const score = graph.get(pubkey);
      if (score) {
        results.set(pubkey, score);
      }
    }

    return results;
  }

  // ----------------------------------------
  // FILTERING FOR FEEDS
  // ----------------------------------------

  /**
   * Filter posts by WoT score
   * Only returns posts from trusted authors
   */
  async filterPostsByWoT<T extends { authorPubkey?: string }>(
    posts: T[],
    maxDistance: number = 2
  ): Promise<T[]> {
    if (!this.userPubkey) {
      return posts; // No filtering if no user
    }

    const authorPubkeys = posts
      .map(p => p.authorPubkey)
      .filter((pk): pk is string => !!pk);
    
    const uniquePubkeys = [...new Set(authorPubkeys)];
    const scores = await this.getScores(uniquePubkeys);

    return posts.filter(post => {
      if (!post.authorPubkey) return true; // Allow posts without author
      const score = scores.get(post.authorPubkey);
      return score && score.distance <= maxDistance;
    });
  }

  /**
   * Sort posts by WoT score (more trusted first)
   */
  async sortPostsByWoT<T extends { authorPubkey?: string }>(posts: T[]): Promise<T[]> {
    if (!this.userPubkey) {
      return posts;
    }

    const authorPubkeys = posts
      .map(p => p.authorPubkey)
      .filter((pk): pk is string => !!pk);
    
    const uniquePubkeys = [...new Set(authorPubkeys)];
    const scores = await this.getScores(uniquePubkeys);

    return [...posts].sort((a, b) => {
      const scoreA = a.authorPubkey ? scores.get(a.authorPubkey)?.score ?? 0 : 0;
      const scoreB = b.authorPubkey ? scores.get(b.authorPubkey)?.score ?? 0 : 0;
      return scoreB - scoreA; // Higher score first
    });
  }

  // ----------------------------------------
  // MUTUAL FOLLOW DETECTION
  // ----------------------------------------

  /**
   * Check if two pubkeys mutually follow each other
   */
  async areMutualFollows(pubkeyA: string, pubkeyB: string): Promise<boolean> {
    const [followsA, followsB] = await Promise.all([
      this.fetchContactList(pubkeyA),
      this.fetchContactList(pubkeyB),
    ]);

    return followsA.includes(pubkeyB) && followsB.includes(pubkeyA);
  }

  /**
   * Get mutual follows between user and another pubkey
   */
  async getMutualFollows(pubkey: string): Promise<string[]> {
    if (!this.userPubkey) {
      return [];
    }

    const [userFollows, theirFollows] = await Promise.all([
      this.fetchContactList(this.userPubkey),
      this.fetchContactList(pubkey),
    ]);

    // Find intersection
    const theirFollowsSet = new Set(theirFollows);
    return userFollows.filter(pk => theirFollowsSet.has(pk));
  }

  // ----------------------------------------
  // CACHE MANAGEMENT
  // ----------------------------------------

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.contactListCache.clear();
    this.wotCache.clear();
    this.inFlightRequests.clear();
  }

  /**
   * Clear WoT cache only (useful when follows change)
   */
  clearWoTCache(): void {
    this.wotCache.clear();
  }

  /**
   * Invalidate cache for a specific pubkey
   */
  invalidatePubkey(pubkey: string): void {
    this.contactListCache.delete(pubkey);
    // Clear WoT cache since it might be affected
    this.wotCache.clear();
  }

  /**
   * Get cache stats for debugging
   */
  getCacheStats(): {
    contactListCacheSize: number;
    wotCacheSize: number;
  } {
    return {
      contactListCacheSize: this.contactListCache.size,
      wotCacheSize: this.wotCache.size,
    };
  }
}

// Export singleton
export const wotService = new WoTService();
export { WoTService };
