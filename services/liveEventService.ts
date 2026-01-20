// ============================================
// LIVE EVENT SERVICE (NIP-53)
// ============================================
// Handles live streaming events and activities for BitBoard.
// Enables AMAs, community calls, live discussions, etc.
//
// Event kinds:
// - 30311: Live Event (parameterized replaceable)
// - 1311: Live Chat Message (associated with a live event)
//
// Key fields:
// - d tag: Unique identifier for the event
// - title tag: Event title
// - status tag: "planned" | "live" | "ended"
// - starts tag: Unix timestamp when event starts
// - streaming tag: URL to the stream
// - p tags: Participants with roles (host, speaker, participant)

import { type Event as NostrEvent, type Filter } from 'nostr-tools';
import {
  NOSTR_KINDS,
  type LiveEvent,
  type UnsignedNostrEvent,
} from '../types';
import { nostrService } from './nostr/NostrService';
import { logger } from './loggingService';

// ============================================
// TYPES
// ============================================

export interface LiveChatMessage {
  id: string;
  eventId: string;           // Live event this message belongs to
  authorPubkey: string;
  content: string;
  timestamp: number;
}

export type LiveEventStatus = 'planned' | 'live' | 'ended';

// ============================================
// CONSTANTS
// ============================================

const LIVE_CACHE_TTL_MS = 30 * 1000; // 30 seconds (live events change frequently)

// ============================================
// LIVE EVENT SERVICE CLASS
// ============================================

class LiveEventService {
  // Cache for live events
  private eventCache: Map<string, { event: LiveEvent; timestamp: number }> = new Map();
  
  // Active chat subscriptions
  private chatSubscriptions: Map<string, string> = new Map(); // eventId -> subscriptionId

  // ----------------------------------------
  // LIVE EVENT BUILDING
  // ----------------------------------------

