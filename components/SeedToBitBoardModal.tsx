import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Radio, X, ArrowRight, AlertTriangle } from 'lucide-react';
import type { Board, Post } from '../types';

interface SeedToBitBoardModalProps {
  post: Post;
  boards: Board[];
  remainingSeeds: number;
  onClose: () => void;
  onSubmit: (boardId: string) => Promise<void>;
}

export const SeedToBitBoardModal: React.FC<SeedToBitBoardModalProps> = ({
  post,
  boards,
  remainingSeeds,
  onClose,
  onSubmit,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState(boards[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const destinationBoard = useMemo(
    () => boards.find((board) => board.id === selectedBoardId) ?? null,
    [boards, selectedBoardId],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!selectedBoardId) {
      setError('Choose a BitBoard destination first.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(selectedBoardId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to seed post.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="ui-overlay flex items-center justify-center p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className="ui-surface-modal max-w-2xl p-6 animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="seed-post-title"
      >
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-terminal-dim/15 pb-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 border border-terminal-dim/40 px-2 py-1 text-xs uppercase tracking-wider text-terminal-dim">
              <Radio size={12} /> Seeded From Nostr
            </div>
            <h2
              id="seed-post-title"
              className="font-display text-2xl font-semibold text-terminal-text"
            >
              Seed This Post Into BitBoard
            </h2>
            <p className="mt-2 text-sm text-terminal-dim">
              This creates a native BitBoard post with provenance preserved in the header.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-terminal-dim transition-colors hover:text-terminal-text"
            aria-label="Close seed dialog"
            ref={closeButtonRef}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="border border-terminal-dim/20 bg-terminal-dim/5 p-4">
            <div className="text-xs uppercase tracking-wider text-terminal-dim">Source Note</div>
            <h3 className="mt-2 text-xl font-semibold text-terminal-text">{post.title}</h3>
            <p className="mt-2 line-clamp-4 text-sm text-terminal-dim/80">{post.content}</p>
          </div>

          <div>
            <label className="mb-2 block text-xs uppercase tracking-wider text-terminal-dim">
              Destination BitBoard
            </label>
            <select
              value={selectedBoardId}
              onChange={(event) => setSelectedBoardId(event.target.value)}
              className="ui-input"
            >
              <option value="" disabled>
                Choose a destination board
              </option>
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </select>
            {destinationBoard && (
              <p className="mt-2 text-xs text-terminal-dim">{destinationBoard.description}</p>
            )}
          </div>

          <div className="flex items-start gap-2 border border-terminal-dim/30 bg-terminal-dim/5 p-3 text-xs text-terminal-dim">
            <ArrowRight size={14} className="mt-0.5 shrink-0" />
            <div>
              <div>{remainingSeeds} seeds remaining in the current 24-hour window.</div>
              <div className="mt-1">
                Seeded posts are snapshots, not live mirrors of the source thread.
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 border border-terminal-alert/40 bg-terminal-alert/5 p-3 text-sm text-terminal-alert">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-terminal-dim/20 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="ui-button-secondary px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedBoardId}
              className="ui-button-primary px-4 py-2 text-sm disabled:opacity-60"
            >
              {isSubmitting ? 'Seeding...' : 'Seed To BitBoard'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
