// ============================================
// ZAP SERVICE (NIP-57)
// ============================================
// Handles Lightning Zaps as Layer 2 engagement alongside bits economy.
// Users bring their own Lightning wallet - BitBoard doesn't handle funds.
//
// Key principles:
// - Optional feature: only shown if creator has Lightning Address
// - External wallets: Alby, Phoenix, etc. via LNURL
// - No built-in wallet: no regulatory burden
// - Zaps complement bits, don't replace them

import { type Event as NostrEvent } from 'nostr-tools';
import {
  NOSTR_KINDS,
  type ZapReceipt,
  type ZapTally,
  type LNURLPayResponse,
  type UnsignedNostrEvent,
} from '../types';
import { nostrService } from './nostr/NostrService';
import { logger } from './loggingService';

// ============================================
// CONSTANTS
// ============================================

const ZAP_CACHE_TTL_MS = 60 * 1000; // 1 minute cache
const MAX_ZAP_COMMENT_LENGTH = 280;
const DEFAULT_ZAP_AMOUNTS = [21, 100, 500, 1000, 5000, 10000]; // Suggested amounts in sats

// ============================================
// ZAP SERVICE CLASS
// ============================================

class ZapService {
  // Cache for zap tallies
  private zapTallies: Map<string, ZapTally> = new Map();
  
  // Cache for LNURL-pay responses
  private lnurlCache: Map<string, { data: LNURLPayResponse; timestamp: number }> = new Map();
  
  // Track in-flight requests
  private inFlightRequests: Map<string, Promise<ZapTally>> = new Map();

  // ----------------------------------------
  // LIGHTNING ADDRESS UTILITIES
  // ----------------------------------------

