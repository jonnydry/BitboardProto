// ============================================
// BLENDED FEED SERVICE
// ============================================
// Cold-start liveliness: when a feed scope has too few native BitBoard posts,
// blend in ranked external Nostr content from nostrDiscoveryService so the
// feed is never empty. Blended posts are clearly marked (source: 'nostr',
// blendedInto: <scope>) and render in a separate feed section with a seed CTA
// — seeding them into a board is the growth loop that produces native posts.
//
// Blended posts are ephemeral view data: they must never be written to the
// own-posts cache, the outbox, or the offline posts cache.

import type { Board, Post } from '../types';
import { nostrDiscoveryService } from './nostrDiscoveryService';
import { logger } from './loggingService';

/** Native post count at or below which we blend external content in. */
const SPARSE_THRESHOLD = 10;
/** How many blended posts to show at most. */
const BLEND_LIMIT = 20;
/** Cache TTL — discovery queries are expensive (multi-relay + zap lookups). */
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_STORAGE_KEY = 'bitboard_blended_feed_cache_v1';

export const GLOBAL_BLEND_SCOPE = 'global';

interface CacheEntry {
  fetchedAt: number;
  posts: Post[];
}

/**
 * Derive a discovery search query from a board so blended content roughly
 * matches the board's topic. Global scope uses no query (general trending).
 */
export function boardDiscoveryQuery(board: Board): string | undefined {
  // Board names like "TECH", "DEV", "NOSTR" are already good search terms.
  const name = board.name?.trim();
  if (!name) return undefined;
  // Skip meta boards where a name query would surface junk.
  if (/^(system|meta|random)$/i.test(name)) return undefined;
  return name.toLowerCase();
}

class BlendedFeedService {
  private cache = new Map<string, CacheEntry>();
  private inFlight = new Map<string, Promise<Post[]>>();

  constructor() {
    this.loadPersistedCache();
  }

  /** True when a scope's native post count warrants blending. */
  isSparse(nativeCount: number): boolean {
    return nativeCount <= SPARSE_THRESHOLD;
  }

  /**
   * Fetch blended external posts for a feed scope.
   * @param scopeKey  'global' or a board id — used as cache key and stamped
   *                  on each post as `blendedInto`.
   * @param board     The active board (null for global feed).
   * @param nativePosts Native posts already in the scope (for dedupe).
   */
  async fetchBlendedPosts(
    scopeKey: string,
    board: Board | null,
    nativePosts: Post[],
  ): Promise<Post[]> {
    const cached = this.cache.get(scopeKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return this.dedupe(cached.posts, nativePosts);
    }

    const existing = this.inFlight.get(scopeKey);
    if (existing) {
      return existing.then((posts) => this.dedupe(posts, nativePosts));
    }

    const request = this.fetchInternal(scopeKey, board);
    this.inFlight.set(scopeKey, request);
    request.finally(() => this.inFlight.delete(scopeKey));

    const posts = await request;
    return this.dedupe(posts, nativePosts);
  }

  private async fetchInternal(scopeKey: string, board: Board | null): Promise<Post[]> {
    try {
      const hashtag = board ? boardDiscoveryQuery(board) : undefined;
      // 'general' only: the community-approved pipeline adds several serial
      // relay round-trips (communities → approvals → samples) and dominates
      // wall time. Blending is about speed-to-first-content; the Discovery
      // browser still offers the full 'all' view.
      // Boards scope via a '#t' hashtag filter (works on every relay, unlike
      // NIP-50 search); zap tallies are skipped (~50s, ranking-only).
      let candidates = await nostrDiscoveryService.discoverSeedCandidates({
        timeWindow: '24h',
        hashtag,
        sourceFilter: 'general',
        limit: BLEND_LIMIT,
        skipZapSignals: true,
      });

      // Thin hashtag results → fall back to general trending so board feeds
      // still come alive; provenance chips keep the origin honest.
      if (hashtag && candidates.length < 3) {
        candidates = await nostrDiscoveryService.discoverSeedCandidates({
          timeWindow: '24h',
          sourceFilter: 'general',
          limit: BLEND_LIMIT,
          skipZapSignals: true,
        });
      }

      const posts = candidates.map((candidate) => ({
        ...candidate.post,
        blendedInto: scopeKey,
      }));

      this.cache.set(scopeKey, { fetchedAt: Date.now(), posts });
      this.persistCache();
      logger.debug('BlendedFeed', `Fetched ${posts.length} blended posts for scope ${scopeKey}`);
      return posts;
    } catch (error) {
      logger.warn('BlendedFeed', `Failed to fetch blended posts for ${scopeKey}`, error);
      // Serve stale cache over nothing.
      return this.cache.get(scopeKey)?.posts ?? [];
    }
  }

  /** Drop blended posts that duplicate native content (same Nostr event). */
  private dedupe(blended: Post[], nativePosts: Post[]): Post[] {
    const nativeIds = new Set<string>();
    for (const post of nativePosts) {
      nativeIds.add(post.id);
      if (post.nostrEventId) nativeIds.add(post.nostrEventId);
      // A native post seeded FROM an external note supersedes the original.
      if (post.seedSourceEventId) nativeIds.add(post.seedSourceEventId);
    }
    return blended.filter(
      (post) =>
        !nativeIds.has(post.id) && !(post.nostrEventId && nativeIds.has(post.nostrEventId)),
    );
  }

  /** Instant-render cache across reloads (localStorage, same TTL). */
  private loadPersistedCache(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(CACHE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
      const now = Date.now();
      for (const [key, entry] of Object.entries(parsed)) {
        if (
          entry &&
          typeof entry.fetchedAt === 'number' &&
          Array.isArray(entry.posts) &&
          now - entry.fetchedAt < CACHE_TTL_MS
        ) {
          this.cache.set(key, entry);
        }
      }
    } catch {
      // Corrupt cache — ignore, it rebuilds on next fetch
    }
  }

  private persistCache(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const obj: Record<string, CacheEntry> = {};
      for (const [key, entry] of this.cache.entries()) {
        obj[key] = entry;
      }
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // Quota — blending still works from memory
    }
  }

  clearCache(): void {
    this.cache.clear();
    try {
      localStorage.removeItem(CACHE_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

export const blendedFeedService = new BlendedFeedService();
