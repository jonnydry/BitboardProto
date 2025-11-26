import React, { useState } from 'react';
import { Board, BoardType } from '../types';
import { Globe, Lock, Hash, AlertTriangle } from 'lucide-react';
import { inputValidator, InputLimits } from '../services/inputValidator';

interface CreateBoardProps {
  onSubmit: (board: Omit<Board, 'id' | 'memberCount' | 'nostrEventId'>) => void;
  onCancel: () => void;
}

export const CreateBoard: React.FC<CreateBoardProps> = ({ onSubmit, onCancel }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Validation error states
  const [nameError, setNameError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    
    setTimeout(() => {
      // Use validated name
      const cleanName = inputValidator.validateBoardName(name)!;
      const cleanDescription = description.trim() 
        ? inputValidator.validateBoardDescription(description) || ''
        : '';
      
      onSubmit({
        name: cleanName,
        description: cleanDescription,
        isPublic,
        type: BoardType.TOPIC,
      });
      setIsSubmitting(false);
    }, 800);
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

        <div className="flex gap-4 mt-6 pt-4 border-t border-terminal-dim/30">
          <button 
            type="submit"
            disabled={isSubmitting || !name.trim()}
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
