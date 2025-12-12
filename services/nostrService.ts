import { 
  SimplePool, 
  type Event as NostrEvent,
  type Filter 
} from 'nostr-tools';
import { NOSTR_KINDS, type Post, type Board, type Comment, BoardType, type UnsignedNostrEvent } from '../types';
import { NostrConfig } from '../config';
import { nostrEventDeduplicator } from './messageDeduplicator';

// ============================================
// RELAY CONFIGURATION
// ============================================

export const DEFAULT_RELAYS = NostrConfig.DEFAULT_RELAYS;

const USER_RELAYS_STORAGE_KEY = 'bitboard_user_relays_v1';

// ============================================
// RELAY STATUS TYPES
// ============================================

interface RelayStatus {
  url: string;
  isConnected: boolean;
  lastError: Error | null;
  lastConnectedAt: number | null;
  lastDisconnectedAt: number | null;
  reconnectAttempts: number;
  nextReconnectTime: number | null;
}

interface PendingMessage {
  event: NostrEvent;
  pendingRelays: Set<string>;
  timestamp: number;
}

// ============================================
// NOSTR SERVICE CLASS
// ============================================

class NostrService {
  private pool: SimplePool;
  private relays: string[];
  private subscriptions: Map<string, { unsub: () => void }>;
  private userRelays: string[] = [];
  
  // Relay status tracking
  private relayStatuses: Map<string, RelayStatus> = new Map();
  
  // Message queue for offline resilience
  private messageQueue: PendingMessage[] = [];
  private readonly MESSAGE_QUEUE_MAX_AGE_MS = NostrConfig.MESSAGE_QUEUE_MAX_AGE_MS;
  private readonly MESSAGE_QUEUE_MAX_SIZE = NostrConfig.MESSAGE_QUEUE_MAX_SIZE;
  
  // Backoff configuration (from BitChat's NostrRelayManager)
  private readonly INITIAL_BACKOFF_MS = NostrConfig.RELAY_INITIAL_BACKOFF_MS;
  private readonly MAX_BACKOFF_MS = NostrConfig.RELAY_MAX_BACKOFF_MS;
  private readonly BACKOFF_MULTIPLIER = NostrConfig.RELAY_BACKOFF_MULTIPLIER;
  private readonly MAX_RECONNECT_ATTEMPTS = NostrConfig.RELAY_MAX_RECONNECT_ATTEMPTS;
  
  // Reconnection timers
  private reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor() {
    this.pool = new SimplePool();

    // Load user-configured relays (if any) and merge with defaults
    this.userRelays = this.loadUserRelaysFromStorage();
    this.relays = this.mergeRelays(this.userRelays, [...DEFAULT_RELAYS]);
    this.subscriptions = new Map();
    
    // Initialize relay statuses
    this.relays.forEach(url => {
      this.relayStatuses.set(url, {
        url,
        isConnected: false,
        lastError: null,
        lastConnectedAt: null,
        lastDisconnectedAt: null,
        reconnectAttempts: 0,
        nextReconnectTime: null,
      });
    });
  }

  // ----------------------------------------
  // RELAY PREFERENCES (User-configurable)
  // ----------------------------------------

  /**
   * Get user-configured relays (does not include defaults)
   */
  getUserRelays(): string[] {
    return [...this.userRelays];
  }

  /**
   * Set user-configured relays and persist them. Defaults are always included.
   */
  setUserRelays(relays: string[]) {
    const normalized = this.normalizeRelayList(relays);
    this.userRelays = normalized;
    this.saveUserRelaysToStorage(normalized);
    // User relays first, then defaults
    this.setRelays(this.mergeRelays(this.userRelays, [...DEFAULT_RELAYS]));
  }

