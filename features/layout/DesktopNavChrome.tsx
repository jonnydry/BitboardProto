import React, { useEffect, useRef } from 'react';
import { ChevronRight } from 'lucide-react';

/** Tray width — keep in sync with `TRAY_W_CLASS` and scrim `right-*`. */
const TRAY_W_CLASS = 'w-[20rem]';
const TRAY_W_REM = 20;
const STORAGE_KEY = 'bitboard-desktop-nav-open';

export interface DesktopNavChromeProps {
  drawerOpen: boolean;
  onCloseDrawer: () => void;
  onOpenDrawer: () => void;
  /** Full `Sidebar` (layout="drawer") — same content as the old right column. */
  children: React.ReactNode;
}

/**
 * md+: narrow side tray (not a full-screen modal). Dims only the main content to the
 * left of the tray; feed stays visible and scrollable.
 */
export const DesktopNavChrome = React.memo(function DesktopNavChrome({
  drawerOpen,
  onCloseDrawer,
  onOpenDrawer,
  children,
}: DesktopNavChromeProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLButtonElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!drawerOpen) {
      prevFocusRef.current?.focus();
      prevFocusRef.current = null;
      return;
    }

    prevFocusRef.current = document.activeElement as HTMLElement;
    closeRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseDrawer();
        return;
      }
      if (e.key !== 'Tab' || !drawerRef.current) return;

      const els = Array.from(
        drawerRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    return () => document.removeEventListener('keydown', handleKey);
  }, [drawerOpen, onCloseDrawer]);

  return (
    <>
      {/* Tab — hugs the tray edge (viewport right when closed, left edge of tray when open) */}
      <button
        ref={railRef}
        type="button"
        onClick={() => (drawerOpen ? onCloseDrawer() : onOpenDrawer())}
        aria-label={drawerOpen ? 'Close navigation panel' : 'Open navigation panel'}
        aria-expanded={drawerOpen}
        className="max-md:hidden fixed top-1/2 z-[44] flex h-12 w-6 -translate-y-1/2 items-center justify-center border border-terminal-dim/40 border-r-0 bg-terminal-bg/95 text-terminal-dim shadow-[-4px_0_12px_rgba(0,0,0,0.2)] transition-[right,colors] duration-200 ease-out hover:border-terminal-text hover:text-terminal-text"
        style={{
          right: drawerOpen ? `${TRAY_W_REM}rem` : 0,
          borderTopLeftRadius: 4,
          borderBottomLeftRadius: 4,
        }}
      >
        <ChevronRight
          size={14}
          strokeWidth={2}
          className={`transition-transform duration-200 ${drawerOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dim strip only to the left of the tray — not a full-page takeover */}
      <button
        type="button"
        aria-label="Dismiss navigation panel"
        className={`max-md:hidden fixed inset-y-0 left-0 z-[42] cursor-default border-0 bg-black/20 transition-opacity duration-200 ease-out ${
          drawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={{ right: `${TRAY_W_REM}rem` }}
        onClick={onCloseDrawer}
        tabIndex={drawerOpen ? 0 : -1}
      />

      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="false"
        aria-label="Boards, relays, and appearance"
        tabIndex={-1}
        className={`ui-crt-surface max-md:hidden fixed bottom-0 top-0 z-[43] flex max-w-full flex-col border-l border-terminal-dim/30 bg-terminal-bg/98 shadow-[-10px_0_32px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-out ${TRAY_W_CLASS} ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        } right-0`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-terminal-dim/20 px-3 py-2.5">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-terminal-dim">
            Panel
          </p>
          <button
            ref={closeRef}
            type="button"
            onClick={onCloseDrawer}
            className="flex h-9 w-9 items-center justify-center border border-terminal-dim/30 bg-terminal-text/5 text-terminal-dim transition-colors hover:border-terminal-dim/60 hover:text-terminal-text focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-text/50"
            aria-label="Close panel"
          >
            <ChevronRight size={13} strokeWidth={2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
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
