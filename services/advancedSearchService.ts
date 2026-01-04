// ============================================
// ADVANCED SEARCH SERVICE
// ============================================
// Full-featured search with saved searches, filters,
// date ranges, and search history

import { type Event as NostrEvent, type Filter } from 'nostr-tools';
import { logger } from './loggingService';

// ============================================
// TYPES
// ============================================

export interface SearchFilters {
  query: string;
  
  // Content filters
  boards?: string[];           // Specific boards to search
  authors?: string[];          // Specific pubkeys
  tags?: string[];             // Hashtags
  
  // Date filters
  dateFrom?: Date | null;
  dateTo?: Date | null;
  dateRange?: DateRange;       // Preset ranges
  
  // Content type
  contentType?: ContentType;
  hasImage?: boolean;
  hasLink?: boolean;
  
  // Engagement filters
  minScore?: number;
  minComments?: number;
  
  // Sort
  sortBy: SearchSortBy;
}

export enum DateRange {
  TODAY = 'today',
  YESTERDAY = 'yesterday',
  PAST_WEEK = 'past_week',
  PAST_MONTH = 'past_month',
  PAST_YEAR = 'past_year',
  ALL_TIME = 'all_time',
  CUSTOM = 'custom',
}

export enum ContentType {
  ALL = 'all',
  POSTS = 'posts',
  COMMENTS = 'comments',
  LINKS = 'links',
  IMAGES = 'images',
}

export enum SearchSortBy {
  RELEVANCE = 'relevance',
  NEWEST = 'newest',
  OLDEST = 'oldest',
  TOP_SCORE = 'top_score',
  MOST_COMMENTS = 'most_comments',
}

export interface SearchResult {
  id: string;
  type: 'post' | 'comment';
  title?: string;
  content: string;
  authorPubkey: string;
  authorName?: string;
  boardId?: string;
  boardName?: string;
  timestamp: number;
  score: number;
  commentCount: number;
  matchedOn: MatchType[];      // What matched the search
  highlightedContent?: string; // Content with highlights
  nostrEventId?: string;
}

export enum MatchType {
  TITLE = 'title',
  CONTENT = 'content',
  AUTHOR = 'author',
  TAG = 'tag',
  BOARD = 'board',
}

export interface SavedSearch {
  id: string;
  name: string;
  filters: SearchFilters;
  createdAt: number;
  lastUsedAt?: number;
  useCount: number;
}

export interface SearchHistoryEntry {
  query: string;
  timestamp: number;
  resultCount: number;
}

// ============================================
// DEFAULT FILTERS
// ============================================

const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  dateRange: DateRange.ALL_TIME,
  contentType: ContentType.ALL,
  sortBy: SearchSortBy.RELEVANCE,
};

// ============================================
// ADVANCED SEARCH SERVICE
// ============================================

class AdvancedSearchService {
  private savedSearches: Map<string, SavedSearch> = new Map();
  private searchHistory: SearchHistoryEntry[] = [];
  private currentUserPubkey: string | null = null;

  // ----------------------------------------
  // INITIALIZATION
  // ----------------------------------------

  initialize(userPubkey: string): void {
    this.currentUserPubkey = userPubkey;
    this.loadFromStorage();
    logger.info('Search', `Initialized for ${userPubkey.slice(0, 8)}...`);
  }

  // ----------------------------------------
  // SEARCH EXECUTION
  // ----------------------------------------

  /**
   * Execute a search with the given filters
   */
  async search(filters: Partial<SearchFilters>): Promise<SearchResult[]> {
    const fullFilters = { ...DEFAULT_FILTERS, ...filters };
    
    // Add to history
    if (fullFilters.query.trim()) {
      this.addToHistory(fullFilters.query, 0);
    }

    // Build Nostr filter
    const nostrFilter = this.buildNostrFilter(fullFilters);
    
    // Fetch events from relays
    const events = await this.fetchEvents(nostrFilter);
    
    // Process and filter results
    let results = this.processEvents(events, fullFilters);
    
    // Apply client-side filters
    results = this.applyClientFilters(results, fullFilters);
    
    // Sort results
    results = this.sortResults(results, fullFilters.sortBy);
    
    // Update history with result count
    this.updateHistoryCount(fullFilters.query, results.length);
    
    logger.info('Search', `Found ${results.length} results for "${fullFilters.query}"`);
    return results;
  }

