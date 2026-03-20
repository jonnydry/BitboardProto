import React, { useEffect, useMemo, useState } from 'react';
import {
  HelpCircle,
  Hash,
  Globe,
  Eye,
  Key,
  MapPin,
  Radio,
  User,
  ChevronDown,
  ChevronRight,
  Shield,
  AlertTriangle,
  Trash2,
  Wifi,
  WifiOff,
  RefreshCw,
  ExternalLink,
  Compass,
} from 'lucide-react';
import type { Board } from '../../types';
import { BoardType, ThemeId, ViewMode } from '../../types';
import { geonetDiscoveryService, type GeoChannel } from '../../services/geonetDiscoveryService';
import { geohashService } from '../../services/geohashService';
import { encryptedBoardService } from '../../services/encryptedBoardService';
import { nostrService, type RelayStatus } from '../../services/nostr/NostrService';

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
  setFeedFilter: (filter: string) => void;
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

function NavRow({
  icon: Icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  badge?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-3 border px-3 py-2.5 text-left text-xs transition-all ${
        active
          ? 'border-terminal-text bg-terminal-dim/10 text-terminal-text'
          : 'border-transparent text-terminal-dim hover:border-terminal-dim/30 hover:bg-terminal-dim/5 hover:text-terminal-text'
      }`}
    >
      <Icon size={14} strokeWidth={1.75} className="shrink-0" />
      <span className="flex-1 font-mono uppercase tracking-[0.12em]">{label}</span>
      {badge}
      <span
        className={`text-terminal-dim transition-transform ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-70'}`}
      >
        →
      </span>
    </button>
  );
}

