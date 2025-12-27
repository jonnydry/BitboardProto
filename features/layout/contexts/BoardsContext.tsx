import React, { createContext, useContext, useState, useMemo } from 'react';
import type { Board, BoardType } from '../../../types';

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

export const BoardsProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [boards, setBoards] = useState<Board[]>([]);
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