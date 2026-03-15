/**
 * Shared types and utilities for Nostr query modules.
 * Eliminates duplication of QueryDeps, SubscriptionDeps, dedupeLatestByDTag, etc.
 */
import type { Event as NostrEvent, SimplePool } from 'nostr-tools';

// ----------------------------------------
// Shared dependency interfaces
// ----------------------------------------

export interface QueryDeps {
  pool: SimplePool;
  getReadRelays: () => string[];
}

export interface SubscriptionDeps extends QueryDeps {
  subscriptions: Map<string, { unsub: () => void }>;
  nextSubId: (prefix: string) => string;
}

// ----------------------------------------
// Shared utility functions
// ----------------------------------------

/**
 * Return the latest event from a list, by `created_at`.
 * Does NOT mutate the input array (unlike `Array.sort` in-place).
 */
export function latestEvent(events: NostrEvent[]): NostrEvent | null {
  if (events.length === 0) return null;
  return [...events].sort((a, b) => b.created_at - a.created_at)[0];
}

/**
 * Deduplicate replaceable events by their `d` tag, keeping only the latest per d-tag.
 * Returns results sorted newest-first.
 */
export function dedupeLatestByDTag(events: NostrEvent[]): NostrEvent[] {
  const byDTag = new Map<string, NostrEvent>();
  for (const event of events) {
    const dTag = event.tags.find((tag) => tag[0] === 'd')?.[1] || event.id;
    const existing = byDTag.get(dTag);
    if (!existing || event.created_at > existing.created_at) {
      byDTag.set(dTag, event);
    }
  }
  return Array.from(byDTag.values()).sort((a, b) => b.created_at - a.created_at);
}

/**
 * Trending sort formula — shared between useAppDerivedData and AppContext.
 * Higher score for newer posts with more engagement.
 */
export function trendingScore(
  score: number,
  commentCount: number,
  timestamp: number,
  now: number,
): number {
  const HOUR = 1000 * 60 * 60;
  const ageHours = (now - timestamp) / HOUR;
  return (score + commentCount * 2) / Math.pow(ageHours + 2, 1.5);
}
