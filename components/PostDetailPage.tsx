import React, { useMemo, useCallback } from 'react';
import { Post, UserState } from '../types';
import { ArrowLeft, Lock, Edit3, Bookmark, Shield, Trash2, Loader2, Radio } from 'lucide-react';
import { CommentThread, buildCommentTree } from './CommentThread';
import { MarkdownRenderer } from './MarkdownRenderer';
import { MentionInput } from './MentionInput';
import { ReportModal } from './ReportModal';
import { profileService } from '../services/profileService';

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

  const isOwnPost = useMemo(() => {
    if (!userState.identity) return false;
    return post.authorPubkey === userState.identity.pubkey || post.author === userState.username;
  }, [post.authorPubkey, post.author, userState.identity, userState.username]);

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

  const formatTime = useCallback((timestamp: number) => {
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return '< 1h';
    if (hours > 24) return `${Math.floor(hours / 24)}d`;
    return `${hours}h`;
  }, []);

  const isEncryptedWithoutKey = useMemo(() => {
    if (!post.isEncrypted) return false;
    if (post.content === '[Encrypted - Access Required]' || post.title === '[Encrypted]') {
      return true;
    }
    if (post.encryptedContent && post.content === post.encryptedContent) {
      return true;
    }
    return false;
  }, [post]);

  const authorProfile = useMemo(
    () => (post.authorPubkey ? profileService.getCachedProfileSync(post.authorPubkey) : null),
    [post.authorPubkey],
  );

  const authorDisplayName = useMemo(
    () => profileService.getDisplayName(post.author, authorProfile ?? undefined),
    [post.author, authorProfile],
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
    <div className="animate-fade-in font-mono">
      {/* Nav Bar */}
      <div className="flex items-center justify-between py-4 px-4 border-b border-terminal-dim/20 mb-0">
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
      <div className="pt-7 pb-5 px-4 border-b border-terminal-dim/20">
        <div className="flex gap-4">
          {/* Vote Column */}
          <div className="flex flex-col items-center w-10 shrink-0 pt-1 gap-1.5">
            <button
              onClick={handleVoteUp}
              className={`p-2 md:p-1 min-w-[40px] min-h-[40px] md:min-w-0 md:min-h-0 flex items-center justify-center transition-colors ${isUpvoted ? 'text-terminal-text' : 'text-terminal-dim'} ${!userState.identity ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!userState.identity || (userState.bits <= 0 && !hasInvested)}
              aria-label="Upvote"
              aria-pressed={isUpvoted}
              title={
                !userState.identity
                  ? 'Connect identity to vote with bits'
                  : isUpvoted
                    ? 'Retract upvote and refund 1 bit'
                    : hasInvested
                      ? 'Switch vote direction at no extra bit cost'
                      : 'Spend 1 bit to upvote this post'
              }
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
              disabled={!userState.identity || (userState.bits <= 0 && !hasInvested)}
              aria-label="Downvote"
              aria-pressed={isDownvoted}
              title={
                !userState.identity
                  ? 'Connect identity to vote with bits'
                  : isDownvoted
                    ? 'Retract downvote and refund 1 bit'
                    : hasInvested
                      ? 'Switch vote direction at no extra bit cost'
                      : 'Spend 1 bit to downvote this post'
              }
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
          <div className="flex flex-col flex-1 min-w-0 gap-2.5">
            {/* Author Row */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleAuthorClick}
                className="flex items-center gap-2 hover:underline transition-colors cursor-pointer"
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
                <span className="text-sm text-terminal-text/80">{authorDisplayName}</span>
              </button>
              <span className="text-terminal-dim/50 text-sm">·</span>
              <span className="text-sm text-terminal-dim/70">{formatTime(post.timestamp)}</span>
              {post.seededFrom === 'nostr' && (
                <span className="flex items-center gap-1 border border-terminal-dim/30 px-2 py-0.5 text-xs uppercase tracking-wider text-terminal-dim/80">
                  <Radio size={10} /> Seeded From Nostr
                </span>
              )}
              {isOwnPost && onEditPost && (
                <button
                  onClick={handleEditClick}
                  className="ml-auto flex items-center gap-1 text-terminal-dim/70 hover:text-terminal-text transition-colors text-sm"
                  title="Edit this post"
                >
                  <Edit3 size={10} /> EDIT
                </button>
              )}
              {isOwnPost && onDeletePost && (
                <button
                  onClick={handleDeleteClick}
                  className="flex items-center gap-1 text-terminal-dim/70 hover:text-terminal-alert transition-colors text-sm"
                  title="Delete this post"
                >
                  <Trash2 size={10} /> DELETE
                </button>
              )}
            </div>

            {/* Title */}
            {isEncryptedWithoutKey ? (
              <div className="flex items-center gap-2 text-terminal-dim">
                <Lock size={18} />
                <h2 className="text-3xl font-semibold font-display leading-snug">
                  [Encrypted - Access Required]
                </h2>
              </div>
            ) : post.url ? (
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-3xl font-semibold font-display text-terminal-text leading-snug hover:underline decoration-2 underline-offset-4 transition-colors break-words"
              >
                {post.title}
              </a>
            ) : (
              <h2 className="text-3xl font-semibold font-display text-terminal-text leading-snug break-words">
                {post.title}
              </h2>
            )}

            {/* Media Preview */}
            {post.imageUrl && (
              <div className="border border-terminal-dim/30 relative overflow-hidden bg-black max-w-lg">
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
              <div className="text-base text-terminal-dim/70 font-mono leading-[1.7] break-words">
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
      <div className="flex items-center gap-5 py-3 px-4 border-b border-terminal-dim/20">
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

      {/* Comment Composer */}
      <form onSubmit={handleCommentSubmit} className="py-5 px-4 border-b border-terminal-dim/20">
        <div className="flex flex-col gap-2.5">
          <span className="text-sm text-terminal-dim/70 uppercase tracking-widest">
            Join the thread
          </span>
          <MentionInput
            value={newComment}
            onChange={setNewComment}
            knownUsers={knownUsers}
            placeholder="Add your reply… Markdown and @mentions supported."
            minHeight="60px"
            disabled={isTransmitting}
            className="!border-terminal-dim/30 focus:!border-terminal-dim/40"
          />
          <div className="flex items-center justify-between">
            <span className="text-sm text-terminal-dim/70">cmd+return to transmit</span>
            <button
              type="submit"
              disabled={!newComment.trim() || isTransmitting}
              className="bg-terminal-text text-terminal-bg text-sm font-bold px-4.5 py-1.75 disabled:opacity-50 transition-colors tracking-[0.06em]"
            >
              {isTransmitting ? <Loader2 size={14} className="animate-spin" /> : 'Transmit'}
            </button>
          </div>
        </div>
      </form>

      {/* Thread Header */}
      <div
        id="comment-thread"
        className="flex items-center justify-between pt-4 pb-2 px-4 border-b border-dashed border-terminal-dim/25"
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
      <div className="pt-2 pb-7 px-4" key={collapseKey}>
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
          <p className="text-terminal-dim/70 italic text-sm py-4">No replies yet.</p>
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
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          onClick={handleCancelDelete}
        >
          <div
            className="bg-terminal-bg border-2 border-terminal-alert p-6 max-w-md w-full mx-4 shadow-glow"
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
                className="px-4 py-2 text-sm border border-terminal-dim text-terminal-dim hover:text-terminal-text hover:border-terminal-text transition-colors uppercase font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-sm bg-terminal-alert/20 border border-terminal-alert text-terminal-alert hover:bg-terminal-alert hover:text-black transition-colors uppercase font-bold"
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
