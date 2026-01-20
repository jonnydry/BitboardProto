// ============================================
// COMMUNITY SERVICE (NIP-72)
// ============================================
// Handles moderated communities (Reddit-style) for BitBoard.
// Communities have moderators who approve posts before visibility.
//
// Event kinds:
// - 34550: Community Definition (what the community is, who moderates)
// - 4550: Post Approval (moderator approves a post for the community)
//
// Flow:
// 1. User submits post with community 'a' tag
// 2. Post is "pending" until moderator approves
// 3. Moderator publishes approval event (kind 4550)
// 4. Clients show post only after approval exists

import { type Event as NostrEvent, type Filter } from 'nostr-tools';
import {
  NOSTR_KINDS,
  type Community,
  type CommunityApproval,
  type UnsignedNostrEvent,
} from '../types';
import { nostrService } from './nostr/NostrService';
import { logger } from './loggingService';

// ============================================
// CONSTANTS
// ============================================

const COMMUNITY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================
// COMMUNITY SERVICE CLASS
// ============================================

class CommunityService {
  // Cache for community definitions
  private communityCache: Map<string, { community: Community; timestamp: number }> = new Map();
  
  // Cache for approvals per community
  private approvalCache: Map<string, { approvals: CommunityApproval[]; timestamp: number }> = new Map();
  
  // Pending posts awaiting approval (local tracking)
  private pendingPosts: Map<string, Set<string>> = new Map(); // communityId -> Set<postEventId>

  // ----------------------------------------
  // COMMUNITY DEFINITION METHODS
  // ----------------------------------------

  /**
   * Build a community definition event (kind 34550)
   */
  buildCommunityDefinition(args: {
    id: string;               // Community identifier (d tag)
    name: string;
    description?: string;
    image?: string;
    rules?: string;
    moderators: string[];     // Pubkeys of moderators
    relays?: string[];        // Preferred relays
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
    if (args.rules) {
      tags.push(['rules', args.rules]);
    }

    // Add moderators (p tags)
    for (const moderator of args.moderators) {
      tags.push(['p', moderator, '', 'moderator']);
    }

    // Add preferred relays
    if (args.relays) {
      for (const relay of args.relays) {
        tags.push(['relay', relay]);
      }
    }

    // Add BitBoard client tag
    tags.push(['client', 'bitboard']);

    return {
      kind: NOSTR_KINDS.COMMUNITY_DEFINITION,
      pubkey: args.pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: '',
    };
  }

  /**
   * Parse a community definition event
   */
  parseCommunityDefinition(event: NostrEvent): Community | null {
    if (event.kind !== NOSTR_KINDS.COMMUNITY_DEFINITION) {
      return null;
    }

    const getTag = (name: string): string | undefined => {
      const tag = event.tags.find(t => t[0] === name);
      return tag?.[1];
    };

    const id = getTag('d');
    const name = getTag('name');

    if (!id || !name) {
      logger.warn('Community', 'Invalid community definition: missing d or name tag');
      return null;
    }

    // Get moderators (p tags with 'moderator' marker)
    const moderators = event.tags
      .filter(t => t[0] === 'p' && t[3] === 'moderator')
      .map(t => t[1]);

    // Get relays
    const relays = event.tags
      .filter(t => t[0] === 'relay')
      .map(t => t[1]);

    return {
      id,
      name,
      description: getTag('description'),
      image: getTag('image'),
      creatorPubkey: event.pubkey,
      moderators,
      rules: getTag('rules'),
      relays: relays.length > 0 ? relays : undefined,
      nostrEventId: event.id,
    };
  }

  /**
   * Fetch a community definition
   */
  async fetchCommunity(creatorPubkey: string, communityId: string): Promise<Community | null> {
    const cacheKey = `${creatorPubkey}:${communityId}`;
    
    // Check cache
    const cached = this.communityCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < COMMUNITY_CACHE_TTL_MS) {
      return cached.community;
    }

    try {
      const event = await nostrService.fetchCommunityDefinition(creatorPubkey, communityId);
      
      if (!event) {
        return null;
      }

      const community = this.parseCommunityDefinition(event);

      if (community) {
        this.communityCache.set(cacheKey, { community, timestamp: Date.now() });
      }

      return community;
    } catch (error) {
      logger.error('Community', 'Failed to fetch community', error);
      return null;
    }
  }

  /**
   * Fetch all communities (with BitBoard tag)
   */
  async fetchCommunities(opts: { limit?: number } = {}): Promise<Community[]> {
    try {
      const events = await nostrService.fetchCommunities(opts);
      
      const communities: Community[] = [];
      for (const event of events) {
        const community = this.parseCommunityDefinition(event);
        if (community) {
          communities.push(community);
          // Update cache
          const cacheKey = `${community.creatorPubkey}:${community.id}`;
          this.communityCache.set(cacheKey, { community, timestamp: Date.now() });
        }
      }

      return communities;
    } catch (error) {
      logger.error('Community', 'Failed to fetch communities', error);
      return [];
    }
  }

  // ----------------------------------------
  // POST APPROVAL METHODS
  // ----------------------------------------

  /**
   * Build a post approval event (kind 4550)
   */
  buildPostApproval(args: {
    communityAddress: string;   // "34550:<pubkey>:<d>"
    postEventId: string;        // Event ID of the post being approved
    postAuthorPubkey: string;   // Author of the approved post
    pubkey: string;             // Moderator's pubkey
  }): UnsignedNostrEvent {
    const tags: string[][] = [
      ['a', args.communityAddress],
      ['e', args.postEventId],
      ['p', args.postAuthorPubkey],
      ['k', '1'], // Kind of approved event (short text note)
    ];

    // Add BitBoard client tag
    tags.push(['client', 'bitboard']);

    return {
      kind: NOSTR_KINDS.COMMUNITY_APPROVAL,
      pubkey: args.pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: '',
    };
  }

