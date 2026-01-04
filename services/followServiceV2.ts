// ============================================
// FOLLOW SERVICE (NIP-02)
// ============================================
// Nostr-based user following using NIP-02 Contact List
// Manages follows, followers, and social graph

import { type Event as NostrEvent, type Filter } from 'nostr-tools';
import { nostrService } from './nostr/NostrService';
import { logger } from './loggingService';

// ============================================
// CONSTANTS
// ============================================

const NOSTR_KINDS = {
  CONTACT_LIST: 3,  // NIP-02 follow list
} as const;

// ============================================
// TYPES
// ============================================

export interface FollowedUser {
  pubkey: string;
  relay?: string;      // Preferred relay for this user
  petname?: string;    // Local nickname (optional)
  followedAt?: number; // When they were followed
}

export interface FollowerInfo {
  pubkey: string;
  followedAt: number;
}

export interface FollowStats {
  followingCount: number;
  followersCount: number;
}

// ============================================
// FOLLOW SERVICE
// ============================================

class FollowServiceV2 {
  private following: Map<string, FollowedUser> = new Map();
  private followers: Map<string, FollowerInfo> = new Map();
  private currentUserPubkey: string | null = null;
  private contactListEventId: string | null = null;
  private isInitialized = false;

  // ----------------------------------------
  // INITIALIZATION
  // ----------------------------------------

  /**
   * Initialize follow service with current user's pubkey
   */
  async initialize(userPubkey: string): Promise<void> {
    this.currentUserPubkey = userPubkey;
    this.loadFromStorage();
    
    // Fetch latest contact list from relays
    await this.fetchContactList(userPubkey);
    
    // Optionally fetch followers (can be expensive)
    // await this.fetchFollowers(userPubkey);
    
    this.isInitialized = true;
    logger.info('Follow', `Initialized for ${userPubkey.slice(0, 8)}...`);
  }

  // ----------------------------------------
  // FOLLOWING MANAGEMENT
  // ----------------------------------------

  /**
   * Get all users the current user is following
   */
  getFollowing(): FollowedUser[] {
    return Array.from(this.following.values());
  }

  /**
   * Get following count
   */
  getFollowingCount(): number {
    return this.following.size;
  }

  /**
   * Check if following a specific user
   */
  isFollowing(pubkey: string): boolean {
    return this.following.has(pubkey);
  }

  /**
   * Follow a user
   */
  async follow(pubkey: string, opts: { petname?: string; relay?: string } = {}): Promise<boolean> {
    if (!this.currentUserPubkey) {
      logger.error('Follow', 'Cannot follow: service not initialized');
      return false;
    }

    if (pubkey === this.currentUserPubkey) {
      logger.warn('Follow', 'Cannot follow yourself');
      return false;
    }

    if (this.following.has(pubkey)) {
      logger.debug('Follow', `Already following ${pubkey.slice(0, 8)}...`);
      return true;
    }

    // Add to local state
    const followedUser: FollowedUser = {
      pubkey,
      relay: opts.relay,
      petname: opts.petname,
      followedAt: Date.now(),
    };
    this.following.set(pubkey, followedUser);

    // Save to storage
    this.saveToStorage();

    // Publish updated contact list to Nostr
    const success = await this.publishContactList();
    
    if (success) {
      logger.info('Follow', `Now following ${pubkey.slice(0, 8)}...`);
    } else {
      // Rollback on failure
      this.following.delete(pubkey);
      this.saveToStorage();
      logger.error('Follow', `Failed to follow ${pubkey.slice(0, 8)}...`);
    }

    return success;
  }

  /**
   * Unfollow a user
   */
  async unfollow(pubkey: string): Promise<boolean> {
    if (!this.currentUserPubkey) {
      logger.error('Follow', 'Cannot unfollow: service not initialized');
      return false;
    }

    if (!this.following.has(pubkey)) {
      logger.debug('Follow', `Not following ${pubkey.slice(0, 8)}...`);
      return true;
    }

    // Remove from local state (optimistic)
    const removed = this.following.get(pubkey);
    this.following.delete(pubkey);

    // Save to storage
    this.saveToStorage();

    // Publish updated contact list to Nostr
    const success = await this.publishContactList();
    
    if (success) {
      logger.info('Follow', `Unfollowed ${pubkey.slice(0, 8)}...`);
    } else {
      // Rollback on failure
      if (removed) {
        this.following.set(pubkey, removed);
        this.saveToStorage();
      }
      logger.error('Follow', `Failed to unfollow ${pubkey.slice(0, 8)}...`);
    }

    return success;
  }

