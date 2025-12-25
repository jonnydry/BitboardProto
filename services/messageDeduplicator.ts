// ============================================
// MESSAGE DEDUPLICATOR SERVICE
// ============================================
// Prevents duplicate messages from appearing in the UI
// Adopted from BitChat's MessageDeduplicator.swift
//
// Features:
// - Efficient ring buffer with head pointer
// - Set-based O(1) lookup
// - Time-based expiry (5 minutes)
// - Count-based cap (1000 entries)
// - Memory-efficient compaction

// ============================================
// CONFIGURATION
// ============================================

export const DeduplicatorConfig = {
  MAX_AGE_MS: 5 * 60 * 1000,  // 5 minutes (matches BitChat)
  MAX_COUNT: 1000,            // Max entries to track
  CLEANUP_INTERVAL_MS: 60 * 1000, // Cleanup every minute
} as const;

// ============================================
// ENTRY TYPE
// ============================================

interface DeduplicatorEntry {
  messageId: string;
  timestamp: number;
}

// ============================================
// MESSAGE DEDUPLICATOR CLASS
// ============================================

class MessageDeduplicator {
  private entries: DeduplicatorEntry[] = [];
  private head: number = 0;
  private lookup: Set<string> = new Set();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startCleanup();
  }

  // ----------------------------------------
  // CORE METHODS
  // ----------------------------------------

  /**
   * Check if a message is a duplicate and add if not
   * @param messageId - Unique identifier for the message (e.g., Nostr event ID)
   * @returns true if duplicate, false if new
   */
  isDuplicate(messageId: string): boolean {
    this.cleanupOldEntries();

    // Check if already seen
    if (this.lookup.has(messageId)) {
      return true;
    }

    // Add new entry
    this.entries.push({
      messageId,
      timestamp: Date.now(),
    });
    this.lookup.add(messageId);

    // Soft-cap and advance head by a chunk to avoid O(n) shifting
    const activeCount = this.entries.length - this.head;
    if (activeCount > DeduplicatorConfig.MAX_COUNT) {
      const removeCount = Math.min(100, activeCount);
      for (let i = this.head; i < this.head + removeCount; i++) {
        this.lookup.delete(this.entries[i].messageId);
      }
      this.head += removeCount;

      // Periodically compact to reclaim memory
      if (this.head > this.entries.length / 2) {
        this.entries = this.entries.slice(this.head);
        this.head = 0;
      }
    }

    return false;
  }

  /**
   * Add an ID without checking (for tracking purposes)
   * @param messageId - Message ID to mark as processed
   */
  markProcessed(messageId: string): void {
    if (!this.lookup.has(messageId)) {
      this.entries.push({
        messageId,
        timestamp: Date.now(),
      });
      this.lookup.add(messageId);
    }
  }

  /**
   * Check if an ID exists without adding
   * @param messageId - Message ID to check
   */
  contains(messageId: string): boolean {
    return this.lookup.has(messageId);
  }

  /**
   * Clear all entries
   */
  reset(): void {
    this.entries = [];
    this.head = 0;
    this.lookup.clear();
  }

  /**
   * Get current count of tracked messages
   */
  getCount(): number {
    return this.entries.length - this.head;
  }

  // ----------------------------------------
  // CLEANUP
  // ----------------------------------------

  /**
   * Remove entries older than MAX_AGE_MS
   */
  private cleanupOldEntries(): void {
    const cutoff = Date.now() - DeduplicatorConfig.MAX_AGE_MS;

    // Remove old entries from the head
    while (this.head < this.entries.length && this.entries[this.head].timestamp < cutoff) {
      this.lookup.delete(this.entries[this.head].messageId);
      this.head++;
    }

    // Compact if needed
    if (this.head > 0 && this.head > this.entries.length / 2) {
      this.entries = this.entries.slice(this.head);
      this.head = 0;
    }
  }

  /**
   * Start periodic cleanup
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldEntries();
      
      // Shrink capacity if way over-allocated
      if (this.entries.length > 0 && this.entries.length < DeduplicatorConfig.MAX_COUNT / 2) {
        // Let the array naturally shrink on next operations
      }
    }, DeduplicatorConfig.CLEANUP_INTERVAL_MS);
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
}

// ============================================
// SPECIALIZED DEDUPLICATORS
// ============================================

/**
 * Deduplicator for Nostr events
 * Tracks event IDs to prevent duplicate posts/comments
 */
class NostrEventDeduplicator extends MessageDeduplicator {
  /**
   * Check if a Nostr event is a duplicate
   * @param eventId - Nostr event ID (64 hex chars)
   */
  isEventDuplicate(eventId: string): boolean {
    return this.isDuplicate(eventId);
  }

  /**
   * Check if a post is a duplicate based on content hash
   * Useful for detecting reposts even with different event IDs
   * @param contentHash - Hash of post content
   */
  isContentDuplicate(contentHash: string): boolean {
    return this.isDuplicate(`content:${contentHash}`);
  }
}

/**
 * Deduplicator for votes/reactions
 * Tracks user+post combinations to prevent double voting
 */
class VoteDeduplicator extends MessageDeduplicator {
  /**
   * Check if a vote is a duplicate
   * @param userId - User's public key
   * @param postId - Post's event ID
   */
  isVoteDuplicate(userId: string, postId: string): boolean {
    const key = `vote:${userId}:${postId}`;
    return this.isDuplicate(key);
  }

  /**
   * Mark a vote as processed
   */
  markVoteProcessed(userId: string, postId: string): void {
    const key = `vote:${userId}:${postId}`;
    this.markProcessed(key);
  }
}

// ============================================
// EXPORTS
// ============================================

// Export singleton instances for different use cases
export const nostrEventDeduplicator = new NostrEventDeduplicator();
export const voteDeduplicator = new VoteDeduplicator();

// Export class for custom instances
export { MessageDeduplicator, NostrEventDeduplicator, VoteDeduplicator };






