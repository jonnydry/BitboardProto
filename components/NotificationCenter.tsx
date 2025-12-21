import React, { useState, useEffect } from 'react';
import { Bell, X, Check, CheckCheck, MessageSquare, Heart, UserPlus, AtSign } from 'lucide-react';
import { notificationService, type Notification } from '../services/notificationService';
import { toastService } from '../services/toastService';
import { UIConfig } from '../config';

interface NotificationCenterProps {
  onClose: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ onClose }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  useEffect(() => {
    // Load initial notifications
    setNotifications(notificationService.getNotifications());

    // Subscribe to changes
    const unsubscribe = notificationService.subscribe((newNotifications) => {
      setNotifications(newNotifications);
    });

    // Start subscriptions for real-time updates
    notificationService.startSubscriptions();

    return () => {
      unsubscribe();
      notificationService.stopSubscriptions();
    };
  }, []);

  const handleMarkAsRead = (notificationId: string) => {
    notificationService.markAsRead(notificationId);
  };

  const handleMarkAllAsRead = async () => {
    setIsMarkingAll(true);
    try {
      notificationService.markAllAsRead();
      toastService.push({
        type: 'success',
        message: 'All notifications marked as read',
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'mark-all-read',
      });
    } catch (error) {
      toastService.push({
        type: 'error',
        message: 'Failed to mark notifications as read',
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'mark-all-read-failed',
      });
    } finally {
      setIsMarkingAll(false);
    }
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'reply':
        return <MessageSquare size={16} className="text-terminal-text" />;
      case 'mention':
        return <AtSign size={16} className="text-terminal-text" />;
      case 'vote':
        return <Heart size={16} className="text-terminal-text" />;
      case 'follow':
        return <UserPlus size={16} className="text-terminal-text" />;
      default:
        return <Bell size={16} className="text-terminal-text" />;
    }
  };

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return '< 1h';
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  const unreadCount = notificationService.getUnreadCount();

  return (
    <div className="border-2 border-terminal-text bg-terminal-bg p-6 max-w-2xl mx-auto w-full shadow-hard-lg animate-fade-in">
      <div className="flex items-center justify-between mb-6 border-b border-terminal-dim pb-2">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Bell size={20} />
          NOTIFICATIONS
          {unreadCount > 0 && (
            <span className="bg-terminal-text text-black text-xs px-2 py-0.5 rounded font-bold">
              {unreadCount}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              disabled={isMarkingAll}
              className="flex items-center gap-1 text-xs border border-terminal-dim px-2 py-1 hover:border-terminal-text hover:text-terminal-text transition-colors disabled:opacity-50"
            >
              <CheckCheck size={12} />
              MARK_ALL_READ
            </button>
          )}
          <button
            onClick={onClose}
            className="text-terminal-dim hover:text-terminal-text transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-12 text-terminal-dim">
          <div className="text-4xl opacity-20 mb-4">( _ _)</div>
          <p className="font-bold">NO_NOTIFICATIONS</p>
          <p className="text-xs mt-2">You're all caught up!</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`border p-4 transition-all ${
                notification.read
                  ? 'border-terminal-dim/30 bg-terminal-dim/5'
                  : 'border-terminal-text bg-terminal-dim/10'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-terminal-text text-sm">
                        {notification.title}
                      </h4>
                      <p className="text-terminal-text text-sm leading-relaxed">
                        {notification.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-terminal-dim">
                        <span>{notification.actorName}</span>
                        <span>::</span>
                        <span>{formatTime(notification.timestamp)}</span>
                      </div>
                    </div>
                    {!notification.read && (
                      <button
                        onClick={() => handleMarkAsRead(notification.id)}
                        className="flex-shrink-0 p-1 border border-terminal-dim hover:border-terminal-text transition-colors"
                        title="Mark as read"
                      >
                        <Check size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
