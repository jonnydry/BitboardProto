// ============================================
// BOOKMARK SERVICE
// ============================================
// Handles saving and loading bookmarked posts from localStorage

const STORAGE_KEY = 'bitboard_bookmarks';

export interface BookmarkEntry {
  postId: string;
  savedAt: number;
}

class BookmarkService {
  private bookmarks: Map<string, BookmarkEntry> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const entries: BookmarkEntry[] = JSON.parse(stored);
        entries.forEach(entry => {
          this.bookmarks.set(entry.postId, entry);
        });
      }
    } catch (error) {
      console.error('[Bookmarks] Failed to load:', error);
    }
  }

  private saveToStorage(): void {
    try {
      const entries = Array.from(this.bookmarks.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      console.error('[Bookmarks] Failed to save:', error);
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }

  /**
   * Check if a post is bookmarked
   */
  isBookmarked(postId: string): boolean {
    return this.bookmarks.has(postId);
  }

  /**
   * Toggle bookmark status for a post
   */
  toggleBookmark(postId: string): boolean {
    if (this.bookmarks.has(postId)) {
      this.bookmarks.delete(postId);
      this.saveToStorage();
      this.notifyListeners();
      return false;
    } else {
      this.bookmarks.set(postId, {
        postId,
        savedAt: Date.now(),
      });
      this.saveToStorage();
      this.notifyListeners();
      return true;
    }
  }

  /**
   * Add a bookmark
   */
  addBookmark(postId: string): void {
    if (!this.bookmarks.has(postId)) {
      this.bookmarks.set(postId, {
        postId,
        savedAt: Date.now(),
      });
      this.saveToStorage();
      this.notifyListeners();
    }
  }

  /**
   * Remove a bookmark
   */
  removeBookmark(postId: string): void {
    if (this.bookmarks.has(postId)) {
      this.bookmarks.delete(postId);
      this.saveToStorage();
      this.notifyListeners();
    }
  }

  /**
   * Get all bookmarked post IDs, sorted by most recently saved
   */
  getBookmarkedIds(): string[] {
    return Array.from(this.bookmarks.values())
      .sort((a, b) => b.savedAt - a.savedAt)
      .map(entry => entry.postId);
  }

  /**
   * Get bookmark count
   */
  getCount(): number {
    return this.bookmarks.size;
  }

  /**
   * Subscribe to bookmark changes
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Clear all bookmarks
   */
  clearAll(): void {
    this.bookmarks.clear();
    this.saveToStorage();
    this.notifyListeners();
  }
}

export const bookmarkService = new BookmarkService();
