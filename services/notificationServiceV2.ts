// ============================================
// ENHANCED NOTIFICATION SERVICE
// ============================================
// Comprehensive notification system for BitBoard
// Supports push notifications, notification preferences,
// and real-time event tracking

import { type Event as NostrEvent } from 'nostr-tools';
import { NOSTR_KINDS as _NOSTR_KINDS } from '../types';
import { logger } from './loggingService';

// ============================================
// TYPES
// ============================================

export enum NotificationType {
  MENTION = 'mention',           // Someone mentioned you in a post/comment
  REPLY = 'reply',               // Someone replied to your post/comment
  FOLLOW = 'follow',             // Someone followed you
  DIRECT_MESSAGE = 'dm',         // New direct message
  VOTE = 'vote',                 // Someone voted on your post/comment
  REPOST = 'repost',             // Someone reposted your content
  BOARD_ACTIVITY = 'board',      // Activity in boards you follow
  SYSTEM = 'system',             // System announcements
}

export interface Notification {
  id: string;
  type: NotificationType;
  timestamp: number;
  isRead: boolean;
  
  // Source information
  fromPubkey?: string;
  fromDisplayName?: string;
  fromAvatar?: string;
  
  // Content reference
  targetEventId?: string;       // The event being referenced (your post that got a reply, etc.)
  sourceEventId?: string;       // The event that triggered the notification (the reply itself)
  
  // Preview content
  preview?: string;             // Short preview of the notification content
  title?: string;               // Title for system notifications
  
  // Deep link
  deepLink?: {
    viewMode: string;
    postId?: string;
    boardId?: string;
    pubkey?: string;
  };
}

export interface NotificationPreferences {
  // Notification types to enable
  enableMentions: boolean;
  enableReplies: boolean;
  enableFollows: boolean;
  enableDMs: boolean;
  enableVotes: boolean;
  enableReposts: boolean;
  enableBoardActivity: boolean;
  enableSystemNotifications: boolean;
  
  // Push notification settings
  pushEnabled: boolean;
  pushSound: boolean;
  pushVibrate: boolean;
  
  // Quiet hours
  quietHoursEnabled: boolean;
  quietHoursStart: number;      // Hour (0-23)
  quietHoursEnd: number;        // Hour (0-23)
  
  // Filtering
  mutedPubkeys: string[];
  mutedBoards: string[];
}

export interface NotificationStats {
  total: number;
  unread: number;
  byType: Record<NotificationType, number>;
}

// ============================================
// DEFAULT PREFERENCES
// ============================================

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enableMentions: true,
  enableReplies: true,
  enableFollows: true,
  enableDMs: true,
  enableVotes: false,           // Off by default (can be noisy)
  enableReposts: true,
  enableBoardActivity: false,   // Off by default
  enableSystemNotifications: true,
  
  pushEnabled: false,           // Requires explicit opt-in
  pushSound: true,
  pushVibrate: true,
  
  quietHoursEnabled: false,
  quietHoursStart: 22,          // 10 PM
  quietHoursEnd: 8,             // 8 AM
  
  mutedPubkeys: [],
  mutedBoards: [],
};

// ============================================
// NOTIFICATION SERVICE
// ============================================

class NotificationServiceV2 {
  private notifications: Map<string, Notification> = new Map();
  private preferences: NotificationPreferences = { ...DEFAULT_PREFERENCES };
  private currentUserPubkey: string | null = null;
  private onNotification: ((notification: Notification) => void) | null = null;
  private _unreadCount = 0;
  private pushSubscription: PushSubscription | null = null;

  // ----------------------------------------
  // INITIALIZATION
  // ----------------------------------------

  async initialize(userPubkey: string): Promise<void> {
    this.currentUserPubkey = userPubkey;
    this.loadFromStorage();
    
    // Request push permission if enabled
    if (this.preferences.pushEnabled) {
      await this.initializePushNotifications();
    }
    
    logger.info('Notifications', `Initialized for ${userPubkey.slice(0, 8)}...`);
  }

  /**
   * Set callback for new notifications
   */
  setNotificationHandler(handler: (notification: Notification) => void): void {
    this.onNotification = handler;
  }

  // ----------------------------------------
  // NOTIFICATION CREATION
  // ----------------------------------------

