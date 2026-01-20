// ============================================
// LIST SERVICE (NIP-51)
// ============================================
// Handles user-created lists for BitBoard.
// Lists can contain pubkeys, events, hashtags, etc.
//
// Event kinds:
// - 10000: Mute List (pubkeys to hide)
// - 10001: Pin List (pinned events)
// - 10003: Bookmarks (saved events)
// - 30000: Categorized People (named lists of pubkeys)
// - 30001: Categorized Bookmarks (named bookmark collections)
//
// Lists support both public and private entries.
// Private entries are encrypted in the content field.

import { type Event as NostrEvent } from 'nostr-tools';
import {
  NOSTR_KINDS,
  type NostrList,
  type UnsignedNostrEvent,
} from '../types';
import { nostrService } from './nostr/NostrService';
import { logger } from './loggingService';

// ============================================
// CONSTANTS
// ============================================

const LIST_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

// List kinds
export const LIST_KINDS = {
  MUTE: 10000,
  PIN: 10001,
  RELAY_LIST: 10002, // NIP-65 (already in NOSTR_KINDS)
  BOOKMARKS: 10003,
  COMMUNITIES: 10004,
  PUBLIC_CHATS: 10005,
  BLOCKED_RELAYS: 10006,
  SEARCH_RELAYS: 10007,
  INTERESTS: 10015,
  EMOJIS: 10030,
  // Parameterized (named) lists
  CATEGORIZED_PEOPLE: 30000,
  CATEGORIZED_BOOKMARKS: 30001,
  CATEGORIZED_RELAYS: 30002,
} as const;

// ============================================
// LIST SERVICE CLASS
// ============================================

class ListService {
  // Cache for user lists
  private listCache: Map<string, { list: NostrList; timestamp: number }> = new Map();
  
  // Current user's pubkey
  private userPubkey: string | null = null;

  // ----------------------------------------
  // INITIALIZATION
  // ----------------------------------------

  /**
   * Set the current user's pubkey
   */
  setUserPubkey(pubkey: string | null): void {
    if (this.userPubkey !== pubkey) {
      this.userPubkey = pubkey;
      this.listCache.clear();
    }
  }

  // ----------------------------------------
  // LIST BUILDING
  // ----------------------------------------

  /**
   * Build a list event
   */
  buildListEvent(args: {
    kind: number;
    name?: string;            // For parameterized lists (d tag)
    pubkeys?: string[];       // p tags
    eventIds?: string[];      // e tags
    addresses?: string[];     // a tags (parameterized replaceable)
    hashtags?: string[];      // t tags
    privateContent?: string;  // Encrypted private entries
    pubkey: string;
  }): UnsignedNostrEvent {
    const tags: string[][] = [];

    // Add d tag for parameterized lists
    if (args.name && args.kind >= 30000) {
      tags.push(['d', args.name]);
    }

    // Add public entries
    if (args.pubkeys) {
      for (const pk of args.pubkeys) {
        tags.push(['p', pk]);
      }
    }

    if (args.eventIds) {
      for (const id of args.eventIds) {
        tags.push(['e', id]);
      }
    }

    if (args.addresses) {
      for (const addr of args.addresses) {
        tags.push(['a', addr]);
      }
    }

    if (args.hashtags) {
      for (const tag of args.hashtags) {
        tags.push(['t', tag]);
      }
    }

    // Add BitBoard client tag
    tags.push(['client', 'bitboard']);

    return {
      kind: args.kind,
      pubkey: args.pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: args.privateContent || '',
    };
  }

  /**
   * Build a mute list event (kind 10000)
   */
  buildMuteList(args: {
    pubkeys: string[];
    pubkey: string;
  }): UnsignedNostrEvent {
    return this.buildListEvent({
      kind: LIST_KINDS.MUTE,
      pubkeys: args.pubkeys,
      pubkey: args.pubkey,
    });
  }

  /**
   * Build a bookmarks list event (kind 10003)
   */
  buildBookmarksList(args: {
    eventIds: string[];
    hashtags?: string[];
    addresses?: string[];
    pubkey: string;
  }): UnsignedNostrEvent {
    return this.buildListEvent({
      kind: LIST_KINDS.BOOKMARKS,
      eventIds: args.eventIds,
      hashtags: args.hashtags,
      addresses: args.addresses,
      pubkey: args.pubkey,
    });
  }