  /**
   * Quick search (just query, no filters)
   */
  async quickSearch(query: string, limit = 20): Promise<SearchResult[]> {
    return this.search({ query, sortBy: SearchSortBy.RELEVANCE }).then(r => r.slice(0, limit));
  }

  /**
   * Search suggestions based on history and popular searches
   */
  getSuggestions(query: string, limit = 10): string[] {
    if (!query.trim()) return [];

    const queryLower = query.toLowerCase();
    const suggestions: string[] = [];

    // Add matching history entries
    this.searchHistory
      .filter(h => h.query.toLowerCase().includes(queryLower))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit / 2)
      .forEach(h => {
        if (!suggestions.includes(h.query)) {
          suggestions.push(h.query);
        }
      });

    // Add matching saved searches
    this.savedSearches.forEach(s => {
      if (s.filters.query.toLowerCase().includes(queryLower)) {
        if (!suggestions.includes(s.filters.query)) {
          suggestions.push(s.filters.query);
        }
      }
    });

    return suggestions.slice(0, limit);
  }

  // ----------------------------------------
  // FILTER BUILDING
  // ----------------------------------------

  private buildNostrFilter(filters: SearchFilters): Filter {
    const nostrFilter: Filter = {
      kinds: [1], // Short text notes
      limit: 500,
    };

    // Date range
    const dateRange = this.getDateRange(filters);
    if (dateRange.from) {
      nostrFilter.since = Math.floor(dateRange.from.getTime() / 1000);
    }
    if (dateRange.to) {
      nostrFilter.until = Math.floor(dateRange.to.getTime() / 1000);
    }

    // Author filter
    if (filters.authors && filters.authors.length > 0) {
      nostrFilter.authors = filters.authors;
    }

    // Tag filter (using 't' tags)
    if (filters.tags && filters.tags.length > 0) {
      nostrFilter['#t'] = filters.tags;
    }

    return nostrFilter;
  }

  private getDateRange(filters: SearchFilters): { from: Date | null; to: Date | null } {
    if (filters.dateFrom || filters.dateTo) {
      return { from: filters.dateFrom || null, to: filters.dateTo || null };
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (filters.dateRange) {
      case DateRange.TODAY:
        return { from: startOfDay, to: now };
      
      case DateRange.YESTERDAY: {
        const yesterday = new Date(startOfDay);
        yesterday.setDate(yesterday.getDate() - 1);
        return { from: yesterday, to: startOfDay };
      }
      
      case DateRange.PAST_WEEK: {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return { from: weekAgo, to: now };
      }
      
      case DateRange.PAST_MONTH: {
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return { from: monthAgo, to: now };
      }
      
      case DateRange.PAST_YEAR: {
        const yearAgo = new Date(now);
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);
        return { from: yearAgo, to: now };
      }
      
      case DateRange.ALL_TIME:
      default:
        return { from: null, to: null };
    }
  }

  // ----------------------------------------
  // RESULT PROCESSING
  // ----------------------------------------

  private processEvents(events: NostrEvent[], filters: SearchFilters): SearchResult[] {
    const query = filters.query.toLowerCase().trim();
    const queryTerms = query.split(/\s+/).filter(t => t.length > 0);

    return events
      .map(event => this.eventToResult(event, queryTerms))
      .filter((r): r is SearchResult => r !== null);
  }

  private eventToResult(event: NostrEvent, queryTerms: string[]): SearchResult | null {
    const content = event.content.toLowerCase();
    const matchedOn: MatchType[] = [];

    // Check for matches
    const titleMatch = queryTerms.some(term => 
      event.tags.some(t => t[0] === 'title' && t[1]?.toLowerCase().includes(term))
    );
    if (titleMatch) matchedOn.push(MatchType.TITLE);

    const contentMatch = queryTerms.some(term => content.includes(term));
    if (contentMatch) matchedOn.push(MatchType.CONTENT);

    const tagMatch = queryTerms.some(term =>
      event.tags.some(t => t[0] === 't' && t[1]?.toLowerCase().includes(term))
    );
    if (tagMatch) matchedOn.push(MatchType.TAG);

    // Skip if no matches and we have a query
    if (queryTerms.length > 0 && matchedOn.length === 0) {
      return null;
    }

    // Extract metadata
    const titleTag = event.tags.find(t => t[0] === 'title');
    const boardTag = event.tags.find(t => t[0] === 'd' || t[0] === 'a');

    return {
      id: event.id,
      type: 'post',
      title: titleTag?.[1],
      content: event.content,
      authorPubkey: event.pubkey,
      boardId: boardTag?.[1],
      timestamp: event.created_at * 1000,
      score: 0,
      commentCount: 0,
      matchedOn,
      highlightedContent: this.highlightMatches(event.content, queryTerms),
      nostrEventId: event.id,
    };
  }

  private applyClientFilters(results: SearchResult[], filters: SearchFilters): SearchResult[] {
    let filtered = results;

    // Board filter
    if (filters.boards && filters.boards.length > 0) {
      filtered = filtered.filter(r => r.boardId && filters.boards!.includes(r.boardId));
    }

    // Content type filter
    switch (filters.contentType) {
      case ContentType.POSTS:
        filtered = filtered.filter(r => r.type === 'post');
        break;
      case ContentType.COMMENTS:
        filtered = filtered.filter(r => r.type === 'comment');
        break;
      case ContentType.LINKS:
        filtered = filtered.filter(r => this.hasLink(r.content));
        break;
      case ContentType.IMAGES:
        filtered = filtered.filter(r => this.hasImage(r.content));
        break;
    }

    // Has image filter
    if (filters.hasImage) {
      filtered = filtered.filter(r => this.hasImage(r.content));
    }

    // Has link filter
    if (filters.hasLink) {
      filtered = filtered.filter(r => this.hasLink(r.content));
    }

    // Engagement filters
    if (filters.minScore !== undefined) {
      filtered = filtered.filter(r => r.score >= filters.minScore!);
    }
    if (filters.minComments !== undefined) {
      filtered = filtered.filter(r => r.commentCount >= filters.minComments!);
    }

    return filtered;
  }

  private sortResults(results: SearchResult[], sortBy: SearchSortBy): SearchResult[] {
    switch (sortBy) {
      case SearchSortBy.NEWEST:
        return results.sort((a, b) => b.timestamp - a.timestamp);
      
      case SearchSortBy.OLDEST:
        return results.sort((a, b) => a.timestamp - b.timestamp);
      
      case SearchSortBy.TOP_SCORE:
        return results.sort((a, b) => b.score - a.score);
      
      case SearchSortBy.MOST_COMMENTS:
        return results.sort((a, b) => b.commentCount - a.commentCount);
      
      case SearchSortBy.RELEVANCE:
      default:
        // Sort by number of match types, then by recency
        return results.sort((a, b) => {
          const matchDiff = b.matchedOn.length - a.matchedOn.length;
          if (matchDiff !== 0) return matchDiff;
          return b.timestamp - a.timestamp;
        });
    }
  }

  private highlightMatches(content: string, terms: string[]): string {
    if (terms.length === 0) return content;

    let highlighted = content;
    terms.forEach(term => {
      const regex = new RegExp(`(${this.escapeRegex(term)})`, 'gi');
      highlighted = highlighted.replace(regex, '**$1**');
    });

    // Truncate around first match
    const firstMatch = terms.reduce((minIndex, term) => {
      const index = content.toLowerCase().indexOf(term.toLowerCase());
      return index !== -1 && (minIndex === -1 || index < minIndex) ? index : minIndex;
    }, -1);

    if (firstMatch > 100) {
      highlighted = '...' + highlighted.slice(firstMatch - 50);
    }
    if (highlighted.length > 300) {
      highlighted = highlighted.slice(0, 300) + '...';
    }

    return highlighted;
  }

  // ----------------------------------------
  // SAVED SEARCHES
  // ----------------------------------------

  /**
   * Save a search for quick access
   */
  saveSearch(name: string, filters: SearchFilters): SavedSearch {
    const id = `saved-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const savedSearch: SavedSearch = {
      id,
      name,
      filters: { ...filters },
      createdAt: Date.now(),
      useCount: 0,
    };

    this.savedSearches.set(id, savedSearch);
    this.saveToStorage();
    
    logger.info('Search', `Saved search "${name}"`);
    return savedSearch;
  }

  /**
   * Get all saved searches
   */
  getSavedSearches(): SavedSearch[] {
    return Array.from(this.savedSearches.values())
      .sort((a, b) => (b.lastUsedAt || b.createdAt) - (a.lastUsedAt || a.createdAt));
  }

  /**
   * Delete a saved search
   */
  deleteSavedSearch(id: string): void {
    this.savedSearches.delete(id);
    this.saveToStorage();
  }

  /**
   * Execute a saved search
   */
  async executeSavedSearch(id: string): Promise<SearchResult[]> {
    const saved = this.savedSearches.get(id);
    if (!saved) {
      logger.warn('Search', `Saved search ${id} not found`);
      return [];
    }

    // Update usage stats
    saved.lastUsedAt = Date.now();
    saved.useCount++;
    this.saveToStorage();

    return this.search(saved.filters);
  }

  // ----------------------------------------
  // SEARCH HISTORY
  // ----------------------------------------

  /**
   * Get search history
   */
  getHistory(limit = 20): SearchHistoryEntry[] {
    return this.searchHistory.slice(0, limit);
  }

  /**
   * Clear search history
   */
  clearHistory(): void {
    this.searchHistory = [];
    this.saveToStorage();
  }

  private addToHistory(query: string, resultCount: number): void {
    // Remove existing entry for same query
    this.searchHistory = this.searchHistory.filter(h => h.query !== query);
    
    // Add new entry
    this.searchHistory.unshift({
      query,
      timestamp: Date.now(),
      resultCount,
    });

    // Keep last 50 entries
    this.searchHistory = this.searchHistory.slice(0, 50);
    this.saveToStorage();
  }

  private updateHistoryCount(query: string, count: number): void {
    const entry = this.searchHistory.find(h => h.query === query);
    if (entry) {
      entry.resultCount = count;
      this.saveToStorage();
    }
  }

  // ----------------------------------------
  // HELPERS
  // ----------------------------------------

  private hasLink(content: string): boolean {
    return /https?:\/\/[^\s]+/.test(content);
  }

  private hasImage(content: string): boolean {
    return /\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?$/i.test(content) ||
           /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)/i.test(content);
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async fetchEvents(_filter: Filter): Promise<NostrEvent[]> {
    try {
      // TODO: Implement relay queries using nostrService's pool
      // For now, return empty array as placeholder
      return [];
    } catch {
      return [];
    }
  }

  // ----------------------------------------
  // PERSISTENCE
  // ----------------------------------------

  private readonly STORAGE_KEY = 'bitboard_search_v1';

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return;

      const data = JSON.parse(stored);
      if (data.userPubkey !== this.currentUserPubkey) return;

      // Load saved searches
      this.savedSearches.clear();
      for (const s of data.savedSearches || []) {
        this.savedSearches.set(s.id, s);
      }

      // Load history
      this.searchHistory = data.history || [];

      logger.debug('Search', `Loaded ${this.savedSearches.size} saved searches`);
    } catch (error) {
      logger.warn('Search', 'Failed to load from storage', error);
    }
  }

  private saveToStorage(): void {
    try {
      const data = {
        userPubkey: this.currentUserPubkey,
        savedSearches: Array.from(this.savedSearches.values()),
        history: this.searchHistory,
        savedAt: Date.now(),
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      logger.warn('Search', 'Failed to save to storage', error);
    }
  }

  // ----------------------------------------
  // CLEANUP
  // ----------------------------------------

  cleanup(): void {
    this.saveToStorage();
    this.savedSearches.clear();
    this.searchHistory = [];
    this.currentUserPubkey = null;
    logger.info('Search', 'Service cleaned up');
  }
}

// Export singleton
export const advancedSearchService = new AdvancedSearchService();
export { AdvancedSearchService };
