import React, { useState } from 'react';
import { Board } from '../types';
import { Globe, Lock, Hash, Radio } from 'lucide-react';

interface CreateBoardProps {
  onSubmit: (board: Omit<Board, 'id' | 'memberCount'>) => void;
  onCancel: () => void;
}

export const CreateBoard: React.FC<CreateBoardProps> = ({ onSubmit, onCancel }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    
    setTimeout(() => {
      // Sanitize name: Uppercase, alphanumeric only
      const cleanName = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
      
      onSubmit({
        name: cleanName,
        description,
        isPublic
      });
      setIsSubmitting(false);
    }, 800);
  };

  // Handle name input to enforce format
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (val.length <= 12) setName(val);
  };

  return (
    <div className="border-2 border-terminal-text bg-black p-6 max-w-2xl mx-auto w-full shadow-[8px_8px_0px_0px_rgba(255,176,0,0.15)] animate-fade-in">
      <h2 className="text-2xl font-bold mb-6 border-b border-terminal-dim pb-2">
        > INITIALIZE_NEW_FREQUENCY
      </h2>
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        
        {/* Name Input */}
        <div className="flex flex-col gap-2">
          <label className="text-sm text-terminal-dim uppercase font-bold flex items-center gap-2">
            <Hash size={14} /> Frequency Name (ID)
          </label>
          <div className="flex items-center">
             <span className="bg-terminal-dim/20 border border-r-0 border-terminal-dim p-3 text-terminal-dim font-mono">//</span>
             <input 
              type="text" 
              value={name}
              onChange={handleNameChange}
              className="flex-1 bg-black border border-terminal-dim p-3 text-terminal-text focus:border-terminal-text focus:outline-none font-mono text-lg tracking-widest uppercase"
              placeholder="MYBOARD"
            />
          </div>
          <span className="text-[10px] text-terminal-dim">* MAX 12 CHARS. ALPHANUMERIC ONLY.</span>
        </div>

        {/* Description */}
        <div className="flex flex-col gap-2">
          <label className="text-sm text-terminal-dim uppercase font-bold">Manifesto / Description</label>
          <textarea 
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="bg-black border border-terminal-dim p-3 text-terminal-text focus:border-terminal-text focus:outline-none font-mono min-h-[100px]"
            placeholder="Define the purpose of this communication node..."
          />
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