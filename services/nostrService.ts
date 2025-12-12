import { 
  SimplePool, 
  finalizeEvent, 
  type Event as NostrEvent,
  type Filter 
} from 'nostr-tools';
import { NOSTR_KINDS, type Post, type Board, type Comment, BoardType } from '../types';
import { NostrConfig } from '../config';
import { nostrEventDeduplicator } from './messageDeduplicator';

// ============================================
// RELAY CONFIGURATION
// ============================================

export const DEFAULT_RELAYS = NostrConfig.DEFAULT_RELAYS;

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
  event: Partial<NostrEvent>;
  privateKey: Uint8Array;
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
  
  // Relay status tracking
  private relayStatuses: Map<string, RelayStatus> = new Map();
  
  // Message queue for offline resilience
  private messageQueue: PendingMessage[] = [];
  private readonly MESSAGE_QUEUE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
  
  // Backoff configuration (from BitChat's NostrRelayManager)
  private readonly INITIAL_BACKOFF_MS = NostrConfig.RELAY_INITIAL_BACKOFF_MS;
  private readonly MAX_BACKOFF_MS = NostrConfig.RELAY_MAX_BACKOFF_MS;
  private readonly BACKOFF_MULTIPLIER = NostrConfig.RELAY_BACKOFF_MULTIPLIER;
  private readonly MAX_RECONNECT_ATTEMPTS = NostrConfig.RELAY_MAX_RECONNECT_ATTEMPTS;
  
  // Reconnection timers
  private reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor() {
    this.pool = new SimplePool();
    this.relays = [...DEFAULT_RELAYS];
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

  private queueMessage(event: Partial<NostrEvent>, privateKey: Uint8Array, targetRelays: string[]) {
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
      privateKey,
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
        this.publishEventToRelay(item.event, item.privateKey, relayUrl)
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
    event: Partial<NostrEvent>, 
    privateKey: Uint8Array, 
    relayUrl: string
  ): Promise<NostrEvent> {
    const signedEvent = finalizeEvent(event as any, privateKey);
    await this.pool.publish([relayUrl], signedEvent);
    return signedEvent;
  }

  // ----------------------------------------
  // PUBLISHING EVENTS
  // ----------------------------------------

  async publishEvent(event: Partial<NostrEvent>, privateKey: Uint8Array): Promise<NostrEvent> {
    const signedEvent = finalizeEvent(event as any, privateKey);
    
    try {
      // Get connected relays
      const connectedRelays = this.relays.filter(url => {
        const status = this.relayStatuses.get(url);
        return status?.isConnected !== false; // Include unknown status
      });

      if (connectedRelays.length === 0) {
        // Queue for later if no relays connected
        this.queueMessage(event, privateKey, this.relays);
        throw new Error('No relays connected');
      }

      await Promise.any(this.pool.publish(connectedRelays, signedEvent));
      
      // Mark event as processed to prevent duplicates
      nostrEventDeduplicator.markProcessed(signedEvent.id);
      
      // Queue for disconnected relays
      this.queueMessage(event, privateKey, this.relays);
      
      return signedEvent;
    } catch (error) {
      // Queue the message for retry
      this.queueMessage(event, privateKey, this.relays);
      throw error;
    }
  }

  async publishPost(
    post: Omit<Post, 'id' | 'score' | 'commentCount' | 'comments' | 'nostrEventId' | 'upvotes' | 'downvotes'>,
    privateKey: Uint8Array,
    geohash?: string  // For location-based boards
  ): Promise<NostrEvent> {
    const tags: string[][] = [
      ['client', 'bitboard'],
      ['title', post.title],
      ['board', post.boardId],
    ];

    // Add topic tags
    post.tags.forEach(tag => tags.push(['t', tag]));

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
      kind: NOSTR_KINDS.POST,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: post.content,
    };

    return this.publishEvent(event, privateKey);
  }

  async publishComment(
    postEventId: string,
    content: string,
    privateKey: Uint8Array,
    parentCommentId?: string
  ): Promise<NostrEvent> {
    const tags: string[][] = [
      ['e', postEventId, '', 'root'],  // Reference to the original post
      ['client', 'bitboard'],
    ];

    // If this is a reply to another comment, add parent reference
    if (parentCommentId) {
      tags.push(['e', parentCommentId, '', 'reply']);
    }

    const event: Partial<NostrEvent> = {
      kind: NOSTR_KINDS.POST,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content,
    };

    return this.publishEvent(event, privateKey);
  }

  async publishVote(
    postEventId: string,
    direction: 'up' | 'down',
    privateKey: Uint8Array
  ): Promise<NostrEvent> {
    const event: Partial<NostrEvent> = {
      kind: NOSTR_KINDS.REACTION,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['e', postEventId]],
      content: direction === 'up' ? '+' : '-',
    };

    return this.publishEvent(event, privateKey);
  }

  async publishBoard(
    board: Omit<Board, 'id' | 'memberCount' | 'nostrEventId'>,
    privateKey: Uint8Array
  ): Promise<NostrEvent> {
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
      kind: NOSTR_KINDS.BOARD_DEFINITION,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: board.description,
    };

    return this.publishEvent(event, privateKey);
  }

  // ----------------------------------------
  // QUERYING EVENTS
  // ----------------------------------------

  async fetchPosts(filters: {
    boardId?: string;
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
    if (filters.boardId) {
      filter['#board'] = [filters.boardId];
    }

    if (filters.geohash) {
      filter['#g'] = [filters.geohash];
    }

    // Filter for BitBoard client posts
    filter['#client'] = ['bitboard'];

    try {
      // Query fastest relays first with timeout
      const connectedRelays = this.relays.filter(url => {
        const status = this.relayStatuses.get(url);
        return status?.isConnected !== false; // Include unknown status
      });

      // If we have connected relays, query them first
      const relaysToQuery = connectedRelays.length > 0 ? connectedRelays : this.relays;
      
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
      const events = await this.pool.querySync(this.relays, filter);
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

    const events = await this.pool.querySync(this.relays, filter);
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

    const events = await this.pool.querySync(this.relays, filter);
    return events.filter(event => !nostrEventDeduplicator.isEventDuplicate(event.id));
  }

  // ----------------------------------------
  // SUBSCRIPTIONS (Real-time)
  // ----------------------------------------

  subscribeToFeed(
    onEvent: (event: NostrEvent) => void,
    filters: { boardId?: string; geohash?: string } = {}
  ): string {
    const subscriptionId = `feed-${Date.now()}`;
    
    const filter: Filter = {
      kinds: [NOSTR_KINDS.POST],
      '#client': ['bitboard'],
      since: Math.floor(Date.now() / 1000) - NostrConfig.SUBSCRIPTION_SINCE_SECONDS,
    };

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
      this.relays,
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
    this.relayStatuses.clear();
  }

  // ----------------------------------------
  // HELPERS
  // ----------------------------------------

  eventToPost(event: NostrEvent): Post {
    const getTag = (name: string): string | undefined => {
      const tag = event.tags.find(t => t[0] === name);
      return tag ? tag[1] : undefined;
    };

    const getAllTags = (name: string): string[] => {
      return event.tags.filter(t => t[0] === name).map(t => t[1]);
    };

    return {
      id: event.id,
      nostrEventId: event.id,
      boardId: getTag('board') || 'b-random',
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
    // Extract parent comment ID from tags (look for 'reply' marker)
    let parentId: string | undefined;
    for (const tag of event.tags) {
      if (tag[0] === 'e' && tag[3] === 'reply') {
        parentId = tag[1];
        break;
      }
    }

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
}

// Export singleton instance
export const nostrService = new NostrService();
