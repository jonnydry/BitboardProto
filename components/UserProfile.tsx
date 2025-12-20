import React, { useMemo } from 'react';
import { Post, UserState } from '../types';
import { PostItem } from './PostItem';
import { ArrowLeft, User, FileText, MessageSquare, TrendingUp, RefreshCw, VolumeX } from 'lucide-react';

interface UserProfileProps {
  username: string;
  authorPubkey?: string;
  posts: Post[];
  bookmarkedIdSet: Set<string>;
  reportedPostIdSet: Set<string>;
  onToggleBookmark: (postId: string) => void;
  userState: UserState;
  knownUsers?: Set<string>;
  onVote: (postId: string, direction: 'up' | 'down') => void;
  onComment: (postId: string, content: string, parentCommentId?: string) => void;
  onEditComment?: (postId: string, commentId: string, content: string) => void;
  onDeleteComment?: (postId: string, commentId: string) => void;
  onCommentVote?: (postId: string, commentId: string, direction: 'up' | 'down') => void;
  onViewBit: (postId: string) => void;
  onViewProfile?: (username: string, pubkey?: string) => void;
  onEditPost?: (postId: string) => void;
  onTagClick?: (tag: string) => void;
  onRefreshProfile?: (pubkey: string) => void;
  onClose: () => void;
  isNostrConnected: boolean;
  onToggleMute?: (pubkey: string) => void;
  isMuted?: (pubkey: string) => boolean;
}

export const UserProfile: React.FC<UserProfileProps> = ({
  username,
  authorPubkey,
  posts,
  bookmarkedIdSet,
  reportedPostIdSet,
  onToggleBookmark,
  userState,
  knownUsers,
  onVote,
  onComment,
  onEditComment,
  onDeleteComment,
  onCommentVote,
  onViewBit,
  onViewProfile,
  onEditPost,
  onTagClick,
  onRefreshProfile,
  onClose,
  isNostrConnected,
  onToggleMute,
  isMuted,
}) => {
  // Filter posts by this user
  const userPosts = useMemo(() => {
    return posts.filter(p => 
      p.author === username || 
      (authorPubkey && p.authorPubkey === authorPubkey)
    ).sort((a, b) => b.timestamp - a.timestamp);
  }, [posts, username, authorPubkey]);

  // Calculate user stats
  const stats = useMemo(() => {
    const totalScore = userPosts.reduce((sum, p) => sum + p.score, 0);
    const totalComments = userPosts.reduce((sum, p) => sum + p.commentCount, 0);
    return {
      postCount: userPosts.length,
      totalScore,
      totalComments,
      avgScore: userPosts.length > 0 ? Math.round(totalScore / userPosts.length) : 0,
    };
  }, [userPosts]);

  const isOwnProfile = userState.username === username || 
    (authorPubkey && userState.identity?.pubkey === authorPubkey);

  return (
    <div className="animate-fade-in">
      <button 
        onClick={onClose}
        className="flex items-center gap-2 text-terminal-dim hover:text-terminal-text mb-4 uppercase text-sm font-bold group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        BACK TO FEED
      </button>

      {/* Profile Header */}
      <div className="border-2 border-terminal-text bg-terminal-bg p-6 mb-6 shadow-hard">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 border-2 border-terminal-text flex items-center justify-center bg-terminal-dim/20">
            <User size={32} className="text-terminal-text" />
          </div>
          
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-bold text-terminal-text">{username}</h2>
              {isOwnProfile && (
                <span className="text-xs border border-terminal-text px-2 py-0.5 text-terminal-text">
                  YOU
                </span>
              )}
              
              {!isOwnProfile && authorPubkey && onToggleMute && (
                <button
                  onClick={() => onToggleMute(authorPubkey)}
                  className={`flex items-center gap-1 text-xs border px-2 py-0.5 transition-colors uppercase
                    ${isMuted?.(authorPubkey)
                      ? 'border-terminal-alert text-terminal-alert hover:bg-terminal-alert hover:text-black'
                      : 'border-terminal-dim text-terminal-dim hover:text-terminal-alert hover:border-terminal-alert'
                    }`}
                >
                  <VolumeX size={12} />
                  {isMuted?.(authorPubkey) ? 'UNMUTE' : 'MUTE'}
                </button>
              )}

              {authorPubkey && onRefreshProfile && (
                <button
                  type="button"
                  onClick={() => onRefreshProfile(authorPubkey)}
                  disabled={!isNostrConnected}
                  className="ml-auto flex items-center gap-2 px-3 py-2 md:py-1 border border-terminal-dim text-terminal-dim hover:text-terminal-text hover:border-terminal-text transition-colors uppercase text-xs disabled:opacity-50"
                  title={isNostrConnected ? 'Refresh profile metadata' : 'Offline: cannot refresh profile'}
                >
                  <RefreshCw size={12} />
                  REFRESH
                </button>
              )}
            </div>
            
            {authorPubkey && (
              <p className="text-xs text-terminal-dim font-mono mb-3 truncate max-w-md">
                npub: {authorPubkey.slice(0, 16)}...{authorPubkey.slice(-8)}
              </p>
            )}
            
            {/* Stats */}
            <div className="flex gap-6 text-sm">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-terminal-dim" />
                <span className="text-terminal-text font-bold">{stats.postCount}</span>
                <span className="text-terminal-dim">posts</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp size={14} className="text-terminal-dim" />
                <span className="text-terminal-text font-bold">{stats.totalScore}</span>
                <span className="text-terminal-dim">total score</span>
              </div>
              <div className="flex items-center gap-2">
                <MessageSquare size={14} className="text-terminal-dim" />
                <span className="text-terminal-text font-bold">{stats.totalComments}</span>
                <span className="text-terminal-dim">comments received</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* User's Posts */}
      <div className="mb-4 pb-2 border-b border-terminal-dim/30">
        <h3 className="text-lg font-bold text-terminal-text uppercase tracking-wider">
          POSTS BY {username}
        </h3>
        <p className="text-xs text-terminal-dim mt-1">
          {userPosts.length} {userPosts.length === 1 ? 'post' : 'posts'} found
        </p>
      </div>

      {userPosts.length === 0 ? (
        <div className="border border-terminal-dim p-12 text-center text-terminal-dim flex flex-col items-center gap-4">
          <div className="text-4xl opacity-20">( _ _)</div>
          <div>
            <p className="font-bold">&gt; NO POSTS FOUND</p>
            <p className="text-xs mt-2">This user hasn't posted anything yet.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {userPosts.map(post => (
            <PostItem
              key={post.id}
              post={post}
              userState={userState}
              knownUsers={knownUsers}
              onVote={onVote}
              onComment={onComment}
              onEditComment={onEditComment}
              onDeleteComment={onDeleteComment}
              onCommentVote={onCommentVote}
              onViewBit={onViewBit}
              onViewProfile={onViewProfile}
              onTagClick={onTagClick}
              onEditPost={onEditPost}
              isBookmarked={bookmarkedIdSet.has(post.id)}
              onToggleBookmark={onToggleBookmark}
              hasReported={reportedPostIdSet.has(post.id)}
              isNostrConnected={isNostrConnected}
              onToggleMute={onToggleMute}
              isMuted={isMuted}
            />
          ))}
        </div>
      )}
    </div>
  );
};
