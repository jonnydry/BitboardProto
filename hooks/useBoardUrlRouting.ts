import { useEffect, useRef } from 'react';
import { ViewMode } from '../types';
import { UIConfig } from '../config';
import {
  appBasePath,
  buildBoardPathname,
  isAppRootPathname,
  parseBoardIdFromPathname,
  readLastBoardPreference,
} from '../services/boardUrlService';

/**
 * Keeps `activeBoardId` in sync with `/board/<id>` paths and persists last board for return visits.
 * Global feed uses the app base path only (no `/board/...` segment).
 */
export function useBoardUrlRouting(args: {
  viewMode: ViewMode;
  activeBoardId: string | null;
  setActiveBoardId: (id: string | null) => void;
}): void {
  const { viewMode, activeBoardId, setActiveBoardId } = args;
  const hydratedRef = useRef(false);

  // Initial load + browser back/forward: path → store
  useEffect(() => {
    const applyPathToState = () => {
      const pathname = window.location.pathname;
      const fromPath = parseBoardIdFromPathname(pathname);
      if (fromPath) {
        setActiveBoardId(fromPath);
        hydratedRef.current = true;
        return;
      }

      if (isAppRootPathname(pathname)) {
        if (!hydratedRef.current) {
          hydratedRef.current = true;
          const pref = readLastBoardPreference();
          if (pref === 'unset') {
            setActiveBoardId(UIConfig.DEFAULT_LANDING_BOARD_ID);
            return;
          }
          if (pref === 'global') {
            setActiveBoardId(null);
            return;
          }
          setActiveBoardId(pref);
          return;
        }
        setActiveBoardId(null);
      }
    };

    applyPathToState();
    window.addEventListener('popstate', applyPathToState);
    return () => window.removeEventListener('popstate', applyPathToState);
  }, [setActiveBoardId]);

  // When on app root with a scoped board preference, normalize to `/board/<id>` (replaceState).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (parseBoardIdFromPathname(window.location.pathname)) return;
    if (readLastBoardPreference() === 'global') return;

    const path = window.location.pathname;
    if (!isAppRootPathname(path)) return;

    if (activeBoardId) {
      const url = new URL(window.location.href);
      url.pathname = buildBoardPathname(activeBoardId);
      window.history.replaceState(window.history.state, '', url.toString());
    }
  }, [activeBoardId]);

  // Store → URL (feed only; single-post view keeps pathname and lets ?post= handling win)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (viewMode !== ViewMode.FEED) return;

    const url = new URL(window.location.href);
    const desiredPath = activeBoardId
      ? buildBoardPathname(activeBoardId)
      : appBasePath() || '/';

    if (url.pathname === desiredPath) return;

    url.pathname = desiredPath;
    window.history.replaceState(window.history.state, '', url.toString());
  }, [activeBoardId, viewMode]);
}
