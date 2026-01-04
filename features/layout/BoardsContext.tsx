import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { Board, BoardType } from '../../types';
import { INITIAL_BOARDS } from '../../constants';
import { StorageKeys } from '../../config';

interface BoardsContextType {
  // Boards data
  boards: Board[];
  locationBoards: Board[];
  topicBoards: Board[];
  geohashBoards: Board[];
  boardsById: Map<string, Board>;

  // Actions
  setBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  setLocationBoards: React.Dispatch<React.SetStateAction<Board[]>>;

  // Helpers
  getBoardName: (postId: string) => string | undefined;
}

const BoardsContext = createContext<BoardsContextType | null>(null);

interface BoardsProviderProps {
  children: React.ReactNode;
}

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

export const BoardsProvider: React.FC<BoardsProviderProps> = ({ children }) => {
  const [boards, setBoards] = useState<Board[]>(() => {
    try {
      if (typeof localStorage === 'undefined') return INITIAL_BOARDS;
      const raw = localStorage.getItem(StorageKeys.BOARDS_CACHE);
      if (!raw) return INITIAL_BOARDS;
      const parsed = JSON.parse(raw) as { savedAt?: number; boards?: unknown };
      if (!parsed || !Array.isArray(parsed.boards)) return INITIAL_BOARDS;

      const cachedBoards = parsed.boards.filter((b: any) =>
        b && typeof b.id === 'string' && typeof b.name === 'string'
      ) as Board[];
      
      // Merge cached boards with INITIAL_BOARDS to ensure new defaults appear
      return mergeWithInitialBoards(cachedBoards);
    } catch (error) {
      console.error('[BoardsContext] Failed to load cached boards:', error);
      return INITIAL_BOARDS;
    }
  });

  const [locationBoards, setLocationBoards] = useState<Board[]>([]);

  // Save boards to cache when they change
  useEffect(() => {
    if (boards.length === 0) return;
    const timeoutId = window.setTimeout(() => {
      try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(
          StorageKeys.BOARDS_CACHE,
          JSON.stringify({ savedAt: Date.now(), boards })
        );
      } catch (error) {
        console.error('[BoardsContext] Failed to cache boards:', error);
      }
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [boards]);

  // Computed values
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

  // Helper functions
  const getBoardName = (_postId: string) => {
    // This is a simplified implementation - in a real app you'd have post-to-board mapping
    // For now, return undefined as boards are determined by filters
    return undefined;
  };

  const contextValue: BoardsContextType = {
    boards,
    locationBoards,
    topicBoards,
    geohashBoards,
    boardsById,
    setBoards,
    setLocationBoards,
    getBoardName,
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
