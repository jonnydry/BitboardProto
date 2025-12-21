import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Post, UserState, Comment } from '../types';
import { EXPANSION_THRESHOLD, INLINE_PREVIEW_COMMENT_COUNT } from '../constants';
import { ArrowBigUp, ArrowBigDown, MessageSquare, Clock, Hash, ExternalLink, CornerDownRight, Maximize2, Image as ImageIcon, Shield, Users, UserX, Bookmark, Edit3, Flag, Lock, VolumeX, Trash2 } from 'lucide-react';
import { profileService } from '../services/profileService';
import { CommentThread, buildCommentTree } from './CommentThread';
import { MentionText } from './MentionText';
import { MentionInput } from './MentionInput';
import { ShareButton } from './ShareButton';
import { ReportModal } from './ReportModal';
import { ImagePreview } from './ImagePreview';
import { MarkdownRenderer } from './MarkdownRenderer';
import { LinkPreviewList } from './LinkPreview';
import { extractUrls } from '../services/linkPreviewService';

interface PostItemProps {
  post: Post;
  boardName?: string;
  userState: UserState;
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
  isBookmarked?: boolean;
  onToggleBookmark?: (postId: string) => void;
  hasReported?: boolean;
  isFullPage?: boolean;
  isNostrConnected?: boolean;
  onToggleMute?: (pubkey: string) => void;
  isMuted?: (pubkey: string) => boolean;
}

