// ============================================
// DIRECT MESSAGE SERVICE (NIP-04)
// ============================================
// Nostr-based private messaging using NIP-04 encryption
// Provides encrypted 1-on-1 messaging between users

import { type Event as NostrEvent, type Filter } from 'nostr-tools';
import { NOSTR_KINDS, type UnsignedNostrEvent } from '../types';
import { nostrService } from './nostr/NostrService';
import { cryptoService } from './cryptoService';
import { identityService } from './identityService';
import { logger } from './loggingService';

// ============================================
// TYPES
// ============================================

export interface DirectMessage {
  id: string;
  nostrEventId: string;
  senderPubkey: string;
  recipientPubkey: string;
  content: string; // Decrypted content
  encryptedContent: string; // Original encrypted content
  timestamp: number;
  isRead: boolean;
  isSent: boolean; // true if current user sent this message
  isDecrypted: boolean; // false if decryption failed
  replyToId?: string; // For threaded conversations
}

export interface Conversation {
  id: string; // Counter-party pubkey
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
  preview: string; // First ~50 chars of decrypted message
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
  private listeners = new Set<() => void>();

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

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        logger.warn('DM', 'Listener failed', error);
      }
    });
  }

  // ----------------------------------------
  // CONVERSATION MANAGEMENT
  // ----------------------------------------

  /**
   * Get all conversations sorted by last message time
   */
  getConversations(): Conversation[] {
    return Array.from(this.conversations.values()).sort(
      (a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp,
    );
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
      this._unreadCount = Math.max(0, this._unreadCount - conversation.unreadCount);
      conversation.unreadCount = 0;
      conversation.messages.forEach((m) => {
        m.isRead = true;
      });
      this.saveConversationsToStorage();
      this.notifyListeners();
    }
  }

  /**
   * Delete a conversation
   */
  deleteConversation(participantPubkey: string) {
    const conversation = this.conversations.get(participantPubkey);
    if (conversation) {
      this._unreadCount = Math.max(0, this._unreadCount - conversation.unreadCount);
      this.conversations.delete(participantPubkey);
      this.saveConversationsToStorage();
      this.notifyListeners();
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
    const tags: string[][] = [['p', args.recipientPubkey]];

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
   * Send a direct message using NIP-04 for compatibility and history sync.
   */
  async sendMessage(args: {
    recipientPubkey: string;
    content: string;
    replyToId?: string;
  }): Promise<DirectMessage | null> {
    if (!this.currentUserPubkey) {
      logger.error('DM', 'Cannot send message: DM service not initialized');
      return null;
    }

    if (!identityService.hasLocalIdentity()) {
      logger.error('DM', 'Cannot send message: No identity available');
      return null;
    }

    try {
      const encryptedContent = await identityService.encryptDM(args.content, args.recipientPubkey);
      if (!encryptedContent) throw new Error('NIP-04 encryption failed');

      const unsignedEvent = this.buildDMEvent({
        recipientPubkey: args.recipientPubkey,
        content: args.content,
        senderPubkey: this.currentUserPubkey,
        encryptedContent,
        replyToId: args.replyToId,
      });

      const signedEvent = await identityService.signEvent(unsignedEvent as UnsignedNostrEvent);
      const publishedEvent = await nostrService.publishSignedEvent(signedEvent);
      const encryptionMethod: 'nip17' | 'nip44' | 'nip04' = 'nip04';

      const message: DirectMessage = {
        id: publishedEvent.id,
        nostrEventId: publishedEvent.id,
        senderPubkey: this.currentUserPubkey,
        recipientPubkey: args.recipientPubkey,
        content: args.content,
        encryptedContent: publishedEvent.content,
        timestamp: publishedEvent.created_at * 1000,
        isRead: true,
        isSent: true,
        isDecrypted: true,
        replyToId: args.replyToId,
      };

      // Add to local conversation
      this.addMessageToConversation(args.recipientPubkey, message);
      this.saveConversationsToStorage();
      this.notifyListeners();

      logger.info(
        'DM',
        `Sent message via ${encryptionMethod} to ${args.recipientPubkey.slice(0, 8)}...`,
      );
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
  async processIncomingDM(args: { event: NostrEvent }): Promise<DirectMessage | null> {
    if (!this.currentUserPubkey) return null;

    if (!identityService.hasLocalIdentity()) {
      logger.warn('DM', 'Cannot process incoming DM: No identity available');
      return null;
    }

    try {
      // Check if it's a NIP-17 gift wrap
      if (cryptoService.isGiftWrap(args.event)) {
        const unwrapped = await identityService.unwrapDMGiftWrap(args.event);

        if (unwrapped) {
          const message: DirectMessage = {
            id: args.event.id,
            nostrEventId: args.event.id,
            senderPubkey: unwrapped.senderPubkey,
            recipientPubkey: this.currentUserPubkey,
            content: unwrapped.content,
            encryptedContent: args.event.content,
            // created_at is Unix seconds — multiply by 1000 for milliseconds
            timestamp: args.event.created_at * 1000,
            isRead: false,
            isSent: false,
            isDecrypted: true,
          };

          this.addMessageToConversation(unwrapped.senderPubkey, message);
          return message;
        }
      }

      // Try NIP-04 (legacy) decryption
      if (cryptoService.isLegacyDM(args.event)) {
        const senderPubkey = args.event.pubkey;
        const decrypted = await identityService.decryptDM(args.event.content, senderPubkey);

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

    const hasLocalKey = identityService.hasLocalIdentity();
    const since = opts.since || Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60; // 30 days
    const limit = opts.limit || 500;

    // Fetch messages where user is sender OR recipient
    const filter: Filter = {
      kinds: [NOSTR_KINDS.ENCRYPTED_DM, NOSTR_KINDS.GIFT_WRAP],
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
      allEvents.forEach((e) => uniqueEvents.set(e.id, e));

      // Convert to DirectMessage objects
      const messages = (
        await Promise.all(
          Array.from(uniqueEvents.values()).map((event) =>
            hasLocalKey
              ? this.eventToDirectMessageAsync(event)
              : Promise.resolve(this.eventToDirectMessage(event)),
          ),
        )
      )
        .filter((m): m is DirectMessage => m !== null)
        .sort((a, b) => a.timestamp - b.timestamp);

      // Organize into conversations
      messages.forEach((message) => {
        const counterparty = message.isSent ? message.recipientPubkey : message.senderPubkey;
        this.addMessageToConversation(counterparty, message, false);
      });

      this.saveConversationsToStorage();
      this.updateUnreadCount();
      this.notifyListeners();

      logger.info(
        'DM',
        `Fetched ${messages.length} messages across ${this.conversations.size} conversations`,
      );
      return messages;
    } catch (error) {
      logger.error('DM', 'Failed to fetch messages', error);
      return [];
    }
  }

  private async fetchDMEvents(filter: Filter): Promise<NostrEvent[]> {
    try {
      return await nostrService.queryEvents(filter);
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

    const since = Math.floor(Date.now() / 1000);
    this.messageSubscription = nostrService.subscribeToFilters(
      [
        {
          kinds: [NOSTR_KINDS.ENCRYPTED_DM, NOSTR_KINDS.GIFT_WRAP],
          '#p': [this.currentUserPubkey],
          since,
        },
        {
          kinds: [NOSTR_KINDS.ENCRYPTED_DM],
          authors: [this.currentUserPubkey],
          since,
        },
      ],
      {
        onEvent: (event) => {
          void this.handleIncomingEvent(event);
        },
      },
    );

    logger.info('DM', 'Subscribed to incoming messages');
    return this.messageSubscription;
  }

  private async handleIncomingEvent(event: NostrEvent): Promise<void> {
    const message = identityService.hasLocalIdentity()
      ? await this.eventToDirectMessageAsync(event)
      : this.eventToDirectMessage(event);

    if (!message) {
      return;
    }

    const counterparty = message.isSent ? message.recipientPubkey : message.senderPubkey;
    this.addMessageToConversation(counterparty, message);
    this.saveConversationsToStorage();
    this.notifyListeners();
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

    const recipientPubkey = event.tags.find((t) => t[0] === 'p')?.[1];
    if (!recipientPubkey) {
      return null;
    }

    const isSent = event.pubkey === this.currentUserPubkey;
    const replyToId = event.tags.find((t) => t[0] === 'e' && t[3] === 'reply')?.[1];

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
  async eventToDirectMessageAsync(event: NostrEvent): Promise<DirectMessage | null> {
    if (event.kind !== NOSTR_KINDS.ENCRYPTED_DM && event.kind !== NOSTR_KINDS.GIFT_WRAP) {
      return null;
    }

    const recipientPubkey = event.tags.find((t) => t[0] === 'p')?.[1];
    if (!recipientPubkey) {
      return null;
    }

    const isSent = event.pubkey === this.currentUserPubkey;
    const replyToId = event.tags.find((t) => t[0] === 'e' && t[3] === 'reply')?.[1];

    // Try to decrypt
    let content = '[Encrypted Message]';
    let isDecrypted = false;

    if (identityService.hasLocalIdentity()) {
      try {
        const counterpartyPubkey = isSent ? recipientPubkey : event.pubkey;
        const decrypted =
          event.kind === NOSTR_KINDS.GIFT_WRAP
            ? ((await identityService.unwrapDMGiftWrap(event))?.content ?? null)
            : await identityService.decryptDM(event.content, counterpartyPubkey);
        if (decrypted) {
          content = decrypted;
          isDecrypted = true;
        }
      } catch {
        // Decryption failed - keep placeholder content
      }
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
    incrementUnread = true,
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
    if (!conversation.messages.some((m) => m.id === message.id)) {
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
    this._unreadCount = Array.from(this.conversations.values()).reduce(
      (sum, conv) => sum + conv.unreadCount,
      0,
    );
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

      // Reconstruct conversations map with field validation to guard against
      // corrupted or tampered localStorage data.
      this.conversations.clear();
      for (const conv of data.conversations || []) {
        if (conv && typeof conv.id === 'string' && typeof conv.participantPubkey === 'string') {
          // Validate individual messages — reject any with missing required fields
          if (Array.isArray(conv.messages)) {
            conv.messages = conv.messages.filter(
              (m: unknown) =>
                m !== null &&
                typeof m === 'object' &&
                typeof (m as Record<string, unknown>).id === 'string' &&
                typeof (m as Record<string, unknown>).senderPubkey === 'string' &&
                typeof (m as Record<string, unknown>).recipientPubkey === 'string' &&
                typeof (m as Record<string, unknown>).timestamp === 'number',
            );
          } else {
            conv.messages = [];
          }
          this.conversations.set(conv.id, conv);
        }
      }

      this.updateUnreadCount();
      logger.debug('DM', `Loaded ${this.conversations.size} conversations from storage`);
    } catch (error) {
      logger.warn('DM', 'Failed to load conversations from storage', error);
    }
  }

  private saveConversationsToStorage() {
    try {
      // SECURITY: Never persist decrypted message content to localStorage.
      // Only the encryptedContent (ciphertext) is stored; the plaintext content
      // is re-derived by fetchMessages/eventToDirectMessageAsync on next load.
      const sanitizedConversations = Array.from(this.conversations.values()).map((conv) => ({
        ...conv,
        messages: conv.messages.map((msg) => ({
          ...msg,
          content: '[Encrypted]',
          isDecrypted: false,
        })),
      }));

      const data = {
        userPubkey: this.currentUserPubkey,
        conversations: sanitizedConversations,
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
    this.listeners.clear();
    logger.info('DM', 'DM service cleaned up');
  }
}

// Export singleton
export const dmService = new DMService();
export { DMService };
