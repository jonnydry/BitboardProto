import React, { useEffect, useRef } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useBitsBarPinned, useBitsBarHeight } from '../../stores/uiStore';

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
  const railRef = useRef<HTMLButtonElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const bitsBarPinned = useBitsBarPinned();
  const bitsBarHeight = useBitsBarHeight();

  useEffect(() => {
    if (!drawerOpen) {
      prevFocusRef.current?.focus();
      prevFocusRef.current = null;
      return;
    }

    prevFocusRef.current = document.activeElement as HTMLElement;
    drawerRef.current?.focus();

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
      {/* Floating toggle — styled like the feed FABs */}
      <button
        ref={railRef}
        type="button"
        onClick={() => (drawerOpen ? onCloseDrawer() : onOpenDrawer())}
        aria-label={drawerOpen ? 'Close navigation panel' : 'Open navigation panel'}
        aria-expanded={drawerOpen}
        className="max-md:hidden fixed z-[44] flex h-12 w-12 items-center justify-center rounded-sm bg-terminal-text text-black shadow-hard transition-[right,transform,filter] duration-200 ease-out hover:scale-110 hover:brightness-110"
        style={{
          top: bitsBarPinned ? bitsBarHeight + 32 : 32,
          right: drawerOpen
            ? `calc(${TRAY_W_REM}rem + 1rem)`
            : 'max(0px, calc((100vw - 1174px) / 2 - 3rem))',
        }}
      >
        <ChevronLeft
          size={14}
          strokeWidth={2.5}
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
        <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {children}
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
