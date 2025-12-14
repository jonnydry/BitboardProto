import React from 'react';
import { HelpCircle, Hash, Lock, Globe, Eye, Key, MapPin, Radio } from 'lucide-react';
import type { Board, UserState } from '../../types';
import { BoardType, ThemeId, ViewMode } from '../../types';

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
    <aside className="md:col-span-1 md:col-start-4 order-first md:order-none space-y-6">
      
      {/* Connection Status */}
      <div className="border border-terminal-dim p-3 bg-terminal-bg shadow-hard relative overflow-hidden group">
        <div className="absolute inset-0 bg-terminal-dim/5 translate-x-[-100%] group-hover:translate-x-full transition-transform duration-1000 pointer-events-none" />
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-terminal-dim font-bold">SYSTEM_STATUS</span>
          <div className="flex gap-1">
            <div className={`w-2 h-2 rounded-sm ${isNostrConnected ? 'bg-terminal-text animate-pulse' : 'bg-terminal-dim/30'}`} />
            <div className={`w-2 h-2 rounded-sm ${userState.identity ? 'bg-terminal-text' : 'bg-terminal-dim/30'}`} />
          </div>
        </div>
        <div className="font-mono text-[10px] text-terminal-dim leading-tight">
          <div className="flex justify-between">
            <span>RELAY_LINK:</span>
            <span className={isNostrConnected ? 'text-terminal-text' : 'text-terminal-alert'}>
              {isNostrConnected ? '[CONNECTED]' : '[OFFLINE]'}
            </span>
          </div>
          <div className="flex justify-between mt-0.5">
            <span>USER_AUTH:</span>
            <span className={userState.identity ? 'text-terminal-text' : 'text-terminal-dim'}>
              {userState.identity ? '[VERIFIED]' : '[GUEST]'}
            </span>
          </div>
        </div>
        {userState.identity && (
          <div className="mt-2 text-[10px] text-terminal-dim truncate border-t border-terminal-dim/30 pt-1">
            KEY: {userState.identity.npub.slice(0, 16)}...
          </div>
        )}
      </div>

      {/* Feed Filter (when on global feed) */}
      {!activeBoardId && viewMode === ViewMode.FEED && (
        <div className="border border-terminal-dim p-4 bg-terminal-bg shadow-hard">
          <h3 className="font-bold border-b border-terminal-dim mb-3 pb-1 text-sm flex items-center gap-2">
            <Radio size={14} /> {">>"} FILTER_MODE
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
                className={`text-left text-sm px-2 py-1.5 transition-all flex items-center gap-2 group
                  ${feedFilter === id 
                    ? 'text-terminal-bg bg-terminal-text font-bold' 
                    : 'text-terminal-dim hover:text-terminal-text hover:bg-terminal-dim/10'
                  }
                `}
              >
                <span className={`opacity-0 group-hover:opacity-100 transition-opacity ${feedFilter === id ? 'opacity-100 text-terminal-bg' : 'text-terminal-text'}`}>
                  {'>'}
                </span>
                <Icon size={12} /> 
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Topic Board Directory */}
      <div className="border border-terminal-dim p-4 bg-terminal-bg shadow-hard">
        <h3 className="font-bold border-b border-terminal-dim mb-3 pb-1 text-sm flex items-center gap-2">
          <Hash size={14} /> {">>"} TOPIC_NET
        </h3>
        <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto pr-1">
          <button
            onClick={() => navigateToBoard(null)}
            className={`text-left text-sm px-2 py-1.5 transition-all flex items-center gap-2 group
              ${activeBoardId === null 
                ? 'text-terminal-bg bg-terminal-text font-bold' 
                : 'text-terminal-dim hover:text-terminal-text hover:bg-terminal-dim/10'
              }
            `}
          >
            <Globe size={12} /> 
            <span className="truncate">GLOBAL_NET</span>
          </button>
          {topicBoards.filter((b) => b.type === BoardType.TOPIC && b.isPublic).map((board) => (
            <button
              key={board.id}
              onClick={() => navigateToBoard(board.id)}
              className={`text-left text-sm px-2 py-1 transition-all flex items-center gap-2 group w-full
                ${activeBoardId === board.id 
                  ? 'text-terminal-bg bg-terminal-text font-bold' 
                  : 'text-terminal-dim hover:text-terminal-text hover:bg-terminal-dim/10'
                }
              `}
            >
              <span className="shrink-0 text-[10px] opacity-50 group-hover:opacity-100">//</span> 
              <span className="truncate">{board.name}</span>
            </button>
          ))}
          <div className="border-t border-terminal-dim/30 my-2"></div>
          {topicBoards.filter((b) => b.type === BoardType.TOPIC && !b.isPublic).map((board) => (
            <button
              key={board.id}
              disabled
              className="text-left text-sm px-2 py-1 text-terminal-dim/30 flex items-center gap-2 cursor-not-allowed italic"
            >
              <Lock size={10} /> {board.name}
            </button>
          ))}
        </div>
        <button
          onClick={() => onSetViewMode(ViewMode.CREATE_BOARD)}
          className="mt-4 w-full text-xs border border-terminal-dim border-dashed text-terminal-dim p-2 hover:text-terminal-bg hover:bg-terminal-text hover:border-solid transition-all uppercase"
        >
          [+] Init_Board
        </button>
      </div>

      {/* Location Channels */}
      <div className="border border-terminal-dim p-4 bg-terminal-bg shadow-hard">
        <h3 className="font-bold border-b border-terminal-dim mb-3 pb-1 text-sm flex items-center gap-2">
          <MapPin size={14} /> {">>"} GEO_NET
        </h3>
        <div className="flex flex-col gap-1">
          {geohashBoards.length === 0 ? (
            <p className="text-xs text-terminal-dim py-2 font-mono">
              [NO_SIGNAL] <br/>
              Enable location to scan frequencies.
            </p>
          ) : (
            geohashBoards.map((board) => (
              <button
                key={board.id}
                onClick={() => navigateToBoard(board.id)}
                className={`text-left text-sm px-2 py-1 transition-all flex items-center gap-2 group w-full
                  ${activeBoardId === board.id 
                    ? 'text-terminal-bg bg-terminal-text font-bold' 
                    : 'text-terminal-dim hover:text-terminal-text hover:bg-terminal-dim/10'
                  }
                `}
              >
                <MapPin size={10} /> 
                <span className="truncate">#{board.geohash}</span>
              </button>
            ))
          )}
        </div>
        <button
          onClick={() => onSetViewMode(ViewMode.LOCATION)}
          className="mt-4 w-full text-xs border border-terminal-dim border-dashed text-terminal-dim p-2 hover:text-terminal-bg hover:bg-terminal-text hover:border-solid transition-all flex items-center justify-center gap-2 uppercase"
        >
          <MapPin size={12} /> Scan_Nearby
        </button>
      </div>

      {/* Theme Selector */}
      <div className="border border-terminal-dim p-4 bg-terminal-bg shadow-hard">
        <h3 className="font-bold border-b border-terminal-dim mb-3 pb-1 text-sm flex items-center gap-2">
          <Eye size={14} /> {">>"} VISUAL_CORE
        </h3>
        <div className="grid grid-cols-2 gap-2 py-2">
          {Object.values(ThemeId).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`group flex items-center gap-2 px-2 py-1.5 font-mono text-xs transition-all border
                ${theme === t 
                  ? 'border-terminal-text bg-terminal-dim/10 text-terminal-text' 
                  : 'border-transparent hover:border-terminal-dim/50 text-terminal-dim'
                }
              `}
              title={t === ThemeId.BITBORING ? 'BITBORING (UGLY MODE)' : String(t).toUpperCase()}
            >
              <span
                className={`w-2 h-2 rounded-full transition-transform ${theme === t ? 'scale-125' : 'scale-100 group-hover:scale-110'}`}
                style={{
                  backgroundColor: getThemeColor(t),
                  border: t === ThemeId.BITBORING ? '1px solid black' : 'none',
                  boxShadow: theme === t ? `0 0 5px ${getThemeColor(t)}` : 'none'
                }}
              />
              <span className="uppercase whitespace-nowrap overflow-hidden text-ellipsis">
                {t}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="border border-terminal-dim p-4 bg-terminal-bg shadow-hard">
        <h3 className="font-bold border-b border-terminal-dim mb-3 pb-1 text-sm flex items-center gap-2">
          <HelpCircle size={14} /> {">>"} ID_CONFIG
        </h3>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-terminal-dim uppercase font-bold">Display_Handle:</label>
            <div className="relative">
              <span className="absolute left-2 top-1.5 text-terminal-dim">{'>'}</span>
              <input
                type="text"
                value={userState.username}
                onChange={(e) => setUserState((prev) => ({ ...prev, username: e.target.value }))}
                className="w-full bg-terminal-bg border border-terminal-dim py-1 pl-6 pr-2 text-sm text-terminal-text font-mono focus:outline-none focus:border-terminal-text focus:ring-1 focus:ring-terminal-text/50 transition-all"
              />
            </div>
          </div>
          {userState.identity && (
            <button
              onClick={() => onSetViewMode(ViewMode.IDENTITY)}
              className="text-xs text-terminal-dim hover:text-terminal-text flex items-center gap-1 mt-2 border border-terminal-dim/30 hover:border-terminal-dim p-1.5 justify-center transition-all"
            >
              <Key size={10} /> Manage_Keys
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

