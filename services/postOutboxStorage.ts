import type { Post } from '../types';
import { logger } from './loggingService';

// ─── Outbox (pending / failed) ───────────────────────────────────────────────
// Posts waiting to be published or that failed. TTL: 7 days.
const OUTBOX_KEY = 'bitboard_post_outbox_v1';
const OUTBOX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Own-posts cache (synced) ─────────────────────────────────────────────────
// The user's own published posts, kept so they survive page reloads even when
// the Nostr fetch is slow or a relay is temporarily unresponsive. TTL: 30 days,
// max 100 posts.
const OWN_POSTS_KEY = 'bitboard_own_posts_v1';
const OWN_POSTS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const OWN_POSTS_MAX_COUNT = 100;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadRaw(key: string): Post[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p) => p && typeof p === 'object' && typeof (p as Post).id === 'string',
    ) as Post[];
  } catch (e) {
    logger.warn('postOutbox', `Failed to read ${key}`, e);
    return [];
  }
}

function saveRaw(key: string, posts: Post[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(posts));
  } catch (e) {
    logger.warn('postOutbox', `Failed to write ${key}`, e);
  }
}

function pruneByAge(posts: Post[], maxAgeMs: number): Post[] {
  const cutoff = Date.now() - maxAgeMs;
  return posts.filter((p) => (p.timestamp ?? 0) >= cutoff);
}

// ─── Outbox API (pending / failed) ───────────────────────────────────────────

/** Stores pending or failed posts so they can be retried after a reload. */
export function postOutboxStorageUpsert(post: Post) {
  if (post.syncStatus !== 'pending' && post.syncStatus !== 'failed') return;
  const all = pruneByAge(loadRaw(OUTBOX_KEY), OUTBOX_MAX_AGE_MS);
  const without = all.filter(
    (p) =>
      p.id !== post.id &&
      p.nostrEventId !== post.nostrEventId &&
      p.id !== post.nostrEventId,
  );
  saveRaw(OUTBOX_KEY, [post, ...without]);
}

export function postOutboxStorageRemoveMatching(...ids: string[]) {
  const idSet = new Set(ids.filter(Boolean));
  if (idSet.size === 0) return;
  const all = loadRaw(OUTBOX_KEY);
  const next = all.filter(
    (p) => !idSet.has(p.id) && !(p.nostrEventId && idSet.has(p.nostrEventId)),
  );
  saveRaw(OUTBOX_KEY, next);
}

export function postOutboxStorageReadAll(): Post[] {
  return pruneByAge(loadRaw(OUTBOX_KEY), OUTBOX_MAX_AGE_MS);
}

// ─── Own-posts cache API (synced) ────────────────────────────────────────────

/**
 * Persist the user's own post after a successful Nostr publish.
 * Called with syncStatus === 'synced' and a nostrEventId set.
 */
export function ownPostsCacheUpsert(post: Post) {
  if (post.syncStatus !== 'synced' || !post.nostrEventId) return;
  const all = pruneByAge(loadRaw(OWN_POSTS_KEY), OWN_POSTS_MAX_AGE_MS);
  // De-duplicate by Nostr event ID
  const without = all.filter(
    (p) => p.nostrEventId !== post.nostrEventId && p.id !== post.nostrEventId,
  );
  // Prepend and cap
  const next = [post, ...without].slice(0, OWN_POSTS_MAX_COUNT);
  saveRaw(OWN_POSTS_KEY, next);
}

/** Remove an own post from the cache (e.g. on delete). */
export function ownPostsCacheRemove(...ids: string[]) {
  const idSet = new Set(ids.filter(Boolean));
  if (idSet.size === 0) return;
  const all = loadRaw(OWN_POSTS_KEY);
  const next = all.filter(
    (p) => !idSet.has(p.id) && !(p.nostrEventId && idSet.has(p.nostrEventId)),
  );
  saveRaw(OWN_POSTS_KEY, next);
}

/** Read all cached own posts (pruned by TTL). */
export function ownPostsCacheReadAll(): Post[] {
  return pruneByAge(loadRaw(OWN_POSTS_KEY), OWN_POSTS_MAX_AGE_MS);
}
