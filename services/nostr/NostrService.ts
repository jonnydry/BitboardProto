import { 
  SimplePool, 
  type Event as NostrEvent,
  type Filter 
} from 'nostr-tools';
import { NOSTR_KINDS, type Post, type Board, type Comment, BoardType, type UnsignedNostrEvent, ReportType } from '../../types';
import { NostrConfig } from '../../config';
import { nostrEventDeduplicator } from '../messageDeduplicator';
import { inputValidator } from '../inputValidator';
import { diagnosticsService } from '../diagnosticsService';
import { logger } from '../loggingService';
import { NostrProfileCache, type NostrProfileMetadata } from './profileCache';
import {
  buildBoardEvent,
  buildCommentDeleteEvent,
  buildCommentEditEvent,
  buildCommentEvent,
  buildContactListEvent,
  buildPostDeleteEvent,
  buildPostEditEvent,
  buildPostEvent,
  buildProfileEvent,
  buildReportEvent,
  buildVoteEvent,
} from './eventBuilders';
import {
  BITBOARD_TYPE_COMMENT,
  BITBOARD_TYPE_COMMENT_DELETE,
  BITBOARD_TYPE_COMMENT_EDIT,
  BITBOARD_TYPE_POST,
  BITBOARD_TYPE_POST_EDIT,
  BITBOARD_TYPE_TAG,
} from './bitboardEventTypes';

type FilterWithTags = Filter & { [K in `#${string}`]?: string[] };

export const DEFAULT_RELAYS = NostrConfig.DEFAULT_RELAYS;

const USER_RELAYS_STORAGE_KEY = 'bitboard_user_relays_v1';

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

class NostrService {
  private pool: SimplePool;
  private relays: string[];
  private subscriptions: Map<string, { unsub: () => void }>;
  private userRelays: string[] = [];
  private profiles: NostrProfileCache;
  
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

  // Network activity tracking (for UI indicators)
  private _activePublishes = 0;
  private _activeFetches = 0;

  constructor() {
    this.pool = new SimplePool();

    // Load user-configured relays (if any) and merge with defaults
    this.userRelays = this.loadUserRelaysFromStorage();
    this.relays = this.mergeRelays(this.userRelays, [...DEFAULT_RELAYS]);
    this.subscriptions = new Map();

    this.profiles = new NostrProfileCache({
      pool: this.pool,
      getReadRelays: () => this.getReadRelays(),
    });
    
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
    // this.relays is always maintained as: user relays first, then defaults
    return [...this.relays];
  }

