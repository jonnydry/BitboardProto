import { nostrService } from './nostrService';
import { identityService } from './identityService';

export type NotificationType = 'reply' | 'mention' | 'vote' | 'follow';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  actorPubkey: string;
  actorName: string;
  targetId?: string; // post/comment id
  eventId?: string; // nostr event id
  metadata?: Record<string, any>;
}

/**
 * Service for managing user notifications
 */
class NotificationService {
  private notifications: Notification[] = [];
  private listeners: Array<(notifications: Notification[]) => void> = [];
  private subscriptions: string[] = [];
  private isSubscribed = false;

  constructor() {
    this.loadNotifications();
  }

  /**
   * Get all notifications
   */
  getNotifications(): Notification[] {
    return [...this.notifications];
  }

  /**
   * Get unread notification count
   */
  getUnreadCount(): number {
    return this.notifications.filter(n => !n.read).length;
  }

  /**
   * Mark notification as read
   */
  markAsRead(notificationId: string): void {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification && !notification.read) {
      notification.read = true;
      this.saveNotifications();
      this.notifyListeners();
    }
  }

  /**
   * Mark all notifications as read
   */
  markAllAsRead(): void {
    let changed = false;
    this.notifications.forEach(n => {
      if (!n.read) {
        n.read = true;
        changed = true;
      }
    });
    if (changed) {
      this.saveNotifications();
      this.notifyListeners();
    }
  }

  /**
   * Add a new notification
   */
  addNotification(notification: Omit<Notification, 'id' | 'read'>): void {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newNotification: Notification = {
      ...notification,
      id,
      read: false,
    };

    this.notifications.unshift(newNotification); // Add to beginning

    // Keep only last 100 notifications
    if (this.notifications.length > 100) {
      this.notifications = this.notifications.slice(0, 100);
    }

    this.saveNotifications();
    this.notifyListeners();
  }

  /**
   * Start real-time notification subscriptions
   */
  startSubscriptions(): void {
    if (this.isSubscribed) return;

    const identity = identityService.getIdentity();
    if (!identity) return;

    // Subscribe to replies (kind 1 events mentioning our pubkey)
    const replySub = nostrService.subscribeToFeed(
      (event) => this.handleReplyEvent(event, identity.pubkey),
      {}
    );

    // Subscribe to votes on our posts
    const voteSub = nostrService.subscribeToFeed(
      (event) => this.handleVoteEvent(event, identity.pubkey),
      {}
    );

    this.subscriptions = [replySub, voteSub];
    this.isSubscribed = true;
  }

  /**
   * Stop notification subscriptions
   */
  stopSubscriptions(): void {
    this.subscriptions.forEach(sub => nostrService.unsubscribe(sub));
    this.subscriptions = [];
    this.isSubscribed = false;
  }

  /**
   * Subscribe to notification changes
   */
  subscribe(listener: (notifications: Notification[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private handleReplyEvent(event: any, userPubkey: string): void {
    // Check if this is a reply to one of our posts/comments
    const eTags = event.tags.filter((t: any) => t[0] === 'e');
    const pTags = event.tags.filter((t: any) => t[0] === 'p');

    // Check if we're mentioned
    const mentionsUser = pTags.some((t: any) => t[1] === userPubkey);

    if (mentionsUser) {
      const actorName = nostrService.getDisplayName(event.pubkey);
      const isReply = eTags.length > 0;

      if (isReply) {
        this.addNotification({
          type: 'reply',
          title: 'New Reply',
          message: `${actorName} replied to your post`,
          timestamp: event.created_at * 1000,
          actorPubkey: event.pubkey,
          actorName,
          eventId: event.id,
          targetId: eTags[0]?.[1], // The post being replied to
        });
      } else {
        // Direct mention
        this.addNotification({
          type: 'mention',
          title: 'Mentioned',
          message: `${actorName} mentioned you`,
          timestamp: event.created_at * 1000,
          actorPubkey: event.pubkey,
          actorName,
          eventId: event.id,
        });
      }
    }
  }

  private handleVoteEvent(event: any, userPubkey: string): void {
    // This is a simplified version - in practice we'd need to check
    // if votes are on our posts by fetching vote targets
    // For now, we'll skip vote notifications as they require more complex logic
  }

  private notifyListeners(): void {
    const notifications = this.getNotifications();
    this.listeners.forEach(listener => {
      try {
        listener(notifications);
      } catch (error) {
        console.error('[NotificationService] Listener error:', error);
      }
    });
  }

  private loadNotifications(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem('bitboard_notifications_v1');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.notifications = parsed.map(n => ({
          ...n,
          timestamp: new Date(n.timestamp).getTime(), // Ensure timestamp is number
        }));
      }
    } catch (error) {
      console.error('[NotificationService] Failed to load notifications:', error);
      this.notifications = [];
    }
  }

  private saveNotifications(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem('bitboard_notifications_v1', JSON.stringify(this.notifications));
    } catch (error) {
      console.error('[NotificationService] Failed to save notifications:', error);
    }
  }

  /**
   * Clear all notifications
   */
  clearAll(): void {
    this.notifications = [];
    this.saveNotifications();
    this.notifyListeners();
  }
}

export const notificationService = new NotificationService();

