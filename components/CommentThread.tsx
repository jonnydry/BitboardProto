import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Comment, UserState } from '../types';
import { ChevronDown, ChevronRight, CornerDownRight, Clock, Flag, Edit3, Trash2, Lock, ArrowBigUp, ArrowBigDown, UserX, VolumeX } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
// MentionText is used via MarkdownRenderer
import { MentionInput } from './MentionInput';
import { ReportModal } from './ReportModal';
import { reportService } from '../services/reportService';
import { profileService } from '../services/profileService';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ReactionBar } from './ReactionPicker';

interface CommentThreadProps {
  comment: Comment;
  userState: UserState;
  onReply: (parentId: string, content: string) => void;
  onEdit?: (commentId: string, content: string) => void;
  onDelete?: (commentId: string) => void;
  onViewProfile?: (author: string, authorPubkey?: string) => void;
  onVote?: (postId: string, commentId: string, direction: 'up' | 'down') => void;
  postId?: string; // Post ID for voting
  formatTime: (timestamp: number) => string;
  knownUsers?: Set<string>;
  depth?: number;
  maxVisualDepth?: number;
  onToggleMute?: (pubkey: string) => void;
  isMuted?: (pubkey: string) => boolean;
}

const MAX_VISUAL_DEPTH = 5; // Max indentation level for visual clarity
const REPLIES_PAGE_SIZE = 3;
const COLLAPSE_STORAGE_PREFIX = 'bitboard_comment_collapsed_v1:';
const AUTO_COLLAPSE_DEPTH = 3; // Auto-collapse threads deeper than this
const TOP_LEVEL_PAGE_SIZE = 10; // Number of top-level comments to show initially
const VIRTUALIZE_THRESHOLD = 50; // Virtualize when there are 50+ top-level comments