  /**
   * Build a categorized bookmarks list (kind 30001)
   */
  buildCategorizedBookmarks(args: {
    name: string;             // List name (d tag)
    eventIds: string[];
    hashtags?: string[];
    pubkey: string;
  }): UnsignedNostrEvent {
    return this.buildListEvent({
      kind: LIST_KINDS.CATEGORIZED_BOOKMARKS,
      name: args.name,
      eventIds: args.eventIds,
      hashtags: args.hashtags,
      pubkey: args.pubkey,
    });
  }

  /**
   * Build a categorized people list (kind 30000) - "follow packs"
   */
  buildCategorizedPeople(args: {
    name: string;             // List name (d tag)
    pubkeys: string[];
    pubkey: string;
  }): UnsignedNostrEvent {
    return this.buildListEvent({
      kind: LIST_KINDS.CATEGORIZED_PEOPLE,
      name: args.name,
      pubkeys: args.pubkeys,
      pubkey: args.pubkey,
    });
  }

  // ----------------------------------------
  // LIST PARSING
  // ----------------------------------------

  /**
   * Parse a list event into a NostrList object
   */
  parseListEvent(event: NostrEvent): NostrList {
    const getTag = (name: string): string | undefined => {
      const tag = event.tags.find(t => t[0] === name);
      return tag?.[1];
    };

    const getAllTags = (name: string): string[] => {
      return event.tags
        .filter(t => t[0] === name && t[1])
        .map(t => t[1]);
    };

    return {
      id: getTag('d') || event.id,
      kind: event.kind,
      name: getTag('d'),
      pubkeys: getAllTags('p'),
      eventIds: getAllTags('e'),
      addresses: getAllTags('a'),
      hashtags: getAllTags('t'),
      createdAt: event.created_at * 1000,
    };
  }

  // ----------------------------------------
  // LIST FETCHING
  // ----------------------------------------

  /**
   * Fetch a user's mute list
   */
  async fetchMuteList(pubkey: string): Promise<NostrList | null> {
    const cacheKey = `mute:${pubkey}`;
    
    const cached = this.listCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < LIST_CACHE_TTL_MS) {
      return cached.list;
    }

