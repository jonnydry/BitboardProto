// ============================================
// RATE LIMITER SERVICE
// ============================================
// Token bucket rate limiting for BitBoard
// Prevents spam, DoS attacks, and abuse
// Adopted from BitChat's MessageRateLimiter.swift and NoiseRateLimiter.swift

// ============================================
// TOKEN BUCKET IMPLEMENTATION
// ============================================

interface TokenBucket {
  capacity: number;
  tokens: number;
  refillPerSec: number;
  lastRefill: number; // timestamp in ms
}

/**
 * Creates a new token bucket
 */
function createBucket(capacity: number, refillPerSec: number): TokenBucket {
  return {
    capacity,
    tokens: capacity,
    refillPerSec,
    lastRefill: Date.now(),
  };
}

/**
 * Attempts to consume tokens from a bucket
 * Returns true if allowed, false if rate limited
 */
function consumeToken(bucket: TokenBucket, cost: number = 1): boolean {
  const now = Date.now();
  const deltaSeconds = (now - bucket.lastRefill) / 1000;

  // Refill tokens based on time elapsed
  if (deltaSeconds > 0) {
    bucket.tokens = Math.min(
      bucket.capacity,
      bucket.tokens + deltaSeconds * bucket.refillPerSec
    );
    bucket.lastRefill = now;
  }

  // Check if we have enough tokens
  if (bucket.tokens >= cost) {
    bucket.tokens -= cost;
    return true;
  }

  return false;
}

// ============================================
// RATE LIMITER CONFIGURATIONS
// ============================================

export const RateLimitConfig = {
  // Per-user posting limits
  POST_CAPACITY: 5,           // Max burst of 5 posts
  POST_REFILL_PER_SEC: 0.1,   // 1 post per 10 seconds sustained

  // Per-user voting limits
  VOTE_CAPACITY: 20,          // Max burst of 20 votes
  VOTE_REFILL_PER_SEC: 1,     // 1 vote per second sustained

  // Per-user comment limits
  COMMENT_CAPACITY: 10,       // Max burst of 10 comments
  COMMENT_REFILL_PER_SEC: 0.5, // 1 comment per 2 seconds sustained

  // Content-based limits (prevent duplicate content spam)
  CONTENT_CAPACITY: 3,        // Max 3 identical content submissions
  CONTENT_REFILL_PER_SEC: 0.5, // Refill slowly

  // Global limits (across all users)
  GLOBAL_POST_CAPACITY: 100,
  GLOBAL_POST_REFILL_PER_SEC: 10,

  // Nostr relay limits
  RELAY_MESSAGE_CAPACITY: 100,
  RELAY_MESSAGE_REFILL_PER_SEC: 50,
} as const;

// ============================================
// RATE LIMITER CLASS
// ============================================

class RateLimiter {
  // Per-user buckets
  private userPostBuckets: Map<string, TokenBucket> = new Map();
  private userVoteBuckets: Map<string, TokenBucket> = new Map();
  private userCommentBuckets: Map<string, TokenBucket> = new Map();

  // Content-based buckets (key = hash of content)
  private contentBuckets: Map<string, TokenBucket> = new Map();

  // Global buckets
  private globalPostBucket: TokenBucket;
  private globalRelayBucket: TokenBucket;

  // Cleanup interval
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Initialize global buckets
    this.globalPostBucket = createBucket(
      RateLimitConfig.GLOBAL_POST_CAPACITY,
      RateLimitConfig.GLOBAL_POST_REFILL_PER_SEC
    );
    this.globalRelayBucket = createBucket(
      RateLimitConfig.RELAY_MESSAGE_CAPACITY,
      RateLimitConfig.RELAY_MESSAGE_REFILL_PER_SEC
    );