  /**
   * Build a live event definition (kind 30311)
   */
  buildLiveEvent(args: {
    id: string;                 // Unique identifier (d tag)
    title: string;
    summary?: string;
    image?: string;
    streamingUrl?: string;
    status: LiveEventStatus;
    startsAt?: number;          // Unix timestamp
    endsAt?: number;            // Unix timestamp
    hashtags?: string[];
    participants?: Array<{
      pubkey: string;
      role: 'host' | 'speaker' | 'participant';
      relay?: string;
    }>;
    pubkey: string;             // Host's pubkey
  }): UnsignedNostrEvent {
    const now = Math.floor(Date.now() / 1000);
    const tags: string[][] = [
      ['d', args.id],
      ['title', args.title],
      ['status', args.status],
    ];

    if (args.summary) {
      tags.push(['summary', args.summary]);
    }

    if (args.image) {
      tags.push(['image', args.image]);
    }

    if (args.streamingUrl) {
      tags.push(['streaming', args.streamingUrl]);
    }

    if (args.startsAt) {
      tags.push(['starts', args.startsAt.toString()]);
    }

    if (args.endsAt) {
      tags.push(['ends', args.endsAt.toString()]);
    }

    // Add participants
    if (args.participants) {
      for (const p of args.participants) {
        const pTag = ['p', p.pubkey, p.relay || '', p.role];
        tags.push(pTag);
      }
    }

    // Add hashtags
    if (args.hashtags) {
      for (const tag of args.hashtags) {
        tags.push(['t', tag.toLowerCase().replace(/^#/, '')]);
      }
    }

    // Add BitBoard client tag
    tags.push(['client', 'bitboard']);

    return {
      kind: NOSTR_KINDS.LIVE_EVENT,
      pubkey: args.pubkey,
      created_at: now,
      tags,
      content: '',
    };
  }

  /**
   * Build a live chat message (kind 1311)
   */
  buildLiveChatMessage(args: {
    liveEventAddress: string;   // "30311:<pubkey>:<d>"
    content: string;
    pubkey: string;
  }): UnsignedNostrEvent {
    const tags: string[][] = [
      ['a', args.liveEventAddress],
    ];

    // Add BitBoard client tag
    tags.push(['client', 'bitboard']);

    return {
      kind: NOSTR_KINDS.LIVE_CHAT,
      pubkey: args.pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: args.content,
    };
  }

  // ----------------------------------------
  // LIVE EVENT PARSING
  // ----------------------------------------

  /**
   * Parse a live event (kind 30311)
   */
  parseLiveEvent(event: NostrEvent): LiveEvent | null {
    if (event.kind !== NOSTR_KINDS.LIVE_EVENT) {
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
    const status = getTag('status') as LiveEventStatus;

    if (!id || !title) {
      logger.warn('LiveEvent', 'Invalid live event: missing d or title tag');
      return null;
    }

    // Parse participants
    const participants: LiveEvent['participants'] = event.tags
      .filter(t => t[0] === 'p' && t[1])
      .map(t => ({
        pubkey: t[1],
        role: (t[3] as 'host' | 'speaker' | 'participant') || 'participant',
        relay: t[2] || undefined,
      }));

    const startsAtStr = getTag('starts');
    const endsAtStr = getTag('ends');

    return {
      id,
      title,
      summary: getTag('summary'),
      image: getTag('image'),
      streamingUrl: getTag('streaming'),
      recordingUrl: getTag('recording'),
      status: status || 'planned',
      startsAt: startsAtStr ? parseInt(startsAtStr, 10) * 1000 : undefined,
      endsAt: endsAtStr ? parseInt(endsAtStr, 10) * 1000 : undefined,
      hostPubkey: event.pubkey,
      participants,
      hashtags: getAllTags('t'),
      nostrEventId: event.id,
    };
  }

  /**
   * Parse a live chat message (kind 1311)
   */
  parseLiveChatMessage(event: NostrEvent): LiveChatMessage | null {
    if (event.kind !== NOSTR_KINDS.LIVE_CHAT) {
      return null;
    }

    const aTag = event.tags.find(t => t[0] === 'a');
    if (!aTag?.[1]) {
      return null;
    }

    return {
      id: event.id,
      eventId: aTag[1],
      authorPubkey: event.pubkey,
      content: event.content,
      timestamp: event.created_at * 1000,
    };
  }

  // ----------------------------------------
  // LIVE EVENT FETCHING
  // ----------------------------------------

  /**
   * Fetch a live event by host and id
   */
  async fetchLiveEvent(hostPubkey: string, eventId: string): Promise<LiveEvent | null> {
    const cacheKey = `${hostPubkey}:${eventId}`;
    
    const cached = this.eventCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < LIVE_CACHE_TTL_MS) {
      return cached.event;
    }

    try {
      const event = await nostrService.fetchLiveEvent(hostPubkey, eventId);
      if (!event) return null;

      const liveEvent = this.parseLiveEvent(event);
      if (liveEvent) {
        this.eventCache.set(cacheKey, { event: liveEvent, timestamp: Date.now() });
      }

      return liveEvent;
    } catch (error) {
      logger.error('LiveEvent', 'Failed to fetch live event', error);
      return null;
    }
  }

  /**
   * Fetch currently live events
   */
  async fetchLiveNow(opts: { limit?: number } = {}): Promise<LiveEvent[]> {
    try {
      const events = await nostrService.fetchLiveEvents({ status: 'live', limit: opts.limit });
      
      const liveEvents: LiveEvent[] = [];
      for (const event of events) {
        const parsed = this.parseLiveEvent(event);
        if (parsed) {
          liveEvents.push(parsed);
        }
      }

      return liveEvents;
    } catch (error) {
      logger.error('LiveEvent', 'Failed to fetch live events', error);
      return [];
    }
  }

  /**
   * Fetch upcoming events
   */
  async fetchUpcoming(opts: { limit?: number } = {}): Promise<LiveEvent[]> {
    try {
      const events = await nostrService.fetchLiveEvents({ status: 'planned', limit: opts.limit });
      
      const liveEvents: LiveEvent[] = [];
      for (const event of events) {
        const parsed = this.parseLiveEvent(event);
        if (parsed && parsed.startsAt && parsed.startsAt > Date.now()) {
          liveEvents.push(parsed);
        }
      }

      // Sort by start time (soonest first)
      return liveEvents.sort((a, b) => (a.startsAt || 0) - (b.startsAt || 0));
    } catch (error) {
      logger.error('LiveEvent', 'Failed to fetch upcoming events', error);
      return [];
    }
  }

  /**
   * Fetch past events (ended)
   */
  async fetchPastEvents(opts: { limit?: number } = {}): Promise<LiveEvent[]> {
    try {
      const events = await nostrService.fetchLiveEvents({ status: 'ended', limit: opts.limit });
      
      const liveEvents: LiveEvent[] = [];
      for (const event of events) {
        const parsed = this.parseLiveEvent(event);
        if (parsed) {
          liveEvents.push(parsed);
        }
      }

      // Sort by end time (most recent first)
      return liveEvents.sort((a, b) => (b.endsAt || 0) - (a.endsAt || 0));
    } catch (error) {
      logger.error('LiveEvent', 'Failed to fetch past events', error);
      return [];
    }
  }

  // ----------------------------------------
  // LIVE CHAT
  // ----------------------------------------

  /**
   * Fetch chat messages for a live event
   */
  async fetchChatMessages(liveEventAddress: string, opts: {
    limit?: number;
    since?: number;
  } = {}): Promise<LiveChatMessage[]> {
    try {
      const events = await nostrService.fetchLiveChatMessages(liveEventAddress, opts);
      
      const messages: LiveChatMessage[] = [];
      for (const event of events) {
        const parsed = this.parseLiveChatMessage(event);
        if (parsed) {
          messages.push(parsed);
        }
      }

      // Sort by timestamp (oldest first for chat)
      return messages.sort((a, b) => a.timestamp - b.timestamp);
    } catch (error) {
      logger.error('LiveEvent', 'Failed to fetch chat messages', error);
      return [];
    }
  }

  /**
   * Subscribe to live chat messages
   */
  subscribeToChatMessages(
    liveEventAddress: string,
    onMessage: (message: LiveChatMessage) => void
  ): () => void {
    // Unsubscribe from any existing subscription for this event
    const existingSubId = this.chatSubscriptions.get(liveEventAddress);
    if (existingSubId) {
      nostrService.unsubscribe(existingSubId);
    }

    const subscriptionId = nostrService.subscribeToLiveChat(
      liveEventAddress,
      (event: NostrEvent) => {
        const message = this.parseLiveChatMessage(event);
        if (message) {
          onMessage(message);
        }
      }
    );

    this.chatSubscriptions.set(liveEventAddress, subscriptionId);

    return () => {
      nostrService.unsubscribe(subscriptionId);
      this.chatSubscriptions.delete(liveEventAddress);
    };
  }

  // ----------------------------------------
  // LIVE EVENT ADDRESS UTILITIES
  // ----------------------------------------

  /**
   * Create a live event address
   */
  getLiveEventAddress(hostPubkey: string, eventId: string): string {
    return `${NOSTR_KINDS.LIVE_EVENT}:${hostPubkey}:${eventId}`;
  }

  /**
   * Parse a live event address
   */
  parseLiveEventAddress(address: string): { hostPubkey: string; eventId: string } | null {
    const parts = address.split(':');
    if (parts.length < 3 || parts[0] !== NOSTR_KINDS.LIVE_EVENT.toString()) {
      return null;
    }
    return {
      hostPubkey: parts[1],
      eventId: parts.slice(2).join(':'),
    };
  }

  // ----------------------------------------
  // CACHE MANAGEMENT
  // ----------------------------------------

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.eventCache.clear();
  }

  /**
   * Cleanup all subscriptions
   */
  cleanup(): void {
    for (const subId of this.chatSubscriptions.values()) {
      nostrService.unsubscribe(subId);
    }
    this.chatSubscriptions.clear();
    this.eventCache.clear();
  }
}

// Export singleton
export const liveEventService = new LiveEventService();
export { LiveEventService };