  /**
   * Prefer user relays for reads/subscriptions, then fall back to defaults.
   */
  private getReadRelays(): string[] {
    // Keep read relays aligned with effective relays list
    return [...this.relays];
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

  getRelays(): Array<{ url: string; status: 'connected' | 'disconnected' | 'connecting' }> {
    return this.relays.map(url => {
      const status = this.relayStatuses.get(url);
      return {
        url,
        status: status?.isConnected ? 'connected' : 'disconnected',
      };
    });
  }

  getRelayUrls(): string[] {
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

  getQueuedMessageCount(): number {
    return this.messageQueue.length;
  }

  /**
   * Get network activity status for UI indicators
   */
  getNetworkStatus(): { isPublishing: boolean; isFetching: boolean; pendingOps: number } {
    return {
      isPublishing: this._activePublishes > 0,
      isFetching: this._activeFetches > 0,
      pendingOps: this._activePublishes + this._activeFetches + this.messageQueue.length,
    };
  }

  /**
   * Pre-warm relay connections (call early for faster initial load)
   * Returns a promise that resolves when at least one relay is connected
   */
  async preconnect(): Promise<void> {
    const startTime = Date.now();
    logger.mark('nostr-preconnect-start');
    logger.debug('Nostr', 'Pre-warming relay connections...');

    // Attempt a minimal query to trigger WebSocket connections
    // This is a no-op query that forces the pool to establish connections
    try {
      const readRelays = this.getReadRelays();
      
      // Race: resolve as soon as ANY relay connects (fast path)
      const connectionPromises = readRelays.map(async (url) => {
        try {
          // Minimal query to trigger connection
          await Promise.race([
            this.pool.querySync([url], { kinds: [0], limit: 1 }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
          ]);
          this.updateRelayStatus(url, true);
          return url;
        } catch {
          return null;
        }
      });

      // Wait for at least one to succeed (or all to fail)
      const results = await Promise.allSettled(connectionPromises);
      const connected = results.filter(r => r.status === 'fulfilled' && r.value).length;
      
      logger.mark('nostr-preconnect-end');
      logger.info('Nostr', `Pre-connected to ${connected}/${readRelays.length} relays in ${Date.now() - startTime}ms`);
    } catch (error) {
      logger.mark('nostr-preconnect-end');
      logger.warn('Nostr', 'Pre-connect failed', error);
    }
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
    diagnosticsService.warn('nostr', `Relay disconnected: ${url}`, error?.message || String(error));

    // Check for permanent failure (DNS errors, etc.)
    const errorMessage = error.message.toLowerCase();
    if (errorMessage.includes('dns') || 
        errorMessage.includes('hostname') ||
        errorMessage.includes('not found')) {
      logger.warn('Nostr', `Permanent failure for ${url} - not retrying`);
      diagnosticsService.error('nostr', `Relay permanent failure: ${url}`, error.message);
      status.reconnectAttempts = this.MAX_RECONNECT_ATTEMPTS;
      return;
    }

    // Implement exponential backoff
    status.reconnectAttempts++;
    
    if (status.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      logger.warn('Nostr', `Max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached for ${url}`);
      return;
    }

    // Calculate backoff interval
    const backoffInterval = Math.min(
      this.INITIAL_BACKOFF_MS * Math.pow(this.BACKOFF_MULTIPLIER, status.reconnectAttempts - 1),
      this.MAX_BACKOFF_MS
    );

    status.nextReconnectTime = Date.now() + backoffInterval;

    logger.debug('Nostr', `Scheduling reconnection to ${url} in ${backoffInterval}ms (attempt ${status.reconnectAttempts})`);

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
    logger.debug('Nostr', `Attempting reconnection to ${url}`);
    // The SimplePool handles reconnection internally
    // We just need to try a query to trigger it
    this.pool.querySync([url], { kinds: [0], limit: 1 })
      .then(() => {
        this.updateRelayStatus(url, true);
        logger.info('Nostr', `Reconnected to ${url}`);
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
    const uniqueRelays = Array.from(new Set(targetRelays.map((r) => r.trim()).filter(Boolean)));
    if (uniqueRelays.length === 0) return;

    // Merge with existing queued item for this event (avoid duplicates)
    const existing = this.messageQueue.find((m) => m.event.id === event.id);
    if (existing) {
      uniqueRelays.forEach((r) => existing.pendingRelays.add(r));
      existing.timestamp = Date.now();
      this.cleanupMessageQueue();
      return;
    }

    // Enforce queue size limit - drop oldest messages if queue is full
    if (this.messageQueue.length >= this.MESSAGE_QUEUE_MAX_SIZE) {
      // Remove oldest 10% of messages
      const removeCount = Math.floor(this.MESSAGE_QUEUE_MAX_SIZE * 0.1);
      this.messageQueue.splice(0, removeCount);
    }

    this.messageQueue.push({
      event,
      pendingRelays: new Set(uniqueRelays),
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
    this._activePublishes++;
    try {
      const publishRelays = this.getPublishRelays();
      if (publishRelays.length === 0) {
        throw new Error('No relays configured');
      }

      // Prefer relays known to be connected; otherwise, still attempt all relays.
      // (Important: statuses start as false until we successfully query/publish.)
      const knownConnected = publishRelays.filter((url) => this.relayStatuses.get(url)?.isConnected);
      const relaysToPublish = knownConnected.length > 0 ? knownConnected : publishRelays;

      const results = await Promise.allSettled(
        relaysToPublish.map(async (url) => {
          await this.pool.publish([url], signedEvent);
          return url;
        })
      );

      const succeeded: string[] = [];
      const failed: Array<{ url: string; error: unknown }> = [];
      results.forEach((r, i) => {
        const url = relaysToPublish[i];
        if (r.status === 'fulfilled') succeeded.push(r.value);
        else failed.push({ url, error: r.reason });
      });

      if (succeeded.length === 0) {
        // Queue for later + surface error
        this.queueMessage(signedEvent, publishRelays);
        const first = failed[0]?.error;
        throw first instanceof Error ? first : new Error('Failed to publish to any relay');
      }

      // Update relay statuses
      succeeded.forEach((url) => this.updateRelayStatus(url, true));
      failed.forEach(({ url, error }) => {
        const err = error instanceof Error ? error : new Error(String(error));
        this.handleRelayDisconnection(url, err);
      });
      
      // Mark event as processed to prevent duplicates
      nostrEventDeduplicator.markProcessed(signedEvent.id);
      
      // Queue for relays that did not confirm publication (plus any not attempted)
      const remaining = publishRelays.filter((r) => !succeeded.includes(r));
      if (remaining.length > 0) {
        this.queueMessage(signedEvent, remaining);
      }
      
      return signedEvent;
    } catch (error) {
      // Queue the message for retry
      this.queueMessage(signedEvent, this.getPublishRelays());
      throw error;
    } finally {
      this._activePublishes--;
    }
  }

  // ----------------------------------------
  // EVENT SHAPE HELPERS (Post vs Comment)
  // ----------------------------------------

  private getTagValue(event: NostrEvent, name: string): string | undefined {
    const tag = event.tags.find(t => t[0] === name);
    return tag ? tag[1] : undefined;
  }

  private hasTag(event: NostrEvent, name: string): boolean {
    return event.tags.some(t => t[0] === name);
  }

  private getARef(event: NostrEvent): string | undefined {
    return this.getTagValue(event, 'a');
  }

  private getBitboardType(event: NostrEvent): string | undefined {
    return this.getTagValue(event, BITBOARD_TYPE_TAG);
  }

  /**
   * Determine if an event should be treated as a BitBoard "post".
   * Supports both:
   * - New format: ['bb','post']
   * - Legacy format: presence of 'title' + ('board' or NIP-33 'a' ref to a board)
   */
  isBitboardPostEvent(event: NostrEvent): boolean {
    const explicit = this.getBitboardType(event);
    if (explicit === BITBOARD_TYPE_POST) return true;
    if (explicit === BITBOARD_TYPE_COMMENT) return false;
    if (explicit === BITBOARD_TYPE_POST_EDIT) return false;
    if (explicit === BITBOARD_TYPE_COMMENT_EDIT) return false;
    if (explicit === BITBOARD_TYPE_COMMENT_DELETE) return false;

    // Legacy heuristic: posts have a title and a board reference; comments have e-tags
    const hasTitle = this.hasTag(event, 'title');
    const hasBoard = this.hasTag(event, 'board');

    const aRef = this.getARef(event);
    const hasBoardARef =
      !!aRef && aRef.startsWith(`${NOSTR_KINDS.BOARD_DEFINITION}:`);

    // Comments use NIP-10 'e' tags (root/reply). Posts generally shouldn't.
    const hasThreadRefs = event.tags.some(t => t[0] === 'e');

    return hasTitle && (hasBoard || hasBoardARef) && !hasThreadRefs;
  }

  /**
   * Determine if an event should be treated as a BitBoard "comment".
   * Supports both:
   * - New format: ['bb','comment']
   * - Legacy format: kind=1 event with NIP-10 e-tags referencing a root post
   */
  isBitboardCommentEvent(event: NostrEvent, rootPostEventId?: string): boolean {
    const explicit = this.getBitboardType(event);
    if (explicit === BITBOARD_TYPE_COMMENT) return true;
    if (explicit === BITBOARD_TYPE_POST) return false;
    if (explicit === BITBOARD_TYPE_POST_EDIT) return false;
    if (explicit === BITBOARD_TYPE_COMMENT_EDIT) return false;
    if (explicit === BITBOARD_TYPE_COMMENT_DELETE) return false;

    // Legacy heuristic: comments are kind-1 events with e-tags.
    const eTags = event.tags.filter(t => t[0] === 'e' && !!t[1]);
    if (eTags.length === 0) return false;

    if (rootPostEventId) {
      return eTags.some(t => t[1] === rootPostEventId);
    }

    // If no root provided, require at least one 'e' tag marked 'root' or 'reply'
    return eTags.some(t => t[3] === 'root' || t[3] === 'reply');
  }

  // ----------------------------------------
  // PROFILE METADATA (kind 0)
  // ----------------------------------------

  /**
   * Clear cached profile metadata (local cache only).
   * - If pubkey is omitted, clears the entire profile cache.
   */
  clearProfileCache(pubkey?: string): void {
    this.profiles.clear(pubkey);
  }

  /**
   * Best-effort display name for a pubkey.
   * Falls back to pubkey prefix when metadata isn't available.
   */
  getDisplayName(pubkey: string): string {
    return this.profiles.getDisplayName(pubkey);
  }

  /**
   * Fetch and cache profiles (kind 0) for a set of pubkeys.
   * Safe to call frequently; results are cached with TTL and in-flight deduping.
   */
  async fetchProfiles(pubkeys: string[], opts: { force?: boolean } = {}): Promise<Map<string, NostrProfileMetadata>> {
    return this.profiles.fetchProfiles(pubkeys, opts);
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
    return buildPostEvent(post, pubkey, geohash, opts);
  }

  /**
   * Publish a BitBoard "edit" event for an existing post event ID.
   *
   * Design note:
   * - Nostr events are immutable; editing the original event isn't possible.
   * - We publish an "edit companion" event that references the original post via an 'e' tag.
   * - The UI should treat the latest edit event as the current content, while votes remain
   *   tied to the original post event ID.
   */
  buildPostEditEvent(args: {
    /** The original post's event id (canonical post id for voting) */
    rootPostEventId: string;
    /** The post's board id (kept for filtering / UX) */
    boardId: string;
    /** New title */
    title: string;
    /** New content */
    content: string;
    /** New tag list */
    tags: string[];
    /** Optional URL */
    url?: string;
    /** Optional image URL */
    imageUrl?: string;
    /** Editor pubkey (must match signing key) */
    pubkey: string;
    /** Encrypted title (base64) */
    encryptedTitle?: string;
    /** Encrypted content (base64) */
    encryptedContent?: string;
  }): UnsignedNostrEvent {
    return buildPostEditEvent(args);
  }

  /**
   * Type guard for BitBoard post edit events.
   */
  isBitboardPostEditEvent(event: NostrEvent): boolean {
    return this.getBitboardType(event) === BITBOARD_TYPE_POST_EDIT;
  }

  private getRootPostIdFromEditEvent(event: NostrEvent): string | null {
    const eTag = event.tags.find((t) => t[0] === 'e' && !!t[1]);
    return eTag?.[1] || null;
  }

  /**
   * Convert a post edit event into a partial Post update.
   * Does NOT change post id / nostrEventId (those stay the original post's event id).
   */
  eventToPostEditUpdate(event: NostrEvent): { rootPostEventId: string; updates: Partial<Post> } | null {
    if (!this.isBitboardPostEditEvent(event)) return null;
    const rootPostEventId = this.getRootPostIdFromEditEvent(event);
    if (!rootPostEventId) return null;

    const getTag = (name: string): string | undefined => {
      const tag = event.tags.find((t) => t[0] === name);
      return tag ? tag[1] : undefined;
    };
    const getAllTags = (name: string): string[] => {
      return event.tags.filter((t) => t[0] === name).map((t) => t[1]);
    };

    const isEncrypted = getTag('encrypted') === 'true';
    const encryptedTitle = getTag('encrypted_title');
    const titleRaw = getTag('title');
    const contentRaw = event.content ?? '';
    const tagsRaw = getAllTags('t');
    const urlRaw = getTag('r');
    const imageRaw = getTag('image');

    const updates: Partial<Post> = {
      tags: inputValidator.validateTags(tagsRaw),
      url: urlRaw ? inputValidator.validateUrl(urlRaw) ?? undefined : undefined,
      imageUrl: imageRaw ? inputValidator.validateUrl(imageRaw) ?? undefined : undefined,
    };

    // Handle encryption
    if (isEncrypted) {
      updates.isEncrypted = true;
      if (encryptedTitle) {
        updates.encryptedTitle = encryptedTitle;
        updates.title = '[Encrypted]'; // Placeholder
      } else if (titleRaw) {
        updates.title = inputValidator.validateTitle(titleRaw) ?? undefined;
      }
      // Content is encrypted - store as-is (don't validate as plaintext)
      updates.encryptedContent = contentRaw;
      updates.content = '[Encrypted - Access Required]'; // Placeholder until decrypted
    } else {
      // Not encrypted - validate and set content normally
      if (titleRaw) {
        updates.title = inputValidator.validateTitle(titleRaw) ?? undefined;
      }
      updates.content = inputValidator.validatePostContent(contentRaw) ?? '';
    }

    return { rootPostEventId, updates };
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
    return buildCommentEvent(postEventId, content, pubkey, parentCommentId, opts);
  }

  /**
   * Publish a BitBoard "edit" event for an existing comment event ID.
   * - Nostr events are immutable; this is an edit companion event.
   * - We reference both the root post (for query scoping) and the target comment.
   */
  buildCommentEditEvent(args: {
    rootPostEventId: string;
    targetCommentEventId: string;
    content: string;
    pubkey: string;
  }): UnsignedNostrEvent {
    return buildCommentEditEvent(args);
  }

  isBitboardCommentEditEvent(event: NostrEvent): boolean {
    return this.getBitboardType(event) === BITBOARD_TYPE_COMMENT_EDIT;
  }

  private getTargetCommentIdFromEditEvent(event: NostrEvent): string | null {
    const editTag = event.tags.find((t) => t[0] === 'e' && t[3] === 'edit' && !!t[1]);
    if (editTag?.[1]) return editTag[1];
    // Fallback: second e tag
    const eTags = event.tags.filter((t) => t[0] === 'e' && !!t[1]);
    return eTags.length >= 2 ? eTags[1][1] : null;
  }

  private getRootPostIdFromCommentScopedEvent(event: NostrEvent): string | null {
    const rootTag = event.tags.find((t) => t[0] === 'e' && t[3] === 'root' && !!t[1]);
    return rootTag?.[1] || null;
  }

  eventToCommentEditUpdate(event: NostrEvent): { rootPostEventId: string; targetCommentId: string; updates: Partial<Comment> } | null {
    if (!this.isBitboardCommentEditEvent(event)) return null;
    const rootPostEventId = this.getRootPostIdFromCommentScopedEvent(event);
    const targetCommentId = this.getTargetCommentIdFromEditEvent(event);
    if (!rootPostEventId || !targetCommentId) return null;

    const isEncrypted = event.tags.find(t => t[0] === 'encrypted')?.[1] === 'true';
    const contentRaw = event.content ?? '';

    const updates: Partial<Comment> = {
      editedAt: event.created_at * 1000,
    };

    // Handle encryption
    if (isEncrypted) {
      updates.isEncrypted = true;
      updates.encryptedContent = contentRaw; // Encrypted content is in event.content
      updates.content = '[Encrypted - Access Required]'; // Placeholder until decrypted
    } else {
      // Not encrypted - validate and set content normally
      updates.content = inputValidator.validateCommentContent(contentRaw) ?? '';
    }

    return { rootPostEventId, targetCommentId, updates };
  }

  /**
   * Build a NIP-09 deletion event for a comment.
   * Many clients respect kind=5 with an 'e' tag referencing the deleted event id.
   */
  buildCommentDeleteEvent(args: {
    rootPostEventId: string;
    targetCommentEventId: string;
    pubkey: string;
  }): UnsignedNostrEvent {
    return buildCommentDeleteEvent(args);
  }

  /**
   * Build a NIP-09 deletion event for a post.
   * NIP-09: kind=5 with 'e' tag referencing the deleted event id.
   */
  buildPostDeleteEvent(args: {
    postEventId: string;
    pubkey: string;
    reason?: string;
  }): UnsignedNostrEvent {
    return buildPostDeleteEvent(args);
  }

  isBitboardCommentDeleteEvent(event: NostrEvent): boolean {
    return event.kind === NOSTR_KINDS.DELETE && this.getBitboardType(event) === BITBOARD_TYPE_COMMENT_DELETE;
  }

  private getTargetCommentIdFromDeleteEvent(event: NostrEvent): string | null {
    const delTag = event.tags.find((t) => t[0] === 'e' && t[3] === 'delete' && !!t[1]);
    if (delTag?.[1]) return delTag[1];
    const eTags = event.tags.filter((t) => t[0] === 'e' && !!t[1]);
    return eTags.length >= 2 ? eTags[1][1] : null;
  }

  eventToCommentDeleteUpdate(event: NostrEvent): { rootPostEventId: string; targetCommentId: string; updates: Partial<Comment> } | null {
    if (!this.isBitboardCommentDeleteEvent(event)) return null;
    const rootPostEventId = this.getRootPostIdFromCommentScopedEvent(event);
    const targetCommentId = this.getTargetCommentIdFromDeleteEvent(event);
    if (!rootPostEventId || !targetCommentId) return null;

    const updates: Partial<Comment> = {
      isDeleted: true,
      deletedAt: event.created_at * 1000,
      content: '[deleted]',
      author: '[deleted]',
      authorPubkey: undefined,
    };

    return { rootPostEventId, targetCommentId, updates };
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
    return buildVoteEvent(postEventId, direction, pubkey, opts);
  }

  buildBoardEvent(
    board: Omit<Board, 'memberCount' | 'nostrEventId'>,
    pubkey: string
  ): UnsignedNostrEvent {
    return buildBoardEvent(board, pubkey);
  }

  /**
   * Build a NIP-01 profile metadata event (kind 0)
   */
  buildProfileEvent(args: {
    pubkey: string;
    name?: string;
    display_name?: string;
    about?: string;
    picture?: string;
    banner?: string;
    website?: string;
    lud06?: string;
    lud16?: string;
    nip05?: string;
  }): UnsignedNostrEvent {
    return buildProfileEvent(args);
  }

  /**
   * Build a NIP-02 contact list event (kind 3)
   */
  buildContactListEvent(args: {
    pubkey: string;
    follows: string[];
    relayHints?: Record<string, string>;
  }): UnsignedNostrEvent {
    return buildContactListEvent(args);
  }

  /**
   * Build a NIP-56 report event
   */
  buildReportEvent(args: {
    targetEventId: string;
    targetPubkey: string;
    reportType: ReportType;
    pubkey: string;
    details?: string;
  }): UnsignedNostrEvent {
    return buildReportEvent(args);
  }

  /**
   * Fetch NIP-56 reports for a specific event
   */
  async fetchReportsForEvent(eventId: string): Promise<NostrEvent[]> {
    const filter: Filter = {
      kinds: [NOSTR_KINDS.REPORT],
      '#e': [eventId],
    };

    try {
      const events = await this.pool.querySync(this.getReadRelays(), filter);
      // Filter for BitBoard reports
      return events.filter(event => 
        event.tags.some(tag => tag[0] === 'client' && tag[1] === 'bitboard')
      );
    } catch (error) {
      console.error('[Nostr] Failed to fetch reports:', error);
      return [];
    }
  }

  /**
   * Fetch NIP-56 reports by a specific user
   */
  async fetchReportsByUser(pubkey: string): Promise<NostrEvent[]> {
    const filter: Filter = {
      kinds: [NOSTR_KINDS.REPORT],
      authors: [pubkey],
    };

    try {
      const events = await this.pool.querySync(this.getReadRelays(), filter);
      return events;
    } catch (error) {
      console.error('[Nostr] Failed to fetch user reports:', error);
      return [];
    }
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

    this._activeFetches++;
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
      
      // Filter out duplicates and non-post events (prevents comment events leaking into feed)
      return events.filter(event =>
        !nostrEventDeduplicator.isEventDuplicate(event.id) && this.isBitboardPostEvent(event)
      );
    } catch (error) {
      console.error('[Nostr] Failed to fetch posts:', error);
      // Don't throw - return empty array for graceful degradation
      return [];
    } finally {
      this._activeFetches--;
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
    return events.filter(event =>
      !nostrEventDeduplicator.isEventDuplicate(event.id) && this.isBitboardCommentEvent(event, postEventId)
    );
  }

  async fetchCommentEdits(postEventId: string, opts: { limit?: number } = {}): Promise<NostrEvent[]> {
    const filter: Filter = {
      kinds: [NOSTR_KINDS.POST],
      '#client': ['bitboard'],
      '#bb': [BITBOARD_TYPE_COMMENT_EDIT],
      '#e': [postEventId],
      limit: opts.limit ?? 200,
    };

    const events = await this.pool.querySync(this.getReadRelays(), filter);
    return events.filter((event) => !nostrEventDeduplicator.isEventDuplicate(event.id) && this.isBitboardCommentEditEvent(event));
  }

  async fetchCommentDeletes(postEventId: string, opts: { limit?: number } = {}): Promise<NostrEvent[]> {
    const filter: Filter = {
      kinds: [NOSTR_KINDS.DELETE],
      '#client': ['bitboard'],
      '#bb': [BITBOARD_TYPE_COMMENT_DELETE],
      '#e': [postEventId],
      limit: opts.limit ?? 200,
    };

    const events = await this.pool.querySync(this.getReadRelays(), filter);
    return events.filter((event) => !nostrEventDeduplicator.isEventDuplicate(event.id) && this.isBitboardCommentDeleteEvent(event));
  }

  /**
   * Fetch BitBoard post edit events for a set of root post event IDs.
   */
  async fetchPostEdits(postEventIds: string[], opts: { limit?: number } = {}): Promise<NostrEvent[]> {
    const unique = Array.from(new Set(postEventIds.filter(Boolean)));
    if (unique.length === 0) return [];

    const filter: FilterWithTags = {
      kinds: [NOSTR_KINDS.POST],
      '#client': ['bitboard'],
      '#bb': [BITBOARD_TYPE_POST_EDIT],
      '#e': unique,
      limit: opts.limit ?? 200,
    };

    const events = await this.pool.querySync(this.getReadRelays(), filter);
    return events.filter((event) => !nostrEventDeduplicator.isEventDuplicate(event.id) && this.isBitboardPostEditEvent(event));
  }

  // ----------------------------------------
  // SUBSCRIPTIONS (Real-time)
  // ----------------------------------------

  subscribeToFeed(
    onEvent: (event: NostrEvent) => void,
    filters: { boardId?: string; boardAddress?: string; geohash?: string } = {}
  ): string {
    const subscriptionId = `feed-${Date.now()}`;
    
    const filter: FilterWithTags = {
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

      // Only allow post-shaped events through this subscription
      if (!this.isBitboardPostEvent(event)) {
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
          logger.debug('Nostr', `End of stored events for subscription: ${subscriptionId}`);
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

  /**
   * Subscribe to BitBoard post edit events.
   * Callers should merge edits into existing post state by root post id.
   */
  subscribeToPostEdits(onEvent: (event: NostrEvent) => void): string {
    const subscriptionId = `post-edits-${Date.now()}`;

    const filter: FilterWithTags = {
      kinds: [NOSTR_KINDS.POST],
      '#client': ['bitboard'],
      '#bb': [BITBOARD_TYPE_POST_EDIT],
      since: Math.floor(Date.now() / 1000) - NostrConfig.SUBSCRIPTION_SINCE_SECONDS,
    };

    const sub = this.pool.subscribeMany(this.getReadRelays(), [filter], {
      onevent: (event) => {
        if (nostrEventDeduplicator.isEventDuplicate(event.id)) return;
        if (!this.isBitboardPostEditEvent(event)) return;
        onEvent(event);
      },
      oneose: () => {
        logger.debug('Nostr', `End of stored events for subscription: ${subscriptionId}`);
      },
    });

    this.subscriptions.set(subscriptionId, {
      unsub: () => {
        sub.close();
      },
    });

    return subscriptionId;
  }

  subscribeToCommentEdits(postEventId: string, onEvent: (event: NostrEvent) => void): string {
    const subscriptionId = `comment-edits-${postEventId}-${Date.now()}`;

    const filter: FilterWithTags = {
      kinds: [NOSTR_KINDS.POST],
      '#client': ['bitboard'],
      '#bb': [BITBOARD_TYPE_COMMENT_EDIT],
      '#e': [postEventId],
      since: Math.floor(Date.now() / 1000) - NostrConfig.SUBSCRIPTION_SINCE_SECONDS,
    };

    const sub = this.pool.subscribeMany(this.getReadRelays(), [filter], {
      onevent: (event) => {
        if (nostrEventDeduplicator.isEventDuplicate(event.id)) return;
        if (!this.isBitboardCommentEditEvent(event)) return;
        onEvent(event);
      },
    });

    this.subscriptions.set(subscriptionId, { unsub: () => sub.close() });
    return subscriptionId;
  }

  subscribeToCommentDeletes(postEventId: string, onEvent: (event: NostrEvent) => void): string {
    const subscriptionId = `comment-deletes-${postEventId}-${Date.now()}`;

    const filter: FilterWithTags = {
      kinds: [NOSTR_KINDS.DELETE],
      '#client': ['bitboard'],
      '#bb': [BITBOARD_TYPE_COMMENT_DELETE],
      '#e': [postEventId],
      since: Math.floor(Date.now() / 1000) - NostrConfig.SUBSCRIPTION_SINCE_SECONDS,
    };

    const sub = this.pool.subscribeMany(this.getReadRelays(), [filter], {
      onevent: (event) => {
        if (nostrEventDeduplicator.isEventDuplicate(event.id)) return;
        if (!this.isBitboardCommentDeleteEvent(event)) return;
        onEvent(event);
      },
    });

    this.subscriptions.set(subscriptionId, { unsub: () => sub.close() });
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
    
    // Save profile cache to localStorage before shutdown
    this.profiles.destroy();
    
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

    const isEncrypted = getTag('encrypted') === 'true';
    const encryptedTitle = getTag('encrypted_title');
    const titleRaw = getTag('title') || 'Untitled';
    const contentRaw = event.content ?? '';
    const tagsRaw = getAllTags('t');
    const urlRaw = getTag('r');
    const imageRaw = getTag('image');

    const post: Post = {
      id: event.id,
      nostrEventId: event.id,
      boardId: getTag('board') || boardIdFromA || 'b-random',
      title: inputValidator.validateTitle(titleRaw) ?? 'Untitled',
      author: this.getDisplayName(event.pubkey),
      authorPubkey: event.pubkey,
      content: '', // Will be set based on encryption status
      timestamp: event.created_at * 1000,
      score: 0, // Will be calculated from votes
      upvotes: 0,
      downvotes: 0,
      commentCount: 0,
      tags: inputValidator.validateTags(tagsRaw),
      url: urlRaw ? inputValidator.validateUrl(urlRaw) ?? undefined : undefined,
      imageUrl: imageRaw ? inputValidator.validateUrl(imageRaw) ?? undefined : undefined,
      comments: [],
    };

    // Handle encryption
    if (isEncrypted) {
      post.isEncrypted = true;
      if (encryptedTitle) {
        post.encryptedTitle = encryptedTitle;
        // Title is encrypted, use placeholder
        post.title = '[Encrypted]';
      }
      // Content is encrypted - store as-is (don't validate as plaintext)
      post.encryptedContent = contentRaw;
      post.content = '[Encrypted - Access Required]'; // Placeholder until decrypted
    } else {
      // Not encrypted - validate and set content normally
      post.content = inputValidator.validatePostContent(contentRaw) ?? '';
    }

    return post;
  }

  eventToBoard(event: NostrEvent): Board {
    const getTag = (name: string): string | undefined => {
      const tag = event.tags.find(t => t[0] === name);
      return tag ? tag[1] : undefined;
    };

    const boardType = getTag('type') as BoardType || BoardType.TOPIC;
    const isPublic = getTag('public') !== 'false';
    const isEncrypted = getTag('encrypted') === 'true' || (!isPublic && getTag('encrypted') !== 'false');

    return {
      id: getTag('d') || event.id,
      nostrEventId: event.id,
      name: getTag('name') || 'Unknown',
      description: event.content,
      isPublic,
      memberCount: 0,
      type: boardType,
      geohash: getTag('g'),
      createdBy: event.pubkey,
      isEncrypted,
    };
  }

  eventToComment(event: NostrEvent): Comment {
    // NIP-10: extract parent comment ID from 'e' tag with marker 'reply'
    const replyTag = event.tags.find(t => t[0] === 'e' && t[3] === 'reply');
    const parentId = replyTag?.[1];
    const isEncrypted = event.tags.find(t => t[0] === 'encrypted')?.[1] === 'true';
    const contentRaw = event.content ?? '';

    const comment: Comment = {
      id: event.id,
      nostrEventId: event.id,
      author: this.getDisplayName(event.pubkey),
      authorPubkey: event.pubkey,
      content: '', // Will be set based on encryption status
      timestamp: event.created_at * 1000,
      parentId,
    };

    // Handle encryption
    if (isEncrypted) {
      comment.isEncrypted = true;
      comment.encryptedContent = contentRaw; // Encrypted content is in event.content
      comment.content = '[Encrypted - Access Required]'; // Placeholder until decrypted
    } else {
      // Not encrypted - validate and set content normally
      comment.content = inputValidator.validateCommentContent(contentRaw) ?? '';
    }

    return comment;
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

  /**
   * Fetch a user's latest contact list (kind 3). Returns the raw event (if any).
   */
  async fetchContactListEvent(pubkey: string): Promise<NostrEvent | null> {
    const filter: Filter = {
      kinds: [3], // NIP-02 contact list
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

  /**
   * Parse a contact list event into an array of followed pubkeys
   */
  parseContactList(event: NostrEvent): string[] {
    return event.tags
      .filter(tag => tag[0] === 'p' && tag[1])
      .map(tag => tag[1]);
  }
}

// Export singleton instance
export const nostrService = new NostrService();
