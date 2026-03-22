import React, { useMemo, useCallback } from 'react';
import { Post, UserState } from '../types';
import {
  ArrowLeft,
  Lock,
  Edit3,
  Bookmark,
  Shield,
  Trash2,
  Loader2,
  Radio,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Plus,
} from 'lucide-react';
import { CommentThread, buildCommentTree } from './CommentThread';
import { MarkdownRenderer } from './MarkdownRenderer';
import { MentionInput } from './MentionInput';
import { ReportModal } from './ReportModal';
import { profileService } from '../services/profileService';
import {
  canVoteOnPost,
  formatPostTime,
  getPostVoteTitle,
  isOwnPost,
  isPostEncryptedWithoutKey,
} from './postItemUtils';

interface PostDetailPageProps {
  post: Post;
  boardName?: string;
  userState: UserState;
  knownUsers?: Set<string>;
  onVote: (postId: string, direction: 'up' | 'down') => void;
  onComment: (postId: string, content: string, parentCommentId?: string) => void;
  onEditComment?: (postId: string, commentId: string, content: string) => void;
  onDeleteComment?: (postId: string, commentId: string) => void;
  onCommentVote?: (postId: string, commentId: string, direction: 'up' | 'down') => void;
  onViewProfile?: (author: string, authorPubkey?: string) => void;
  onEditPost?: (postId: string) => void;
  onDeletePost?: (postId: string) => void;
  onTagClick?: (tag: string) => void;
  onBack: () => void;
  isBookmarked?: boolean;
  onToggleBookmark?: (postId: string) => void;
  onSeedPost?: (post: Post) => void;
  onRetryPost?: (postId: string) => void;
  hasReported?: boolean;
}

