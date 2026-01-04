import React, { useState, useEffect } from 'react';
import { 
  Bell, BellOff, Check, CheckCheck, Trash2, Settings, 
  MessageCircle, AtSign, UserPlus, Heart, Repeat, 
  Megaphone, X, Filter as _Filter
} from 'lucide-react';
import { 
  notificationServiceV2, 
  type Notification, 
  type NotificationPreferences,
  NotificationType 
} from '../services/notificationServiceV2';

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
  const [unreadCount, setUnreadCount] = useState(0);

  // Load notifications
  useEffect(() => {
    loadNotifications();
  }, [filter]);

  const loadNotifications = () => {
    const opts = filter === 'all' ? {} : { type: filter };
    setNotifications(notificationServiceV2.getAll({ ...opts, limit: 100 }));
    setUnreadCount(notificationServiceV2.getUnreadCount());
  };

  const handleMarkAsRead = (id: string) => {
    notificationServiceV2.markAsRead(id);
    loadNotifications();
  };

  const handleMarkAllAsRead = () => {
    notificationServiceV2.markAllAsRead();
    loadNotifications();
  };

  const handleDelete = (id: string) => {
    notificationServiceV2.delete(id);
    loadNotifications();
  };

  const handleClearAll = () => {
    if (confirm('Clear all notifications? This cannot be undone.')) {
      notificationServiceV2.clearAll();
      loadNotifications();
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read
    if (!notification.isRead) {
      notificationServiceV2.markAsRead(notification.id);
      loadNotifications();
    }
    
    // Navigate if deep link exists
    if (notification.deepLink && onNavigate) {
      onNavigate(notification.deepLink);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 pt-16 sm:pt-24 px-4">
      <div className="bg-terminal-bg border-2 border-terminal-text w-full max-w-lg max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-terminal-dim">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Bell size={20} />
              NOTIFICATIONS
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 bg-terminal-text text-black text-xs font-bold rounded-full">
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
          <div className="flex gap-1 overflow-x-auto pb-1 text-xs">
            {(['all', ...Object.values(NotificationType)] as const).map(type => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`
                  px-2 py-1 whitespace-nowrap transition-colors
                  ${filter === type 
                    ? 'bg-terminal-text text-black' 
                    : 'border border-terminal-dim hover:border-terminal-text'
                  }
                `}
              >
                {type === 'all' ? 'All' : getTypeLabel(type)}
              </button>
            ))}
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <NotificationSettings onClose={() => setShowSettings(false)} />
        )}

        {/* Actions */}
        {notifications.length > 0 && (
          <div className="px-4 py-2 border-b border-terminal-dim/30 flex justify-between text-xs">
            <button
              onClick={handleMarkAllAsRead}
              className="text-terminal-dim hover:text-terminal-text transition-colors flex items-center gap-1"
            >
              <CheckCheck size={12} />
              Mark all read
            </button>
            <button
              onClick={handleClearAll}
              className="text-terminal-dim hover:text-terminal-alert transition-colors flex items-center gap-1"
            >
              <Trash2 size={12} />
              Clear all
            </button>
          </div>
        )}

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-terminal-dim">
              <BellOff size={32} className="mx-auto mb-2 opacity-50" />
              <p>No notifications</p>
            </div>
          ) : (
            notifications.map(notification => (
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
      onClick={onClick}
      className={`
        p-3 border-b border-terminal-dim/30 cursor-pointer transition-colors
        hover:bg-terminal-dim/10
        ${!notification.isRead ? 'bg-terminal-dim/5' : ''}
      `}
    >
      <div className="flex gap-3">
        {/* Icon */}
        <div className={`
          w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
          ${!notification.isRead ? 'bg-terminal-text/20' : 'bg-terminal-dim/20'}
        `}>
          <Icon size={16} className={!notification.isRead ? 'text-terminal-text' : 'text-terminal-dim'} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm ${!notification.isRead ? 'font-bold' : ''}`}>
              {getNotificationTitle(notification)}
            </p>
            <span className="text-xs text-terminal-dim flex-shrink-0">
              {timeAgo}
            </span>
          </div>
          
          {notification.preview && (
            <p className="text-xs text-terminal-dim mt-1 truncate">
              {notification.preview}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1">
          {!notification.isRead && (
            <button
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

const NotificationSettings: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [prefs, setPrefs] = useState<NotificationPreferences>(
    notificationServiceV2.getPreferences()
  );
  const [_isSaving, setIsSaving] = useState(false);

  const handleToggle = async (key: keyof NotificationPreferences) => {
    const newValue = !prefs[key];
    const newPrefs = { ...prefs, [key]: newValue };
    setPrefs(newPrefs);
    
    setIsSaving(true);
    await notificationServiceV2.updatePreferences({ [key]: newValue });
    setIsSaving(false);
  };

  return (
    <div className="p-4 border-b border-terminal-dim bg-terminal-dim/10">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm">SETTINGS</h3>
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
          label="Direct messages"
          enabled={prefs.enableDMs}
          onToggle={() => handleToggle('enableDMs')}
        />
        <SettingToggle
          label="Votes (can be noisy)"
          enabled={prefs.enableVotes}
          onToggle={() => handleToggle('enableVotes')}
        />
        
        <div className="border-t border-terminal-dim/50 pt-2 mt-2">
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
      className={`
        w-10 h-5 rounded-full transition-colors relative
        ${enabled ? 'bg-terminal-text' : 'bg-terminal-dim/30'}
      `}
    >
      <span
        className={`
          absolute top-0.5 w-4 h-4 rounded-full transition-transform
          ${enabled ? 'left-5 bg-black' : 'left-0.5 bg-terminal-dim'}
        `}
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
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Update count periodically
    const updateCount = () => {
      setUnreadCount(notificationServiceV2.getUnreadCount());
    };
    
    updateCount();
    const interval = setInterval(updateCount, 5000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <button
      onClick={onClick}
      className="relative p-2 hover:bg-terminal-dim/20 transition-colors"
      title="Notifications"
    >
      <Bell size={20} />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-terminal-text text-black text-xs font-bold rounded-full flex items-center justify-center">
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
    case NotificationType.DIRECT_MESSAGE:
      return MessageCircle;
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
    case NotificationType.DIRECT_MESSAGE:
      return 'DMs';
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
  const fromName = notification.fromDisplayName || 
    notification.fromPubkey?.slice(0, 8) || 
    'Someone';

  switch (notification.type) {
    case NotificationType.MENTION:
      return `${fromName} mentioned you`;
    case NotificationType.REPLY:
      return `${fromName} replied to your post`;
    case NotificationType.FOLLOW:
      return `${fromName} started following you`;
    case NotificationType.DIRECT_MESSAGE:
      return `New message from ${fromName}`;
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
