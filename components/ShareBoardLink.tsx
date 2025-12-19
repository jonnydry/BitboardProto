import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Copy, Check, Key, Link, AlertTriangle } from 'lucide-react';
import { encryptedBoardService } from '../services/encryptedBoardService';
import type { Board } from '../types';

interface ShareBoardLinkProps {
  board: Board;
  onClose: () => void;
}

export const ShareBoardLink: React.FC<ShareBoardLinkProps> = ({ board, onClose }) => {
  const dialogTitleId = `share-board-title-${board.id}`;
  const dialogDescId = `share-board-desc-${board.id}`;
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate share link on mount
  useEffect(() => {
    const key = encryptedBoardService.getBoardKey(board.id);
    if (key) {
      const link = encryptedBoardService.generateShareLink(board.id, key);
      setShareLink(link);
    } else {
      setError('Encryption key not found. You may not have access to share this board.');
    }
  }, [board.id]);

  // Focus close button on mount
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleCopy = async () => {
    if (!shareLink) return;
    
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[ShareBoardLink] Failed to copy:', err);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="bg-terminal-bg border-2 border-terminal-text p-6 max-w-lg w-full shadow-hard-lg animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        aria-describedby={dialogDescId}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-terminal-dim">
          <div className="flex items-center gap-2">
            <Link size={20} />
            <h2 id={dialogTitleId} className="text-lg font-bold uppercase">
              Share Encrypted Board
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-terminal-dim hover:text-terminal-text transition-colors p-1"
            aria-label="Close share dialog"
            ref={closeButtonRef}
          >
            <X size={20} />
          </button>
        </div>

        {/* Board Info */}
        <div className="mb-4 p-3 bg-terminal-dim/10 border border-terminal-dim/30">
          <div className="flex items-center gap-2 mb-1">
            <Key size={14} className="text-terminal-dim" />
            <span className="font-bold">//{board.name}</span>
          </div>
          <p id={dialogDescId} className="text-xs text-terminal-dim">
            {board.description || 'Encrypted private board'}
          </p>
        </div>

        {error ? (
          <div className="p-4 border border-terminal-alert bg-terminal-alert/10 text-terminal-alert flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Warning */}
            <div className="p-3 border border-terminal-alert/30 bg-terminal-alert/5 flex items-start gap-2">
              <AlertTriangle size={14} className="text-terminal-alert mt-0.5 shrink-0" />
              <p className="text-xs text-terminal-dim">
                <span className="text-terminal-alert font-bold">Security Notice:</span> Anyone with this link 
                can read all content in this board. The encryption key is embedded in the URL fragment 
                and is never sent to servers.
              </p>
            </div>

            {/* Share Link */}
            <div className="space-y-2">
              <label className="text-xs text-terminal-dim uppercase font-bold">Share Link</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={shareLink || ''}
                  readOnly
                  className="flex-1 bg-terminal-dim/10 border border-terminal-dim p-3 text-terminal-text font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!shareLink}
                  className={`px-4 border transition-colors flex items-center gap-2 disabled:opacity-50 ${
                    copied 
                      ? 'border-terminal-text bg-terminal-text text-black' 
                      : 'border-terminal-dim text-terminal-dim hover:border-terminal-text hover:text-terminal-text'
                  }`}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            {/* How it works */}
            <div className="text-[10px] text-terminal-dim space-y-1 pt-2 border-t border-terminal-dim/30">
              <p className="font-bold uppercase">How encrypted links work:</p>
              <ul className="list-disc list-inside space-y-0.5 pl-2">
                <li>The encryption key is in the URL fragment (after #)</li>
                <li>URL fragments are never sent to servers</li>
                <li>Only people with the link can decrypt content</li>
                <li>Link = access (cannot be revoked individually)</li>
              </ul>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-terminal-dim/30">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-terminal-dim text-terminal-dim hover:text-terminal-text hover:border-terminal-text transition-colors uppercase text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};














