import React, { useState, useMemo } from 'react';
import { ArrowLeft, Hash, Lock, Globe, Plus } from 'lucide-react';
import type { Board } from '../types';
import { ViewMode } from '../types';

interface BoardBrowserProps {
  topicBoards: Board[];
  onNavigateToBoard: (id: string | null) => void;
  onSetViewMode: (mode: ViewMode) => void;
  onClose: () => void;
}

export function BoardBrowser({ topicBoards, onNavigateToBoard, onSetViewMode, onClose }: BoardBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter boards based on search query
  const filteredBoards = useMemo(() => {
    if (!searchQuery.trim()) return topicBoards;

    const query = searchQuery.toLowerCase().trim();
    return topicBoards.filter(board =>
      board.name.toLowerCase().includes(query) ||
      board.description.toLowerCase().includes(query)
    );
  }, [topicBoards, searchQuery]);

  const publicBoards = filteredBoards.filter(b => b.isPublic);
  const privateBoards = filteredBoards.filter(b => !b.isPublic);

  const handleBoardClick = (boardId: string) => {
    onNavigateToBoard(boardId);
  };

  const BoardCard = ({ board }: { board: Board }) => (
    <div
      onClick={() => handleBoardClick(board.id)}
      className="border border-terminal-dim p-4 bg-terminal-bg hover:border-terminal-text transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-bold text-terminal-text flex items-center gap-2">
          {!board.isPublic && <Lock size={14} className="text-terminal-dim" />}
          {board.isPublic && <Hash size={14} className="text-terminal-dim group-hover:text-terminal-text" />}
          {board.name}
        </h3>
        <span className="text-[10px] text-terminal-dim uppercase">
          {board.isPublic ? 'PUBLIC' : 'PRIVATE'}
        </span>
      </div>

      <p className="text-sm text-terminal-dim mb-3 line-clamp-2">
        {board.description}
      </p>

      <div className="flex items-center justify-between">
        <span className="text-xs text-terminal-dim">
          MEMBERS: {board.memberCount}
        </span>
        <div className="text-xs text-terminal-text opacity-0 group-hover:opacity-100 transition-opacity">
          ENTER →
        </div>
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in">
      <button
        onClick={onClose}
        className="flex items-center gap-2 text-terminal-dim hover:text-terminal-text mb-4 uppercase text-sm font-bold group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        BACK TO FEED
      </button>

      {/* Header */}
      <div className="flex justify-between items-end mb-6 pb-2 border-b border-terminal-dim/30">
        <div>
          <h2 className="text-2xl font-terminal uppercase tracking-widest text-terminal-text flex items-center gap-2">
            <Hash size={24} />
            BOARD_DIRECTORY
          </h2>
          <p className="text-xs text-terminal-dim mt-1">
            {filteredBoards.length} {filteredBoards.length === 1 ? 'board' : 'boards'} available
          </p>
        </div>

        <button
          onClick={() => onSetViewMode(ViewMode.CREATE_BOARD)}
          className="flex items-center gap-2 text-xs border border-terminal-dim border-dashed text-terminal-dim p-2 hover:text-terminal-bg hover:bg-terminal-text hover:border-solid transition-all uppercase"
        >
          <Plus size={12} />
          CREATE_BOARD
        </button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <span className="absolute left-3 top-2.5 text-terminal-dim text-sm">{'>'}</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search boards by name or description..."
            className="w-full bg-terminal-bg border border-terminal-dim py-2 pl-8 pr-4 text-sm text-terminal-text font-mono focus:outline-none focus:border-terminal-text focus:ring-1 focus:ring-terminal-text/50 transition-all"
          />
        </div>
      </div>

      {/* Public Boards */}
      {publicBoards.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold border-b border-terminal-dim mb-4 pb-1 text-terminal-text flex items-center gap-2">
            <Globe size={16} />
            PUBLIC_SECTORS
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {publicBoards.map(board => (
              <BoardCard key={board.id} board={board} />
            ))}
          </div>
        </div>
      )}

      {/* Private Boards */}
      {privateBoards.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold border-b border-terminal-dim mb-4 pb-1 text-terminal-text flex items-center gap-2">
            <Lock size={16} />
            PRIVATE_CHANNELS
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {privateBoards.map(board => (
              <BoardCard key={board.id} board={board} />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {filteredBoards.length === 0 && searchQuery.trim() && (
        <div className="border border-terminal-dim p-12 text-center text-terminal-dim flex flex-col items-center gap-4">
          <div className="text-4xl opacity-20">
            <Hash size={48} />
          </div>
          <div>
            <p className="font-bold">&gt; NO BOARDS FOUND</p>
            <p className="text-xs mt-2">
              No boards match "{searchQuery}". Try a different search term.
            </p>
          </div>
        </div>
      )}

      {filteredBoards.length === 0 && !searchQuery.trim() && (
        <div className="border border-terminal-dim p-12 text-center text-terminal-dim flex flex-col items-center gap-4">
          <div className="text-4xl opacity-20">
            <Hash size={48} />
          </div>
          <div>
            <p className="font-bold">&gt; NO BOARDS AVAILABLE</p>
            <p className="text-xs mt-2">
              Be the first to create a board for this frequency.
            </p>
          </div>
          <button
            onClick={() => onSetViewMode(ViewMode.CREATE_BOARD)}
            className="mt-4 px-4 py-2 border border-terminal-dim hover:bg-terminal-dim hover:text-white transition-colors uppercase text-sm"
          >
            [+] INIT_BOARD
          </button>
        </div>
      )}
    </div>
  );
}
