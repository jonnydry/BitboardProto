import React, { useState, useEffect } from 'react';
import { Home, PlusSquare, Bookmark, Bell, Wifi, WifiOff } from 'lucide-react';
import { ViewMode } from '../../types';
import type { NostrIdentity } from '../../types';
import { notificationService } from '../../services/notificationService';

interface MobileNavProps {
  viewMode: ViewMode;
  onSetViewMode: (mode: ViewMode) => void;
  onNavigateGlobal: () => void;
  identity?: NostrIdentity;
  bookmarkedCount: number;
}

export function MobileNav({
  viewMode,
  onSetViewMode,
  onNavigateGlobal,
  identity,
  bookmarkedCount,
}: MobileNavProps) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const unsubscribe = notificationService.subscribe(() => {
      setUnreadCount(notificationService.getUnreadCount());
    });
    setUnreadCount(notificationService.getUnreadCount());
    return unsubscribe;
  }, []);

  const navItems = [
    {
      id: 'home',
      icon: Home,
      label: 'HOME',
      isActive: viewMode === ViewMode.FEED,
      onClick: onNavigateGlobal,
      badge: null,
    },
    {
      id: 'create',
      icon: PlusSquare,
      label: 'NEW',
      isActive: viewMode === ViewMode.CREATE,
      onClick: () => onSetViewMode(ViewMode.CREATE),
      badge: null,
    },
    {
      id: 'bookmarks',
      icon: Bookmark,
      label: 'SAVED',
      isActive: viewMode === ViewMode.BOOKMARKS,
      onClick: () => onSetViewMode(ViewMode.BOOKMARKS),
      badge: bookmarkedCount > 0 ? bookmarkedCount : null,
    },
    {
      id: 'notifications',
      icon: Bell,
      label: 'ALERTS',
      isActive: viewMode === ViewMode.NOTIFICATIONS,
      onClick: () => onSetViewMode(ViewMode.NOTIFICATIONS),
      badge: unreadCount > 0 ? unreadCount : null,
    },
    {
      id: 'identity',
      icon: identity ? Wifi : WifiOff,
      label: identity ? 'ID' : 'CONNECT',
      isActive: viewMode === ViewMode.IDENTITY,
      onClick: () => onSetViewMode(ViewMode.IDENTITY),
      badge: null,
    },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-terminal-bg border-t-2 border-terminal-dim safe-area-bottom">
      <div className="flex items-stretch justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={item.onClick}
              className={`flex-1 flex flex-col items-center justify-center py-3 px-2 transition-colors relative
                ${item.isActive 
                  ? 'text-terminal-text bg-terminal-dim/20' 
                  : 'text-terminal-dim active:bg-terminal-dim/10'
                }
              `}
              aria-label={item.label}
              aria-current={item.isActive ? 'page' : undefined}
            >
              <div className="relative">
                <Icon 
                  size={22} 
                  className={item.isActive ? 'drop-shadow-[0_0_4px_rgb(var(--color-terminal-text))]' : ''} 
                />
                {item.badge !== null && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold bg-terminal-alert text-white rounded-sm">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span className="text-[9px] mt-1 font-bold tracking-wider uppercase">
                {item.label}
              </span>
              {item.isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-terminal-text" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

