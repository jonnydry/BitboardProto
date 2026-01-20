// ============================================
// ARTICLE SERVICE (NIP-23)
// ============================================
// Handles long-form content (articles/blog posts) for BitBoard.
// Articles are parameterized replaceable events that support
// markdown content, titles, summaries, and images.
//
// Event kind: 30023
//
// Key fields:
// - d tag: Unique identifier for the article
// - title tag: Article title
// - summary tag: Short summary/description
// - image tag: Header image URL
// - published_at tag: Publication timestamp
// - t tags: Hashtags/topics
// - content: Markdown body

import { type Event as NostrEvent } from 'nostr-tools';
import { NOSTR_KINDS, type UnsignedNostrEvent } from '../types';
import { nostrService } from './nostr/NostrService';
import { logger } from './loggingService';

// ============================================
// TYPES
// ============================================

export interface Article {
  id: string;                   // d tag (unique identifier)
  nostrEventId?: string;        // Event ID
  title: string;
  content: string;              // Markdown content
  summary?: string;
  image?: string;               // Header image URL
  authorPubkey: string;
  publishedAt: number;          // Timestamp in ms
  createdAt: number;            // Event created_at in ms
  hashtags: string[];
  // Board integration
  boardId?: string;             // If posted to a specific board
  // Metadata
  wordCount: number;
  readingTimeMinutes: number;
}

// ============================================
// CONSTANTS
// ============================================

const ARTICLE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const WORDS_PER_MINUTE = 200; // Average reading speed

// ============================================
// ARTICLE SERVICE CLASS
// ============================================

class ArticleService {
  // Cache for articles
  private articleCache: Map<string, { article: Article; timestamp: number }> = new Map();

  // ----------------------------------------
  // ARTICLE BUILDING
  // ----------------------------------------

  /**
   * Build a long-form article event (kind 30023)
   */
  buildArticleEvent(args: {
    id: string;               // Unique identifier (d tag) - usually slug-like
    title: string;
    content: string;          // Markdown content
    summary?: string;
    image?: string;           // Header image URL
    hashtags?: string[];
    boardId?: string;         // Optional board association
    pubkey: string;
    publishedAt?: number;     // Defaults to now
  }): UnsignedNostrEvent {
    const now = Math.floor(Date.now() / 1000);
    const tags: string[][] = [
      ['d', args.id],
      ['title', args.title],
      ['published_at', (args.publishedAt || now).toString()],
    ];

    if (args.summary) {
      tags.push(['summary', args.summary]);
    }

    if (args.image) {
      tags.push(['image', args.image]);
    }

    // Add hashtags
    if (args.hashtags) {
      for (const tag of args.hashtags) {
        tags.push(['t', tag.toLowerCase().replace(/^#/, '')]);
      }
    }

    // Add board reference if specified
    if (args.boardId) {
      tags.push(['board', args.boardId]);
    }

    // Add BitBoard client tag
    tags.push(['client', 'bitboard']);

    return {
      kind: NOSTR_KINDS.LONG_FORM,
      pubkey: args.pubkey,
      created_at: now,
      tags,
      content: args.content,
    };
  }

  // ----------------------------------------
  // ARTICLE PARSING
  // ----------------------------------------

  /**
   * Parse a long-form event into an Article object
   */
  parseArticle(event: NostrEvent): Article | null {
    if (event.kind !== NOSTR_KINDS.LONG_FORM) {
      return null;
    }

    const getTag = (name: string): string | undefined => {
      const tag = event.tags.find(t => t[0] === name);
      return tag?.[1];
    };

    const getAllTags = (name: string): string[] => {
      return event.tags
        .filter(t => t[0] === name && t[1])
        .map(t => t[1]);
    };

    const id = getTag('d');
    const title = getTag('title');

    if (!id || !title) {
      logger.warn('Article', 'Invalid article: missing d or title tag');
      return null;
    }

    const content = event.content || '';
    const wordCount = this.countWords(content);
    const readingTimeMinutes = Math.ceil(wordCount / WORDS_PER_MINUTE);

    const publishedAtStr = getTag('published_at');
    const publishedAt = publishedAtStr 
      ? parseInt(publishedAtStr, 10) * 1000 
      : event.created_at * 1000;

    return {
      id,
      nostrEventId: event.id,
      title,
      content,
      summary: getTag('summary'),
      image: getTag('image'),
      authorPubkey: event.pubkey,
      publishedAt,
      createdAt: event.created_at * 1000,
      hashtags: getAllTags('t'),
      boardId: getTag('board'),
      wordCount,
      readingTimeMinutes,
    };
  }

  /**
   * Count words in markdown content
   */
  private countWords(content: string): number {
    // Remove markdown syntax for more accurate count
    const plainText = content
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]*`/g, '')        // Remove inline code
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // Replace links with text
      .replace(/[#*_~>`-]/g, '')      // Remove markdown characters
      .replace(/\s+/g, ' ')           // Normalize whitespace
      .trim();

    if (!plainText) return 0;
    return plainText.split(' ').filter(w => w.length > 0).length;
  }

