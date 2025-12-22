import React, { useState, useEffect } from 'react';
import { Bookmark, Wifi, WifiOff, Zap, Bell, Globe, Plus, Menu } from 'lucide-react';
import type { NostrIdentity, UserState } from '../../types';
import { ThemeId, ViewMode } from '../../types';
import { notificationService } from '../../services/notificationService';
import { NotificationCenter } from '../../components/NotificationCenter';

export function AppHeader(props: {
  theme: ThemeId;
  isNostrConnected: boolean;
  viewMode: ViewMode;
  activeBoardId: string | null;
  bookmarkedCount: number;
  identity?: NostrIdentity;
  userState: UserState;
  onNavigateGlobal: () => void;
  onSetViewMode: (mode: ViewMode) => void;
  onOpenDrawer?: () => void;
}) {
  const {
    theme,
    viewMode,
    activeBoardId,
    bookmarkedCount,
    identity,
    userState,
    onNavigateGlobal,
    onSetViewMode,
    onOpenDrawer,
  } = props;

  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    // Subscribe to notification changes
    const unsubscribe = notificationService.subscribe(() => {
      setUnreadCount(notificationService.getUnreadCount());
    });

    // Get initial count
    setUnreadCount(notificationService.getUnreadCount());

    return unsubscribe;
  }, []);

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
          onClick={onNavigateGlobal}
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
                  background: "linear-gradient(135deg, rgb(var(--color-terminal-text)) 40%, rgb(var(--color-terminal-dim)) 60%)",
                  maskImage: "url('/assets/bitboard-logo.png?v=3')",
                  WebkitMaskImage: "url('/assets/bitboard-logo.png?v=3')",
                  maskSize: "contain",
                  WebkitMaskSize: "contain",
                  maskRepeat: "no-repeat",
                  WebkitMaskRepeat: "no-repeat",
                  maskPosition: "left center",
                  WebkitMaskPosition: "left center"
                }}
              />
            </div>
          )}
          <span className="font-terminal text-xl tracking-wider">BitBoard</span>
        </button>

        {/* Mobile Status Indicators */}
        <div className="flex items-center gap-2 pr-1">
          <div className={`w-2 h-2 rounded-full ${props.isNostrConnected ? 'bg-terminal-text animate-pulse' : 'bg-terminal-alert'}`} />
          <div className="flex items-center gap-1 text-xs">
            <Zap size={12} className={userState.bits === 0 ? "text-terminal-alert" : "text-terminal-text"} />
            <span className="font-mono font-bold">{userState.bits}</span>
          </div>
        </div>
      </div>

      {/* Desktop Header (hidden on mobile) */}
      <button
        type="button"
        className="hidden md:flex items-center gap-2 cursor-pointer hover:text-white transition-colors text-left shrink-0"
        onClick={onNavigateGlobal}
        aria-label="Go to global feed"
      >
        {theme === ThemeId.BITBORING ? (
          <div className="flex flex-col">
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight leading-none">BitBoring</h1>
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
                    background: "linear-gradient(135deg, rgb(var(--color-terminal-text)) 40%, rgb(var(--color-terminal-dim)) 60%)",
                    maskImage: "url('/assets/bitboard-logo.png?v=3')",
                    WebkitMaskImage: "url('/assets/bitboard-logo.png?v=3')",
                    maskSize: "contain",
                    WebkitMaskSize: "contain",
                    maskRepeat: "no-repeat",
                    WebkitMaskRepeat: "no-repeat",
                    maskPosition: "left center",
                    WebkitMaskPosition: "left center"
                  }}
                />
              </div>
            )}
            <div className="flex flex-col">
              <h1 className="text-2xl lg:text-4xl font-terminal tracking-wider leading-none">BitBoard</h1>
              <span className="text-[10px] lg:text-xs text-terminal-dim tracking-[0.15em] lg:tracking-[0.2em]">
                DECENTRALIZED SOCIAL NEWS
              </span>
            </div>
          </>
        )}
      </button>

      {/* Desktop Navigation (hidden on mobile) */}
      <nav className="hidden md:flex gap-2 lg:gap-4 text-xs lg:text-sm items-center flex-wrap">
        {/* User Bit Balance Display */}
        <div 
          className="flex items-center gap-1 lg:gap-2 px-1.5 lg:px-2 py-1 border border-terminal-dim/50 bg-terminal-dim/5 shrink-0"
          title="Your Bit Balance (Influence)"
        >
          <Zap size={12} className={userState.bits === 0 ? "text-terminal-alert" : "text-terminal-text"} />
          <span className="font-mono font-bold text-[11px] lg:text-sm">
            {userState.bits}/{userState.maxBits}
          </span>
        </div>

        <button
          onClick={onNavigateGlobal}
          className={`uppercase hover:underline flex items-center gap-1 whitespace-nowrap ${viewMode === ViewMode.FEED && activeBoardId === null ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
          title="Global Feed"
        >
          <Globe 
            size={12} 
            style={{ color: 'rgb(var(--color-terminal-text))' }}
          />
          <span className="hidden lg:inline">[ Global_Feed ]</span>
          <span className="lg:hidden">FEED</span>
        </button>
        <button
          onClick={() => onSetViewMode(ViewMode.CREATE)}
          className={`uppercase hover:underline flex items-center gap-1 whitespace-nowrap ${viewMode === ViewMode.CREATE ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
          title="Create New Bit"
        >
          <Plus 
            size={12} 
            style={{ color: 'rgb(var(--color-terminal-text))' }}
          />
          <span className="hidden lg:inline">[ New_Bit ]</span>
          <span className="lg:hidden">NEW</span>
        </button>
        <button
          onClick={() => onSetViewMode(ViewMode.BOOKMARKS)}
          className={`uppercase hover:underline flex items-center gap-1 whitespace-nowrap ${viewMode === ViewMode.BOOKMARKS ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
          title="Saved Posts"
        >
          <Bookmark size={12} style={{ color: 'rgb(var(--color-terminal-text))' }} />
          <span className="hidden lg:inline">[ Saved{bookmarkedCount > 0 ? ` (${bookmarkedCount})` : ''} ]</span>
          <span className="lg:hidden">{bookmarkedCount > 0 ? `(${bookmarkedCount})` : 'SAVED'}</span>
        </button>
        <button
          onClick={() => onSetViewMode(ViewMode.IDENTITY)}
          className={`uppercase hover:underline flex items-center gap-1 whitespace-nowrap ${viewMode === ViewMode.IDENTITY ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
          title={identity ? 'Identity Settings' : 'Connect Identity'}
        >
          {identity ? (
            <Wifi size={12} style={{ color: 'rgb(var(--color-terminal-text))' }} />
          ) : (
            <WifiOff size={12} style={{ color: 'rgb(var(--color-terminal-text))' }} />
          )}
          <span className="hidden lg:inline">[ {identity ? 'IDENTITY' : 'CONNECT'} ]</span>
          <span className="lg:hidden">{identity ? 'ID' : 'LINK'}</span>
        </button>
        <button
          onClick={() => setShowNotifications(true)}
          className={`uppercase hover:underline flex items-center gap-1 whitespace-nowrap ${showNotifications ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
          title="Notifications"
        >
          <Bell size={12} style={{ color: 'rgb(var(--color-terminal-text))' }} />
          <span className="hidden lg:inline">[ ALERTS{unreadCount > 0 ? ` (${unreadCount})` : ''} ]</span>
          <span className="lg:hidden">{unreadCount > 0 ? `(${unreadCount})` : '!'}</span>
        </button>
        <button
          onClick={() => onSetViewMode(ViewMode.RELAYS)}
          className={`uppercase hover:underline flex items-center gap-1 whitespace-nowrap ${viewMode === ViewMode.RELAYS ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
          title={props.isNostrConnected ? "Relays Connected" : "Relays Disconnected"}
        >
          {props.isNostrConnected ? (
            <svg 
              width="24" 
              height="12" 
              viewBox="0 0 32 12" 
              className="shrink-0"
              style={{ color: 'rgb(var(--color-terminal-text))' }}
            >
              <rect x="0" y="8" width="2" height="4" fill="currentColor">
                <animate attributeName="height" values="4;2;4" dur="0.6s" repeatCount="indefinite" />
                <animate attributeName="y" values="8;10;8" dur="0.6s" repeatCount="indefinite" />
              </rect>
              <rect x="4" y="6" width="2" height="6" fill="currentColor">
                <animate attributeName="height" values="6;3;6" dur="0.8s" repeatCount="indefinite" />
                <animate attributeName="y" values="6;9;6" dur="0.8s" repeatCount="indefinite" />
              </rect>
              <rect x="8" y="4" width="2" height="8" fill="currentColor">
                <animate attributeName="height" values="8;4;8" dur="0.7s" repeatCount="indefinite" />
                <animate attributeName="y" values="4;8;4" dur="0.7s" repeatCount="indefinite" />
              </rect>
              <rect x="12" y="5" width="2" height="7" fill="currentColor">
                <animate attributeName="height" values="7;3;7" dur="0.65s" repeatCount="indefinite" />
                <animate attributeName="y" values="5;9;5" dur="0.65s" repeatCount="indefinite" />
              </rect>
              <rect x="16" y="7" width="2" height="5" fill="currentColor">
                <animate attributeName="height" values="5;2;5" dur="0.75s" repeatCount="indefinite" />
                <animate attributeName="y" values="7;10;7" dur="0.75s" repeatCount="indefinite" />
              </rect>
              <rect x="20" y="3" width="2" height="9" fill="currentColor">
                <animate attributeName="height" values="9;5;9" dur="0.85s" repeatCount="indefinite" />
                <animate attributeName="y" values="3;7;3" dur="0.85s" repeatCount="indefinite" />
              </rect>
              <rect x="24" y="6" width="2" height="6" fill="currentColor">
                <animate attributeName="height" values="6;3;6" dur="0.7s" repeatCount="indefinite" />
                <animate attributeName="y" values="6;9;6" dur="0.7s" repeatCount="indefinite" />
              </rect>
              <rect x="28" y="9" width="2" height="3" fill="currentColor">
                <animate attributeName="height" values="3;1;3" dur="0.6s" repeatCount="indefinite" />
                <animate attributeName="y" values="9;11;9" dur="0.6s" repeatCount="indefinite" />
              </rect>
            </svg>
          ) : (
            <svg 
              width="24" 
              height="12" 
              viewBox="0 0 32 12" 
              className="text-terminal-alert animate-pulse shrink-0"
              style={{ color: 'rgb(var(--color-terminal-alert))' }}
            >
              <rect x="0" y="10" width="2" height="2" fill="currentColor" />
              <rect x="4" y="10" width="2" height="2" fill="currentColor" />
              <rect x="8" y="10" width="2" height="2" fill="currentColor" />
              <rect x="12" y="10" width="2" height="2" fill="currentColor" />
              <rect x="16" y="10" width="2" height="2" fill="currentColor" />
              <rect x="20" y="10" width="2" height="2" fill="currentColor" />
              <rect x="24" y="10" width="2" height="2" fill="currentColor" />
              <rect x="28" y="10" width="2" height="2" fill="currentColor" />
            </svg>
          )}
          <span className="hidden lg:inline">RELAYS</span>
        </button>
      </nav>

      {/* Notification Center Modal */}
      {showNotifications && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <NotificationCenter onClose={() => setShowNotifications(false)} />
        </div>
      )}
    </header>
  );
}