export const Sidebar = React.memo(function Sidebar(props: SidebarProps) {
  const {
    userState,
    setUserState,
    theme,
    setTheme,
    getThemeColor = () => '#ffffff',
    viewMode,
    activeBoardId,
    feedFilter,
    setFeedFilter,
    topicBoards = [],
    externalCommunities = [],
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
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    FILTER: true,
    TOPIC_NET: true,
    COMMUNITIES: false,
    SECURE_NET: false,
    GEO_NET: false,
    DISCOVER: false,
    THEME: false,
    IDENTITY: false,
  });
  const toggleSection = (key: string) =>
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
    if (geohashBoards.length === 0) return;
    const cached = geohashService.getCachedPosition();
    if (!cached) return;
    setIsLoadingActivity(true);
    geonetDiscoveryService
      .discoverNearbyChannels(cached.coords.latitude, cached.coords.longitude)
      .then((r) => setNearbyActivity(r.channels))
      .catch(() => {})
      .finally(() => setIsLoadingActivity(false));
  }, [geohashBoards.length]);

  const totalNearbyPosts = nearbyActivity.reduce((s, ch) => s + ch.postCount, 0);

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

  const BASE = isDrawer ? 'flex flex-col gap-3 overflow-y-auto p-4' : 'order-first space-y-3';

  return (
    <aside className={BASE}>
      {/* ── Relay status ── */}
      <div className="border border-terminal-dim bg-terminal-bg p-3">
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
          <div className="mt-2 space-y-1 border-t border-terminal-dim/25 pt-2 max-h-32 overflow-y-auto">
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

      {/* ── Feed filter (global feed only) ── */}
      {!activeBoardId && viewMode === ViewMode.FEED && (
        <div className="border border-terminal-dim bg-terminal-bg p-3">
          <SectionButton
            isOpen={openSections.FILTER}
            onClick={() => toggleSection('FILTER')}
          >
            FILTER
          </SectionButton>
          {openSections.FILTER && (
          <div className="mt-2 flex flex-wrap gap-1">
            {[
              { id: 'all', label: 'ALL', Icon: Globe },
              { id: 'topic', label: 'TOPIC', Icon: Hash },
              { id: 'location', label: 'GEO', Icon: MapPin },
              { id: 'following', label: 'FOLLOW', Icon: User },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => nav(() => setFeedFilter(id))}
                className={`flex items-center gap-1.5 border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-all ${
                  feedFilter === id
                    ? 'border-terminal-text bg-terminal-dim/10 text-terminal-text'
                    : 'border-terminal-dim/30 text-terminal-dim hover:border-terminal-dim/60 hover:text-terminal-text'
                }`}
              >
                <Icon size={10} />
                {label}
              </button>
            ))}
          </div>
          )}
        </div>
      )}

      {/* ── Topic boards + global ── */}
      <div className="border border-terminal-dim bg-terminal-bg p-3">
        <SectionButton
          isOpen={openSections.TOPIC_NET}
          onClick={() => toggleSection('TOPIC_NET')}
        >
          TOPIC_NET ({publicTopicBoards.length})
        </SectionButton>
        {openSections.TOPIC_NET && (
          <div className="mt-2 space-y-0.5 max-h-48 overflow-y-auto">
            <button
              type="button"
              onClick={() => nav(() => navigateToBoard(null))}
              className={`flex w-full items-center gap-2 border-l-2 px-2 py-1.5 text-left text-xs font-mono transition-all ${
                activeBoardId === null
                  ? 'border-l-terminal-text bg-terminal-dim/10 text-terminal-text'
                  : 'border-l-transparent text-terminal-dim hover:border-l-terminal-dim/40 hover:bg-terminal-dim/5 hover:text-terminal-text'
              }`}
            >
              <Globe size={10} />
              <span className="truncate">GLOBAL</span>
            </button>
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
          + Browse All
        </button>
      </div>

      {/* ── External communities ── */}
      {externalCommunities.length > 0 && (
        <div className="border border-terminal-dim bg-terminal-bg p-3">
          <SectionButton
            isOpen={openSections.COMMUNITIES}
            onClick={() => toggleSection('COMMUNITIES')}
          >
            COMMUNITIES ({externalCommunities.length})
          </SectionButton>
          <div className="mt-2 space-y-0.5 max-h-40 overflow-y-auto">
            {externalCommunities.slice(0, 8).map((board) => (
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
                <ExternalLink size={10} />
                <span className="truncate">{board.name}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => nav(() => onSetViewMode(ViewMode.EXTERNAL_COMMUNITIES))}
            className="mt-2 w-full border border-dashed border-terminal-dim/30 px-2 py-1.5 text-[10px] font-mono uppercase text-terminal-dim hover:border-terminal-dim/60 hover:text-terminal-text transition-all"
          >
            + Explore
          </button>
        </div>
      )}

      {/* ── Secure boards ── */}
      {encryptedBoards.length > 0 && (
        <div className="border border-terminal-dim bg-terminal-bg p-3">
          <SectionButton
            isOpen={openSections.SECURE_NET}
            onClick={() => toggleSection('SECURE_NET')}
          >
            SECURE_NET ({encryptedBoards.length})
          </SectionButton>
          <div className="mt-2 space-y-0.5 max-h-40 overflow-y-auto">
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
        </div>
      )}

      {/* ── Location / geo boards ── */}
      {geohashBoards.length > 0 && (
        <div className="border border-terminal-dim bg-terminal-bg p-3">
          <SectionButton isOpen={openSections.GEO_NET} onClick={() => toggleSection('GEO_NET')}>
            GEO_NET ({totalNearbyPosts > 0 ? `${totalNearbyPosts} sig` : geohashBoards.length})
          </SectionButton>
          <div className="mt-2 space-y-0.5 max-h-40 overflow-y-auto">
            {nearbyActivity.slice(0, 6).map((ch) => {
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
                  <span className="ml-auto text-[9px] text-terminal-dim/60">{ch.postCount}p</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => nav(() => onSetViewMode(ViewMode.LOCATION))}
            className="mt-2 w-full border border-dashed border-terminal-dim/30 px-2 py-1.5 text-[10px] font-mono uppercase text-terminal-dim hover:border-terminal-dim/60 hover:text-terminal-text transition-all flex items-center justify-center gap-1"
          >
            <MapPin size={10} />
            {isLoadingActivity ? 'Scanning...' : 'Scan Nearby'}
          </button>
        </div>
      )}

      {/* ── Discover ── */}
      <div className="border border-terminal-dim bg-terminal-bg p-3">
        <SectionButton isOpen={openSections.DISCOVER} onClick={() => toggleSection('DISCOVER')}>
          DISCOVER
        </SectionButton>
        <div className="mt-2 space-y-1">
          <NavRow
            icon={Compass}
            label="Discover Nostr"
            onClick={() => nav(() => onSetViewMode(ViewMode.DISCOVER_NOSTR))}
          />
          <NavRow
            icon={ExternalLink}
            label="Communities"
            onClick={() => nav(() => onSetViewMode(ViewMode.EXTERNAL_COMMUNITIES))}
          />
        </div>
      </div>

      {/* ── Theme selector ── */}
      <div className="border border-terminal-dim bg-terminal-bg p-3">
        <SectionButton isOpen={openSections.THEME} onClick={() => toggleSection('THEME')}>
          THEME
        </SectionButton>
        <div className="mt-2 grid grid-cols-4 gap-1">
          {Object.values(ThemeId).map((t) => {
            const active = theme === t;
            const swatchStyle: React.CSSProperties = {
              backgroundColor: t === ThemeId.PATRIOT ? undefined : getThemeColor(t),
              background:
                t === ThemeId.PATRIOT
                  ? 'linear-gradient(135deg, #ff1428 25%, #fff 25% 75%, #0a4bff 75%)'
                  : undefined,
              border: ['bitboring', 'patriot', 'sakura'].includes(t) ? '1px solid #555' : 'none',
            };
            return (
              <button
                key={t}
                type="button"
                onClick={() => nav(() => setTheme(t))}
                title={`${THEME_LABELS[t]} theme`}
                className={`flex flex-col items-center gap-1 border p-1.5 transition-all ${
                  active
                    ? 'border-terminal-text bg-terminal-dim/10 shadow-[0_0_8px_rgba(var(--color-terminal-text),0.25)]'
                    : 'border-transparent hover:border-terminal-dim/40'
                }`}
              >
                <span className="h-5 w-5 rounded-full" style={swatchStyle} />
                <span
                  className={`text-[7px] font-mono uppercase ${active ? 'text-terminal-text' : 'text-terminal-dim'}`}
                >
                  {THEME_LABELS[t]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Identity / settings ── */}
      <div className="border border-terminal-dim bg-terminal-bg p-3">
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
