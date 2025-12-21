import React, { useMemo, useCallback } from 'react';
import { Post, UserState } from '../types';
import { ArrowLeft, Clock, Hash, Image as ImageIcon, Lock, ExternalLink, Edit3, Bookmark, Flag, Shield, Users, UserX, ArrowBigUp, ArrowBigDown, Trash2 } from 'lucide-react';
import { CommentThread, buildCommentTree } from './CommentThread';
import { MentionText } from './MentionText';
import { MentionInput } from './MentionInput';
import { ShareButton } from './ShareButton';
import { ReportModal } from './ReportModal';

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
  hasReported?: boolean;
  isNostrConnected?: boolean;
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
  hasReported = false,
  isNostrConnected = false,
}) => {
  const [newComment, setNewComment] = React.useState('');
  const [isTransmitting, setIsTransmitting] = React.useState(false);
  const [showReportModal, setShowReportModal] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  const handleReportClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasReported) {
      setShowReportModal(true);
    }
  }, [hasReported]);

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

  const handleTagClick = useCallback((e: React.MouseEvent, tag: string) => {
    e.stopPropagation();
    if (onTagClick) {
      onTagClick(tag);
    }
  }, [onTagClick]);

  const voteDirection = useMemo(() => userState.votedPosts[post.id], [userState.votedPosts, post.id]);
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

  const handleCommentSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    
    setIsTransmitting(true);
    setTimeout(() => {
      onComment(post.id, newComment, undefined);
      setNewComment('');
      setIsTransmitting(false);
    }, 500);
  }, [newComment, onComment, post.id]);

  const handleReplyToComment = useCallback((parentCommentId: string, content: string) => {
    onComment(post.id, content, parentCommentId);
  }, [onComment, post.id]);

  const handleEditComment = useCallback((commentId: string, content: string) => {
    onEditComment?.(post.id, commentId, content);
  }, [onEditComment, post.id]);

  const handleDeleteComment = useCallback((commentId: string) => {
    onDeleteComment?.(post.id, commentId);
  }, [onDeleteComment, post.id]);

  const handleVoteUp = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onVote(post.id, 'up');
  }, [onVote, post.id]);

  const handleVoteDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onVote(post.id, 'down');
  }, [onVote, post.id]);

  const commentTree = useMemo(() => {
    return buildCommentTree(post.comments);
  }, [post.comments]);

  return (
    <div className="animate-fade-in">
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-terminal-dim hover:text-terminal-text mb-6 uppercase text-sm font-bold group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        BACK TO {boardName ? `//${boardName}` : 'GLOBAL'}
      </button>

      <div className="w-full border-2 border-terminal-text bg-terminal-highlight shadow-glow relative group font-mono">
        {/* Decorator corners */}
        <div className="absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2 border-terminal-text"></div>
        <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2 border-terminal-text"></div>

        <div className="flex flex-row gap-3 p-4">
          {/* Voting Column */}
          <div className="flex flex-col items-center w-12 border-r border-terminal-dim pr-2 justify-start pt-1 gap-1 flex-shrink-0">
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

            {hasInvested && (
              <div className="mt-2 flex flex-col items-center animate-fade-in">
                <span className="text-[8px] text-terminal-dim border border-terminal-dim px-1 py-0.5 uppercase tracking-tighter">
                  1 BIT
                </span>
                <span className="text-[8px] text-terminal-dim">LOCKED</span>
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <div className="text-[10px] text-terminal-dim mb-1 flex flex-wrap items-center gap-2 uppercase tracking-wider">
              {boardName && (
                <span className="bg-terminal-dim/20 px-1 text-terminal-text font-bold mr-2">
                  //{boardName}
                </span>
              )}
              <button
                onClick={handleAuthorClick}
                className="font-bold text-terminal-dim hover:text-terminal-text hover:underline transition-colors cursor-pointer"
                title={`View ${post.author}'s profile`}
              >
                {post.author}
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
                className="text-xl md:text-2xl font-bold text-terminal-text leading-tight mb-1 cursor-pointer hover:bg-terminal-text hover:text-black decoration-2 underline-offset-4 flex items-start gap-2 transition-colors inline-block break-words"
              >
                  {post.title}
                  {post.isEncrypted && <Lock size={16} className="text-terminal-dim" title="Encrypted post" />}
                  <ExternalLink size={20} className="inline-block mt-1 opacity-70 min-w-[20px]" />
                </a>
              ) : (
                <h3 className="text-xl md:text-2xl font-bold text-terminal-text leading-tight mb-1 break-words flex items-center gap-2">
                  {post.title}
                  {post.isEncrypted && <Lock size={16} className="text-terminal-dim" title="Encrypted post" />}
                </h3>
              )}
            </div>
            
            {/* Media Preview */}
            {post.imageUrl && (
               <div className="mb-4 mt-2 border border-terminal-dim/50 relative group/image overflow-hidden bg-black max-w-lg">
                 <a href={post.url || '#'} target="_blank" rel="noopener noreferrer" className="block">
                  <div className="absolute inset-0 bg-terminal-text/10 pointer-events-none group-hover/image:opacity-0 transition-opacity z-10 mix-blend-overlay"></div>
                  <img 
                    src={post.imageUrl} 
                    alt="Content Preview" 
                    loading="lazy"
                    className="w-full h-auto max-h-[300px] object-cover grayscale sepia contrast-125 brightness-75 group-hover/image:filter-none group-hover/image:brightness-100 transition-all duration-300"
                  />
                  <div className="absolute bottom-0 left-0 bg-terminal-bg/80 px-2 py-1 text-[10px] text-terminal-text border-t border-r border-terminal-dim">
                    IMG_PREVIEW_ASSET
                  </div>
                 </a>
               </div>
            )}

            {isEncryptedWithoutKey ? (
              <div className="text-sm md:text-base text-terminal-dim font-mono leading-relaxed mb-3 p-4 border border-terminal-dim/50 bg-terminal-dim/10">
                <p className="mb-2">This post is encrypted. You need the board share link to view it.</p>
                <p className="text-xs text-terminal-dim/70">
                  The encryption key is embedded in the share link URL fragment and never sent to servers.
                </p>
              </div>
            ) : (
              <div className="text-sm md:text-base text-terminal-text/80 font-mono leading-relaxed mb-2 break-words">
                <MentionText 
                  content={post.content} 
                  onMentionClick={(username) => onViewProfile?.(username, undefined)}
                />
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
                <button
                  onClick={handleBookmarkClick}
                  className={`p-2 md:p-1 transition-colors ${isBookmarked ? 'text-terminal-text' : 'text-terminal-dim hover:text-terminal-text'}`}
                  title={isBookmarked ? 'Remove bookmark' : 'Save to bookmarks'}
                  aria-label={isBookmarked ? 'Remove bookmark' : 'Save to bookmarks'}
                  aria-pressed={isBookmarked}
                >
                  <Bookmark size={16} fill={isBookmarked ? 'currentColor' : 'none'} />
                </button>

                <ShareButton postId={post.id} postTitle={post.title} />

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
              </div>
            </div>

            {/* Full Comment Thread */}
            <div className="mt-6 border-t-2 border-dashed border-terminal-dim/50 pt-4">
              <h4 className="text-xs text-terminal-dim mb-4 font-bold uppercase tracking-widest flex items-center gap-2">
                <span className="text-terminal-text">{post.commentCount}</span> {post.commentCount === 1 ? 'COMMENT' : 'COMMENTS'}
              </h4>

              {commentTree.length > 0 ? (
                <div className="space-y-2 mb-6">
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
                <p className="text-terminal-dim italic text-sm mb-6 border border-terminal-dim p-2 inline-block">
                  &gt; Null signal. Awaiting input...
                </p>
              )}

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
          </div>
        </div>
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
        </div>
      )}
    </div>
  );
};
