import React, { useState, useMemo } from 'react';
import { ArrowLeft, Hash, Lock, Globe, Plus, Shield, Key, Link2, Check, AlertTriangle, Unlock } from 'lucide-react';
import type { Board, Post } from '../types';
import { ViewMode } from '../types';
import { encryptedBoardService } from '../services/encryptedBoardService';
import { toastService } from '../services/toastService';
import { UIConfig } from '../config';
import { enrichBoardsWithMemberCounts } from '../services/boardMemberService';

interface BoardBrowserProps {
  topicBoards: Board[];
  posts: Post[];
  onNavigateToBoard: (id: string | null) => void;
  onSetViewMode: (mode: ViewMode) => void;
  onClose: () => void;
}

export function BoardBrowser({ topicBoards, posts, onNavigateToBoard, onSetViewMode, onClose }: BoardBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [shareLinkInput, setShareLinkInput] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  // Get IDs of boards we have keys for
  const encryptedBoardIds = useMemo(() => new Set(encryptedBoardService.getEncryptedBoardIds()), []);

  // Calculate real member counts from posts and comments
  const boardsWithRealMemberCounts = useMemo(() => {
    return enrichBoardsWithMemberCounts(topicBoards, posts);
  }, [topicBoards, posts]);

  const handleImportShareLink = () => {
    setImportError(null);
    setImportSuccess(false);

    if (!shareLinkInput.trim()) {
      setImportError('Please enter a share link');
      return;
    }

    try {
      // Try to parse the share link
      const result = encryptedBoardService.importFromShareLink(shareLinkInput.trim());
      
      if (result) {
        setImportSuccess(true);
        setShareLinkInput('');
        toastService.push({
          type: 'success',
          message: 'Board access granted',
          detail: `You can now decrypt content in board ${result.boardId.slice(0, 8)}...`,
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: 'share-link-imported',
        });
        
        // Navigate to the board after a short delay
        setTimeout(() => {
          onNavigateToBoard(result.boardId);
        }, 500);
      } else {
        setImportError('Invalid share link format');
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to import share link');
    }
  };

  // Filter boards based on search query
  const filteredBoards = useMemo(() => {
    if (!searchQuery.trim()) return boardsWithRealMemberCounts;

    const query = searchQuery.toLowerCase().trim();
    return boardsWithRealMemberCounts.filter(board =>
      board.name.toLowerCase().includes(query) ||
      board.description.toLowerCase().includes(query)
    );
  }, [boardsWithRealMemberCounts, searchQuery]);

  const publicBoards = filteredBoards.filter(b => b.isPublic && !b.isEncrypted);
  const privateBoards = filteredBoards.filter(b => !b.isPublic && !b.isEncrypted);
  const encryptedBoards = filteredBoards.filter(b => b.isEncrypted);

  const handleBoardClick = (boardId: string, board: Board) => {
    // Check if it's an encrypted board without key
    if (board.isEncrypted && !encryptedBoardIds.has(boardId)) {
      toastService.push({
        type: 'error',
        message: 'Access denied',
        detail: 'You need a share link to access this encrypted board',
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'encrypted-no-key',
      });
      return;
    }
    onNavigateToBoard(boardId);
  };

  const BoardCard: React.FC<{ board: Board }> = ({ board }) => {
    const hasKey = encryptedBoardIds.has(board.id);
    const isLocked = board.isEncrypted && !hasKey;

    return (
      <div
        onClick={() => handleBoardClick(board.id, board)}
        className={`border p-4 bg-terminal-bg transition-all group ${
          isLocked 
            ? 'border-terminal-dim/50 cursor-not-allowed opacity-60' 
            : 'border-terminal-dim hover:border-terminal-text cursor-pointer'
        }`}
      >
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-bold text-terminal-text flex items-center gap-2">
            {board.isEncrypted ? (
              hasKey ? (
                <Unlock size={14} className="text-terminal-text" />
              ) : (
                <Lock size={14} className="text-terminal-dim" />
              )
            ) : !board.isPublic ? (
              <Lock size={14} className="text-terminal-dim" />
            ) : (
              <Hash size={14} className="text-terminal-dim group-hover:text-terminal-text" />
            )}
            {board.name}
          </h3>
          <div className="flex items-center gap-2">
            {board.isEncrypted && (
              <span className={`text-[10px] uppercase flex items-center gap-1 ${hasKey ? 'text-terminal-text' : 'text-terminal-dim'}`}>
                <Shield size={10} />
                {hasKey ? 'DECRYPTED' : 'ENCRYPTED'}
              </span>
            )}
            {!board.isEncrypted && (
              <span className="text-[10px] text-terminal-dim uppercase">
                {board.isPublic ? 'PUBLIC' : 'PRIVATE'}
              </span>
            )}
          </div>
        </div>

        <p className="text-sm text-terminal-dim mb-3 line-clamp-2">
          {isLocked ? '[ENCRYPTED CONTENT - SHARE LINK REQUIRED]' : board.description}
        </p>

        <div className="flex items-center justify-between">
          <span className="text-xs text-terminal-dim">
            MEMBERS: {board.memberCount}
          </span>
          <div className={`text-xs transition-opacity ${isLocked ? 'opacity-100 text-terminal-dim' : 'opacity-0 group-hover:opacity-100 text-terminal-text'}`}>
            {isLocked ? 'LOCKED' : 'ENTER →'}
          </div>
        </div>
      </div>
    );
  };

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

      {/* Import Share Link */}
      <div className="mb-8 border border-terminal-dim p-4 bg-terminal-bg/50">
        <h3 className="text-sm font-bold border-b border-terminal-dim mb-3 pb-1 text-terminal-text flex items-center gap-2">
          <Link2 size={14} />
          IMPORT_SHARE_LINK
        </h3>
        <p className="text-xs text-terminal-dim mb-3">
          Have a share link for an encrypted board? Paste it below to gain access.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-2 text-terminal-dim text-sm">
              <Key size={12} />
            </span>
            <input
              type="text"
              value={shareLinkInput}
              onChange={(e) => {
                setShareLinkInput(e.target.value);
                setImportError(null);
                setImportSuccess(false);
              }}
              placeholder="Paste share link here..."
              className="w-full bg-terminal-bg border border-terminal-dim py-2 pl-8 pr-4 text-xs text-terminal-text font-mono focus:outline-none focus:border-terminal-text focus:ring-1 focus:ring-terminal-text/50 transition-all"
            />
          </div>
          <button
            onClick={handleImportShareLink}
            className="px-4 py-2 border border-terminal-dim text-xs text-terminal-dim hover:bg-terminal-text hover:text-terminal-bg hover:border-terminal-text transition-all uppercase flex items-center gap-1"
          >
            <Key size={12} />
            IMPORT
          </button>
        </div>
        {importError && (
          <div className="mt-2 text-xs text-terminal-alert flex items-center gap-1">
            <AlertTriangle size={12} />
            {importError}
          </div>
        )}
        {importSuccess && (
          <div className="mt-2 text-xs text-terminal-text flex items-center gap-1">
            <Check size={12} />
            Key imported successfully! Redirecting...
          </div>
        )}
      </div>

      {/* Encrypted Boards */}
      {encryptedBoards.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold border-b border-terminal-dim mb-4 pb-1 text-terminal-text flex items-center gap-2">
            <Shield size={16} />
            ENCRYPTED_CHANNELS
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {encryptedBoards.map(board => (
              <BoardCard key={board.id} board={board} />
            ))}
          </div>
        </div>
      )}

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
