// ============================================
// REACTION SERVICE - NIP-25 Implementation
// ============================================
// Handles emoji reactions to posts and comments
// Reactions are FREE (no bit cost) - social signals only

import { type Event as NostrEvent, type Filter, finalizeEvent, type UnsignedEvent, SimplePool } from 'nostr-tools';
import { logger } from './loggingService';

// Get nostr service dynamically to avoid circular deps
const getNostrService = () => import('./nostrService').then(m => m.nostrService);

// ============================================
// TYPES
// ============================================

export type ReactionEmoji = '👍' | '🔥' | '💡' | '🎯' | '😂' | '❤️';

export interface Reaction {
  id: string;
  eventId: string;          // The post/comment being reacted to
  emoji: ReactionEmoji;
  pubkey: string;
  timestamp: number;
  nostrEventId?: string;
}

export interface ReactionCounts {
  '👍': number;
  '🔥': number;
  '💡': number;
  '🎯': number;
  '😂': number;
  '❤️': number;
  total: number;
}

export interface ReactionState {
  counts: ReactionCounts;
  userReaction: ReactionEmoji | null;  // Current user's reaction (only one allowed)
  reactions: Reaction[];
}

// ============================================
// CONSTANTS
// ============================================

export const AVAILABLE_REACTIONS: ReactionEmoji[] = ['👍', '🔥', '💡', '🎯', '😂', '❤️'];

export const REACTION_LABELS: Record<ReactionEmoji, string> = {
  '👍': 'Like',
  '🔥': 'Fire',
  '💡': 'Insightful',
  '🎯': 'On Point',
  '😂': 'Funny',
  '❤️': 'Love',
};

const NIP25_KIND = 7; // Reaction kind in NIP-25

// ============================================
// REACTION SERVICE
// ============================================

class ReactionService {
  private reactionCache = new Map<string, ReactionState>();
  private currentUserPubkey: string | null = null;
  private listeners = new Set<() => void>();
  private subscriptionId: string | null = null;

  // ----------------------------------------
  // INITIALIZATION
  // ----------------------------------------

  initialize(userPubkey: string): void {
    this.currentUserPubkey = userPubkey;
    logger.info('Reactions', `Initialized for ${userPubkey.slice(0, 8)}...`);
  }

  cleanup(): void {
    this.currentUserPubkey = null;
    this.reactionCache.clear();
    if (this.subscriptionId) {
      // Would unsubscribe here
      this.subscriptionId = null;
    }
    logger.info('Reactions', 'Service cleaned up');
  }

  // ----------------------------------------
  // GET REACTIONS
  // ----------------------------------------

  /**
   * Get reaction state for an event (post or comment)
   */
  getReactionState(eventId: string): ReactionState {
    const cached = this.reactionCache.get(eventId);
    if (cached) return cached;

    // Return empty state
    return this.createEmptyState();
  }

  /**
   * Fetch reactions from relays for multiple events
   */
  async fetchReactions(eventIds: string[]): Promise<Map<string, ReactionState>> {
    if (eventIds.length === 0) return new Map();

    try {
      const filter: Filter = {
        kinds: [NIP25_KIND],
        '#e': eventIds,
        limit: 1000,
      };

      // Get nostr service
      const nostrSvc = await getNostrService();
      const relayList = nostrSvc.getRelays();
      const relays = relayList.map((r: { url: string }) => r.url);
      if (relays.length === 0) return new Map();
      
      const events: NostrEvent[] = [];
      
      // Create a temporary pool for querying
      const pool = new SimplePool();
      
      // Query relays for reactions using type assertion to handle nostr-tools API
      try {
         
        const sub = (pool as any).subscribeMany(relays, [filter], {
          onevent: (event: NostrEvent) => events.push(event),
        });
        
        // Wait for initial results
        await new Promise(resolve => setTimeout(resolve, 2000));
        sub.close();
      } catch {
        // Ignore query errors
      }
      
      // Process events into reaction states
      const stateMap = new Map<string, ReactionState>();
      
      // Initialize empty states for all requested IDs
      for (const id of eventIds) {
        stateMap.set(id, this.createEmptyState());
      }

      // Process reaction events
      for (const event of events) {
        const targetId = this.getTargetEventId(event);
        if (!targetId || !eventIds.includes(targetId)) continue;

        const emoji = this.parseReactionContent(event.content);
        if (!emoji) continue;

        const state = stateMap.get(targetId)!;
        
        // Check for duplicate reactions from same user
        const existingFromUser = state.reactions.find(r => r.pubkey === event.pubkey);
        if (existingFromUser) {
          // Keep only the latest reaction from each user
          if (event.created_at * 1000 > existingFromUser.timestamp) {
            // Remove old reaction counts
            state.counts[existingFromUser.emoji]--;
            state.counts.total--;
            
            // Remove from reactions array
            state.reactions = state.reactions.filter(r => r.pubkey !== event.pubkey);
          } else {
            continue; // Skip older reaction
          }
        }

        // Add new reaction
        const reaction: Reaction = {
          id: event.id,
          eventId: targetId,
          emoji,
          pubkey: event.pubkey,
          timestamp: event.created_at * 1000,
          nostrEventId: event.id,
        };

        state.reactions.push(reaction);
        state.counts[emoji]++;
        state.counts.total++;

        // Track current user's reaction
        if (event.pubkey === this.currentUserPubkey) {
          state.userReaction = emoji;
        }
      }

      // Update cache
      for (const [id, state] of stateMap) {
        this.reactionCache.set(id, state);
      }

      return stateMap;
    } catch (error) {
      logger.error('Reactions', 'Failed to fetch reactions', error);
      return new Map();
    }
  }

