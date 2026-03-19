import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Post, Board, BoardType } from '../types';
import { scanLink } from '../services/geminiService';
import { inputValidator, InputLimits } from '../services/inputValidator';
import { rateLimiter } from '../services/rateLimiter';
import { Loader, AlertTriangle, Lock, X } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { MentionInput } from './MentionInput';

const DRAFT_KEY = 'bitboard_post_draft';
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface DraftData {
  title: string;
  url: string;
  imageUrl: string;
  content: string;
  tagsStr: string;
  selectedBoardId: string;
  savedAt: number;
}

interface CreatePostProps {
  availableBoards: Board[];
  currentBoardId: string | null; // Pre-select if inside a board
  onSubmit: (
    post: Omit<Post, 'id' | 'timestamp' | 'score' | 'commentCount' | 'comments' | 'nostrEventId'>,
  ) => void | Promise<void>;
  onCancel: () => void;
  activeUser: string;
  userPubkey?: string;
}

export const CreatePost: React.FC<CreatePostProps> = ({
  availableBoards,
  currentBoardId,
  onSubmit,
  onCancel,
  activeUser,
  userPubkey,
}) => {
  const initialBoardId =
    currentBoardId && availableBoards.some((board) => board.id === currentBoardId)
      ? currentBoardId
      : availableBoards[0]?.id || '';
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkDescription, _setLinkDescription] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  // keep tagsStr in sync for draft persistence
  const tagsStr = tags.join(', ');
  const [selectedBoardId, setSelectedBoardId] = useState(initialBoardId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Validation error states
  const [titleError, setTitleError] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);

  // Handle Escape key to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

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

  // Load draft from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const draft: DraftData = JSON.parse(saved);
        const age = Date.now() - draft.savedAt;
        if (age < DRAFT_MAX_AGE_MS) {
          setTitle(draft.title || '');
          setUrl(draft.url || '');
          setImageUrl(draft.imageUrl || '');
          setContent(draft.content || '');
          setTags(
            (draft.tagsStr || '')
              .split(',')
              .map((t: string) => t.trim())
              .filter((t: string) => t.length > 0),
          );
          if (
            draft.selectedBoardId &&
            availableBoards.some((b) => b.id === draft.selectedBoardId)
          ) {
            setSelectedBoardId(draft.selectedBoardId);
          }
        } else {
          localStorage.removeItem(DRAFT_KEY);
        }
      }
    } catch {
      // Ignore malformed drafts
    }
  }, [availableBoards]);

  useEffect(() => {
    if (!availableBoards.some((board) => board.id === selectedBoardId)) {
      setSelectedBoardId(initialBoardId);
    }
  }, [availableBoards, initialBoardId, selectedBoardId]);

  // Debounce timer ref
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Save draft to localStorage on changes (debounced)
  useEffect(() => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
    }
    draftTimerRef.current = setTimeout(() => {
      const draft: DraftData = {
        title,
        url,
        imageUrl,
        content,
        tagsStr,
        selectedBoardId,
        savedAt: Date.now(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }, 500);
    return () => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
      }
    };
  }, [title, url, imageUrl, content, tags, tagsStr, selectedBoardId]);

  // Clear draft on submit
  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
  }, []);

  const handleScanLink = async () => {
    if (!url.trim()) return;

    // Validate URL first
    const validatedUrl = inputValidator.validateUrl(url);
    if (!validatedUrl) {
      setUrlError('Invalid URL format');
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
          setContentError(
            `Content must be ${InputLimits.MAX_POST_CONTENT_LENGTH} characters or less`,
          );
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
    // Use the current url state value
    const currentUrl = url.trim();
    if (currentUrl) {
      const validatedUrl = inputValidator.validateUrl(currentUrl);
      if (!validatedUrl) {
        setUrlError('Invalid URL format');
        isValid = false;
      } else {
        setUrlError(null);
      }
    } else {
      setUrlError(null);
    }

    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear previous rate limit error
    setRateLimitError(null);

    // Validate form
    if (!validateForm()) {
      return;
    }

    // Check rate limit
    const contentHash = await rateLimiter.hashContent(title + content);
    const userId = userPubkey || activeUser;

    if (!rateLimiter.allowPost(userId, contentHash)) {
      setRateLimitError('Rate limit exceeded. Please wait before posting again.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Sanitize inputs
      const sanitizedTitle = inputValidator.validateTitle(title)!;
      const sanitizedContent = content.trim()
        ? inputValidator.validatePostContent(content) || ''
        : '';
      const sanitizedUrl = url.trim() ? inputValidator.validateUrl(url) : undefined;
      const sanitizedImageUrl = imageUrl.trim() ? inputValidator.validateUrl(imageUrl) : undefined;

      // Parse and validate tags
      const sanitizedTags = inputValidator.validateTags(tags);

      // Submit (handle both sync and async onSubmit)
      const result = onSubmit({
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

      // If onSubmit returns a promise, wait for it
      if (result && typeof result.then === 'function') {
        await result;
      }

      // Clear draft on successful submit
      clearDraft();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Character count helpers
  const titleCharCount = title.length;
  const contentCharCount = content.length;
  const titleOverLimit = titleCharCount > InputLimits.MAX_TITLE_LENGTH;
  const contentOverLimit = contentCharCount > InputLimits.MAX_POST_CONTENT_LENGTH;

  // Check if selected board is encrypted
  const selectedBoard = availableBoards.find((b) => b.id === selectedBoardId);
  const isEncryptedBoard = selectedBoard?.isEncrypted ?? false;

  const handleTagInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const newTag = tagInput.trim().replace(/^#/, '');
      if (newTag && !tags.includes(newTag) && tags.length < InputLimits.MAX_TAGS_COUNT) {
        setTags([...tags, newTag]);
      }
      setTagInput('');
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  };

  return (
    <div className="border border-terminal-dim/30 bg-terminal-bg max-w-2xl mx-auto w-full animate-fade-in">
      {/* Status strip */}
      <div className="flex items-center justify-between py-3 px-5 border-b border-terminal-dim/15">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-terminal-text flex-shrink-0" />
          <span className="text-sm tracking-[0.12em] text-terminal-dim font-mono uppercase">
            New Bit
          </span>
        </div>
        <div className="flex items-center gap-2.5 text-sm font-mono">
          <span className="text-terminal-dim/60 tracking-[0.08em] uppercase">Draft saved</span>
          <div className="w-px h-2.5 bg-terminal-dim/30" />
          <span className="text-terminal-dim/70 text-sm">ESC to discard</span>
        </div>
      </div>

      {/* Rate Limit Error Banner */}
      {rateLimitError && (
        <div className="px-5 pt-3 flex items-center gap-2 text-terminal-alert text-xs">
          <AlertTriangle size={14} />
          <span>{rateLimitError}</span>
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit}>
        {/* Board selector row */}
        <div className="flex items-center gap-2.5 py-2.5 px-5 border-b border-terminal-dim/15">
          <span className="text-sm tracking-widest text-terminal-dim/70 font-mono uppercase flex-shrink-0">
            Board
          </span>
          <div className="relative flex-1">
            <select
              value={selectedBoardId}
              onChange={(e) => setSelectedBoardId(e.target.value)}
              className="w-full bg-terminal-bg/60 border border-terminal-dim/40 py-1.5 pl-2.5 pr-6 text-terminal-text focus:border-terminal-dim focus:outline-none font-mono text-sm appearance-none cursor-pointer"
            >
              {availableBoards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.type === BoardType.GEOHASH ? '📍 ' : '// '}
                  {board.name}
                  {board.isPublic ? '' : ' [LOCKED]'}
                  {board.isEncrypted ? ' 🔒' : ''}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-terminal-text" />
          </div>
          {isEncryptedBoard && (
            <div className="flex items-center gap-1.5 text-sm text-terminal-dim/60 font-mono flex-shrink-0">
              <Lock size={12} />
              <span>encrypted</span>
            </div>
          )}
        </div>

        {/* Writing area — title + content */}
        <div className="flex flex-col border-b border-terminal-dim/15 px-5">
          {/* Title */}
          <div className="py-3.5 border-b border-terminal-dim/20">
            <input
              id="title-input"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleError(null);
              }}
              className={`w-full bg-transparent text-2xl md:text-3xl leading-tight font-display font-semibold text-terminal-text focus:outline-none placeholder:text-terminal-dim/30 ${
                titleError ? 'placeholder:text-terminal-alert/50' : ''
              }`}
              placeholder="Title your bit…"
            />
            {titleError && (
              <span className="text-terminal-alert text-sm mt-1 block">* {titleError}</span>
            )}
            {titleOverLimit && (
              <span className="text-terminal-alert text-sm mt-1 block">
                {titleCharCount}/{InputLimits.MAX_TITLE_LENGTH}
              </span>
            )}
          </div>

          {/* Content */}
          <div className="pt-3.5">
            {showPreview ? (
              <div className="min-h-[120px] text-sm text-terminal-dim/70">
                {content ? (
                  <MarkdownRenderer content={content} />
                ) : (
                  <p className="italic text-terminal-dim/70">No content yet…</p>
                )}
              </div>
            ) : (
              <MentionInput
                value={content}
                onChange={(newContent) => {
                  setContent(newContent);
                  setContentError(null);
                }}
                knownUsers={new Set()}
                placeholder="Write your signal… Markdown and @mentions supported."
                minHeight="120px"
              />
            )}
            {contentError && (
              <span className="text-terminal-alert text-sm mt-1 block">* {contentError}</span>
            )}
          </div>

          {/* Content footer: preview toggle + char count */}
          <div className="flex items-center justify-end gap-4 pt-2.5 pb-3">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="text-xs tracking-widest text-terminal-dim/70 hover:text-terminal-dim uppercase font-mono transition-colors"
            >
              {showPreview ? 'Edit' : 'Preview'}
            </button>
            <span
              className={`text-xs font-mono ${contentOverLimit ? 'text-terminal-alert' : 'text-terminal-dim/40'}`}
            >
              {contentCharCount} / {InputLimits.MAX_POST_CONTENT_LENGTH}
            </span>
          </div>
        </div>

        {/* Image preview (scanner result) */}
        {(imageUrl || isScanning) && (
          <div className="border-b border-terminal-dim/15">
            {isScanning ? (
              <div className="px-5 py-4 text-xs font-mono text-terminal-dim/70 animate-pulse uppercase tracking-widest">
                Scanning…
              </div>
            ) : (
              <div className="relative">
                <img
                  src={imageUrl}
                  alt="Link preview"
                  className="h-40 w-full object-cover grayscale sepia contrast-125 opacity-60"
                  onError={() => setImageUrl('')}
                />
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  className="absolute top-2 right-2 bg-terminal-bg/90 border border-terminal-dim/40 text-terminal-dim p-1 hover:text-terminal-text transition-colors"
                  title="Remove image"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Link row */}
        <div className="flex items-center gap-2.5 py-2.5 px-5 border-b border-terminal-dim/15">
          <span className="text-sm tracking-widest text-terminal-dim/60 font-mono uppercase flex-shrink-0">
            Link
          </span>
          <input
            id="url-input"
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setUrlError(null);
            }}
            onBlur={() => {
              if (url.trim() && !urlError) handleScanLink();
            }}
            className={`flex-1 bg-terminal-bg/60 border py-1.5 px-2.5 text-terminal-text focus:outline-none font-mono text-xs placeholder:text-terminal-dim/30 ${
              urlError ? 'border-terminal-alert/60' : 'border-terminal-dim/40'
            }`}
            placeholder="https://…"
          />
          <button
            type="button"
            onClick={handleScanLink}
            disabled={!url.trim() || isScanning}
            className="flex-shrink-0 border border-terminal-dim/40 py-1.5 px-2.5 text-xs tracking-[0.06em] text-terminal-dim/60 hover:text-terminal-dim hover:border-terminal-dim/60 disabled:opacity-40 transition-colors font-mono uppercase"
          >
            {isScanning ? <Loader className="animate-spin" size={10} /> : 'Scan'}
          </button>
          {urlError && (
            <span className="text-terminal-alert text-xs flex-shrink-0">* {urlError}</span>
          )}
        </div>

        {/* Tags row */}
        <div className="flex items-center gap-2 py-2.5 px-5 border-b border-terminal-dim/15 flex-wrap">
          <span className="text-sm tracking-widest text-terminal-dim/60 font-mono uppercase flex-shrink-0">
            Tags
          </span>
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setTags(tags.filter((t) => t !== tag))}
              className="flex items-center gap-1 border border-terminal-dim/40 bg-terminal-bg py-0.5 px-2 text-terminal-text font-mono text-sm hover:border-terminal-alert/60 hover:text-terminal-alert/80 transition-colors group"
            >
              <span>#{tag}</span>
              <X size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
          {tags.length < InputLimits.MAX_TAGS_COUNT && (
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagInputKeyDown}
              onBlur={() => {
                const newTag = tagInput.trim().replace(/^#/, '');
                if (newTag && !tags.includes(newTag) && tags.length < InputLimits.MAX_TAGS_COUNT) {
                  setTags([...tags, newTag]);
                }
                setTagInput('');
              }}
              className="border border-dashed border-terminal-dim/40 py-0.5 px-2 text-terminal-dim/70 font-mono text-base md:text-sm bg-transparent focus:outline-none focus:border-terminal-dim/60 focus:text-terminal-dim placeholder:text-terminal-dim/40 min-w-[60px] w-20"
              placeholder="+ add"
            />
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between py-3.5 px-5">
          <span className="text-sm text-terminal-dim/60 font-mono">⌘⏎ transmit</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="border border-terminal-dim/40 py-2 px-4 text-terminal-dim/60 font-mono text-sm hover:border-terminal-dim/60 hover:text-terminal-dim transition-colors"
            >
              Discard
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-terminal-text text-terminal-bg font-mono font-semibold text-sm py-2 px-5 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {isSubmitting ? 'Transmitting…' : 'Transmit Bit'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
