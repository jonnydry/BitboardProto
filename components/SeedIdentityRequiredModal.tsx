import React from 'react';
import { AlertTriangle, KeyRound, Upload, X } from 'lucide-react';
import type { Post } from '../types';

interface SeedIdentityRequiredModalProps {
  post: Post;
  onClose: () => void;
  onCreateIdentity: () => void;
  onImportIdentity: () => void;
}

export const SeedIdentityRequiredModal: React.FC<SeedIdentityRequiredModalProps> = ({
  post,
  onClose,
  onCreateIdentity,
  onImportIdentity,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-xl border-2 border-terminal-text bg-terminal-bg p-6 shadow-hard-lg animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="seed-identity-gate-title"
      >
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-terminal-dim pb-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 border border-terminal-dim/40 px-2 py-1 text-xs uppercase tracking-wider text-terminal-dim">
              <AlertTriangle size={12} /> Identity Required
            </div>
            <h2
              id="seed-identity-gate-title"
              className="text-lg font-bold uppercase text-terminal-text"
            >
              Connect A Nostr Identity To Seed
            </h2>
            <p className="mt-2 text-sm text-terminal-dim">
              Seeding creates a native BitBoard copy of a Nostr note. You need a Nostr identity
              first so the seeded post can be signed and attributed correctly.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-terminal-dim transition-colors hover:text-terminal-text"
            aria-label="Close identity gate"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mb-5 border border-terminal-dim/30 bg-terminal-dim/5 p-4">
          <div className="text-xs uppercase tracking-wider text-terminal-dim">Source Note</div>
          <h3 className="mt-2 text-lg font-semibold text-terminal-text">{post.title}</h3>
          <p className="mt-2 line-clamp-3 text-sm text-terminal-dim/80">{post.content}</p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={onCreateIdentity}
            className="flex w-full items-center justify-center gap-2 border border-terminal-text bg-terminal-text px-4 py-3 text-sm font-bold uppercase tracking-wide text-black transition-colors hover:bg-terminal-dim hover:text-terminal-bg"
          >
            <KeyRound size={16} />
            Create New Identity
          </button>

          <button
            type="button"
            onClick={onImportIdentity}
            className="flex w-full items-center justify-center gap-2 border border-terminal-dim px-4 py-3 text-sm uppercase tracking-wide text-terminal-dim transition-colors hover:border-terminal-text hover:text-terminal-text"
          >
            <Upload size={16} />
            Import Existing Key
          </button>
        </div>

        <div className="mt-5 border border-terminal-dim/30 bg-terminal-dim/5 p-3 text-xs text-terminal-dim">
          After you finish identity setup, BitBoard will bring you back to the seed flow.
        </div>
      </div>
    </div>
  );
};
