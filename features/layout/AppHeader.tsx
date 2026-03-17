import React, { useState, useEffect } from 'react';
import { Zap, Menu, Search as _Search } from 'lucide-react';
import { ThemeId, ViewMode } from '../../types';
import { notificationServiceV2 } from '../../services/notificationServiceV2';
import { profileService } from '../../services/profileService';
import { NotificationCenterV2 } from '../../components/NotificationCenterV2';
import { InlineNetworkStatus, NetworkIndicator } from '../../components/NetworkIndicator';
import { useUIStore } from '../../stores/uiStore';
import { useUserStore } from '../../stores/userStore';
import { useBoardStore } from '../../stores/boardStore';
import { useAppNavigationHandlers } from './useAppNavigationHandlers';

interface AppHeaderProps {
  onOpenDrawer?: () => void;
}

export function AppHeader({ onOpenDrawer }: AppHeaderProps) {
  const theme = useUIStore((s) => s.theme);
  const isNostrConnected = useUIStore((s) => s.isNostrConnected);
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const bookmarkedCount = useUIStore((s) => s.bookmarkedIds?.length ?? 0);
  const activeBoardId = useBoardStore((s) => s.activeBoardId);
  const identity = useUserStore((s) => s.userState.identity);
  const userState = useUserStore((s) => s.userState);
  const { navigateToBoard } = useAppNavigationHandlers();

  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const ownProfile = identity ? profileService.getCachedProfileSync(identity.pubkey) : null;
  const identityDisplayName =
    ownProfile?.display_name ||
    ownProfile?.name ||
    identity?.displayName ||
    (identity ? `${identity.npub.slice(0, 10)}...` : 'CONNECT');

  useEffect(() => {
    const unsubscribe = notificationServiceV2.subscribe(() => {
      setUnreadCount(notificationServiceV2.getUnreadCount());
    });

    setUnreadCount(notificationServiceV2.getUnreadCount());

    return unsubscribe;
  }, []);

  // Close notifications on Escape
  useEffect(() => {
    if (!showNotifications) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowNotifications(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showNotifications]);

  return (
    <header className="flex flex-col mb-4 md:mb-6 lg:mb-8 border-b-2 border-terminal-dim py-[5px] gap-2 md:gap-3 lg:gap-4">
      {/* Mobile Header Row */}
      <div className="flex items-center justify-between md:hidden">
        {/* Hamburger Menu Button */}
        <button
          type="button"
          onClick={onOpenDrawer}
          className="p-2 -ml-2 text-terminal-dim hover:text-terminal-text hover:bg-terminal-dim/10 transition-colors"
          aria-label="Open menu"
        >
          <Menu size={24} />
        </button>

        {/* Mobile Logo */}
        <button
          type="button"
          onClick={() => navigateToBoard(null)}
          className="flex items-center gap-2"
          aria-label="Go to global feed"
        >
          {theme === ThemeId.BITBORING ? (
            <span className="text-xl font-bold">BitBoring</span>
          ) : theme === ThemeId.PATRIOT ? (
            <img
              src="/assets/BitBoardTESTFINAL.png"
              alt="BitBoard Logo"
              className="h-8 w-auto object-contain"
            />
          ) : theme === ThemeId.AMBER ? (
            <img
              src="/assets/bitboard-logo.png?v=3"
              alt="BitBoard Logo"
              className="h-8 w-auto object-contain"
            />
          ) : (
            <div className="relative h-8 w-24">
              <img
                src="/assets/bitboard-logo.png?v=3"
                alt="BitBoard Logo"
                className="h-8 w-auto object-contain opacity-0 pointer-events-none"
                aria-hidden="true"
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(135deg, rgb(var(--color-terminal-text)) 40%, rgb(var(--color-terminal-dim)) 60%)',
                  maskImage: "url('/assets/bitboard-logo.png?v=3')",
                  WebkitMaskImage: "url('/assets/bitboard-logo.png?v=3')",
                  maskSize: 'contain',
                  WebkitMaskSize: 'contain',
                  maskRepeat: 'no-repeat',
                  WebkitMaskRepeat: 'no-repeat',
                  maskPosition: 'left center',
                  WebkitMaskPosition: 'left center',
                }}
              />
            </div>
          )}
          <span className="font-terminal text-xl tracking-wider">BitBoard</span>
        </button>

        {/* Mobile Status Indicators */}
        <div className="flex items-center gap-2 pr-1">
          <div
            className={`w-2 h-2 rounded-full ${isNostrConnected ? 'bg-terminal-text animate-pulse' : 'bg-terminal-alert'}`}
          />
          <div className="flex items-center gap-1 text-xs">
            <Zap
              size={12}
              className={userState.bits === 0 ? 'text-terminal-alert' : 'text-terminal-text'}
            />
            <span className="font-mono font-bold">{userState.bits}</span>
          </div>
        </div>
      </div>

      {/* Desktop Header (hidden on mobile) */}
      <button
        type="button"
        className="hidden md:flex items-center gap-2 cursor-pointer hover:text-white transition-colors text-left shrink-0"
        onClick={() => navigateToBoard(null)}
        aria-label="Go to global feed"
      >
        {theme === ThemeId.BITBORING ? (
          <div className="flex flex-col">
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight leading-none">
              BitBoring
            </h1>
            <span className="text-xs lg:text-sm text-terminal-dim">( -_-) zzz</span>
          </div>
        ) : (
          <>
            {theme === ThemeId.PATRIOT ? (
              <img
                src="/assets/BitBoardTESTFINAL.png"
                alt="BitBoard Logo"
                className="h-10 lg:h-16 w-auto object-contain transition-all duration-200 hover:brightness-125"
              />
            ) : theme === ThemeId.AMBER ? (
              <img
                src="/assets/bitboard-logo.png?v=3"
                alt="BitBoard Logo"
                className="h-10 lg:h-16 w-auto object-contain transition-all duration-200 hover:brightness-125"
              />
            ) : (
              <div className="relative">
                <img
                  src="/assets/bitboard-logo.png?v=3"
                  alt="BitBoard Logo"
                  className="h-10 lg:h-16 w-auto object-contain opacity-0 pointer-events-none"
                  aria-hidden="true"
                />
                <div
                  className="absolute inset-0 transition-all duration-200 hover:brightness-125"
                  style={{
                    background:
                      'linear-gradient(135deg, rgb(var(--color-terminal-text)) 40%, rgb(var(--color-terminal-dim)) 60%)',
                    maskImage: "url('/assets/bitboard-logo.png?v=3')",
                    WebkitMaskImage: "url('/assets/bitboard-logo.png?v=3')",
                    maskSize: 'contain',
                    WebkitMaskSize: 'contain',
                    maskRepeat: 'no-repeat',
                    WebkitMaskRepeat: 'no-repeat',
                    maskPosition: 'left center',
                    WebkitMaskPosition: 'left center',
                  }}
                />
              </div>
            )}
            <div className="flex flex-col">
              <h1 className="text-2xl lg:text-4xl font-terminal tracking-wider leading-none">
                BitBoard
              </h1>
              <span className="text-[10px] lg:text-xs text-terminal-dim tracking-[0.15em] lg:tracking-[0.2em]">
                DECENTRALIZED SOCIAL NEWS
              </span>
            </div>
          </>
        )}
      </button>

      {/* Desktop Navigation (hidden on mobile) */}
      <nav className="hidden md:flex items-center justify-between gap-6 text-xs lg:text-sm">
        <div className="flex items-center gap-2 lg:gap-4 flex-wrap">
          <button
            onClick={() => navigateToBoard(null)}
            className={`uppercase border px-3 py-1.5 tracking-wider whitespace-nowrap transition-colors ${viewMode === ViewMode.FEED && activeBoardId === null ? 'border-terminal-text text-terminal-text bg-terminal-dim/10' : 'border-transparent text-terminal-dim hover:border-terminal-dim/40 hover:text-terminal-text'}`}
            title="Global Feed"
          >
            <span>GLOBAL FEED</span>
          </button>
          <button
            onClick={() => setViewMode(ViewMode.CREATE)}
            className={`uppercase border px-3 py-1.5 tracking-wider whitespace-nowrap transition-colors ${viewMode === ViewMode.CREATE ? 'border-terminal-text text-terminal-text bg-terminal-dim/10' : 'border-transparent text-terminal-dim hover:border-terminal-dim/40 hover:text-terminal-text'}`}
            title="Create New Bit"
          >
            <span>NEW BIT</span>
          </button>
          <button
            onClick={() => setViewMode(ViewMode.BOOKMARKS)}
            className={`uppercase border px-3 py-1.5 tracking-wider whitespace-nowrap transition-colors ${viewMode === ViewMode.BOOKMARKS ? 'border-terminal-text text-terminal-text bg-terminal-dim/10' : 'border-transparent text-terminal-dim hover:border-terminal-dim/40 hover:text-terminal-text'}`}
            title="Saved Posts"
          >
            <span>SAVED{bookmarkedCount > 0 ? ` (${bookmarkedCount})` : ''}</span>
          </button>
          <button
            onClick={() => setShowNotifications(true)}
            className={`uppercase border px-3 py-1.5 tracking-wider whitespace-nowrap transition-colors ${showNotifications ? 'border-terminal-text text-terminal-text bg-terminal-dim/10' : 'border-transparent text-terminal-dim hover:border-terminal-dim/40 hover:text-terminal-text'}`}
            title="Notifications"
          >
            <span>ALERTS{unreadCount > 0 ? ` (${unreadCount})` : ''}</span>
          </button>
          {identity && (
            <button
              onClick={() => setViewMode(ViewMode.DIRECT_MESSAGES)}
              className={`uppercase border px-3 py-1.5 tracking-wider whitespace-nowrap transition-colors ${viewMode === ViewMode.DIRECT_MESSAGES ? 'border-terminal-text text-terminal-text bg-terminal-dim/10' : 'border-transparent text-terminal-dim hover:border-terminal-dim/40 hover:text-terminal-text'}`}
              title="Direct Messages"
            >
              <span>DMs</span>
            </button>
          )}
          <button
            onClick={() => setViewMode(ViewMode.RELAYS)}
            className={`uppercase border px-3 py-1.5 tracking-wider whitespace-nowrap transition-colors ${viewMode === ViewMode.RELAYS ? 'border-terminal-text text-terminal-text bg-terminal-dim/10' : 'border-transparent text-terminal-dim hover:border-terminal-dim/40 hover:text-terminal-text'}`}
            title={isNostrConnected ? 'Relays Connected' : 'Relays Disconnected'}
          >
            <span>RELAYS</span>
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-3 shrink-0">
          <div
            className="flex items-center gap-3 border border-terminal-dim/50 bg-terminal-dim/5 px-3 py-1.5 font-mono text-terminal-text"
            title="Available voting bits"
          >
            <Zap
              size={12}
              className={userState.bits === 0 ? 'text-terminal-alert' : 'text-terminal-text'}
            />
            <div className="flex flex-col gap-1 min-w-[120px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wide text-terminal-dim">
                  Bits available
                </span>
                <span className="text-sm font-bold">
                  {userState.bits}/{userState.maxBits}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden border border-terminal-dim/30 bg-terminal-bg/70">
                <div
                  className={`h-full ${userState.bits === 0 ? 'bg-terminal-alert' : 'bg-terminal-text'}`}
                  style={{
                    width: `${Math.max(0, Math.min(100, (userState.bits / Math.max(1, userState.maxBits)) * 100))}%`,
                  }}
                />
              </div>
            </div>
          </div>
          <NetworkIndicator compact />
          <InlineNetworkStatus />
          <button
            type="button"
            onClick={() => setViewMode(ViewMode.IDENTITY)}
            className="flex items-center gap-2 border border-terminal-dim px-3 py-1.5 text-terminal-text hover:border-terminal-text hover:bg-terminal-dim/10 transition-colors font-mono"
            title={identity ? 'Identity Settings' : 'Connect Identity'}
          >
            {identity && ownProfile?.picture ? (
              <img
                src={ownProfile.picture}
                alt={identityDisplayName}
                className="h-5 w-5 rounded-full object-cover border border-terminal-dim/40"
              />
            ) : identity ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-terminal-dim/40 bg-terminal-dim/10 text-[10px] uppercase">
                {identityDisplayName.slice(0, 1)}
              </span>
            ) : null}
            {identityDisplayName}
          </button>
        </div>
      </nav>

      {/* Notification Center Modal */}
      {showNotifications && <NotificationCenterV2 onClose={() => setShowNotifications(false)} />}
    </header>
  );
}
