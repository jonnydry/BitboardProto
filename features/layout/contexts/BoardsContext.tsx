import React, { createContext, useContext, useState, useMemo } from 'react';
import { BoardType, type Board } from '../../../types';
import { INITIAL_BOARDS } from '../../../constants';
import { StorageKeys } from '../../../config';

interface BoardsContextType {
  // State
  boards: Board[];
  locationBoards: Board[];
  activeBoardId: string | null;

  // Computed values
  boardsById: Map<string, Board>;
  topicBoards: Board[];
  geohashBoards: Board[];
  activeBoard: Board | null;

  // Actions
  setBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  setLocationBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  setActiveBoardId: (id: string | null) => void;
}

const BoardsContext = createContext<BoardsContextType | null>(null);

/**
 * Merge cached boards with INITIAL_BOARDS.
 * - All INITIAL_BOARDS are always included (ensures updates propagate to users)
 * - User-created boards from cache are preserved
 */
function mergeWithInitialBoards(cachedBoards: Board[]): Board[] {
  const initialBoardIds = new Set(INITIAL_BOARDS.map(b => b.id));
  
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

export const BoardsProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [boards, setBoards] = useState<Board[]>(() => {
    try {
      if (typeof localStorage === 'undefined') return INITIAL_BOARDS;
      const raw = localStorage.getItem(StorageKeys.BOARDS_CACHE);
      if (!raw) return INITIAL_BOARDS;
      const parsed = JSON.parse(raw) as { savedAt?: number; boards?: unknown };
      if (!parsed || !Array.isArray(parsed.boards)) return INITIAL_BOARDS;

      const cachedBoards = parsed.boards.filter((b: unknown) =>
        b && typeof b === 'object' && 'id' in b && 'name' in b &&
        typeof (b as Board).id === 'string' && typeof (b as Board).name === 'string'
      ) as Board[];
      
      // Merge cached boards with INITIAL_BOARDS to ensure new defaults appear
      return mergeWithInitialBoards(cachedBoards);
    } catch (error) {
      console.error('[BoardsContext] Failed to load cached boards:', error);
      return INITIAL_BOARDS;
    }
  });
  const [locationBoards, setLocationBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);

  const boardsById = useMemo(() => {
    const map = new Map<string, Board>();
    boards.forEach(b => map.set(b.id, b));
    locationBoards.forEach(b => map.set(b.id, b));
    return map;
  }, [boards, locationBoards]);

  const topicBoards = useMemo(() => {
    return boards.filter(b => b.type === BoardType.TOPIC);
  }, [boards]);

  const geohashBoards = useMemo(() => {
    const geohashBoardsFromState = boards.filter(b => b.type === BoardType.GEOHASH);
    const geohashBoardsMap = new Map<string, Board>();
    // Add boards from state first
    geohashBoardsFromState.forEach(b => geohashBoardsMap.set(b.id, b));
    // Add location boards, which will overwrite duplicates (locationBoards take precedence)
    locationBoards.forEach(b => geohashBoardsMap.set(b.id, b));
    return Array.from(geohashBoardsMap.values());
  }, [boards, locationBoards]);

  const activeBoard = useMemo(() => {
    return activeBoardId ? boardsById.get(activeBoardId) : null;
  }, [activeBoardId, boardsById]);

  const contextValue: BoardsContextType = {
    boards,
    locationBoards,
    activeBoardId,
    boardsById,
    topicBoards,
    geohashBoards,
    activeBoard,
    setBoards,
    setLocationBoards,
    setActiveBoardId,
  };

  return (
    <BoardsContext.Provider value={contextValue}>
      {children}
    </BoardsContext.Provider>
  );
};

export const useBoards = () => {
  const context = useContext(BoardsContext);
  if (!context) {
    throw new Error('useBoards must be used within a BoardsProvider');
  }
  return context;
};