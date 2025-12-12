import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Comment, UserState } from '../types';
import { ChevronDown, ChevronRight, CornerDownRight, MessageSquare, Clock, Flag } from 'lucide-react';
import { MentionText } from './MentionText';
import { MentionInput } from './MentionInput';
import { ReportModal } from './ReportModal';
import { reportService } from '../services/reportService';

interface CommentThreadProps {
  comment: Comment;
  userState: UserState;
  onReply: (parentId: string, content: string) => void;
  onViewProfile?: (author: string, authorPubkey?: string) => void;
  formatTime: (timestamp: number) => string;
  knownUsers?: Set<string>;
  depth?: number;
  maxVisualDepth?: number;
}

const MAX_VISUAL_DEPTH = 5; // Max indentation level for visual clarity

const CommentThreadComponent: React.FC<CommentThreadProps> = ({
  comment,
  userState,
  onReply,
  onViewProfile,
  formatTime,
  knownUsers = new Set(),
  depth = 0,
  maxVisualDepth = MAX_VISUAL_DEPTH,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [hasReported, setHasReported] = useState(() => reportService.hasReported('comment', comment.id));

  // Check if this is the user's own comment
  const isOwnComment = useMemo(() => {
    if (!userState.identity) return false;
    return comment.authorPubkey === userState.identity.pubkey || comment.author === userState.username;
  }, [comment.authorPubkey, comment.author, userState.identity, userState.username]);

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

  // Visual indentation caps at maxVisualDepth
  const visualDepth = Math.min(depth, maxVisualDepth);
  const indentPx = visualDepth * 16; // 16px per level

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  const handleReplyClick = useCallback(() => {
    setIsReplying(prev => !prev);
    setReplyContent('');
  }, []);

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
        {/* Comment header */}
        <div className="flex items-center gap-2 text-xs mb-1">
          {/* Collapse toggle */}
          {hasReplies && (
            <button
              onClick={handleToggleCollapse}
              className="text-terminal-dim hover:text-terminal-text transition-colors p-0.5"
              title={isCollapsed ? `Expand ${replyCount} replies` : 'Collapse thread'}
            >
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </button>
          )}

          {/* Author */}
          <button
            onClick={handleAuthorClick}
            className="text-terminal-text font-bold hover:underline cursor-pointer"
          >
            {comment.author}
          </button>
          
          <span className="text-terminal-dim">::</span>
          
          {/* Timestamp */}
          <span className="text-terminal-dim flex items-center gap-1">
            <Clock size={10} />
            {formatTime(comment.timestamp)}
          </span>

          {/* Collapsed indicator */}
          {isCollapsed && hasReplies && (
            <span className="text-terminal-dim text-[10px] border border-terminal-dim px-1">
              +{replyCount} {replyCount === 1 ? 'reply' : 'replies'}
            </span>
          )}
        </div>

        {/* Comment content (hidden when collapsed) */}
        {!isCollapsed && (
          <>
            <p className="text-terminal-text/80 text-sm leading-relaxed break-words mb-2">
              <MentionText 
                content={comment.content} 
                onMentionClick={(username) => onViewProfile?.(username, undefined)}
              />
            </p>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleReplyClick}
                className={`text-xs flex items-center gap-1 transition-colors
                  ${isReplying 
                    ? 'text-terminal-text' 
                    : 'text-terminal-dim hover:text-terminal-text'
                  }`}
              >
                <CornerDownRight size={10} />
                {isReplying ? 'CANCEL' : 'REPLY'}
              </button>

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

      {/* Nested replies */}
      {!isCollapsed && hasReplies && (
        <div className="mt-1">
          {comment.replies!.map(reply => (
            <CommentThreadComponent
              key={reply.id}
              comment={reply}
              userState={userState}
              onReply={onReply}
              onViewProfile={onViewProfile}
              formatTime={formatTime}
              knownUsers={knownUsers}
              depth={depth + 1}
              maxVisualDepth={maxVisualDepth}
            />
          ))}
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
