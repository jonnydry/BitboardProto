import React, { useState, useEffect } from 'react';
import { Bookmark, Wifi, WifiOff, Zap, Bell, Globe, Plus } from 'lucide-react';
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
    <header className="flex flex-col mb-8 border-b-2 border-terminal-dim py-[5px] gap-4">
      <button
        type="button"
        className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors text-left"
        onClick={onNavigateGlobal}
        aria-label="Go to global feed"
      >
        {theme === ThemeId.BITBORING ? (
          <div className="flex flex-col">
            <h1 className="text-3xl font-bold tracking-tight leading-none">BitBoring</h1>
            <span className="text-sm text-terminal-dim">( -_-) zzz</span>
          </div>
        ) : (
          <>
            {theme === ThemeId.PATRIOT ? (
              <img
                src="/assets/BitBoardTESTFINAL.png"
                alt="BitBoard Logo"
                className="h-16 w-auto object-contain transition-transform duration-200 origin-left hover:scale-[3] hover:z-50 relative"
              />
            ) : theme === ThemeId.AMBER ? (
              <img
                src="/assets/bitboard-logo.png?v=3"
                alt="BitBoard Logo"
                className="h-16 w-auto object-contain transition-transform duration-200 origin-left hover:scale-[3] hover:z-50 relative"
              />
            ) : (
              <div className="relative">
                <img
                  src="/assets/bitboard-logo.png?v=3"
                  alt="BitBoard Logo"
                  className="h-16 w-auto object-contain opacity-0 pointer-events-none"
                  aria-hidden="true"
                />
                <div
                  className="absolute inset-0 transition-transform duration-200 origin-left hover:scale-[3] hover:z-50"
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
              <h1 className="text-4xl font-terminal tracking-wider leading-none">BitBoard</h1>
              <span className="text-xs text-terminal-dim tracking-[0.2em]">
                DECENTRALIZED SOCIAL NEWS
              </span>
            </div>
          </>
        )}
      </button>

      <nav className="flex gap-4 text-sm md:text-base items-center flex-nowrap overflow-x-auto">
        {/* User Bit Balance Display */}
        <div 
          className="flex items-center gap-2 px-2 py-1 border border-terminal-dim/50 bg-terminal-dim/5"
          title="Your Bit Balance (Influence)"
        >
          <Zap size={14} className={userState.bits === 0 ? "text-terminal-alert" : "text-terminal-text"} />
          <span className="font-mono font-bold">
            {userState.bits}/{userState.maxBits}
          </span>
        </div>

        <button
          onClick={onNavigateGlobal}
          className={`uppercase hover:underline flex items-center gap-1 ${viewMode === ViewMode.FEED && activeBoardId === null ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
        >
          <Globe 
            size={12} 
            style={{ color: 'rgb(var(--color-terminal-text))' }}
          />
          [ Global_Feed ]
        </button>
        <button
          onClick={() => onSetViewMode(ViewMode.CREATE)}
          className={`uppercase hover:underline flex items-center gap-1 ${viewMode === ViewMode.CREATE ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
        >
          <Plus 
            size={12} 
            style={{ color: 'rgb(var(--color-terminal-text))' }}
          />
          [ New_Bit ]
        </button>
        <button
          onClick={() => onSetViewMode(ViewMode.BOOKMARKS)}
          className={`uppercase hover:underline flex items-center gap-1 ${viewMode === ViewMode.BOOKMARKS ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
        >
          <Bookmark size={12} style={{ color: 'rgb(var(--color-terminal-text))' }} />
          [ Saved{bookmarkedCount > 0 ? ` (${bookmarkedCount})` : ''} ]
        </button>
        <button
          onClick={() => onSetViewMode(ViewMode.IDENTITY)}
          className={`uppercase hover:underline flex items-center gap-1 ${viewMode === ViewMode.IDENTITY ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
        >
          {identity ? (
            <Wifi size={12} style={{ color: 'rgb(var(--color-terminal-text))' }} />
          ) : (
            <WifiOff size={12} style={{ color: 'rgb(var(--color-terminal-text))' }} />
          )}
          [ {identity ? 'IDENTITY' : 'CONNECT'} ]
        </button>
        <button
          onClick={() => setShowNotifications(true)}
          className={`uppercase hover:underline flex items-center gap-1 ${showNotifications ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
          title="Notifications"
        >
          <Bell size={12} style={{ color: 'rgb(var(--color-terminal-text))' }} />
          [ NOTIFICATIONS{unreadCount > 0 ? ` (${unreadCount})` : ''} ]
        </button>
        <button
          onClick={() => onSetViewMode(ViewMode.RELAYS)}
          className={`uppercase hover:underline flex items-center gap-1 ${viewMode === ViewMode.RELAYS ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
          title={props.isNostrConnected ? "Relays Connected" : "Relays Disconnected"}
        >
          {props.isNostrConnected ? (
            <svg 
              width="32" 
              height="12" 
              viewBox="0 0 32 12" 
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
              width="32" 
              height="12" 
              viewBox="0 0 32 12" 
              className="text-terminal-alert animate-pulse"
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
          <span className="hidden md:inline">RELAYS</span>
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

