import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  Compass,
  ExternalLink,
  Globe,
  Hash,
  MapPin,
  User,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { ViewMode } from '../../types';
import { nostrService, type RelayStatus } from '../../services/nostr/NostrService';

const DRAWER_W = 'w-[24rem]';
const STORAGE_KEY = 'bitboard-desktop-nav-open';

export interface DesktopNavChromeProps {
  drawerOpen: boolean;
  onCloseDrawer: () => void;
  navigateToBoard: (id: string | null) => void;
  onSetViewMode: (mode: ViewMode) => void;
  /** When true, account utility opens Identity; otherwise Settings. */
  hasIdentity?: boolean;
  children: React.ReactNode;
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
    if (connected > 0) {
      health = connected >= total / 2 ? 'good' : 'degraded';
    }
    return { total, connected, health };
  }, [statuses]);
}

function QuickActionCard({
  label,
  detail,
  icon: Icon,
  onClick,
}: {
  label: string;
  detail: string;
  icon: React.ElementType;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[5.25rem] flex-col justify-between border border-terminal-dim/20 bg-terminal-bg/75 px-3 py-3 text-left transition-all hover:border-terminal-text/35 hover:bg-terminal-dim/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-text/50"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-terminal-dim/25 bg-terminal-dim/5 text-terminal-text transition-colors group-hover:border-terminal-text/35 group-hover:bg-terminal-text/10">
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-terminal-dim transition-transform group-hover:translate-x-0.5 group-hover:text-terminal-text" />
      </div>
      <div>
        <div className="font-mono text-[8px] uppercase tracking-[0.24em] text-terminal-dim/75">
          Quick Jump
        </div>
        <div className="mt-1 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-terminal-text">
          {label}
        </div>
        <div className="mt-1 text-[11px] leading-snug text-terminal-dim">{detail}</div>
      </div>
    </button>
  );
}

export const DesktopNavChrome = React.memo(function DesktopNavChrome({
  drawerOpen,
  onCloseDrawer,
  navigateToBoard,
  onSetViewMode,
  hasIdentity = false,
  children,
}: DesktopNavChromeProps) {
  const relay = useRelaySummary();
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = React.useId();
  const utilityMode = hasIdentity ? ViewMode.IDENTITY : ViewMode.SETTINGS;
  const utilityLabel = hasIdentity ? 'Identity & Keys' : 'Settings';

  useEffect(() => {
    if (!drawerOpen) {
      document.body.style.overflow = '';
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
      return;
    }

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseDrawer();
        return;
      }

      if (e.key !== 'Tab') return;

      const drawer = drawerRef.current;
      if (!drawer) return;

      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ) as HTMLElement[];

      if (focusable.length === 0) {
        e.preventDefault();
        drawer.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [drawerOpen, onCloseDrawer]);

  const openGlobalFeed = () => {
    navigateToBoard(null);
    onSetViewMode(ViewMode.FEED);
    onCloseDrawer();
  };

  const goToFullView = (mode: ViewMode) => {
    onSetViewMode(mode);
    onCloseDrawer();
  };

  const quickActions = [
    {
      label: 'Global Feed',
      detail: 'Return to the main timeline and close the drawer.',
      icon: Globe,
      onClick: openGlobalFeed,
    },
    {
      label: 'Board Directory',
      detail: 'Open the full boards browser instead of hunting through a list.',
      icon: Hash,
      onClick: () => goToFullView(ViewMode.BROWSE_BOARDS),
    },
    {
      label: 'Discover Nostr',
      detail: 'Jump into seeded discovery and trending posts.',
      icon: Compass,
      onClick: () => goToFullView(ViewMode.DISCOVER_NOSTR),
    },
    {
      label: 'Communities',
      detail: 'Browse saved and external Nostr communities.',
      icon: ExternalLink,
      onClick: () => goToFullView(ViewMode.EXTERNAL_COMMUNITIES),
    },
    {
      label: 'Nearby',
      detail: 'Check local channels and location-based activity.',
      icon: MapPin,
      onClick: () => goToFullView(ViewMode.LOCATION),
    },
    {
      label: utilityLabel,
      detail: hasIdentity
        ? 'Manage keys, session state, and account controls.'
        : 'Open preferences and connection setup.',
      icon: User,
      onClick: () => goToFullView(utilityMode),
    },
  ];

  return (
    <>
      {drawerOpen ? (
        <>
          <button
            type="button"
            aria-label="Close navigation menu"
            className="fixed inset-0 z-[42] hidden border-0 bg-black/55 backdrop-blur-[1.5px] md:block"
            onClick={onCloseDrawer}
          />

          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={`fixed bottom-0 right-0 top-0 z-[44] hidden ${DRAWER_W} flex-col border-l border-terminal-dim/20 bg-terminal-bg/95 shadow-[-16px_0_42px_rgba(0,0,0,0.55)] md:flex`}
          >
            <header className="shrink-0 border-b border-terminal-dim/20 bg-terminal-bg px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-mono text-[8px] uppercase tracking-[0.28em] text-terminal-dim/70">
                    Control Deck
                  </div>
                  <div
                    id={titleId}
                    className="mt-2 truncate font-mono text-3xl font-bold tracking-tight text-terminal-text"
                  >
                    BitBoard
                  </div>
                  <p className="mt-2 max-w-[18rem] text-[11px] leading-relaxed text-terminal-dim">
                    Keep the CRT mood, but lead with clear destinations and a calmer right-side
                    menu.
                  </p>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={onCloseDrawer}
                  className="flex h-12 min-w-[3.5rem] shrink-0 items-center justify-center gap-1 border border-terminal-dim/30 bg-terminal-text/5 px-3 text-terminal-dim transition-colors hover:border-terminal-text/40 hover:text-terminal-text focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-text/50"
                  aria-label="Close menu"
                >
                  <ChevronRight className="h-4 w-4 shrink-0 text-terminal-text" strokeWidth={2} />
                  <span className="font-mono text-[7px] font-semibold uppercase tracking-[0.24em] text-terminal-dim">
                    Close
                  </span>
                </button>
              </div>

              <div
                className="mt-4 grid grid-cols-2 gap-2"
                aria-label="Desktop navigation quick access"
              >
                {quickActions.map((action) => (
                  <div key={action.label}>
                    <QuickActionCard
                      label={action.label}
                      detail={action.detail}
                      icon={action.icon}
                      onClick={action.onClick}
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => goToFullView(ViewMode.RELAYS)}
                className="mt-3 flex w-full items-center gap-3 border border-terminal-dim/20 bg-terminal-dim/5 px-3 py-2.5 text-left transition-colors hover:border-terminal-text/35 hover:bg-terminal-dim/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-text/50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-terminal-dim/25 bg-terminal-bg/60">
                  {relay.health === 'good' ? (
                    <Wifi className="h-4 w-4 text-terminal-text" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-terminal-alert" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[8px] uppercase tracking-[0.24em] text-terminal-dim/70">
                    Relay Health
                  </div>
                  <div className="mt-1 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-terminal-text">
                    Open Relay Settings
                  </div>
                </div>
                <span className="font-mono text-sm font-bold tabular-nums text-terminal-text">
                  {relay.connected}/{relay.total}
                </span>
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-5 pt-4">
              {children}
            </div>
          </div>
        </>
      ) : null}
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
