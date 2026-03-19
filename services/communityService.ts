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

import { nip19, type Event as NostrEvent } from 'nostr-tools';
import {
  NOSTR_KINDS,
  BoardType,
  type Board,
  type Community,
  type CommunityApproval,
  type Post,
  type UnsignedNostrEvent,
} from '../types';
import { nostrService } from './nostr/NostrService';
import { logger } from './loggingService';
import { inputValidator } from './inputValidator';

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
  private approvalCache: Map<string, { approvals: CommunityApproval[]; timestamp: number }> =
    new Map();

  // Pending posts awaiting approval (local tracking)
  private pendingPosts: Map<string, Set<string>> = new Map(); // communityId -> Set<postEventId>

  // ----------------------------------------
  // COMMUNITY DEFINITION METHODS
  // ----------------------------------------

  /**
   * Build a community definition event (kind 34550)
   */
  buildCommunityDefinition(args: {
    id: string; // Community identifier (d tag)
    name: string;
    description?: string;
    image?: string;
    rules?: string;
    moderators: string[]; // Pubkeys of moderators
    relays?: string[]; // Preferred relays
    pubkey: string; // Creator's pubkey
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
      const tag = event.tags.find((t) => t[0] === name);
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
      .filter((t) => t[0] === 'p' && t[3] === 'moderator')
      .map((t) => t[1]);

    // Get relays and markers from NIP-72 community definition
    const relayTags = event.tags.filter((t) => t[0] === 'relay' && t[1]);
    const relays = relayTags.map((t) => t[1]);
    const approvalRelays = relayTags.filter((t) => !t[2] || t[2] === 'approvals').map((t) => t[1]);
    const authorRelays = relayTags.filter((t) => !t[2] || t[2] === 'author').map((t) => t[1]);
    const requestRelays = relayTags.filter((t) => !t[2] || t[2] === 'requests').map((t) => t[1]);

    return {
      id,
      address: this.getCommunityAddress(event.pubkey, id),
      name,
      description: getTag('description'),
      image: getTag('image'),
      creatorPubkey: event.pubkey,
      moderators,
      rules: getTag('rules'),
      relays: relays.length > 0 ? relays : undefined,
      approvalRelays: approvalRelays.length > 0 ? approvalRelays : undefined,
      authorRelays: authorRelays.length > 0 ? authorRelays : undefined,
      requestRelays: requestRelays.length > 0 ? requestRelays : undefined,
      nostrEventId: event.id,
      createdAt: event.created_at * 1000,
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
  async fetchCommunities(opts: { limit?: number; clientTag?: string } = {}): Promise<Community[]> {
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
    communityAddress: string; // "34550:<pubkey>:<d>"
    postEventId: string; // Event ID of the post being approved
    postAuthorPubkey: string; // Author of the approved post
    pubkey: string; // Moderator's pubkey
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

    const aTag = event.tags.find((t) => t[0] === 'a');
    const eTag = event.tags.find((t) => t[0] === 'e');

    if (!aTag?.[1] || !eTag?.[1]) {
      logger.warn('Community', 'Invalid approval: missing a or e tag');
      return null;
    }

    return {
      id: event.id,
      communityAddress: aTag[1],
      postEventId: eTag[1],
      approvedEventKind: Number(event.tags.find((t) => t[0] === 'k')?.[1]) || undefined,
      approverPubkey: event.pubkey,
      timestamp: event.created_at * 1000,
    };
  }

  private parseApprovedEventFromApproval(
    approvalEvent: NostrEvent,
    postEventId: string,
  ): NostrEvent | null {
    const content = approvalEvent.content?.trim();
    if (!content) return null;

    try {
      const parsed = JSON.parse(content) as Partial<NostrEvent>;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof parsed.kind !== 'number' ||
        typeof parsed.pubkey !== 'string' ||
        typeof parsed.created_at !== 'number' ||
        !Array.isArray(parsed.tags) ||
        typeof parsed.content !== 'string'
      ) {
        return null;
      }

      if (parsed.id && parsed.id !== postEventId) {
        return null;
      }

      return {
        id: parsed.id || postEventId,
        sig: typeof parsed.sig === 'string' ? parsed.sig : '',
        kind: parsed.kind,
        pubkey: parsed.pubkey,
        created_at: parsed.created_at,
        tags: parsed.tags as string[][],
        content: parsed.content,
      };
    } catch {
      return null;
    }
  }

  /**
   * Fetch approvals for a community
   */
  async fetchApprovalsForCommunity(
    communityAddress: string,
    relayHints?: string[],
  ): Promise<CommunityApproval[]> {
    // Check cache
    const cached = this.approvalCache.get(communityAddress);
    if (cached && Date.now() - cached.timestamp < COMMUNITY_CACHE_TTL_MS) {
      return cached.approvals;
    }

    try {
      const events = await nostrService.fetchCommunityApprovals(communityAddress, relayHints);

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
    return approvals.some((a) => a.postEventId === postEventId);
  }

  /**
   * Get approved post IDs for a community
   */
  async getApprovedPostIds(communityAddress: string): Promise<string[]> {
    const approvals = await this.fetchApprovalsForCommunity(communityAddress);
    return approvals.map((a) => a.postEventId);
  }

  upsertApprovalEvent(event: NostrEvent): CommunityApproval | null {
    const approval = this.parsePostApproval(event);
    if (!approval) return null;

    const cached = this.approvalCache.get(approval.communityAddress);
    const nextApprovals = cached?.approvals ? [...cached.approvals] : [];
    const existingIndex = nextApprovals.findIndex((candidate) => candidate.id === approval.id);
    if (existingIndex >= 0) {
      nextApprovals[existingIndex] = approval;
    } else {
      nextApprovals.unshift(approval);
    }

    nextApprovals.sort((a, b) => b.timestamp - a.timestamp);
    this.approvalCache.set(approval.communityAddress, {
      approvals: nextApprovals,
      timestamp: Date.now(),
    });

    return approval;
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
    posts: T[],
  ): Promise<T[]> {
    const approvedIds = await this.getApprovedPostIds(communityAddress);
    const approvedSet = new Set(approvedIds);

    return posts.filter((post) => post.nostrEventId && approvedSet.has(post.nostrEventId));
  }

  /**
   * Get community address from pubkey and id
   */
  getCommunityAddress(creatorPubkey: string, communityId: string): string {
    return `${NOSTR_KINDS.COMMUNITY_DEFINITION}:${creatorPubkey}:${communityId}`;
  }

  parseCommunityAddress(address: string): { creatorPubkey: string; communityId: string } | null {
    const parts = address.split(':');
    if (parts.length < 3) return null;
    if (parts[0] !== String(NOSTR_KINDS.COMMUNITY_DEFINITION)) return null;

    const [, creatorPubkey, ...communityIdParts] = parts;
    const communityId = communityIdParts.join(':');
    if (!creatorPubkey || !communityId) return null;

    return { creatorPubkey, communityId };
  }

  resolveCommunityReference(
    input: string,
  ): { address: string; creatorPubkey: string; communityId: string } | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    const parsedAddress = this.parseCommunityAddress(trimmed);
    if (parsedAddress) {
      return { address: trimmed, ...parsedAddress };
    }

    try {
      const decoded = nip19.decode(trimmed);
      if (decoded.type !== 'naddr') return null;
      const data = decoded.data as {
        identifier?: string;
        pubkey?: string;
        kind?: number;
      };
      if (data.kind !== NOSTR_KINDS.COMMUNITY_DEFINITION || !data.pubkey || !data.identifier) {
        return null;
      }

      return {
        address: this.getCommunityAddress(data.pubkey, data.identifier),
        creatorPubkey: data.pubkey,
        communityId: data.identifier,
      };
    } catch {
      return null;
    }
  }

  communityToBoard(community: Community): Board {
    const communityAddress =
      community.address || this.getCommunityAddress(community.creatorPubkey, community.id);
    return {
      id: communityAddress,
      canonicalId: communityAddress,
      communityAddress,
      source: 'nostr-community',
      isExternal: true,
      isReadOnly: true,
      name: community.name,
      description: community.description || 'External Nostr community',
      isPublic: true,
      memberCount: community.moderators.length + 1,
      type: BoardType.TOPIC,
      nostrEventId: community.nostrEventId,
      createdBy: community.creatorPubkey,
      relayHints: community.relays,
      approvalRelayHints: community.approvalRelays,
      authorRelayHints: community.authorRelays,
      requestRelayHints: community.requestRelays,
    };
  }

  async fetchApprovedPosts(communityAddress: string, relayHints?: string[]): Promise<NostrEvent[]> {
    const approvals = await this.fetchApprovalsForCommunity(communityAddress, relayHints);
    const approvedIds = [...new Set(approvals.map((approval) => approval.postEventId))];
    if (approvedIds.length === 0) return [];

    const fetchedEvents = await nostrService.fetchEventsByIds(approvedIds, {
      kinds: [NOSTR_KINDS.POST, NOSTR_KINDS.COMMUNITY_POST],
      relayHints,
      predicate: (event) =>
        event.kind === NOSTR_KINDS.POST || event.kind === NOSTR_KINDS.COMMUNITY_POST,
    });
    const eventsById = new Map(fetchedEvents.map((event) => [event.id, event]));

    for (const approvalEvent of approvals) {
      if (eventsById.has(approvalEvent.postEventId)) continue;
      const sourceApprovalEvent = await nostrService.fetchEventsByIds([approvalEvent.id], {
        kinds: [NOSTR_KINDS.COMMUNITY_APPROVAL],
        relayHints,
      });
      const approvalPayload = sourceApprovalEvent[0];
      if (!approvalPayload) continue;
      const embeddedEvent = this.parseApprovedEventFromApproval(
        approvalPayload,
        approvalEvent.postEventId,
      );
      if (embeddedEvent) {
        eventsById.set(embeddedEvent.id, embeddedEvent);
      }
    }

    return approvedIds
      .map((id) => eventsById.get(id))
      .filter((event): event is NostrEvent => !!event);
  }

  async fetchApprovedPostById(
    communityAddress: string,
    postEventId: string,
    relayHints?: string[],
  ): Promise<NostrEvent | null> {
    const approvals = await this.fetchApprovalsForCommunity(communityAddress, relayHints);
    const approvedIds = approvals.map((approval) => approval.postEventId);
    if (!approvedIds.includes(postEventId)) {
      return null;
    }

    const events = await nostrService.fetchEventsByIds([postEventId], {
      kinds: [NOSTR_KINDS.POST, NOSTR_KINDS.COMMUNITY_POST],
      relayHints,
      predicate: (event) =>
        event.kind === NOSTR_KINDS.POST || event.kind === NOSTR_KINDS.COMMUNITY_POST,
    });
    const fetched = events.find((event) => event.id === postEventId) ?? null;
    if (fetched) return fetched;

    const matchingApproval = approvals.find((approval) => approval.postEventId === postEventId);
    if (!matchingApproval) return null;
    const approvalEvents = await nostrService.fetchEventsByIds([matchingApproval.id], {
      kinds: [NOSTR_KINDS.COMMUNITY_APPROVAL],
      relayHints,
    });
    return approvalEvents[0]
      ? this.parseApprovedEventFromApproval(approvalEvents[0], postEventId)
      : null;
  }

  eventToCommunityPost(event: NostrEvent, boardId: string, communityAddress: string): Post | null {
    if (event.kind !== NOSTR_KINDS.POST && event.kind !== NOSTR_KINDS.COMMUNITY_POST) {
      return null;
    }

    const titleTag = event.tags.find((tag) => tag[0] === 'title')?.[1]?.trim();
    const rawContent = inputValidator.validatePostContent(event.content ?? '') ?? '';
    const firstLine = rawContent
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean);
    const fallbackTitle = firstLine ? firstLine.slice(0, 80) : 'Imported from Nostr';
    const title = inputValidator.validateTitle(titleTag || fallbackTitle) ?? 'Imported from Nostr';
    const tags = inputValidator.validateTags(
      event.tags.filter((tag) => tag[0] === 't' && tag[1]).map((tag) => tag[1]),
    );

    return {
      id: event.id,
      nostrEventId: event.id,
      boardId,
      source: 'nostr-community',
      sourceEventKind: event.kind,
      communityAddress,
      title,
      author: nostrService.getDisplayName(event.pubkey),
      authorPubkey: event.pubkey,
      content: rawContent,
      timestamp: event.created_at * 1000,
      score: 0,
      commentCount: 0,
      tags,
      comments: [],
      upvotes: 0,
      downvotes: 0,
    };
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
