// ============================================
// BADGE SERVICE (NIP-58)
// ============================================
// Handles achievement badges for BitBoard users.
// Badges provide reputation signals and gamification.
//
// Event kinds:
// - 30009: Badge Definition (what the badge is)
// - 8: Badge Award (giving a badge to someone)
// - 30008: Profile Badges (which badges a user displays)
//
// Examples:
// - "Founding Member" - Early adopter of a board
// - "Top Contributor" - High engagement in a board
// - "Verified Creator" - Confirmed identity

import { type Event as NostrEvent } from 'nostr-tools';
import {
  NOSTR_KINDS,
  type BadgeDefinition,
  type BadgeAward,
  type ProfileBadge,
  type UnsignedNostrEvent,
} from '../types';
import { nostrService } from './nostr/NostrService';
import { logger } from './loggingService';

// ============================================
// CONSTANTS
// ============================================

const BADGE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Pre-defined BitBoard badge types
export const BITBOARD_BADGES = {
  FOUNDING_MEMBER: 'bitboard-founding-member',
  TOP_CONTRIBUTOR: 'bitboard-top-contributor',
  VERIFIED_CREATOR: 'bitboard-verified-creator',
  EARLY_ADOPTER: 'bitboard-early-adopter',
  COMMUNITY_BUILDER: 'bitboard-community-builder',
  HELPFUL: 'bitboard-helpful',
} as const;

// ============================================
// BADGE SERVICE CLASS
// ============================================

class BadgeService {
  // Cache for badge definitions
  private badgeDefCache: Map<string, { badge: BadgeDefinition; timestamp: number }> = new Map();
  
  // Cache for user's awarded badges
  private userBadgesCache: Map<string, { badges: BadgeAward[]; timestamp: number }> = new Map();
  
  // Cache for user's profile badges (which they display)
  private profileBadgesCache: Map<string, { badges: ProfileBadge[]; timestamp: number }> = new Map();

  // ----------------------------------------
  // BADGE DEFINITION METHODS
  // ----------------------------------------

  /**
   * Build a badge definition event (kind 30009)
   */
  buildBadgeDefinition(args: {
    id: string;               // Unique badge identifier (d tag)
    name: string;
    description?: string;
    image?: string;           // Badge image URL
    thumbImage?: string;      // Thumbnail URL
    pubkey: string;           // Creator's pubkey
  }): UnsignedNostrEvent {
    const tags: string[][] = [
      ['d', args.id],
      ['name', args.name],
    ];

    if (args.description) {
      tags.push(['description', args.description]);
    }
    if (args.image) {
      tags.push(['image', args.image]);
    }
    if (args.thumbImage) {
      tags.push(['thumb', args.thumbImage]);
    }

    // Add BitBoard client tag
    tags.push(['client', 'bitboard']);

    return {
      kind: NOSTR_KINDS.BADGE_DEFINITION,
      pubkey: args.pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: '',
    };
  }

  /**
   * Parse a badge definition event into a BadgeDefinition object
   */
  parseBadgeDefinition(event: NostrEvent): BadgeDefinition | null {
    if (event.kind !== NOSTR_KINDS.BADGE_DEFINITION) {
      return null;
    }

    const getTag = (name: string): string | undefined => {
      const tag = event.tags.find(t => t[0] === name);
      return tag?.[1];
    };

    const id = getTag('d');
    const name = getTag('name');

    if (!id || !name) {
      logger.warn('Badge', 'Invalid badge definition: missing d or name tag');
      return null;
    }

    return {
      id,
      creatorPubkey: event.pubkey,
      name,
      description: getTag('description'),
      image: getTag('image'),
      thumbImage: getTag('thumb'),
      nostrEventId: event.id,
    };
  }

  /**
   * Fetch a badge definition by its address (pubkey:d)
   */
  async fetchBadgeDefinition(creatorPubkey: string, badgeId: string): Promise<BadgeDefinition | null> {
    const cacheKey = `${creatorPubkey}:${badgeId}`;
    
    // Check cache
    const cached = this.badgeDefCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < BADGE_CACHE_TTL_MS) {
      return cached.badge;
    }