  /**
   * Create a notification from a Nostr event
   */
  createFromEvent(event: NostrEvent, type: NotificationType): Notification | null {
    if (!this.currentUserPubkey) return null;
    
    // Check if this notification type is enabled
    if (!this.isTypeEnabled(type)) return null;
    
    // Check muted pubkeys
    if (this.preferences.mutedPubkeys.includes(event.pubkey)) return null;
    
    // Check quiet hours
    if (this.isQuietHours()) return null;
    
    // Check if notification already exists
    const existingId = `${type}-${event.id}`;
    if (this.notifications.has(existingId)) return null;

    const notification: Notification = {
      id: existingId,
      type,
      timestamp: event.created_at * 1000,
      isRead: false,
      fromPubkey: event.pubkey,
      sourceEventId: event.id,
      preview: this.extractPreview(event, type),
    };

    // Extract target event ID for replies/mentions
    const eTag = event.tags.find(t => t[0] === 'e');
    if (eTag) {
      notification.targetEventId = eTag[1];
    }

    // Add to notifications
    this.addNotification(notification);
    
    return notification;
  }

  /**
   * Create a mention notification
   */
  createMention(args: {
    fromPubkey: string;
    fromDisplayName?: string;
    postId: string;
    preview: string;
    boardId?: string;
  }): Notification | null {
    return this.createNotification({
      type: NotificationType.MENTION,
      fromPubkey: args.fromPubkey,
      fromDisplayName: args.fromDisplayName,
      sourceEventId: args.postId,
      preview: args.preview,
      deepLink: {
        viewMode: 'SINGLE_BIT',
        postId: args.postId,
        boardId: args.boardId,
      },
    });
  }

  /**
   * Create a reply notification
   */
  createReply(args: {
    fromPubkey: string;
    fromDisplayName?: string;
    replyId: string;
    originalPostId: string;
    preview: string;
    boardId?: string;
  }): Notification | null {
    return this.createNotification({
      type: NotificationType.REPLY,
      fromPubkey: args.fromPubkey,
      fromDisplayName: args.fromDisplayName,
      sourceEventId: args.replyId,
      targetEventId: args.originalPostId,
      preview: args.preview,
      deepLink: {
        viewMode: 'SINGLE_BIT',
        postId: args.originalPostId,
        boardId: args.boardId,
      },
    });
  }

  /**
   * Create a follow notification
   */
  createFollow(args: {
    fromPubkey: string;
    fromDisplayName?: string;
    fromAvatar?: string;
  }): Notification | null {
    return this.createNotification({
      type: NotificationType.FOLLOW,
      fromPubkey: args.fromPubkey,
      fromDisplayName: args.fromDisplayName,
      fromAvatar: args.fromAvatar,
      preview: `${args.fromDisplayName || args.fromPubkey.slice(0, 8)} started following you`,
      deepLink: {
        viewMode: 'USER_PROFILE',
        pubkey: args.fromPubkey,
      },
    });
  }

  /**
   * Create a DM notification
   */
  createDM(args: {
    fromPubkey: string;
    fromDisplayName?: string;
    messageId: string;
    preview: string;
  }): Notification | null {
    return this.createNotification({
      type: NotificationType.DIRECT_MESSAGE,
      fromPubkey: args.fromPubkey,
      fromDisplayName: args.fromDisplayName,
      sourceEventId: args.messageId,
      preview: args.preview,
      deepLink: {
        viewMode: 'DIRECT_MESSAGES',
        pubkey: args.fromPubkey,
      },
    });
  }

  /**
   * Create a system notification
   */
  createSystem(args: {
    title: string;
    preview: string;
    deepLink?: Notification['deepLink'];
  }): Notification | null {
    return this.createNotification({
      type: NotificationType.SYSTEM,
      title: args.title,
      preview: args.preview,
      deepLink: args.deepLink,
    });
  }

