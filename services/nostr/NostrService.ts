import { SimplePool, type Event as NostrEvent, type Filter } from 'nostr-tools';
import {
  NOSTR_KINDS,
  type Post,
  type Board,
  type Comment,
  BoardType,
  type UnsignedNostrEvent,
  ReportType,
} from '../../types';
import { NostrConfig } from '../../config';
import { nostrEventDeduplicator } from '../messageDeduplicator';
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
  BITBOARD_TYPE_COMMENT_DELETE,
  BITBOARD_TYPE_COMMENT_EDIT,
  BITBOARD_TYPE_POST_EDIT,
} from './bitboardEventTypes';
import {
  isBitboardCommentDeleteEvent as isBitboardCommentDeleteEventHelper,
  isBitboardCommentEditEvent as isBitboardCommentEditEventHelper,
  isBitboardCommentEvent as isBitboardCommentEventHelper,
  isBitboardPostEditEvent as isBitboardPostEditEventHelper,
  isBitboardPostEvent as isBitboardPostEventHelper,
} from './eventHelpers';
import {
  eventToBoard as mapEventToBoard,
  eventToComment as mapEventToComment,
  eventToCommentDeleteUpdate as mapEventToCommentDeleteUpdate,
  eventToCommentEditUpdate as mapEventToCommentEditUpdate,
  eventToPost as mapEventToPost,
  eventToPostEditUpdate as mapEventToPostEditUpdate,
} from './eventTransforms';
import {
  fetchReportsByUser as queryReportsByUser,
  fetchReportsForEvent as queryReportsForEvent,
} from './reportQueries';
import {
  fetchLiveChatMessages as queryLiveChatMessages,
  fetchLiveEvent as queryLiveEvent,
  fetchLiveEvents as queryLiveEvents,
  subscribeToLiveChat as subscribeLiveChat,
} from './liveQueries';
import {
  fetchArticle as queryArticle,
  fetchArticlesByAuthor as queryArticlesByAuthor,
  fetchArticlesByHashtag as queryArticlesByHashtag,
  fetchArticlesForBoard as queryArticlesForBoard,
  fetchRecentArticles as queryRecentArticles,
} from './articleQueries';
import {
  fetchAllNamedLists as queryAllNamedLists,
  fetchBadgeAwards as queryBadgeAwards,
  fetchBadgeDefinition as queryBadgeDefinition,
  fetchBadgeDefinitions as queryBadgeDefinitions,
  fetchCommunities as queryCommunities,
  fetchCommunityApprovals as queryCommunityApprovals,
  fetchCommunityDefinition as queryCommunityDefinition,
  fetchList as queryList,
  fetchNamedList as queryNamedList,
  fetchProfileBadges as queryProfileBadges,
  subscribeToCommunityApprovals as subscribeCommunityApprovals,
} from './socialQueries';
import {
  fetchZapsForPubkey as queryZapsForPubkey,
  fetchZapReceipts as queryZapReceipts,
  fetchZapReceiptsForEvents as queryZapReceiptsForEvents,
  subscribeToZapReceipts as subscribeZapReceipts,
} from './zapQueries';
import {
  buildRelayListEvent as makeRelayListEvent,
  fetchContactListEvent as queryContactListEvent,
  fetchRelayListEvent as queryRelayListEvent,
  parseContactList as parseContactListEvent,
} from './relayQueries';

type FilterWithTags = Filter & { [K in `#${string}`]?: string[] };

export const DEFAULT_RELAYS = NostrConfig.DEFAULT_RELAYS;

const USER_RELAYS_STORAGE_KEY = 'bitboard_user_relays_v1';
const MESSAGE_QUEUE_STORAGE_KEY = 'bitboard_message_queue_v1';

