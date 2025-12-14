import React, { useState } from 'react';
import { Post, Board, BoardType } from '../types';
import { scanLink } from '../services/geminiService';
import { inputValidator } from '../services/inputValidator';
import { InputLimits } from '../config';
import { rateLimiter } from '../services/rateLimiter';
import { Loader, ImageIcon, AlertTriangle } from 'lucide-react';

interface CreatePostProps {
  availableBoards: Board[];
  currentBoardId: string | null; // Pre-select if inside a board
  onSubmit: (post: Omit<Post, 'id' | 'timestamp' | 'score' | 'commentCount' | 'comments' | 'nostrEventId'>) => void;
  onCancel: () => void;
  activeUser: string;
  userPubkey?: string;
}

export const CreatePost: React.FC<CreatePostProps> = ({ availableBoards, currentBoardId, onSubmit, onCancel, activeUser, userPubkey }) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkDescription, _setLinkDescription] = useState('');
  const [content, setContent] = useState('');
  const [tagsStr, setTagsStr] = useState('');
  const [selectedBoardId, setSelectedBoardId] = useState(currentBoardId || availableBoards[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  
  // Validation error states
  const [titleError, setTitleError] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);

  const handleScanLink = async () => {
    if (!url.trim()) return;
    
    // Validate URL first
    const validatedUrl = inputValidator.validateUrl(url);
    if (!validatedUrl) {
      setUrlError('Invalid URL format. Must be http:// or https://');
      return;
    }
    setUrlError(null);
    
    setIsScanning(true);
    const data = await scanLink(validatedUrl);
    setIsScanning(false);

    if (data) {
      if (!title) setTitle(data.title || '');
      if (!content && data.description) setContent(data.description);
      if (data.imageUrl) setImageUrl(data.imageUrl);
    }
  };

  const validateForm = (): boolean => {
    let isValid = true;
    
    // Validate title
    const validatedTitle = inputValidator.validateTitle(title);
    if (!validatedTitle) {
      if (!title.trim()) {
        setTitleError('Title is required');
      } else if (title.length > InputLimits.MAX_TITLE_LENGTH) {
        setTitleError(`Title must be ${InputLimits.MAX_TITLE_LENGTH} characters or less`);
      } else {
        setTitleError('Title contains invalid characters');
      }
      isValid = false;
    } else {
      setTitleError(null);
    }

    // Validate content (optional but must be valid if provided)
    if (content.trim()) {
      const validatedContent = inputValidator.validatePostContent(content);
      if (!validatedContent) {
        if (content.length > InputLimits.MAX_POST_CONTENT_LENGTH) {
          setContentError(`Content must be ${InputLimits.MAX_POST_CONTENT_LENGTH} characters or less`);
        } else {
          setContentError('Content contains invalid characters');
        }
        isValid = false;
      } else {
        setContentError(null);
      }
    } else {
      setContentError(null);
    }

    // Validate URL (optional but must be valid if provided)
    if (url.trim()) {
      const validatedUrl = inputValidator.validateUrl(url);
      if (!validatedUrl) {
        setUrlError('Invalid URL format. Must be http:// or https://');
        isValid = false;
      } else {
        setUrlError(null);
      }
    } else {
      setUrlError(null);
    }

    return isValid;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous rate limit error
    setRateLimitError(null);
    
    // Validate form
    if (!validateForm()) {
      return;
    }

    // Check rate limit
    const contentHash = rateLimiter.hashContent(title + content);
    const userId = userPubkey || activeUser;
    
    if (!rateLimiter.allowPost(userId, contentHash)) {
      setRateLimitError('Rate limit exceeded. Please wait before posting again.');
      return;
    }

    setIsSubmitting(true);
    
    // Sanitize inputs
    const sanitizedTitle = inputValidator.validateTitle(title)!;
    const sanitizedContent = content.trim() ? inputValidator.validatePostContent(content) || '' : '';
    const sanitizedUrl = url.trim() ? inputValidator.validateUrl(url) : undefined;
    const sanitizedImageUrl = imageUrl.trim() ? inputValidator.validateUrl(imageUrl) : undefined;
    
    // Parse and validate tags
    const rawTags = tagsStr.split(',').map(t => t.trim()).filter(t => t.length > 0);
    const sanitizedTags = inputValidator.validateTags(rawTags);
    
    // Simulate network delay for effect
    setTimeout(() => {
      onSubmit({
        boardId: selectedBoardId,
        title: sanitizedTitle,
        content: sanitizedContent,
        url: sanitizedUrl,
        imageUrl: sanitizedImageUrl,
        linkDescription: linkDescription.trim() || undefined,
        author: activeUser,
        authorPubkey: userPubkey,
        tags: sanitizedTags.length > 0 ? sanitizedTags : ['general'],
        upvotes: 1,
        downvotes: 0,
      });
      setIsSubmitting(false);
    }, 800);
  };

  // Character count helpers
  const titleCharCount = title.length;
  const contentCharCount = content.length;
  const titleOverLimit = titleCharCount > InputLimits.MAX_TITLE_LENGTH;
  const contentOverLimit = contentCharCount > InputLimits.MAX_POST_CONTENT_LENGTH;

  return (
    <div className="border-2 border-terminal-text bg-terminal-bg p-6 max-w-2xl mx-auto w-full shadow-hard-lg animate-fade-in">
      <h2 className="text-2xl font-bold mb-6 border-b border-terminal-dim pb-2 flex justify-between items-end">
        <span>&gt; COMPILE_NEW_BIT</span>
        <span className="text-xs text-terminal-dim font-normal flex items-center gap-2">
           ID: <span className="text-terminal-text">{activeUser}</span>
        </span>
      </h2>
      
      {/* Rate Limit Error Banner */}
      {rateLimitError && (
        <div className="mb-4 p-3 border border-terminal-alert bg-terminal-alert/10 flex items-center gap-2 text-terminal-alert">
          <AlertTriangle size={16} />
          <span className="text-sm">{rateLimitError}</span>
        </div>
      )}
      
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
                {board.type === BoardType.GEOHASH ? '📍' : '//'}{board.name} {board.isPublic ? '' : '[LOCKED]'}
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
              onChange={(e) => {
                setUrl(e.target.value);
                setUrlError(null);
              }}
              className={`flex-1 bg-terminal-bg border p-2 text-terminal-text focus:border-terminal-text focus:outline-none font-mono ${
                urlError ? 'border-terminal-alert' : 'border-terminal-dim'
              }`}
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
          {urlError && <span className="text-terminal-alert text-xs">* {urlError}</span>}
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
          <div className="flex justify-between items-center">
            <label className="text-sm text-terminal-dim uppercase font-bold">Bit Header (Title)</label>
            <span className={`text-xs ${titleOverLimit ? 'text-terminal-alert' : 'text-terminal-dim'}`}>
              {titleCharCount}/{InputLimits.MAX_TITLE_LENGTH}
            </span>
          </div>
          <input 
            type="text" 
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleError(null);
            }}
            className={`bg-terminal-bg border p-3 text-terminal-text focus:border-terminal-text focus:outline-none font-mono text-lg ${
              titleError ? 'border-terminal-alert' : 'border-terminal-dim'
            }`}
            placeholder="Enter subject..."
          />
          {titleError && <span className="text-terminal-alert text-xs">* {titleError}</span>}
        </div>

        {/* Content */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <label className="text-sm text-terminal-dim uppercase font-bold">Payload / Text</label>
            <span className={`text-xs ${contentOverLimit ? 'text-terminal-alert' : 'text-terminal-dim'}`}>
              {contentCharCount}/{InputLimits.MAX_POST_CONTENT_LENGTH}
            </span>
          </div>
          <textarea 
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setContentError(null);
            }}
            className={`bg-terminal-bg border p-2 text-terminal-text focus:border-terminal-text focus:outline-none font-mono min-h-[150px] ${
              contentError ? 'border-terminal-alert' : 'border-terminal-dim'
            }`}
            placeholder="Enter data packet content..."
          />
          {contentError && <span className="text-terminal-alert text-xs">* {contentError}</span>}
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
          <div className="flex justify-between items-center">
            <label className="text-sm text-terminal-dim uppercase font-bold">Tags</label>
            <span className="text-xs text-terminal-dim">
              Max {InputLimits.MAX_TAGS_COUNT} tags
            </span>
          </div>
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
