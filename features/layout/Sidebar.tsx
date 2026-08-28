import React, { useEffect, useMemo, useState } from 'react';
import {
  Hash,
  MapPin,
  ChevronDown,
  ChevronRight,
  Shield,
  Trash2,
} from 'lucide-react';
import type { Board } from '../../types';
import { BoardType, ThemeId, ViewMode } from '../../types';
import { geonetDiscoveryService, type GeoChannel } from '../../services/geonetDiscoveryService';
import { geohashService } from '../../services/geohashService';
import { encryptedBoardService } from '../../services/encryptedBoardService';
import { nostrService, type RelayStatus } from '../../services/nostr/NostrService';
import { FeatureFlags } from '../../config';

export type SidebarLayout = 'inline' | 'drawer';

interface SidebarProps {
  userState: { identity?: { npub: string; pubkey: string }; username: string };
  setUserState: (value: (prev: any) => any) => void;
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  getThemeColor: (id: ThemeId) => string;
  isNostrConnected: boolean;
  viewMode: ViewMode;
  activeBoardId: string | null;
  feedFilter: string;
  setFeedFilter: (filter: 'all' | 'topic' | 'location' | 'following') => void;
  topicBoards: Board[];
  externalCommunities: Board[];
  geohashBoards: Board[];
  boardsById: Map<string, Board>;
  decryptionFailedBoardIds?: Set<string>;
  removeFailedDecryptionKey?: (boardId: string) => void;
  navigateToBoard: (id: string | null) => void;
  onSetViewMode: (mode: ViewMode) => void;
  /** Called after a navigation action — use to close a containing drawer. */
  onRequestCloseNav?: () => void;
  /** 'inline' = always-visible desktop panel; 'drawer' = inside a mobile/full-screen drawer */
  layout?: SidebarLayout;
}

function SectionButton({
  isOpen,
  onClick,
  children,
}: {
  isOpen: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 border-b border-terminal-dim/30 py-2 text-left text-xs font-bold uppercase tracking-wider text-terminal-dim transition-colors hover:text-terminal-text"
    >
      <span className="text-[10px]">
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </span>
      {children}
    </button>
  );
}

