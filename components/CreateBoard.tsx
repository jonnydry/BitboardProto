import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Board, BoardType, NostrIdentity } from '../types';
import { Globe, Lock, Hash, AlertTriangle, Shield, Copy, Check, Key } from 'lucide-react';
import { inputValidator } from '../services/inputValidator';
import { InputLimits } from '../config';
import { boardRateLimiter } from '../services/boardRateLimiter';
import { encryptedBoardService } from '../services/encryptedBoardService';
import { makeBoardId } from '../services/boardIdService';

interface CreateBoardProps {
  onSubmit: (
    board: Omit<Board, 'id' | 'memberCount' | 'nostrEventId'>,
    encryptionKey?: string,
  ) => void;
  onCancel: () => void;
  identity?: NostrIdentity;
  onConnectIdentity?: () => void;
}

export const CreateBoard: React.FC<CreateBoardProps> = ({
  onSubmit,
  onCancel,
  identity,
  onConnectIdentity,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validation error states
  const [nameError, setNameError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  // Encryption result state
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Rate limit check
  const rateLimit = useMemo(() => {
    if (!identity) {
      return { allowed: false, remaining: 0, resetAt: null };
    }
    return boardRateLimiter.canCreateBoard(identity.pubkey);
  }, [identity]);

  // Handle Cmd/Ctrl+Enter to submit form
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        const target = e.target as HTMLElement;
        if (target.closest('form') === formRef.current && !isSubmitting) {
          e.preventDefault();
          formRef.current?.requestSubmit();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting]);

  const validateForm = (): boolean => {
    let isValid = true;

    // Validate name
    const validatedName = inputValidator.validateBoardName(name);
    if (!validatedName) {
      if (!name.trim()) {
        setNameError('Board name is required');
      } else if (!/^[a-zA-Z]/.test(name)) {
        setNameError('Board name must start with a letter');
      } else {
        setNameError('Board name can only contain letters, numbers, and underscores');
      }
      isValid = false;
    } else {
      setNameError(null);
    }

    // Validate description (optional but must be valid if provided)
    if (description.trim()) {
      const validatedDesc = inputValidator.validateBoardDescription(description);
      if (!validatedDesc) {
        if (description.length > InputLimits.MAX_BOARD_DESCRIPTION_LENGTH) {
          setDescriptionError(
            `Description must be ${InputLimits.MAX_BOARD_DESCRIPTION_LENGTH} characters or less`,
          );
        } else {
          setDescriptionError('Description contains invalid characters');
        }
        isValid = false;
      } else {
        setDescriptionError(null);
      }
    } else {
      setDescriptionError(null);
    }

    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Use validated name
      const cleanName = inputValidator.validateBoardName(name)!;
      const cleanDescription = description.trim()
        ? inputValidator.validateBoardDescription(description) || ''
        : '';

      let encryptionKey: string | undefined;

      // Generate encryption key for private boards
      if (!isPublic) {
        encryptionKey = await encryptedBoardService.generateBoardKey();

        // Generate board ID for the share link
        const boardId = makeBoardId(cleanName);

        // Save the key locally
        encryptedBoardService.saveBoardKey(boardId, encryptionKey);

        // Generate share link
        const link = encryptedBoardService.generateShareLink(boardId, encryptionKey);

        setGeneratedKey(encryptionKey);
        setShareLink(link);
      }

      onSubmit(
        {
          name: cleanName,
          description: cleanDescription,
          isPublic,
          type: BoardType.TOPIC,
          isEncrypted: !isPublic,
        },
        encryptionKey,
      );
    } catch (error) {
      console.error('[CreateBoard] Failed to create board:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareLink) return;

    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('[CreateBoard] Failed to copy:', error);
    }
  };

  // Handle name input to enforce format
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (val.length <= InputLimits.MAX_BOARD_NAME_LENGTH) {
      setName(val);
      setNameError(null);
    }
  };

  // Character count helpers
  const descCharCount = description.length;
  const descOverLimit = descCharCount > InputLimits.MAX_BOARD_DESCRIPTION_LENGTH;

  // Show share link after creating an encrypted board
  if (shareLink && generatedKey) {
    return (
      <div className="ui-surface-editor overflow-hidden">
        <div className="flex items-center justify-between border-b border-terminal-dim/15 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-terminal-text" />
            <span className="font-mono text-sm uppercase tracking-[0.12em] text-terminal-dim">
              Private Board Ready
            </span>
          </div>
        </div>

        <div className="px-5 py-5">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-terminal-dim/30 bg-terminal-dim/10">
              <Key size={32} className="text-terminal-text" />
            </div>
            <h2 className="font-display text-3xl font-semibold text-terminal-text">
              Encrypted board created
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-terminal-dim">
              Your private board has been created. Share the link below to grant access.
            </p>
          </div>

          <div className="space-y-4">
            {/* Warning */}
            <div className="flex items-start gap-2 border border-terminal-alert/30 bg-terminal-alert/5 p-3">
              <AlertTriangle size={14} className="text-terminal-alert mt-0.5 shrink-0" />
              <p className="text-xs text-terminal-dim">
                <span className="text-terminal-alert font-bold">Important:</span> Anyone with this
                link can access the board. The encryption key is embedded in the link and never sent
                to servers.
              </p>
            </div>

            {/* Share Link */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-[0.12em] text-terminal-dim">
                Share Link
              </label>
              <div className="flex gap-2">
                <input type="text" value={shareLink} readOnly className="ui-input flex-1" />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className={`flex items-center gap-2 px-4 font-mono text-sm uppercase tracking-[0.12em] transition-colors ${
                    copied
                      ? 'border border-terminal-text/30 bg-terminal-text text-black'
                      : 'border border-terminal-dim/30 text-terminal-dim hover:border-terminal-dim/60 hover:text-terminal-text'
                  }`}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-4 border-t border-terminal-dim/20 pt-4">
              <button type="button" onClick={onCancel} className="ui-button-primary flex-1">
                Continue to board
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ui-surface-editor overflow-hidden">
      <div className="flex items-center justify-between border-b border-terminal-dim/15 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-terminal-text" />
          <span className="font-mono text-sm uppercase tracking-[0.12em] text-terminal-dim">
            New Board
          </span>
        </div>
        <span className="font-mono text-xs uppercase tracking-[0.08em] text-terminal-dim/70">
          Topic network
        </span>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-6 px-5 py-5">
        {/* Name Input */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <label className="text-sm text-terminal-dim uppercase tracking-[0.12em] font-bold flex items-center gap-2">
              <Hash size={14} /> Frequency Name (ID)
            </label>
            <span className="text-xs text-terminal-dim">
              {name.length}/{InputLimits.MAX_BOARD_NAME_LENGTH}
            </span>
          </div>
          <div className="flex items-center">
            <span className="border border-r-0 border-terminal-dim/30 bg-terminal-dim/10 p-3 text-terminal-dim font-mono">
              //
            </span>
            <input
              type="text"
              value={name}
              onChange={handleNameChange}
              className={`flex-1 border bg-terminal-bg/60 p-3 text-lg font-mono uppercase tracking-widest text-terminal-text focus:outline-none ${
                nameError
                  ? 'border-terminal-alert focus:border-terminal-alert'
                  : 'border-terminal-dim/30 focus:border-terminal-dim'
              }`}
              placeholder="MYBOARD"
            />
          </div>
          {nameError ? (
            <span className="text-terminal-alert text-xs flex items-center gap-1">
              <AlertTriangle size={12} /> {nameError}
            </span>
          ) : (
            <span className="text-2xs text-terminal-dim">
              * STARTS WITH LETTER. ALPHANUMERIC + UNDERSCORE ONLY.
            </span>
          )}
        </div>

        {/* Description */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <label className="text-sm text-terminal-dim uppercase tracking-[0.12em] font-bold">
              Manifesto / Description
            </label>
            <span
              className={`text-xs ${descOverLimit ? 'text-terminal-alert' : 'text-terminal-dim'}`}
            >
              {descCharCount}/{InputLimits.MAX_BOARD_DESCRIPTION_LENGTH}
            </span>
          </div>
          <textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setDescriptionError(null);
            }}
            className={`min-h-[100px] border bg-terminal-bg/60 p-3 font-mono text-terminal-text focus:outline-none ${
              descriptionError
                ? 'border-terminal-alert focus:border-terminal-alert'
                : 'border-terminal-dim/30 focus:border-terminal-dim'
            }`}
            placeholder="Define the purpose of this communication node..."
          />
          {descriptionError && (
            <span className="text-terminal-alert text-xs flex items-center gap-1">
              <AlertTriangle size={12} /> {descriptionError}
            </span>
          )}
        </div>

        {/* Visibility Toggle */}
        <div className="flex flex-col gap-2">
          <label className="text-sm text-terminal-dim uppercase tracking-[0.12em] font-bold">
            Signal Visibility
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setIsPublic(true)}
              className={`border p-4 flex flex-col items-center gap-2 transition-all ${isPublic ? 'border-terminal-dim/60 bg-terminal-dim/10 text-terminal-text' : 'border-terminal-dim/20 text-terminal-dim/70 hover:border-terminal-dim/40 hover:text-terminal-dim'}`}
            >
              <Globe size={24} />
              <span className="font-bold">PUBLIC_NET</span>
              <span className="text-2xs text-center">
                Visible to all nodes. Indexed in global directory.
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsPublic(false)}
              className={`border p-4 flex flex-col items-center gap-2 transition-all ${!isPublic ? 'border-terminal-alert/50 text-terminal-alert bg-terminal-alert/10' : 'border-terminal-dim/20 text-terminal-dim/70 hover:border-terminal-dim/40 hover:text-terminal-dim'}`}
            >
              <Lock size={24} />
              <span className="font-bold">ENCRYPTED</span>
              <span className="text-2xs text-center">
                Invite only. Requires private key for access.
              </span>
            </button>
          </div>
        </div>

        {/* Identity Requirement Warning */}
        {!identity && (
          <div className="p-4 border border-terminal-alert/50 bg-terminal-alert/5">
            <div className="flex items-start gap-3">
              <Shield size={20} className="text-terminal-alert mt-0.5" />
              <div className="flex-1">
                <p className="mb-1 text-sm font-bold text-terminal-alert">Identity Required</p>
                <p className="text-xs text-terminal-dim mb-3">
                  To prevent spam, board creation requires a Nostr identity. Your identity is used
                  to sign and verify the board.
                </p>
                {onConnectIdentity && (
                  <button
                    type="button"
                    onClick={onConnectIdentity}
                    className="border border-terminal-alert/50 px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-terminal-alert transition-colors hover:bg-terminal-alert hover:text-black"
                  >
                    Connect Identity
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Rate Limit Info */}
        {identity && (
          <div
            className={`p-3 border ${rateLimit.allowed ? 'border-terminal-dim/30 bg-terminal-dim/5' : 'border-terminal-alert/50 bg-terminal-alert/5'}`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="text-terminal-dim">Board Creation Quota:</span>
              <span className={rateLimit.allowed ? 'text-terminal-text' : 'text-terminal-alert'}>
                {rateLimit.remaining}/{boardRateLimiter.getLimit()} remaining today
              </span>
            </div>
            {!rateLimit.allowed && rateLimit.resetAt && (
              <p className="text-2xs text-terminal-alert mt-1">
                Limit reached. Resets in {boardRateLimiter.formatResetTime(rateLimit.resetAt)}.
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex gap-4 border-t border-terminal-dim/20 pt-4">
          <button
            type="submit"
            disabled={isSubmitting || !name.trim() || !identity || !rateLimit.allowed}
            className="ui-button-primary flex-1"
          >
            {isSubmitting ? 'Establishing...' : 'Create Board'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="ui-button-secondary border-terminal-alert/40 text-terminal-alert hover:border-terminal-alert"
          >
            Discard
          </button>
        </div>
      </form>
    </div>
  );
};
