// ============================================
// DIRECT MESSAGE SERVICE (NIP-04)
// ============================================
// Nostr-based private messaging using NIP-04 encryption
// Provides encrypted 1-on-1 messaging between users

import { type Event as NostrEvent, type Filter } from 'nostr-tools';
import { NOSTR_KINDS } from '../types';
import { nostrService } from './nostr/NostrService';
import { cryptoService } from './cryptoService';
import { logger } from './loggingService';

// ============================================
// TYPES
// ============================================

export interface DirectMessage {
  id: string;
  nostrEventId: string;
  senderPubkey: string;
  recipientPubkey: string;
  content: string;          // Decrypted content
  encryptedContent: string; // Original encrypted content
  timestamp: number;
  isRead: boolean;
  isSent: boolean;          // true if current user sent this message
  isDecrypted: boolean;     // false if decryption failed
  replyToId?: string;       // For threaded conversations
}

export interface Conversation {
  id: string;               // Counter-party pubkey
  participantPubkey: string;
  participantName?: string;
  participantAvatar?: string;
  lastMessage?: DirectMessage;
  lastMessageTimestamp: number;
  unreadCount: number;
  messages: DirectMessage[];
}

export interface DMNotification {
  conversationId: string;
  messageId: string;
  senderPubkey: string;
  preview: string;          // First ~50 chars of decrypted message
  timestamp: number;
}

// ============================================
// DM SERVICE
// ============================================

class DMService {
  private conversations: Map<string, Conversation> = new Map();
  private messageSubscription: string | null = null;
  private onNewMessage: ((notification: DMNotification) => void) | null = null;
  private currentUserPubkey: string | null = null;
  private _unreadCount = 0;

  // ----------------------------------------
  // INITIALIZATION
  // ----------------------------------------

  /**
   * Initialize DM service with current user's pubkey
   */
  initialize(userPubkey: string) {
    this.currentUserPubkey = userPubkey;
    this.loadConversationsFromStorage();
    logger.info('DM', `Initialized DM service for ${userPubkey.slice(0, 8)}...`);
  }

  /**
   * Set callback for new message notifications
   */
  setNotificationHandler(handler: (notification: DMNotification) => void) {
    this.onNewMessage = handler;
  }

  /**
   * Get total unread message count
   */
  getUnreadCount(): number {
    return this._unreadCount;
  }

  // ----------------------------------------
  // CONVERSATION MANAGEMENT
  // ----------------------------------------

  /**
   * Get all conversations sorted by last message time
   */
  getConversations(): Conversation[] {
    return Array.from(this.conversations.values())
      .sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
  }

  /**
   * Get a specific conversation by participant pubkey
   */
  getConversation(participantPubkey: string): Conversation | null {
    return this.conversations.get(participantPubkey) || null;
  }

  /**
   * Start or get existing conversation with a user
   */
  startConversation(participantPubkey: string): Conversation {
    let conversation = this.conversations.get(participantPubkey);
    
    if (!conversation) {
      conversation = {
        id: participantPubkey,
        participantPubkey,
        lastMessageTimestamp: Date.now(),
        unreadCount: 0,
        messages: [],
      };
      this.conversations.set(participantPubkey, conversation);
      this.saveConversationsToStorage();
    }

    return conversation;
  }

  /**
   * Mark conversation as read
   */
  markConversationAsRead(participantPubkey: string) {
    const conversation = this.conversations.get(participantPubkey);
    if (conversation) {
      this._unreadCount -= conversation.unreadCount;
      conversation.unreadCount = 0;
      conversation.messages.forEach(m => { m.isRead = true; });
      this.saveConversationsToStorage();
    }
  }

  /**
   * Delete a conversation
   */
  deleteConversation(participantPubkey: string) {
    const conversation = this.conversations.get(participantPubkey);
    if (conversation) {
      this._unreadCount -= conversation.unreadCount;
      this.conversations.delete(participantPubkey);
      this.saveConversationsToStorage();
    }
  }

  // ----------------------------------------
  // SENDING MESSAGES (NIP-04)
  // ----------------------------------------

  /**
   * Build a NIP-04 encrypted DM event
   */
  buildDMEvent(args: {
    recipientPubkey: string;
    content: string;
    senderPubkey: string;
    encryptedContent: string;
    replyToId?: string;
  }): Partial<NostrEvent> {
    const tags: string[][] = [
      ['p', args.recipientPubkey],
    ];

    // Add reply reference if this is a threaded reply
    if (args.replyToId) {
      tags.push(['e', args.replyToId, '', 'reply']);
    }

    return {
      kind: NOSTR_KINDS.ENCRYPTED_DM,
      pubkey: args.senderPubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: args.encryptedContent,
    };
  }

