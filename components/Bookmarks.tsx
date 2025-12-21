import React, { useMemo } from 'react';
import { Post, UserState } from '../types';
import { PostItem } from './PostItem';
import { ArrowLeft, Bookmark, Trash2 } from 'lucide-react';
import { bookmarkService } from '../services/bookmarkService';

interface BookmarksProps {
  posts: Post[];
  bookmarkedIds: string[];
  reportedPostIdSet: Set<string>;
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
  onDeletePost?: (postId: string) => void;
  onTagClick?: (tag: string) => void;
  onClose: () => void;
  isNostrConnected: boolean;
  onToggleMute?: (pubkey: string) => void;
  isMuted?: (pubkey: string) => boolean;
}

export const Bookmarks: React.FC<BookmarksProps> = ({
  posts,
  bookmarkedIds,
  reportedPostIdSet,
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
  onDeletePost,
  onTagClick,
  onClose,
  isNostrConnected,
  onToggleMute,
  isMuted,
}) => {
  // Get bookmarked posts in order
  const bookmarkedPosts = useMemo(() => {
    const postsMap = new Map(posts.map(p => [p.id, p]));
    return bookmarkedIds
      .map(id => postsMap.get(id))
      .filter((p): p is Post => p !== undefined);
  }, [posts, bookmarkedIds]);

  const handleClearAll = () => {
    if (confirm('Remove all bookmarks? This cannot be undone.')) {
      bookmarkService.clearAll();
    }
  };

  return (
    <div className="animate-fade-in">
      <button 
        onClick={onClose}
        className="flex items-center gap-2 text-terminal-dim hover:text-terminal-text mb-4 uppercase text-sm font-bold group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        BACK TO FEED
      </button>

      {/* Header */}
      <div className="flex justify-between items-end mb-6 pb-2 border-b border-terminal-dim/30">
        <div>
          <h2 className="text-2xl font-terminal uppercase tracking-widest text-terminal-text flex items-center gap-2">
            <Bookmark size={24} />
            SAVED_BITS
          </h2>
          <p className="text-xs text-terminal-dim mt-1">
            {bookmarkedPosts.length} {bookmarkedPosts.length === 1 ? 'post' : 'posts'} saved
          </p>
        </div>
        
        {bookmarkedPosts.length > 0 && (
          <button
            onClick={handleClearAll}
            className="flex items-center gap-2 text-xs text-terminal-dim hover:text-terminal-alert border border-terminal-dim hover:border-terminal-alert px-2 py-1 transition-colors"
          >
            <Trash2 size={12} />
            CLEAR_ALL
          </button>
        )}
      </div>

      {/* Bookmarked Posts */}
      {bookmarkedPosts.length === 0 ? (
        <div className="border border-terminal-dim p-12 text-center text-terminal-dim flex flex-col items-center gap-4">
          <div className="text-4xl opacity-20">
            <Bookmark size={48} />
          </div>
          <div>
            <p className="font-bold">&gt; NO SAVED BITS</p>
            <p className="text-xs mt-2">
              Click the bookmark icon on any post to save it here.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {bookmarkedPosts.map(post => (
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
              onDeletePost={onDeletePost}
              isBookmarked={true}
              onToggleBookmark={(id) => bookmarkService.toggleBookmark(id)}
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
