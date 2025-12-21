import React, { useEffect, useRef } from 'react';
import { X, Globe, Bookmark, Bell, Wifi, WifiOff, Settings, MapPin, Zap } from 'lucide-react';
import { ViewMode } from '../../types';
import type { NostrIdentity, UserState } from '../../types';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  viewMode: ViewMode;
  onSetViewMode: (mode: ViewMode) => void;
  onNavigateGlobal: () => void;
  identity?: NostrIdentity;
  userState: UserState;
  bookmarkedCount: number;
  isNostrConnected: boolean;
  children?: React.ReactNode;
}

export function MobileDrawer({
  isOpen,
  onClose,
  viewMode,
  onSetViewMode,
  onNavigateGlobal,
  identity,
  userState,
  bookmarkedCount,
  isNostrConnected,
  children,
}: MobileDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

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

  // Focus trap
  useEffect(() => {
    if (isOpen && drawerRef.current) {
      drawerRef.current.focus();
    }
  }, [isOpen]);

  const handleNavClick = (action: () => void) => {
    action();
    onClose();
  };

  const navLinks = [
    {
      id: 'global',
      icon: Globe,
      label: 'GLOBAL_FEED',
      isActive: viewMode === ViewMode.FEED,
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
      label: 'NOTIFICATIONS',
      isActive: viewMode === ViewMode.NOTIFICATIONS,
      onClick: () => handleNavClick(() => onSetViewMode(ViewMode.NOTIFICATIONS)),
    },
    {
      id: 'location',
      icon: MapPin,
      label: 'SCAN_NEARBY',
      isActive: viewMode === ViewMode.LOCATION,
      onClick: () => handleNavClick(() => onSetViewMode(ViewMode.LOCATION)),
    },
    {
      id: 'identity',
      icon: identity ? Wifi : WifiOff,
      label: identity ? 'IDENTITY' : 'CONNECT',
      isActive: viewMode === ViewMode.IDENTITY,
      onClick: () => handleNavClick(() => onSetViewMode(ViewMode.IDENTITY)),
    },
    {
      id: 'relays',
      icon: Settings,
      label: 'RELAYS',
      isActive: viewMode === ViewMode.RELAYS,
      onClick: () => handleNavClick(() => onSetViewMode(ViewMode.RELAYS)),
    },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className={`md:hidden fixed inset-0 z-50 bg-black/70 transition-opacity duration-200 ${
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
        className={`md:hidden fixed top-0 left-0 bottom-0 z-50 w-[280px] max-w-[85vw] bg-terminal-bg border-r-2 border-terminal-text transform transition-transform duration-200 ease-out overflow-y-auto ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-terminal-bg border-b border-terminal-dim p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-terminal-text font-bold text-lg font-terminal tracking-wider">
              BITBOARD
            </span>
            <div className={`w-2 h-2 rounded-full ${isNostrConnected ? 'bg-terminal-text animate-pulse' : 'bg-terminal-alert'}`} />
          </div>
          <button
            onClick={onClose}
            className="p-2 text-terminal-dim hover:text-terminal-text hover:bg-terminal-dim/20 transition-colors"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* User Status */}
        <div className="p-4 border-b border-terminal-dim/30">
          <div className="flex items-center gap-3 mb-2">
            <Zap size={16} className={userState.bits === 0 ? 'text-terminal-alert' : 'text-terminal-text'} />
            <span className="font-mono text-sm">
              <span className="text-terminal-dim">BITS:</span>{' '}
              <span className="font-bold">{userState.bits}/{userState.maxBits}</span>
            </span>
          </div>
          {identity && (
            <div className="text-[10px] text-terminal-dim truncate">
              KEY: {identity.npub.slice(0, 20)}...
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="p-2">
          <ul className="space-y-1">
            {navLinks.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <button
                    onClick={item.onClick}
                    className={`w-full flex items-center gap-3 px-3 py-3 text-sm uppercase tracking-wider transition-colors ${
                      item.isActive
                        ? 'bg-terminal-text text-terminal-bg font-bold'
                        : 'text-terminal-dim hover:text-terminal-text hover:bg-terminal-dim/10'
                    }`}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Sidebar Content (passed as children) */}
        {children && (
          <div className="p-4 border-t border-terminal-dim/30">
            {children}
          </div>
        )}

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-terminal-dim/30 bg-terminal-bg text-center">
          <span className="text-[10px] text-terminal-dim uppercase tracking-wider">
            NOSTR PROTOCOL V3.0
          </span>
        </div>
      </div>
    </>
  );
}

