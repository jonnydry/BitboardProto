import { logger } from './loggingService';

const STORAGE_KEY = 'bitboard_seed_creation_log';
const MAX_SEEDS_PER_DAY = 5;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

interface SeedRecord {
  pubkey: string;
  timestamp: number;
  sourceEventId: string;
  destinationBoardId: string;
}

class SeedRateLimiter {
  private records: SeedRecord[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.records = JSON.parse(stored);
        this.cleanup();
      }
    } catch (error) {
      logger.error('SeedRateLimiter', 'Failed to load', error);
      this.records = [];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.records));
    } catch (error) {
      logger.error('SeedRateLimiter', 'Failed to save', error);
    }
  }

  private cleanup(): void {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    this.records = this.records.filter((record) => record.timestamp > cutoff);
    this.saveToStorage();
  }

  getRecentSeeds(pubkey: string): SeedRecord[] {
    this.cleanup();
    return this.records.filter((record) => record.pubkey === pubkey);
  }

  canSeed(pubkey: string): { allowed: boolean; remaining: number; resetAt: number | null } {
    const recentSeeds = this.getRecentSeeds(pubkey);
    const count = recentSeeds.length;
    const remaining = Math.max(0, MAX_SEEDS_PER_DAY - count);
    let resetAt: number | null = null;

    if (count >= MAX_SEEDS_PER_DAY && recentSeeds.length > 0) {
      const oldestTimestamp = Math.min(...recentSeeds.map((record) => record.timestamp));
      resetAt = oldestTimestamp + RATE_LIMIT_WINDOW_MS;
    }

    return {
      allowed: count < MAX_SEEDS_PER_DAY,
      remaining,
      resetAt,
    };
  }

  recordSeed(pubkey: string, sourceEventId: string, destinationBoardId: string): void {
    this.cleanup();
    this.records.push({
      pubkey,
      timestamp: Date.now(),
      sourceEventId,
      destinationBoardId,
    });
    this.saveToStorage();
  }

  formatResetTime(resetAt: number): string {
    const diff = resetAt - Date.now();
    if (diff <= 0) return 'now';

    const hours = Math.floor(diff / (60 * 60 * 1000));
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  getLimit(): number {
    return MAX_SEEDS_PER_DAY;
  }

  clearAll(): void {
    this.records = [];
    this.saveToStorage();
  }
}

export const seedRateLimiter = new SeedRateLimiter();