interface RelayHealth {
  url: string;
  latencyMs: number | null;
  errorCount: number;
  successCount: number;
  lastQueryAt: number | null;
  isCircuitOpen: boolean;
  circuitOpenedAt: number | null;
}

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

  // Relay health tracking (for circuit breaker)
  private relayHealth: Map<string, RelayHealth> = new Map();
  private readonly CIRCUIT_BREAKER_ERROR_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_WINDOW_MS = 60 * 1000;
  private readonly CIRCUIT_BREAKER_RESET_TIMEOUT_MS = 30 * 1000;
  private readonly DEFAULT_QUERY_TIMEOUT_MS = 8000;

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

  // Monotonic counter for unique subscription IDs (avoids Date.now() collisions)
  private _subscriptionCounter = 0;

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
    this.relays.forEach((url) => {
      this.relayStatuses.set(url, {
        url,
        isConnected: false,
        lastError: null,
        lastConnectedAt: null,
        lastDisconnectedAt: null,
        reconnectAttempts: 0,
        nextReconnectTime: null,
      });
      this.relayHealth.set(url, {
        url,
        latencyMs: null,
        errorCount: 0,
        successCount: 0,
        lastQueryAt: null,
        isCircuitOpen: false,
        circuitOpenedAt: null,
      });
    });

    // Load any persisted message queue from previous session
    this.loadPersistedQueue();

    // Schedule flush of any loaded messages once relays connect
    this.scheduleQueueFlush();
  }

  /** Generate a unique subscription ID (monotonic counter avoids Date.now() collisions) */
  private nextSubId(prefix: string): string {
    return `${prefix}-${++this._subscriptionCounter}`;
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
      // SSRF protection: block internal networks and private IPs
      if (this.isBlockedRelayUrl(url)) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      out.push(url);
    }
    return out;
  }

  private isBlockedRelayUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      // Block localhost and loopback
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '0.0.0.0'
      ) {
        logger.warn('Nostr', `Blocked localhost relay URL: ${url}`);
        return true;
      }

      // Block internal/private IP ranges
      if (this.isPrivateIp(hostname)) {
        logger.warn('Nostr', `Blocked private IP relay URL: ${url}`);
        return true;
      }

      return false;
    } catch {
      return true;
    }
  }

  private isPrivateIp(hostname: string): boolean {
    // IPv4 private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    const ipv4Private = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/;
    if (ipv4Private.test(hostname)) return true;

    // IPv6 private range: fc00::/7
    if (hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80')) {
      return true;
    }

    // Check for literal IPv6 addresses
    if (hostname.startsWith('[') && hostname.includes(':')) {
      const ipv6 = hostname.replace(/[[\]]/g, '').toLowerCase();
      if (
        ipv6 === '::1' ||
        ipv6 === '::' ||
        ipv6.startsWith('fe80:') ||
        ipv6.startsWith('fc') ||
        ipv6.startsWith('fd')
      ) {
        return true;
      }
    }

    return false;
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

    // Update relay statuses and health
    relays.forEach((url) => {
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
      if (!this.relayHealth.has(url)) {
        this.relayHealth.set(url, {
          url,
          latencyMs: null,
          errorCount: 0,
          successCount: 0,
          lastQueryAt: null,
          isCircuitOpen: false,
          circuitOpenedAt: null,
        });
      }
    });
  }

  getRelays(): Array<{ url: string; status: 'connected' | 'disconnected' | 'connecting' }> {
    return this.relays.map((url) => {
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
    return Array.from(this.relayStatuses.values()).some((s) => s.isConnected);
  }

  /**
   * Get count of connected relays
   */
  getConnectedCount(): number {
    return Array.from(this.relayStatuses.values()).filter((s) => s.isConnected).length;
  }

  getQueuedMessageCount(): number {
    return this.messageQueue.length;
  }

  async queryEvents(filter: Filter): Promise<NostrEvent[]> {
    return this.queryWithTimeout(this.getReadRelays(), filter, this.DEFAULT_QUERY_TIMEOUT_MS);
  }

  private async queryWithTimeout(
    relays: string[],
    filter: Filter,
    timeoutMs: number,
  ): Promise<NostrEvent[]> {
    const healthyRelays = this.getHealthyRelays(relays);
    if (healthyRelays.length === 0) {
      logger.warn('Nostr', 'All relays are circuit-broken, skipping query');
      return [];
    }

    const startTime = Date.now();
    let timeoutId: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Query timeout')), timeoutMs);
    });

    try {
      const results = await Promise.race([
        this.pool.querySync(healthyRelays, filter),
        timeoutPromise,
      ]);
      clearTimeout(timeoutId!);

      const latencyMs = Date.now() - startTime;
      this.recordQuerySuccess(healthyRelays, latencyMs);
      return results;
    } catch (error) {
      clearTimeout(timeoutId!);
      const latencyMs = Date.now() - startTime;
      this.recordQueryError(healthyRelays, latencyMs, error);
      throw error;
    }
  }

  private getHealthyRelays(relays: string[]): string[] {
    return relays.filter((url) => {
      const health = this.relayHealth.get(url);
      if (!health) return true;
      if (health.isCircuitOpen) {
        const now = Date.now();
        const resetTimeout = this.CIRCUIT_BREAKER_RESET_TIMEOUT_MS;
        if (health.circuitOpenedAt && now - health.circuitOpenedAt > resetTimeout) {
          health.isCircuitOpen = false;
          health.errorCount = 0;
          health.circuitOpenedAt = null;
          return true;
        }
        return false;
      }
      return true;
    });
  }

  private recordQuerySuccess(relays: string[], latencyMs: number): void {
    for (const url of relays) {
      const health = this.relayHealth.get(url);
      if (health) {
        health.successCount++;
        health.latencyMs = latencyMs;
        health.lastQueryAt = Date.now();
      }
    }
  }

  private recordQueryError(relays: string[], latencyMs: number, _error: unknown): void {
    for (const url of relays) {
      const health = this.relayHealth.get(url);
      if (health) {
        health.errorCount++;
        health.latencyMs = latencyMs;
        health.lastQueryAt = Date.now();

        if (health.errorCount >= this.CIRCUIT_BREAKER_ERROR_THRESHOLD) {
          health.isCircuitOpen = true;
          health.circuitOpenedAt = Date.now();
          logger.warn('Nostr', `Circuit breaker opened for relay: ${url}`);
        }
      }
    }
  }

  /**
   * Get health status of all relays
   */
  getRelayHealth(): RelayHealth[] {
    return Array.from(this.relayHealth.values());
  }

  /**
   * Reset circuit breaker for a specific relay
   */
  resetRelayCircuitBreaker(url: string): void {
    const health = this.relayHealth.get(url);
    if (health) {
      health.isCircuitOpen = false;
      health.errorCount = 0;
      health.circuitOpenedAt = null;
    }
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
      const connected = results.filter((r) => r.status === 'fulfilled' && r.value).length;

      logger.mark('nostr-preconnect-end');
      logger.info(
        'Nostr',
        `Pre-connected to ${connected}/${readRelays.length} relays in ${Date.now() - startTime}ms`,
      );
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
    if (
      errorMessage.includes('dns') ||
      errorMessage.includes('hostname') ||
      errorMessage.includes('not found') ||
      errorMessage.includes('enotfound')
    ) {
      logger.warn('Nostr', `Permanent failure for ${url} - not retrying`);
      diagnosticsService.error('nostr', `Relay permanent failure: ${url}`, error.message);
      status.reconnectAttempts = this.MAX_RECONNECT_ATTEMPTS;
      return;
    }

    // Implement exponential backoff
    status.reconnectAttempts++;

    if (status.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      logger.warn(
        'Nostr',
        `Max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached for ${url}`,
      );
      return;
    }

    // Calculate backoff interval
    const backoffInterval = Math.min(
      this.INITIAL_BACKOFF_MS * Math.pow(this.BACKOFF_MULTIPLIER, status.reconnectAttempts - 1),
      this.MAX_BACKOFF_MS,
    );

    status.nextReconnectTime = Date.now() + backoffInterval;

    logger.debug(
      'Nostr',
      `Scheduling reconnection to ${url} in ${backoffInterval}ms (attempt ${status.reconnectAttempts})`,
    );

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
    this.pool
      .querySync([url], { kinds: [0], limit: 1 })
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
    this.reconnectTimers.forEach((timer) => clearTimeout(timer));
    this.reconnectTimers.clear();

    // Reset all statuses
    this.relayStatuses.forEach((status) => {
      status.reconnectAttempts = 0;
      status.nextReconnectTime = null;
      status.lastError = null;
    });

    // Attempt reconnection to all relays
    this.relays.forEach((url) => this.attemptReconnection(url));
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
    let hasChanges = false;

    for (let i = this.messageQueue.length - 1; i >= 0; i--) {
      const item = this.messageQueue[i];

      // Skip if too old
      if (now - item.timestamp > this.MESSAGE_QUEUE_MAX_AGE_MS) {
        this.messageQueue.splice(i, 1);
        hasChanges = true;
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
            this.persistMessageQueue();
          })
          .catch((err) => logger.error('Nostr', 'Failed to flush message queue', err));
      }
    }

    if (hasChanges) {
      this.persistMessageQueue();
    }
  }

  private cleanupMessageQueue() {
    const now = Date.now();
    this.messageQueue = this.messageQueue.filter(
      (item) => now - item.timestamp < this.MESSAGE_QUEUE_MAX_AGE_MS,
    );
    this.persistMessageQueue();
  }

  private persistMessageQueue(): void {
    try {
      const data = this.messageQueue.map((m) => ({
        event: m.event,
        pendingRelays: Array.from(m.pendingRelays),
        timestamp: m.timestamp,
      }));
      const serialized = JSON.stringify(data);

      if (!this.checkLocalStorageQuota(serialized.length)) {
        this.evictOldQueueItems();
        const evictedSerialized = JSON.stringify(
          this.messageQueue.map((m) => ({
            event: m.event,
            pendingRelays: Array.from(m.pendingRelays),
            timestamp: m.timestamp,
          })),
        );
        if (!this.checkLocalStorageQuota(evictedSerialized.length)) {
          logger.warn('Nostr', 'localStorage quota too low, clearing queue');
          localStorage.removeItem(MESSAGE_QUEUE_STORAGE_KEY);
          return;
        }
        localStorage.setItem(MESSAGE_QUEUE_STORAGE_KEY, evictedSerialized);
        return;
      }

      localStorage.setItem(MESSAGE_QUEUE_STORAGE_KEY, serialized);
    } catch (error) {
      logger.warn('Nostr', 'Failed to persist message queue', error);
    }
  }

  private checkLocalStorageQuota(dataSizeBytes: number): boolean {
    try {
      const testKey = '__storage_test__';
      const testData = 'x'.repeat(Math.min(dataSizeBytes, 1024 * 1024));
      localStorage.setItem(testKey, testData);
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  private evictOldQueueItems(): void {
    if (this.messageQueue.length <= 10) return;
    const removeCount = Math.floor(this.messageQueue.length * 0.3);
    this.messageQueue.splice(0, removeCount);
    logger.info('Nostr', `Evicted ${removeCount} items from message queue due to storage pressure`);
  }

  private loadPersistedQueue(): void {
    const stored = localStorage.getItem(MESSAGE_QUEUE_STORAGE_KEY);
    if (!stored) return;

    try {
      const data = JSON.parse(stored);
      if (!Array.isArray(data)) {
        localStorage.removeItem(MESSAGE_QUEUE_STORAGE_KEY);
        return;
      }

      const validMessages = data.filter((m: any) => m.event && m.pendingRelays && m.timestamp);

      if (validMessages.length > 0) {
        this.messageQueue = validMessages.map((m: any) => ({
          event: m.event,
          pendingRelays: new Set(m.pendingRelays),
          timestamp: m.timestamp,
        }));
        logger.info('Nostr', `Loaded ${this.messageQueue.length} messages from queue`);
        // Do NOT remove the storage key here — if the page closes during flush the
        // messages would be lost. persistMessageQueue() keeps the storage in sync as
        // items are flushed, and will write an empty array when the queue drains.
      } else {
        localStorage.removeItem(MESSAGE_QUEUE_STORAGE_KEY);
      }
    } catch (error) {
      logger.warn('Nostr', 'Failed to load persisted message queue', error);
      localStorage.removeItem(MESSAGE_QUEUE_STORAGE_KEY);
    }
  }

  private clearPersistedQueue(): void {
    localStorage.removeItem(MESSAGE_QUEUE_STORAGE_KEY);
  }

  private scheduleQueueFlush(): void {
    if (this.messageQueue.length === 0) return;

    logger.info('Nostr', `Scheduling flush for ${this.messageQueue.length} queued messages`);

    // Cap retries so the loop doesn't run forever when offline.
    // 30 attempts × 2 s = 1 minute. After that, we rely on the 'online' event
    // or the next explicit publish to re-trigger the flush.
    const MAX_ATTEMPTS = 30;
    let attempts = 0;

    const checkAndFlush = () => {
      const connectedRelays = this.getPublishRelays().filter(
        (url) => this.relayStatuses.get(url)?.isConnected,
      );

      if (connectedRelays.length > 0) {
        connectedRelays.forEach((relay) => this.flushMessageQueue(relay));
      } else if (++attempts < MAX_ATTEMPTS) {
        setTimeout(checkAndFlush, 2000);
      } else {
        logger.warn('Nostr', 'Queue flush gave up after 30 attempts — will retry on next publish');
        // Resume automatically when connectivity is restored
        window.addEventListener('online', () => this.scheduleQueueFlush(), { once: true });
      }
    };

    setTimeout(checkAndFlush, 1000);
  }

  private async publishEventToRelay(event: NostrEvent, relayUrl: string): Promise<NostrEvent> {
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
      const knownConnected = publishRelays.filter(
        (url) => this.relayStatuses.get(url)?.isConnected,
      );
      const relaysToPublish = knownConnected.length > 0 ? knownConnected : publishRelays;

      const results = await Promise.allSettled(
        relaysToPublish.map(async (url) => {
          await this.pool.publish([url], signedEvent);
          return url;
        }),
      );

      const succeeded: string[] = [];
      const failed: Array<{ url: string; error: unknown }> = [];
      results.forEach((r, i) => {
        const url = relaysToPublish[i];
        if (r.status === 'fulfilled') succeeded.push(r.value);
        else failed.push({ url, error: r.reason });
      });

      if (succeeded.length === 0) {
        // Queue for retry and surface the error.
        // Do NOT also queue in the catch block below — the event is already queued here.
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
      // Only queue here if the event was NOT already queued in the try block above.
      // Events reach this catch from errors other than "all relays failed" (e.g.
      // network setup failures before any relay is tried), so queue them for retry.
      // The "all relays failed" path already called queueMessage and then threw, which
      // is caught here — we detect this by checking whether the event is already queued.
      const alreadyQueued = this.messageQueue.some((m) => m.event.id === signedEvent.id);
      if (!alreadyQueued) {
        this.queueMessage(signedEvent, this.getPublishRelays());
      }
      throw error;
    } finally {
      this._activePublishes--;
    }
  }

  // ----------------------------------------
  // EVENT SHAPE HELPERS (Post vs Comment)
  // ----------------------------------------

  /**
   * Determine if an event should be treated as a BitBoard "post".
   * Supports both:
   * - New format: ['bb','post']
   * - Legacy format: presence of 'title' + ('board' or NIP-33 'a' ref to a board)
   */
  isBitboardPostEvent(event: NostrEvent): boolean {
    return isBitboardPostEventHelper(event);
  }

  /**
   * Determine if an event should be treated as a BitBoard "comment".
   * Supports both:
   * - New format: ['bb','comment']
   * - Legacy format: kind=1 event with NIP-10 e-tags referencing a root post
   */
  isBitboardCommentEvent(event: NostrEvent, rootPostEventId?: string): boolean {
    return isBitboardCommentEventHelper(event, rootPostEventId);
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
  async fetchProfiles(
    pubkeys: string[],
    opts: { force?: boolean } = {},
  ): Promise<Map<string, NostrProfileMetadata>> {
    return this.profiles.fetchProfiles(pubkeys, opts);
  }

  buildPostEvent(
    post: Omit<
      Post,
      'id' | 'score' | 'commentCount' | 'comments' | 'nostrEventId' | 'upvotes' | 'downvotes'
    >,
    pubkey: string,
    geohash?: string, // For location-based boards
    opts?: {
      /** NIP-33 board address (30001:<pubkey>:<d>) */
      boardAddress?: string;
      /** Used as a discoverability hashtag */
      boardName?: string;
      /** Encrypted title (base64) */
      encryptedTitle?: string;
      /** Encrypted content (base64) */
      encryptedContent?: string;
    },
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
    return isBitboardPostEditEventHelper(event);
  }

  /**
   * Convert a post edit event into a partial Post update.
   * Does NOT change post id / nostrEventId (those stay the original post's event id).
   */
  eventToPostEditUpdate(
    event: NostrEvent,
  ): { rootPostEventId: string; updates: Partial<Post> } | null {
    return mapEventToPostEditUpdate(event);
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
      /** Encrypted content (base64) */
      encryptedContent?: string;
    },
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
    /** Encrypted content (base64) */
    encryptedContent?: string;
  }): UnsignedNostrEvent {
    return buildCommentEditEvent(args);
  }

  isBitboardCommentEditEvent(event: NostrEvent): boolean {
    return isBitboardCommentEditEventHelper(event);
  }

  eventToCommentEditUpdate(
    event: NostrEvent,
  ): { rootPostEventId: string; targetCommentId: string; updates: Partial<Comment> } | null {
    return mapEventToCommentEditUpdate(event);
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
    return isBitboardCommentDeleteEventHelper(event);
  }

  eventToCommentDeleteUpdate(
    event: NostrEvent,
  ): { rootPostEventId: string; targetCommentId: string; updates: Partial<Comment> } | null {
    return mapEventToCommentDeleteUpdate(event);
  }

  buildVoteEvent(
    postEventId: string,
    direction: 'up' | 'down',
    pubkey: string,
    opts?: {
      /** Post author's pubkey (NIP-25 p tag) */
      postAuthorPubkey?: string;
    },
  ): UnsignedNostrEvent {
    return buildVoteEvent(postEventId, direction, pubkey, opts);
  }

  buildBoardEvent(
    board: Omit<Board, 'memberCount' | 'nostrEventId'>,
    pubkey: string,
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
    return queryReportsForEvent(
      { pool: this.pool, getReadRelays: () => this.getReadRelays() },
      eventId,
    );
  }

  /**
   * Fetch NIP-56 reports by a specific user
   */
  async fetchReportsByUser(pubkey: string): Promise<NostrEvent[]> {
    return queryReportsByUser(
      { pool: this.pool, getReadRelays: () => this.getReadRelays() },
      pubkey,
    );
  }

  // ----------------------------------------
  // QUERYING EVENTS
  // ----------------------------------------

  async fetchPosts(
    filters: {
      boardId?: string;
      boardAddress?: string;
      geohash?: string;
      limit?: number;
      since?: number;
      until?: number; // For pagination: fetch posts older than this timestamp
    } = {},
  ): Promise<NostrEvent[]> {
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
      const connectedRelays = readRelays.filter((url) => {
        const status = this.relayStatuses.get(url);
        return status?.isConnected !== false; // Include unknown status
      });

      // If we have connected relays, query them first
      const relaysToQuery = connectedRelays.length > 0 ? connectedRelays : readRelays;

      // Use Promise.race with timeout for faster response
      const QUERY_TIMEOUT_MS = 5000; // 5 second timeout
      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Query timeout')), QUERY_TIMEOUT_MS);
      });

      const queryPromise = this.pool.querySync(relaysToQuery, filter);

      const events = await Promise.race([queryPromise, timeoutPromise]).finally(() => {
        clearTimeout(timeoutId);
      });

      // Update relay statuses on success
      relaysToQuery.forEach((url) => this.updateRelayStatus(url, true));

      // Filter out duplicates and non-post events (prevents comment events leaking into feed)
      return events.filter(
        (event) =>
          !nostrEventDeduplicator.isEventDuplicate(event.id) && this.isBitboardPostEvent(event),
      );
    } catch (error) {
      logger.error('Nostr', 'Failed to fetch posts:', error);
      // Don't throw - return empty array for graceful degradation
      return [];
    } finally {
      this._activeFetches--;
    }
  }

  /**
   * Fetch specific BitBoard posts by Nostr event id (hex).
   * Used to hydrate bookmarks after posts were evicted from the in-memory LRU cache.
   * Does not use the realtime deduplicator — evicted posts may still be marked "seen" there.
   */
  async fetchPostsByIds(ids: string[]): Promise<NostrEvent[]> {
    const unique = [...new Set(ids.filter((id) => /^[0-9a-f]{64}$/i.test(id)))];
    if (unique.length === 0) return [];

    const CHUNK_SIZE = 80;
    const collected = new Map<string, NostrEvent>();

    this._activeFetches++;
    try {
      const readRelays = this.getReadRelays();
      const connectedRelays = readRelays.filter((url) => {
        const status = this.relayStatuses.get(url);
        return status?.isConnected !== false;
      });
      const relaysToQuery = connectedRelays.length > 0 ? connectedRelays : readRelays;

      const QUERY_TIMEOUT_MS = 8000;

      for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
        const chunk = unique.slice(i, i + CHUNK_SIZE);
        const filter: Filter = {
          kinds: [NOSTR_KINDS.POST],
          ids: chunk,
        };

        let timeoutId: ReturnType<typeof setTimeout>;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Query timeout')), QUERY_TIMEOUT_MS);
        });

        try {
          const queryPromise = this.pool.querySync(relaysToQuery, filter);
          const events = await Promise.race([queryPromise, timeoutPromise]).finally(() => {
            clearTimeout(timeoutId);
          });

          for (const event of events) {
            if (!this.isBitboardPostEvent(event)) continue;
            collected.set(event.id, event);
          }

          relaysToQuery.forEach((url) => this.updateRelayStatus(url, true));
        } catch (error) {
          logger.error('Nostr', 'Failed to fetch posts by ids (chunk):', error);
        }
      }

      return Array.from(collected.values());
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
      const events = await this.queryWithTimeout(
        this.getReadRelays(),
        filter,
        this.DEFAULT_QUERY_TIMEOUT_MS,
      );
      return events.filter((event) => !nostrEventDeduplicator.isEventDuplicate(event.id));
    } catch (error) {
      logger.error('Nostr', 'Failed to fetch boards:', error);
      return [];
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
      limit: 500,
    };

    try {
      const events = await this.queryWithTimeout(
        this.getReadRelays(),
        filter,
        this.DEFAULT_QUERY_TIMEOUT_MS,
      );
      return events;
    } catch (error) {
      logger.error('Nostr', 'Failed to fetch vote events:', error);
      return [];
    }
  }

  /**
   * Fetch votes for a post with simple count (legacy method)
   * For verified voting, use fetchVoteEvents instead
   */
  async fetchVotesForPost(
    postEventId: string,
  ): Promise<{ up: number; down: number; events: NostrEvent[] }> {
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

    votesByPubkey.forEach((event) => {
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

    try {
      const events = await this.queryWithTimeout(
        this.getReadRelays(),
        filter,
        this.DEFAULT_QUERY_TIMEOUT_MS,
      );
      return events.filter(
        (event) =>
          !nostrEventDeduplicator.isEventDuplicate(event.id) &&
          this.isBitboardCommentEvent(event, postEventId),
      );
    } catch (error) {
      logger.error('Nostr', 'Failed to fetch comments:', error);
      return [];
    }
  }

  async fetchCommentEdits(
    postEventId: string,
    opts: { limit?: number } = {},
  ): Promise<NostrEvent[]> {
    const filter: Filter = {
      kinds: [NOSTR_KINDS.POST],
      '#client': ['bitboard'],
      '#bb': [BITBOARD_TYPE_COMMENT_EDIT],
      '#e': [postEventId],
      limit: opts.limit ?? 200,
    };

    try {
      const events = await this.queryWithTimeout(
        this.getReadRelays(),
        filter,
        this.DEFAULT_QUERY_TIMEOUT_MS,
      );
      return events.filter(
        (event) =>
          !nostrEventDeduplicator.isEventDuplicate(event.id) &&
          this.isBitboardCommentEditEvent(event),
      );
    } catch (error) {
      logger.error('Nostr', 'Failed to fetch comment edits:', error);
      return [];
    }
  }

  async fetchCommentDeletes(
    postEventId: string,
    opts: { limit?: number } = {},
  ): Promise<NostrEvent[]> {
    const filter: Filter = {
      kinds: [NOSTR_KINDS.DELETE],
      '#client': ['bitboard'],
      '#bb': [BITBOARD_TYPE_COMMENT_DELETE],
      '#e': [postEventId],
      limit: opts.limit ?? 200,
    };

    try {
      const events = await this.queryWithTimeout(
        this.getReadRelays(),
        filter,
        this.DEFAULT_QUERY_TIMEOUT_MS,
      );
      return events.filter(
        (event) =>
          !nostrEventDeduplicator.isEventDuplicate(event.id) &&
          this.isBitboardCommentDeleteEvent(event),
      );
    } catch (error) {
      logger.error('Nostr', 'Failed to fetch comment deletes:', error);
      return [];
    }
  }

  /**
   * Fetch BitBoard post edit events for a set of root post event IDs.
   */
  async fetchPostEdits(
    postEventIds: string[],
    opts: { limit?: number } = {},
  ): Promise<NostrEvent[]> {
    const unique = Array.from(new Set(postEventIds.filter(Boolean)));
    if (unique.length === 0) return [];

    const filter: FilterWithTags = {
      kinds: [NOSTR_KINDS.POST],
      '#client': ['bitboard'],
      '#bb': [BITBOARD_TYPE_POST_EDIT],
      '#e': unique,
      limit: opts.limit ?? 200,
    };

    try {
      const events = await this.queryWithTimeout(
        this.getReadRelays(),
        filter as Filter,
        this.DEFAULT_QUERY_TIMEOUT_MS,
      );
      return events.filter(
        (event) =>
          !nostrEventDeduplicator.isEventDuplicate(event.id) && this.isBitboardPostEditEvent(event),
      );
    } catch (error) {
      logger.error('Nostr', 'Failed to fetch post edits:', error);
      return [];
    }
  }

  // ----------------------------------------
  // SUBSCRIPTIONS (Real-time)
  // ----------------------------------------

  subscribeToFeed(
    onEvent: (event: NostrEvent) => void,
    filters: { boardId?: string; boardAddress?: string; geohash?: string } = {},
  ): string {
    const subscriptionId = this.nextSubId('feed');

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
        eventsToProcess.forEach((e) => onEvent(e));
      }, DEBOUNCE_MS);
    };

    const sub = this.pool.subscribeMany(this.getReadRelays(), [filter] as any, {
      onevent: debouncedHandler,
      oneose: () => {
        // Flush any pending events when subscription ends
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        if (pendingEvents.length > 0) {
          pendingEvents.forEach((e) => onEvent(e));
          pendingEvents.length = 0;
        }
        logger.debug('Nostr', `End of stored events for subscription: ${subscriptionId}`);
      },
    });

    this.subscriptions.set(subscriptionId, {
      unsub: () => {
        // Cleanup debounce timer
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        sub.close();
      },
    });
    return subscriptionId;
  }

  subscribeToFilters(
    filters: Filter[],
    handlers: {
      onEvent: (event: NostrEvent) => void;
      onEose?: () => void;
    },
  ): string {
    const subscriptionId = this.nextSubId('custom');
    const sub = this.pool.subscribeMany(this.getReadRelays(), filters as any, {
      onevent: handlers.onEvent,
      oneose: () => {
        handlers.onEose?.();
        logger.debug('Nostr', `End of stored events for subscription: ${subscriptionId}`);
      },
    });

    this.subscriptions.set(subscriptionId, {
      unsub: () => sub.close(),
    });

    return subscriptionId;
  }

  /**
   * Subscribe to BitBoard post edit events.
   * Callers should merge edits into existing post state by root post id.
   */
  subscribeToPostEdits(onEvent: (event: NostrEvent) => void): string {
    const subscriptionId = this.nextSubId('post-edits');

    const filter: FilterWithTags = {
      kinds: [NOSTR_KINDS.POST],
      '#client': ['bitboard'],
      '#bb': [BITBOARD_TYPE_POST_EDIT],
      since: Math.floor(Date.now() / 1000) - NostrConfig.SUBSCRIPTION_SINCE_SECONDS,
    };

    const sub = this.pool.subscribeMany(this.getReadRelays(), [filter] as any, {
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
    const subscriptionId = this.nextSubId(`comment-edits-${postEventId}`);

    const filter: FilterWithTags = {
      kinds: [NOSTR_KINDS.POST],
      '#client': ['bitboard'],
      '#bb': [BITBOARD_TYPE_COMMENT_EDIT],
      '#e': [postEventId],
      since: Math.floor(Date.now() / 1000) - NostrConfig.SUBSCRIPTION_SINCE_SECONDS,
    };

    const sub = this.pool.subscribeMany(this.getReadRelays(), [filter] as any, {
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
    const subscriptionId = this.nextSubId(`comment-deletes-${postEventId}`);

    const filter: FilterWithTags = {
      kinds: [NOSTR_KINDS.DELETE],
      '#client': ['bitboard'],
      '#bb': [BITBOARD_TYPE_COMMENT_DELETE],
      '#e': [postEventId],
      since: Math.floor(Date.now() / 1000) - NostrConfig.SUBSCRIPTION_SINCE_SECONDS,
    };

    const sub = this.pool.subscribeMany(this.getReadRelays(), [filter] as any, {
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
    this.subscriptions.forEach((sub) => sub.unsub());
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
    this.reconnectTimers.forEach((timer) => clearTimeout(timer));
    this.reconnectTimers.clear();
    this.messageQueue = [];

    // Save profile cache to localStorage before shutdown
    this.profiles.destroy();

    // Close all pool WebSocket connections to prevent leaks
    try {
      this.pool.close(this.relays);
    } catch {
      // pool.close may throw if already closed — safe to ignore
    }

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
    return mapEventToPost(event, (pubkey) => this.getDisplayName(pubkey));
  }

  eventToBoard(event: NostrEvent): Board {
    return mapEventToBoard(event);
  }

  eventToComment(event: NostrEvent): Comment {
    return mapEventToComment(event, (pubkey) => this.getDisplayName(pubkey));
  }

  // ----------------------------------------
  // NIP-53 LIVE EVENTS
  // ----------------------------------------

  /**
   * Fetch a live event by host and id
   */
  async fetchLiveEvent(hostPubkey: string, eventId: string): Promise<NostrEvent | null> {
    return queryLiveEvent(
      { pool: this.pool, getReadRelays: () => this.getReadRelays() },
      hostPubkey,
      eventId,
    );
  }

  /**
   * Fetch live events by status
   */
  async fetchLiveEvents(
    opts: {
      status?: 'planned' | 'live' | 'ended';
      limit?: number;
    } = {},
  ): Promise<NostrEvent[]> {
    return queryLiveEvents({ pool: this.pool, getReadRelays: () => this.getReadRelays() }, opts);
  }

  /**
   * Fetch live chat messages for an event
   */
  async fetchLiveChatMessages(
    liveEventAddress: string,
    opts: {
      limit?: number;
      since?: number;
    } = {},
  ): Promise<NostrEvent[]> {
    return queryLiveChatMessages(
      { pool: this.pool, getReadRelays: () => this.getReadRelays() },
      liveEventAddress,
      opts,
    );
  }

  /**
   * Subscribe to live chat messages
   */
  subscribeToLiveChat(liveEventAddress: string, onEvent: (event: NostrEvent) => void): string {
    return subscribeLiveChat(
      {
        pool: this.pool,
        getReadRelays: () => this.getReadRelays(),
        subscriptions: this.subscriptions,
        nextSubId: (prefix: string) => this.nextSubId(prefix),
      },
      liveEventAddress,
      onEvent,
    );
  }

  // ----------------------------------------
  // NIP-50 SEARCH
  // ----------------------------------------

  /**
   * Search relays using NIP-50 full-text search
   * Note: Not all relays support NIP-50
   */
  async searchRelays(
    query: string,
    opts: {
      kinds?: number[];
      limit?: number;
      since?: number;
      until?: number;
      authors?: string[];
    } = {},
  ): Promise<NostrEvent[]> {
    // NIP-50 search filter uses 'search' field
    const filter: Filter & { search?: string } = {
      kinds: opts.kinds || [NOSTR_KINDS.POST],
      limit: opts.limit || 50,
      search: query,
    };

    if (opts.since) filter.since = opts.since;
    if (opts.until) filter.until = opts.until;
    if (opts.authors) filter.authors = opts.authors;

    try {
      // Note: Only relays supporting NIP-50 will return results
      // Others will ignore the search field
      const events = await this.queryWithTimeout(
        this.getReadRelays(),
        filter as Filter,
        this.DEFAULT_QUERY_TIMEOUT_MS,
      );
      return events.sort((a, b) => b.created_at - a.created_at);
    } catch (error) {
      logger.error('Nostr', 'Search failed', error);
      return [];
    }
  }

  /**
   * Search by hashtag (works on all relays)
   */
  async searchByHashtag(
    hashtag: string,
    opts: {
      kinds?: number[];
      limit?: number;
    } = {},
  ): Promise<NostrEvent[]> {
    const normalizedTag = hashtag.toLowerCase().replace(/^#/, '');

    const filter: Filter = {
      kinds: opts.kinds || [NOSTR_KINDS.POST],
      '#t': [normalizedTag],
      limit: opts.limit || 50,
    };

    try {
      const events = await this.queryWithTimeout(
        this.getReadRelays(),
        filter,
        this.DEFAULT_QUERY_TIMEOUT_MS,
      );
      return events.sort((a, b) => b.created_at - a.created_at);
    } catch (error) {
      logger.error('Nostr', 'Hashtag search failed', error);
      return [];
    }
  }

  // ----------------------------------------
  // NIP-23 LONG-FORM ARTICLES
  // ----------------------------------------

  /**
   * Fetch an article by author and id (d tag)
   */
  async fetchArticle(authorPubkey: string, articleId: string): Promise<NostrEvent | null> {
    return queryArticle(
      { pool: this.pool, getReadRelays: () => this.getReadRelays() },
      authorPubkey,
      articleId,
    );
  }

  /**
   * Fetch articles by author
   */
  async fetchArticlesByAuthor(
    authorPubkey: string,
    opts: { limit?: number } = {},
  ): Promise<NostrEvent[]> {
    return queryArticlesByAuthor(
      { pool: this.pool, getReadRelays: () => this.getReadRelays() },
      authorPubkey,
      opts,
    );
  }

  /**
   * Fetch articles for a board
   */
  async fetchArticlesForBoard(
    boardId: string,
    opts: { limit?: number } = {},
  ): Promise<NostrEvent[]> {
    return queryArticlesForBoard(
      { pool: this.pool, getReadRelays: () => this.getReadRelays() },
      boardId,
      opts,
    );
  }

  /**
   * Fetch recent BitBoard articles
   */
  async fetchRecentArticles(opts: { limit?: number; since?: number } = {}): Promise<NostrEvent[]> {
    return queryRecentArticles(
      { pool: this.pool, getReadRelays: () => this.getReadRelays() },
      opts,
    );
  }

  /**
   * Fetch articles by hashtag
   */
  async fetchArticlesByHashtag(
    hashtag: string,
    opts: { limit?: number } = {},
  ): Promise<NostrEvent[]> {
    return queryArticlesByHashtag(
      { pool: this.pool, getReadRelays: () => this.getReadRelays() },
      hashtag,
      opts,
    );
  }

  // ----------------------------------------
  // NIP-51 LISTS
  // ----------------------------------------

  /**
   * Fetch a user's list by kind (non-parameterized lists like mute, bookmarks)
   */
  async fetchList(pubkey: string, kind: number): Promise<NostrEvent | null> {
    return queryList({ pool: this.pool, getReadRelays: () => this.getReadRelays() }, pubkey, kind);
  }

  /**
   * Fetch a named list (parameterized replaceable event)
   */
  async fetchNamedList(pubkey: string, kind: number, name: string): Promise<NostrEvent | null> {
    return queryNamedList(
      { pool: this.pool, getReadRelays: () => this.getReadRelays() },
      pubkey,
      kind,
      name,
    );
  }

  /**
   * Fetch all named lists of a kind for a user
   */
  async fetchAllNamedLists(pubkey: string, kind: number): Promise<NostrEvent[]> {
    return queryAllNamedLists(
      { pool: this.pool, getReadRelays: () => this.getReadRelays() },
      pubkey,
      kind,
    );
  }

  // ----------------------------------------
  // NIP-72 MODERATED COMMUNITIES
  // ----------------------------------------

  /**
   * Fetch a community definition (kind 34550)
   */
  async fetchCommunityDefinition(
    creatorPubkey: string,
    communityId: string,
  ): Promise<NostrEvent | null> {
    return queryCommunityDefinition(
      { pool: this.pool, getReadRelays: () => this.getReadRelays() },
      creatorPubkey,
      communityId,
    );
  }

  /**
   * Fetch all BitBoard communities
   */
  async fetchCommunities(opts: { limit?: number } = {}): Promise<NostrEvent[]> {
    return queryCommunities({ pool: this.pool, getReadRelays: () => this.getReadRelays() }, opts);
  }

  /**
   * Fetch post approvals for a community (kind 4550)
   */
  async fetchCommunityApprovals(communityAddress: string): Promise<NostrEvent[]> {
    return queryCommunityApprovals(
      { pool: this.pool, getReadRelays: () => this.getReadRelays() },
      communityAddress,
    );
  }

  /**
   * Subscribe to community approvals (real-time updates)
   */
  subscribeToCommunityApprovals(
    communityAddress: string,
    onEvent: (event: NostrEvent) => void,
  ): string {
    return subscribeCommunityApprovals(
      {
        pool: this.pool,
        getReadRelays: () => this.getReadRelays(),
        subscriptions: this.subscriptions,
        nextSubId: (prefix: string) => this.nextSubId(prefix),
      },
      communityAddress,
      onEvent,
    );
  }

  // ----------------------------------------
  // NIP-58 BADGES
  // ----------------------------------------

  /**
   * Fetch badge definitions by creator
   */
  async fetchBadgeDefinitions(creatorPubkey: string): Promise<NostrEvent[]> {
    return queryBadgeDefinitions(
      { pool: this.pool, getReadRelays: () => this.getReadRelays() },
      creatorPubkey,
    );
  }

  /**
   * Fetch a specific badge definition
   */
  async fetchBadgeDefinition(creatorPubkey: string, badgeId: string): Promise<NostrEvent | null> {
    return queryBadgeDefinition(
      { pool: this.pool, getReadRelays: () => this.getReadRelays() },
      creatorPubkey,
      badgeId,
    );
  }

  /**
   * Fetch badge awards for a pubkey
   */
  async fetchBadgeAwards(pubkey: string): Promise<NostrEvent[]> {
    return queryBadgeAwards({ pool: this.pool, getReadRelays: () => this.getReadRelays() }, pubkey);
  }

  /**
   * Fetch a user's profile badges (what they display)
   */
  async fetchProfileBadges(pubkey: string): Promise<NostrEvent | null> {
    return queryProfileBadges(
      { pool: this.pool, getReadRelays: () => this.getReadRelays() },
      pubkey,
    );
  }

  // ----------------------------------------
  // NIP-57 ZAPS (Layer 2 engagement)
  // ----------------------------------------

  /**
   * Fetch zap receipts (kind 9735) for a specific event
   */
  async fetchZapReceipts(eventId: string): Promise<NostrEvent[]> {
    return queryZapReceipts(
      { pool: this.pool, getReadRelays: () => this.getReadRelays() },
      eventId,
    );
  }

  /**
   * Fetch zap receipts for multiple events (batch)
   */
  async fetchZapReceiptsForEvents(eventIds: string[]): Promise<NostrEvent[]> {
    return queryZapReceiptsForEvents(
      { pool: this.pool, getReadRelays: () => this.getReadRelays() },
      eventIds,
    );
  }

  /**
   * Fetch zap receipts received by a specific pubkey
   */
  async fetchZapsForPubkey(pubkey: string, opts: { limit?: number } = {}): Promise<NostrEvent[]> {
    return queryZapsForPubkey(
      { pool: this.pool, getReadRelays: () => this.getReadRelays() },
      pubkey,
      opts,
    );
  }

  /**
   * Subscribe to zap receipts for specific events (real-time updates)
   */
  subscribeToZapReceipts(eventIds: string[], onEvent: (event: NostrEvent) => void): string {
    return subscribeZapReceipts(
      {
        pool: this.pool,
        getReadRelays: () => this.getReadRelays(),
        subscriptions: this.subscriptions,
        nextSubId: (prefix: string) => this.nextSubId(prefix),
      },
      eventIds,
      onEvent,
    );
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
    relays: Array<{ url: string; read?: boolean; write?: boolean }>,
  ): UnsignedNostrEvent {
    return makeRelayListEvent(pubkey, relays);
  }

  /**
   * Fetch a user's latest relay list (kind 10002). Returns the raw event (if any).
   */
  async fetchRelayListEvent(pubkey: string): Promise<NostrEvent | null> {
    return queryRelayListEvent(
      { pool: this.pool, getReadRelays: () => this.getReadRelays() },
      pubkey,
    );
  }

  /**
   * Fetch a user's latest contact list (kind 3). Returns the raw event (if any).
   */
  async fetchContactListEvent(pubkey: string): Promise<NostrEvent | null> {
    return queryContactListEvent(
      { pool: this.pool, getReadRelays: () => this.getReadRelays() },
      pubkey,
    );
  }

  /**
   * Parse a contact list event into an array of followed pubkeys
   */
  parseContactList(event: NostrEvent): string[] {
    return parseContactListEvent(event);
  }
}

// Export singleton instance
export const nostrService = new NostrService();

// Export class for testing
export { NostrService };

// Export types
export type { RelayStatus };