  /**
   * Parse a Lightning Address (user@domain.com) into LNURL endpoint
   * Returns null if invalid
   * 
   * Supports lud16 format (Lightning Address): user@domain.com
   * lud06 format (LNURL bech32) is less common and not currently supported
   */
  parseLightningAddress(address: string): string | null {
    if (!address || typeof address !== 'string') return null;
    
    const trimmed = address.trim();
    
    // Handle lud16 format: user@domain.com (most common)
    const lud16Match = trimmed.match(/^([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
    if (lud16Match) {
      const [, username, domain] = lud16Match;
      return `https://${domain}/.well-known/lnurlp/${username}`;
    }

    // Handle direct HTTPS URLs (some services provide these)
    if (trimmed.startsWith('https://') && trimmed.includes('lnurlp')) {
      return trimmed;
    }

    return null;
  }

  /**
   * Check if a pubkey can receive zaps by looking at their profile metadata
   */
  async canReceiveZaps(pubkey: string): Promise<{ canZap: boolean; lnurl?: string; error?: string }> {
    try {
      const profiles = await nostrService.fetchProfiles([pubkey]);
      const profile = profiles.get(pubkey);
      
      if (!profile) {
        return { canZap: false, error: 'Profile not found' };
      }

      // Check for Lightning Address (lud16) or LNURL (lud06)
      const lightningAddress = profile.lud16 || profile.lud06;
      if (!lightningAddress) {
        return { canZap: false, error: 'No Lightning Address configured' };
      }

      const lnurl = this.parseLightningAddress(lightningAddress);
      if (!lnurl) {
        return { canZap: false, error: 'Invalid Lightning Address format' };
      }

      // Fetch LNURL-pay info to check if it supports Nostr
      const lnurlPay = await this.fetchLNURLPayInfo(lnurl);
      if (!lnurlPay) {
        return { canZap: false, error: 'Could not fetch LNURL info' };
      }

      if (!lnurlPay.allowsNostr) {
        return { canZap: false, error: 'Lightning provider does not support Nostr zaps' };
      }

      return { canZap: true, lnurl };
    } catch (error) {
      logger.error('Zap', 'Error checking zap capability', error);
      return { canZap: false, error: 'Failed to check zap capability' };
    }
  }

  // ----------------------------------------
  // LNURL-PAY OPERATIONS
  // ----------------------------------------

  /**
   * Fetch LNURL-pay info from endpoint
   */
  async fetchLNURLPayInfo(lnurl: string): Promise<LNURLPayResponse | null> {
    // Check cache first
    const cached = this.lnurlCache.get(lnurl);
    if (cached && Date.now() - cached.timestamp < ZAP_CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const response = await fetch(lnurl, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        logger.warn('Zap', `LNURL fetch failed: ${response.status}`);
        return null;
      }

      const data = await response.json() as LNURLPayResponse;
      
      // Validate response
      if (data.tag !== 'payRequest') {
        logger.warn('Zap', 'Invalid LNURL response: not a payRequest');
        return null;
      }

      // Cache the response
      this.lnurlCache.set(lnurl, { data, timestamp: Date.now() });
      
      return data;
    } catch (error) {
      logger.error('Zap', 'Failed to fetch LNURL info', error);
      return null;
    }
  }

  /**
   * Get a Lightning invoice for a zap
   */
  async getZapInvoice(args: {
    lnurl: string;
    amount: number;           // Amount in satoshis
    zapRequest: NostrEvent;   // Signed zap request event
  }): Promise<{ invoice: string; } | { error: string }> {
    try {
      const lnurlPay = await this.fetchLNURLPayInfo(args.lnurl);
      if (!lnurlPay) {
        return { error: 'Could not fetch LNURL info' };
      }

      // Convert sats to millisats
      const amountMsats = args.amount * 1000;

      // Validate amount
      if (amountMsats < lnurlPay.minSendable) {
        return { error: `Minimum amount is ${Math.ceil(lnurlPay.minSendable / 1000)} sats` };
      }
      if (amountMsats > lnurlPay.maxSendable) {
        return { error: `Maximum amount is ${Math.floor(lnurlPay.maxSendable / 1000)} sats` };
      }

      // Build callback URL with parameters
      const callbackUrl = new URL(lnurlPay.callback);
      callbackUrl.searchParams.set('amount', amountMsats.toString());
      callbackUrl.searchParams.set('nostr', JSON.stringify(args.zapRequest));

      // Fetch invoice
      const response = await fetch(callbackUrl.toString(), {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        return { error: `Invoice request failed: ${response.status}` };
      }

      const data = await response.json();

      if (data.status === 'ERROR') {
        return { error: data.reason || 'Invoice generation failed' };
      }

      if (!data.pr) {
        return { error: 'No invoice returned' };
      }

      return { invoice: data.pr };
    } catch (error) {
      logger.error('Zap', 'Failed to get invoice', error);
      return { error: 'Failed to generate invoice' };
    }
  }

  // ----------------------------------------
  // ZAP REQUEST BUILDING (NIP-57)
  // ----------------------------------------

  /**
   * Build an unsigned zap request event (kind 9734)
   * The event must be signed before sending to LNURL callback
   */
  buildZapRequest(args: {
    recipientPubkey: string;
    eventId?: string;         // Post/comment being zapped (optional for profile zaps)
    amount: number;           // Amount in satoshis
    relays: string[];         // Relays to publish receipt to
    content?: string;         // Optional zap comment
    senderPubkey: string;
  }): UnsignedNostrEvent {
    const tags: string[][] = [
      ['p', args.recipientPubkey],
      ['amount', (args.amount * 1000).toString()], // Convert to millisats
      ['relays', ...args.relays],
    ];

    // Add event reference if zapping a specific post/comment
    if (args.eventId) {
      tags.push(['e', args.eventId]);
    }

    // Validate and truncate comment
    let content = args.content || '';
    if (content.length > MAX_ZAP_COMMENT_LENGTH) {
      content = content.slice(0, MAX_ZAP_COMMENT_LENGTH);
    }

    return {
      kind: NOSTR_KINDS.ZAP_REQUEST,
      pubkey: args.senderPubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content,
    };
  }

  // ----------------------------------------
  // ZAP RECEIPT PARSING (NIP-57)
  // ----------------------------------------

  /**
   * Parse a zap receipt event (kind 9735) into a ZapReceipt object
   */
  parseZapReceipt(event: NostrEvent): ZapReceipt | null {
    if (event.kind !== NOSTR_KINDS.ZAP_RECEIPT) {
      return null;
    }

    try {
      const pTag = event.tags.find(t => t[0] === 'p');
      const eTag = event.tags.find(t => t[0] === 'e');
      const bolt11Tag = event.tags.find(t => t[0] === 'bolt11');
      const descriptionTag = event.tags.find(t => t[0] === 'description');
      const preimageTag = event.tags.find(t => t[0] === 'preimage');

      if (!pTag || !descriptionTag) {
        logger.warn('Zap', 'Invalid zap receipt: missing required tags');
        return null;
      }

      // Parse the embedded zap request from description tag
      let zapRequest: NostrEvent | null = null;
      let zapperPubkey = '';
      let amount = 0;
      let content = '';

      try {
        zapRequest = JSON.parse(descriptionTag[1]) as NostrEvent;
        zapperPubkey = zapRequest.pubkey;
        content = zapRequest.content || '';

        // Extract amount from zap request
        const amountTag = zapRequest.tags.find(t => t[0] === 'amount');
        if (amountTag) {
          amount = Math.floor(parseInt(amountTag[1], 10) / 1000); // Convert from millisats
        }
      } catch {
        logger.warn('Zap', 'Could not parse zap request from receipt');
        return null;
      }

      return {
        id: event.id,
        zapperPubkey,
        recipientPubkey: pTag[1],
        eventId: eTag?.[1],
        amount,
        content,
        timestamp: event.created_at * 1000,
        bolt11: bolt11Tag?.[1],
        preimage: preimageTag?.[1],
      };
    } catch (error) {
      logger.error('Zap', 'Failed to parse zap receipt', error);
      return null;
    }
  }

  // ----------------------------------------
  // ZAP FETCHING & TALLYING
  // ----------------------------------------

  /**
   * Fetch zap receipts for a specific event (post or comment)
   */
  async fetchZapsForEvent(eventId: string): Promise<ZapReceipt[]> {
    try {
      const events = await nostrService.fetchZapReceipts(eventId);
      
      const receipts: ZapReceipt[] = [];
      for (const event of events) {
        const receipt = this.parseZapReceipt(event);
        if (receipt) {
          receipts.push(receipt);
        }
      }

      return receipts.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      logger.error('Zap', 'Failed to fetch zaps', error);
      return [];
    }
  }

  /**
   * Get zap tally for an event (with caching)
   */
  async getZapTally(eventId: string): Promise<ZapTally> {
    // Check cache
    const cached = this.zapTallies.get(eventId);
    if (cached && Date.now() - cached.lastUpdated < ZAP_CACHE_TTL_MS) {
      return cached;
    }

    // Check in-flight request
    const inFlight = this.inFlightRequests.get(eventId);
    if (inFlight) {
      return inFlight;
    }

    // Create new request
    const request = this._fetchZapTally(eventId);
    this.inFlightRequests.set(eventId, request);

    try {
      const tally = await request;
      return tally;
    } finally {
      this.inFlightRequests.delete(eventId);
    }
  }

  private async _fetchZapTally(eventId: string): Promise<ZapTally> {
    const receipts = await this.fetchZapsForEvent(eventId);

    // Aggregate by zapper (in case of multiple zaps from same person)
    const zapperTotals = new Map<string, { amount: number; comment?: string }>();
    let totalSats = 0;

    for (const receipt of receipts) {
      totalSats += receipt.amount;
      
      const existing = zapperTotals.get(receipt.zapperPubkey);
      if (existing) {
        existing.amount += receipt.amount;
        // Keep the latest comment
        if (receipt.content) {
          existing.comment = receipt.content;
        }
      } else {
        zapperTotals.set(receipt.zapperPubkey, {
          amount: receipt.amount,
          comment: receipt.content || undefined,
        });
      }
    }

    // Get top zappers (sorted by amount)
    const topZappers = Array.from(zapperTotals.entries())
      .map(([pubkey, data]) => ({ pubkey, ...data }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10); // Top 10

    const tally: ZapTally = {
      eventId,
      totalSats,
      zapCount: receipts.length,
      topZappers,
      lastUpdated: Date.now(),
    };

    // Cache the result
    this.zapTallies.set(eventId, tally);

    return tally;
  }

  /**
   * Batch fetch zap tallies for multiple events
   */
  async getZapTalliesForEvents(eventIds: string[]): Promise<Map<string, ZapTally>> {
    const results = new Map<string, ZapTally>();
    const uncached: string[] = [];

    // Check cache first
    for (const eventId of eventIds) {
      const cached = this.zapTallies.get(eventId);
      if (cached && Date.now() - cached.lastUpdated < ZAP_CACHE_TTL_MS) {
        results.set(eventId, cached);
      } else {
        uncached.push(eventId);
      }
    }

    if (uncached.length === 0) {
      return results;
    }

    // Fetch uncached in parallel (with limit)
    const BATCH_SIZE = 10;
    for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
      const batch = uncached.slice(i, i + BATCH_SIZE);
      const tallies = await Promise.all(batch.map(id => this.getZapTally(id)));
      
      for (let j = 0; j < batch.length; j++) {
        results.set(batch[j], tallies[j]);
      }
    }

    return results;
  }

  // ----------------------------------------
  // SUBSCRIPTION (Real-time zap updates)
  // ----------------------------------------

  /**
   * Subscribe to zap receipts for specific events
   * Returns an unsubscribe function
   */
  subscribeToZaps(
    eventIds: string[],
    onZap: (receipt: ZapReceipt) => void
  ): () => void {
    if (eventIds.length === 0) {
      return () => {};
    }

    const subscriptionId = nostrService.subscribeToZapReceipts(
      eventIds,
      (event: NostrEvent) => {
        const receipt = this.parseZapReceipt(event);
        if (receipt) {
          // Update cache
          this.invalidateEventCache(receipt.eventId || '');
          onZap(receipt);
        }
      }
    );

    logger.debug('Zap', `Subscribed to zaps for ${eventIds.length} events`);
    
    return () => {
      nostrService.unsubscribe(subscriptionId);
      logger.debug('Zap', 'Unsubscribed from zaps');
    };
  }

  // ----------------------------------------
  // UTILITIES
  // ----------------------------------------

  /**
   * Get suggested zap amounts
   */
  getSuggestedAmounts(): number[] {
    return [...DEFAULT_ZAP_AMOUNTS];
  }

  /**
   * Format satoshi amount for display
   */
  formatSats(sats: number): string {
    if (sats >= 1000000) {
      return `${(sats / 1000000).toFixed(1)}M`;
    }
    if (sats >= 1000) {
      return `${(sats / 1000).toFixed(1)}K`;
    }
    return sats.toString();
  }

  /**
   * Clear caches
   */
  clearCache(): void {
    this.zapTallies.clear();
    this.lnurlCache.clear();
    this.inFlightRequests.clear();
  }

  /**
   * Invalidate cache for a specific event (call after zapping)
   */
  invalidateEventCache(eventId: string): void {
    this.zapTallies.delete(eventId);
  }

}

// Export singleton
export const zapService = new ZapService();
export { ZapService };