  private loadUserRelaysFromStorage(): string[] {
    try {
      if (typeof localStorage === 'undefined') return [];
      const raw = localStorage.getItem(USER_RELAYS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return this.normalizeRelayList(parsed);
    } catch {
      return [];
    }
  }

  private saveUserRelaysToStorage(relays: string[]) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(USER_RELAYS_STORAGE_KEY, JSON.stringify(relays));
    } catch {
      // ignore
    }
  }

  private normalizeRelayList(relays: unknown[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const r of relays) {
      if (typeof r !== 'string') continue;
      const url = r.trim();
      if (!url) continue;
      // Only accept wss:// (most relays) and ws:// (dev/testing)
      if (!url.startsWith('wss://') && !url.startsWith('ws://')) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      out.push(url);
    }
    return out;
  }

  private mergeRelays(primary: string[], secondary: string[]): string[] {
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const url of [...primary, ...secondary]) {
      if (seen.has(url)) continue;
      seen.add(url);
      merged.push(url);
    }
    return merged;
  }

  /**
   * Prefer user relays for publishing, then fall back to defaults.
   */
  private getPublishRelays(): string[] {
    return this.mergeRelays(this.userRelays, [...DEFAULT_RELAYS]);
  }

  /**
   * Prefer user relays for reads/subscriptions, then fall back to defaults.
   */
  private getReadRelays(): string[] {
    return this.mergeRelays(this.userRelays, [...DEFAULT_RELAYS]);
  }

  // ----------------------------------------
  // CONNECTION MANAGEMENT
  // ----------------------------------------

  setRelays(relays: string[]) {
    this.relays = relays;
    
    // Update relay statuses
    relays.forEach(url => {
      if (!this.relayStatuses.has(url)) {
        this.relayStatuses.set(url, {
          url,
          isConnected: false,
          lastError: null,
          lastConnectedAt: null,
          lastDisconnectedAt: null,
          reconnectAttempts: 0,
          nextReconnectTime: null,
        });
      }
    });
  }

  getRelays(): string[] {
    return this.relays;
  }

  /**
   * Get status of all relays
   */
  getRelayStatuses(): RelayStatus[] {
    return Array.from(this.relayStatuses.values());
  }

  /**
   * Check if any relay is connected
   */
  isConnected(): boolean {
    return Array.from(this.relayStatuses.values()).some(s => s.isConnected);
  }

  /**
   * Get count of connected relays
   */
  getConnectedCount(): number {
    return Array.from(this.relayStatuses.values()).filter(s => s.isConnected).length;
  }

  // ----------------------------------------
  // RELAY STATUS MANAGEMENT
  // ----------------------------------------

  private updateRelayStatus(url: string, connected: boolean, error?: Error) {
    const status = this.relayStatuses.get(url);
    if (!status) return;

    status.isConnected = connected;
    
    if (connected) {
      status.lastConnectedAt = Date.now();
      status.reconnectAttempts = 0;
      status.nextReconnectTime = null;
      status.lastError = null;
      
      // Flush any queued messages for this relay
      this.flushMessageQueue(url);
    } else {
      status.lastDisconnectedAt = Date.now();
      if (error) {
        status.lastError = error;
      }
    }
  }

  private handleRelayDisconnection(url: string, error: Error) {
    const status = this.relayStatuses.get(url);
    if (!status) return;

    this.updateRelayStatus(url, false, error);

    // Check for permanent failure (DNS errors, etc.)
    const errorMessage = error.message.toLowerCase();
    if (errorMessage.includes('dns') || 
        errorMessage.includes('hostname') ||
        errorMessage.includes('not found')) {
      console.warn(`[Nostr] Permanent failure for ${url} - not retrying`);
      status.reconnectAttempts = this.MAX_RECONNECT_ATTEMPTS;
      return;
    }

    // Implement exponential backoff
    status.reconnectAttempts++;
    
    if (status.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.warn(`[Nostr] Max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached for ${url}`);
      return;
    }

    // Calculate backoff interval
    const backoffInterval = Math.min(
      this.INITIAL_BACKOFF_MS * Math.pow(this.BACKOFF_MULTIPLIER, status.reconnectAttempts - 1),
      this.MAX_BACKOFF_MS
    );

    status.nextReconnectTime = Date.now() + backoffInterval;

    console.log(`[Nostr] Scheduling reconnection to ${url} in ${backoffInterval}ms (attempt ${status.reconnectAttempts})`);

    // Clear any existing timer
    const existingTimer = this.reconnectTimers.get(url);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule reconnection
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(url);
      this.attemptReconnection(url);
    }, backoffInterval);

    this.reconnectTimers.set(url, timer);
  }

  private attemptReconnection(url: string) {
    console.log(`[Nostr] Attempting reconnection to ${url}`);
    // The SimplePool handles reconnection internally
    // We just need to try a query to trigger it
    this.pool.querySync([url], { kinds: [0], limit: 1 })
      .then(() => {
        this.updateRelayStatus(url, true);
        console.log(`[Nostr] Reconnected to ${url}`);
      })
      .catch((error) => {
        this.handleRelayDisconnection(url, error);
      });
  }

  /**
   * Manually retry connection to a specific relay
   */
  retryConnection(url: string) {
    const status = this.relayStatuses.get(url);
    if (status) {
      status.reconnectAttempts = 0;
      status.nextReconnectTime = null;
    }
    
    // Clear any existing timer
    const existingTimer = this.reconnectTimers.get(url);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.reconnectTimers.delete(url);
    }
    
    this.attemptReconnection(url);
  }

  /**
   * Reset all relay connections
   */
  resetAllConnections() {
    // Clear all timers
    this.reconnectTimers.forEach(timer => clearTimeout(timer));
    this.reconnectTimers.clear();
    
    // Reset all statuses
    this.relayStatuses.forEach(status => {
      status.reconnectAttempts = 0;
      status.nextReconnectTime = null;
      status.lastError = null;
    });
    
    // Attempt reconnection to all relays
    this.relays.forEach(url => this.attemptReconnection(url));
  }

  // ----------------------------------------
  // MESSAGE QUEUE MANAGEMENT
  // ----------------------------------------

  private queueMessage(event: NostrEvent, targetRelays: string[]) {
    // Find relays that aren't connected
    const disconnectedRelays = targetRelays.filter(url => {
      const status = this.relayStatuses.get(url);
      return !status?.isConnected;
    });

    if (disconnectedRelays.length === 0) return;

    // Enforce queue size limit - drop oldest messages if queue is full
    if (this.messageQueue.length >= this.MESSAGE_QUEUE_MAX_SIZE) {
      // Remove oldest 10% of messages
      const removeCount = Math.floor(this.MESSAGE_QUEUE_MAX_SIZE * 0.1);
      this.messageQueue.splice(0, removeCount);
    }

    this.messageQueue.push({
      event,
      pendingRelays: new Set(disconnectedRelays),
      timestamp: Date.now(),
    });

    // Clean up old messages
    this.cleanupMessageQueue();
  }

  private flushMessageQueue(relayUrl: string) {
    const now = Date.now();
    
    for (let i = this.messageQueue.length - 1; i >= 0; i--) {
      const item = this.messageQueue[i];
      
      // Skip if too old
      if (now - item.timestamp > this.MESSAGE_QUEUE_MAX_AGE_MS) {
        this.messageQueue.splice(i, 1);
        continue;
      }
      
      // Check if this relay is in the pending list
      if (item.pendingRelays.has(relayUrl)) {
        // Try to send
        this.publishEventToRelay(item.event, relayUrl)
          .then(() => {
            item.pendingRelays.delete(relayUrl);
            if (item.pendingRelays.size === 0) {
              const idx = this.messageQueue.indexOf(item);
              if (idx !== -1) {
                this.messageQueue.splice(idx, 1);
              }
            }
          })
          .catch(console.error);
      }
    }
  }

  private cleanupMessageQueue() {
    const now = Date.now();
    this.messageQueue = this.messageQueue.filter(
      item => now - item.timestamp < this.MESSAGE_QUEUE_MAX_AGE_MS
    );
  }

  private async publishEventToRelay(
    event: NostrEvent,
    relayUrl: string
  ): Promise<NostrEvent> {
    await this.pool.publish([relayUrl], event);
    return event;
  }

  // ----------------------------------------
  // PUBLISHING EVENTS
  // ----------------------------------------

  async publishSignedEvent(signedEvent: NostrEvent): Promise<NostrEvent> {
    try {
      const publishRelays = this.getPublishRelays();
      // Get connected relays
      const connectedRelays = publishRelays.filter(url => {
        const status = this.relayStatuses.get(url);
        return status?.isConnected !== false; // Include unknown status
      });

      if (connectedRelays.length === 0) {
        // Queue for later if no relays connected
        this.queueMessage(signedEvent, publishRelays);
        throw new Error('No relays connected');
      }

      await Promise.any(this.pool.publish(connectedRelays, signedEvent));
      
      // Mark event as processed to prevent duplicates
      nostrEventDeduplicator.markProcessed(signedEvent.id);
      
      // Queue for disconnected relays
      this.queueMessage(signedEvent, publishRelays);
      
      return signedEvent;
    } catch (error) {
      // Queue the message for retry
      this.queueMessage(signedEvent, this.getPublishRelays());
      throw error;
    }
  }

  buildPostEvent(
    post: Omit<Post, 'id' | 'score' | 'commentCount' | 'comments' | 'nostrEventId' | 'upvotes' | 'downvotes'>,
    pubkey: string,
    geohash?: string,  // For location-based boards
    opts?: {
      /** NIP-33 board address (30001:<pubkey>:<d>) */
      boardAddress?: string;
      /** Used as a discoverability hashtag */
      boardName?: string;
    }
  ): UnsignedNostrEvent {
    const tags: string[][] = [
      ['client', 'bitboard'],
      ['title', post.title],
      ['board', post.boardId],
    ];

    // Add topic tags
    post.tags.forEach(tag => tags.push(['t', tag]));

    // NIP-33: addressable reference to board (preferred), keep legacy 'board' tag too
    if (opts?.boardAddress) {
      tags.push(['a', opts.boardAddress]);
    }

    // Discoverability hashtag for board name
    if (opts?.boardName) {
      const boardTag = opts.boardName.toLowerCase();
      if (boardTag && !post.tags.some(t => t.toLowerCase() === boardTag)) {
        tags.push(['t', boardTag]);
      }
    }

    // Add URL if present
    if (post.url) {
      tags.push(['r', post.url]);
    }

    // Add image if present
    if (post.imageUrl) {
      tags.push(['image', post.imageUrl]);
    }

    // Add geohash for location-based posts (BitChat compatible)
    if (geohash) {
      tags.push(['g', geohash]);
    }

    const event: Partial<NostrEvent> = {
      pubkey,
      kind: NOSTR_KINDS.POST,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: post.content,
    };

    return event as UnsignedNostrEvent;
  }

  buildCommentEvent(
    postEventId: string,
    content: string,
    pubkey: string,
    parentCommentId?: string,
    opts?: {
      /** Post author's pubkey (for NIP-10 p tags) */
      postAuthorPubkey?: string;
      /** Parent comment author's pubkey (for NIP-10 p tags) */
      parentCommentAuthorPubkey?: string;
    }
  ): UnsignedNostrEvent {
    const tags: string[][] = [
      ['e', postEventId, '', 'root'],  // Reference to the original post
      ['client', 'bitboard'],
    ];

    // NIP-10: include pubkeys referenced by the thread
    if (opts?.postAuthorPubkey) {
      tags.push(['p', opts.postAuthorPubkey]);
    }

    // If this is a reply to another comment, add parent reference
    if (parentCommentId) {
      tags.push(['e', parentCommentId, '', 'reply']);
      if (opts?.parentCommentAuthorPubkey) {
        tags.push(['p', opts.parentCommentAuthorPubkey]);
      }
    }

    const event: Partial<NostrEvent> = {
      pubkey,
      kind: NOSTR_KINDS.POST,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content,
    };

    return event as UnsignedNostrEvent;
  }

  buildVoteEvent(
    postEventId: string,
    direction: 'up' | 'down',
    pubkey: string,
    opts?: {
      /** Post author's pubkey (NIP-25 p tag) */
      postAuthorPubkey?: string;
    }
  ): UnsignedNostrEvent {
    const tags: string[][] = [['e', postEventId]];

    // NIP-25: include 'p' tag for the author of the reacted-to event
    if (opts?.postAuthorPubkey) {
      tags.push(['p', opts.postAuthorPubkey]);
    }

    const event: Partial<NostrEvent> = {
      pubkey,
      kind: NOSTR_KINDS.REACTION,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: direction === 'up' ? '+' : '-',
    };

    return event as UnsignedNostrEvent;
  }

  buildBoardEvent(
    board: Omit<Board, 'id' | 'memberCount' | 'nostrEventId'>,
    pubkey: string
  ): UnsignedNostrEvent {
    const boardId = `b-${board.name.toLowerCase()}`;
    
    const tags: string[][] = [
      ['d', boardId],
      ['name', board.name],
      ['type', board.type],
      ['public', board.isPublic ? 'true' : 'false'],
      ['client', 'bitboard'],
    ];

    if (board.geohash) {
      tags.push(['g', board.geohash]);
    }

    const event: Partial<NostrEvent> = {
      pubkey,
      kind: NOSTR_KINDS.BOARD_DEFINITION,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: board.description,
    };

    return event as UnsignedNostrEvent;
  }

  // ----------------------------------------
  // QUERYING EVENTS
  // ----------------------------------------

  async fetchPosts(filters: {
    boardId?: string;
    boardAddress?: string;
    geohash?: string;
    limit?: number;
    since?: number;
    until?: number;  // For pagination: fetch posts older than this timestamp
  } = {}): Promise<NostrEvent[]> {
    const filter: Filter = {
      kinds: [NOSTR_KINDS.POST],
      limit: filters.limit || NostrConfig.DEFAULT_FETCH_LIMIT,
    };

    if (filters.since) {
      filter.since = filters.since;
    }

    if (filters.until) {
      filter.until = filters.until;
    }

    // Add board or geohash filter via tags
    if (filters.boardAddress) {
      filter['#a'] = [filters.boardAddress];
    }

    // Legacy board filter (keep for backward compatibility)
    if (filters.boardId) {
      filter['#board'] = [filters.boardId];
    }

    if (filters.geohash) {
      filter['#g'] = [filters.geohash];
    }

    // Filter for BitBoard client posts
    filter['#client'] = ['bitboard'];

    try {
      const readRelays = this.getReadRelays();
      // Query fastest relays first with timeout
      const connectedRelays = readRelays.filter(url => {
        const status = this.relayStatuses.get(url);
        return status?.isConnected !== false; // Include unknown status
      });

      // If we have connected relays, query them first
      const relaysToQuery = connectedRelays.length > 0 ? connectedRelays : readRelays;
      
      // Use Promise.race with timeout for faster response
      const QUERY_TIMEOUT_MS = 5000; // 5 second timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout')), QUERY_TIMEOUT_MS);
      });

      const queryPromise = this.pool.querySync(relaysToQuery, filter);
      
      const events = await Promise.race([queryPromise, timeoutPromise]);
      
      // Update relay statuses on success
      relaysToQuery.forEach(url => this.updateRelayStatus(url, true));
      
      // Filter out duplicates
      return events.filter(event => !nostrEventDeduplicator.isEventDuplicate(event.id));
    } catch (error) {
      console.error('[Nostr] Failed to fetch posts:', error);
      // Don't throw - return empty array for graceful degradation
      return [];
    }
  }

  async fetchBoards(type?: BoardType): Promise<NostrEvent[]> {
    const filter: Filter = {
      kinds: [NOSTR_KINDS.BOARD_DEFINITION],
      '#client': ['bitboard'],
      limit: NostrConfig.BOARDS_FETCH_LIMIT,
    };

    if (type) {
      filter['#type'] = [type];
    }

    try {
      const events = await this.pool.querySync(this.getReadRelays(), filter);
      return events.filter(event => !nostrEventDeduplicator.isEventDuplicate(event.id));
    } catch (error) {
      console.error('[Nostr] Failed to fetch boards:', error);
      throw error;
    }
  }

  /**
   * Fetch vote events for a post
   * Returns raw events for cryptographic verification
   */
  async fetchVoteEvents(postEventId: string): Promise<NostrEvent[]> {
    const filter: Filter = {
      kinds: [NOSTR_KINDS.REACTION],
      '#e': [postEventId],
    };

    const events = await this.pool.querySync(this.getReadRelays(), filter);
    return events;
  }

  /**
   * Fetch votes for a post with simple count (legacy method)
   * For verified voting, use fetchVoteEvents instead
   */
  async fetchVotesForPost(postEventId: string): Promise<{ up: number; down: number; events: NostrEvent[] }> {
    const events = await this.fetchVoteEvents(postEventId);
    
    // Deduplicate by pubkey - only count latest vote per user
    const votesByPubkey = new Map<string, NostrEvent>();
    
    // Sort by timestamp to get latest
    const sortedEvents = [...events].sort((a, b) => a.created_at - b.created_at);
    
    for (const event of sortedEvents) {
      // Only count valid vote content
      if (event.content === '+' || event.content === '-') {
        votesByPubkey.set(event.pubkey, event);
      }
    }
    
    let up = 0;
    let down = 0;
    
    votesByPubkey.forEach(event => {
      if (event.content === '+') up++;
      else if (event.content === '-') down++;
    });

    return { up, down, events };
  }

  async fetchComments(postEventId: string): Promise<NostrEvent[]> {
    const filter: Filter = {
      kinds: [NOSTR_KINDS.POST],
      '#e': [postEventId],
      '#client': ['bitboard'],
    };

    const events = await this.pool.querySync(this.getReadRelays(), filter);
    return events.filter(event => !nostrEventDeduplicator.isEventDuplicate(event.id));
  }

  // ----------------------------------------
  // SUBSCRIPTIONS (Real-time)
  // ----------------------------------------

  subscribeToFeed(
    onEvent: (event: NostrEvent) => void,
    filters: { boardId?: string; boardAddress?: string; geohash?: string } = {}
  ): string {
    const subscriptionId = `feed-${Date.now()}`;
    
    const filter: Filter = {
      kinds: [NOSTR_KINDS.POST],
      '#client': ['bitboard'],
      since: Math.floor(Date.now() / 1000) - NostrConfig.SUBSCRIPTION_SINCE_SECONDS,
    };

    if (filters.boardAddress) {
      filter['#a'] = [filters.boardAddress];
    }

    if (filters.boardId) {
      filter['#board'] = [filters.boardId];
    }

    if (filters.geohash) {
      filter['#g'] = [filters.geohash];
    }

    // Debounce event handler to reduce UI updates during rapid event streams
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const pendingEvents: NostrEvent[] = [];
    const DEBOUNCE_MS = 150; // 150ms debounce window

    const debouncedHandler = (event: NostrEvent) => {
      // Deduplicate immediately
      if (nostrEventDeduplicator.isEventDuplicate(event.id)) {
        return;
      }

      pendingEvents.push(event);

      // Clear existing timer
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      // Set new timer
      debounceTimer = setTimeout(() => {
        // Process all pending events
        const eventsToProcess = [...pendingEvents];
        pendingEvents.length = 0;
        debounceTimer = null;

        // Fire events in batch
        eventsToProcess.forEach(e => onEvent(e));
      }, DEBOUNCE_MS);
    };

    const sub = this.pool.subscribeMany(
      this.getReadRelays(),
      [filter],
      {
        onevent: debouncedHandler,
        oneose: () => {
          // Flush any pending events when subscription ends
          if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
          }
          if (pendingEvents.length > 0) {
            pendingEvents.forEach(e => onEvent(e));
            pendingEvents.length = 0;
          }
          console.log('[Nostr] End of stored events for subscription:', subscriptionId);
        }
      }
    );

    this.subscriptions.set(subscriptionId, { 
      unsub: () => {
        // Cleanup debounce timer
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        sub.close();
      }
    });
    return subscriptionId;
  }

  unsubscribe(subscriptionId: string) {
    const sub = this.subscriptions.get(subscriptionId);
    if (sub) {
      sub.unsub();
      this.subscriptions.delete(subscriptionId);
    }
  }

  unsubscribeAll() {
    this.subscriptions.forEach(sub => sub.unsub());
    this.subscriptions.clear();
  }

  // ----------------------------------------
  // CLEANUP
  // ----------------------------------------

  /**
   * Clean up resources (call on app shutdown)
   */
  cleanup() {
    this.unsubscribeAll();
    this.reconnectTimers.forEach(timer => clearTimeout(timer));
    this.reconnectTimers.clear();
    this.messageQueue = [];
    // Keep relay status map so callers can still read relays/status after cleanup
    this.relayStatuses.forEach((status) => {
      status.isConnected = false;
      status.nextReconnectTime = null;
      status.reconnectAttempts = 0;
      status.lastError = null;
      status.lastDisconnectedAt = Date.now();
    });
  }

  // ----------------------------------------
  // HELPERS
  // ----------------------------------------

  eventToPost(event: NostrEvent): Post {
    const getTag = (name: string): string | undefined => {
      const tag = event.tags.find(t => t[0] === name);
      return tag ? tag[1] : undefined;
    };

    const getARef = (): string | undefined => {
      const tag = event.tags.find(t => t[0] === 'a');
      return tag ? tag[1] : undefined;
    };

    const getAllTags = (name: string): string[] => {
      return event.tags.filter(t => t[0] === name).map(t => t[1]);
    };

    // NIP-33 board reference: a = 30001:<pubkey>:<d>
    const aRef = getARef();
    const boardIdFromA =
      aRef && aRef.startsWith(`${NOSTR_KINDS.BOARD_DEFINITION}:`)
        ? aRef.split(':').slice(2).join(':') || undefined
        : undefined;

    return {
      id: event.id,
      nostrEventId: event.id,
      boardId: getTag('board') || boardIdFromA || 'b-random',
      title: getTag('title') || 'Untitled',
      author: event.pubkey.slice(0, 8) + '...',
      authorPubkey: event.pubkey,
      content: event.content,
      timestamp: event.created_at * 1000,
      score: 0, // Will be calculated from votes
      upvotes: 0,
      downvotes: 0,
      commentCount: 0,
      tags: getAllTags('t'),
      url: getTag('r'),
      imageUrl: getTag('image'),
      comments: [],
    };
  }

  eventToBoard(event: NostrEvent): Board {
    const getTag = (name: string): string | undefined => {
      const tag = event.tags.find(t => t[0] === name);
      return tag ? tag[1] : undefined;
    };

    const boardType = getTag('type') as BoardType || BoardType.TOPIC;

    return {
      id: getTag('d') || event.id,
      nostrEventId: event.id,
      name: getTag('name') || 'Unknown',
      description: event.content,
      isPublic: getTag('public') !== 'false',
      memberCount: 0,
      type: boardType,
      geohash: getTag('g'),
      createdBy: event.pubkey,
    };
  }

  eventToComment(event: NostrEvent): Comment {
    // NIP-10: extract parent comment ID from 'e' tag with marker 'reply'
    const replyTag = event.tags.find(t => t[0] === 'e' && t[3] === 'reply');
    const parentId = replyTag?.[1];

    return {
      id: event.id,
      nostrEventId: event.id,
      author: event.pubkey.slice(0, 8) + '...',
      authorPubkey: event.pubkey,
      content: event.content,
      timestamp: event.created_at * 1000,
      parentId,
    };
  }

  // ----------------------------------------
  // NIP-65 (optional): Relay list events
  // ----------------------------------------

  /**
   * Build a NIP-65 relay list event (kind 10002).
   * Tags are of the form: ['r', <url>, <mode?>] where mode is 'read' or 'write'.
   */
  buildRelayListEvent(
    pubkey: string,
    relays: Array<{ url: string; read?: boolean; write?: boolean }>
  ): UnsignedNostrEvent {
    const tags: string[][] = [];
    for (const r of relays) {
      const url = r.url?.trim();
      if (!url) continue;
      if (r.read && r.write) {
        tags.push(['r', url]);
      } else if (r.read) {
        tags.push(['r', url, 'read']);
      } else if (r.write) {
        tags.push(['r', url, 'write']);
      } else {
        tags.push(['r', url]);
      }
    }

    const event: Partial<NostrEvent> = {
      pubkey,
      kind: NOSTR_KINDS.RELAY_LIST,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: '',
    };

    return event as UnsignedNostrEvent;
  }

  /**
   * Fetch a user's latest relay list (kind 10002). Returns the raw event (if any).
   */
  async fetchRelayListEvent(pubkey: string): Promise<NostrEvent | null> {
    const filter: Filter = {
      kinds: [NOSTR_KINDS.RELAY_LIST],
      authors: [pubkey],
      limit: 1,
    };

    try {
      const events = await this.pool.querySync(this.getReadRelays(), filter);
      if (!events.length) return null;
      // Latest by created_at
      return events.sort((a, b) => b.created_at - a.created_at)[0];
    } catch {
      return null;
    }
  }
}

// Export singleton instance
export const nostrService = new NostrService();
