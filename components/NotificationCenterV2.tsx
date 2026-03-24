import React, { useState, useEffect, useCallback } from 'react';
import { NotificationListSkeleton } from './LoadingSkeletons';
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Trash2,
  Settings,
  MessageCircle,
  AtSign,
  UserPlus,
  Heart,
  Repeat,
  Megaphone,
  X,
  Filter as _Filter,
} from 'lucide-react';
import {
  notificationService,
  type Notification,
  type NotificationPreferences,
  NotificationType,
} from '../services/notificationService';
import { useNotificationUnreadCount } from '../hooks/useNotificationUnreadCount';

// ============================================
// TYPES
// ============================================

interface NotificationCenterProps {
  onClose: () => void;
  onNavigate?: (deepLink: Notification['deepLink']) => void;
}

// ============================================
// NOTIFICATION CENTER
// ============================================

export const NotificationCenterV2: React.FC<NotificationCenterProps> = ({
  onClose,
  onNavigate,
}) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<NotificationType | 'all'>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const unreadCount = useNotificationUnreadCount();

  const loadNotifications = useCallback(() => {
    const opts = filter === 'all' ? {} : { type: filter };
    setNotifications(notificationService.getAll({ ...opts, limit: 100 }));
  }, [filter]);

  // Load notifications
  useEffect(() => {
    loadNotifications();
    setIsLoading(false);
    const unsubscribe = notificationService.subscribe(loadNotifications);
    return unsubscribe;
  }, [loadNotifications]);

  const handleMarkAsRead = (id: string) => {
    notificationService.markAsRead(id);
    loadNotifications();
  };

  const handleMarkAllAsRead = () => {
    notificationService.markAllAsRead();
    loadNotifications();
  };

  const handleDelete = (id: string) => {
    notificationService.delete(id);
    loadNotifications();
  };

  const handleClearAll = () => {
    notificationService.clearAll();
    setIsConfirmingClearAll(false);
    loadNotifications();
  };

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read
    if (!notification.isRead) {
      notificationService.markAsRead(notification.id);
      loadNotifications();
    }

    // Navigate if deep link exists
    if (notification.deepLink && onNavigate) {
      onNavigate(notification.deepLink);
      onClose();
    }
  };

  return (
    <div className="ui-overlay flex items-start justify-center px-4 pt-16 sm:pt-24">
      <div className="ui-surface-modal flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-terminal-dim/15 px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-2xl font-semibold text-terminal-text">
              <Bell size={20} />
              Notifications
              {unreadCount > 0 && (
                <span className="rounded-sm bg-terminal-text px-2 py-0.5 text-xs font-bold text-black">
                  {unreadCount}
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 hover:bg-terminal-dim/20 transition-colors"
                title="Settings"
              >
                <Settings size={16} />
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-terminal-dim/20 text-terminal-dim hover:text-terminal-alert transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 text-sm">
            {(['all', ...Object.values(NotificationType)] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`
                  min-h-[36px] whitespace-nowrap border px-3 py-2 transition-colors uppercase tracking-[0.12em]
                  ${
                    filter === type
                      ? 'border-terminal-dim/60 bg-terminal-dim/10 text-terminal-text'
                      : 'border-terminal-dim/25 text-terminal-dim hover:border-terminal-dim/50 hover:text-terminal-text'
                  }
                `}
              >
                {type === 'all' ? 'All' : getTypeLabel(type)}
              </button>
            ))}
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && <NotificationSettings onClose={() => setShowSettings(false)} />}

        {/* Actions */}
        {notifications.length > 0 && (
          <div className="flex justify-between border-b border-terminal-dim/15 px-4 py-2 text-xs">
            <button
              onClick={handleMarkAllAsRead}
              className="text-terminal-dim hover:text-terminal-text transition-colors flex items-center gap-1"
            >
              <CheckCheck size={12} />
              Mark all read
            </button>
            <button
              onClick={() => setIsConfirmingClearAll(true)}
              className="text-terminal-dim hover:text-terminal-alert transition-colors flex items-center gap-1"
            >
              <Trash2 size={12} />
              Clear all
            </button>
          </div>
        )}

        {isConfirmingClearAll && notifications.length > 0 && (
          <div className="mx-4 mt-3 border border-terminal-alert/40 bg-terminal-alert/10 p-3">
            <div className="flex items-start gap-2 text-terminal-alert">
              <Trash2 size={14} className="mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold uppercase tracking-wide">
                  Clear all notifications?
                </p>
                <p className="mt-1 text-sm text-terminal-dim">
                  This removes all notifications from local storage and cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setIsConfirmingClearAll(false)}
                className="ui-button-secondary px-3 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                className="border border-terminal-alert/40 bg-terminal-alert px-3 py-2 text-xs uppercase tracking-[0.12em] text-black transition-colors hover:opacity-90"
              >
                Confirm Clear All
              </button>
            </div>
          </div>
        )}

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <NotificationListSkeleton />
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-terminal-dim">
              <BellOff size={32} className="mx-auto mb-2 opacity-70" />
              <p>No notifications</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onClick={() => handleNotificationClick(notification)}
                onMarkAsRead={() => handleMarkAsRead(notification.id)}
                onDelete={() => handleDelete(notification.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// NOTIFICATION ITEM
// ============================================

const NotificationItem: React.FC<{
  notification: Notification;
  onClick: () => void;
  onMarkAsRead: () => void;
  onDelete: () => void;
}> = ({ notification, onClick, onMarkAsRead, onDelete }) => {
  const Icon = getTypeIcon(notification.type);
  const timeAgo = formatTimeAgo(notification.timestamp);

  return (
    <div
      className={`
        border-b border-terminal-dim/15 p-3 transition-colors
        hover:bg-terminal-dim/10
        ${!notification.isRead ? 'bg-terminal-dim/[0.07]' : ''}
      `}
    >
      <div className="flex gap-3">
        {/* Icon */}
        <div
          className={`
          flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm border border-terminal-dim/20
          ${!notification.isRead ? 'bg-terminal-text/10' : 'bg-terminal-dim/10'}
        `}
        >
          <Icon
            size={16}
            className={!notification.isRead ? 'text-terminal-text' : 'text-terminal-dim'}
          />
        </div>

        {/* Content */}
        <button type="button" onClick={onClick} className="min-w-0 flex-1 text-left">
          <div className="flex items-start justify-between gap-2">
            <p
              className={`text-sm ${!notification.isRead ? 'font-semibold text-terminal-text' : ''}`}
            >
              {getNotificationTitle(notification)}
            </p>
            <span className="text-xs text-terminal-dim flex-shrink-0">{timeAgo}</span>
          </div>

          {notification.preview && (
            <p className="text-xs text-terminal-dim mt-1 truncate">{notification.preview}</p>
          )}
        </button>

        {/* Actions */}
        <div className="flex flex-col gap-1">
          {!notification.isRead && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMarkAsRead();
              }}
              className="p-1 text-terminal-dim hover:text-terminal-text transition-colors"
              title="Mark as read"
            >
              <Check size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 text-terminal-dim hover:text-terminal-alert transition-colors"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// NOTIFICATION SETTINGS
// ============================================

export const NotificationSettings: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [prefs, setPrefs] = useState<NotificationPreferences>(notificationService.getPreferences());
  const [_isSaving, setIsSaving] = useState(false);

  const handleToggle = async (key: keyof NotificationPreferences) => {
    const newValue = !prefs[key];
    const newPrefs = { ...prefs, [key]: newValue };
    setPrefs(newPrefs);

    setIsSaving(true);
    await notificationService.updatePreferences({ [key]: newValue });
    setIsSaving(false);
  };

  return (
    <div className="border-b border-terminal-dim/15 bg-terminal-dim/10 px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-mono text-sm uppercase tracking-[0.12em] text-terminal-text">
          Settings
        </h3>
        <button onClick={onClose} className="text-xs text-terminal-dim hover:text-terminal-text">
          Done
        </button>
      </div>

      <div className="space-y-2 text-sm">
        <SettingToggle
          label="Mentions"
          enabled={prefs.enableMentions}
          onToggle={() => handleToggle('enableMentions')}
        />
        <SettingToggle
          label="Replies"
          enabled={prefs.enableReplies}
          onToggle={() => handleToggle('enableReplies')}
        />
        <SettingToggle
          label="New followers"
          enabled={prefs.enableFollows}
          onToggle={() => handleToggle('enableFollows')}
        />
        <SettingToggle
          label="Votes (can be noisy)"
          enabled={prefs.enableVotes}
          onToggle={() => handleToggle('enableVotes')}
        />

        <div className="mt-2 border-t border-terminal-dim/30 pt-2">
          <SettingToggle
            label="Push notifications"
            enabled={prefs.pushEnabled}
            onToggle={() => handleToggle('pushEnabled')}
          />
          {prefs.pushEnabled && (
            <>
              <SettingToggle
                label="Sound"
                enabled={prefs.pushSound}
                onToggle={() => handleToggle('pushSound')}
              />
              <SettingToggle
                label="Quiet hours (10PM-8AM)"
                enabled={prefs.quietHoursEnabled}
                onToggle={() => handleToggle('quietHoursEnabled')}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const SettingToggle: React.FC<{
  label: string;
  enabled: boolean;
  onToggle: () => void;
}> = ({ label, enabled, onToggle }) => (
  <div className="flex items-center justify-between py-1">
    <span className="text-terminal-dim">{label}</span>
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      className={`ui-toggle ${enabled ? 'bg-terminal-text' : 'bg-terminal-dim/20'}`}
    >
      <span
        className={`ui-toggle-thumb ${enabled ? 'left-5 bg-black' : 'left-0.5 bg-terminal-dim'}`}
      />
    </button>
  </div>
);

// ============================================
// NOTIFICATION BADGE (for header)
// ============================================

export const NotificationBadge: React.FC<{
  onClick: () => void;
}> = ({ onClick }) => {
  const unreadCount = useNotificationUnreadCount();

  return (
    <button
      onClick={onClick}
      className="relative p-2 hover:bg-terminal-dim/20 transition-colors"
      title="Notifications"
    >
      <Bell size={20} />
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-sm bg-terminal-text px-1 text-xs font-bold text-black">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
};

// ============================================
// HELPERS
// ============================================

function getTypeIcon(type: NotificationType) {
  switch (type) {
    case NotificationType.MENTION:
      return AtSign;
    case NotificationType.REPLY:
      return MessageCircle;
    case NotificationType.FOLLOW:
      return UserPlus;
    case NotificationType.VOTE:
      return Heart;
    case NotificationType.REPOST:
      return Repeat;
    case NotificationType.BOARD_ACTIVITY:
      return Bell;
    case NotificationType.SYSTEM:
      return Megaphone;
    default:
      return Bell;
  }
}

function getTypeLabel(type: NotificationType): string {
  switch (type) {
    case NotificationType.MENTION:
      return 'Mentions';
    case NotificationType.REPLY:
      return 'Replies';
    case NotificationType.FOLLOW:
      return 'Follows';
    case NotificationType.VOTE:
      return 'Votes';
    case NotificationType.REPOST:
      return 'Reposts';
    case NotificationType.BOARD_ACTIVITY:
      return 'Boards';
    case NotificationType.SYSTEM:
      return 'System';
    default:
      return type;
  }
}

function getNotificationTitle(notification: Notification): string {
  const fromName =
    notification.fromDisplayName || notification.fromPubkey?.slice(0, 8) || 'Someone';

  switch (notification.type) {
    case NotificationType.MENTION:
      return `${fromName} mentioned you`;
    case NotificationType.REPLY:
      return `${fromName} replied to your post`;
    case NotificationType.FOLLOW:
      return `${fromName} started following you`;
    case NotificationType.VOTE:
      return `${fromName} voted on your post`;
    case NotificationType.REPOST:
      return `${fromName} reposted your content`;
    case NotificationType.BOARD_ACTIVITY:
      return 'New activity in your boards';
    case NotificationType.SYSTEM:
      return notification.title || 'System notification';
    default:
      return 'New notification';
  }
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;

  return new Date(timestamp).toLocaleDateString();
}

export default NotificationCenterV2;
