import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Post } from '../types';
import { useUserState, useIsMuted } from '../stores/userStore';
import {
  MessageSquare,
  Shield,
  Users,
  Bookmark,
  Edit3,
  Flag,
  Lock,
  VolumeX,
  Trash2,
  Loader2,
  RefreshCw,
  AlertTriangle,
  MoreHorizontal,
} from 'lucide-react';
import { profileService } from '../services/profileService';
import { toastService } from '../services/toastService';
import { ShareButton } from './ShareButton';
import { ReportModal } from './ReportModal';
import { ImagePreview } from './ImagePreview';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ReactionBar } from './ReactionPicker';
import { ZapButton } from './ZapButton';
import { BadgeDisplay } from './BadgeDisplay';
import { TrustIndicator } from './TrustIndicator';
import { usePostAuthorProfile } from './usePostAuthorProfile';
import { useUIStore } from '../stores/uiStore';
import { formatPostTime, isPostEncryptedWithoutKey } from './postItemUtils';

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
  onToggleMute?: (pubkey: string) => void;
  isMuted?: (pubkey: string) => boolean;
  onRetryPost?: (postId: string) => void;
}

const PostItemComponent: React.FC<PostItemProps> = ({
  post,
  boardName,
  knownUsers: _knownUsers = new Set(),
  onVote,
  onComment: _onComment,
  onEditComment: _onEditComment,
  onDeleteComment: _onDeleteComment,
  onCommentVote: _onCommentVote,
  onViewBit,
  onViewProfile,
  onEditPost,
  onDeletePost,
  onTagClick,
  onToggleBookmark,
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

  const formatTime = useCallback((timestamp: number) => formatPostTime(timestamp), []);

  const isEncryptedWithoutKey = useMemo(() => isPostEncryptedWithoutKey(post), [post]);

  const handleInteraction = useCallback(() => {
    onViewBit(post.id);
  }, [onViewBit, post.id]);

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
      onViewBit(post.id);
    },
    [onViewBit, post.id],
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

  return (
    <div
      ref={postRef}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '420px' } as React.CSSProperties}
      className={`w-full border transition-all duration-200 mb-4 relative group font-mono
        ${
          post.syncStatus === 'pending'
            ? 'border-terminal-dim/30 bg-terminal-bg/80 animate-pulse'
            : post.syncStatus === 'failed'
              ? 'border-terminal-alert/50 bg-terminal-alert/5'
              : 'border-terminal-dim/30 bg-terminal-bg hover:border-terminal-dim/60'
        }
      `}
    >
      {/* Sync Status Indicator */}
      {post.syncStatus && post.syncStatus !== 'synced' && (
        <div
          className={`absolute top-0 left-0 right-0 flex items-center justify-between px-2 py-1 text-xs uppercase tracking-wider font-mono z-10
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
      <div className="absolute -top-px -left-px w-2 h-2 border-t border-l border-terminal-dim/60 opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div className="absolute -bottom-px -right-px w-2 h-2 border-b border-r border-terminal-dim/60 opacity-0 group-hover:opacity-100 transition-opacity"></div>

      <div
        className={`flex flex-row gap-2 md:gap-3 p-2 ${post.syncStatus && post.syncStatus !== 'synced' ? 'pt-8' : ''}`}
      >
        {/* Voting Column */}
        <div className="flex flex-col items-center w-11 border-r border-terminal-dim/20 pr-2 justify-start pt-1 gap-1 flex-shrink-0">
          <button
            onClick={handleVoteUp}
            className={`p-2 md:p-1 hover:bg-terminal-dim/10 transition-colors min-w-[40px] min-h-[40px] md:min-w-0 md:min-h-0 flex items-center justify-center ${isUpvoted ? 'text-terminal-text' : 'text-terminal-dim'} ${!userState.identity ? 'opacity-50 cursor-not-allowed' : ''}`}
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
            <svg width="16" height="10" viewBox="0 0 12 8" className="md:w-4 md:h-3">
              <path
                d="M6 0L12 8H0L6 0Z"
                fill={isUpvoted ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </button>

          <span
            className={`text-sm font-semibold ${post.score > 0 ? 'text-terminal-text' : post.score < 0 ? 'text-terminal-alert' : 'text-terminal-dim/70'}`}
          >
            {post.score > 0 ? '+' : ''}
            {post.score}
          </span>

          <button
            onClick={handleVoteDown}
            className={`p-2 md:p-1 hover:bg-terminal-dim/10 transition-colors min-w-[40px] min-h-[40px] md:min-w-0 md:min-h-0 flex items-center justify-center ${isDownvoted ? 'text-terminal-alert' : 'text-terminal-dim'} ${!userState.identity ? 'opacity-50 cursor-not-allowed' : ''}`}
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
            <svg width="16" height="10" viewBox="0 0 12 8" className="md:w-4 md:h-3">
              <path
                d="M6 8L0 0H12L6 8Z"
                fill={isDownvoted ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
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
                      <span className="text-xs text-terminal-dim flex items-center gap-0.5">
                        <Users size={8} /> {post.uniqueVoters}
                      </span>
                    )}
                  </div>
                  <span className="text-xs uppercase tracking-wide text-terminal-dim">
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
        </div>

        {/* Content Column */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="text-sm text-terminal-dim mb-1 flex flex-wrap items-center gap-2">
            <button
              onClick={handleAuthorClick}
              className="flex items-center gap-1.5 font-bold text-terminal-dim hover:text-terminal-text hover:underline transition-colors cursor-pointer"
              title={`View ${profileService.getDisplayName(post.author, authorProfile)}'s profile`}
            >
              {/* Avatar with placeholder and fade-in */}
              <div className="relative w-7 h-7 flex-shrink-0">
                {profileLoadState === 'loading' && (
                  <div className="absolute inset-0 rounded-full bg-terminal-dim/30 animate-pulse" />
                )}
                {profileLoadState === 'loaded' && authorProfile?.picture ? (
                  <img
                    src={authorProfile.picture}
                    alt={`${post.author}'s avatar`}
                    className="w-7 h-7 rounded-full object-cover transition-opacity duration-300"
                    style={{ opacity: 1 }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  profileLoadState !== 'loading' && (
                    <div
                      className="w-7 h-7 rounded-full bg-terminal-dim/20 border border-terminal-dim/40 flex items-center justify-center text-sm text-terminal-dim font-bold"
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
            {boardName && (
              <>
                <span className="text-terminal-dim/50">·</span>
                <span className="text-terminal-dim/70 text-sm">//{boardName}</span>
              </>
            )}
            <span className="text-terminal-dim/50">·</span>
            <span className="ml-auto text-terminal-dim/70 text-sm">
              {formatTime(post.timestamp)}
            </span>
            {post.isEncrypted && (
              <span
                className="flex items-center gap-1 text-terminal-text border border-terminal-text/50 px-1 py-0.5 text-sm uppercase tracking-wider"
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
                <span className="text-sm">EDIT</span>
              </button>
            )}
            {isOwnPost && onDeletePost && (
              <button
                onClick={handleDeleteClick}
                className="flex items-center gap-1 text-terminal-dim hover:text-terminal-alert transition-colors"
                title="Delete this post"
              >
                <Trash2 size={10} />
                <span className="text-sm">DELETE</span>
              </button>
            )}
          </div>

          <div className="flex items-start gap-2">
            {isEncryptedWithoutKey ? (
              <div className="flex items-center gap-2 text-terminal-dim mb-2">
                <Lock size={18} />
                <h3 className="text-2xl font-bold">[Encrypted - Access Required]</h3>
              </div>
            ) : post.url ? (
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xl font-semibold font-display text-terminal-text leading-snug mb-1 cursor-pointer hover:underline decoration-2 underline-offset-4 transition-colors break-words"
              >
                {post.title}
                {post.isEncrypted && (
                  <Lock
                    size={16}
                    className="text-terminal-dim inline ml-1"
                    title="Encrypted post"
                  />
                )}
              </a>
            ) : (
              <h3
                onClick={handleInteraction}
                onKeyDown={handleInteractionKeyDown}
                tabIndex={0}
                role="button"
                className="text-xl font-semibold font-display text-terminal-text leading-snug mb-1 cursor-pointer hover:underline decoration-2 underline-offset-4 select-none break-words"
              >
                {post.title}
                {post.isEncrypted && (
                  <Lock
                    size={16}
                    className="text-terminal-dim inline ml-1"
                    title="Encrypted post"
                  />
                )}
              </h3>
            )}
            {post.url && (
              <span className="shrink-0 mt-1 border border-terminal-dim/40 px-1.5 py-0.5 text-sm text-terminal-dim/70">
                LINK
              </span>
            )}
          </div>

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
              className="text-base text-terminal-dim/70 font-mono leading-relaxed mb-2 cursor-pointer break-words line-clamp-3"
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

          {post.tags.length > 0 && (
            <div className="mt-2 mb-2 flex gap-1.5 flex-wrap">
              {post.tags.map((tag) => (
                <button
                  key={tag}
                  onClick={(e) => handleTagClick(e, tag)}
                  className="text-sm border border-terminal-dim/20 bg-terminal-bg px-1.75 py-0.5 text-terminal-dim/80 hover:text-terminal-dim hover:border-terminal-dim/40 cursor-pointer transition-colors"
                  title={`Search for #${tag}`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-4 border-t border-terminal-dim/15 pt-2.5 mt-2">
            <button
              onClick={handleCommentClick}
              className="flex items-center gap-1.25 text-sm text-terminal-dim/70 hover:text-terminal-dim transition-colors shrink-0"
              title="View full thread"
            >
              <MessageSquare size={13} />
              <span>{post.commentCount}</span>
            </button>

            <ZapButton
              authorPubkey={post.authorPubkey || ''}
              authorName={post.author}
              eventId={post.id}
              initialZapTotal={post.zapTotal}
              initialZapCount={post.zapCount}
              compact={true}
            />

            <ReactionBar
              eventId={post.id}
              nostrEventId={post.nostrEventId}
              disabled={!userState.identity}
              compact={true}
            />

            <button
              onClick={handleBookmarkClick}
              className={`ml-auto p-1 transition-colors flex items-center justify-center ${isBookmarked ? 'text-terminal-text' : 'text-terminal-dim/60 hover:text-terminal-dim'}`}
              title={isBookmarked ? 'Remove bookmark' : 'Save to bookmarks'}
              aria-label={isBookmarked ? 'Remove bookmark' : 'Save to bookmarks'}
              aria-pressed={isBookmarked}
            >
              <Bookmark size={14} fill={isBookmarked ? 'currentColor' : 'none'} />
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

  return prevProps.boardName === nextProps.boardName;
});