const CommentThreadComponent: React.FC<CommentThreadProps> = ({
  comment,
  userState,
  onReply,
  onEdit,
  onDelete,
  onViewProfile,
  onVote,
  postId,
  formatTime,
  knownUsers = new Set(),
  depth = 0,
  maxVisualDepth = MAX_VISUAL_DEPTH,
  onToggleMute,
  isMuted,
}) => {
  // Auto-collapse deep threads by default
  const [isCollapsed, setIsCollapsed] = useState(() => {
    // Check localStorage first
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(`${COLLAPSE_STORAGE_PREFIX}${comment.id}`);
        if (raw) return raw === '1';
      }
    } catch { /* ignore */ }
    // Auto-collapse threads deeper than AUTO_COLLAPSE_DEPTH
    return depth >= AUTO_COLLAPSE_DEPTH;
  });
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [hasReported, setHasReported] = useState(() => reportService.hasReported('comment', comment.id));
  const [visibleReplies, setVisibleReplies] = useState(REPLIES_PAGE_SIZE);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [authorProfile, setAuthorProfile] = useState<any>(null);

  // Load author profile metadata from cache (profiles are pre-fetched at parent level)
  useEffect(() => {
    if (comment.authorPubkey) {
      // First check sync cache (profiles should be pre-fetched by useCommentsLoader)
      const cachedProfile = profileService.getCachedProfileSync(comment.authorPubkey);
      if (cachedProfile) {
        setAuthorProfile(cachedProfile);
      } else {
        // Fallback: async fetch if not in cache (e.g., for real-time new comments)
        profileService.getProfileMetadata(comment.authorPubkey)
          .then(profile => {
            if (profile) {
              setAuthorProfile(profile);
            }
          })
          .catch(error => {
            console.error('[CommentThread] Failed to load author profile:', error);
          });
      }
    }
  }, [comment.authorPubkey]);

  // Check if this is the user's own comment
  const isOwnComment = useMemo(() => {
    if (!userState.identity) return comment.author === userState.username;
    return comment.authorPubkey === userState.identity.pubkey || comment.author === userState.username;
  }, [comment.authorPubkey, comment.author, userState.identity, userState.username]);

  const isDeleted = !!comment.isDeleted || comment.author === '[deleted]';

  // Voting state
  const voteDirection = useMemo(() => {
    if (!userState.identity || !postId) return null;
    return userState.votedComments?.[comment.id] || null;
  }, [userState.votedComments, comment.id, userState.identity, postId]);
  
  const isUpvoted = useMemo(() => voteDirection === 'up', [voteDirection]);
  const isDownvoted = useMemo(() => voteDirection === 'down', [voteDirection]);
  const hasInvested = useMemo(() => isUpvoted || isDownvoted, [isUpvoted, isDownvoted]);
  
  const commentScore = comment.score ?? 0;

  const handleVoteUp = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onVote && postId) {
      onVote(postId, comment.id, 'up');
    }
  }, [onVote, postId, comment.id]);

  const handleVoteDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onVote && postId) {
      onVote(postId, comment.id, 'down');
    }
  }, [onVote, postId, comment.id]);

  // Subscribe to report changes
  useEffect(() => {
    const unsubscribe = reportService.subscribe(() => {
      setHasReported(reportService.hasReported('comment', comment.id));
    });
    return unsubscribe;
  }, [comment.id]);

  const handleReportClick = useCallback(() => {
    if (!hasReported) {
      setShowReportModal(true);
    }
  }, [hasReported]);

  const hasReplies = comment.replies && comment.replies.length > 0;
  const replyCount = useMemo(() => {
    const countReplies = (c: Comment): number => {
      if (!c.replies) return 0;
      return c.replies.reduce((sum, r) => sum + 1 + countReplies(r), 0);
    };
    return countReplies(comment);
  }, [comment]);

  // Reset replies pagination when comment changes
  useEffect(() => {
    setVisibleReplies(REPLIES_PAGE_SIZE);
  }, [comment.id]);

  // Visual indentation caps at maxVisualDepth
  const visualDepth = Math.min(depth, maxVisualDepth);
  const indentPx = visualDepth * 16; // 16px per level

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(`${COLLAPSE_STORAGE_PREFIX}${comment.id}`, next ? '1' : '0');
        }
      } catch {
        // ignore
      }
      return next;
    });
  }, [comment.id]);

  const handleReplyClick = useCallback(() => {
    setIsReplying(prev => !prev);
    setReplyContent('');
  }, []);

  const handleEditClick = useCallback(() => {
    if (isDeleted) return;
    setIsEditing((prev) => {
      const next = !prev;
      if (next) {
        setEditContent(comment.content);
        setShowDeleteConfirm(false);
      }
      return next;
    });
  }, [comment.content, isDeleted]);

  const handleSaveEdit = () => {
    if (!editContent.trim()) return;
    onEdit?.(comment.id, editContent.trim());
    setIsEditing(false);
  };

  const handleDelete = () => {
    onDelete?.(comment.id);
    setShowDeleteConfirm(false);
    setIsEditing(false);
  };

  const handleSubmitReply = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim()) return;

    setIsSubmitting(true);
    // Simulate slight delay for UX
    setTimeout(() => {
      onReply(comment.id, replyContent.trim());
      setReplyContent('');
      setIsReplying(false);
      setIsSubmitting(false);
    }, 300);
  }, [replyContent, comment.id, onReply]);

  const handleAuthorClick = useCallback(() => {
    if (onViewProfile) {
      onViewProfile(comment.author, comment.authorPubkey);
    }
  }, [onViewProfile, comment.author, comment.authorPubkey]);

  return (
    <div 
      className="relative"
      style={{ marginLeft: depth > 0 ? `${indentPx}px` : 0 }}
    >
      {/* Thread line connector */}
      {depth > 0 && (
        <div 
          className="absolute left-0 top-0 bottom-0 w-px bg-terminal-dim/30 -ml-4"
          style={{ height: '100%' }}
        />
      )}

      {/* Comment container */}
      <div className={`
        border-l-2 pl-3 py-2 mb-2 transition-colors
        ${isCollapsed ? 'border-terminal-dim/30' : 'border-terminal-dim hover:border-terminal-text'}
      `}>
        <div className="flex gap-2">
          {/* Voting Column (compact) */}
          {onVote && postId && (
            <div className="flex flex-col items-center min-w-[2rem] gap-0.5 pt-0.5">
              {!userState.identity && (
                <div className="mb-0.5 flex items-center gap-0.5 px-1 py-0.5 border border-terminal-dim/50 bg-terminal-dim/10 rounded" title="Guest mode: Connect identity to cast verified votes">
                  <UserX size={8} className="text-terminal-dim" />
                  <span className="text-[7px] text-terminal-dim uppercase">G</span>
                </div>
              )}
              <button 
                onClick={handleVoteUp}
                className={`p-1 hover:bg-terminal-dim transition-colors ${isUpvoted ? 'text-terminal-text font-bold' : 'text-terminal-dim'} ${!userState.identity ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={(!userState.identity) || (userState.bits <= 0 && !hasInvested)}
                aria-label="Upvote comment"
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
                <ArrowBigUp size={14} fill={isUpvoted ? "currentColor" : "none"} />
              </button>
              
              <span className={`text-xs font-bold ${commentScore > 0 ? 'text-terminal-text' : commentScore < 0 ? 'text-terminal-alert' : 'text-terminal-dim/50'}`}>
                {commentScore > 0 ? '+' : ''}{commentScore}
              </span>

              <button 
                onClick={handleVoteDown}
                className={`p-1 hover:bg-terminal-dim transition-colors ${isDownvoted ? 'text-terminal-alert font-bold' : 'text-terminal-dim'} ${!userState.identity ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={(!userState.identity) || (userState.bits <= 0 && !hasInvested)}
                aria-label="Downvote comment"
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
                <ArrowBigDown size={14} fill={isDownvoted ? "currentColor" : "none"} />
              </button>
            </div>
          )}

          <div className="flex-1">
            {/* Comment header */}
            <div className="flex items-center gap-2 text-xs mb-1">
          {/* Collapse toggle */}
          {hasReplies && (
            <button
              onClick={handleToggleCollapse}
              className="text-terminal-dim hover:text-terminal-text transition-colors p-0.5"
              title={isCollapsed ? `Expand ${replyCount} replies` : 'Collapse thread'}
              aria-label={isCollapsed ? `Expand ${replyCount} replies` : 'Collapse thread'}
            >
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </button>
          )}

          {/* Author */}
          <button
            onClick={handleAuthorClick}
            className="flex items-center gap-1 text-terminal-text font-bold hover:underline cursor-pointer"
          >
            {authorProfile?.picture && (
              <img
                src={authorProfile.picture}
                alt={`${comment.author}'s avatar`}
                className="w-4 h-4 rounded-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            <span>{profileService.getDisplayName(comment.author, authorProfile)}</span>
          </button>
          
          <span className="text-terminal-dim">::</span>
          
          {/* Timestamp */}
          <span className="text-terminal-dim flex items-center gap-1">
            <Clock size={10} />
            {formatTime(comment.timestamp)}
          </span>

          {/* Collapsed indicator */}
          {isCollapsed && hasReplies && (
            <button
              onClick={handleToggleCollapse}
              className="text-terminal-dim hover:text-terminal-text text-[10px] border border-terminal-dim hover:border-terminal-text px-1 transition-colors flex items-center gap-1"
            >
              {depth >= AUTO_COLLAPSE_DEPTH ? (
                <>Continue thread → ({replyCount})</>
              ) : (
                <>+{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</>
              )}
            </button>
          )}
        </div>

        {/* Comment content (hidden when collapsed) */}
        {!isCollapsed && (
          <>
            {!isEditing ? (
              <p className="text-terminal-text/80 text-sm leading-relaxed break-words mb-2">
                {isDeleted ? (
                  <span className="italic text-terminal-dim">[deleted]</span>
                ) : comment.isEncrypted && comment.encryptedContent ? (
                  <div className="flex items-center gap-2 text-terminal-dim p-2 border border-terminal-dim/50 bg-terminal-dim/10">
                    <Lock size={14} />
                    <span className="text-xs">[Encrypted - Access Required]</span>
                  </div>
                ) : (
                  <MarkdownRenderer content={comment.content} />
                )}
                {!isDeleted && comment.editedAt && (
                  <span className="ml-2 text-[10px] text-terminal-dim uppercase">(edited)</span>
                )}
              </p>
            ) : (
              <div className="mb-2 border border-terminal-dim/30 bg-terminal-bg/40 p-2">
                <MentionInput
                  value={editContent}
                  onChange={setEditContent}
                  knownUsers={knownUsers}
                  placeholder="Edit comment..."
                  autoFocus
                  minHeight="60px"
                />
                <div className="mt-2 flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1 border border-terminal-dim text-terminal-dim hover:text-terminal-text hover:border-terminal-text transition-colors text-xs uppercase"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={!editContent.trim()}
                    className="px-3 py-1 border border-terminal-text text-terminal-text hover:bg-terminal-text hover:text-black transition-colors text-xs uppercase disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3">
              {/* Reactions (FREE - social signals) */}
              <ReactionBar
                eventId={comment.id}
                nostrEventId={comment.nostrEventId}
                disabled={!userState.identity}
                compact={true}
              />

              <button
                onClick={handleReplyClick}
                className={`text-xs flex items-center gap-1 transition-colors
                  ${isReplying 
                    ? 'text-terminal-text' 
                    : 'text-terminal-dim hover:text-terminal-text'
                  }`}
                disabled={isDeleted}
              >
                <CornerDownRight size={10} />
                {isReplying ? 'CANCEL' : 'REPLY'}
              </button>

              {/* Edit / Delete for own comment */}
              {isOwnComment && !isDeleted && (onEdit || onDelete) && (
                <>
                  {onEdit && (
                    <button
                      type="button"
                      onClick={handleEditClick}
                      className="text-xs flex items-center gap-1 text-terminal-dim hover:text-terminal-text transition-colors"
                      title="Edit comment"
                    >
                      <Edit3 size={10} />
                      EDIT
                    </button>
                  )}
                  {onDelete && (
                    <>
                      {!showDeleteConfirm ? (
                        <button
                          type="button"
                          onClick={() => setShowDeleteConfirm(true)}
                          className="text-xs flex items-center gap-1 text-terminal-dim hover:text-terminal-alert transition-colors"
                          title="Delete comment"
                        >
                          <Trash2 size={10} />
                          DELETE
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-terminal-alert">Delete?</span>
                          <button
                            type="button"
                            onClick={handleDelete}
                            className="text-xs border border-terminal-alert px-2 py-0.5 text-terminal-alert hover:bg-terminal-alert hover:text-black transition-colors"
                          >
                            YES
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowDeleteConfirm(false)}
                            className="text-xs border border-terminal-dim px-2 py-0.5 text-terminal-dim hover:text-terminal-text hover:border-terminal-text transition-colors"
                          >
                            NO
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* Report button */}
              {!isOwnComment && (
                <button
                  onClick={handleReportClick}
                  className={`text-xs flex items-center gap-1 transition-colors
                    ${hasReported 
                      ? 'text-terminal-alert' 
                      : 'text-terminal-dim hover:text-terminal-alert'
                    }`}
                  title={hasReported ? 'Already reported' : 'Report this comment'}
                  disabled={hasReported}
                >
                  <Flag size={10} fill={hasReported ? 'currentColor' : 'none'} />
                  {hasReported ? 'REPORTED' : 'REPORT'}
                </button>
              )}

              {/* Mute button */}
              {!isOwnComment && comment.authorPubkey && onToggleMute && (
                <button
                  onClick={() => onToggleMute(comment.authorPubkey!)}
                  className={`text-xs flex items-center gap-1 transition-colors
                    ${isMuted?.(comment.authorPubkey!) 
                      ? 'text-terminal-alert' 
                      : 'text-terminal-dim hover:text-terminal-alert'
                    }`}
                  title={isMuted?.(comment.authorPubkey!) ? 'Unmute user' : 'Mute user'}
                >
                  <VolumeX size={10} />
                  {isMuted?.(comment.authorPubkey!) ? 'UNMUTE' : 'MUTE'}
                </button>
              )}
            </div>

            {/* Reply form */}
            {isReplying && (
              <form 
                onSubmit={handleSubmitReply}
                className="mt-3 flex gap-2 items-start bg-terminal-bg/40 p-2 border border-terminal-dim/30"
              >
                <div className="flex-1">
                  <MentionInput
                    value={replyContent}
                    onChange={setReplyContent}
                    knownUsers={knownUsers}
                    placeholder={`Reply to ${comment.author}... (use @ to mention)`}
                    autoFocus
                    minHeight="50px"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!replyContent.trim() || isSubmitting}
                  className="border border-terminal-dim px-3 py-1 text-xs hover:bg-terminal-text hover:text-black disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-terminal-dim transition-all uppercase font-bold"
                >
                  {isSubmitting ? '...' : 'TX'}
                </button>
              </form>
            )}
          </>
        )}
          </div>
        </div>
      </div>

      {/* Nested replies */}
      {!isCollapsed && hasReplies && (
        <div className="mt-1">
          {comment.replies!.slice(0, visibleReplies).map(reply => (
            <CommentThreadComponent
              key={reply.id}
              comment={reply}
              userState={userState}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onViewProfile={onViewProfile}
              onVote={onVote}
              postId={postId}
              formatTime={formatTime}
              knownUsers={knownUsers}
              depth={depth + 1}
              maxVisualDepth={maxVisualDepth}
              onToggleMute={onToggleMute}
              isMuted={isMuted}
            />
          ))}

          {comment.replies!.length > visibleReplies && (
            <button
              type="button"
              onClick={() =>
                setVisibleReplies((n) => Math.min(n + REPLIES_PAGE_SIZE, comment.replies!.length))
              }
              className="mt-1 ml-3 text-xs text-terminal-dim hover:text-terminal-text transition-colors border border-terminal-dim/30 px-2 py-1"
              title="Show more replies"
            >
              + SHOW {Math.min(REPLIES_PAGE_SIZE, comment.replies!.length - visibleReplies)} MORE
            </button>
          )}
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <ReportModal
          targetType="comment"
          targetId={comment.id}
          targetPreview={comment.content.slice(0, 100)}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  );
};

// Utility function to build comment tree from flat array
export function buildCommentTree(comments: Comment[]): Comment[] {
  const commentMap = new Map<string, Comment>();
  const rootComments: Comment[] = [];

  // First pass: create map and initialize replies array
  comments.forEach(comment => {
    commentMap.set(comment.id, { ...comment, replies: [], depth: 0 });
  });

  // Second pass: build tree structure
  comments.forEach(comment => {
    const node = commentMap.get(comment.id)!;
    
    if (comment.parentId && commentMap.has(comment.parentId)) {
      const parent = commentMap.get(comment.parentId)!;
      node.depth = (parent.depth || 0) + 1;
      parent.replies!.push(node);
    } else {
      // Root level comment
      node.depth = 0;
      rootComments.push(node);
    }
  });

  // Sort by timestamp (oldest first for conversation flow)
  const sortByTimestamp = (a: Comment, b: Comment) => a.timestamp - b.timestamp;
  
  const sortReplies = (comment: Comment): Comment => {
    if (comment.replies && comment.replies.length > 0) {
      comment.replies.sort(sortByTimestamp);
      comment.replies.forEach(sortReplies);
    }
    return comment;
  };

  rootComments.sort(sortByTimestamp);
  rootComments.forEach(sortReplies);

  return rootComments;
}

export const CommentThread = React.memo(CommentThreadComponent);

// Wrapper component for comment list with controls
interface CommentListProps {
  comments: Comment[];
  userState: UserState;
  onReply: (parentId: string, content: string) => void;
  onEdit?: (commentId: string, content: string) => void;
  onDelete?: (commentId: string) => void;
  onViewProfile?: (author: string, authorPubkey?: string) => void;
  onVote?: (postId: string, commentId: string, direction: 'up' | 'down') => void;
  postId?: string;
  formatTime: (timestamp: number) => string;
  knownUsers?: Set<string>;
  onToggleMute?: (pubkey: string) => void;
  isMuted?: (pubkey: string) => boolean;
}

const CommentListComponent: React.FC<CommentListProps> = ({
  comments,
  userState,
  onReply,
  onEdit,
  onDelete,
  onViewProfile,
  onVote,
  postId,
  formatTime,
  knownUsers = new Set(),
  onToggleMute,
  isMuted,
}) => {
  const [visibleCount, setVisibleCount] = useState(TOP_LEVEL_PAGE_SIZE);
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [collapseKey, setCollapseKey] = useState(0); // Force re-render on collapse all

  const totalComments = useMemo(() => {
    const countAll = (c: Comment): number => {
      if (!c.replies) return 1;
      return 1 + c.replies.reduce((sum, r) => sum + countAll(r), 0);
    };
    return comments.reduce((sum, c) => sum + countAll(c), 0);
  }, [comments]);

  const handleCollapseAll = useCallback(() => {
    // Store collapse state for all comments
    const collapseRecursive = (c: Comment) => {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(`${COLLAPSE_STORAGE_PREFIX}${c.id}`, '1');
        }
      } catch { /* ignore */ }
      c.replies?.forEach(collapseRecursive);
    };
    comments.forEach(collapseRecursive);
    setAllCollapsed(true);
    setCollapseKey(k => k + 1);
  }, [comments]);

  const handleExpandAll = useCallback(() => {
    // Clear collapse state for all comments
    const expandRecursive = (c: Comment) => {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(`${COLLAPSE_STORAGE_PREFIX}${c.id}`);
        }
      } catch { /* ignore */ }
      c.replies?.forEach(expandRecursive);
    };
    comments.forEach(expandRecursive);
    setAllCollapsed(false);
    setCollapseKey(k => k + 1);
  }, [comments]);

  const shouldVirtualize = comments.length > VIRTUALIZE_THRESHOLD;
  const parentRef = useRef<HTMLDivElement>(null);
  
  // Track measured comment heights for dynamic sizing
  const commentHeights = useRef<Map<number, number>>(new Map());
  const averageHeight = useRef<number>(200); // Fallback initial estimate for comments

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? comments.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const measured = commentHeights.current.get(index);
      if (measured) {
        const currentAvg = averageHeight.current;
        averageHeight.current = (currentAvg * 0.9) + (measured * 0.1);
        return measured;
      }
      return averageHeight.current;
    },
    overscan: 5,
  });

  const visibleComments = shouldVirtualize 
    ? virtualizer.getVirtualItems().map(virtualItem => comments[virtualItem.index])
    : comments.slice(0, visibleCount);
  const hasMore = !shouldVirtualize && comments.length > visibleCount;

  if (comments.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Comment controls header */}
      {totalComments > 3 && (
        <div className="flex items-center justify-between text-xs text-terminal-dim border-b border-terminal-dim/30 pb-2 mb-2">
          <span className="uppercase">
            {totalComments} {totalComments === 1 ? 'comment' : 'comments'}
            {shouldVirtualize && ` (virtualized)`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCollapseAll}
              className="hover:text-terminal-text transition-colors uppercase"
              title="Collapse all threads"
            >
              Collapse all
            </button>
            <span className="text-terminal-dim/50">|</span>
            <button
              onClick={handleExpandAll}
              className="hover:text-terminal-text transition-colors uppercase"
              title="Expand all threads"
            >
              Expand all
            </button>
          </div>
        </div>
      )}

      {/* Comments list */}
      <div 
        key={collapseKey}
        ref={parentRef}
        className={shouldVirtualize ? "h-[600px] overflow-auto" : ""}
      >
        {shouldVirtualize ? (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const comment = comments[virtualItem.index];
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={(el) => {
                    if (el) {
                      virtualizer.measureElement(el);
                      const height = el.getBoundingClientRect().height;
                      if (height > 0) {
                        commentHeights.current.set(virtualItem.index, height);
                      }
                    }
                  }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <CommentThread
                    comment={comment}
                    userState={userState}
                    onReply={onReply}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onViewProfile={onViewProfile}
                    onVote={onVote}
                    postId={postId}
                    formatTime={formatTime}
                    knownUsers={knownUsers}
                    depth={0}
                    onToggleMute={onToggleMute}
                    isMuted={isMuted}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          visibleComments.map(comment => (
            <CommentThread
              key={comment.id}
              comment={comment}
              userState={userState}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onViewProfile={onViewProfile}
              onVote={onVote}
              postId={postId}
              formatTime={formatTime}
              knownUsers={knownUsers}
              depth={0}
              onToggleMute={onToggleMute}
              isMuted={isMuted}
            />
          ))
        )}
      </div>

      {/* Load more comments (only when not virtualized) */}
      {hasMore && (
        <button
          onClick={() => setVisibleCount(v => Math.min(v + TOP_LEVEL_PAGE_SIZE, comments.length))}
          className="w-full py-2 text-xs text-terminal-dim hover:text-terminal-text border border-terminal-dim/30 hover:border-terminal-text transition-colors uppercase"
        >
          Load {Math.min(TOP_LEVEL_PAGE_SIZE, comments.length - visibleCount)} more comments
          <span className="ml-2 text-terminal-dim/50">
            (showing {visibleCount} of {comments.length})
          </span>
        </button>
      )}
    </div>
  );
};

export const CommentList = React.memo(CommentListComponent);
