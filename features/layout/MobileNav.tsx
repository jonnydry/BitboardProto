import React, { useState, useCallback } from 'react';
import { Home, PlusSquare, Bookmark, Bell, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { ViewMode } from '../../types';
import { useUIStore } from '../../stores/uiStore';
import { useUserStore } from '../../stores/userStore';
import { useAppNavigationHandlers } from './useAppNavigationHandlers';
import { useNotificationUnreadCount } from '../../hooks/useNotificationUnreadCount';

export const MobileNav = React.memo(function MobileNav() {
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const bookmarkedCount = useUIStore((s) => s.bookmarkedIds?.length ?? 0);
  const identity = useUserStore((s) => s.userState.identity);
  const { navigateToBoard } = useAppNavigationHandlers();

  const unreadCount = useNotificationUnreadCount();
  const [lastHomeTap, setLastHomeTap] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Double-tap on HOME to scroll to top
  const handleHomeTap = useCallback(() => {
    const now = Date.now();
    if (viewMode === ViewMode.FEED && now - lastHomeTap < 300) {
      // Double tap detected - scroll to top with animation
      setIsRefreshing(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Briefly show refreshing animation
      setTimeout(() => setIsRefreshing(false), 500);
    } else {
      navigateToBoard(null);
    }
    setLastHomeTap(now);
  }, [viewMode, lastHomeTap, navigateToBoard]);

  const navItems = [
    {
      id: 'home',
      icon: isRefreshing ? RefreshCw : Home,
      label: 'HOME',
      isActive: viewMode === ViewMode.FEED,
      onClick: handleHomeTap,
      badge: null,
      isRefreshing,
    },
    {
      id: 'create',
      icon: PlusSquare,
      label: 'NEW',
      isActive: viewMode === ViewMode.CREATE,
      onClick: () => setViewMode(ViewMode.CREATE),
      badge: null,
    },
    {
      id: 'bookmarks',
      icon: Bookmark,
      label: 'SAVED',
      isActive: viewMode === ViewMode.BOOKMARKS,
      onClick: () => setViewMode(ViewMode.BOOKMARKS),
      badge: bookmarkedCount > 0 ? bookmarkedCount : null,
    },
    {
      id: 'notifications',
      icon: Bell,
      label: 'ALERTS',
      isActive: viewMode === ViewMode.NOTIFICATIONS,
      onClick: () => setViewMode(ViewMode.NOTIFICATIONS),
      badge: unreadCount > 0 ? unreadCount : null,
    },
    {
      id: 'identity',
      icon: identity ? Wifi : WifiOff,
      label: identity ? 'ID' : 'CONNECT',
      isActive: viewMode === ViewMode.IDENTITY,
      onClick: () => setViewMode(ViewMode.IDENTITY),
      badge: null,
    },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-terminal-dim/25 bg-terminal-bg/95 backdrop-blur-sm safe-area-bottom">
      <div className="flex items-stretch justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={item.onClick}
              className={`relative flex-1 flex flex-col items-center justify-center border-r border-terminal-dim/10 px-2 py-3 transition-colors last:border-r-0
                ${
                  item.isActive
                    ? 'bg-terminal-dim/10 text-terminal-text'
                    : 'text-terminal-dim active:bg-terminal-dim/5'
                }
              `}
              aria-label={item.label}
              aria-current={item.isActive ? 'page' : undefined}
            >
              <div className="relative">
                <Icon
                  size={22}
                  className={`transition-transform ${item.isActive ? 'drop-shadow-[0_0_4px_rgb(var(--color-terminal-text))]' : ''} ${(item as any).isRefreshing ? 'motion-safe:animate-spin' : ''}`}
                />
                {item.badge !== null && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-sm bg-terminal-alert px-1 text-2xs font-bold text-white motion-safe:animate-pulse">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span className="mt-1 font-mono text-2xs font-bold uppercase tracking-[0.12em]">
                {item.label}
              </span>
              {item.isActive && (
                <div className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 bg-terminal-text" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
});
