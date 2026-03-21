import React, { useState, useEffect, useLayoutEffect, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Zap, Menu, Search } from 'lucide-react';

const AdvancedSearch = lazy(() =>
  import('../../components/AdvancedSearch').then((m) => ({ default: m.AdvancedSearch })),
);
import { ThemeId, ViewMode } from '../../types';
import { notificationService } from '../../services/notificationService';
import { profileService } from '../../services/profileService';
import { NotificationCenterV2 } from '../../components/NotificationCenterV2';
import { InlineNetworkStatus, NetworkIndicator } from '../../components/NetworkIndicator';
import { BitsExplanation } from '../../components/BitsExplanation';
import { useUIStore } from '../../stores/uiStore';
import { useUserStore } from '../../stores/userStore';
import { useBoardStore } from '../../stores/boardStore';
import { useAppNavigationHandlers } from './useAppNavigationHandlers';

interface AppHeaderProps {
  onOpenDrawer?: () => void;
  /** md+: opens the desktop nav drawer. */
  onOpenDesktopNav?: () => void;
}

export const AppHeader = React.memo(function AppHeader({
  onOpenDrawer,
  onOpenDesktopNav,
}: AppHeaderProps) {
  const theme = useUIStore((s) => s.theme);
  const isNostrConnected = useUIStore((s) => s.isNostrConnected);
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const showSearch = useUIStore((s) => s.showSearch);
  const setShowSearch = useUIStore((s) => s.setShowSearch);
  const bookmarkedCount = useUIStore((s) => s.bookmarkedIds?.length ?? 0);
  const activeBoardId = useBoardStore((s) => s.activeBoardId);
  const identity = useUserStore((s) => s.userState.identity);
  const userState = useUserStore((s) => s.userState);
  const setProfileUser = useUIStore((s) => s.setProfileUser);
  const { navigateToBoard } = useAppNavigationHandlers();

  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showBitsPanel, setShowBitsPanel] = useState(false);
  const bitsSentinelRef = useRef<HTMLDivElement>(null);
  const bitsBarMeasureRef = useRef<HTMLDivElement>(null);
  const [bitsBarPinned, setBitsBarPinned] = useState(false);
  const [bitsBarHeight, setBitsBarHeight] = useState(0);

  useLayoutEffect(() => {
    const el = bitsBarMeasureRef.current;
    if (!el) return;
    const syncHeight = () => setBitsBarHeight(el.getBoundingClientRect().height);
    syncHeight();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(syncHeight);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', syncHeight);
    return () => window.removeEventListener('resize', syncHeight);
  }, []);

  useEffect(() => {
    const updatePinned = () => {
      const s = bitsSentinelRef.current;
      if (!s) return;
      setBitsBarPinned(s.getBoundingClientRect().top < 0);
    };
    window.addEventListener('scroll', updatePinned, { passive: true });
    window.addEventListener('resize', updatePinned);
    updatePinned();
    return () => {
      window.removeEventListener('scroll', updatePinned);
      window.removeEventListener('resize', updatePinned);
    };
  }, []);
  const ownProfile = identity ? profileService.getCachedProfileSync(identity.pubkey) : null;
  const identityDisplayName =
    ownProfile?.display_name ||
    ownProfile?.name ||
    identity?.displayName ||
    (identity ? `${identity.npub.slice(0, 10)}...` : 'CONNECT');
  const isGlobalFeedActive = viewMode === ViewMode.FEED && activeBoardId === null;
  const desktopActionClass = (active = false, emphasis = false) =>
    `flex items-center gap-2 border px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] transition-colors lg:text-sm ${
      active
        ? 'border-terminal-text bg-terminal-dim/10 text-terminal-text'
        : emphasis
          ? 'border-terminal-dim/40 text-terminal-text hover:border-terminal-text/45 hover:bg-terminal-dim/10'
          : 'border-transparent text-terminal-dim hover:border-terminal-dim/40 hover:text-terminal-text'
    }`;

  useEffect(() => {
    const unsubscribe = notificationService.subscribe(() => {
      setUnreadCount(notificationService.getUnreadCount());
    });

    setUnreadCount(notificationService.getUnreadCount());

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

  // Close bits panel on Escape
  useEffect(() => {
    if (!showBitsPanel) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowBitsPanel(false);
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [showBitsPanel]);

  // Close search modal on Escape
  useEffect(() => {
    if (!showSearch) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSearch(false);
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showSearch, setShowSearch]);

  const handleSearchResultClick = (result: {
    type: string;
    authorPubkey: string;
    authorName?: string;
  }) => {
    setShowSearch(false);
    if (result.type === 'post' || result.type === 'comment') {
      setViewMode(ViewMode.SINGLE_BIT);
    } else {
      setProfileUser({
        username: result.authorName ?? result.authorPubkey.slice(0, 12),
        pubkey: result.authorPubkey,
      });
      setViewMode(ViewMode.USER_PROFILE);
    }
  };

  return (
    <header className="flex flex-col mb-4 md:mb-6 lg:mb-8 py-[5px] gap-2 md:gap-3 lg:gap-4">
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
              src="/assets/bitboard-patriot.png"
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
        </div>
      </div>

      {/* Desktop Header (hidden on mobile) */}
      <button
        type="button"
        className="hidden md:flex items-center gap-2 cursor-pointer text-left shrink-0 transition-colors hover:text-terminal-text"
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
                src="/assets/bitboard-patriot.png"
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
              <span className="text-2xs lg:text-xs text-terminal-dim tracking-[0.15em] lg:tracking-[0.2em]">
                DECENTRALIZED SOCIAL NEWS
              </span>
            </div>
          </>
        )}
      </button>

      {/* Desktop Navigation (hidden on mobile) */}
      <nav className="hidden md:flex flex-wrap items-center gap-x-2 gap-y-2 border border-terminal-dim/20 bg-terminal-bg/45 px-3 py-2 text-xs backdrop-blur-sm lg:gap-x-3 lg:text-sm">
        {onOpenDesktopNav && (
          <button
            type="button"
            onClick={onOpenDesktopNav}
            className={desktopActionClass(false, true)}
            aria-label="Open navigation drawer"
            title="Browse navigation"
          >
            <Menu size={18} strokeWidth={2} />
            <span>Browse</span>
          </button>
        )}
        <button
          onClick={() => navigateToBoard(null)}
          className={desktopActionClass(isGlobalFeedActive)}
          title="Global Feed"
        >
          <span>GLOBAL FEED</span>
        </button>
        <button
          onClick={() => setViewMode(ViewMode.CREATE)}
          className={desktopActionClass(viewMode === ViewMode.CREATE)}
          title="Create New Bit"
        >
          <span>NEW BIT</span>
        </button>
        <button
          type="button"
          onClick={() => setShowSearch(true)}
          className={desktopActionClass(showSearch)}
          title="Search"
        >
          <Search size={14} />
          <span className="hidden lg:inline">SEARCH</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode(ViewMode.BOOKMARKS)}
          className={desktopActionClass(viewMode === ViewMode.BOOKMARKS)}
          title="Saved Posts"
        >
          <span>SAVED{bookmarkedCount > 0 ? ` (${bookmarkedCount})` : ''}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowNotifications(true)}
          className={desktopActionClass(showNotifications)}
          title="Notifications"
        >
          <span>ALERTS{unreadCount > 0 ? ` (${unreadCount})` : ''}</span>
        </button>
        {identity && (
          <button
            type="button"
            onClick={() => setViewMode(ViewMode.DIRECT_MESSAGES)}
            className={desktopActionClass(viewMode === ViewMode.DIRECT_MESSAGES)}
            title="Direct Messages"
          >
            <span>DMs</span>
          </button>
        )}
        <NetworkIndicator compact />
        <div className="hidden xl:flex">
          <InlineNetworkStatus />
        </div>
        <button
          type="button"
          onClick={() => setViewMode(ViewMode.IDENTITY)}
          className={`flex items-center gap-2 border px-3 py-1.5 font-mono transition-colors ${
            viewMode === ViewMode.IDENTITY
              ? 'border-terminal-text bg-terminal-dim/10 text-terminal-text'
              : 'border-terminal-dim/40 text-terminal-text hover:border-terminal-text hover:bg-terminal-dim/10'
          }`}
          title={identity ? 'Identity Settings' : 'Connect Identity'}
        >
          {identity && ownProfile?.picture ? (
            <img
              src={ownProfile.picture}
              alt={identityDisplayName}
              className="h-5 w-5 rounded-full border border-terminal-dim/40 object-cover"
            />
          ) : identity ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-terminal-dim/40 bg-terminal-dim/10 text-2xs uppercase">
              {identityDisplayName.slice(0, 1)}
            </span>
          ) : null}
          {identityDisplayName}
        </button>
      </nav>

      {/* Full-width Bits Bar */}
      <div ref={bitsSentinelRef} className="h-px w-full shrink-0" aria-hidden />
      {bitsBarPinned && (
        <div
          className="w-full shrink-0"
          style={{ height: Math.max(bitsBarHeight, 40) }}
          aria-hidden
        />
      )}
      <div
        ref={bitsBarMeasureRef}
        className={`border-t-2 border-terminal-dim bg-terminal-bg/95 backdrop-blur-sm border-b border-terminal-dim/40 ${
          bitsBarPinned ? 'fixed top-0 left-0 right-0 z-[35]' : 'relative'
        }`}
      >
        <div className={bitsBarPinned ? 'max-w-[1174px] mx-auto px-3 md:px-6' : undefined}>
          <button
            type="button"
            onClick={() => setShowBitsPanel((p) => !p)}
            className="w-full flex items-center gap-3 md:gap-4 py-2 px-1 text-terminal-text hover:bg-terminal-dim/5 transition-colors"
            title="Bits — click to learn more"
          >
            <div className="flex items-center gap-2 shrink-0">
              <Zap
                size={14}
                className={userState.bits === 0 ? 'text-terminal-alert' : 'text-terminal-text'}
              />
              <span className="text-2xs md:text-xs uppercase tracking-wide text-terminal-dim hidden sm:inline">
                Bits available
              </span>
            </div>
            <div className="flex-1 h-2 md:h-3 overflow-hidden border border-terminal-dim/30 bg-terminal-bg/70 rounded">
              <div
                className={`h-full transition-all duration-300 ${userState.bits === 0 ? 'bg-terminal-alert' : 'bg-terminal-text'}`}
                style={{
                  width: `${Math.max(0, Math.min(100, (userState.bits / Math.max(1, userState.maxBits)) * 100))}%`,
                }}
              />
            </div>
            <div className="flex items-center gap-1 shrink-0 font-mono">
              <span
                className={`text-sm md:text-base font-bold ${userState.bits === 0 ? 'text-terminal-alert' : 'text-terminal-text'}`}
              >
                {userState.bits}
              </span>
              <span className="text-terminal-dim text-xs md:text-sm">/</span>
              <span className="text-terminal-dim text-xs md:text-sm">{userState.maxBits}</span>
            </div>
          </button>
        </div>

        {showBitsPanel &&
          createPortal(
            <div
              className="ui-overlay z-[100] flex items-center justify-center px-4 py-6 sm:py-10"
              role="presentation"
              onClick={() => setShowBitsPanel(false)}
            >
              <div
                className="ui-surface-modal w-full max-w-md max-h-[min(80vh,calc(100dvh-3rem))] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-4 py-3 border-b border-terminal-dim/30 flex items-start gap-3">
                  <Zap size={16} className="text-terminal-text shrink-0 mt-0.5" />
                  <p className="text-sm text-terminal-dim leading-relaxed">
                    <span className="text-terminal-text font-bold">Bit-weighted global feed:</span>{' '}
                    verified identities spend limited bits to push the best posts upward.
                  </p>
                </div>
                <div className="px-4 py-4 space-y-3">
                  <div className="text-2xs uppercase tracking-widest text-terminal-dim">
                    How bits work
                  </div>
                  <BitsExplanation size="desktop" />
                </div>
                <div className="px-4 py-3 border-t border-terminal-dim/30">
                  <button
                    type="button"
                    onClick={() => setShowBitsPanel(false)}
                    className="ui-button-secondary w-full px-4 py-2 text-xs"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}
      </div>

      {/* Search Modal */}
      {showSearch &&
        createPortal(
          <div className="ui-overlay z-[100] flex items-start justify-center px-4 pt-16 sm:pt-20">
            <div className="ui-surface-modal w-full max-w-2xl max-h-[min(80vh,calc(100dvh-4rem))] overflow-auto">
              <Suspense
                fallback={
                  <div className="p-8 text-center text-terminal-dim animate-pulse">LOADING...</div>
                }
              >
                <AdvancedSearch
                  onClose={() => setShowSearch(false)}
                  onResultClick={handleSearchResultClick}
                />
              </Suspense>
            </div>
          </div>,
          document.body,
        )}

      {/* Notification Center Modal */}
      {showNotifications && <NotificationCenterV2 onClose={() => setShowNotifications(false)} />}
    </header>
  );
});