    try {
      const event = await nostrService.fetchBadgeDefinition(creatorPubkey, badgeId);
      
      if (!event) {
        return null;
      }

      const badge = this.parseBadgeDefinition(event);

      if (badge) {
        this.badgeDefCache.set(cacheKey, { badge, timestamp: Date.now() });
      }

      return badge;
    } catch (error) {
      logger.error('Badge', 'Failed to fetch badge definition', error);
      return null;
    }
  }

  // ----------------------------------------
  // BADGE AWARD METHODS
  // ----------------------------------------

  /**
   * Build a badge award event (kind 8)
   */
  buildBadgeAward(args: {
    badgeDefinitionAddress: string;  // "30009:<pubkey>:<d>"
    awardedTo: string[];             // Pubkeys receiving the badge
    pubkey: string;                  // Awarder's pubkey (must be badge creator)
  }): UnsignedNostrEvent {
    const tags: string[][] = [
      ['a', args.badgeDefinitionAddress],
    ];

    // Add recipient pubkeys
    for (const recipientPubkey of args.awardedTo) {
      tags.push(['p', recipientPubkey]);
    }

    // Add BitBoard client tag
    tags.push(['client', 'bitboard']);

    return {
      kind: NOSTR_KINDS.BADGE_AWARD,
      pubkey: args.pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: '',
    };
  }

  /**
   * Parse a badge award event
   */
  parseBadgeAward(event: NostrEvent): BadgeAward | null {
    if (event.kind !== NOSTR_KINDS.BADGE_AWARD) {
      return null;
    }

    const aTag = event.tags.find(t => t[0] === 'a');
    if (!aTag || !aTag[1]) {
      logger.warn('Badge', 'Invalid badge award: missing a tag');
      return null;
    }

    const awardedTo = event.tags
      .filter(t => t[0] === 'p' && t[1])
      .map(t => t[1]);

    if (awardedTo.length === 0) {
      logger.warn('Badge', 'Invalid badge award: no recipients');
      return null;
    }

    return {
      id: event.id,
      badgeId: aTag[1],
      awardedTo,
      awardedBy: event.pubkey,
      timestamp: event.created_at * 1000,
    };
  }

  /**
   * Fetch badges awarded to a user
   */
  async fetchBadgesForUser(pubkey: string): Promise<BadgeAward[]> {
    // Check cache
    const cached = this.userBadgesCache.get(pubkey);
    if (cached && Date.now() - cached.timestamp < BADGE_CACHE_TTL_MS) {
      return cached.badges;
    }

    try {
      const events = await nostrService.fetchBadgeAwards(pubkey);

      const badges: BadgeAward[] = [];
      for (const event of events) {
        const award = this.parseBadgeAward(event);
        if (award && award.awardedTo.includes(pubkey)) {
          badges.push(award);
        }
      }

      // Sort by timestamp (newest first)
      badges.sort((a, b) => b.timestamp - a.timestamp);

      this.userBadgesCache.set(pubkey, { badges, timestamp: Date.now() });
      return badges;
    } catch (error) {
      logger.error('Badge', 'Failed to fetch badges for user', error);
      return [];
    }
  }

  // ----------------------------------------
  // PROFILE BADGES METHODS
  // ----------------------------------------

  /**
   * Build a profile badges event (kind 30008) - which badges user wants to display
   */
  buildProfileBadges(args: {
    badges: Array<{
      badgeDefinitionAddress: string;  // "30009:<pubkey>:<d>"
      awardEventId: string;            // The award event ID
    }>;
    pubkey: string;
  }): UnsignedNostrEvent {
    const tags: string[][] = [
      ['d', 'profile_badges'],  // Required d tag for parameterized replaceable
    ];

    // Add badge references
    for (const badge of args.badges) {
      tags.push(['a', badge.badgeDefinitionAddress]);
      tags.push(['e', badge.awardEventId]);
    }

    // Add BitBoard client tag
    tags.push(['client', 'bitboard']);

    return {
      kind: NOSTR_KINDS.BADGE_PROFILE,
      pubkey: args.pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: '',
    };
  }

  /**
   * Parse profile badges event
   */
  parseProfileBadges(event: NostrEvent): ProfileBadge[] {
    if (event.kind !== NOSTR_KINDS.BADGE_PROFILE) {
      return [];
    }

    const badges: ProfileBadge[] = [];
    const aTags = event.tags.filter(t => t[0] === 'a' && t[1]);
    const eTags = event.tags.filter(t => t[0] === 'e' && t[1]);

    // Pair a and e tags (they should alternate or be in order)
    for (let i = 0; i < Math.min(aTags.length, eTags.length); i++) {
      badges.push({
        badgeId: aTags[i][1],
        awardEventId: eTags[i][1],
      });
    }

    return badges;
  }

  /**
   * Fetch a user's displayed profile badges
   */
  async fetchProfileBadges(pubkey: string): Promise<ProfileBadge[]> {
    // Check cache
    const cached = this.profileBadgesCache.get(pubkey);
    if (cached && Date.now() - cached.timestamp < BADGE_CACHE_TTL_MS) {
      return cached.badges;
    }

    try {
      const event = await nostrService.fetchProfileBadges(pubkey);

      if (!event) {
        this.profileBadgesCache.set(pubkey, { badges: [], timestamp: Date.now() });
        return [];
      }

      const badges = this.parseProfileBadges(event);

      this.profileBadgesCache.set(pubkey, { badges, timestamp: Date.now() });
      return badges;
    } catch (error) {
      logger.error('Badge', 'Failed to fetch profile badges', error);
      return [];
    }
  }

  // ----------------------------------------
  // COMBINED BADGE INFO
  // ----------------------------------------

  /**
   * Get full badge info for a user (awards + definitions)
   */
  async getUserBadgeInfo(pubkey: string): Promise<Array<{
    award: BadgeAward;
    definition: BadgeDefinition | null;
  }>> {
    const awards = await this.fetchBadgesForUser(pubkey);
    
    const results = await Promise.all(
      awards.map(async (award) => {
        // Parse the badge address to get creator pubkey and badge id
        const parts = award.badgeId.split(':');
        if (parts.length >= 3) {
          const [, creatorPubkey, ...badgeIdParts] = parts;
          const badgeId = badgeIdParts.join(':');
          const definition = await this.fetchBadgeDefinition(creatorPubkey, badgeId);
          return { award, definition };
        }
        return { award, definition: null };
      })
    );

    return results;
  }

  /**
   * Get displayed badges with full info for a profile
   */
  async getDisplayedBadges(pubkey: string): Promise<Array<{
    profileBadge: ProfileBadge;
    definition: BadgeDefinition | null;
  }>> {
    const profileBadges = await this.fetchProfileBadges(pubkey);

    const results = await Promise.all(
      profileBadges.map(async (profileBadge) => {
        const parts = profileBadge.badgeId.split(':');
        if (parts.length >= 3) {
          const [, creatorPubkey, ...badgeIdParts] = parts;
          const badgeId = badgeIdParts.join(':');
          const definition = await this.fetchBadgeDefinition(creatorPubkey, badgeId);
          return { profileBadge, definition };
        }
        return { profileBadge, definition: null };
      })
    );

    return results;
  }

  // ----------------------------------------
  // BITBOARD-SPECIFIC BADGES
  // ----------------------------------------

  /**
   * Create a BitBoard badge definition address
   */
  createBitBoardBadgeAddress(creatorPubkey: string, badgeType: keyof typeof BITBOARD_BADGES): string {
    return `${NOSTR_KINDS.BADGE_DEFINITION}:${creatorPubkey}:${BITBOARD_BADGES[badgeType]}`;
  }

  /**
   * Check if a user has a specific BitBoard badge
   */
  async hasBitBoardBadge(
    userPubkey: string,
    badgeType: keyof typeof BITBOARD_BADGES,
    badgeCreatorPubkey: string
  ): Promise<boolean> {
    const awards = await this.fetchBadgesForUser(userPubkey);
    const expectedAddress = this.createBitBoardBadgeAddress(badgeCreatorPubkey, badgeType);
    return awards.some(award => award.badgeId === expectedAddress);
  }

  // ----------------------------------------
  // CACHE MANAGEMENT
  // ----------------------------------------

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.badgeDefCache.clear();
    this.userBadgesCache.clear();
    this.profileBadgesCache.clear();
  }

  /**
   * Invalidate cache for a specific user
   */
  invalidateUserCache(pubkey: string): void {
    this.userBadgesCache.delete(pubkey);
    this.profileBadgesCache.delete(pubkey);
  }
}

// Export singleton
export const badgeService = new BadgeService();
export { BadgeService };
