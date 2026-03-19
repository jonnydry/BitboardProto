import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Globe,
  Hash,
  Key,
  Lock,
  Plus,
  Shield,
  Unlock,
  AlertTriangle,
  Check,
} from 'lucide-react';
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

export function BoardBrowser({
  topicBoards,
  posts,
  onNavigateToBoard,
  onSetViewMode,
  onClose,
}: BoardBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [shareLinkInput, setShareLinkInput] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  const encryptedBoardIds = useMemo(
    () => new Set(encryptedBoardService.getEncryptedBoardIds()),
    [],
  );

  const boardsWithRealMemberCounts = useMemo(
    () => enrichBoardsWithMemberCounts(topicBoards, posts),
    [topicBoards, posts],
  );

  const filteredBoards = useMemo(() => {
    if (!searchQuery.trim()) return boardsWithRealMemberCounts;
    const query = searchQuery.toLowerCase().trim();
    return boardsWithRealMemberCounts.filter(
      (board) =>
        board.name.toLowerCase().includes(query) || board.description.toLowerCase().includes(query),
    );
  }, [boardsWithRealMemberCounts, searchQuery]);

  const publicBoards = filteredBoards.filter((board) => board.isPublic && !board.isEncrypted);
  const privateBoards = filteredBoards.filter((board) => !board.isPublic && !board.isEncrypted);
  const encryptedBoards = filteredBoards.filter((board) => board.isEncrypted);

  const handleImportShareLink = () => {
    setImportError(null);
    setImportSuccess(false);

    if (!shareLinkInput.trim()) {
      setImportError('Please enter a share link');
      return;
    }

    try {
      const result = encryptedBoardService.importFromShareLink(shareLinkInput.trim());
      if (!result) {
        setImportError('Invalid share link format');
        return;
      }

      setImportSuccess(true);
      setShareLinkInput('');
      toastService.push({
        type: 'success',
        message: 'Board access granted',
        detail: `You can now decrypt content in board ${result.boardId.slice(0, 8)}...`,
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'share-link-imported',
      });

      setTimeout(() => {
        onNavigateToBoard(result.boardId);
      }, 500);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to import share link');
    }
  };

  const handleBoardClick = (board: Board) => {
    if (board.isEncrypted && !encryptedBoardIds.has(board.id)) {
      toastService.push({
        type: 'error',
        message: 'Access denied',
        detail: 'You need a share link to access this encrypted board',
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'encrypted-no-key',
      });
      return;
    }
    onNavigateToBoard(board.id);
  };

  const BoardCard: React.FC<{ board: Board }> = ({ board }) => {
    const hasKey = encryptedBoardIds.has(board.id);
    const isLocked = board.isEncrypted && !hasKey;

    return (
      <button
        type="button"
        onClick={() => handleBoardClick(board)}
        disabled={isLocked}
        className={`w-full border p-4 bg-terminal-bg transition-all group text-left ${
          isLocked
            ? 'border-terminal-dim/50 cursor-not-allowed opacity-60'
            : 'border-terminal-dim hover:border-terminal-text cursor-pointer'
        }`}
      >
        <div className="mb-2 flex items-start justify-between">
          <h3 className="flex items-center gap-2 font-bold text-terminal-text">
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
            {board.isEncrypted ? (
              <span
                className={`text-xs uppercase flex items-center gap-1 ${hasKey ? 'text-terminal-text' : 'text-terminal-dim'}`}
              >
                <Shield size={10} />
                {hasKey ? 'DECRYPTED' : 'ENCRYPTED'}
              </span>
            ) : (
              <span className="text-xs text-terminal-dim uppercase">
                {board.isPublic ? 'PUBLIC' : 'PRIVATE'}
              </span>
            )}
          </div>
        </div>

        <p className="mb-3 line-clamp-2 text-sm text-terminal-dim">
          {isLocked ? '[ENCRYPTED CONTENT - SHARE LINK REQUIRED]' : board.description}
        </p>

        <div className="flex items-center justify-between text-xs">
          <span className="text-terminal-dim">MEMBERS: {board.memberCount}</span>
          <span
            className={
              isLocked
                ? 'text-terminal-dim uppercase tracking-wide'
                : 'text-terminal-text uppercase tracking-wide'
            }
          >
            {isLocked ? 'Share Link Required' : 'Open Board'}
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="animate-fade-in">
      <button
        onClick={onClose}
        className="mb-4 flex items-center gap-2 text-sm font-bold uppercase text-terminal-dim group hover:text-terminal-text"
      >
        <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" />
        BACK TO FEED
      </button>

      <div className="mb-6 flex items-end justify-between border-b border-terminal-dim/30 pb-2">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-terminal uppercase tracking-widest text-terminal-text">
            <Hash size={24} />
            BOARDS
          </h2>
          <p className="mt-1 text-xs text-terminal-dim">
            {filteredBoards.length} {filteredBoards.length === 1 ? 'board' : 'boards'} visible
          </p>
        </div>

        <button
          onClick={() => onSetViewMode(ViewMode.CREATE_BOARD)}
          className="flex items-center gap-2 border border-terminal-dim border-dashed p-2 text-xs uppercase text-terminal-dim transition-all hover:border-solid hover:bg-terminal-text hover:text-terminal-bg"
        >
          <Plus size={12} />
          CREATE BOARD
        </button>
      </div>

      <div className="mb-6 relative">
        <span className="absolute left-3 top-2.5 text-sm text-terminal-dim">&gt;</span>
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search boards by name or description..."
          className="w-full border border-terminal-dim bg-terminal-bg py-2 pl-8 pr-4 text-sm text-terminal-text font-mono focus:border-terminal-text focus:outline-none focus:ring-1 focus:ring-terminal-text/50"
        />
      </div>

      <div className="mb-8 border border-terminal-dim bg-terminal-bg/50 p-4">
        <div className="text-sm font-bold uppercase tracking-wide text-terminal-text">
          Import Access
        </div>
        <p className="mb-3 mt-2 text-xs text-terminal-dim">
          Have a share link for an encrypted BitBoard board? Paste it here to unlock the board.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-2 text-terminal-dim text-sm">
              <Key size={12} />
            </span>
            <input
              type="text"
              value={shareLinkInput}
              onChange={(event) => {
                setShareLinkInput(event.target.value);
                setImportError(null);
                setImportSuccess(false);
              }}
              placeholder="Paste share link here..."
              className="w-full border border-terminal-dim bg-terminal-bg py-2 pl-8 pr-4 text-xs text-terminal-text font-mono focus:border-terminal-text focus:outline-none focus:ring-1 focus:ring-terminal-text/50"
            />
          </div>
          <button
            onClick={handleImportShareLink}
            className="flex items-center gap-1 border border-terminal-dim px-4 py-2 text-xs uppercase text-terminal-dim transition-all hover:border-terminal-text hover:bg-terminal-text hover:text-terminal-bg"
          >
            <Key size={12} />
            Import
          </button>
        </div>
        {importError && (
          <div className="mt-2 flex items-center gap-1 text-xs text-terminal-alert">
            <AlertTriangle size={12} />
            {importError}
          </div>
        )}
        {importSuccess && (
          <div className="mt-2 flex items-center gap-1 text-xs text-terminal-text">
            <Check size={12} />
            Key imported successfully! Redirecting...
          </div>
        )}
      </div>

      {encryptedBoards.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-4 flex items-center gap-2 border-b border-terminal-dim pb-1 text-lg font-bold text-terminal-text">
            <Shield size={16} />
            ENCRYPTED BOARDS
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {encryptedBoards.map((board) => (
              <BoardCard key={board.id} board={board} />
            ))}
          </div>
        </div>
      )}

      {publicBoards.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-4 flex items-center gap-2 border-b border-terminal-dim pb-1 text-lg font-bold text-terminal-text">
            <Globe size={16} />
            PUBLIC BOARDS
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {publicBoards.map((board) => (
              <BoardCard key={board.id} board={board} />
            ))}
          </div>
        </div>
      )}

      {privateBoards.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-4 flex items-center gap-2 border-b border-terminal-dim pb-1 text-lg font-bold text-terminal-text">
            <Lock size={16} />
            PRIVATE BOARDS
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {privateBoards.map((board) => (
              <BoardCard key={board.id} board={board} />
            ))}
          </div>
        </div>
      )}

      {filteredBoards.length === 0 && (
        <div className="flex flex-col items-center gap-4 border border-terminal-dim p-12 text-center text-terminal-dim">
          <Hash size={48} className="opacity-20" />
          <div>
            <p className="font-bold">&gt; NO BOARDS FOUND</p>
            <p className="mt-2 text-xs">
              {searchQuery.trim()
                ? `No boards match "${searchQuery}".`
                : 'Be the first to create a board for this frequency.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
