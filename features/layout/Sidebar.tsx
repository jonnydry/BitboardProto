import React from 'react';
import { HelpCircle, Hash, Lock, Globe, Eye, Key, MapPin, Radio } from 'lucide-react';
import type { Board, UserState } from '../../types';
import { BoardType, ThemeId, ViewMode } from '../../types';
import { BitStatus } from '../../components/BitStatus';

export function Sidebar(props: {
  userState: UserState;
  setUserState: React.Dispatch<React.SetStateAction<UserState>>;
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  getThemeColor: (t: ThemeId) => string;
  isNostrConnected: boolean;
  viewMode: ViewMode;
  activeBoardId: string | null;
  feedFilter: 'all' | 'topic' | 'location';
  setFeedFilter: (v: 'all' | 'topic' | 'location') => void;
  topicBoards: Board[];
  geohashBoards: Board[];
  navigateToBoard: (id: string | null) => void;
  onSetViewMode: (mode: ViewMode) => void;
}) {
  const {
    userState,
    setUserState,
    theme,
    setTheme,
    getThemeColor,
    isNostrConnected,
    viewMode,
    activeBoardId,
    feedFilter,
    setFeedFilter,
    topicBoards,
    geohashBoards,
    navigateToBoard,
    onSetViewMode,
  } = props;

  return (
    <aside className="md:col-span-1 order-first md:order-last space-y-6">
      <BitStatus userState={userState} />

      {/* Connection Status */}
      <div className="border border-terminal-dim p-3 bg-terminal-bg shadow-hard">
        <div className="flex items-center gap-2 text-xs">
          {isNostrConnected ? (
            <>
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-terminal-dim">NOSTR_RELAYS: ACTIVE</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-terminal-alert" />
              <span className="text-terminal-dim">OFFLINE_MODE</span>
            </>
          )}
        </div>
        {userState.identity && (
          <div className="mt-2 text-[10px] text-terminal-dim truncate">npub: {userState.identity.npub.slice(0, 20)}...</div>
        )}
      </div>

      {/* Feed Filter (when on global feed) */}
      {!activeBoardId && viewMode === ViewMode.FEED && (
        <div className="border border-terminal-dim p-4 bg-terminal-bg shadow-hard">
          <h3 className="font-bold border-b border-terminal-dim mb-2 pb-1 text-sm flex items-center gap-2">
            <Radio size={14} /> FILTER_MODE
          </h3>
          <div className="flex flex-col gap-1">
            {[
              { id: 'all', label: 'ALL_SIGNALS', icon: Globe },
              { id: 'topic', label: 'TOPIC_BOARDS', icon: Hash },
              { id: 'location', label: 'GEO_CHANNELS', icon: MapPin },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setFeedFilter(id as typeof feedFilter)}
                className={`text-left text-sm px-2 py-1 hover:bg-terminal-dim/20 transition-colors flex items-center gap-2
                  ${feedFilter === id ? 'text-terminal-text font-bold bg-terminal-dim/10' : 'text-terminal-dim'}
                `}
              >
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Topic Board Directory */}
      <div className="border border-terminal-dim p-4 bg-terminal-bg shadow-hard">
        <h3 className="font-bold border-b border-terminal-dim mb-2 pb-1 text-sm flex items-center gap-2">
          <Hash size={14} /> TOPIC_BOARDS
        </h3>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => navigateToBoard(null)}
            className={`text-left text-sm px-2 py-1 hover:bg-terminal-dim/20 transition-colors flex items-center gap-2
              ${activeBoardId === null ? 'text-terminal-text font-bold bg-terminal-dim/10' : 'text-terminal-dim'}
            `}
          >
            <Globe size={12} /> GLOBAL_NET
          </button>
          {topicBoards.filter((b) => b.type === BoardType.TOPIC && b.isPublic).map((board) => (
            <button
              key={board.id}
              onClick={() => navigateToBoard(board.id)}
              className={`text-left text-sm px-2 py-1 hover:bg-terminal-dim/20 transition-colors flex items-center gap-2
                ${activeBoardId === board.id ? 'text-terminal-text font-bold bg-terminal-dim/10' : 'text-terminal-dim'}
              `}
            >
              <span>//</span> {board.name}
            </button>
          ))}
          <div className="border-t border-terminal-dim/30 my-2"></div>
          {topicBoards.filter((b) => b.type === BoardType.TOPIC && !b.isPublic).map((board) => (
            <button
              key={board.id}
              disabled
              className="text-left text-sm px-2 py-1 text-terminal-dim/50 flex items-center gap-2 cursor-not-allowed"
            >
              <Lock size={10} /> {board.name}
            </button>
          ))}
        </div>
        <button
          onClick={() => onSetViewMode(ViewMode.CREATE_BOARD)}
          className="mt-4 w-full text-xs border border-terminal-dim border-dashed text-terminal-dim p-2 hover:text-terminal-text hover:border-solid transition-all"
        >
          + INIT_NEW_BOARD
        </button>
      </div>

      {/* Location Channels */}
      <div className="border border-terminal-dim p-4 bg-terminal-bg shadow-hard">
        <h3 className="font-bold border-b border-terminal-dim mb-2 pb-1 text-sm flex items-center gap-2">
          <MapPin size={14} /> GEO_CHANNELS
        </h3>
        <div className="flex flex-col gap-1">
          {geohashBoards.length === 0 ? (
            <p className="text-xs text-terminal-dim py-2">No location channels active. Enable location to discover nearby boards.</p>
          ) : (
            geohashBoards.map((board) => (
              <button
                key={board.id}
                onClick={() => navigateToBoard(board.id)}
                className={`text-left text-sm px-2 py-1 hover:bg-terminal-dim/20 transition-colors flex items-center gap-2
                  ${activeBoardId === board.id ? 'text-terminal-text font-bold bg-terminal-dim/10' : 'text-terminal-dim'}
                `}
              >
                <MapPin size={10} /> #{board.geohash}
              </button>
            ))
          )}
        </div>
        <button
          onClick={() => onSetViewMode(ViewMode.LOCATION)}
          className="mt-4 w-full text-xs border border-terminal-dim border-dashed text-terminal-dim p-2 hover:text-terminal-text hover:border-solid transition-all flex items-center justify-center gap-2"
        >
          <MapPin size={12} /> FIND_NEARBY
        </button>
      </div>

      {/* Theme Selector */}
      <div className="border border-terminal-dim p-4 bg-terminal-bg shadow-hard">
        <h3 className="font-bold border-b border-terminal-dim mb-2 pb-1 text-sm flex items-center gap-2">
          <Eye size={14} /> VISUAL_CONFIG
        </h3>
        <div className="grid grid-cols-3 gap-2 py-2">
          {Object.values(ThemeId).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className="group flex items-center justify-center gap-0.5 font-mono text-sm transition-colors"
              title={t === ThemeId.BITBORING ? 'BITBORING (UGLY MODE)' : String(t).toUpperCase()}
            >
              <span
                className={`transition-colors ${theme === t ? 'text-terminal-text font-bold' : 'text-terminal-dim group-hover:text-terminal-text'}`}
              >
                [
              </span>
              <span
                className={`w-3 h-3 mx-0.5 transition-transform ${theme === t ? 'scale-125' : 'scale-100 group-hover:scale-110'}`}
                style={{
                  backgroundColor: getThemeColor(t),
                  border: t === ThemeId.BITBORING ? '1px solid black' : 'none',
                }}
              />
              <span
                className={`transition-colors ${theme === t ? 'text-terminal-text font-bold' : 'text-terminal-dim group-hover:text-terminal-text'}`}
              >
                ]
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="border border-terminal-dim p-4 bg-terminal-bg shadow-hard">
        <h3 className="font-bold border-b border-terminal-dim mb-2 pb-1 text-sm flex items-center gap-2">
          <HelpCircle size={14} /> USER_ID_CONFIG
        </h3>
        <div className="flex flex-col gap-2">
          <label className="text-[10px] text-terminal-dim uppercase">Handle:</label>
          <input
            type="text"
            value={userState.username}
            onChange={(e) => setUserState((prev) => ({ ...prev, username: e.target.value }))}
            className="bg-terminal-bg border border-terminal-dim p-1 text-sm text-terminal-text font-mono focus:outline-none focus:border-terminal-text"
          />
          {userState.identity && (
            <button
              onClick={() => onSetViewMode(ViewMode.IDENTITY)}
              className="text-xs text-terminal-dim hover:text-terminal-text flex items-center gap-1 mt-2"
            >
              <Key size={10} /> Manage Identity
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

