import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { BoardType, type Board } from '../types';
import { INITIAL_BOARDS } from '../constants';
import { StorageKeys } from '../config';

interface BoardStoreState {
  // State
  boards: Board[];
  locationBoards: Board[];
  activeBoardId: string | null;

  // Actions
  setBoards: (boards: Board[] | ((prev: Board[]) => Board[])) => void;
  setLocationBoards: (boards: Board[] | ((prev: Board[]) => Board[])) => void;
  setActiveBoardId: (id: string | null) => void;
}

/**
 * Merge cached boards with INITIAL_BOARDS.
 * - All INITIAL_BOARDS are always included (ensures updates propagate to users)
 * - User-created boards from cache are preserved
 */
function mergeWithInitialBoards(cachedBoards: Board[]): Board[] {
  const initialBoardIds = new Set(INITIAL_BOARDS.map((b) => b.id));

  // Start with all default boards (ensures updates to defaults propagate)
  const merged = [...INITIAL_BOARDS];

  // Add any user-created boards from cache (boards not in INITIAL_BOARDS)
  for (const cached of cachedBoards) {
    if (!initialBoardIds.has(cached.id)) {
      merged.push(cached);
    }
  }

  return merged;
}

function loadInitialBoards(): Board[] {
  try {
    if (typeof localStorage === 'undefined') return INITIAL_BOARDS;
    const raw = localStorage.getItem(StorageKeys.BOARDS_CACHE);
    if (!raw) return INITIAL_BOARDS;
    const parsed = JSON.parse(raw) as { savedAt?: number; boards?: unknown };
    if (!parsed || !Array.isArray(parsed.boards)) return INITIAL_BOARDS;

    const cachedBoards = parsed.boards.filter(
      (b: unknown) =>
        b &&
        typeof b === 'object' &&
        'id' in b &&
        'name' in b &&
        typeof (b as Board).id === 'string' &&
        typeof (b as Board).name === 'string'
    ) as Board[];

    // Merge cached boards with INITIAL_BOARDS to ensure new defaults appear
    return mergeWithInitialBoards(cachedBoards);
  } catch (error) {
    console.error('[boardStore] Failed to load cached boards:', error);
    return INITIAL_BOARDS;
  }
}

export const useBoardStore = create<BoardStoreState>()(
  subscribeWithSelector((set) => ({
    boards: loadInitialBoards(),
    locationBoards: [],
    activeBoardId: null,

    setBoards: (updater) => {
      const currentBoards = useBoardStore.getState().boards;
      const newBoards = typeof updater === 'function' ? updater(currentBoards) : updater;
      set({ boards: newBoards });
    },

    setLocationBoards: (updater) => {
      const currentBoards = useBoardStore.getState().locationBoards;
      const newBoards = typeof updater === 'function' ? updater(currentBoards) : updater;
      set({ locationBoards: newBoards });
    },

    setActiveBoardId: (id) => {
      set({ activeBoardId: id });
    },
  }))
);

// Computed selectors (using useMemo pattern via selectors)
export const useBoards = () => useBoardStore((state) => state.boards);
export const useLocationBoards = () => useBoardStore((state) => state.locationBoards);
export const useActiveBoardId = () => useBoardStore((state) => state.activeBoardId);

export const useBoardsById = () =>
  useBoardStore((state) => {
    const map = new Map<string, Board>();
    state.boards.forEach((b) => map.set(b.id, b));
    state.locationBoards.forEach((b) => map.set(b.id, b));
    return map;
  });

export const useTopicBoards = () =>
  useBoardStore((state) => state.boards.filter((b) => b.type === BoardType.TOPIC));

export const useGeohashBoards = () =>
  useBoardStore((state) => {
    const geohashBoardsFromState = state.boards.filter((b) => b.type === BoardType.GEOHASH);
    const geohashBoardsMap = new Map<string, Board>();
    // Add boards from state first
    geohashBoardsFromState.forEach((b) => geohashBoardsMap.set(b.id, b));
    // Add location boards, which will overwrite duplicates (locationBoards take precedence)
    state.locationBoards.forEach((b) => geohashBoardsMap.set(b.id, b));
    return Array.from(geohashBoardsMap.values());
  });

export const useActiveBoard = () =>
  useBoardStore((state) => {
    if (!state.activeBoardId) return null;
    const allBoards = [...state.boards, ...state.locationBoards];
    return allBoards.find((b) => b.id === state.activeBoardId) || null;
  });

export const useBoardById = (id: string) =>
  useBoardStore((state) => {
    const allBoards = [...state.boards, ...state.locationBoards];
    return allBoards.find((b) => b.id === id);
  });
