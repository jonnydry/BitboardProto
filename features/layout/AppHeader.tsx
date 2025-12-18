import React from 'react';
import { Bookmark, Wifi, WifiOff, Zap } from 'lucide-react';
import type { NostrIdentity, UserState } from '../../types';
import { ThemeId, ViewMode } from '../../types';

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

  return (
    <header className="w-full flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b-2 border-terminal-dim pb-4 gap-4 md:gap-6">
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
                  className="absolute inset-0 bg-terminal-text transition-transform duration-200 origin-left hover:scale-[3] hover:z-50"
                  style={{
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

      <nav className="flex gap-2 md:gap-3 lg:gap-4 text-xs md:text-sm lg:text-base flex-nowrap items-center overflow-x-auto">
        {/* User Bit Balance Display */}
        <div 
          className="flex items-center gap-1.5 md:gap-2 px-1.5 md:px-2 py-1 border border-terminal-dim/50 bg-terminal-dim/5 whitespace-nowrap shrink-0"
          title="Your Bit Balance (Influence)"
        >
          <Zap size={12} className={`shrink-0 ${userState.bits === 0 ? "text-terminal-alert" : "text-terminal-text"}`} />
          <span className="font-mono font-bold text-xs md:text-sm">
            {userState.bits}/{userState.maxBits}
          </span>
        </div>

        <button
          onClick={onNavigateGlobal}
          className={`uppercase hover:underline whitespace-nowrap ${viewMode === ViewMode.FEED && activeBoardId === null ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
        >
          [ Global_Feed ]
        </button>
        <button
          onClick={() => onSetViewMode(ViewMode.CREATE)}
          className={`uppercase hover:underline whitespace-nowrap ${viewMode === ViewMode.CREATE ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
        >
          [ New_Bit ]
        </button>
        <button
          onClick={() => onSetViewMode(ViewMode.BOOKMARKS)}
          className={`uppercase hover:underline flex items-center gap-1 whitespace-nowrap ${viewMode === ViewMode.BOOKMARKS ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
        >
          <Bookmark size={12} className="shrink-0" />
          [ Saved{bookmarkedCount > 0 ? ` (${bookmarkedCount})` : ''} ]
        </button>
        <button
          onClick={() => onSetViewMode(ViewMode.IDENTITY)}
          className={`uppercase hover:underline flex items-center gap-1 whitespace-nowrap ${viewMode === ViewMode.IDENTITY ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
        >
          {identity ? <Wifi size={12} className="shrink-0" /> : <WifiOff size={12} className="shrink-0" />}
          [ {identity ? 'IDENTITY' : 'CONNECT'} ]
        </button>
        <button
          onClick={() => onSetViewMode(ViewMode.RELAYS)}
          className={`uppercase hover:underline whitespace-nowrap ${viewMode === ViewMode.RELAYS ? 'font-bold text-terminal-text' : 'text-terminal-dim'}`}
        >
          [ RELAYS ]
        </button>
      </nav>
    </header>
  );
}

