import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Post, Board } from '../types';
import {
  ArrowLeft,
  Save,
  Trash2,
  AlertTriangle,
  Link as LinkIcon,
  Image as ImageIcon,
  Hash,
} from 'lucide-react';
import { InputLimits } from '../config';
import { inputValidator } from '../services/inputValidator';

interface EditPostProps {
  post: Post;
  boards: Board[];
  onSave: (postId: string, updates: Partial<Post>) => void;
  onDelete: (postId: string) => void;
  onCancel: () => void;
}

export const EditPost: React.FC<EditPostProps> = ({ post, boards, onSave, onDelete, onCancel }) => {
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content);
  const [url, setUrl] = useState(post.url || '');
  const [imageUrl, setImageUrl] = useState(post.imageUrl || '');
  const [tagsStr, setTagsStr] = useState(post.tags.join(', '));
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  // Handle Cmd/Ctrl+Enter to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        const target = e.target as HTMLElement;
        if (target.closest('form') === formRef.current && !isSaving) {
          e.preventDefault();
          formRef.current?.requestSubmit();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSaving]);

  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    // Validate title
    const validatedTitle = inputValidator.validateTitle(title);
    if (!validatedTitle) {
      newErrors.title = `Title is required and must be under ${InputLimits.MAX_TITLE_LENGTH} characters`;
    }

    // Validate content if provided
    if (content.trim()) {
      const validatedContent = inputValidator.validatePostContent(content);
      if (!validatedContent) {
        newErrors.content = `Content must be under ${InputLimits.MAX_POST_CONTENT_LENGTH} characters`;
      }
    }

    // Validate URL if provided
    if (url.trim()) {
      const validatedUrl = inputValidator.validateUrl(url);
      if (!validatedUrl) {
        newErrors.url = 'Invalid URL format';
      }
    }

    // Validate image URL if provided
    if (imageUrl.trim()) {
      const validatedImageUrl = inputValidator.validateUrl(imageUrl);
      if (!validatedImageUrl) {
        newErrors.imageUrl = 'Invalid image URL format';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [title, content, url, imageUrl]);

  const handleSave = useCallback(() => {
    if (!validateForm()) return;

    setIsSaving(true);

    // Parse tags
    const rawTags = tagsStr
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const sanitizedTags = inputValidator.validateTags(rawTags);

    const updates: Partial<Post> = {
      title: inputValidator.validateTitle(title)!,
      content: content.trim() ? inputValidator.validatePostContent(content) || '' : '',
      url: url.trim() ? inputValidator.validateUrl(url) : undefined,
      imageUrl: imageUrl.trim() ? inputValidator.validateUrl(imageUrl) : undefined,
      tags: sanitizedTags.length > 0 ? sanitizedTags : ['general'],
    };

    // Simulate network delay
    setTimeout(() => {
      onSave(post.id, updates);
      setIsSaving(false);
    }, 500);
  }, [validateForm, title, content, url, imageUrl, tagsStr, post.id, onSave]);

  const handleDelete = useCallback(() => {
    onDelete(post.id);
  }, [post.id, onDelete]);

  const boardName = boards.find((b) => b.id === post.boardId)?.name || 'Unknown';

  return (
    <div className="animate-fade-in">
      <button
        onClick={onCancel}
        className="flex items-center gap-2 text-terminal-dim hover:text-terminal-text mb-4 uppercase text-sm font-bold group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        CANCEL EDIT
      </button>

      <div className="ui-surface-editor max-w-none overflow-hidden">
        <div className="flex items-end justify-between border-b border-terminal-dim/15 px-5 py-4">
          <h2 className="font-display text-3xl font-semibold text-terminal-text">Edit Bit</h2>
          <span className="text-xs text-terminal-dim font-normal">
            Board: <span className="text-terminal-text">//{boardName}</span>
          </span>
        </div>

        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          className="flex flex-col gap-4 px-5 py-5"
        >
          {/* Title */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-terminal-dim uppercase flex justify-between">
              <span>Title *</span>
              <span
                className={title.length > InputLimits.MAX_TITLE_LENGTH ? 'text-terminal-alert' : ''}
              >
                {title.length}/{InputLimits.MAX_TITLE_LENGTH}
              </span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`ui-input text-base md:text-sm
                ${errors.title ? 'border-terminal-alert' : 'border-terminal-dim'}
              `}
            />
            {errors.title && <span className="text-xs text-terminal-alert">{errors.title}</span>}
          </div>

          {/* Content */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-terminal-dim uppercase flex justify-between">
              <span>Content</span>
              <span
                className={
                  content.length > InputLimits.MAX_POST_CONTENT_LENGTH ? 'text-terminal-alert' : ''
                }
              >
                {content.length}/{InputLimits.MAX_POST_CONTENT_LENGTH}
              </span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              className={`ui-input min-h-[100px] resize-y text-base md:text-sm
                ${errors.content ? 'border-terminal-alert' : 'border-terminal-dim'}
              `}
            />
            {errors.content && (
              <span className="text-xs text-terminal-alert">{errors.content}</span>
            )}
          </div>

          {/* URL */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-terminal-dim uppercase flex items-center gap-2">
              <LinkIcon size={12} /> Link URL (optional)
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className={`ui-input
                ${errors.url ? 'border-terminal-alert' : 'border-terminal-dim'}
              `}
            />
            {errors.url && <span className="text-xs text-terminal-alert">{errors.url}</span>}
          </div>

          {/* Image URL */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-terminal-dim uppercase flex items-center gap-2">
              <ImageIcon size={12} /> Image URL (optional)
            </label>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              className={`ui-input
                ${errors.imageUrl ? 'border-terminal-alert' : 'border-terminal-dim'}
              `}
            />
            {errors.imageUrl && (
              <span className="text-xs text-terminal-alert">{errors.imageUrl}</span>
            )}
          </div>

          {/* Tags */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-terminal-dim uppercase flex items-center gap-2">
              <Hash size={12} /> Tags (comma-separated)
            </label>
            <input
              type="text"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="tag1, tag2, tag3"
              className="ui-input"
            />
          </div>

          {/* Actions */}
          <div className="mt-4 flex items-center justify-between border-t border-terminal-dim/20 pt-4">
            {/* Delete Button */}
            <div>
              {showDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-terminal-alert">Delete this post?</span>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="border border-terminal-alert/40 px-3 py-1 text-xs uppercase tracking-[0.12em] text-terminal-alert transition-colors hover:bg-terminal-alert hover:text-black"
                  >
                    YES
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="ui-button-secondary px-3 py-1 text-xs"
                  >
                    NO
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-2 border border-terminal-alert/40 px-3 py-1 text-xs uppercase tracking-[0.12em] text-terminal-alert/80 transition-colors hover:border-terminal-alert hover:text-terminal-alert"
                >
                  <Trash2 size={14} />
                  DELETE
                </button>
              )}
            </div>

            {/* Save Button */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="ui-button-secondary px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="ui-button-primary flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50"
              >
                <Save size={14} />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>

        {/* Warning about Nostr */}
        {post.nostrEventId && (
          <div className="mx-5 mb-5 flex items-start gap-2 border border-terminal-alert/30 bg-terminal-alert/5 p-3">
            <AlertTriangle size={14} className="text-terminal-alert mt-0.5 shrink-0" />
            <p className="text-xs text-terminal-dim">
              <span className="text-terminal-alert font-bold">Note:</span> This post is published on
              Nostr. Saving will publish a companion{' '}
              <span className="text-terminal-text">edit event</span> that updates how BitBoard
              renders this post. Votes remain tied to the original post event (some other clients
              may still show the original).
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