export const Sidebar = React.memo(function Sidebar(props: SidebarProps) {
  const {
    userState,
    theme,
    setTheme,
    viewMode: _viewMode,
    activeBoardId,
    feedFilter: _feedFilter,
    setFeedFilter: _setFeedFilter,
    topicBoards = [],
    externalCommunities: _externalCommunities = [],
    geohashBoards = [],
    boardsById = new Map<string, Board>(),
    decryptionFailedBoardIds = new Set<string>(),
    removeFailedDecryptionKey,
    navigateToBoard,
    onSetViewMode,
    onRequestCloseNav,
    layout = 'inline',
  } = props;

  const isDrawer = layout === 'drawer';

  // ── Relay status ──────────────────────────────────────────────────────────
  const [relayStatuses, setRelayStatuses] = useState<RelayStatus[]>(() =>
    nostrService.getRelayStatuses(),
  );
  const [showRelayDetails, setShowRelayDetails] = useState(false);
  // Use a specific string-literal union so `noUncheckedIndexedAccess` doesn't
  // return `boolean | undefined` for every section access below.
  type SectionKey = 'LOCAL' | 'BOARDS' | 'SECURE_NET' | 'THEME' | 'IDENTITY';

  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    LOCAL: true,
    BOARDS: true,
    SECURE_NET: false,
    THEME: false,
    IDENTITY: false,
  });
  const toggleSection = (key: SectionKey) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    const tick = () => setRelayStatuses(nostrService.getRelayStatuses());
    tick();
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
  }, []);

  const relayMetrics = useMemo(() => {
    const total = relayStatuses.length;
    const connected = relayStatuses.filter((s) => s.isConnected).length;
    let health: 'good' | 'degraded' | 'offline' = 'offline';
    if (connected > 0) health = connected >= total / 2 ? 'good' : 'degraded';
    return { total, connected, health };
  }, [relayStatuses]);

  // ── Nearby activity ───────────────────────────────────────────────────────
  const [nearbyActivity, setNearbyActivity] = useState<GeoChannel[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);

  useEffect(() => {
    const cached = geonetDiscoveryService.getCachedResult();
    if (cached) setNearbyActivity(cached.channels);
  }, []);

  useEffect(() => {
    const cached = geohashService.getCachedPosition();
    if (!cached || !FeatureFlags.ENABLE_GEOHASH) return;
    setIsLoadingActivity(true);
    geonetDiscoveryService
      .discoverNearbyChannels(cached.coords.latitude, cached.coords.longitude)
      .then((r) => setNearbyActivity(r.channels))
      .catch(() => {})
      .finally(() => setIsLoadingActivity(false));
  }, [geohashBoards.length]);

  // ── Boards ───────────────────────────────────────────────────────────────
  const encryptedBoards = useMemo(() => {
    return encryptedBoardService
      .getEncryptedBoardIds()
      .map((id) => boardsById.get(id))
      .filter((b): b is Board => b !== undefined && b.isEncrypted === true);
  }, [boardsById]);

  const publicTopicBoards = useMemo(
    () => topicBoards.filter((b) => b.type === BoardType.TOPIC && b.isPublic),
    [topicBoards],
  );

  // ── Helpers ──────────────────────────────────────────────────────────────
  const nav = (action: () => void) => {
    action();
    onRequestCloseNav?.();
  };

  // ── Theme taglines ────────────────────────────────────────────────────────
  const THEME_LABELS: Record<ThemeId, string> = {
    [ThemeId.AMBER]: 'Amber',
    [ThemeId.PHOSPHOR]: 'Phosphor',
    [ThemeId.PLASMA]: 'Plasma',
    [ThemeId.VERMILION]: 'Vermilion',
    [ThemeId.SLATE]: 'Slate',
    [ThemeId.PATRIOT]: 'Patriot',
    [ThemeId.SAKURA]: 'Sakura',
    [ThemeId.BITBORING]: 'Boring',
  };

  const THEME_SWATCHES: Record<ThemeId, React.CSSProperties> = {
    [ThemeId.AMBER]: { backgroundColor: '#ffb000' },
    [ThemeId.PHOSPHOR]: { backgroundColor: '#00ff41' },
    [ThemeId.PLASMA]: { backgroundColor: '#00f0ff' },
    [ThemeId.VERMILION]: { backgroundColor: '#ff4646' },
    [ThemeId.SLATE]: { backgroundColor: '#c8c8c8' },
    [ThemeId.PATRIOT]: {
      background: 'linear-gradient(135deg, #ff1428 25%, #ffffff 25% 75%, #0a4bff 75%)',
      border: '1px solid #555',
    },
    [ThemeId.SAKURA]: {
      backgroundColor: '#ffa0d2',
      border: '1px solid #888',
    },
    [ThemeId.BITBORING]: {
      backgroundColor: '#ffffff',
      border: '1px solid #888',
    },
  };

  const BASE = isDrawer
    ? 'ui-crt-surface flex min-w-0 flex-col gap-3 p-4'
    : 'ui-crt-surface order-first space-y-3 p-3';

  return (
    <aside className={BASE}>
      {/* ── Relay status ── */}
      <div className="ui-surface-panel p-3">
        <button
          type="button"
          onClick={() => setShowRelayDetails(!showRelayDetails)}
          className="flex w-full items-center justify-between text-xs text-terminal-dim hover:text-terminal-text transition-colors"
        >
          <span className="flex items-center gap-2 font-mono uppercase tracking-wider">
            <span
              className={`h-2 w-2 rounded-full ${
                relayMetrics.health === 'good'
                  ? 'bg-terminal-text animate-pulse'
                  : relayMetrics.health === 'degraded'
                    ? 'bg-yellow-500 animate-pulse'
                    : 'bg-terminal-alert'
              }`}
            />
            RELAY [{relayMetrics.connected}/{relayMetrics.total}]
          </span>
          <span className="flex items-center gap-1">
            <span
              className={`font-mono text-terminal-text ${
                relayMetrics.health === 'good'
                  ? 'text-terminal-text'
                  : relayMetrics.health === 'degraded'
                    ? 'text-yellow-500'
                    : 'text-terminal-alert'
              }`}
            >
              {relayMetrics.health.toUpperCase()}
            </span>
            <ChevronDown
              size={10}
              className={`transition-transform ${showRelayDetails ? 'rotate-180' : ''}`}
            />
          </span>
        </button>

        {showRelayDetails && (
          <div className="hide-scrollbar mt-2 max-h-32 space-y-1 overflow-y-auto border-t border-terminal-dim/25 pt-2">
            {relayStatuses.map((r) => {
              const host = r.url.replace('wss://', '').replace('ws://', '').split('/')[0];
              return (
                <div key={r.url} className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="truncate font-mono text-terminal-dim" title={r.url}>
                    {host}
                  </span>
                  <span className="shrink-0">
                    {r.isConnected ? (
                      <span className="text-terminal-text">● OK</span>
                    ) : r.nextReconnectTime ? (
                      <span className="text-yellow-500 animate-pulse">↻</span>
                    ) : (
                      <span className="text-terminal-alert">✕</span>
                    )}
                  </span>
                </div>
              );
            })}
            {relayStatuses.length === 0 && (
              <p className="text-[10px] text-terminal-dim/60 text-center py-1">No relays</p>
            )}
          </div>
        )}
      </div>

      {/* ── Local / BitChat geohash channels ── */}
      {FeatureFlags.ENABLE_GEOHASH && (
        <div className="ui-surface-panel p-3">
          <SectionButton isOpen={openSections.LOCAL} onClick={() => toggleSection('LOCAL')}>
            LOCAL ({geohashBoards.length})
          </SectionButton>
          {openSections.LOCAL && (
            <div className="hide-scrollbar mt-2 max-h-48 space-y-0.5 overflow-y-auto">
              {geohashBoards.map((board) => (
                <button
                  key={board.id}
                  type="button"
                  onClick={() => nav(() => navigateToBoard(board.id))}
                  className={`flex w-full items-center gap-2 border-l-2 px-2 py-1.5 text-left text-xs font-mono transition-all ${
                    activeBoardId === board.id
                      ? 'border-l-terminal-text bg-terminal-dim/10 text-terminal-text'
                      : 'border-l-transparent text-terminal-dim hover:border-l-terminal-dim/40 hover:bg-terminal-dim/5 hover:text-terminal-text'
                  }`}
                >
                  <MapPin size={10} />
                  <span className="truncate">{board.geohash ? `#${board.geohash}` : board.name}</span>
                </button>
              ))}
              {nearbyActivity.slice(0, 6).map((ch) => {
                if (geohashBoards.some((b) => b.geohash === ch.geohash)) return null;
                const board = geonetDiscoveryService.channelToBoard(ch);
                return (
                  <button
                    key={ch.geohash}
                    type="button"
                    onClick={() => nav(() => navigateToBoard(board.id))}
                    className="flex w-full items-center gap-2 border-l-2 border-l-transparent px-2 py-1.5 text-left text-xs font-mono text-terminal-dim hover:border-l-terminal-dim/40 hover:bg-terminal-dim/5 hover:text-terminal-text transition-all"
                  >
                    <MapPin size={10} />
                    <span className="truncate font-mono">#{ch.geohash}</span>
                    <span className="ml-auto text-[9px] text-terminal-dim/60">{ch.postCount} notes</span>
                  </button>
                );
              })}
              {geohashBoards.length === 0 && nearbyActivity.length === 0 && (
                <p className="px-2 py-1.5 text-[10px] font-mono text-terminal-dim/70">
                  Nearby Nostr notes tagged with a geohash — same channels BitChat uses on the
                  internet.
                </p>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => nav(() => onSetViewMode(ViewMode.LOCATION))}
            className="mt-2 w-full border border-dashed border-terminal-dim/30 px-2 py-1.5 text-[10px] font-mono uppercase text-terminal-dim hover:border-terminal-dim/60 hover:text-terminal-text transition-all flex items-center justify-center gap-1"
          >
            <MapPin size={10} />
            {isLoadingActivity ? 'Scanning...' : 'Enable location'}
          </button>
        </div>
      )}

      {/* ── Named Nostr boards ── */}
      <div className="ui-surface-panel p-3">
        <SectionButton isOpen={openSections.BOARDS} onClick={() => toggleSection('BOARDS')}>
          BOARDS ({publicTopicBoards.length})
        </SectionButton>
        {openSections.BOARDS && (
          <div className="hide-scrollbar mt-2 max-h-48 space-y-0.5 overflow-y-auto">
            {publicTopicBoards.map((board) => (
              <button
                key={board.id}
                type="button"
                onClick={() => nav(() => navigateToBoard(board.id))}
                className={`flex w-full items-center gap-2 border-l-2 px-2 py-1.5 text-left text-xs font-mono transition-all ${
                  activeBoardId === board.id
                    ? 'border-l-terminal-text bg-terminal-dim/10 text-terminal-text'
                    : 'border-l-transparent text-terminal-dim hover:border-l-terminal-dim/40 hover:bg-terminal-dim/5 hover:text-terminal-text'
                }`}
              >
                <Hash size={10} />
                <span className="truncate">{board.name}</span>
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => nav(() => onSetViewMode(ViewMode.BROWSE_BOARDS))}
          className="mt-2 w-full border border-dashed border-terminal-dim/30 px-2 py-1.5 text-[10px] font-mono uppercase text-terminal-dim hover:border-terminal-dim/60 hover:text-terminal-text transition-all"
        >
          + Browse boards
        </button>
      </div>

      {/* ── Encrypted boards ── */}
      {encryptedBoards.length > 0 && (
        <div className="ui-surface-panel p-3">
          <SectionButton
            isOpen={openSections.SECURE_NET}
            onClick={() => toggleSection('SECURE_NET')}
          >
            ENCRYPTED ({encryptedBoards.length})
          </SectionButton>
          {openSections.SECURE_NET && (
            <div className="hide-scrollbar mt-2 max-h-40 space-y-0.5 overflow-y-auto">
              {encryptedBoards.map((board) => {
                const failed = decryptionFailedBoardIds.has(board.id);
                return (
                  <div key={board.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => nav(() => navigateToBoard(board.id))}
                      className={`flex flex-1 items-center gap-2 border-l-2 px-2 py-1.5 text-left text-xs font-mono transition-all ${
                        activeBoardId === board.id
                          ? 'border-l-terminal-text bg-terminal-dim/10 text-terminal-text'
                          : 'border-l-transparent text-terminal-dim hover:border-l-terminal-dim/40 hover:bg-terminal-dim/5 hover:text-terminal-text'
                      }`}
                    >
                      <Shield size={10} />
                      <span className="truncate">{board.name}</span>
                    </button>
                    {failed && removeFailedDecryptionKey && (
                      <button
                        type="button"
                        onClick={() => removeFailedDecryptionKey(board.id)}
                        title="Remove invalid key"
                        className="shrink-0 p-1 text-terminal-alert hover:text-terminal-alert/70 transition-colors"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Theme selector ── */}
      <div className="ui-surface-panel p-3">
        <SectionButton isOpen={openSections.THEME} onClick={() => toggleSection('THEME')}>
          THEME
        </SectionButton>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {Object.values(ThemeId).map((t) => {
            const active = theme === t;
            const swatchStyle = THEME_SWATCHES[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => nav(() => setTheme(t))}
                title={`${THEME_LABELS[t]} theme`}
                className={`flex min-h-[54px] items-center gap-2 border px-2.5 py-2 text-left transition-all ${
                  active
                    ? 'border-terminal-text bg-terminal-dim/10 shadow-[0_0_8px_rgba(var(--color-terminal-text),0.25)]'
                    : 'border-terminal-dim/20 hover:border-terminal-dim/40'
                }`}
              >
                <span className="block h-6 w-6 shrink-0 rounded-full" style={swatchStyle} />
                <span
                  className={`min-w-0 truncate text-[10px] font-mono uppercase tracking-[0.12em] ${active ? 'text-terminal-text' : 'text-terminal-dim'}`}
                >
                  {THEME_LABELS[t]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Identity / settings ── */}
      <div className="ui-surface-panel p-3">
        <SectionButton isOpen={openSections.IDENTITY} onClick={() => toggleSection('IDENTITY')}>
          IDENTITY
        </SectionButton>
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-terminal-dim/40" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-terminal-dim">
              {userState.identity ? 'VERIFIED' : 'GUEST'}
            </span>
          </div>
          {userState.identity && (
            <p className="truncate font-mono text-[9px] text-terminal-dim/60">
              {userState.identity.npub.slice(0, 20)}...
            </p>
          )}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => nav(() => onSetViewMode(ViewMode.SETTINGS))}
              className="flex-1 border border-terminal-dim/30 px-2 py-1.5 text-[10px] font-mono uppercase text-terminal-dim hover:border-terminal-dim/60 hover:text-terminal-text transition-all"
            >
              Settings
            </button>
            {userState.identity && (
              <button
                type="button"
                onClick={() => nav(() => onSetViewMode(ViewMode.IDENTITY))}
                className="flex-1 border border-terminal-dim/30 px-2 py-1.5 text-[10px] font-mono uppercase text-terminal-dim hover:border-terminal-dim/60 hover:text-terminal-text transition-all"
              >
                Keys
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
});
