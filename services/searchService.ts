// ============================================
// SEARCH SERVICE
// ============================================
// Manages the search Web Worker for offloading text search from main thread
// Uses an "Index & Query" pattern to avoid serializing posts on every keystroke
//
// Usage:
//   searchService.updateIndex(posts) - Call when posts change
//   searchService.search(query) - Returns Promise<string[]> of matching post IDs
//
// ============================================

import type { Post } from '../types';

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
      console.log('[SearchService] Web Workers not supported, using main thread search');
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
            console.log('[SearchService] Worker ready');
            break;

          case 'INDEX_UPDATED': {
            const { count } = e.data;
            this.lastIndexedPostCount = count;
            console.log(`[SearchService] Index updated: ${count} posts`);
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
        console.error('[SearchService] Worker error:', error);
        this.worker = null;
        this.workerReady = false;
      };
    } catch (e) {
      console.warn('[SearchService] Failed to initialize worker:', e);
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
  private searchMainThread(query: string): string[] {
    console.warn('[SearchService] Using main thread search fallback');
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
}

// Singleton instance
export const searchService = new SearchService();