  // ----------------------------------------
  // ARTICLE FETCHING
  // ----------------------------------------

  /**
   * Fetch an article by author and id
   */
  async fetchArticle(authorPubkey: string, articleId: string): Promise<Article | null> {
    const cacheKey = `${authorPubkey}:${articleId}`;
    
    const cached = this.articleCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ARTICLE_CACHE_TTL_MS) {
      return cached.article;
    }

    try {
      const event = await nostrService.fetchArticle(authorPubkey, articleId);
      if (!event) return null;

      const article = this.parseArticle(event);
      if (article) {
        this.articleCache.set(cacheKey, { article, timestamp: Date.now() });
      }

      return article;
    } catch (error) {
      logger.error('Article', 'Failed to fetch article', error);
      return null;
    }
  }

  /**
   * Fetch articles by author
   */
  async fetchArticlesByAuthor(authorPubkey: string, opts: { limit?: number } = {}): Promise<Article[]> {
    try {
      const events = await nostrService.fetchArticlesByAuthor(authorPubkey, opts);
      
      const articles: Article[] = [];
      for (const event of events) {
        const article = this.parseArticle(event);
        if (article) {
          articles.push(article);
          // Update cache
          const cacheKey = `${authorPubkey}:${article.id}`;
          this.articleCache.set(cacheKey, { article, timestamp: Date.now() });
        }
      }

      // Sort by published_at (newest first)
      return articles.sort((a, b) => b.publishedAt - a.publishedAt);
    } catch (error) {
      logger.error('Article', 'Failed to fetch articles by author', error);
      return [];
    }
  }

  /**
   * Fetch articles for a board
   */
  async fetchArticlesForBoard(boardId: string, opts: { limit?: number } = {}): Promise<Article[]> {
    try {
      const events = await nostrService.fetchArticlesForBoard(boardId, opts);
      
      const articles: Article[] = [];
      for (const event of events) {
        const article = this.parseArticle(event);
        if (article) {
          articles.push(article);
        }
      }

      return articles.sort((a, b) => b.publishedAt - a.publishedAt);
    } catch (error) {
      logger.error('Article', 'Failed to fetch articles for board', error);
      return [];
    }
  }

  /**
   * Fetch recent articles (with BitBoard tag)
   */
  async fetchRecentArticles(opts: { limit?: number; since?: number } = {}): Promise<Article[]> {
    try {
      const events = await nostrService.fetchRecentArticles(opts);
      
      const articles: Article[] = [];
      for (const event of events) {
        const article = this.parseArticle(event);
        if (article) {
          articles.push(article);
        }
      }

      return articles.sort((a, b) => b.publishedAt - a.publishedAt);
    } catch (error) {
      logger.error('Article', 'Failed to fetch recent articles', error);
      return [];
    }
  }

  /**
   * Search articles by hashtag
   */
  async fetchArticlesByHashtag(hashtag: string, opts: { limit?: number } = {}): Promise<Article[]> {
    try {
      const events = await nostrService.fetchArticlesByHashtag(hashtag, opts);
      
      const articles: Article[] = [];
      for (const event of events) {
        const article = this.parseArticle(event);
        if (article) {
          articles.push(article);
        }
      }

      return articles.sort((a, b) => b.publishedAt - a.publishedAt);
    } catch (error) {
      logger.error('Article', 'Failed to fetch articles by hashtag', error);
      return [];
    }
  }

  // ----------------------------------------
  // ARTICLE ADDRESS UTILITIES
  // ----------------------------------------

  /**
   * Create an article address (naddr-like reference)
   */
  getArticleAddress(authorPubkey: string, articleId: string): string {
    return `${NOSTR_KINDS.LONG_FORM}:${authorPubkey}:${articleId}`;
  }

  /**
   * Parse an article address
   */
  parseArticleAddress(address: string): { authorPubkey: string; articleId: string } | null {
    const parts = address.split(':');
    if (parts.length < 3 || parts[0] !== NOSTR_KINDS.LONG_FORM.toString()) {
      return null;
    }
    return {
      authorPubkey: parts[1],
      articleId: parts.slice(2).join(':'),
    };
  }

  /**
   * Generate a URL-friendly slug from title
   */
  generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
  }

  // ----------------------------------------
  // CACHE MANAGEMENT
  // ----------------------------------------

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.articleCache.clear();
  }

  /**
   * Invalidate a specific article cache
   */
  invalidateArticle(authorPubkey: string, articleId: string): void {
    this.articleCache.delete(`${authorPubkey}:${articleId}`);
  }
}

// Export singleton
export const articleService = new ArticleService();
export { ArticleService };