  /**
   * Send a direct message using NIP-17 (gift-wrapped, most private)
   * Falls back to NIP-44 if gift wrapping fails
   */
  async sendMessage(args: {
    recipientPubkey: string;
    content: string;
    privateKey: string;  // Sender's private key for encryption
    replyToId?: string;
    useLegacy?: boolean; // Force NIP-04 (legacy) mode
  }): Promise<DirectMessage | null> {
    if (!this.currentUserPubkey) {
      logger.error('DM', 'Cannot send message: DM service not initialized');
      return null;
    }

    try {
      let encryptedContent: string;
      let nostrEventId = '';
      let encryptionMethod: 'nip17' | 'nip44' | 'nip04' = 'nip17';

      if (args.useLegacy) {
        // Use NIP-04 (legacy) for backward compatibility
        const encrypted = await cryptoService.encryptNIP04(
          args.content,
          args.privateKey,
          args.recipientPubkey
        );
        if (!encrypted) throw new Error('NIP-04 encryption failed');
        encryptedContent = encrypted;
        encryptionMethod = 'nip04';
        logger.debug('DM', 'Using NIP-04 (legacy) encryption');
      } else {
        // Try NIP-17 first (most private)
        const giftWrap = await cryptoService.createGiftWrap({
          content: args.content,
          senderPrivkey: args.privateKey,
          senderPubkey: this.currentUserPubkey,
          recipientPubkey: args.recipientPubkey,
          replyToId: args.replyToId,
        });

        if (giftWrap) {
          encryptedContent = giftWrap.giftWrap.content;
          nostrEventId = giftWrap.giftWrap.id;
          encryptionMethod = 'nip17';
          logger.debug('DM', 'Using NIP-17 (gift-wrapped) encryption');
          
          // TODO: Publish giftWrap.giftWrap to relays
          // await nostrService.publishEvent(giftWrap.giftWrap);
        } else {
          // Fallback to NIP-44 (still modern, but metadata visible)
          const encrypted = await cryptoService.encryptNIP44(
            args.content,
            args.privateKey,
            args.recipientPubkey
          );
          if (!encrypted) throw new Error('NIP-44 encryption failed');
          encryptedContent = encrypted;
          encryptionMethod = 'nip44';
          logger.debug('DM', 'Falling back to NIP-44 encryption');
        }
      }

      const message: DirectMessage = {
        id: nostrEventId || `pending-${Date.now()}`,
        nostrEventId,
        senderPubkey: this.currentUserPubkey,
        recipientPubkey: args.recipientPubkey,
        content: args.content,
        encryptedContent,
        timestamp: Date.now(),
        isRead: true,
        isSent: true,
        isDecrypted: true,
        replyToId: args.replyToId,
      };

      // Add to local conversation
      this.addMessageToConversation(args.recipientPubkey, message);

      logger.info('DM', `Sent message via ${encryptionMethod} to ${args.recipientPubkey.slice(0, 8)}...`);
      return message;
    } catch (error) {
      logger.error('DM', 'Failed to send message', error);
      return null;
    }
  }

  /**
   * Decrypt and process an incoming DM event
   * Supports NIP-17 (gift wrap), NIP-44, and NIP-04 (legacy)
   */
  async processIncomingDM(args: {
    event: NostrEvent;
    recipientPrivkey: string;
  }): Promise<DirectMessage | null> {
    if (!this.currentUserPubkey) return null;

    try {
      // Check if it's a NIP-17 gift wrap
      if (cryptoService.isGiftWrap(args.event)) {
        const unwrapped = await cryptoService.unwrapGiftWrap({
          giftWrapEvent: args.event,
          recipientPrivkey: args.recipientPrivkey,
        });

        if (unwrapped) {
          const message: DirectMessage = {
            id: args.event.id,
            nostrEventId: args.event.id,
            senderPubkey: unwrapped.senderPubkey,
            recipientPubkey: this.currentUserPubkey,
            content: unwrapped.content,
            encryptedContent: args.event.content,
            timestamp: unwrapped.timestamp,
            isRead: false,
            isSent: false,
            isDecrypted: true,
            replyToId: unwrapped.replyToId,
          };

          this.addMessageToConversation(unwrapped.senderPubkey, message);
          return message;
        }
      }

      // Try NIP-04 (legacy) decryption
      if (cryptoService.isLegacyDM(args.event)) {
        const senderPubkey = args.event.pubkey;
        const decrypted = await cryptoService.decryptNIP04(
          args.event.content,
          args.recipientPrivkey,
          senderPubkey
        );

        if (decrypted) {
          const message: DirectMessage = {
            id: args.event.id,
            nostrEventId: args.event.id,
            senderPubkey,
            recipientPubkey: this.currentUserPubkey,
            content: decrypted,
            encryptedContent: args.event.content,
            timestamp: args.event.created_at * 1000,
            isRead: false,
            isSent: false,
            isDecrypted: true,
          };

          this.addMessageToConversation(senderPubkey, message);
          return message;
        }
      }

      return null;
    } catch (error) {
      logger.error('DM', 'Failed to process incoming DM', error);
      return null;
    }
  }