  /**
   * Update petname for a followed user
   */
  setPetname(pubkey: string, petname: string | undefined): void {
    const followed = this.following.get(pubkey);
    if (followed) {
      followed.petname = petname;
      this.saveToStorage();
      // Optionally publish updated contact list
    }
  }

  // ----------------------------------------
  // FOLLOWERS
  // ----------------------------------------

  /**
   * Get users following the current user
   * Note: This requires querying relays and can be expensive
   */
  getFollowers(): FollowerInfo[] {
    return Array.from(this.followers.values());
  }

  /**
   * Get follower count
   */
  getFollowersCount(): number {
    return this.followers.size;
  }

  /**
   * Check if a user is following the current user
   */
  isFollowedBy(pubkey: string): boolean {
    return this.followers.has(pubkey);
  }

  /**
   * Check for mutual follow
   */
  isMutual(pubkey: string): boolean {
    return this.isFollowing(pubkey) && this.isFollowedBy(pubkey);
  }

  // ----------------------------------------
  // CONTACT LIST (NIP-02)
  // ----------------------------------------

  /**
   * Fetch contact list for a user from relays
   */
  async fetchContactList(pubkey: string): Promise<FollowedUser[]> {
    try {
      const filter: Filter = {
        kinds: [NOSTR_KINDS.CONTACT_LIST],
        authors: [pubkey],
        limit: 1,
      };

      // Query relays for the latest contact list
      const events = await this.queryRelays(filter);
      
      if (events.length === 0) {
        logger.debug('Follow', `No contact list found for ${pubkey.slice(0, 8)}...`);
        return [];
      }

      // Get the most recent contact list
      const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0];
      
      // Parse the contact list
      const following = this.parseContactList(latestEvent);

      // If this is the current user, update local state
      if (pubkey === this.currentUserPubkey) {
        this.following.clear();
        following.forEach(f => this.following.set(f.pubkey, f));
        this.contactListEventId = latestEvent.id;
        this.saveToStorage();
      }

      logger.info('Follow', `Loaded ${following.length} follows for ${pubkey.slice(0, 8)}...`);
      return following;
    } catch (error) {
      logger.error('Follow', 'Failed to fetch contact list', error);
      return [];
    }
  }

  /**
   * Fetch followers (users who follow the target pubkey)
   * This is expensive - use sparingly
   */
  async fetchFollowers(pubkey: string, opts: { limit?: number } = {}): Promise<FollowerInfo[]> {
    try {
      const limit = opts.limit || 500;
      
      const filter: Filter = {
        kinds: [NOSTR_KINDS.CONTACT_LIST],
        '#p': [pubkey],
        limit,
      };

      const events = await this.queryRelays(filter);
      
      // Dedupe by author (keep most recent)
      const byAuthor = new Map<string, NostrEvent>();
      events.forEach(e => {
        const existing = byAuthor.get(e.pubkey);
        if (!existing || e.created_at > existing.created_at) {
          byAuthor.set(e.pubkey, e);
        }
      });

      // Extract followers from events that still contain the target pubkey
      const followers: FollowerInfo[] = [];
      byAuthor.forEach((event, authorPubkey) => {
        // Verify the contact list still contains the target
        const pTags = event.tags.filter(t => t[0] === 'p');
        if (pTags.some(t => t[1] === pubkey)) {
          followers.push({
            pubkey: authorPubkey,
            followedAt: event.created_at * 1000,
          });
        }
      });

      // If this is the current user, update local state
      if (pubkey === this.currentUserPubkey) {
        this.followers.clear();
        followers.forEach(f => this.followers.set(f.pubkey, f));
        this.saveToStorage();
      }

      logger.info('Follow', `Found ${followers.length} followers for ${pubkey.slice(0, 8)}...`);
      return followers;
    } catch (error) {
      logger.error('Follow', 'Failed to fetch followers', error);
      return [];
    }
  }

  /**
   * Parse a NIP-02 contact list event into FollowedUser array
   */
  private parseContactList(event: NostrEvent): FollowedUser[] {
    const following: FollowedUser[] = [];
    
    for (const tag of event.tags) {
      if (tag[0] === 'p' && tag[1]) {
        following.push({
          pubkey: tag[1],
          relay: tag[2] || undefined,
          petname: tag[3] || undefined,
          followedAt: event.created_at * 1000,
        });
      }
    }

    return following;
  }

  /**
   * Build a NIP-02 contact list event
   */
  private buildContactListEvent(): Partial<NostrEvent> {
    if (!this.currentUserPubkey) {
      throw new Error('Not initialized');
    }

    // Build tags from following list
    const tags: string[][] = [];
    this.following.forEach((user) => {
      const tag = ['p', user.pubkey];
      if (user.relay) tag.push(user.relay);
      else tag.push(''); // Empty relay
      if (user.petname) tag.push(user.petname);
      tags.push(tag);
    });

    return {
      kind: NOSTR_KINDS.CONTACT_LIST,
      pubkey: this.currentUserPubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: '', // NIP-02 content is typically empty or relay preferences JSON
    };
  }

  /**
   * Publish updated contact list to relays
   */
  private async publishContactList(): Promise<boolean> {
    try {
      const _event = this.buildContactListEvent();

      // Sign and publish via nostrService
      // This would integrate with identity service for signing
      // For now, return success optimistically
      
      logger.debug('Follow', `Publishing contact list with ${this.following.size} follows`);
      
      // TODO: Actually publish to relays
      // await nostrService.publishEvent(signedEvent);
      
      return true;
    } catch (error) {
      logger.error('Follow', 'Failed to publish contact list', error);
      return false;
    }
  }

  // ----------------------------------------
  // RELAY QUERIES
  // ----------------------------------------

  private async queryRelays(_filter: Filter): Promise<NostrEvent[]> {
    try {
      // This would use nostrService's pool
      // For now, return empty array
      const _relays = nostrService.getRelayUrls();
      // return await nostrService.pool.querySync(relays, filter);
      return [];
    } catch {
      return [];
    }
  }

  // ----------------------------------------
  // FEED FILTERING
  // ----------------------------------------

  /**
   * Get pubkeys to include in a "following" feed
   */
  getFollowingPubkeys(): string[] {
    return Array.from(this.following.keys());
  }

  /**
   * Create a filter for posts from followed users
   */
  createFollowingFeedFilter(opts: { since?: number; limit?: number } = {}): Filter {
    const pubkeys = this.getFollowingPubkeys();
    
    return {
      kinds: [1], // Short text notes
      authors: pubkeys.length > 0 ? pubkeys : undefined,
      since: opts.since,
      limit: opts.limit || 50,
    };
  }

  // ----------------------------------------
  // STATS
  // ----------------------------------------

  /**
   * Get follow statistics for current user
   */
  getStats(): FollowStats {
    return {
      followingCount: this.following.size,
      followersCount: this.followers.size,
    };
  }

  /**
   * Get follow statistics for any user
   */
  async getStatsForUser(pubkey: string): Promise<FollowStats> {
    // Fetch contact list to get following count
    const following = await this.fetchContactList(pubkey);
    
    // Followers count would require fetching all contact lists
    // This is expensive, so we might want to use a count estimate or cache
    
    return {
      followingCount: following.length,
      followersCount: 0, // Would need separate query
    };
  }

  // ----------------------------------------
  // PERSISTENCE
  // ----------------------------------------

  private readonly STORAGE_KEY = 'bitboard_follows_v1';

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return;

      const data = JSON.parse(stored);
      if (data.userPubkey !== this.currentUserPubkey) {
        return;
      }

      // Load following
      this.following.clear();
      for (const f of data.following || []) {
        this.following.set(f.pubkey, f);
      }

      // Load followers
      this.followers.clear();
      for (const f of data.followers || []) {
        this.followers.set(f.pubkey, f);
      }

      this.contactListEventId = data.contactListEventId;
      logger.debug('Follow', `Loaded ${this.following.size} following, ${this.followers.size} followers from storage`);
    } catch (error) {
      logger.warn('Follow', 'Failed to load from storage', error);
    }
  }

  private saveToStorage(): void {
    try {
      const data = {
        userPubkey: this.currentUserPubkey,
        following: Array.from(this.following.values()),
        followers: Array.from(this.followers.values()),
        contactListEventId: this.contactListEventId,
        savedAt: Date.now(),
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      logger.warn('Follow', 'Failed to save to storage', error);
    }
  }

  // ----------------------------------------
  // CLEANUP
  // ----------------------------------------

  cleanup(): void {
    this.saveToStorage();
    this.following.clear();
    this.followers.clear();
    this.currentUserPubkey = null;
    this.isInitialized = false;
    logger.info('Follow', 'Service cleaned up');
  }
}

// Export singleton
export const followServiceV2 = new FollowServiceV2();
export { FollowServiceV2 };
