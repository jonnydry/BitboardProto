import React, { useEffect, useRef, useMemo, useState } from 'react';
import {
  ChevronRight,
  Menu,
  Globe,
  Hash,
  Compass,
  ExternalLink,
  MapPin,
  User,
  Settings,
  Bookmark,
  Bell,
} from 'lucide-react';
import { ViewMode } from '../../types';
import { nostrService, type RelayStatus } from '../../services/nostr/NostrService';

const DRAWER_W = 'w-[20rem]';
const STORAGE_KEY = 'bitboard-desktop-nav-open';

export interface DesktopNavChromeProps {
  drawerOpen: boolean;
  onCloseDrawer: () => void;
  onOpenDrawer: () => void;
  navigateToBoard: (id: string | null) => void;
  onSetViewMode: (mode: ViewMode) => void;
  hasIdentity?: boolean;
}

function useRelaySummary() {
  const [statuses, setStatuses] = useState<RelayStatus[]>(() => nostrService.getRelayStatuses());

  useEffect(() => {
    const tick = () => setStatuses(nostrService.getRelayStatuses());
    tick();
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
  }, []);

  return useMemo(() => {
    const total = statuses.length;
    const connected = statuses.filter((s) => s.isConnected).length;
    let health: 'good' | 'degraded' | 'offline' = 'offline';
    if (connected > 0) health = connected >= total / 2 ? 'good' : 'degraded';
    return { total, connected, health };
  }, [statuses]);
}

function DrawerRow({
  icon: Icon,
  label,
  badge,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  badge?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 border-l-4 border-l-transparent px-4 py-2.5 text-left text-terminal-dim transition-all hover:border-l-terminal-dim/40 hover:bg-terminal-dim/5 hover:text-terminal-text"
    >
      <Icon size={15} strokeWidth={1.75} className="shrink-0" />
      <span className="flex-1 font-mono text-sm uppercase tracking-[0.12em]">{label}</span>
      {badge}
      <span className="opacity-0 group-hover:opacity-60 transition-opacity">→</span>
    </button>
  );
}

export const DesktopNavChrome = React.memo(function DesktopNavChrome({
  drawerOpen,
  onCloseDrawer,
  onOpenDrawer,
  navigateToBoard,
  onSetViewMode,
  hasIdentity = false,
}: DesktopNavChromeProps) {
  const relay = useRelaySummary();
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLButtonElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!drawerOpen) {
      document.body.style.overflow = '';
      prevFocusRef.current?.focus();
      prevFocusRef.current = null;
      return;
    }

    prevFocusRef.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseDrawer();
        return;
      }
      if (e.key !== 'Tab' || !drawerRef.current) return;

      const els = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ) as HTMLElement[];
      if (!els.length) {
        e.preventDefault();
        drawerRef.current.focus();
        return;
      }

      const first = els[0];
      const last = els[els.length - 1];
      const cur = document.activeElement as HTMLElement | null;

      if (e.shiftKey && cur === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && cur === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKey);
    };
  }, [drawerOpen, onCloseDrawer]);

  const go = (mode: ViewMode) => {
    onSetViewMode(mode);
    onCloseDrawer();
  };

  return (
    <>
      {/* Rail button — always visible on desktop */}
      <button
        ref={railRef}
        type="button"
        onClick={() => (drawerOpen ? onCloseDrawer() : onOpenDrawer())}
        aria-label={drawerOpen ? 'Close navigation panel' : 'Open navigation panel'}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-[44] flex h-12 w-6 items-center justify-center border-l-2 border-b border-r-0 border-t-2 border-terminal-dim/40 bg-terminal-bg/90 text-terminal-dim transition-all duration-200 hover:border-terminal-text hover:text-terminal-text"
        style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
      >
        <ChevronRight
          size={14}
          strokeWidth={2}
          className={`transition-transform duration-200 ${drawerOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Scrim */}
      <button
        type="button"
        aria-label="Close navigation overlay"
        className={`fixed inset-0 z-[42] cursor-default border-0 bg-black/30 backdrop-blur-[1px] transition-opacity duration-200 ${
          drawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onCloseDrawer}
      />

      {/* Panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        tabIndex={-1}
        className={`fixed bottom-0 right-0 top-0 z-[43] flex w-full flex-col border-l border-terminal-dim/25 bg-terminal-bg/98 shadow-[-8px_0_24px_rgba(0,0,0,0.4)] transition-transform duration-200 ease-out ${
          DRAWER_W
        } ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-terminal-dim/20 px-4 py-3">
          <div>
            <p className="font-mono text-[8px] uppercase tracking-[0.3em] text-terminal-dim/60">
              Navigate
            </p>
            <p className="mt-0.5 font-mono text-lg font-bold tracking-tight text-terminal-text">
              BitBoard
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onCloseDrawer}
            className="flex h-9 w-9 items-center justify-center border border-terminal-dim/30 bg-terminal-text/5 text-terminal-dim transition-colors hover:border-terminal-dim/60 hover:text-terminal-text focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-text/50"
            aria-label="Close navigation"
          >
            <ChevronRight size={13} strokeWidth={2} />
          </button>
        </div>

        {/* Quick nav */}
        <nav className="flex-1 overflow-y-auto py-2" aria-label="Quick navigation">
          <DrawerRow
            icon={Globe}
            label="Global Feed"
            onClick={() => {
              navigateToBoard(null);
              onCloseDrawer();
            }}
          />
          <DrawerRow
            icon={Hash}
            label="Board Directory"
            onClick={() => go(ViewMode.BROWSE_BOARDS)}
          />
          <DrawerRow
            icon={Compass}
            label="Discover Nostr"
            onClick={() => go(ViewMode.DISCOVER_NOSTR)}
          />
          <DrawerRow
            icon={ExternalLink}
            label="Communities"
            onClick={() => go(ViewMode.EXTERNAL_COMMUNITIES)}
          />
          <DrawerRow icon={MapPin} label="Nearby" onClick={() => go(ViewMode.LOCATION)} />
          <DrawerRow icon={Bookmark} label="Bookmarks" onClick={() => go(ViewMode.BOOKMARKS)} />
          <DrawerRow icon={Bell} label="Notifications" onClick={() => go(ViewMode.NOTIFICATIONS)} />
          {hasIdentity && (
            <DrawerRow icon={User} label="Identity & Keys" onClick={() => go(ViewMode.IDENTITY)} />
          )}
          {!hasIdentity && (
            <DrawerRow icon={User} label="Connect Identity" onClick={() => go(ViewMode.IDENTITY)} />
          )}
          <DrawerRow icon={Settings} label="Settings" onClick={() => go(ViewMode.SETTINGS)} />
        </nav>

        {/* Relay health footer */}
        <div className="border-t border-terminal-dim/20 px-4 py-3">
          <button
            type="button"
            onClick={() => go(ViewMode.RELAYS)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  relay.health === 'good'
                    ? 'bg-terminal-text'
                    : relay.health === 'degraded'
                      ? 'bg-yellow-500'
                      : 'bg-terminal-alert'
                }`}
              />
              <span className="font-mono text-[10px] uppercase tracking-wider text-terminal-dim">
                Relay Status
              </span>
            </span>
            <span className="font-mono text-xs font-bold tabular-nums text-terminal-text">
              {relay.connected}/{relay.total}
            </span>
          </button>
        </div>
      </div>
    </>
  );
});

export function readStoredDesktopNavOpen(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEY) === '1';
}

export function writeStoredDesktopNavOpen(open: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
}
