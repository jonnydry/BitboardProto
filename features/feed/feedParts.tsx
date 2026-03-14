import React from 'react';
import { Calendar } from 'lucide-react';
import { PostItem } from '../../components/PostItem';
import { InlineLoadingSkeleton } from '../../components/PostSkeleton';
import type { Post } from '../../types';

export type TimeChunk = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'earlier';

export const TIME_CHUNK_LABELS: Record<TimeChunk, string> = {
  today: 'TODAY',
  yesterday: 'YESTERDAY',
  this_week: 'THIS WEEK',
  this_month: 'THIS MONTH',
  earlier: 'EARLIER',
};

interface FeedPostActions {
  getBoardName: (postId: string) => string | undefined;
  knownUsers: Set<string>;
  onVote: (postId: string, direction: 'up' | 'down') => void;
  onComment: (postId: string, content: string, parentCommentId?: string) => void;
  onEditComment: (postId: string, commentId: string, content: string) => void;
  onDeleteComment: (postId: string, commentId: string) => void;
  onCommentVote?: (postId: string, commentId: string, direction: 'up' | 'down') => void;
  onViewBit: (postId: string) => void;
  onViewProfile: (username: string, pubkey?: string) => void;
  onEditPost: (postId: string) => void;
  onDeletePost: (postId: string) => void;
  onTagClick: (tag: string) => void;
  bookmarkedIdSet: Set<string>;
  onToggleBookmark: (id: string) => void;
  reportedPostIdSet: Set<string>;
  isNostrConnected: boolean;
  onToggleMute?: (pubkey: string) => void;
  isMuted?: (pubkey: string) => boolean;
  onRetryPost?: (postId: string) => void;
}

export const TimeChunkHeader: React.FC<{ chunk: TimeChunk; postCount: number }> = (props) => {
  const { chunk, postCount } = props;
  return (
    <div
      data-time-chunk={chunk}
      className="flex items-center gap-2 py-2 mt-4 first:mt-0 border-b border-terminal-dim/30 mb-2"
    >
      <Calendar size={14} className="text-terminal-dim" />
      <span className="text-xs text-terminal-dim uppercase tracking-wider font-bold">
        {TIME_CHUNK_LABELS[chunk]}
      </span>
      <span className="text-[10px] text-terminal-dim/50">({postCount} posts)</span>
    </div>
  );
};

export const FeedPostCard: React.FC<{ post: Post } & FeedPostActions> = (props) => {
  const {
    post,
    getBoardName,
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
    bookmarkedIdSet,
    onToggleBookmark,
    reportedPostIdSet,
    isNostrConnected,
    onToggleMute,
    isMuted,
    onRetryPost,
  } = props;

  return (
    <PostItem
      post={post}
      boardName={getBoardName(post.id)}
      knownUsers={knownUsers}
      onVote={onVote}
      onComment={onComment}
      onEditComment={onEditComment}
      onDeleteComment={onDeleteComment}
      onCommentVote={onCommentVote}
      onViewBit={onViewBit}
      onViewProfile={onViewProfile}
      onEditPost={onEditPost}
      onDeletePost={onDeletePost}
      onTagClick={onTagClick}
      isBookmarked={bookmarkedIdSet.has(post.id)}
      onToggleBookmark={onToggleBookmark}
      hasReported={reportedPostIdSet.has(post.id)}
      isNostrConnected={isNostrConnected}
      onToggleMute={onToggleMute}
      isMuted={isMuted}
      onRetryPost={onRetryPost}
    />
  );
};

export const FeedLoaderRow: React.FC<{
  loaderRef: React.RefObject<HTMLDivElement>;
  isLoadingMore: boolean;
  hasMorePosts: boolean;
  postCount: number;
  style?: React.CSSProperties;
}> = (props) => {
  const { loaderRef, isLoadingMore, hasMorePosts, postCount, style } = props;
  return (
    <div ref={loaderRef} style={style} className="py-4">
      {isLoadingMore && <InlineLoadingSkeleton />}
      {!hasMorePosts && postCount > 0 && (
        <div className="text-center py-4">
          <div className="text-xs text-terminal-dim uppercase tracking-wider border border-terminal-dim/30 inline-block px-4 py-2">
            END_OF_FEED // All signals loaded
          </div>
        </div>
      )}
    </div>
  );
};