export const PostDetailPage: React.FC<PostDetailPageProps> = ({
  post,
  boardName,
  userState,
  knownUsers = new Set(),
  onVote,
  onComment,
  onEditComment,
  onDeleteComment,
  onCommentVote,
  onViewProfile,
  onEditPost,
  onDeletePost,
  onTagClick,
  onBack,
  isBookmarked = false,
  onToggleBookmark,
  onSeedPost,
  onRetryPost,
  hasReported: _hasReported = false,
}) => {
  const [newComment, setNewComment] = React.useState('');
  const [isTransmitting, setIsTransmitting] = React.useState(false);
  const [showReportModal, setShowReportModal] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [collapseKey, setCollapseKey] = React.useState(0);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    setShowDeleteConfirm(false);
    if (onDeletePost) {
      await onDeletePost(post.id);
    }
  }, [onDeletePost, post.id]);

  const handleCancelDelete = useCallback(() => {
    setShowDeleteConfirm(false);
  }, []);

  const ownPost = useMemo(() => isOwnPost(post, userState), [post, userState]);

  const handleBookmarkClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleBookmark?.(post.id);
    },
    [onToggleBookmark, post.id],
  );

  const handleShareClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const shareUrl = `${window.location.origin}${window.location.pathname}?post=${post.id}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
      } catch {
        // silent fallback
      }
    },
    [post.id],
  );

  const handleAuthorClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onViewProfile) {
        onViewProfile(post.author, post.authorPubkey);
      }
    },
    [onViewProfile, post.author, post.authorPubkey],
  );

  const handleEditClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onEditPost) {
        onEditPost(post.id);
      }
    },
    [onEditPost, post.id],
  );

  const handleTagClick = useCallback(
    (e: React.MouseEvent, tag: string) => {
      e.stopPropagation();
      if (onTagClick) {
        onTagClick(tag);
      }
    },
    [onTagClick],
  );

  const voteDirection = useMemo(
    () => userState.votedPosts[post.id],
    [userState.votedPosts, post.id],
  );
  const isUpvoted = useMemo(() => voteDirection === 'up', [voteDirection]);
  const isDownvoted = useMemo(() => voteDirection === 'down', [voteDirection]);
  const hasInvested = useMemo(() => isUpvoted || isDownvoted, [isUpvoted, isDownvoted]);

  const formatTime = useCallback((timestamp: number) => formatPostTime(timestamp), []);

  const isEncryptedWithoutKey = useMemo(() => isPostEncryptedWithoutKey(post), [post]);

  const authorProfile = useMemo(
    () => (post.authorPubkey ? profileService.getCachedProfileSync(post.authorPubkey) : null),
    [post.authorPubkey],
  );

  const authorDisplayName = useMemo(
    () =>
      profileService.getDisplayName(post.authorPubkey || post.author, authorProfile ?? undefined),
    [post.author, post.authorPubkey, authorProfile],
  );

  const handleCommentSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const content = newComment.trim();
      if (!content) return;

      setIsTransmitting(true);
      try {
        await Promise.resolve(onComment(post.id, content, undefined));
        setNewComment('');
      } finally {
        setIsTransmitting(false);
      }
    },
    [newComment, onComment, post.id],
  );

  const handleReplyToComment = useCallback(
    (parentCommentId: string, content: string) => {
      onComment(post.id, content, parentCommentId);
    },
    [onComment, post.id],
  );

  const handleEditComment = useCallback(
    (commentId: string, content: string) => {
      onEditComment?.(post.id, commentId, content);
    },
    [onEditComment, post.id],
  );

  const handleDeleteComment = useCallback(
    (commentId: string) => {
      onDeleteComment?.(post.id, commentId);
    },
    [onDeleteComment, post.id],
  );

  const handleVoteUp = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onVote(post.id, 'up');
    },
    [onVote, post.id],
  );

  const handleVoteDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onVote(post.id, 'down');
    },
    [onVote, post.id],
  );

  const commentTree = useMemo(() => {
    return buildCommentTree(post.comments);
  }, [post.comments]);

  const COLLAPSE_PREFIX = 'bitboard_comment_collapsed_v1:';

  const handleCollapseAll = useCallback(() => {
    const collapseRecursive = (c: {
      id: string;
      replies?: { id: string; replies?: unknown[] }[];
    }) => {
      try {
        localStorage.setItem(`${COLLAPSE_PREFIX}${c.id}`, '1');
      } catch {
        /* */
      }
      (c.replies as typeof commentTree)?.forEach(collapseRecursive);
    };
    commentTree.forEach(collapseRecursive);
    setCollapseKey((k) => k + 1);
  }, [commentTree]);

  const handleExpandAll = useCallback(() => {
    const expandRecursive = (c: {
      id: string;
      replies?: { id: string; replies?: unknown[] }[];
    }) => {
      try {
        localStorage.removeItem(`${COLLAPSE_PREFIX}${c.id}`);
      } catch {
        /* */
      }
      (c.replies as typeof commentTree)?.forEach(expandRecursive);
    };
    commentTree.forEach(expandRecursive);
    setCollapseKey((k) => k + 1);
  }, [commentTree]);

  return (
    <div className="mx-auto w-full max-w-5xl animate-fade-in font-mono">
      {/* Nav Bar */}
      <div className="mb-0 flex items-center justify-between border-b border-terminal-dim/15 px-5 py-5 md:px-7">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-terminal-dim/60 hover:text-terminal-dim transition-colors group"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
          <span className="text-sm tracking-[0.08em] uppercase">// {boardName || 'global'}</span>
        </button>
        <span className="text-sm text-terminal-dim/60 tracking-[0.12em]">BIT · DETAIL</span>
      </div>

      {/* Post Section */}
      <div className="border-b border-terminal-dim/15 px-5 pb-6 pt-8 md:px-7">
        <div className="flex w-full gap-4">
          {/* Vote Column */}
          <div className="flex flex-col items-center w-10 shrink-0 pt-1 gap-1.5">
            <button
              onClick={handleVoteUp}
              className={`p-2 md:p-1 min-w-[40px] min-h-[40px] md:min-w-0 md:min-h-0 flex items-center justify-center transition-colors ${isUpvoted ? 'text-terminal-text' : 'text-terminal-dim'} ${!userState.identity ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!canVoteOnPost(userState, hasInvested)}
              aria-label="Upvote"
              aria-pressed={isUpvoted}
              title={getPostVoteTitle({
                direction: 'up',
                userState,
                isActive: isUpvoted,
                hasInvested,
              })}
            >
              <svg width="16" height="10" viewBox="0 0 12 8">
                <path
                  d="M6 0L12 8H0L6 0Z"
                  fill={isUpvoted ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            </button>

            <span
              className={`text-base font-semibold ${post.score > 0 ? 'text-terminal-text' : post.score < 0 ? 'text-terminal-alert' : 'text-terminal-dim/70'}`}
            >
              {post.score > 0 ? '+' : ''}
              {post.score}
            </span>

            <button
              onClick={handleVoteDown}
              className={`p-2 md:p-1 min-w-[40px] min-h-[40px] md:min-w-0 md:min-h-0 flex items-center justify-center transition-colors ${isDownvoted ? 'text-terminal-alert' : 'text-terminal-dim'} ${!userState.identity ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!canVoteOnPost(userState, hasInvested)}
              aria-label="Downvote"
              aria-pressed={isDownvoted}
              title={getPostVoteTitle({
                direction: 'down',
                userState,
                isActive: isDownvoted,
                hasInvested,
              })}
            >
              <svg width="16" height="10" viewBox="0 0 12 8">
                <path
                  d="M6 8L0 0H12L6 8Z"
                  fill={isDownvoted ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            </button>
          </div>

          {/* Content Column */}
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            {/* Author Row — primary meta flexes; edit/delete stay shrink-wrapped */}
            <div className="flex flex-wrap items-start gap-x-2 gap-y-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                <button
                  type="button"
                  onClick={handleAuthorClick}
                  className="flex min-w-0 max-w-full items-center gap-2 whitespace-normal text-left transition-colors hover:underline cursor-pointer"
                  title={`View ${authorDisplayName}'s profile`}
                >
                  {authorProfile?.picture ? (
                    <img
                      src={authorProfile.picture}
                      alt={`${authorDisplayName}'s avatar`}
                      className="w-6 h-6 rounded-full object-cover border border-terminal-dim/40 shrink-0"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-terminal-dim/15 border border-terminal-dim/30 flex items-center justify-center text-sm text-terminal-text shrink-0">
                      {authorDisplayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="min-w-0 break-words text-sm text-terminal-text/80">
                    {authorDisplayName}
                  </span>
                </button>
                <span className="text-terminal-dim/50 text-sm shrink-0">·</span>
                <span className="shrink-0 text-sm text-terminal-dim/70">
                  {formatTime(post.timestamp)}
                </span>
                {post.seededFrom === 'nostr' && (
                  <span className="flex shrink-0 items-center gap-1 border border-terminal-dim/30 px-2 py-0.5 text-xs uppercase tracking-wider text-terminal-dim/80">
                    <Radio size={10} /> Seeded From Nostr
                  </span>
                )}
              </div>
              {ownPost && (onEditPost || onDeletePost) && (
                <div className="flex shrink-0 items-center gap-2">
                  {onEditPost && (
                    <button
                      type="button"
                      onClick={handleEditClick}
                      className="flex items-center gap-1 text-terminal-dim/70 hover:text-terminal-text transition-colors text-sm"
                      title="Edit this post"
                    >
                      <Edit3 size={10} /> EDIT
                    </button>
                  )}
                  {onDeletePost && (
                    <button
                      type="button"
                      onClick={handleDeleteClick}
                      className="flex items-center gap-1 text-terminal-dim/70 hover:text-terminal-alert transition-colors text-sm"
                      title="Delete this post"
                    >
                      <Trash2 size={10} /> DELETE
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Title */}
            {isEncryptedWithoutKey ? (
              <div className="flex items-center gap-2 text-terminal-dim">
                <Lock size={18} />
                <h2 className="font-display text-lg font-normal leading-none tracking-[-0.02em] md:text-xl lg:text-3xl">
                  [Encrypted - Access Required]
                </h2>
              </div>
            ) : post.url ? (
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-display text-lg font-normal leading-none tracking-[-0.02em] text-terminal-text transition-colors break-words hover:underline decoration-2 underline-offset-4 md:text-xl lg:text-3xl"
              >
                {post.title}
              </a>
            ) : (
              <h2 className="font-display text-lg font-normal leading-none tracking-[-0.02em] text-terminal-text break-words md:text-xl lg:text-3xl">
                {post.title}
              </h2>
            )}

            {/* Media Preview */}
            {post.imageUrl && (
              <div className="relative max-w-lg overflow-hidden border border-terminal-dim/20 bg-black">
                <a
                  href={post.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <img
                    src={post.imageUrl}
                    alt="Content Preview"
                    loading="lazy"
                    className="w-full h-auto max-h-[300px] object-cover"
                  />
                </a>
              </div>
            )}

            {/* Body */}
            {isEncryptedWithoutKey ? (
              <div className="text-base text-terminal-dim font-mono leading-relaxed p-4 border border-terminal-dim/30 bg-terminal-dim/5">
                <p className="mb-2">
                  This post is encrypted. You need the board share link to view it.
                </p>
                <p className="text-base text-terminal-dim/70">
                  The encryption key is embedded in the share link URL fragment and never sent to
                  servers.
                </p>
              </div>
            ) : (
              <div className="max-w-3xl text-[15px] leading-[1.75] text-terminal-dim/75 break-words md:text-base">
                <MarkdownRenderer content={post.content} />
              </div>
            )}

            {/* Tags */}
            {post.tags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {post.tags.map((tag) => (
                  <button
                    key={tag}
                    onClick={(e) => handleTagClick(e, tag)}
                    className="text-sm border border-terminal-dim/20 px-1.75 py-0.5 text-terminal-dim/70 hover:text-terminal-dim hover:border-terminal-dim/40 cursor-pointer transition-colors"
                    title={`Search for #${tag}`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-terminal-dim/15 px-5 py-3 md:px-7">
        <button
          onClick={() => {
            const el = document.getElementById('comment-thread');
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          className="flex items-center gap-1.25 text-sm text-terminal-dim/70 hover:text-terminal-dim tracking-[0.06em] transition-colors"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {post.commentCount} {post.commentCount === 1 ? 'reply' : 'replies'}
        </button>

        <button
          onClick={handleShareClick}
          className="flex items-center gap-1.25 text-sm text-terminal-dim/70 hover:text-terminal-dim tracking-[0.06em] transition-colors"
          title="Copy link"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          share
        </button>

        <button
          onClick={handleBookmarkClick}
          className={`flex items-center gap-1.25 text-sm tracking-[0.06em] transition-colors ${isBookmarked ? 'text-terminal-text' : 'text-terminal-dim/70 hover:text-terminal-dim'}`}
          title={isBookmarked ? 'Remove bookmark' : 'Save to bookmarks'}
          aria-label={isBookmarked ? 'Remove bookmark' : 'Save to bookmarks'}
          aria-pressed={isBookmarked}
        >
          <Bookmark size={12} fill={isBookmarked ? 'currentColor' : 'none'} />
          save
        </button>

        {post.source === 'nostr-community' && onSeedPost && (
          <button
            onClick={() => onSeedPost(post)}
            className="flex items-center gap-1.25 text-sm text-terminal-dim/70 hover:text-terminal-dim tracking-[0.06em] transition-colors"
          >
            <Radio size={12} /> seed to bitboard
          </button>
        )}
      </div>

      {ownPost && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-terminal-dim/10 px-5 py-2 md:px-7">
          {post.syncStatus === 'pending' && (
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-terminal-dim/60">
              <Loader2 size={11} className="animate-spin" />
              Publishing to Nostr
            </span>
          )}
          {post.syncStatus === 'failed' && (
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-terminal-alert/80">
              <AlertTriangle size={11} />
              Publish failed{post.syncError ? `: ${post.syncError.slice(0, 50)}` : ''}
            </span>
          )}
          {post.syncStatus === 'synced' && post.nostrEventId && (
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-terminal-dim/60">
              <CheckCircle2 size={11} className="text-terminal-text/60" />
              Published on Nostr ·
              <a
                href={`https://njump.me/${post.nostrEventId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline transition-colors hover:text-terminal-text"
                title={post.nostrEventId}
              >
                {post.nostrEventId.slice(0, 12)}…
              </a>
            </span>
          )}
          {!post.syncStatus && !post.nostrEventId && (
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-terminal-dim/40">
              <Shield size={11} />
              Local only - connect an identity to publish
            </span>
          )}
          {post.syncStatus === 'failed' && onRetryPost && (
            <button
              onClick={() => onRetryPost(post.id)}
              className="flex items-center gap-1 border border-terminal-alert/35 px-2 py-1 text-[11px] uppercase tracking-[0.08em] text-terminal-alert/80 transition-colors hover:border-terminal-alert/60 hover:text-terminal-alert"
            >
              <RefreshCw size={10} />
              Retry publish
            </button>
          )}
        </div>
      )}

      {/* Comment Composer */}
      <form
        onSubmit={handleCommentSubmit}
        className="border-b border-terminal-dim/15 px-5 py-4 md:px-7"
      >
        <div className="flex w-full flex-col gap-2.5">
          <span className="text-sm text-terminal-dim/70 uppercase tracking-widest">
            Join the thread
          </span>
          <div className="border-b border-terminal-dim/10 pb-3">
            <div className="flex items-end gap-3">
              <div className="relative min-w-0 flex-1 cursor-text pl-4">
                <div className="pointer-events-none absolute left-0 top-1 h-7 w-px bg-terminal-text motion-safe:animate-pulse" />
                <MentionInput
                  value={newComment}
                  onChange={setNewComment}
                  knownUsers={knownUsers}
                  placeholder="Add your reply… Markdown and @mentions supported."
                  minHeight="44px"
                  disabled={isTransmitting}
                  className="!min-h-[44px] !resize-none !border-0 !bg-transparent !px-0 !py-0 !text-[15px] !leading-[1.6] !caret-terminal-text focus:!border-0 focus:!outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={!newComment.trim() || isTransmitting}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-terminal-text text-black shadow-hard transition-all hover:scale-110 hover:brightness-110 disabled:cursor-not-allowed disabled:bg-terminal-text disabled:text-black/45"
                aria-label="Transmit reply"
                title="Transmit reply"
              >
                {isTransmitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Plus size={22} strokeWidth={2.5} />
                )}
              </button>
            </div>
            <div className="mt-2 pl-4 text-xs uppercase tracking-[0.08em] text-terminal-dim/40">
              ⌘⏎ transmit
            </div>
          </div>
        </div>
      </form>

      {/* Thread Header */}
      <div
        id="comment-thread"
        className="flex items-center justify-between border-b border-dashed border-terminal-dim/20 px-5 pb-2 pt-5 md:px-7"
      >
        <span className="text-sm text-terminal-dim/70 uppercase tracking-[0.12em]">
          {post.commentCount} {post.commentCount === 1 ? 'reply' : 'replies'}
        </span>
        {commentTree.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCollapseAll}
              className="text-sm tracking-[0.06em] text-terminal-dim/70 hover:text-terminal-dim transition-colors"
            >
              collapse all
            </button>
            <span className="text-terminal-dim/50 text-sm">·</span>
            <button
              onClick={handleExpandAll}
              className="text-sm tracking-[0.06em] text-terminal-dim/70 hover:text-terminal-dim transition-colors"
            >
              expand all
            </button>
          </div>
        )}
      </div>

      {/* Comment Thread */}
      <div className="px-5 pb-7 pt-2 md:px-7" key={collapseKey}>
        {commentTree.length > 0 ? (
          <div className="space-y-0">
            {commentTree.map((comment) => (
              <CommentThread
                key={comment.id}
                comment={comment}
                userState={userState}
                onReply={handleReplyToComment}
                onEdit={onEditComment ? handleEditComment : undefined}
                onDelete={onDeleteComment ? handleDeleteComment : undefined}
                onVote={onCommentVote}
                postId={post.id}
                onViewProfile={onViewProfile}
                formatTime={formatTime}
                knownUsers={knownUsers}
              />
            ))}
          </div>
        ) : (
          <p className="py-6 text-sm italic text-terminal-dim/55">No replies yet.</p>
        )}
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <ReportModal
          targetType="post"
          targetId={post.id}
          targetPreview={post.title}
          onClose={() => setShowReportModal(false)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="ui-overlay flex items-center justify-center" onClick={handleCancelDelete}>
          <div
            className="mx-4 w-full max-w-md border border-terminal-alert/40 bg-terminal-bg/95 p-6 shadow-glow"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <Trash2 size={24} className="text-terminal-alert" />
              <h3 className="text-lg font-bold text-terminal-text uppercase tracking-wider">
                Delete Post?
              </h3>
            </div>

            <p className="text-terminal-text/80 text-sm mb-2">
              Are you sure you want to delete this post?
            </p>
            <p className="text-terminal-dim text-sm mb-6 border-l-2 border-terminal-dim pl-3">
              &quot;{post.title.length > 60 ? post.title.slice(0, 60) + '...' : post.title}&quot;
            </p>

            {post.nostrEventId && (
              <p className="text-terminal-alert/80 text-sm mb-4 flex items-center gap-2">
                <Shield size={12} />A deletion request will be broadcast to Nostr relays. Some
                relays may still retain the post.
              </p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelDelete}
                className="ui-button-secondary px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="border border-terminal-alert/50 bg-terminal-alert/20 px-4 py-2 text-sm font-bold uppercase tracking-[0.12em] text-terminal-alert transition-colors hover:bg-terminal-alert hover:text-black"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
