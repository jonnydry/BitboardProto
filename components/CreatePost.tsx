import React, { useState } from 'react';
import { Post, Board } from '../types';
import { scanLink } from '../services/geminiService';
import { Loader, ImageIcon } from 'lucide-react';

interface CreatePostProps {
  availableBoards: Board[];
  currentBoardId: string | null; // Pre-select if inside a board
  onSubmit: (post: Omit<Post, 'id' | 'timestamp' | 'score' | 'commentCount' | 'comments'>) => void;
  onCancel: () => void;
  activeUser: string;
}

export const CreatePost: React.FC<CreatePostProps> = ({ availableBoards, currentBoardId, onSubmit, onCancel, activeUser }) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkDescription, setLinkDescription] = useState('');
  const [content, setContent] = useState('');
  const [tagsStr, setTagsStr] = useState('');
  const [selectedBoardId, setSelectedBoardId] = useState(currentBoardId || availableBoards[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const handleScanLink = async () => {
    if (!url.trim()) return;
    
    setIsScanning(true);
    const data = await scanLink(url);
    setIsScanning(false);

    if (data) {
      if (!title) setTitle(data.title || '');
      if (!content && data.description) setContent(data.description);
      if (data.imageUrl) setImageUrl(data.imageUrl);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !selectedBoardId) return;

    setIsSubmitting(true);
    
    // Simulate network delay for effect
    setTimeout(() => {
      const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t.length > 0);

      onSubmit({
        boardId: selectedBoardId,
        title,
        content,
        url: url.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        linkDescription: linkDescription.trim() || undefined,
        author: activeUser,
        tags: tags.length > 0 ? tags : ['general']
      });
      setIsSubmitting(false);
    }, 800);
  };

  return (
    <div className="border-2 border-terminal-text bg-terminal-bg p-6 max-w-2xl mx-auto w-full shadow-hard-lg animate-fade-in">
      <h2 className="text-2xl font-bold mb-6 border-b border-terminal-dim pb-2 flex justify-between items-end">
        <span>> COMPILE_NEW_BIT</span>
        <span className="text-xs text-terminal-dim font-normal flex items-center gap-2">
           ID: <span className="text-terminal-text">{activeUser}</span>
        </span>
      </h2>
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        
        {/* Board Selector */}
        <div className="flex flex-col gap-1">
          <label className="text-sm text-terminal-dim uppercase font-bold">Target Frequency (Board)</label>
          <select
            value={selectedBoardId}
            onChange={(e) => setSelectedBoardId(e.target.value)}
            className="bg-terminal-bg border border-terminal-dim p-3 text-terminal-text focus:border-terminal-text focus:outline-none font-mono text-lg appearance-none cursor-pointer hover:bg-terminal-dim/10"
          >
            {availableBoards.map(board => (
              <option key={board.id} value={board.id}>
                //{board.name} {board.isPublic ? '' : '[LOCKED]'}
              </option>
            ))}
          </select>
        </div>

        {/* URL Input with Scanner */}
        <div className="flex flex-col gap-1">
          <label className="text-sm text-terminal-dim uppercase font-bold">Hyperlink (Optional)</label>
          <div className="flex gap-2">
            <input 
              type="url" 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 bg-terminal-bg border border-terminal-dim p-2 text-terminal-text focus:border-terminal-text focus:outline-none font-mono"
              placeholder="https://example.com"
            />
            <button
              type="button"
              onClick={handleScanLink}
              disabled={!url.trim() || isScanning}
              className="border border-terminal-dim px-3 text-terminal-dim hover:text-terminal-text hover:border-terminal-text disabled:opacity-50 transition-colors uppercase text-xs font-bold tracking-wider flex items-center gap-2"
            >
              {isScanning ? <Loader className="animate-spin" size={14}/> : '[ SCAN_NETWORK ]'}
            </button>
          </div>
        </div>

        {/* Image Preview */}
        {(imageUrl || isScanning) && (
          <div className="border border-terminal-dim border-dashed p-2 bg-terminal-dim/5">
            {isScanning ? (
               <div className="h-32 flex items-center justify-center text-terminal-dim animate-pulse">
                 SCANNING_NODES...
               </div>
            ) : (
              <div className="relative group">
                <img 
                  src={imageUrl} 
                  alt="Link Preview" 
                  className="h-48 w-full object-cover grayscale sepia contrast-125 border border-terminal-dim" 
                  onError={() => setImageUrl('')} 
                />
                <button 
                  type="button" 
                  onClick={() => setImageUrl('')}
                  className="absolute top-2 right-2 bg-terminal-bg border border-terminal-alert text-terminal-alert px-2 text-xs hover:bg-terminal-alert hover:text-black"
                >
                  REMOVE
                </button>
                <div className="absolute bottom-2 left-2 bg-terminal-bg/90 px-2 py-1 text-xs text-terminal-text">
                  PREVIEW_ASSET_DETECTED
                </div>
              </div>
            )}
          </div>
        )}

        {/* Title */}
        <div className="flex flex-col gap-1">
          <label className="text-sm text-terminal-dim uppercase font-bold">Bit Header (Title)</label>
          <input 
            type="text" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-terminal-bg border border-terminal-dim p-3 text-terminal-text focus:border-terminal-text focus:outline-none font-mono text-lg"
            placeholder="Enter subject..."
          />
          {!title.trim() && title !== '' && <span className="text-terminal-alert text-xs">* HEADER REQUIRED</span>}
        </div>

        {/* Content */}
        <div className="flex flex-col gap-1">
          <label className="text-sm text-terminal-dim uppercase font-bold">Payload / Text</label>
          <textarea 
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="bg-terminal-bg border border-terminal-dim p-2 text-terminal-text focus:border-terminal-text focus:outline-none font-mono min-h-[150px]"
            placeholder="Enter data packet content..."
          />
        </div>

        {/* Image URL Manual Override */}
        <div className="flex flex-col gap-1">
          <label className="text-sm text-terminal-dim uppercase font-bold flex items-center gap-2">
            <ImageIcon size={14} /> Attached Image Asset (URL)
          </label>
          <input 
            type="text" 
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className="bg-terminal-bg border border-terminal-dim p-2 text-terminal-text focus:border-terminal-text focus:outline-none font-mono text-sm opacity-70 focus:opacity-100"
            placeholder="Auto-filled by scanner or enter manually..."
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-terminal-dim uppercase font-bold">Tags</label>
          <input 
            type="text" 
            value={tagsStr}
            onChange={(e) => setTagsStr(e.target.value)}
            className="bg-terminal-bg border border-terminal-dim p-2 text-terminal-text focus:border-terminal-text focus:outline-none font-mono"
            placeholder="tech, discussion, news (comma separated)"
          />
        </div>

        <div className="flex gap-4 mt-4 pt-4 border-t border-terminal-dim/30">
          <button 
            type="submit"
            disabled={isSubmitting || !title.trim()}
            className="bg-terminal-text text-black font-bold px-6 py-3 hover:bg-terminal-dim hover:text-white transition-colors uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? '> TRANSMITTING...' : '[ UPLOAD_BIT ]'}
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