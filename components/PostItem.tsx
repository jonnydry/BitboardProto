import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Post } from '../types';
import { useUserState, useIsMuted } from '../stores/userStore';
import { EXPANSION_THRESHOLD, INLINE_PREVIEW_COMMENT_COUNT } from '../constants';
import {
  ArrowBigUp,
  ArrowBigDown,
  MessageSquare,
  Clock,
  Hash,
  ExternalLink,
  CornerDownRight,
  Maximize2,
  Image as ImageIcon,
  Shield,
  Users,
  UserX,
  Bookmark,
  Edit3,
  Flag,
  Lock,
  VolumeX,
  Trash2,
  RefreshCw,
  AlertTriangle,
  Loader2,
  MoreHorizontal,
} from 'lucide-react';
import { profileService } from '../services/profileService';
import { toastService } from '../services/toastService';
import { CommentThread, buildCommentTree } from './CommentThread';
// MentionText is used via MarkdownRenderer
import { MentionInput } from './MentionInput';
import { ShareButton } from './ShareButton';
import { ReportModal } from './ReportModal';
import { ImagePreview } from './ImagePreview';
import { MarkdownRenderer } from './MarkdownRenderer';
import { LinkPreviewList } from './LinkPreview';
import { extractUrls } from '../services/linkPreviewService';
import { ReactionBar } from './ReactionPicker';
import { ZapButton } from './ZapButton';
import { BadgeDisplay } from './BadgeDisplay';
import { TrustIndicator } from './TrustIndicator';
import { usePostAuthorProfile } from './usePostAuthorProfile';
import { useUIStore } from '../stores/uiStore';
import {
  buildPreviewCommentTree,
  formatPostTime,
  isPostEncryptedWithoutKey,
} from './postItemUtils';

// Simple renderer for plain text content (no markdown)
const PlainTextRenderer: React.FC<{ content: string }> = ({ content }) => (
  <span className="whitespace-pre-wrap">{content}</span>
);

interface PostItemProps {
  post: Post;
  boardName?: string;
  knownUsers?: Set<string>;
  onVote: (postId: string, direction: 'up' | 'down') => void;
  onComment: (postId: string, content: string, parentCommentId?: string) => void;
  onEditComment?: (postId: string, commentId: string, content: string) => void;
  onDeleteComment?: (postId: string, commentId: string) => void;
  onCommentVote?: (postId: string, commentId: string, direction: 'up' | 'down') => void;
  onViewBit: (postId: string) => void;
  onViewProfile?: (author: string, authorPubkey?: string) => void;
  onEditPost?: (postId: string) => void;
  onDeletePost?: (postId: string) => void;
  onTagClick?: (tag: string) => void;
  onToggleBookmark?: (postId: string) => void;
  isFullPage?: boolean;
  onToggleMute?: (pubkey: string) => void;
  isMuted?: (pubkey: string) => boolean;
  onRetryPost?: (postId: string) => void;
}