    try {
      const event = await nostrService.fetchList(pubkey, LIST_KINDS.MUTE);
      if (!event) return null;

      const list = this.parseListEvent(event);
      this.listCache.set(cacheKey, { list, timestamp: Date.now() });
      return list;
    } catch (error) {
      logger.error('List', 'Failed to fetch mute list', error);
      return null;
    }
  }

  /**
   * Fetch a user's bookmarks
   */
  async fetchBookmarks(pubkey: string): Promise<NostrList | null> {
    const cacheKey = `bookmarks:${pubkey}`;
    
    const cached = this.listCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < LIST_CACHE_TTL_MS) {
      return cached.list;
    }

    try {
      const event = await nostrService.fetchList(pubkey, LIST_KINDS.BOOKMARKS);
      if (!event) return null;

      const list = this.parseListEvent(event);
      this.listCache.set(cacheKey, { list, timestamp: Date.now() });
      return list;
    } catch (error) {
      logger.error('List', 'Failed to fetch bookmarks', error);
      return null;
    }
  }

  /**
   * Fetch a named list (parameterized)
   */
  async fetchNamedList(pubkey: string, kind: number, name: string): Promise<NostrList | null> {
    const cacheKey = `${kind}:${pubkey}:${name}`;
    
    const cached = this.listCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < LIST_CACHE_TTL_MS) {
      return cached.list;
    }

    try {
      const event = await nostrService.fetchNamedList(pubkey, kind, name);
      if (!event) return null;

      const list = this.parseListEvent(event);
      this.listCache.set(cacheKey, { list, timestamp: Date.now() });
      return list;
    } catch (error) {
      logger.error('List', 'Failed to fetch named list', error);
      return null;
    }
  }

  /**
   * Fetch all named lists of a kind for a user
   */
  async fetchAllNamedLists(pubkey: string, kind: number): Promise<NostrList[]> {
    try {
      const events = await nostrService.fetchAllNamedLists(pubkey, kind);
      return events.map(e => this.parseListEvent(e));
    } catch (error) {
      logger.error('List', 'Failed to fetch all named lists', error);
      return [];
    }
  }

  // ----------------------------------------
  // CONVENIENCE METHODS
  // ----------------------------------------

  /**
   * Check if a pubkey is muted by the current user
   */
  async isMuted(pubkey: string): Promise<boolean> {
    if (!this.userPubkey) return false;
    
    const muteList = await this.fetchMuteList(this.userPubkey);
    return muteList?.pubkeys.includes(pubkey) ?? false;
  }

  /**
   * Check if an event is bookmarked by the current user
   */
  async isBookmarked(eventId: string): Promise<boolean> {
    if (!this.userPubkey) return false;
    
    const bookmarks = await this.fetchBookmarks(this.userPubkey);
    return bookmarks?.eventIds.includes(eventId) ?? false;
  }

  /**
   * Get muted pubkeys for current user
   */
  async getMutedPubkeys(): Promise<string[]> {
    if (!this.userPubkey) return [];
    
    const muteList = await this.fetchMuteList(this.userPubkey);
    return muteList?.pubkeys ?? [];
  }

  /**
   * Get bookmarked event IDs for current user
   */
  async getBookmarkedEventIds(): Promise<string[]> {
    if (!this.userPubkey) return [];
    
    const bookmarks = await this.fetchBookmarks(this.userPubkey);
    return bookmarks?.eventIds ?? [];
  }

  /**
   * Get all bookmark collections (categorized bookmarks) for current user
   */
  async getBookmarkCollections(): Promise<NostrList[]> {
    if (!this.userPubkey) return [];
    return this.fetchAllNamedLists(this.userPubkey, LIST_KINDS.CATEGORIZED_BOOKMARKS);
  }

  /**
   * Get all people lists (follow packs) for current user
   */
  async getPeopleLists(): Promise<NostrList[]> {
    if (!this.userPubkey) return [];
    return this.fetchAllNamedLists(this.userPubkey, LIST_KINDS.CATEGORIZED_PEOPLE);
  }

  // ----------------------------------------
  // FILTERING HELPERS
  // ----------------------------------------

  /**
   * Filter out posts from muted authors
   */
  async filterMutedAuthors<T extends { authorPubkey?: string }>(posts: T[]): Promise<T[]> {
    const mutedPubkeys = await this.getMutedPubkeys();
    if (mutedPubkeys.length === 0) return posts;

    const mutedSet = new Set(mutedPubkeys);
    return posts.filter(p => !p.authorPubkey || !mutedSet.has(p.authorPubkey));
  }

  /**
   * Mark which posts are bookmarked
   */
  async markBookmarkedPosts<T extends { nostrEventId?: string }>(
    posts: T[]
  ): Promise<Array<T & { isBookmarked: boolean }>> {
    const bookmarkedIds = await this.getBookmarkedEventIds();
    const bookmarkedSet = new Set(bookmarkedIds);

    return posts.map(p => ({
      ...p,
      isBookmarked: p.nostrEventId ? bookmarkedSet.has(p.nostrEventId) : false,
    }));
  }

  // ----------------------------------------
  // CACHE MANAGEMENT
  // ----------------------------------------

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.listCache.clear();
  }

  /**
   * Invalidate a specific list cache
   */
  invalidateListCache(pubkey: string, kind: number, name?: string): void {
    if (name) {
      this.listCache.delete(`${kind}:${pubkey}:${name}`);
    } else if (kind === LIST_KINDS.MUTE) {
      this.listCache.delete(`mute:${pubkey}`);
    } else if (kind === LIST_KINDS.BOOKMARKS) {
      this.listCache.delete(`bookmarks:${pubkey}`);
    }
  }

  /**
   * Invalidate all caches for current user (after publishing list updates)
   */
  invalidateUserLists(): void {
    if (!this.userPubkey) return;
    
    // Clear all entries for current user
    const keysToDelete: string[] = [];
    for (const key of this.listCache.keys()) {
      if (key.includes(this.userPubkey)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(k => this.listCache.delete(k));
  }
}

// Export singleton
export const listService = new ListService();
export { ListService };
