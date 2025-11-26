import React, { useState, useEffect } from 'react';
import { Post, UserState, Board } from '../types';
import { ArrowBigUp, ArrowBigDown, MessageSquare, Clock, Hash, ExternalLink, CornerDownRight, Maximize2, Minimize2, Image as ImageIcon, Shield, Users } from 'lucide-react';

interface PostItemProps {
  post: Post;
  boardName?: string;
  userState: UserState;
  onVote: (postId: string, direction: 'up' | 'down') => void;
  onComment: (postId: string, content: string) => void;
  onViewBit: (postId: string) => void;
  isFullPage?: boolean;
  isNostrConnected?: boolean;
}

export const PostItem: React.FC<PostItemProps> = ({
  post,
  boardName,
  userState,
  onVote,
  onComment,
  onViewBit,
  isFullPage = false,
  isNostrConnected = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(isFullPage);
  const [newComment, setNewComment] = useState('');
  const [isTransmitting, setIsTransmitting] = useState(false);

  // If in full page mode, always expanded
  useEffect(() => {
    if (isFullPage) setIsExpanded(true);
  }, [isFullPage]);

  const voteDirection = userState.votedPosts[post.id];
  const isUpvoted = voteDirection === 'up';
  const isDownvoted = voteDirection === 'down';
  const hasInvested = isUpvoted || isDownvoted;
  
  // Expansion Rule: Inline if <= 5 comments, otherwise Full Page
  const EXPANSION_THRESHOLD = 5;
  const requiresFullPage = post.commentCount > EXPANSION_THRESHOLD;

  const handleInteraction = () => {
    if (isFullPage) return; // Already expanded in full view

    if (requiresFullPage) {
      onViewBit(post.id);
    } else {
      setIsExpanded(!isExpanded);
    }
  };

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return '< 1h';
    if (hours > 24) return `${Math.floor(hours / 24)}d`;
    return `${hours}h`;
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    
    setIsTransmitting(true);
    setTimeout(() => {
      onComment(post.id, newComment);
      setNewComment('');
      setIsTransmitting(false);
    }, 500);
  };

  return (
    <div 
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

      <div className={`flex flex-row gap-4 p-3 ${isExpanded ? 'p-5' : ''}`}>
        {/* Voting Column - Cryptographically Verified */}
        <div className="flex flex-col items-center min-w-[3.5rem] border-r border-terminal-dim pr-3 justify-start pt-1 gap-1">
          <button 
            onClick={(e) => { e.stopPropagation(); onVote(post.id, 'up'); }}
            className={`p-1 hover:bg-terminal-dim transition-colors ${isUpvoted ? 'text-terminal-text font-bold' : 'text-terminal-dim'}`}
            disabled={(!userState.identity) || (userState.bits <= 0 && !hasInvested)}
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
            <ArrowBigUp size={24} fill={isUpvoted ? "currentColor" : "none"} />
          </button>
          
          <span className={`text-lg font-bold ${post.score > 0 ? 'text-terminal-text' : post.score < 0 ? 'text-terminal-alert' : 'text-terminal-dim/50'}`}>
            {post.score > 0 ? '+' : ''}{post.score}
          </span>

          <button 
            onClick={(e) => { e.stopPropagation(); onVote(post.id, 'down'); }}
            className={`p-1 hover:bg-terminal-dim transition-colors ${isDownvoted ? 'text-terminal-alert font-bold' : 'text-terminal-dim'}`}
            disabled={(!userState.identity) || (userState.bits <= 0 && !hasInvested)}
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
            <ArrowBigDown size={24} fill={isDownvoted ? "currentColor" : "none"} />
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
        <div className="flex-1 flex flex-col">
          <div className="text-xs text-terminal-dim mb-2 flex flex-wrap items-center gap-2 uppercase tracking-wider">
            {boardName && (
              <span className="bg-terminal-dim/20 px-1 text-terminal-text font-bold mr-2">
                //{boardName}
              </span>
            )}
            <span className={`font-bold text-terminal-dim`}>
              {post.author}
            </span>
            <span>::</span>
            <span className="flex items-center gap-1"><Clock size={12} /> {formatTime(post.timestamp)}</span>
            {post.url && (
               <span className="ml-auto border border-terminal-dim px-1 text-[10px] text-terminal-text flex items-center gap-1">
                 LINK_BIT
                 {post.imageUrl && <ImageIcon size={8} />}
               </span>
            )}
          </div>
          
          <div className="flex justify-between items-start gap-4">
            {post.url ? (
              <a 
                href={post.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xl md:text-2xl font-bold text-terminal-text leading-tight mb-2 cursor-pointer hover:bg-terminal-text hover:text-black decoration-2 underline-offset-4 flex items-start gap-2 transition-colors inline-block break-words"
              >
                {post.title}
                <ExternalLink size={20} className="inline-block mt-1 opacity-70 min-w-[20px]" />
              </a>
            ) : (
              <h3 
                onClick={handleInteraction}
                className="text-xl md:text-2xl font-bold text-terminal-text leading-tight mb-2 cursor-pointer hover:underline decoration-2 underline-offset-4 select-none break-words"
              >
                {post.title}
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
                  className="w-full h-auto max-h-[300px] object-cover grayscale sepia contrast-125 brightness-75 group-hover/image:filter-none group-hover/image:brightness-100 transition-all duration-300"
                />
                <div className="absolute bottom-0 left-0 bg-terminal-bg/80 px-2 py-1 text-[10px] text-terminal-text border-t border-r border-terminal-dim">
                  IMG_PREVIEW_ASSET
                </div>
               </a>
             </div>
          )}

          <div 
            onClick={handleInteraction}
            className={`text-sm md:text-base text-terminal-text/80 font-mono leading-relaxed mb-3 cursor-pointer break-words ${!isExpanded ? 'line-clamp-2' : 'opacity-100'}`}
          >
            {post.content}
          </div>

          <div className="mt-auto flex items-center justify-between border-t border-terminal-dim pt-2">
            <div className="flex gap-2 flex-wrap">
              {post.tags.map(tag => (
                <span key={tag} className="text-xs border border-terminal-dim px-1 text-terminal-dim flex items-center hover:text-terminal-text cursor-pointer">
                  <Hash size={10} className="mr-1"/>{tag}
                </span>
              ))}
            </div>
            
            <button 
              onClick={(e) => { e.stopPropagation(); handleInteraction(); }}
              className={`flex items-center gap-2 text-sm px-2 py-0.5 transition-colors border border-transparent shrink-0
                ${isExpanded 
                  ? 'text-terminal-text border-terminal-dim bg-terminal-bg/30' 
                  : 'text-terminal-dim hover:text-terminal-text hover:border-terminal-dim'
                }`}
            >
              <MessageSquare size={14} />
              {post.commentCount} {post.commentCount === 1 ? 'COMMENT' : 'COMMENTS'}
              {requiresFullPage && !isFullPage && (
                <span className="flex items-center ml-1 text-[10px] border border-terminal-dim px-1 text-terminal-alert">
                   FULL_VIEW <Maximize2 size={8} className="ml-1" />
                </span>
              )}
              {!requiresFullPage && !isFullPage && (
                 <span className="ml-1 opacity-50">
                   {isExpanded ? <Minimize2 size={10} /> : <Maximize2 size={10} />}
                 </span>
              )}
            </button>
          </div>

          {/* Expanded Content (Inline or Full Page) */}
          {isExpanded && (
            <div className="mt-6 border-t-2 border-dashed border-terminal-dim/50 pt-4 animate-pulse-fast" style={{animationDuration: '0.2s', animationIterationCount: 1}}>
              <h4 className="text-xs text-terminal-dim mb-4 font-bold uppercase tracking-widest flex items-center gap-2">
                <CornerDownRight size={14} />
                DATA_STREAM
              </h4>

              {post.comments.length > 0 ? (
                <div className="space-y-4 mb-6">
                  {post.comments.map((comment) => (
                    <div key={comment.id} className="pl-4 border-l-2 border-terminal-dim hover:border-terminal-text transition-colors">
                      <div className="flex items-center gap-2 text-terminal-dim text-xs mb-1">
                         <span className="text-terminal-text font-bold">{comment.author}</span>
                         <span>::</span>
                         <span>{formatTime(comment.timestamp)}</span>
                      </div>
                      <p className="text-terminal-text/80 text-sm leading-relaxed break-words">{comment.content}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-terminal-dim italic text-sm mb-6 border border-terminal-dim p-2 inline-block">
                  &gt; Null signal. Awaiting input...
                </p>
              )}

              <form onSubmit={handleCommentSubmit} className="flex gap-3 items-start bg-terminal-bg/40 p-3 border border-terminal-dim/30">
                <div className="flex-1 flex flex-col gap-2">
                  <label className="text-[10px] uppercase text-terminal-dim font-bold">Append Data:</label>
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Type response..."
                    className="bg-terminal-bg border border-terminal-dim p-2 text-sm text-terminal-text focus:border-terminal-text focus:outline-none w-full min-h-[60px] font-mono"
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
    </div>
  );
};