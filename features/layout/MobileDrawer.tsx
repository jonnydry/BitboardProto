import React, { useEffect, useRef } from 'react';
import {
  X,
  Globe,
  Bookmark,
  Bell,
  Compass,
  User,
  Settings,
  MapPin,
  Search,
  Key,
} from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { ViewMode } from '../../types';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  viewMode: ViewMode;
  activeBoardId: string | null;
  onSetViewMode: (mode: ViewMode) => void;
  onNavigateGlobal: () => void;
  identity?: { npub: string };
  userState?: { bits: number; maxBits: number };
  bookmarkedCount: number;
  isNostrConnected: boolean;
  children?: React.ReactNode;
}

export const MobileDrawer = React.memo(function MobileDrawer({
  isOpen,
  onClose,
  viewMode,
  activeBoardId,
  onSetViewMode,
  onNavigateGlobal,
  identity,
  userState: _userState,
  bookmarkedCount,
  isNostrConnected,
  children,
}: MobileDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const setShowSearch = useUIStore((s) => s.setShowSearch);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Focus the drawer and restore focus on close
  useEffect(() => {
    if (isOpen && drawerRef.current) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      drawerRef.current.focus();
      return;
    }

    previouslyFocusedRef.current?.focus();
    previouslyFocusedRef.current = null;
  }, [isOpen]);

  const handleNavClick = (action: () => void) => {
    action();
    onClose();
  };

  const navLinks = [
    {
      id: 'global',
      icon: Globe,
      label: 'Global Feed',
      isActive: viewMode === ViewMode.FEED && activeBoardId === null,
      onClick: () => handleNavClick(onNavigateGlobal),
    },
    {
      id: 'bookmarks',
      icon: Bookmark,
      label: `SAVED${bookmarkedCount > 0 ? ` (${bookmarkedCount})` : ''}`,
      isActive: viewMode === ViewMode.BOOKMARKS,
      onClick: () => handleNavClick(() => onSetViewMode(ViewMode.BOOKMARKS)),
    },
    {
      id: 'notifications',
      icon: Bell,
      label: 'Notifications',
      isActive: viewMode === ViewMode.NOTIFICATIONS,
      onClick: () => handleNavClick(() => onSetViewMode(ViewMode.NOTIFICATIONS)),
    },
    {
      id: 'discover-nostr',
      icon: Compass,
      label: 'Discover Nostr',
      isActive: viewMode === ViewMode.DISCOVER_NOSTR,
      onClick: () => handleNavClick(() => onSetViewMode(ViewMode.DISCOVER_NOSTR)),
    },
    {
      id: 'location',
      icon: MapPin,
      label: 'Scan Nearby',
      isActive: viewMode === ViewMode.LOCATION,
      onClick: () => handleNavClick(() => onSetViewMode(ViewMode.LOCATION)),
    },
    {
      id: 'identity',
      icon: identity ? User : Key,
      label: identity ? 'IDENTITY' : 'CONNECT',
      isActive: viewMode === ViewMode.IDENTITY,
      onClick: () => handleNavClick(() => onSetViewMode(ViewMode.IDENTITY)),
    },
    {
      id: 'search',
      icon: Search,
      label: 'SEARCH',
      isActive: false,
      onClick: () => handleNavClick(() => setShowSearch(true)),
    },
    {
      id: 'settings',
      icon: Settings,
      label: 'SETTINGS',
      isActive: viewMode === ViewMode.SETTINGS,
      onClick: () => handleNavClick(() => onSetViewMode(ViewMode.SETTINGS)),
    },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className={`md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`md:hidden fixed top-0 left-0 bottom-0 z-50 flex w-[280px] max-w-[85vw] flex-col border-r border-terminal-dim/35 bg-terminal-bg/95 transform transition-transform duration-200 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-terminal-dim/15 bg-terminal-bg/95 p-4">
          <div className="flex items-center gap-2">
            <span className="font-terminal text-lg tracking-wider text-terminal-text">
              BitBoard
            </span>
            <div
              className={`w-2 h-2 rounded-full ${isNostrConnected ? 'bg-terminal-text animate-pulse' : 'bg-terminal-alert'}`}
            />
          </div>
          <button
            onClick={onClose}
            className="p-2 text-terminal-dim hover:text-terminal-text hover:bg-terminal-dim/20 transition-colors"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Navigation Links */}
          <nav className="p-2">
            <ul className="space-y-1.5">
              {navLinks.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <button
                      onClick={item.onClick}
                      className={`flex w-full items-center gap-3 border px-3 py-3 text-left text-sm transition-colors ${
                        item.isActive
                          ? 'border-terminal-dim/60 bg-terminal-dim/10 text-terminal-text'
                          : 'border-transparent text-terminal-dim hover:border-terminal-dim/30 hover:bg-terminal-dim/5 hover:text-terminal-text'
                      }`}
                    >
                      <Icon size={18} />
                      <span className="font-mono uppercase tracking-[0.12em]">{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Sidebar Content (passed as children) */}
          {children && <div className="p-4 border-t border-terminal-dim/30">{children}</div>}
        </div>

        {/* Footer */}
        <div className="mt-auto border-t border-terminal-dim/20 bg-terminal-bg/95 p-4 text-center">
          <span className="text-2xs text-terminal-dim uppercase tracking-wider">
            NOSTR PROTOCOL V3.0
          </span>
        </div>
      </div>
    </>
  );
});