  /**
   * Parse a post approval event
   */
  parsePostApproval(event: NostrEvent): CommunityApproval | null {
    if (event.kind !== NOSTR_KINDS.COMMUNITY_APPROVAL) {
      return null;
    }

    const aTag = event.tags.find(t => t[0] === 'a');
    const eTag = event.tags.find(t => t[0] === 'e');

    if (!aTag?.[1] || !eTag?.[1]) {
      logger.warn('Community', 'Invalid approval: missing a or e tag');
      return null;
    }

    return {
      id: event.id,
      communityId: aTag[1],
      postEventId: eTag[1],
      approverPubkey: event.pubkey,
      timestamp: event.created_at * 1000,
    };
  }

  /**
   * Fetch approvals for a community
   */
  async fetchApprovalsForCommunity(communityAddress: string): Promise<CommunityApproval[]> {
    // Check cache
    const cached = this.approvalCache.get(communityAddress);
    if (cached && Date.now() - cached.timestamp < COMMUNITY_CACHE_TTL_MS) {
      return cached.approvals;
    }

    try {
      const events = await nostrService.fetchCommunityApprovals(communityAddress);

      const approvals: CommunityApproval[] = [];
      for (const event of events) {
        const approval = this.parsePostApproval(event);
        if (approval) {
          approvals.push(approval);
        }
      }

      // Sort by timestamp (newest first)
      approvals.sort((a, b) => b.timestamp - a.timestamp);

      this.approvalCache.set(communityAddress, { approvals, timestamp: Date.now() });
      return approvals;
    } catch (error) {
      logger.error('Community', 'Failed to fetch approvals', error);
      return [];
    }
  }

  /**
   * Check if a post is approved for a community
   */
  async isPostApproved(communityAddress: string, postEventId: string): Promise<boolean> {
    const approvals = await this.fetchApprovalsForCommunity(communityAddress);
    return approvals.some(a => a.postEventId === postEventId);
  }

  /**
   * Get approved post IDs for a community
   */
  async getApprovedPostIds(communityAddress: string): Promise<string[]> {
    const approvals = await this.fetchApprovalsForCommunity(communityAddress);
    return approvals.map(a => a.postEventId);
  }

  // ----------------------------------------
  // MODERATION HELPERS
  // ----------------------------------------

  /**
   * Check if a pubkey is a moderator of a community
   */
  async isModerator(communityAddress: string, pubkey: string): Promise<boolean> {
    // Parse community address: "34550:<creatorPubkey>:<id>"
    const parts = communityAddress.split(':');
    if (parts.length < 3) return false;

    const [, creatorPubkey, ...idParts] = parts;
    const communityId = idParts.join(':');

    const community = await this.fetchCommunity(creatorPubkey, communityId);
    if (!community) return false;

    // Creator is always a moderator
    if (community.creatorPubkey === pubkey) return true;

    return community.moderators.includes(pubkey);
  }

  /**
   * Get posts pending approval for a community (for moderator view)
   */
  async getPendingPosts(communityAddress: string): Promise<string[]> {
    return Array.from(this.pendingPosts.get(communityAddress) || []);
  }

  /**
   * Mark a post as pending approval (local tracking)
   */
  markPostPending(communityAddress: string, postEventId: string): void {
    let pending = this.pendingPosts.get(communityAddress);
    if (!pending) {
      pending = new Set();
      this.pendingPosts.set(communityAddress, pending);
    }
    pending.add(postEventId);
  }

  /**
   * Remove a post from pending (after approval or rejection)
   */
  unmarkPostPending(communityAddress: string, postEventId: string): void {
    const pending = this.pendingPosts.get(communityAddress);
    if (pending) {
      pending.delete(postEventId);
    }
  }

  // ----------------------------------------
  // POST FILTERING FOR COMMUNITIES
  // ----------------------------------------

  /**
   * Filter posts to only show approved ones for a community
   */
  async filterApprovedPosts<T extends { nostrEventId?: string }>(
    communityAddress: string,
    posts: T[]
  ): Promise<T[]> {
    const approvedIds = await this.getApprovedPostIds(communityAddress);
    const approvedSet = new Set(approvedIds);

    return posts.filter(post => 
      post.nostrEventId && approvedSet.has(post.nostrEventId)
    );
  }

  /**
   * Get community address from pubkey and id
   */
  getCommunityAddress(creatorPubkey: string, communityId: string): string {
    return `${NOSTR_KINDS.COMMUNITY_DEFINITION}:${creatorPubkey}:${communityId}`;
  }

  // ----------------------------------------
  // CACHE MANAGEMENT
  // ----------------------------------------

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.communityCache.clear();
    this.approvalCache.clear();
    this.pendingPosts.clear();
  }

  /**
   * Invalidate cache for a specific community
   */
  invalidateCommunityCache(communityAddress: string): void {
    // Parse address to get cache key
    const parts = communityAddress.split(':');
    if (parts.length >= 3) {
      const cacheKey = `${parts[1]}:${parts.slice(2).join(':')}`;
      this.communityCache.delete(cacheKey);
    }
    this.approvalCache.delete(communityAddress);
  }
}

// Export singleton
export const communityService = new CommunityService();
export { CommunityService };
