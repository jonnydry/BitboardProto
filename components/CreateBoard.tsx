import React, { useState, useMemo } from 'react';
import { Board, BoardType, NostrIdentity } from '../types';
import { Globe, Lock, Hash, AlertTriangle, Shield, Copy, Check, Key } from 'lucide-react';
import { inputValidator } from '../services/inputValidator';
import { InputLimits } from '../config';
import { boardRateLimiter } from '../services/boardRateLimiter';
import { encryptedBoardService } from '../services/encryptedBoardService';
import { makeBoardId } from '../services/boardIdService';

interface CreateBoardProps {
  onSubmit: (board: Omit<Board, 'id' | 'memberCount' | 'nostrEventId'>, encryptionKey?: string) => void;
  onCancel: () => void;
  identity?: NostrIdentity;
  onConnectIdentity?: () => void;
}

export const CreateBoard: React.FC<CreateBoardProps> = ({ onSubmit, onCancel, identity, onConnectIdentity }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Validation error states
  const [nameError, setNameError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  // Encryption result state
  const [createdBoardId, setCreatedBoardId] = useState<string | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Rate limit check
  const rateLimit = useMemo(() => {
    if (!identity) {
      return { allowed: false, remaining: 0, resetAt: null };
    }
    return boardRateLimiter.canCreateBoard(identity.pubkey);
  }, [identity]);

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
          setDescriptionError(`Description must be ${InputLimits.MAX_BOARD_DESCRIPTION_LENGTH} characters or less`);
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
        
        setCreatedBoardId(boardId);
        setGeneratedKey(encryptionKey);
        setShareLink(link);
      }
      
      onSubmit({
        name: cleanName,
        description: cleanDescription,
        isPublic,
        type: BoardType.TOPIC,
        isEncrypted: !isPublic,
      }, encryptionKey);
      
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
      <div className="border-2 border-terminal-text bg-terminal-bg p-6 max-w-2xl mx-auto w-full shadow-hard-lg animate-fade-in">
        <div className="text-center mb-6">
          <div className="w-16 h-16 border-2 border-terminal-text rounded-full flex items-center justify-center mx-auto mb-4">
            <Key size={32} className="text-terminal-text" />
          </div>
          <h2 className="text-2xl font-bold mb-2">ENCRYPTED_BOARD_CREATED</h2>
          <p className="text-sm text-terminal-dim">
            Your private board has been created. Share the link below to grant access.
          </p>
        </div>

        <div className="space-y-4">
          {/* Warning */}
          <div className="p-3 border border-terminal-alert/30 bg-terminal-alert/5 flex items-start gap-2">
            <AlertTriangle size={14} className="text-terminal-alert mt-0.5 shrink-0" />
            <p className="text-xs text-terminal-dim">
              <span className="text-terminal-alert font-bold">Important:</span> Anyone with this link can access the board. 
              The encryption key is embedded in the link and never sent to servers.
            </p>
          </div>

          {/* Share Link */}
          <div className="space-y-2">
            <label className="text-xs text-terminal-dim uppercase font-bold">Share Link</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={shareLink}
                readOnly
                className="flex-1 bg-terminal-dim/10 border border-terminal-dim p-3 text-terminal-text font-mono text-sm"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className={`px-4 border transition-colors flex items-center gap-2 ${
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

          {/* Actions */}
          <div className="flex gap-4 pt-4 border-t border-terminal-dim/30">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-terminal-text text-black font-bold px-6 py-3 hover:bg-terminal-dim hover:text-white transition-colors uppercase tracking-widest"
            >
              [ CONTINUE TO BOARD ]
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-terminal-text bg-terminal-bg p-6 max-w-2xl mx-auto w-full shadow-hard-lg animate-fade-in">
      <h2 className="text-2xl font-bold mb-6 border-b border-terminal-dim pb-2">
        &gt; INITIALIZE_NEW_FREQUENCY
      </h2>
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        
        {/* Name Input */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <label className="text-sm text-terminal-dim uppercase font-bold flex items-center gap-2">
              <Hash size={14} /> Frequency Name (ID)
            </label>
            <span className="text-xs text-terminal-dim">
              {name.length}/{InputLimits.MAX_BOARD_NAME_LENGTH}
            </span>
          </div>
          <div className="flex items-center">
             <span className="bg-terminal-dim/20 border border-r-0 border-terminal-dim p-3 text-terminal-dim font-mono">//</span>
             <input 
              type="text" 
              value={name}
              onChange={handleNameChange}
              className={`flex-1 bg-terminal-bg border p-3 text-terminal-text focus:border-terminal-text focus:outline-none font-mono text-lg tracking-widest uppercase ${
                nameError ? 'border-terminal-alert' : 'border-terminal-dim'
              }`}
              placeholder="MYBOARD"
            />
          </div>
          {nameError ? (
            <span className="text-terminal-alert text-xs flex items-center gap-1">
              <AlertTriangle size={12} /> {nameError}
            </span>
          ) : (
            <span className="text-[10px] text-terminal-dim">* STARTS WITH LETTER. ALPHANUMERIC + UNDERSCORE ONLY.</span>
          )}
        </div>

        {/* Description */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <label className="text-sm text-terminal-dim uppercase font-bold">Manifesto / Description</label>
            <span className={`text-xs ${descOverLimit ? 'text-terminal-alert' : 'text-terminal-dim'}`}>
              {descCharCount}/{InputLimits.MAX_BOARD_DESCRIPTION_LENGTH}
            </span>
          </div>
          <textarea 
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setDescriptionError(null);
            }}
            className={`bg-terminal-bg border p-3 text-terminal-text focus:border-terminal-text focus:outline-none font-mono min-h-[100px] ${
              descriptionError ? 'border-terminal-alert' : 'border-terminal-dim'
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
          <label className="text-sm text-terminal-dim uppercase font-bold">Signal Visibility</label>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setIsPublic(true)}
              className={`border p-4 flex flex-col items-center gap-2 transition-all ${isPublic ? 'border-terminal-text bg-terminal-dim/10' : 'border-terminal-dim opacity-50 hover:opacity-100'}`}
            >
              <Globe size={24} />
              <span className="font-bold">PUBLIC_NET</span>
              <span className="text-[10px] text-center">Visible to all nodes. Indexed in global directory.</span>
            </button>

            <button
              type="button"
              onClick={() => setIsPublic(false)}
              className={`border p-4 flex flex-col items-center gap-2 transition-all ${!isPublic ? 'border-terminal-alert text-terminal-alert bg-terminal-alert/10' : 'border-terminal-dim opacity-50 hover:opacity-100'}`}
            >
              <Lock size={24} />
              <span className="font-bold">ENCRYPTED</span>
              <span className="text-[10px] text-center">Invite only. Requires private key for access.</span>
            </button>
          </div>
        </div>

        {/* Identity Requirement Warning */}
        {!identity && (
          <div className="p-4 border border-terminal-alert/50 bg-terminal-alert/5">
            <div className="flex items-start gap-3">
              <Shield size={20} className="text-terminal-alert mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-terminal-alert font-bold mb-1">Identity Required</p>
                <p className="text-xs text-terminal-dim mb-3">
                  To prevent spam, board creation requires a Nostr identity. Your identity is used to sign and verify the board.
                </p>
                {onConnectIdentity && (
                  <button
                    type="button"
                    onClick={onConnectIdentity}
                    className="text-xs border border-terminal-alert text-terminal-alert px-3 py-1.5 hover:bg-terminal-alert hover:text-black transition-colors uppercase"
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
          <div className={`p-3 border ${rateLimit.allowed ? 'border-terminal-dim/30 bg-terminal-dim/5' : 'border-terminal-alert/50 bg-terminal-alert/5'}`}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-terminal-dim">
                Board Creation Quota:
              </span>
              <span className={rateLimit.allowed ? 'text-terminal-text' : 'text-terminal-alert'}>
                {rateLimit.remaining}/{boardRateLimiter.getLimit()} remaining today
              </span>
            </div>
            {!rateLimit.allowed && rateLimit.resetAt && (
              <p className="text-[10px] text-terminal-alert mt-1">
                Limit reached. Resets in {boardRateLimiter.formatResetTime(rateLimit.resetAt)}.
              </p>
            )}
          </div>
        )}

        <div className="flex gap-4 mt-6 pt-4 border-t border-terminal-dim/30">
          <button 
            type="submit"
            disabled={isSubmitting || !name.trim() || !identity || !rateLimit.allowed}
            className="bg-terminal-text text-black font-bold px-6 py-3 hover:bg-terminal-dim hover:text-white transition-colors uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed flex-1"
          >
            {isSubmitting ? 'ESTABLISHING...' : '[ ESTABLISH_CONNECTION ]'}
          </button>
          <button 
            type="button"
            onClick={onCancel}
            className="border border-terminal-alert text-terminal-alert px-6 py-3 hover:bg-terminal-alert hover:text-black transition-colors uppercase tracking-widest"
          >
            [ ABORT ]
          </button>
        </div>

      </form>
    </div>
  );
};