  // ----------------------------------------
  // ADD/REMOVE REACTIONS
  // ----------------------------------------

  /**
   * Add or toggle a reaction
   * If user already has this reaction, it removes it
   * If user has a different reaction, it switches to the new one
   */
  async react(eventId: string, emoji: ReactionEmoji): Promise<boolean> {
    if (!this.currentUserPubkey) {
      logger.warn('Reactions', 'Cannot react without identity');
      return false;
    }

    const state = this.getReactionState(eventId);
    const hadSameReaction = state.userReaction === emoji;
    const hadDifferentReaction = state.userReaction && state.userReaction !== emoji;

    // If same reaction, remove it (toggle off)
    if (hadSameReaction) {
      return this.removeReaction(eventId);
    }

    // If different reaction, we'll publish new one (NIP-25 allows multiple reactions)
    // But we track only the latest locally

    try {
      // Build NIP-25 reaction event
      const unsignedEvent: UnsignedEvent = {
        kind: NIP25_KIND,
        pubkey: this.currentUserPubkey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['e', eventId], // Event being reacted to
          // ['p', originalAuthorPubkey], // Would add if we had it
        ],
        content: emoji,
      };

      // Get identity to sign
      const identity = await this.getIdentity();
      if (!identity || !identity.privkey) {
        logger.warn('Reactions', 'Cannot sign reaction without privkey');
        return false;
      }

      // Sign and publish
      const signedEvent = finalizeEvent(unsignedEvent, identity.privkey as unknown as Uint8Array);
      const nostrSvc = await getNostrService();
      const relayList = nostrSvc.getRelays();
      const relays = relayList.map((r: { url: string }) => r.url);
      const pool = new SimplePool();
      await Promise.all(pool.publish(relays, signedEvent));

      // Update local state
      const newState = this.getReactionState(eventId);
      
      // Remove old reaction if exists
      if (hadDifferentReaction && newState.userReaction) {
        newState.counts[newState.userReaction]--;
        newState.counts.total--;
        newState.reactions = newState.reactions.filter(r => r.pubkey !== this.currentUserPubkey);
      }

      // Add new reaction
      newState.counts[emoji]++;
      newState.counts.total++;
      newState.userReaction = emoji;
      newState.reactions.push({
        id: signedEvent.id,
        eventId,
        emoji,
        pubkey: this.currentUserPubkey,
        timestamp: Date.now(),
        nostrEventId: signedEvent.id,
      });

      this.reactionCache.set(eventId, newState);
      this.notifyListeners();

      logger.info('Reactions', `Added ${emoji} reaction to ${eventId.slice(0, 8)}...`);
      return true;
    } catch (error) {
      logger.error('Reactions', 'Failed to add reaction', error);
      return false;
    }
  }

  /**
   * Remove the current user's reaction
   */
  async removeReaction(eventId: string): Promise<boolean> {
    if (!this.currentUserPubkey) return false;

    const state = this.getReactionState(eventId);
    if (!state.userReaction) return true; // No reaction to remove

    // In NIP-25, you can't really "delete" a reaction
    // We just update local state and optionally publish a NIP-09 deletion
    
    // Update local state
    const emoji = state.userReaction;
    state.counts[emoji]--;
    state.counts.total--;
    state.userReaction = null;
    state.reactions = state.reactions.filter(r => r.pubkey !== this.currentUserPubkey);

    this.reactionCache.set(eventId, state);
    this.notifyListeners();

    logger.info('Reactions', `Removed reaction from ${eventId.slice(0, 8)}...`);
    return true;
  }

  // ----------------------------------------
  // HELPERS
  // ----------------------------------------

  private createEmptyState(): ReactionState {
    return {
      counts: {
        '👍': 0,
        '🔥': 0,
        '💡': 0,
        '🎯': 0,
        '😂': 0,
        '❤️': 0,
        total: 0,
      },
      userReaction: null,
      reactions: [],
    };
  }

  private getTargetEventId(event: NostrEvent): string | null {
    const eTag = event.tags.find(t => t[0] === 'e');
    return eTag?.[1] || null;
  }

  private parseReactionContent(content: string): ReactionEmoji | null {
    // NIP-25 allows '+', '-', or emoji
    // We only care about our supported emojis
    const trimmed = content.trim();
    
    // Map '+' to thumbs up
    if (trimmed === '+') return '👍';
    
    // Check if it's one of our supported emojis
    if (AVAILABLE_REACTIONS.includes(trimmed as ReactionEmoji)) {
      return trimmed as ReactionEmoji;
    }

    return null;
  }

  private async getIdentity(): Promise<{ pubkey: string; privkey?: string } | null> {
    // Get identity from identity service
    const { identityService } = await import('./identityService');
    return identityService.getIdentity();
  }

  // ----------------------------------------
  // SUBSCRIPTIONS
  // ----------------------------------------

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(fn => fn());
  }

  // ----------------------------------------
  // BATCH OPERATIONS
  // ----------------------------------------

  /**
   * Get reaction counts for multiple events efficiently
   */
  getReactionCounts(eventIds: string[]): Map<string, ReactionCounts> {
    const result = new Map<string, ReactionCounts>();
    for (const id of eventIds) {
      result.set(id, this.getReactionState(id).counts);
    }
    return result;
  }

  /**
   * Check if current user has reacted to an event
   */
  hasUserReacted(eventId: string): boolean {
    return this.getReactionState(eventId).userReaction !== null;
  }

  /**
   * Get user's reaction for an event
   */
  getUserReaction(eventId: string): ReactionEmoji | null {
    return this.getReactionState(eventId).userReaction;
  }
}

// Export singleton
export const reactionService = new ReactionService();
export { ReactionService };