    // Start periodic cleanup of stale buckets
    this.startCleanup();
  }

  // ----------------------------------------
  // POST RATE LIMITING
  // ----------------------------------------

  /**
   * Check if a user can create a post
   * @param userId - User identifier (pubkey or session ID)
   * @param contentHash - Optional hash of content to prevent duplicates
   */
  allowPost(userId: string, contentHash?: string): boolean {
    // Check global limit first
    if (!consumeToken(this.globalPostBucket)) {
      console.warn('[RateLimiter] Global post rate limit exceeded');
      return false;
    }

    // Get or create user bucket
    let userBucket = this.userPostBuckets.get(userId);
    if (!userBucket) {
      userBucket = createBucket(
        RateLimitConfig.POST_CAPACITY,
        RateLimitConfig.POST_REFILL_PER_SEC
      );
      this.userPostBuckets.set(userId, userBucket);
    }

    // Check user limit
    if (!consumeToken(userBucket)) {
      console.warn(`[RateLimiter] User post rate limit exceeded for ${userId.slice(0, 8)}...`);
      return false;
    }

    // Check content-based limit if provided
    if (contentHash) {
      let contentBucket = this.contentBuckets.get(contentHash);
      if (!contentBucket) {
        contentBucket = createBucket(
          RateLimitConfig.CONTENT_CAPACITY,
          RateLimitConfig.CONTENT_REFILL_PER_SEC
        );
        this.contentBuckets.set(contentHash, contentBucket);
      }

      if (!consumeToken(contentBucket)) {
        console.warn('[RateLimiter] Duplicate content rate limit exceeded');
        return false;
      }
    }

    return true;
  }

  // ----------------------------------------
  // VOTE RATE LIMITING
  // ----------------------------------------

  /**
   * Check if a user can vote
   * @param userId - User identifier
   */
  allowVote(userId: string): boolean {
    let userBucket = this.userVoteBuckets.get(userId);
    if (!userBucket) {
      userBucket = createBucket(
        RateLimitConfig.VOTE_CAPACITY,
        RateLimitConfig.VOTE_REFILL_PER_SEC
      );
      this.userVoteBuckets.set(userId, userBucket);
    }

    if (!consumeToken(userBucket)) {
      console.warn(`[RateLimiter] User vote rate limit exceeded for ${userId.slice(0, 8)}...`);
      return false;
    }

    return true;
  }

  // ----------------------------------------
  // COMMENT RATE LIMITING
  // ----------------------------------------

  /**
   * Check if a user can comment
   * @param userId - User identifier
   * @param contentHash - Optional hash of content to prevent duplicates
   */
  allowComment(userId: string, contentHash?: string): boolean {
    let userBucket = this.userCommentBuckets.get(userId);
    if (!userBucket) {
      userBucket = createBucket(
        RateLimitConfig.COMMENT_CAPACITY,
        RateLimitConfig.COMMENT_REFILL_PER_SEC
      );
      this.userCommentBuckets.set(userId, userBucket);
    }

    if (!consumeToken(userBucket)) {
      console.warn(`[RateLimiter] User comment rate limit exceeded for ${userId.slice(0, 8)}...`);
      return false;
    }

    // Check content-based limit if provided
    if (contentHash) {
      let contentBucket = this.contentBuckets.get(contentHash);
      if (!contentBucket) {
        contentBucket = createBucket(
          RateLimitConfig.CONTENT_CAPACITY,
          RateLimitConfig.CONTENT_REFILL_PER_SEC
        );
        this.contentBuckets.set(contentHash, contentBucket);
      }

      if (!consumeToken(contentBucket)) {
        console.warn('[RateLimiter] Duplicate content rate limit exceeded');
        return false;
      }
    }

    return true;
  }

  // ----------------------------------------
  // RELAY MESSAGE RATE LIMITING
  // ----------------------------------------

  /**
   * Check if we can send a message to Nostr relays
   */
  allowRelayMessage(): boolean {
    if (!consumeToken(this.globalRelayBucket)) {
      console.warn('[RateLimiter] Relay message rate limit exceeded');
      return false;
    }
    return true;
  }

  // ----------------------------------------
  // UTILITY METHODS
  // ----------------------------------------

  /**
   * Generate a simple hash of content for deduplication
   */
  hashContent(content: string): string {
    // Simple DJB2 hash (matches BitChat's String+DJB2.swift approach)
    let hash = 5381;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) + hash) ^ content.charCodeAt(i);
      hash = hash >>> 0; // Convert to unsigned 32-bit
    }
    return hash.toString(16);
  }

  /**
   * Get remaining tokens for a user's post bucket
   */
  getPostTokens(userId: string): number {
    const bucket = this.userPostBuckets.get(userId);
    if (!bucket) return RateLimitConfig.POST_CAPACITY;
    
    // Refill before reporting
    const now = Date.now();
    const deltaSeconds = (now - bucket.lastRefill) / 1000;
    const currentTokens = Math.min(
      bucket.capacity,
      bucket.tokens + deltaSeconds * bucket.refillPerSec
    );
    return Math.floor(currentTokens);
  }

  /**
   * Get remaining tokens for a user's vote bucket
   */
  getVoteTokens(userId: string): number {
    const bucket = this.userVoteBuckets.get(userId);
    if (!bucket) return RateLimitConfig.VOTE_CAPACITY;
    
    const now = Date.now();
    const deltaSeconds = (now - bucket.lastRefill) / 1000;
    const currentTokens = Math.min(
      bucket.capacity,
      bucket.tokens + deltaSeconds * bucket.refillPerSec
    );
    return Math.floor(currentTokens);
  }

  /**
   * Reset rate limits for a specific user
   */
  resetUser(userId: string): void {
    this.userPostBuckets.delete(userId);
    this.userVoteBuckets.delete(userId);
    this.userCommentBuckets.delete(userId);
  }

  /**
   * Reset all rate limits
   */
  resetAll(): void {
    this.userPostBuckets.clear();
    this.userVoteBuckets.clear();
    this.userCommentBuckets.clear();
    this.contentBuckets.clear();
    
    // Reset global buckets
    this.globalPostBucket = createBucket(
      RateLimitConfig.GLOBAL_POST_CAPACITY,
      RateLimitConfig.GLOBAL_POST_REFILL_PER_SEC
    );
    this.globalRelayBucket = createBucket(
      RateLimitConfig.RELAY_MESSAGE_CAPACITY,
      RateLimitConfig.RELAY_MESSAGE_REFILL_PER_SEC
    );
  }

  // ----------------------------------------
  // CLEANUP
  // ----------------------------------------

  /**
   * Start periodic cleanup of stale buckets
   */
  private startCleanup(): void {
    // Clean up every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Stop cleanup interval
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Remove stale buckets that haven't been used recently
   */
  private cleanup(): void {
    const now = Date.now();
    const staleThreshold = 10 * 60 * 1000; // 10 minutes

    // Helper to clean a map of buckets
    const cleanMap = (map: Map<string, TokenBucket>) => {
      for (const [key, bucket] of map.entries()) {
        if (now - bucket.lastRefill > staleThreshold && bucket.tokens >= bucket.capacity) {
          map.delete(key);
        }
      }
    };

    cleanMap(this.userPostBuckets);
    cleanMap(this.userVoteBuckets);
    cleanMap(this.userCommentBuckets);
    cleanMap(this.contentBuckets);

    console.log('[RateLimiter] Cleanup complete');
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter();






