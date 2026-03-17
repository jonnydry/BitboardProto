import { nostrService } from './nostrService';
import { identityService } from './identityService';
import { toastService } from './toastService';
import { UIConfig } from '../config';
import { logger } from './loggingService';

/**
 * Service for managing follow relationships (NIP-02 contact lists)
 */
class FollowService {
  private follows: Set<string> = new Set();
  private isLoaded = false;
  private listeners: Array<(follows: string[]) => void> = [];

  constructor() {
    this.loadFollows();
  }

  /**
   * Load follows from local storage and Nostr
   */
  private async loadFollows() {
    // First load from local storage for immediate UI updates
    this.loadFromStorage();

    // Then fetch from Nostr if we have an identity
    const identity = identityService.getPublicIdentity();
    if (identity) {
      try {
        const contactList = await nostrService.fetchContactListEvent(identity.pubkey);
        if (contactList) {
          const follows = nostrService.parseContactList(contactList);
          this.follows = new Set(follows);
          this.saveToStorage();
          this.notifyListeners();
        }
      } catch (error) {
        logger.error('FollowService', 'Failed to load contact list from Nostr', error);
      }
    }

    this.isLoaded = true;
  }

  /**
   * Get current follows as array
   */
  getFollows(): string[] {
    return Array.from(this.follows);
  }

  /**
   * Check if user follows a specific pubkey
   */
  isFollowing(pubkey: string): boolean {
    return this.follows.has(pubkey);
  }

  /**
   * Follow a user
   */
  async follow(pubkey: string): Promise<void> {
    if (this.follows.has(pubkey)) return;

    const identity = identityService.getPublicIdentity();
    if (!identity) {
      throw new Error('No identity available');
    }

    try {
      // Add to local state immediately for UI responsiveness
      this.follows.add(pubkey);
      this.saveToStorage();
      this.notifyListeners();

      // Publish to Nostr
      const follows = this.getFollows();
      const event = nostrService.buildContactListEvent({
        pubkey: identity.pubkey,
        follows,
      });

      const signed = await identityService.signEvent(event);
      await nostrService.publishSignedEvent(signed);

      toastService.push({
        type: 'success',
        message: 'Followed user',
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'followed-user',
      });
    } catch (error) {
      // Revert on failure
      this.follows.delete(pubkey);
      this.saveToStorage();
      this.notifyListeners();

      logger.error('FollowService', 'Failed to follow user', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to follow user';
      toastService.push({
        type: 'error',
        message: 'Failed to follow user',
        detail: errorMessage,
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'follow-failed',
      });
      throw error;
    }
  }

  /**
   * Unfollow a user
   */
  async unfollow(pubkey: string): Promise<void> {
    if (!this.follows.has(pubkey)) return;

    const identity = identityService.getPublicIdentity();
    if (!identity) {
      throw new Error('No identity available');
    }

    try {
      // Remove from local state immediately for UI responsiveness
      this.follows.delete(pubkey);
      this.saveToStorage();
      this.notifyListeners();

      // Publish to Nostr
      const follows = this.getFollows();
      const event = nostrService.buildContactListEvent({
        pubkey: identity.pubkey,
        follows,
      });

      const signed = await identityService.signEvent(event);
      await nostrService.publishSignedEvent(signed);

      toastService.push({
        type: 'info',
        message: 'Unfollowed user',
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'unfollowed-user',
      });
    } catch (error) {
      // Revert on failure
      this.follows.add(pubkey);
      this.saveToStorage();
      this.notifyListeners();

      logger.error('FollowService', 'Failed to unfollow user', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to unfollow user';
      toastService.push({
        type: 'error',
        message: 'Failed to unfollow user',
        detail: errorMessage,
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'unfollow-failed',
      });
      throw error;
    }
  }

  /**
   * Subscribe to follow changes
   */
  subscribe(listener: (follows: string[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners() {
    const follows = this.getFollows();
    this.listeners.forEach((listener) => {
      try {
        listener(follows);
      } catch (error) {
        logger.error('FollowService', 'Listener error', error);
      }
    });
  }

  private loadFromStorage() {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem('bitboard_follows_v1_legacy');
      if (!raw) return;
      const follows = JSON.parse(raw);
      if (Array.isArray(follows)) {
        this.follows = new Set(follows);
      }
    } catch (error) {
      logger.error('FollowService', 'Failed to load follows from storage', error);
    }
  }

  private saveToStorage() {
    try {
      if (typeof localStorage === 'undefined') return;
      const follows = this.getFollows();
      localStorage.setItem('bitboard_follows_v1_legacy', JSON.stringify(follows));
    } catch (error) {
      logger.error('FollowService', 'Failed to save follows to storage', error);
    }
  }

  // Stub: not yet implemented. Always returns 0.
  async getFollowerCount(_pubkey: string): Promise<number> {
    return 0;
  }
}

export const followService = new FollowService();