const PostItemComponent: React.FC<PostItemProps> = ({
  post,
  boardName,
  knownUsers = new Set(),
  onVote,
  onComment,
  onEditComment,
  onDeleteComment,
  onCommentVote,
  onViewBit,
  onViewProfile,
  onEditPost,
  onDeletePost,
  onTagClick,
  onToggleBookmark,
  isFullPage = false,
  onToggleMute,
  isMuted: isMutedProp,
  onRetryPost,
}) => {
  // Get userState from store instead of props
  const userState = useUserState();
  const isNostrConnected = useUIStore((s) => s.isNostrConnected);
  const bookmarkedIds = useUIStore((s) => s.bookmarkedIds);
  const reportedPostIds = useUIStore((s) => s.reportedPostIds);
  const isBookmarked = bookmarkedIds.includes(post.id);
  const hasReported = reportedPostIds.includes(post.id);
  const isMutedStore = useIsMuted(post.authorPubkey || '');
  const isMuted = isMutedProp ?? (post.authorPubkey ? isMutedStore : false);
  const [isExpanded, setIsExpanded] = useState(isFullPage);
  const [newComment, setNewComment] = useState('');
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const { postRef, authorProfile, profileLoadState } = usePostAuthorProfile(post.authorPubkey);
  const moreActionsRef = React.useRef<HTMLDivElement | null>(null);

  const handleReportClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!hasReported) {
        setShowReportModal(true);
      }
    },
    [hasReported],
  );

  // Check if this is the user's own post
  const isOwnPost = useMemo(() => {
    if (!userState.identity) return false;
    return post.authorPubkey === userState.identity.pubkey || post.author === userState.username;
  }, [post.authorPubkey, post.author, userState.identity, userState.username]);

  const handleBookmarkClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const willBeBookmarked = !isBookmarked;
      onToggleBookmark?.(post.id);
      toastService.push({
        type: 'success',
        message: willBeBookmarked ? 'Bookmark added' : 'Bookmark removed',
        durationMs: 2000,
      });
    },
    [onToggleBookmark, post.id, isBookmarked],
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

  const handleTagClick = useCallback(
    (e: React.MouseEvent, tag: string) => {
      e.stopPropagation();
      if (onTagClick) {
        onTagClick(tag);
      }
    },
    [onTagClick],
  );

  // If in full page mode, always expanded
  useEffect(() => {
    if (isFullPage) setIsExpanded(true);
  }, [isFullPage]);

  useEffect(() => {
    if (!showMoreActions) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (!moreActionsRef.current?.contains(event.target as Node)) {
        setShowMoreActions(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showMoreActions]);

  const voteDirection = useMemo(
    () => userState.votedPosts[post.id],
    [userState.votedPosts, post.id],
  );
  const isUpvoted = useMemo(() => voteDirection === 'up', [voteDirection]);
  const isDownvoted = useMemo(() => voteDirection === 'down', [voteDirection]);
  const hasInvested = useMemo(() => isUpvoted || isDownvoted, [isUpvoted, isDownvoted]);

  // Expansion Rule: Inline if <= EXPANSION_THRESHOLD comments, otherwise Full Page
  const requiresFullPage = useMemo(
    () => post.commentCount > EXPANSION_THRESHOLD,
    [post.commentCount],
  );

  const formatTime = useCallback((timestamp: number) => formatPostTime(timestamp), []);

  const isEncryptedWithoutKey = useMemo(() => isPostEncryptedWithoutKey(post), [post]);

  // Reply draft save/restore
  const REPLY_DRAFT_KEY = `bitboard_reply_draft_${post.id}`;
  const replyDraftTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load reply draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REPLY_DRAFT_KEY);
      if (saved) {
        setNewComment(saved);
      }
    } catch {
      // Ignore errors
    }
  }, [REPLY_DRAFT_KEY]);

  // Save reply draft on changes (debounced)
  useEffect(() => {
    if (replyDraftTimerRef.current) {
      clearTimeout(replyDraftTimerRef.current);
    }
    if (newComment) {
      replyDraftTimerRef.current = setTimeout(() => {
        localStorage.setItem(REPLY_DRAFT_KEY, newComment);
      }, 500);
    }
    return () => {
      if (replyDraftTimerRef.current) {
        clearTimeout(replyDraftTimerRef.current);
      }
    };
  }, [newComment, REPLY_DRAFT_KEY]);

  // Clear draft on successful submit
  const handleCommentSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const content = newComment.trim();
      if (!content) return;

      setIsTransmitting(true);
      try {
        await Promise.resolve(onComment(post.id, content, undefined));
        setNewComment('');
        localStorage.removeItem(REPLY_DRAFT_KEY);
      } finally {
        setIsTransmitting(false);
      }
    },
    [newComment, onComment, post.id, REPLY_DRAFT_KEY],
  );

  // Handle threaded reply to a specific comment
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

  const commentTree = useMemo(() => {
    return buildCommentTree(post.comments);
  }, [post.comments]);

  const previewCommentTree = useMemo(() => {
    return buildPreviewCommentTree({
      allComments: post.comments,
      commentTree,
      isFullPage,
      previewLimit: INLINE_PREVIEW_COMMENT_COUNT,
      userPubkey: userState.identity?.pubkey,
    });
  }, [post.comments, userState.identity?.pubkey, isFullPage, commentTree]);

  const handleInteraction = useCallback(() => {
    if (isFullPage) return; // Already expanded in full view

    if (requiresFullPage) {
      onViewBit(post.id);
    } else {
      setIsExpanded(!isExpanded);
    }
  }, [isFullPage, requiresFullPage, onViewBit, post.id, isExpanded]);

  const handleVoteUp = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!userState.identity) {
        toastService.push({
          type: 'warning',
          message: 'Connect identity to vote with bits',
          durationMs: 2000,
        });
        return;
      }
      if (userState.bits <= 0 && !hasInvested) {
        toastService.push({
          type: 'warning',
          message: 'No bits remaining today. They reset at midnight.',
          durationMs: 3000,
        });
        return;
      }
      onVote(post.id, 'up');
    },
    [onVote, post.id, userState.identity, userState.bits, hasInvested],
  );

  const handleVoteDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!userState.identity) {
        toastService.push({
          type: 'warning',
          message: 'Connect identity to vote with bits',
          durationMs: 2000,
        });
        return;
      }
      if (userState.bits <= 0 && !hasInvested) {
        toastService.push({
          type: 'warning',
          message: 'No bits remaining today. They reset at midnight.',
          durationMs: 3000,
        });
        return;
      }
      onVote(post.id, 'down');
    },
    [onVote, post.id, userState.identity, userState.bits, hasInvested],
  );

  const handleCommentClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isFullPage) {
        const commentSection = document.getElementById('comment-thread');
        if (commentSection) {
          commentSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else {
        onViewBit(post.id);
      }
    },
    [isFullPage, onViewBit, post.id],
  );

  const handleInteractionKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleInteraction();
      }
    },
    [handleInteraction],
  );

  // Extract inline images
  const inlineImages = useMemo(() => {
    if (!post.content || isEncryptedWithoutKey) return [];
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = post.content.match(urlRegex) || [];
    return matches.filter(
      (url) => /\.(jpeg|jpg|gif|png|webp|bmp)$/i.test(url) && url !== post.imageUrl,
    );
  }, [post.content, post.imageUrl, isEncryptedWithoutKey]);

  // Extract non-image URLs for link previews
  const linkUrls = useMemo(() => {
    if (!post.content || isEncryptedWithoutKey) return [];
    // Also include the post's url if it exists
    const contentUrls = extractUrls(post.content);
    const allUrls = post.url ? [post.url, ...contentUrls] : contentUrls;
    // Deduplicate
    return [...new Set(allUrls)];
  }, [post.content, post.url, isEncryptedWithoutKey]);

  return (
    <div
      ref={postRef}
      style={
        !isExpanded && !isFullPage
          ? ({ contentVisibility: 'auto', containIntrinsicSize: '420px' } as React.CSSProperties)
          : undefined
      }
      className={`w-full border-2 transition-all duration-200 mb-4 relative group font-mono
        ${
          post.syncStatus === 'pending'
            ? 'border-terminal-dim/50 bg-terminal-bg/80 animate-pulse'
            : post.syncStatus === 'failed'
              ? 'border-terminal-alert/70 bg-terminal-alert/5'
              : isExpanded
                ? 'border-terminal-text bg-terminal-highlight shadow-glow'
                : 'border-terminal-dim bg-terminal-bg hover:border-terminal-text'
        }
      `}
    >
      {/* Sync Status Indicator */}
      {post.syncStatus && post.syncStatus !== 'synced' && (
        <div
          className={`absolute top-0 left-0 right-0 flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wider font-mono z-10
            ${
              post.syncStatus === 'pending'
                ? 'bg-terminal-dim/20 text-terminal-dim border-b border-terminal-dim/30'
                : 'bg-terminal-alert/10 text-terminal-alert border-b border-terminal-alert/30'
            }
          `}
        >
          <div className="flex items-center gap-1.5">
            {post.syncStatus === 'pending' ? (
              <>
                <Loader2 size={10} className="animate-spin" />
                <span>Publishing to Nostr...</span>
              </>
            ) : (
              <>
                <AlertTriangle size={10} />
                <span>
                  Sync failed
                  {post.syncError
                    ? `: ${post.syncError.slice(0, 30)}${post.syncError.length > 30 ? '...' : ''}`
                    : ''}
                </span>
              </>
            )}
          </div>
          {post.syncStatus === 'failed' && onRetryPost && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRetryPost(post.id);
              }}
              className="flex items-center gap-1 px-2 py-0.5 bg-terminal-alert/20 hover:bg-terminal-alert/30 border border-terminal-alert/40 rounded text-terminal-alert transition-colors"
              title="Retry publishing to Nostr"
            >
              <RefreshCw size={10} />
              <span>RETRY</span>
            </button>
          )}
        </div>
      )}

      {/* Decorator corners */}
      <div className="absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2 border-terminal-text opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2 border-terminal-text opacity-0 group-hover:opacity-100 transition-opacity"></div>

      <div
        className={`flex flex-row gap-2 md:gap-3 p-2 ${isExpanded ? 'p-3 md:p-4' : ''} ${post.syncStatus && post.syncStatus !== 'synced' ? 'pt-8' : ''}`}
      >
        {/* Voting Column - Cryptographically Verified */}
        <div className="flex flex-col items-center w-10 md:w-12 border-r border-terminal-dim pr-1 md:pr-2 justify-start pt-1 gap-0.5 md:gap-1 flex-shrink-0">
          <button
            onClick={handleVoteUp}
            className={`p-2 md:p-1 hover:bg-terminal-dim transition-colors min-w-[40px] min-h-[40px] md:min-w-0 md:min-h-0 flex items-center justify-center ${isUpvoted ? 'text-terminal-text font-bold' : 'text-terminal-dim'} ${!userState.identity ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={!userState.identity}
            aria-label="Upvote"
            aria-pressed={isUpvoted}
            title={
              !userState.identity
                ? 'Connect identity to vote with bits'
                : userState.bits <= 0 && !hasInvested
                  ? 'No bits remaining today'
                  : isUpvoted
                    ? 'Retract upvote and refund 1 bit'
                    : hasInvested
                      ? 'Switch vote direction at no extra bit cost'
                      : 'Spend 1 bit to upvote this post'
            }
          >
            <ArrowBigUp
              size={22}
              className="md:w-5 md:h-5"
              fill={isUpvoted ? 'currentColor' : 'none'}
            />
          </button>

          <span
            className={`text-sm md:text-base font-bold ${post.score > 0 ? 'text-terminal-text' : post.score < 0 ? 'text-terminal-alert' : 'text-terminal-dim/50'}`}
          >
            {post.score > 0 ? '+' : ''}
            {post.score}
          </span>

          <button
            onClick={handleVoteDown}
            className={`p-2 md:p-1 hover:bg-terminal-dim transition-colors min-w-[40px] min-h-[40px] md:min-w-0 md:min-h-0 flex items-center justify-center ${isDownvoted ? 'text-terminal-alert font-bold' : 'text-terminal-dim'} ${!userState.identity ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={!userState.identity}
            aria-label="Downvote"
            aria-pressed={isDownvoted}
            title={
              !userState.identity
                ? 'Connect identity to vote with bits'
                : userState.bits <= 0 && !hasInvested
                  ? 'No bits remaining today'
                  : isDownvoted
                    ? 'Retract downvote and refund 1 bit'
                    : hasInvested
                      ? 'Switch vote direction at no extra bit cost'
                      : 'Spend 1 bit to downvote this post'
            }
          >
            <ArrowBigDown
              size={22}
              className="md:w-5 md:h-5"
              fill={isDownvoted ? 'currentColor' : 'none'}
            />
          </button>

          {/* Nostr Verification Badge + Voter Count */}
          {post.nostrEventId && (
            <div className="mt-1 flex flex-col items-center gap-0.5">
              {post.votesVerified ? (
                <div
                  className="flex flex-col items-center gap-0.5"
                  title="Score synced with verified Nostr votes"
                >
                  <div className="flex items-center gap-1">
                    <Shield size={10} className="text-terminal-text" />
                    {typeof post.uniqueVoters === 'number' && (
                      <span className="text-[11px] text-terminal-dim flex items-center gap-0.5">
                        <Users size={8} /> {post.uniqueVoters}
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] uppercase tracking-wide text-terminal-dim">
                    verified
                  </span>
                </div>
              ) : (
                <div
                  className="flex items-center gap-0.5"
                  title={
                    isNostrConnected
                      ? 'Syncing verified votes from relays...'
                      : 'Offline: showing local/last known score.'
                  }
                >
                  <Shield
                    size={10}
                    className={isNostrConnected ? 'text-terminal-dim' : 'text-terminal-alert'}
                  />
                </div>
              )}
            </div>
          )}

          {/* Investment Indicator */}
          {hasInvested && (
            <div className="mt-2 flex flex-col items-center animate-fade-in group relative">
              <span className="text-[10px] text-terminal-text border border-terminal-text px-1 py-0.5 uppercase tracking-tighter">
                1 BIT
              </span>
              <span className="text-[10px] text-terminal-text flex items-center gap-1">
                INVESTED
                <span
                  title="Bit economy: First vote costs 1 bit. Switching votes is free. Retracting refunds your bit. Bits reset daily at midnight."
                  className="text-terminal-dim cursor-help"
                >
                  ?
                </span>
              </span>
              <div className="absolute left-full top-0 ml-2 w-48 p-2 border border-terminal-dim bg-terminal-bg text-[10px] text-terminal-dim hidden group-hover:block z-20 pointer-events-none">
                Bit economy: First vote costs 1 bit. Switching votes is free. Retracting refunds
                your bit. Bits reset daily.
              </div>
            </div>
          )}
        </div>

        {/* Content Column */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="text-xs text-terminal-dim mb-1 flex flex-wrap items-center gap-2 uppercase tracking-wider">
            {boardName && (
              <span className="bg-terminal-dim/20 px-1 text-terminal-text font-bold mr-2">
                //{boardName}
              </span>
            )}
            <button
              onClick={handleAuthorClick}
              className="flex items-center gap-1 font-bold text-terminal-dim hover:text-terminal-text hover:underline transition-colors cursor-pointer"
              title={`View ${profileService.getDisplayName(post.author, authorProfile)}'s profile`}
            >
              {/* Avatar with placeholder and fade-in */}
              <div className="relative w-4 h-4 flex-shrink-0">
                {profileLoadState === 'loading' && (
                  <div className="absolute inset-0 rounded-full bg-terminal-dim/30 animate-pulse" />
                )}
                {profileLoadState === 'loaded' && authorProfile?.picture ? (
                  <img
                    src={authorProfile.picture}
                    alt={`${post.author}'s avatar`}
                    className="w-4 h-4 rounded-full object-cover transition-opacity duration-300"
                    style={{ opacity: 1 }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  profileLoadState !== 'loading' && (
                    <div
                      className="w-4 h-4 rounded-full bg-terminal-dim/20 flex items-center justify-center text-[10px] text-terminal-dim font-bold"
                      title={post.authorPubkey ? `${post.authorPubkey.slice(0, 8)}...` : ''}
                    >
                      {post.author.charAt(0).toUpperCase()}
                    </div>
                  )
                )}
              </div>
              {/* Name with loading state */}
              <span
                className={`transition-opacity duration-200 ${profileLoadState === 'loading' ? 'opacity-70' : 'opacity-100'}`}
              >
                {profileLoadState === 'loaded'
                  ? profileService.getDisplayName(post.author, authorProfile)
                  : post.authorPubkey
                    ? `${post.authorPubkey.slice(0, 8)}...`
                    : post.author}
              </span>
            </button>
            <BadgeDisplay pubkey={post.authorPubkey || ''} size="sm" />
            <TrustIndicator pubkey={post.authorPubkey || ''} compact={true} />
            <span>::</span>
            <span className="flex items-center gap-1">
              <Clock size={12} /> {formatTime(post.timestamp)}
            </span>
            {post.isEncrypted && (
              <span
                className="flex items-center gap-1 text-terminal-text border border-terminal-text/50 px-1 py-0.5 text-[10px] uppercase tracking-wider"
                title="This post is encrypted"
              >
                <Lock size={10} /> Encrypted
              </span>
            )}
            {isOwnPost && onEditPost && (
              <button
                onClick={handleEditClick}
                className="flex items-center gap-1 text-terminal-dim hover:text-terminal-text transition-colors"
                title="Edit this post"
              >
                <Edit3 size={10} />
                <span className="text-xs">EDIT</span>
              </button>
            )}
            {isOwnPost && onDeletePost && (
              <button
                onClick={handleDeleteClick}
                className="flex items-center gap-1 text-terminal-dim hover:text-terminal-alert transition-colors"
                title="Delete this post"
              >
                <Trash2 size={10} />
                <span className="text-xs">DELETE</span>
              </button>
            )}
            {post.url && (
              <span className="ml-auto border border-terminal-dim px-1 text-xs text-terminal-text flex items-center gap-1">
                LINK
                {post.imageUrl && <ImageIcon size={8} />}
              </span>
            )}
          </div>

          <div className="flex justify-between items-start gap-4">
            {isEncryptedWithoutKey ? (
              <div className="flex items-center gap-2 text-terminal-dim mb-2">
                <Lock size={18} />
                <h3 className="text-xl md:text-2xl font-bold">[Encrypted - Access Required]</h3>
              </div>
            ) : post.url ? (
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lg md:text-xl font-bold text-terminal-text leading-tight mb-1 cursor-pointer hover:bg-terminal-text hover:text-black decoration-2 underline-offset-4 flex items-start gap-2 transition-colors inline-block break-words"
              >
                {post.title}
                {post.isEncrypted && (
                  <Lock size={16} className="text-terminal-dim" title="Encrypted post" />
                )}
                <ExternalLink size={20} className="inline-block mt-1 opacity-70 min-w-[20px]" />
              </a>
            ) : (
              <h3
                onClick={handleInteraction}
                onKeyDown={handleInteractionKeyDown}
                tabIndex={0}
                role="button"
                className="text-lg md:text-xl font-bold text-terminal-text leading-tight mb-1 cursor-pointer hover:underline decoration-2 underline-offset-4 select-none break-words flex items-center gap-2"
              >
                {post.title}
                {post.isEncrypted && (
                  <Lock size={16} className="text-terminal-dim" title="Encrypted post" />
                )}
              </h3>
            )}
          </div>

          {!userState.identity && (
            <div className="mb-3 flex items-center gap-2 border border-terminal-dim/60 bg-terminal-dim/10 px-3 py-2 text-xs md:text-sm text-terminal-muted">
              <UserX size={14} className="text-terminal-text flex-shrink-0" />
              <span>Connect your identity for verified voting, comments, and zaps.</span>
            </div>
          )}

          {/* Media Preview */}
          {post.imageUrl && <ImagePreview src={post.imageUrl} className="mb-4 mt-2 max-w-lg" />}

          {isEncryptedWithoutKey ? (
            <div className="text-sm md:text-base text-terminal-dim font-mono leading-relaxed mb-3 p-4 border border-terminal-dim/50 bg-terminal-dim/10">
              <p className="mb-2">
                This post is encrypted. You need the board share link to view it.
              </p>
              <p className="text-xs text-terminal-dim/70">
                The encryption key is embedded in the share link URL fragment and never sent to
                servers.
              </p>
            </div>
          ) : (
            <div
              onClick={handleInteraction}
              onKeyDown={handleInteractionKeyDown}
              tabIndex={0}
              role="button"
              className={`text-sm text-terminal-muted font-mono leading-relaxed mb-2 cursor-pointer break-words ${!isExpanded ? 'line-clamp-3' : 'text-terminal-text'}`}
            >
              {(() => {
                // Detect markdown syntax - only load full renderer if needed
                const hasMarkdown = /[*_#`[>\-|~]/.test(post.content);
                return hasMarkdown ? (
                  <MarkdownRenderer content={post.content} />
                ) : (
                  <PlainTextRenderer content={post.content} />
                );
              })()}
            </div>
          )}

          {/* Read more affordance when collapsed */}
          {!isExpanded && post.content && (
            <button
              onClick={handleInteraction}
              className="text-xs text-terminal-dim hover:text-terminal-text underline mb-2"
            >
              Read more
            </button>
          )}

          {/* Comment preview when collapsed */}
          {!isExpanded && post.commentCount > 0 && post.comments && post.comments.length > 0 && (
            <div className="mb-2 py-2 border border-terminal-dim/30 border-l-2 border-l-terminal-dim/50 pl-2">
              <div className="flex items-center gap-1 text-[10px] text-terminal-dim uppercase tracking-wide mb-1">
                <MessageSquare size={10} />
                <span>First comment</span>
              </div>
              <p className="text-xs text-terminal-muted line-clamp-2">
                {post.comments[0].author}: {post.comments[0].content}
              </p>
              {post.commentCount > 1 && (
                <button
                  onClick={handleCommentClick}
                  className="text-[10px] text-terminal-dim hover:text-terminal-text underline mt-1"
                >
                  View all {post.commentCount} comments
                </button>
              )}
            </div>
          )}

          <div className="mt-2 flex flex-col md:flex-row md:items-center justify-between border-t border-terminal-dim pt-2 md:pt-1 gap-2">
            <div className="flex gap-1.5 md:gap-2 flex-wrap">
              {post.tags.map((tag) => (
                <button
                  key={tag}
                  onClick={(e) => handleTagClick(e, tag)}
                  className="text-xs border border-terminal-dim px-1.5 py-0.5 md:px-1 md:py-0 text-terminal-dim flex items-center hover:text-terminal-text hover:border-terminal-text cursor-pointer transition-colors"
                  title={`Search for #${tag}`}
                >
                  <Hash size={10} className="mr-0.5 md:mr-1" />
                  {tag}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 md:gap-2 flex-wrap justify-end">
              <button
                onClick={handleCommentClick}
                className="flex items-center gap-1 md:gap-2 text-xs md:text-sm px-2 py-2 md:px-2 md:py-0.5 transition-colors border border-terminal-dim/50 md:border-transparent shrink-0 text-terminal-dim hover:text-terminal-text hover:border-terminal-dim"
                title="View full thread"
              >
                <MessageSquare size={14} />
                <span className="hidden sm:inline">
                  {post.commentCount} {post.commentCount === 1 ? 'COMMENT' : 'COMMENTS'}
                </span>
                <span className="sm:hidden">{post.commentCount}</span>
                <Maximize2 size={10} className="opacity-50 hidden md:inline" />
              </button>

              <ReactionBar
                eventId={post.id}
                nostrEventId={post.nostrEventId}
                disabled={!userState.identity}
                compact={true}
              />

              {/* Zap Button (NIP-57 Layer 2 engagement) */}
              <ZapButton
                authorPubkey={post.authorPubkey || ''}
                authorName={post.author}
                eventId={post.id}
                initialZapTotal={post.zapTotal}
                initialZapCount={post.zapCount}
                compact={true}
              />

              {/* Bookmark Button */}
              <button
                onClick={handleBookmarkClick}
                className={`p-2.5 md:p-1 transition-colors min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center ${isBookmarked ? 'text-terminal-text' : 'text-terminal-dim hover:text-terminal-text'}`}
                title={isBookmarked ? 'Remove bookmark' : 'Save to bookmarks'}
                aria-label={isBookmarked ? 'Remove bookmark' : 'Save to bookmarks'}
                aria-pressed={isBookmarked}
              >
                <Bookmark
                  size={18}
                  className="md:w-4 md:h-4"
                  fill={isBookmarked ? 'currentColor' : 'none'}
                />
              </button>

              {/* Share Button */}
              <ShareButton postId={post.id} postTitle={post.title} />

              <div className="relative" ref={moreActionsRef}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMoreActions((prev) => !prev);
                  }}
                  className="p-2.5 md:p-1 transition-colors min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center text-terminal-dim hover:text-terminal-text"
                  title="More actions"
                  aria-label="More actions"
                  aria-expanded={showMoreActions}
                >
                  <MoreHorizontal size={18} className="md:w-4 md:h-4" />
                </button>

                {showMoreActions && (
                  <div
                    className="absolute right-0 top-full z-20 mt-2 min-w-[190px] border border-terminal-dim bg-terminal-bg p-2 shadow-hard"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!isOwnPost && (
                      <button
                        onClick={(e) => {
                          handleReportClick(e);
                          setShowMoreActions(false);
                        }}
                        className={`flex w-full items-center gap-2 px-2 py-2 text-left text-xs uppercase tracking-wide transition-colors ${hasReported ? 'text-terminal-alert' : 'text-terminal-dim hover:bg-terminal-dim/10 hover:text-terminal-alert'}`}
                        disabled={hasReported}
                      >
                        <Flag size={14} />
                        {hasReported ? 'Reported' : 'Report Post'}
                      </button>
                    )}

                    {!isOwnPost && post.authorPubkey && onToggleMute && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleMute(post.authorPubkey!);
                          setShowMoreActions(false);
                        }}
                        className="flex w-full items-center gap-2 px-2 py-2 text-left text-xs uppercase tracking-wide text-terminal-dim transition-colors hover:bg-terminal-dim/10 hover:text-terminal-alert"
                      >
                        <VolumeX size={14} />
                        {isMuted?.(post.authorPubkey) ? 'Unmute User' : 'Mute User'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Expanded Content (Inline or Full Page) */}
          {isExpanded && (
            <div
              className="mt-6 border-t-2 border-dashed border-terminal-dim/50 pt-4 animate-pulse-fast"
              style={{ animationDuration: '0.2s', animationIterationCount: 1 }}
            >
              {/* Inline Images */}
              {inlineImages.length > 0 && (
                <div className="mb-6 grid grid-cols-1 gap-4">
                  {inlineImages.map((url, i) => (
                    <ImagePreview key={i} src={url} className="max-w-md" />
                  ))}
                </div>
              )}

              {/* Link Previews */}
              {linkUrls.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs text-terminal-dim mb-3 font-bold uppercase tracking-widest flex items-center gap-2">
                    <ExternalLink size={12} />
                    LINKED RESOURCES
                  </h4>
                  <LinkPreviewList urls={linkUrls} maxPreviews={3} />
                </div>
              )}

              <h4
                id="comment-thread"
                className="text-xs text-terminal-dim mb-4 font-bold uppercase tracking-widest flex items-center gap-2"
              >
                <CornerDownRight size={14} />
                COMMENT THREAD
              </h4>

              {(() => {
                const displayTree = isFullPage ? commentTree : previewCommentTree;
                // Count total comments in preview tree (including nested)
                const countCommentsInTree = (tree: typeof commentTree): number => {
                  return tree.reduce((count, comment) => {
                    return count + 1 + (comment.replies ? countCommentsInTree(comment.replies) : 0);
                  }, 0);
                };
                const previewCount = isFullPage
                  ? post.commentCount
                  : countCommentsInTree(previewCommentTree);
                const hasMoreComments = !isFullPage && post.commentCount > previewCount;

                return displayTree.length > 0 ? (
                  <>
                    <div className="space-y-2 mb-6">
                      {displayTree.map((comment) => (
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
                          onToggleMute={onToggleMute}
                          isMuted={isMuted}
                        />
                      ))}
                    </div>
                    {!isFullPage && (
                      <div className="mb-4 text-center">
                        <button
                          onClick={() => onViewBit(post.id)}
                          className="text-sm text-terminal-dim hover:text-terminal-text border border-terminal-dim px-4 py-2 hover:border-terminal-text transition-colors uppercase font-bold tracking-wider"
                        >
                          {hasMoreComments
                            ? `VIEW ALL ${post.commentCount} ${post.commentCount === 1 ? 'COMMENT' : 'COMMENTS'}`
                            : `VIEW FULL THREAD (${post.commentCount} ${post.commentCount === 1 ? 'COMMENT' : 'COMMENTS'})`}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-terminal-dim italic text-sm mb-6 border border-terminal-dim p-2 inline-block">
                    &gt; Null signal. Awaiting input...
                  </p>
                );
              })()}

              <form
                onSubmit={handleCommentSubmit}
                className="flex gap-3 items-start bg-terminal-bg/40 p-3 border border-terminal-dim/30"
              >
                <div className="flex-1 flex flex-col gap-2">
                  <label className="text-xs uppercase text-terminal-muted font-bold tracking-wide">
                    Add Reply (use @ to mention):
                  </label>
                  <MentionInput
                    value={newComment}
                    onChange={setNewComment}
                    knownUsers={knownUsers}
                    placeholder="Type response..."
                    minHeight="60px"
                    disabled={isTransmitting}
                  />
                </div>
                <button
                  type="submit"
                  disabled={!newComment.trim() || isTransmitting}
                  className="mt-auto h-full self-stretch border border-terminal-dim px-4 text-xs hover:bg-terminal-text hover:text-black disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-terminal-dim transition-all uppercase font-bold tracking-wider min-w-[80px]"
                >
                  {isTransmitting ? <Loader2 size={14} className="animate-spin" /> : 'TRANSMIT'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Report Modal - rendered via portal to escape contentVisibility containment */}
      {showReportModal &&
        createPortal(
          <ReportModal
            targetType="post"
            targetId={post.id}
            targetPreview={post.title}
            onClose={() => setShowReportModal(false)}
          />,
          document.body,
        )}

      {/* Delete Confirmation Modal - rendered via portal to escape contentVisibility containment */}
      {showDeleteConfirm &&
        createPortal(
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
              <p className="text-terminal-dim text-xs mb-6 border-l-2 border-terminal-dim pl-3">
                "{post.title.length > 60 ? post.title.slice(0, 60) + '...' : post.title}"
              </p>

              {post.nostrEventId && (
                <p className="text-terminal-alert/80 text-xs mb-4 flex items-center gap-2">
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
          </div>,
          document.body,
        )}
    </div>
  );
};

// Memoize PostItem to prevent unnecessary re-renders
export const PostItem = React.memo(PostItemComponent, (prevProps, nextProps) => {
  if (prevProps.post !== nextProps.post) {
    return (
      prevProps.post.id === nextProps.post.id &&
      prevProps.post.title === nextProps.post.title &&
      prevProps.post.content === nextProps.post.content &&
      prevProps.post.score === nextProps.post.score &&
      prevProps.post.commentCount === nextProps.post.commentCount &&
      prevProps.post.comments.length === nextProps.post.comments.length &&
      prevProps.post.syncStatus === nextProps.post.syncStatus &&
      prevProps.post.syncError === nextProps.post.syncError
    );
  }

  return (
    prevProps.boardName === nextProps.boardName && prevProps.isFullPage === nextProps.isFullPage
  );
});
