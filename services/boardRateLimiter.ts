// ============================================
// BOARD RATE LIMITER
// ============================================
// Prevents spam board creation by limiting to 3 boards per pubkey per 24 hours

const STORAGE_KEY = 'bitboard_board_creation_log';
const MAX_BOARDS_PER_DAY = 3;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CreationRecord {
  pubkey: string;
  timestamp: number;
  boardId: string;
}

class BoardRateLimiter {
  private records: CreationRecord[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.records = JSON.parse(stored);
        // Clean up old records
        this.cleanup();
      }
    } catch (error) {
      console.error('[BoardRateLimiter] Failed to load:', error);
      this.records = [];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.records));
    } catch (error) {
      console.error('[BoardRateLimiter] Failed to save:', error);
    }
  }

  /**
   * Remove records older than the rate limit window
   */
  private cleanup(): void {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    this.records = this.records.filter(r => r.timestamp > cutoff);
    this.saveToStorage();
  }

  /**
   * Get recent board creations for a pubkey
   */
  getRecentCreations(pubkey: string): CreationRecord[] {
    this.cleanup();
    return this.records.filter(r => r.pubkey === pubkey);
  }

  /**
   * Check if a pubkey can create another board
   */
  canCreateBoard(pubkey: string): { allowed: boolean; remaining: number; resetAt: number | null } {
    this.cleanup();
    const recentCreations = this.getRecentCreations(pubkey);
    const count = recentCreations.length;
    const remaining = Math.max(0, MAX_BOARDS_PER_DAY - count);
    
    // Find the oldest creation to determine reset time
    let resetAt: number | null = null;
    if (count >= MAX_BOARDS_PER_DAY && recentCreations.length > 0) {
      const oldestTimestamp = Math.min(...recentCreations.map(r => r.timestamp));
      resetAt = oldestTimestamp + RATE_LIMIT_WINDOW_MS;
    }

    return {
      allowed: count < MAX_BOARDS_PER_DAY,
      remaining,
      resetAt,
    };
  }

  /**
   * Record a board creation
   */
  recordCreation(pubkey: string, boardId: string): void {
    this.cleanup();
    
    this.records.push({
      pubkey,
      boardId,
      timestamp: Date.now(),
    });
    
    this.saveToStorage();
    console.log(`[BoardRateLimiter] Recorded board creation for ${pubkey.slice(0, 8)}... (${this.getRecentCreations(pubkey).length}/${MAX_BOARDS_PER_DAY})`);
  }

  /**
   * Format remaining time until reset
   */
  formatResetTime(resetAt: number): string {
    const diff = resetAt - Date.now();
    if (diff <= 0) return 'now';

    const hours = Math.floor(diff / (60 * 60 * 1000));
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Get the max boards per day limit
   */
  getLimit(): number {
    return MAX_BOARDS_PER_DAY;
  }

  /**
   * Clear all records (for testing)
   */
  clearAll(): void {
    this.records = [];
    this.saveToStorage();
  }
}

export const boardRateLimiter = new BoardRateLimiter();

