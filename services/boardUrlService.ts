/**
 * Path-based board deep links: `/board/<boardId>` (respects Vite `base` / `import.meta.env.BASE_URL`).
 */

import { StorageKeys } from '../config';

/** Stored in localStorage when the user explicitly selects the global feed */
export const GLOBAL_BOARD_SENTINEL = '__global__';

export function appBasePath(): string {
  const b = import.meta.env.BASE_URL || '/';
  if (b === '/') return '';
  return b.endsWith('/') ? b.slice(0, -1) : b;
}

export function boardListPathPrefix(): string {
  const base = appBasePath();
  return base ? `${base}/board/` : '/board/';
}

export function isAppRootPathname(pathname: string): boolean {
  const base = appBasePath();
  if (!base) return pathname === '/' || pathname === '';
  return pathname === base || pathname === `${base}/`;
}

export function parseBoardIdFromPathname(pathname: string): string | null {
  const prefix = boardListPathPrefix();
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const segment = rest.split('/')[0];
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export function buildBoardPathname(boardId: string): string {
  const prefix = boardListPathPrefix();
  return `${prefix}${encodeURIComponent(boardId)}`;
}

export type LastBoardPreference = 'unset' | 'global' | string;

export function readLastBoardPreference(): LastBoardPreference {
  try {
    if (typeof localStorage === 'undefined') return 'unset';
    const raw = localStorage.getItem(StorageKeys.LAST_ACTIVE_BOARD_ID);
    if (raw === null) return 'unset';
    if (raw === GLOBAL_BOARD_SENTINEL) return 'global';
    const id = raw.trim();
    return id.length > 0 ? id : 'unset';
  } catch {
    return 'unset';
  }
}

export function persistLastActiveBoardId(boardId: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (boardId === null) {
      localStorage.setItem(StorageKeys.LAST_ACTIVE_BOARD_ID, GLOBAL_BOARD_SENTINEL);
      return;
    }
    localStorage.setItem(StorageKeys.LAST_ACTIVE_BOARD_ID, boardId);
  } catch {
    // ignore quota / private mode
  }
}
