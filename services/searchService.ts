// ============================================
// SEARCH SERVICE (Enhanced with NIP-50)
// ============================================
// Manages both local and relay-based search.
//
// Local search (Web Worker):
//   - Offline-capable, instant results
//   - Searches cached posts only
//
// Relay search (NIP-50):
//   - Full-text search across relays
//   - Discovers content not in local cache
//   - Requires relay support for NIP-50
//
// Usage:
//   searchService.updateIndex(posts) - Update local index
//   searchService.search(query) - Local search
//   searchService.relaySearch(query) - NIP-50 relay search
//
// ============================================

import type { Post, NostrEvent } from '../types';
import { NOSTR_KINDS } from '../types';
import { nostrService } from './nostr/NostrService';
import { logger } from './loggingService';

type SearchWorkerMessage =
  | { type: 'READY' }
  | { type: 'INDEX_UPDATED'; count: number }
  | { type: 'SEARCH_RESULTS'; ids: string[]; query: string; requestId: string };

class SearchService {
  private worker: Worker | null = null;
  private workerReady = false;
  private pendingSearches = new Map<string, { resolve: (ids: string[]) => void; reject: (error: Error) => void }>();
  private requestId = 0;
  private lastIndexedPostCount = 0;
  private indexUpdateDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.initWorker();
  }

  /**
   * Initialize the search worker
   */
  private initWorker(): void {
    if (typeof Worker === 'undefined') {
      logger.debug('SearchService', 'Web Workers not supported, using main thread search');
      return;
    }

    try {
      this.worker = new Worker(
        new URL('./workers/search.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (e: MessageEvent<SearchWorkerMessage>) => {
        const { type } = e.data;

        switch (type) {
          case 'READY':
            this.workerReady = true;
            logger.debug('SearchService', 'Worker ready');
            break;

          case 'INDEX_UPDATED': {
            const { count } = e.data;
            this.lastIndexedPostCount = count;
            logger.debug('SearchService', `Index updated: ${count} posts`);
            break;
          }

          case 'SEARCH_RESULTS': {
            const { ids, requestId } = e.data;
            const pending = this.pendingSearches.get(requestId);
            if (pending) {
              pending.resolve(ids);
              this.pendingSearches.delete(requestId);
            }
            break;
          }
        }
      };

      this.worker.onerror = (error) => {
        logger.error('SearchService', 'Worker error', error);
        this.worker = null;
        this.workerReady = false;
      };
    } catch (e) {
      logger.warn('SearchService', 'Failed to initialize worker', e);
      this.worker = null;
      this.workerReady = false;
    }
  }

  /**
   * Update the search index with new posts
   * Debounced to avoid excessive updates
   */
  updateIndex(posts: Post[]): void {
    if (this.indexUpdateDebounceTimer) {
      clearTimeout(this.indexUpdateDebounceTimer);
    }

    this.indexUpdateDebounceTimer = setTimeout(() => {
      this.updateIndexImmediate(posts);
    }, 100); // 100ms debounce
  }

  /**
   * Immediately update the search index
   */
  private updateIndexImmediate(posts: Post[]): void {
    if (!this.worker || !this.workerReady) {
      // Fallback: no index needed for main thread search
      return;
    }

    // Serialize posts for worker (only searchable fields)
    const serializedPosts = posts.map(post => ({
      id: post.id,
      boardId: post.boardId,
      title: post.title,
      author: post.author,
      authorPubkey: post.authorPubkey,
      content: post.content,
      tags: post.tags,
      comments: post.comments.map(c => ({
        author: c.author,
        content: c.content,
      })),
    }));

    this.worker.postMessage({ type: 'UPDATE_INDEX', posts: serializedPosts });
  }

  /**
   * Search posts by query
   * Returns array of matching post IDs
   */
  async search(query: string): Promise<string[]> {
    if (!this.worker || !this.workerReady) {
      // Fallback to main thread search
      return this.searchMainThread(query);
    }

    const requestId = `search-${this.requestId++}`;

    return new Promise((resolve, reject) => {
      this.pendingSearches.set(requestId, { resolve, reject });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingSearches.has(requestId)) {
          this.pendingSearches.delete(requestId);
          reject(new Error('Search timeout'));
        }
      }, 5000);

      this.worker!.postMessage({ type: 'SEARCH', query, requestId });
    });
  }

  /**
   * Fallback main-thread search (used when worker unavailable)
   */
  private searchMainThread(_query: string): string[] {
    logger.warn('SearchService', 'Using main thread search fallback');
    // Return empty array - caller should implement fallback
    return [];
  }

  /**
   * Check if worker is available and ready
   */
  isWorkerReady(): boolean {
    return this.workerReady;
  }

  /**
   * Get the number of indexed posts
   */
  getIndexedCount(): number {
    return this.lastIndexedPostCount;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.indexUpdateDebounceTimer) {
      clearTimeout(this.indexUpdateDebounceTimer);
    }
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.workerReady = false;
    }
  }

  // ----------------------------------------
  // NIP-50 RELAY SEARCH
  // ----------------------------------------

  /**
   * Search relays using NIP-50 full-text search
   * Note: Not all relays support NIP-50
   */
  async relaySearch(query: string, opts: {
    kinds?: number[];
    limit?: number;
    since?: number;
    until?: number;
    authors?: string[];
  } = {}): Promise<NostrEvent[]> {
    if (!query || query.trim().length < 2) {
      return [];
    }

    try {
      const events = await nostrService.searchRelays(query, {
        kinds: opts.kinds || [NOSTR_KINDS.POST, NOSTR_KINDS.LONG_FORM],
        limit: opts.limit || 50,
        since: opts.since,
        until: opts.until,
        authors: opts.authors,
      });

      logger.debug('SearchService', `Relay search found ${events.length} results for: ${query}`);
      return events;
    } catch (error) {
      logger.error('SearchService', 'Relay search failed', error);
      return [];
    }
  }

  /**
   * Search for posts using NIP-50
   */
  async searchPosts(query: string, opts: {
    limit?: number;
    boardId?: string;
  } = {}): Promise<NostrEvent[]> {
    return this.relaySearch(query, {
      kinds: [NOSTR_KINDS.POST],
      limit: opts.limit || 50,
    });
  }

  /**
   * Search for articles using NIP-50
   */
  async searchArticles(query: string, opts: {
    limit?: number;
  } = {}): Promise<NostrEvent[]> {
    return this.relaySearch(query, {
      kinds: [NOSTR_KINDS.LONG_FORM],
      limit: opts.limit || 30,
    });
  }

  /**
   * Search for users/profiles by name
   */
  async searchProfiles(query: string, opts: {
    limit?: number;
  } = {}): Promise<NostrEvent[]> {
    return this.relaySearch(query, {
      kinds: [NOSTR_KINDS.METADATA],
      limit: opts.limit || 20,
    });
  }

  /**
   * Hybrid search: combine local and relay results
   * Returns post IDs from both sources
   */
  async hybridSearch(query: string, _localPosts: Post[]): Promise<{
    localIds: string[];
    relayEvents: NostrEvent[];
  }> {
    // Run both searches in parallel
    const [localIds, relayEvents] = await Promise.all([
      this.search(query),
      this.relaySearch(query, { kinds: [NOSTR_KINDS.POST], limit: 30 }),
    ]);

    return { localIds, relayEvents };
  }

  /**
   * Search by hashtag (doesn't require NIP-50)
   */
  async searchByHashtag(hashtag: string, opts: {
    kinds?: number[];
    limit?: number;
  } = {}): Promise<NostrEvent[]> {
    try {
      const events = await nostrService.searchByHashtag(hashtag, opts);
      return events;
    } catch (error) {
      logger.error('SearchService', 'Hashtag search failed', error);
      return [];
    }
  }

  /**
   * Get trending hashtags (based on recent posts)
   * This is a simple implementation - could be enhanced with relay aggregation
   */
  extractHashtagsFromPosts(posts: Post[]): Map<string, number> {
    const tagCounts = new Map<string, number>();
    
    for (const post of posts) {
      for (const tag of post.tags) {
        const normalized = tag.toLowerCase();
        tagCounts.set(normalized, (tagCounts.get(normalized) || 0) + 1);
      }
    }

    return tagCounts;
  }

  /**
   * Get top hashtags from posts
   */
  getTopHashtags(posts: Post[], limit: number = 10): Array<{ tag: string; count: number }> {
    const tagCounts = this.extractHashtagsFromPosts(posts);
    
    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
}

// Singleton instance
export const searchService = new SearchService();
