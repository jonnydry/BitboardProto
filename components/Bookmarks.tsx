import React, { useMemo, useRef, useCallback } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
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

  // Stabilize callbacks to prevent PostItem re-renders
  const handleVote = useCallback((postId: string, direction: 'up' | 'down') => {
    onVote(postId, direction);
  }, [onVote]);

  const handleComment = useCallback((postId: string, content: string, parentCommentId?: string) => {
    onComment(postId, content, parentCommentId);
  }, [onComment]);

  const handleEditComment = useCallback((postId: string, commentId: string, content: string) => {
    onEditComment?.(postId, commentId, content);
  }, [onEditComment]);

  const handleDeleteComment = useCallback((postId: string, commentId: string) => {
    onDeleteComment?.(postId, commentId);
  }, [onDeleteComment]);

  const handleCommentVote = useCallback((postId: string, commentId: string, direction: 'up' | 'down') => {
    onCommentVote?.(postId, commentId, direction);
  }, [onCommentVote]);

  const handleViewBit = useCallback((postId: string) => {
    onViewBit(postId);
  }, [onViewBit]);

  const handleViewProfile = useCallback((username: string, pubkey?: string) => {
    onViewProfile?.(username, pubkey);
  }, [onViewProfile]);

  const handleEditPost = useCallback((postId: string) => {
    onEditPost?.(postId);
  }, [onEditPost]);

  const handleDeletePost = useCallback((postId: string) => {
    onDeletePost?.(postId);
  }, [onDeletePost]);

  const handleTagClick = useCallback((tag: string) => {
    onTagClick?.(tag);
  }, [onTagClick]);

  const handleToggleBookmark = useCallback((id: string) => {
    bookmarkService.toggleBookmark(id);
  }, []);

  const handleToggleMute = useCallback((pubkey: string) => {
    onToggleMute?.(pubkey);
  }, [onToggleMute]);

  // Virtualization for large lists (>25 items)
  const VIRTUALIZE_THRESHOLD = 25;
  const parentRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = bookmarkedPosts.length > VIRTUALIZE_THRESHOLD;

  const rowVirtualizer = shouldVirtualize
    ? useWindowVirtualizer({
        count: bookmarkedPosts.length,
        estimateSize: () => 250,
        scrollMargin: parentRef.current?.offsetTop ?? 0,
        overscan: 5,
      })
    : null;

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
      ) : shouldVirtualize ? (
        <div ref={parentRef} className="relative">
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const post = bookmarkedPosts[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <PostItem
                    post={post}
                    userState={userState}
                    knownUsers={knownUsers}
                    onVote={handleVote}
                    onComment={handleComment}
                    onEditComment={handleEditComment}
                    onDeleteComment={handleDeleteComment}
                    onCommentVote={handleCommentVote}
                    onViewBit={handleViewBit}
                    onViewProfile={handleViewProfile}
                    onTagClick={handleTagClick}
                    onEditPost={handleEditPost}
                    onDeletePost={handleDeletePost}
                    isBookmarked={true}
                    onToggleBookmark={handleToggleBookmark}
                    hasReported={reportedPostIdSet.has(post.id)}
                    isNostrConnected={isNostrConnected}
                    onToggleMute={handleToggleMute}
                    isMuted={isMuted}
                  />
                </div>
              );
            })}
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
              onVote={handleVote}
              onComment={handleComment}
              onEditComment={handleEditComment}
              onDeleteComment={handleDeleteComment}
              onCommentVote={handleCommentVote}
              onViewBit={handleViewBit}
              onViewProfile={handleViewProfile}
              onTagClick={handleTagClick}
              onEditPost={handleEditPost}
              onDeletePost={handleDeletePost}
              isBookmarked={true}
              onToggleBookmark={handleToggleBookmark}
              hasReported={reportedPostIdSet.has(post.id)}
              isNostrConnected={isNostrConnected}
              onToggleMute={handleToggleMute}
              isMuted={isMuted}
            />
          ))}
        </div>
      )}
    </div>
  );
};