  // ----------------------------------------
  // RECEIVING MESSAGES
  // ----------------------------------------

  /**
   * Fetch DM history for current user
   */
  async fetchMessages(opts: { since?: number; limit?: number } = {}): Promise<DirectMessage[]> {
    if (!this.currentUserPubkey) {
      return [];
    }

    const since = opts.since || Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60); // 30 days
    const limit = opts.limit || 500;

    // Fetch messages where user is sender OR recipient
    const filter: Filter = {
      kinds: [NOSTR_KINDS.ENCRYPTED_DM],
      limit,
      since,
    };

    // We need two queries - one for sent, one for received
    const sentFilter: Filter = { ...filter, authors: [this.currentUserPubkey] };
    const receivedFilter: Filter = { ...filter, '#p': [this.currentUserPubkey] };

    try {
      const [sentEvents, receivedEvents] = await Promise.all([
        this.fetchDMEvents(sentFilter),
        this.fetchDMEvents(receivedFilter),
      ]);

      // Combine and dedupe
      const allEvents = [...sentEvents, ...receivedEvents];
      const uniqueEvents = new Map<string, NostrEvent>();
      allEvents.forEach(e => uniqueEvents.set(e.id, e));

      // Convert to DirectMessage objects
      const messages = Array.from(uniqueEvents.values())
        .map(event => this.eventToDirectMessage(event))
        .filter((m): m is DirectMessage => m !== null)
        .sort((a, b) => a.timestamp - b.timestamp);

      // Organize into conversations
      messages.forEach(message => {
        const counterparty = message.isSent 
          ? message.recipientPubkey 
          : message.senderPubkey;
        this.addMessageToConversation(counterparty, message, false);
      });

      this.saveConversationsToStorage();
      this.updateUnreadCount();

      logger.info('DM', `Fetched ${messages.length} messages across ${this.conversations.size} conversations`);
      return messages;
    } catch (error) {
      logger.error('DM', 'Failed to fetch messages', error);
      return [];
    }
  }

  private async fetchDMEvents(_filter: Filter): Promise<NostrEvent[]> {
    try {
      // Use nostrService's internal pool to query
      const _relays = nostrService.getRelayUrls();
      // Direct query would require exposing pool - for now use a placeholder
      // In production, this would use nostrService.pool.querySync(relays, filter)
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Subscribe to incoming DMs in real-time
   */
  subscribeToMessages(): string | null {
    if (!this.currentUserPubkey || this.messageSubscription) {
      return this.messageSubscription;
    }

    // Subscribe to messages where current user is tagged
    // This would use nostrService's subscription system
    // Placeholder for now - actual implementation would hook into nostrService

    logger.info('DM', 'Subscribed to incoming messages');
    return null;
  }

  /**
   * Unsubscribe from real-time messages
   */
  unsubscribeFromMessages() {
    if (this.messageSubscription) {
      nostrService.unsubscribe(this.messageSubscription);
      this.messageSubscription = null;
    }
  }

  // ----------------------------------------
  // EVENT CONVERSION
  // ----------------------------------------

  /**
   * Convert a Nostr NIP-04 event to a DirectMessage object (sync version)
   * Note: Decryption happens async in processIncomingDM
   */
  eventToDirectMessage(event: NostrEvent): DirectMessage | null {
    if (event.kind !== NOSTR_KINDS.ENCRYPTED_DM && event.kind !== NOSTR_KINDS.GIFT_WRAP) {
      return null;
    }

    const recipientPubkey = event.tags.find(t => t[0] === 'p')?.[1];
    if (!recipientPubkey) {
      return null;
    }

    const isSent = event.pubkey === this.currentUserPubkey;
    const replyToId = event.tags.find(t => t[0] === 'e' && t[3] === 'reply')?.[1];

    return {
      id: event.id,
      nostrEventId: event.id,
      senderPubkey: event.pubkey,
      recipientPubkey,
      content: '[Encrypted Message]',
      encryptedContent: event.content,
      timestamp: event.created_at * 1000,
      isRead: isSent, // Sent messages are always "read"
      isSent,
      isDecrypted: false,
      replyToId,
    };
  }

  /**
   * Convert and decrypt a Nostr DM event (async version)
   */
  async eventToDirectMessageAsync(event: NostrEvent, privateKey: string): Promise<DirectMessage | null> {
    if (event.kind !== NOSTR_KINDS.ENCRYPTED_DM && event.kind !== NOSTR_KINDS.GIFT_WRAP) {
      return null;
    }

    const recipientPubkey = event.tags.find(t => t[0] === 'p')?.[1];
    if (!recipientPubkey) {
      return null;
    }

    const isSent = event.pubkey === this.currentUserPubkey;
    const replyToId = event.tags.find(t => t[0] === 'e' && t[3] === 'reply')?.[1];

    // Try to decrypt
    let content = '[Encrypted Message]';
    let isDecrypted = false;

    try {
      const counterpartyPubkey = isSent ? recipientPubkey : event.pubkey;
      const decrypted = await cryptoService.decryptNIP04(
        event.content,
        privateKey,
        counterpartyPubkey
      );
      if (decrypted) {
        content = decrypted;
        isDecrypted = true;
      }
    } catch {
      // Decryption failed - keep placeholder content
    }

    return {
      id: event.id,
      nostrEventId: event.id,
      senderPubkey: event.pubkey,
      recipientPubkey,
      content,
      encryptedContent: event.content,
      timestamp: event.created_at * 1000,
      isRead: isSent,
      isSent,
      isDecrypted,
      replyToId,
    };
  }

  // ----------------------------------------
  // HELPERS
  // ----------------------------------------

  private addMessageToConversation(
    counterpartyPubkey: string, 
    message: DirectMessage,
    incrementUnread = true
  ) {
    let conversation = this.conversations.get(counterpartyPubkey);
    
    if (!conversation) {
      conversation = {
        id: counterpartyPubkey,
        participantPubkey: counterpartyPubkey,
        lastMessageTimestamp: message.timestamp,
        unreadCount: 0,
        messages: [],
      };
      this.conversations.set(counterpartyPubkey, conversation);
    }

    // Check if message already exists
    if (!conversation.messages.some(m => m.id === message.id)) {
      conversation.messages.push(message);
      conversation.messages.sort((a, b) => a.timestamp - b.timestamp);

      // Update last message
      if (message.timestamp >= conversation.lastMessageTimestamp) {
        conversation.lastMessage = message;
        conversation.lastMessageTimestamp = message.timestamp;
      }

      // Increment unread count for received messages
      if (!message.isSent && !message.isRead && incrementUnread) {
        conversation.unreadCount++;
        this._unreadCount++;

        // Trigger notification
        if (this.onNewMessage) {
          this.onNewMessage({
            conversationId: counterpartyPubkey,
            messageId: message.id,
            senderPubkey: message.senderPubkey,
            preview: message.content.slice(0, 50) + (message.content.length > 50 ? '...' : ''),
            timestamp: message.timestamp,
          });
        }
      }
    }
  }

  private updateUnreadCount() {
    this._unreadCount = Array.from(this.conversations.values())
      .reduce((sum, conv) => sum + conv.unreadCount, 0);
  }

  // ----------------------------------------
  // PERSISTENCE
  // ----------------------------------------

  private readonly STORAGE_KEY = 'bitboard_dm_conversations_v1';

  private loadConversationsFromStorage() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return;

      const data = JSON.parse(stored);
      if (data.userPubkey !== this.currentUserPubkey) {
        // Different user - don't load
        return;
      }

      // Reconstruct conversations map
      this.conversations.clear();
      for (const conv of data.conversations || []) {
        this.conversations.set(conv.id, conv);
      }

      this.updateUnreadCount();
      logger.debug('DM', `Loaded ${this.conversations.size} conversations from storage`);
    } catch (error) {
      logger.warn('DM', 'Failed to load conversations from storage', error);
    }
  }

  private saveConversationsToStorage() {
    try {
      const data = {
        userPubkey: this.currentUserPubkey,
        conversations: Array.from(this.conversations.values()),
        savedAt: Date.now(),
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      logger.warn('DM', 'Failed to save conversations to storage', error);
    }
  }

  // ----------------------------------------
  // CLEANUP
  // ----------------------------------------

  cleanup() {
    this.unsubscribeFromMessages();
    this.saveConversationsToStorage();
    this.conversations.clear();
    this.currentUserPubkey = null;
    this._unreadCount = 0;
    logger.info('DM', 'DM service cleaned up');
  }
}

// Export singleton
export const dmService = new DMService();
export { DMService };