  private createNotification(args: Partial<Notification> & { type: NotificationType }): Notification | null {
    if (!this.currentUserPubkey) return null;
    
    // Check if type is enabled
    if (!this.isTypeEnabled(args.type)) return null;
    
    // Check muted pubkeys
    if (args.fromPubkey && this.preferences.mutedPubkeys.includes(args.fromPubkey)) return null;
    
    // Check quiet hours
    if (this.isQuietHours()) return null;

    const notification: Notification = {
      id: `${args.type}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: args.type,
      timestamp: Date.now(),
      isRead: false,
      ...args,
    };

    this.addNotification(notification);
    return notification;
  }

  private addNotification(notification: Notification): void {
    // Don't add duplicates
    if (this.notifications.has(notification.id)) return;

    this.notifications.set(notification.id, notification);
    this._unreadCount++;
    
    // Trigger callback
    if (this.onNotification) {
      this.onNotification(notification);
    }
    
    // Show push notification if enabled
    if (this.preferences.pushEnabled && !this.isQuietHours()) {
      this.showPushNotification(notification);
    }
    
    // Save to storage
    this.saveToStorage();
    
    // Trim old notifications (keep last 500)
    this.trimNotifications(500);
  }

  // ----------------------------------------
  // NOTIFICATION RETRIEVAL
  // ----------------------------------------

  /**
   * Get all notifications, sorted by timestamp (newest first)
   */
  getAll(opts: { limit?: number; type?: NotificationType; unreadOnly?: boolean } = {}): Notification[] {
    let notifications = Array.from(this.notifications.values());
    
    // Filter by type
    if (opts.type) {
      notifications = notifications.filter(n => n.type === opts.type);
    }
    
    // Filter unread only
    if (opts.unreadOnly) {
      notifications = notifications.filter(n => !n.isRead);
    }
    
    // Sort by timestamp (newest first)
    notifications.sort((a, b) => b.timestamp - a.timestamp);
    
    // Apply limit
    if (opts.limit) {
      notifications = notifications.slice(0, opts.limit);
    }
    
    return notifications;
  }

  /**
   * Get unread count
   */
  getUnreadCount(): number {
    return this._unreadCount;
  }

  /**
   * Get statistics
   */
  getStats(): NotificationStats {
    const byType: Record<NotificationType, number> = {
      [NotificationType.MENTION]: 0,
      [NotificationType.REPLY]: 0,
      [NotificationType.FOLLOW]: 0,
      [NotificationType.DIRECT_MESSAGE]: 0,
      [NotificationType.VOTE]: 0,
      [NotificationType.REPOST]: 0,
      [NotificationType.BOARD_ACTIVITY]: 0,
      [NotificationType.SYSTEM]: 0,
    };

    this.notifications.forEach(n => {
      byType[n.type]++;
    });

    return {
      total: this.notifications.size,
      unread: this._unreadCount,
      byType,
    };
  }

  // ----------------------------------------
  // NOTIFICATION ACTIONS
  // ----------------------------------------

  /**
   * Mark a notification as read
   */
  markAsRead(id: string): void {
    const notification = this.notifications.get(id);
    if (notification && !notification.isRead) {
      notification.isRead = true;
      this._unreadCount = Math.max(0, this._unreadCount - 1);
      this.saveToStorage();
    }
  }

  /**
   * Mark all notifications as read
   */
  markAllAsRead(): void {
    this.notifications.forEach(n => {
      n.isRead = true;
    });
    this._unreadCount = 0;
    this.saveToStorage();
  }

  /**
   * Mark notifications of a specific type as read
   */
  markTypeAsRead(type: NotificationType): void {
    this.notifications.forEach(n => {
      if (n.type === type && !n.isRead) {
        n.isRead = true;
        this._unreadCount = Math.max(0, this._unreadCount - 1);
      }
    });
    this.saveToStorage();
  }

  /**
   * Delete a notification
   */
  delete(id: string): void {
    const notification = this.notifications.get(id);
    if (notification) {
      if (!notification.isRead) {
        this._unreadCount = Math.max(0, this._unreadCount - 1);
      }
      this.notifications.delete(id);
      this.saveToStorage();
    }
  }

  /**
   * Clear all notifications
   */
  clearAll(): void {
    this.notifications.clear();
    this._unreadCount = 0;
    this.saveToStorage();
  }

  // ----------------------------------------
  // PREFERENCES
  // ----------------------------------------

  /**
   * Get notification preferences
   */
  getPreferences(): NotificationPreferences {
    return { ...this.preferences };
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(updates: Partial<NotificationPreferences>): Promise<void> {
    const oldPushEnabled = this.preferences.pushEnabled;
    
    this.preferences = { ...this.preferences, ...updates };
    
    // Handle push notification toggle
    if (updates.pushEnabled !== undefined && updates.pushEnabled !== oldPushEnabled) {
      if (updates.pushEnabled) {
        await this.initializePushNotifications();
      } else {
        await this.disablePushNotifications();
      }
    }
    
    this.saveToStorage();
    logger.info('Notifications', 'Preferences updated');
  }

  /**
   * Mute a pubkey
   */
  mutePubkey(pubkey: string): void {
    if (!this.preferences.mutedPubkeys.includes(pubkey)) {
      this.preferences.mutedPubkeys.push(pubkey);
      this.saveToStorage();
    }
  }

  /**
   * Unmute a pubkey
   */
  unmutePubkey(pubkey: string): void {
    this.preferences.mutedPubkeys = this.preferences.mutedPubkeys.filter(p => p !== pubkey);
    this.saveToStorage();
  }

  // ----------------------------------------
  // PUSH NOTIFICATIONS
  // ----------------------------------------

  /**
   * Check if push notifications are supported
   */
  isPushSupported(): boolean {
    return 'Notification' in window && 'serviceWorker' in navigator;
  }

  /**
   * Get push permission status
   */
  getPushPermission(): NotificationPermission | 'unsupported' {
    if (!this.isPushSupported()) return 'unsupported';
    return Notification.permission;
  }

  /**
   * Request push notification permission
   */
  async requestPushPermission(): Promise<boolean> {
    if (!this.isPushSupported()) {
      logger.warn('Notifications', 'Push notifications not supported');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (error) {
      logger.error('Notifications', 'Failed to request push permission', error);
      return false;
    }
  }

  private async initializePushNotifications(): Promise<void> {
    if (!this.isPushSupported()) return;

    try {
      const permission = await this.requestPushPermission();
      if (!permission) {
        this.preferences.pushEnabled = false;
        this.saveToStorage();
        return;
      }

      // In production, you'd register with a push service here
      // For now, we use the Notifications API directly
      logger.info('Notifications', 'Push notifications initialized');
    } catch (error) {
      logger.error('Notifications', 'Failed to initialize push', error);
    }
  }

  private async disablePushNotifications(): Promise<void> {
    this.pushSubscription = null;
    logger.info('Notifications', 'Push notifications disabled');
  }

  private showPushNotification(notification: Notification): void {
    if (!this.isPushSupported() || Notification.permission !== 'granted') return;

    const title = this.getNotificationTitle(notification);
    const options: NotificationOptions & { vibrate?: number[] } = {
      body: notification.preview,
      icon: notification.fromAvatar || '/assets/bitboard-logo.png',
      badge: '/assets/bitboard-logo.png',
      tag: notification.id,
      silent: !this.preferences.pushSound,
      data: notification.deepLink,
    };

    // Add vibrate if supported (not in standard NotificationOptions but supported by browsers)
    if (this.preferences.pushVibrate) {
      (options as any).vibrate = [200, 100, 200];
    }

    try {
      new Notification(title, options);
    } catch (error) {
      logger.error('Notifications', 'Failed to show push notification', error);
    }
  }

  // ----------------------------------------
  // HELPERS
  // ----------------------------------------

  private isTypeEnabled(type: NotificationType): boolean {
    switch (type) {
      case NotificationType.MENTION:
        return this.preferences.enableMentions;
      case NotificationType.REPLY:
        return this.preferences.enableReplies;
      case NotificationType.FOLLOW:
        return this.preferences.enableFollows;
      case NotificationType.DIRECT_MESSAGE:
        return this.preferences.enableDMs;
      case NotificationType.VOTE:
        return this.preferences.enableVotes;
      case NotificationType.REPOST:
        return this.preferences.enableReposts;
      case NotificationType.BOARD_ACTIVITY:
        return this.preferences.enableBoardActivity;
      case NotificationType.SYSTEM:
        return this.preferences.enableSystemNotifications;
      default:
        return true;
    }
  }

  private isQuietHours(): boolean {
    if (!this.preferences.quietHoursEnabled) return false;
    
    const now = new Date();
    const hour = now.getHours();
    const start = this.preferences.quietHoursStart;
    const end = this.preferences.quietHoursEnd;
    
    // Handle overnight quiet hours (e.g., 22:00 - 08:00)
    if (start > end) {
      return hour >= start || hour < end;
    }
    
    return hour >= start && hour < end;
  }

  private extractPreview(event: NostrEvent, _type: NotificationType): string {
    const content = event.content || '';
    const maxLength = 100;
    
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + '...';
  }

  private getNotificationTitle(notification: Notification): string {
    const fromName = notification.fromDisplayName || 
      notification.fromPubkey?.slice(0, 8) || 
      'Someone';

    switch (notification.type) {
      case NotificationType.MENTION:
        return `${fromName} mentioned you`;
      case NotificationType.REPLY:
        return `${fromName} replied to your post`;
      case NotificationType.FOLLOW:
        return `${fromName} followed you`;
      case NotificationType.DIRECT_MESSAGE:
        return `New message from ${fromName}`;
      case NotificationType.VOTE:
        return `${fromName} voted on your post`;
      case NotificationType.REPOST:
        return `${fromName} reposted your content`;
      case NotificationType.BOARD_ACTIVITY:
        return 'New activity in your boards';
      case NotificationType.SYSTEM:
        return notification.title || 'BitBoard';
      default:
        return 'BitBoard Notification';
    }
  }

  private trimNotifications(maxCount: number): void {
    if (this.notifications.size <= maxCount) return;

    // Sort by timestamp and keep the newest
    const sorted = Array.from(this.notifications.values())
      .sort((a, b) => b.timestamp - a.timestamp);
    
    const toKeep = new Set(sorted.slice(0, maxCount).map(n => n.id));
    
    this.notifications.forEach((_, id) => {
      if (!toKeep.has(id)) {
        this.notifications.delete(id);
      }
    });

    // Recalculate unread count
    this._unreadCount = Array.from(this.notifications.values())
      .filter(n => !n.isRead).length;
  }

  // ----------------------------------------
  // PERSISTENCE
  // ----------------------------------------

  private readonly STORAGE_KEY_NOTIFICATIONS = 'bitboard_notifications_v1';
  private readonly STORAGE_KEY_PREFERENCES = 'bitboard_notification_prefs_v1';

  private loadFromStorage(): void {
    try {
      // Load notifications
      const notifStored = localStorage.getItem(this.STORAGE_KEY_NOTIFICATIONS);
      if (notifStored) {
        const data = JSON.parse(notifStored);
        if (data.userPubkey === this.currentUserPubkey) {
          this.notifications.clear();
          for (const n of data.notifications || []) {
            this.notifications.set(n.id, n);
          }
          this._unreadCount = Array.from(this.notifications.values())
            .filter(n => !n.isRead).length;
        }
      }

      // Load preferences
      const prefStored = localStorage.getItem(this.STORAGE_KEY_PREFERENCES);
      if (prefStored) {
        const data = JSON.parse(prefStored);
        if (data.userPubkey === this.currentUserPubkey) {
          this.preferences = { ...DEFAULT_PREFERENCES, ...data.preferences };
        }
      }

      logger.debug('Notifications', `Loaded ${this.notifications.size} notifications`);
    } catch (error) {
      logger.warn('Notifications', 'Failed to load from storage', error);
    }
  }

  private saveToStorage(): void {
    try {
      // Save notifications
      const notifData = {
        userPubkey: this.currentUserPubkey,
        notifications: Array.from(this.notifications.values()),
        savedAt: Date.now(),
      };
      localStorage.setItem(this.STORAGE_KEY_NOTIFICATIONS, JSON.stringify(notifData));

      // Save preferences
      const prefData = {
        userPubkey: this.currentUserPubkey,
        preferences: this.preferences,
        savedAt: Date.now(),
      };
      localStorage.setItem(this.STORAGE_KEY_PREFERENCES, JSON.stringify(prefData));
    } catch (error) {
      logger.warn('Notifications', 'Failed to save to storage', error);
    }
  }

  // ----------------------------------------
  // CLEANUP
  // ----------------------------------------

  cleanup(): void {
    this.saveToStorage();
    this.notifications.clear();
    this.currentUserPubkey = null;
    this._unreadCount = 0;
    logger.info('Notifications', 'Service cleaned up');
  }
}

// Export singleton
export const notificationServiceV2 = new NotificationServiceV2();
export { NotificationServiceV2 };