const PostItemComponent: React.FC<PostItemProps> = ({
  post,
  boardName,
  userState,
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
  isBookmarked = false,
  onToggleBookmark,
  hasReported = false,
  isFullPage = false,
  isNostrConnected = false,
  onToggleMute,
  isMuted,
}) => {
  const [isExpanded, setIsExpanded] = useState(isFullPage);
  const [newComment, setNewComment] = useState('');
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [authorProfile, setAuthorProfile] = useState<any>(null);

  const handleReportClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasReported) {
      setShowReportModal(true);
    }
  }, [hasReported]);

  // Check if this is the user's own post
  const isOwnPost = useMemo(() => {
    if (!userState.identity) return false;
    return post.authorPubkey === userState.identity.pubkey || post.author === userState.username;
  }, [post.authorPubkey, post.author, userState.identity, userState.username]);

  const handleBookmarkClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleBookmark?.(post.id);
  }, [onToggleBookmark, post.id]);

  const handleAuthorClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onViewProfile) {
      onViewProfile(post.author, post.authorPubkey);
    }
  }, [onViewProfile, post.author, post.authorPubkey]);

  const handleEditClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEditPost) {
      onEditPost(post.id);
    }
  }, [onEditPost, post.id]);

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

  const handleTagClick = useCallback((e: React.MouseEvent, tag: string) => {
    e.stopPropagation();
    if (onTagClick) {
      onTagClick(tag);
    }
  }, [onTagClick]);

  // If in full page mode, always expanded
  useEffect(() => {
    if (isFullPage) setIsExpanded(true);
  }, [isFullPage]);

  // Load author profile metadata
  useEffect(() => {
    if (post.authorPubkey) {
      profileService.getProfileMetadata(post.authorPubkey)
        .then(profile => {
          if (profile) {
            setAuthorProfile(profile);
          }
        })
        .catch(error => {
          console.error('[PostItem] Failed to load author profile:', error);
        });
    }
  }, [post.authorPubkey]);

  const voteDirection = useMemo(() => userState.votedPosts[post.id], [userState.votedPosts, post.id]);
  const isUpvoted = useMemo(() => voteDirection === 'up', [voteDirection]);
  const isDownvoted = useMemo(() => voteDirection === 'down', [voteDirection]);
  const hasInvested = useMemo(() => isUpvoted || isDownvoted, [isUpvoted, isDownvoted]);
  
  // Expansion Rule: Inline if <= EXPANSION_THRESHOLD comments, otherwise Full Page
  const requiresFullPage = useMemo(() => post.commentCount > EXPANSION_THRESHOLD, [post.commentCount]);

  const formatTime = useCallback((timestamp: number) => {
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return '< 1h';
    if (hours > 24) return `${Math.floor(hours / 24)}d`;
    return `${hours}h`;
  }, []);

  // Check if post is encrypted but not decrypted
  // A post is "encrypted without key" if:
  // 1. It's marked as encrypted AND
  // 2. The content is still the placeholder (meaning decryption hasn't happened) OR
  // 3. We have encrypted fields but content/title haven't been replaced with decrypted values
  const isEncryptedWithoutKey = useMemo(() => {
    if (!post.isEncrypted) return false;
    // If content is still the placeholder, we don't have the key
    if (post.content === '[Encrypted - Access Required]' || post.title === '[Encrypted]') {
      return true;
    }
    // If we have encrypted fields but content looks like ciphertext (base64-like), not decrypted
    if (post.encryptedContent && post.content === post.encryptedContent) {
      return true;
    }
    // Otherwise, assume it's been decrypted (content was replaced)
    return false;
  }, [post]);

  const handleCommentSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    
    setIsTransmitting(true);
    setTimeout(() => {
      onComment(post.id, newComment, undefined); // Top-level comment (no parent)
      setNewComment('');
      setIsTransmitting(false);
    }, 500);
  }, [newComment, onComment, post.id]);

  // Handle threaded reply to a specific comment
  const handleReplyToComment = useCallback((parentCommentId: string, content: string) => {
    onComment(post.id, content, parentCommentId);
  }, [onComment, post.id]);

  const handleEditComment = useCallback((commentId: string, content: string) => {
    onEditComment?.(post.id, commentId, content);
  }, [onEditComment, post.id]);

  const handleDeleteComment = useCallback((commentId: string) => {
    onDeleteComment?.(post.id, commentId);
  }, [onDeleteComment, post.id]);

  // Build comment tree for threaded display
  const commentTree = useMemo(() => {
    return buildCommentTree(post.comments);
  }, [post.comments]);

  // Build preview comment tree for inline preview (not full page)
  const previewCommentTree = useMemo(() => {
    if (isFullPage) {
      return commentTree;
    }

    // Get most recent comments (flattened, sorted by timestamp)
    const allComments = post.comments;
    const sortedByTime = [...allComments].sort((a, b) => b.timestamp - a.timestamp);
    
    // Find user's own reply if they have one
    const userReply = userState.identity?.pubkey 
      ? allComments.find(c => c.authorPubkey === userState.identity?.pubkey)
      : null;
    
    // Collect comment IDs to include in preview
    const previewIds = new Set<string>();
    
    // Add user's reply first if it exists
    if (userReply) {
      previewIds.add(userReply.id);
      // Also include parent chain if it's a nested reply
      let current: Comment | undefined = userReply;
      while (current?.parentId) {
        const parent = allComments.find(c => c.id === current!.parentId);
        if (parent) {
          previewIds.add(parent.id);
          current = parent;
        } else {
          break;
        }
      }
    }
    
    // Add most recent comments (up to limit, excluding user reply if already added)
    let added = previewIds.size;
    for (const comment of sortedByTime) {
      if (!previewIds.has(comment.id) && added < INLINE_PREVIEW_COMMENT_COUNT) {
        previewIds.add(comment.id);
        // Include parent chain for nested comments
        let current: Comment | undefined = comment;
        while (current?.parentId) {
          const parent = allComments.find(c => c.id === current!.parentId);
          if (parent) {
            previewIds.add(parent.id);
            current = parent;
          } else {
            break;
          }
        }
        added++;
      }
    }
    
    // Filter the comment tree to include only preview comments and their ancestors
    const filterTree = (comments: typeof commentTree): typeof commentTree => {
      return comments
        .map(comment => {
          const hasPreviewDescendant = (c: typeof commentTree[0]): boolean => {
            if (previewIds.has(c.id)) return true;
            if (c.replies) {
              return c.replies.some(reply => hasPreviewDescendant(reply));
            }
            return false;
          };
          
          if (hasPreviewDescendant(comment)) {
            return {
              ...comment,
              replies: comment.replies ? filterTree(comment.replies) : []
            };
          }
          return null;
        })
        .filter((c): c is typeof commentTree[0] => c !== null);
    };
    
    return filterTree(commentTree);
  }, [post.comments, userState.identity, isFullPage, commentTree]);

  const handleInteraction = useCallback(() => {
    if (isFullPage) return; // Already expanded in full view

    if (requiresFullPage) {
      onViewBit(post.id);
    } else {
      setIsExpanded(!isExpanded);
    }
  }, [isFullPage, requiresFullPage, onViewBit, post.id, isExpanded]);

  const handleVoteUp = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onVote(post.id, 'up');
  }, [onVote, post.id]);

  const handleVoteDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onVote(post.id, 'down');
  }, [onVote, post.id]);

  const handleCommentClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Always navigate to detail page when clicking comment count
    onViewBit(post.id);
  }, [onViewBit, post.id]);

  const handleInteractionKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleInteraction();
    }
  }, [handleInteraction]);

  // Extract inline images
  const inlineImages = useMemo(() => {
    if (!post.content || isEncryptedWithoutKey) return [];
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = post.content.match(urlRegex) || [];
    return matches.filter(url => 
      /\.(jpeg|jpg|gif|png|webp|bmp)$/i.test(url) && url !== post.imageUrl
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
      style={
        !isExpanded && !isFullPage
          ? ({ contentVisibility: 'auto', containIntrinsicSize: '420px' } as React.CSSProperties)
          : undefined
      }
      className={`w-full border-2 transition-all duration-200 mb-4 relative group font-mono
        ${isExpanded 
          ? 'border-terminal-text bg-terminal-highlight shadow-glow' 
          : 'border-terminal-dim bg-terminal-bg hover:border-terminal-text'
        }
      `}
    >
      {/* Decorator corners */}
      <div className="absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2 border-terminal-text opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2 border-terminal-text opacity-0 group-hover:opacity-100 transition-opacity"></div>

      <div className={`flex flex-row gap-3 p-2 ${isExpanded ? 'p-4' : ''}`}>
        {/* Voting Column - Cryptographically Verified */}
        <div className="flex flex-col items-center w-12 border-r border-terminal-dim pr-2 justify-start pt-1 gap-1 flex-shrink-0">
          {/* Guest User Indicator */}
          {!userState.identity && (
            <div className="mb-1 flex items-center gap-1 px-1.5 py-0.5 border border-terminal-dim/50 bg-terminal-dim/10 rounded" title="Guest mode: Connect identity to cast verified votes">
              <UserX size={10} className="text-terminal-dim" />
              <span className="text-[8px] text-terminal-dim uppercase">GUEST</span>
            </div>
          )}
          <button 
            onClick={handleVoteUp}
            className={`p-2 md:p-1 hover:bg-terminal-dim transition-colors ${isUpvoted ? 'text-terminal-text font-bold' : 'text-terminal-dim'} ${!userState.identity ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={(!userState.identity) || (userState.bits <= 0 && !hasInvested)}
            aria-label="Upvote"
            aria-pressed={isUpvoted}
            title={
              !userState.identity
                ? "CONNECT IDENTITY TO VOTE"
                : isUpvoted
                  ? "RETRACT BIT (+1 REFUND)"
                  : hasInvested
                    ? "SWITCH VOTE (0 COST)"
                    : "INVEST 1 BIT (-1)"
            }
          >
            <ArrowBigUp size={20} fill={isUpvoted ? "currentColor" : "none"} />
          </button>
          
          <span className={`text-base font-bold ${post.score > 0 ? 'text-terminal-text' : post.score < 0 ? 'text-terminal-alert' : 'text-terminal-dim/50'}`}>
            {post.score > 0 ? '+' : ''}{post.score}
          </span>

          <button 
            onClick={handleVoteDown}
            className={`p-2 md:p-1 hover:bg-terminal-dim transition-colors ${isDownvoted ? 'text-terminal-alert font-bold' : 'text-terminal-dim'} ${!userState.identity ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={(!userState.identity) || (userState.bits <= 0 && !hasInvested)}
            aria-label="Downvote"
            aria-pressed={isDownvoted}
            title={
              !userState.identity
                ? "CONNECT IDENTITY TO VOTE"
                : isDownvoted
                  ? "RETRACT BIT (+1 REFUND)"
                  : hasInvested
                    ? "SWITCH VOTE (0 COST)"
                    : "INVEST 1 BIT (-1)"
            }
          >
            <ArrowBigDown size={20} fill={isDownvoted ? "currentColor" : "none"} />
          </button>

          {/* Nostr Verification Badge + Voter Count */}
          {post.nostrEventId && (
            <div className="mt-1 flex flex-col items-center gap-0.5">
              {post.votesVerified ? (
                <div
                  className="flex items-center gap-0.5"
                  title="Score synced with verified Nostr votes"
                >
                  <Shield size={10} className="text-terminal-text" />
                  {typeof post.uniqueVoters === 'number' && (
                    <span className="text-[9px] text-terminal-dim flex items-center gap-0.5">
                      <Users size={8} /> {post.uniqueVoters}
                    </span>
                  )}
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
            <div className="mt-2 flex flex-col items-center animate-fade-in">
              <span className="text-[8px] text-terminal-dim border border-terminal-dim px-1 py-0.5 uppercase tracking-tighter">
                1 BIT
              </span>
              <span className="text-[8px] text-terminal-dim">LOCKED</span>
            </div>
          )}
        </div>

        {/* Content Column */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="text-[10px] text-terminal-dim mb-1 flex flex-wrap items-center gap-2 uppercase tracking-wider">
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
              {authorProfile?.picture && (
                <img
                  src={authorProfile.picture}
                  alt={`${post.author}'s avatar`}
                  className="w-4 h-4 rounded-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <span>{profileService.getDisplayName(post.author, authorProfile)}</span>
            </button>
            <span>::</span>
            <span className="flex items-center gap-1"><Clock size={12} /> {formatTime(post.timestamp)}</span>
            {isOwnPost && onEditPost && (
              <button
                onClick={handleEditClick}
                className="flex items-center gap-1 text-terminal-dim hover:text-terminal-text transition-colors"
                title="Edit this post"
              >
                <Edit3 size={10} />
                <span className="text-[10px]">EDIT</span>
              </button>
            )}
            {isOwnPost && onDeletePost && (
              <button
                onClick={handleDeleteClick}
                className="flex items-center gap-1 text-terminal-dim hover:text-terminal-alert transition-colors"
                title="Delete this post"
              >
                <Trash2 size={10} />
                <span className="text-[10px]">DELETE</span>
              </button>
            )}
            {post.url && (
               <span className="ml-auto border border-terminal-dim px-1 text-[10px] text-terminal-text flex items-center gap-1">
                 LINK_BIT
                 {post.imageUrl && <ImageIcon size={8} />}
               </span>
            )}
          </div>
          
          <div className="flex justify-between items-start gap-4">
            {isEncryptedWithoutKey ? (
              <div className="flex items-center gap-2 text-terminal-dim mb-2">
                <Lock size={18} />
                <h3 className="text-xl md:text-2xl font-bold">
                  [Encrypted - Access Required]
                </h3>
              </div>
            ) : post.url ? (
              <a 
                href={post.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-lg md:text-xl font-bold text-terminal-text leading-tight mb-1 cursor-pointer hover:bg-terminal-text hover:text-black decoration-2 underline-offset-4 flex items-start gap-2 transition-colors inline-block break-words"
              >
                {post.title}
                {post.isEncrypted && <Lock size={16} className="text-terminal-dim" title="Encrypted post" />}
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
                {post.isEncrypted && <Lock size={16} className="text-terminal-dim" title="Encrypted post" />}
              </h3>
            )}
          </div>
          
          {/* Media Preview */}
          {post.imageUrl && (
             <ImagePreview src={post.imageUrl} className="mb-4 mt-2 max-w-lg" />
          )}

          {isEncryptedWithoutKey ? (
            <div className="text-sm md:text-base text-terminal-dim font-mono leading-relaxed mb-3 p-4 border border-terminal-dim/50 bg-terminal-dim/10">
              <p className="mb-2">This post is encrypted. You need the board share link to view it.</p>
              <p className="text-xs text-terminal-dim/70">
                The encryption key is embedded in the share link URL fragment and never sent to servers.
              </p>
            </div>
          ) : (
            <div 
              onClick={handleInteraction}
              onKeyDown={handleInteractionKeyDown}
              tabIndex={0}
              role="button"
              className={`text-sm text-terminal-text/80 font-mono leading-relaxed mb-2 cursor-pointer break-words ${!isExpanded ? 'line-clamp-2' : 'opacity-100'}`}
            >
              <MarkdownRenderer content={post.content} />
            </div>
          )}

          <div className="mt-2 flex items-center justify-between border-t border-terminal-dim pt-1">
            <div className="flex gap-2 flex-wrap">
              {post.tags.map(tag => (
                <button
                  key={tag}
                  onClick={(e) => handleTagClick(e, tag)}
                  className="text-xs border border-terminal-dim px-1 text-terminal-dim flex items-center hover:text-terminal-text hover:border-terminal-text cursor-pointer transition-colors"
                  title={`Search for #${tag}`}
                >
                  <Hash size={10} className="mr-1"/>{tag}
                </button>
              ))}
            </div>
            
            <div className="flex items-center gap-2">
              {/* Bookmark Button */}
              <button
                onClick={handleBookmarkClick}
                className={`p-2 md:p-1 transition-colors ${isBookmarked ? 'text-terminal-text' : 'text-terminal-dim hover:text-terminal-text'}`}
                title={isBookmarked ? 'Remove bookmark' : 'Save to bookmarks'}
                aria-label={isBookmarked ? 'Remove bookmark' : 'Save to bookmarks'}
                aria-pressed={isBookmarked}
              >
                <Bookmark size={16} fill={isBookmarked ? 'currentColor' : 'none'} />
              </button>

              {/* Share Button */}
              <ShareButton postId={post.id} postTitle={post.title} />

              {/* Report Button */}
              {!isOwnPost && (
                <button
                  onClick={handleReportClick}
                  className={`p-2 md:p-1 transition-colors ${hasReported ? 'text-terminal-alert' : 'text-terminal-dim hover:text-terminal-alert'}`}
                  title={hasReported ? 'Already reported' : 'Report this post'}
                  disabled={hasReported}
                  aria-label={hasReported ? 'Already reported' : 'Report this post'}
                >
                  <Flag size={14} fill={hasReported ? 'currentColor' : 'none'} />
                </button>
              )}

              {/* Mute Button */}
              {!isOwnPost && post.authorPubkey && onToggleMute && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleMute(post.authorPubkey!);
                  }}
                  className={`p-2 md:p-1 transition-colors ${isMuted?.(post.authorPubkey) ? 'text-terminal-alert' : 'text-terminal-dim hover:text-terminal-alert'}`}
                  title={isMuted?.(post.authorPubkey) ? 'Unmute user' : 'Mute user'}
                >
                  <VolumeX size={14} />
                </button>
              )}

              <button 
                onClick={handleCommentClick}
                className="flex items-center gap-2 text-sm px-3 py-2 md:px-2 md:py-0.5 transition-colors border border-transparent shrink-0 text-terminal-dim hover:text-terminal-text hover:border-terminal-dim"
                title="View full thread"
              >
                <MessageSquare size={14} />
                {post.commentCount} {post.commentCount === 1 ? 'COMMENT' : 'COMMENTS'}
                <Maximize2 size={10} className="opacity-50" />
              </button>
            </div>
          </div>

          {/* Expanded Content (Inline or Full Page) */}
          {isExpanded && (
            <div className="mt-6 border-t-2 border-dashed border-terminal-dim/50 pt-4 animate-pulse-fast" style={{animationDuration: '0.2s', animationIterationCount: 1}}>
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
                  <h4 className="text-[10px] text-terminal-dim mb-3 font-bold uppercase tracking-widest flex items-center gap-2">
                    <ExternalLink size={12} />
                    LINKED_RESOURCES
                  </h4>
                  <LinkPreviewList urls={linkUrls} maxPreviews={3} />
                </div>
              )}

              <h4 className="text-xs text-terminal-dim mb-4 font-bold uppercase tracking-widest flex items-center gap-2">
                <CornerDownRight size={14} />
                DATA_STREAM
              </h4>

              {(() => {
                const displayTree = isFullPage ? commentTree : previewCommentTree;
                // Count total comments in preview tree (including nested)
                const countCommentsInTree = (tree: typeof commentTree): number => {
                  return tree.reduce((count, comment) => {
                    return count + 1 + (comment.replies ? countCommentsInTree(comment.replies) : 0);
                  }, 0);
                };
                const previewCount = isFullPage ? post.commentCount : countCommentsInTree(previewCommentTree);
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
                            : `VIEW FULL THREAD (${post.commentCount} ${post.commentCount === 1 ? 'COMMENT' : 'COMMENTS'})`
                          }
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

              <form onSubmit={handleCommentSubmit} className="flex gap-3 items-start bg-terminal-bg/40 p-3 border border-terminal-dim/30">
                <div className="flex-1 flex flex-col gap-2">
                  <label className="text-[10px] uppercase text-terminal-dim font-bold">Append Data (use @ to mention):</label>
                  <MentionInput
                    value={newComment}
                    onChange={setNewComment}
                    knownUsers={knownUsers}
                    placeholder="Type response..."
                    minHeight="60px"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={!newComment.trim() || isTransmitting}
                  className="mt-auto h-full self-stretch border border-terminal-dim px-4 text-xs hover:bg-terminal-text hover:text-black disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-terminal-dim transition-all uppercase font-bold tracking-wider min-w-[80px]"
                >
                  {isTransmitting ? '...' : '[ TX ]'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Report Modal - rendered via portal to escape contentVisibility containment */}
      {showReportModal && createPortal(
        <ReportModal
          targetType="post"
          targetId={post.id}
          targetPreview={post.title}
          onClose={() => setShowReportModal(false)}
        />,
        document.body
      )}

      {/* Delete Confirmation Modal - rendered via portal to escape contentVisibility containment */}
      {showDeleteConfirm && createPortal(
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
                <Shield size={12} />
                A deletion request will be broadcast to Nostr relays. Some relays may still retain the post.
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
        document.body
      )}
    </div>
  );
};

// Memoize PostItem to prevent unnecessary re-renders
export const PostItem = React.memo(PostItemComponent, (prevProps, nextProps) => {
  // Custom comparison function for better performance
  return (
    prevProps.post.id === nextProps.post.id &&
    prevProps.post.score === nextProps.post.score &&
    prevProps.post.commentCount === nextProps.post.commentCount &&
    prevProps.post.comments.length === nextProps.post.comments.length &&
    prevProps.post.title === nextProps.post.title &&
    prevProps.post.content === nextProps.post.content &&
    prevProps.userState.bits === nextProps.userState.bits &&
    prevProps.userState.votedPosts[prevProps.post.id] === nextProps.userState.votedPosts[nextProps.post.id] &&
    prevProps.userState.identity?.pubkey === nextProps.userState.identity?.pubkey &&
    prevProps.userState.username === nextProps.userState.username &&
    prevProps.boardName === nextProps.boardName &&
    prevProps.isBookmarked === nextProps.isBookmarked &&
    prevProps.hasReported === nextProps.hasReported &&
    prevProps.isNostrConnected === nextProps.isNostrConnected &&
    prevProps.isFullPage === nextProps.isFullPage
  );
});
