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
  onToggleBookmark: (id: string) => void;
  onSeedPost?: (post: Post) => void;
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
      <span className="text-xs text-terminal-dim/70">({postCount} posts)</span>
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
    onToggleBookmark,
    onSeedPost,
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
      onToggleBookmark={onToggleBookmark}
      onSeedPost={onSeedPost}
      onToggleMute={onToggleMute}
      isMuted={isMuted}
      onRetryPost={onRetryPost}
    />
  );
};

/** Shared copy + frame for the feed terminator (desktop footer + mobile end-of-feed). */
export const FeedEndMarker: React.FC = () => (
  <div className="inline-block border border-terminal-dim/30 px-4 py-2 text-xs uppercase tracking-wider text-terminal-dim">
    END_OF_FEED // All signals loaded
  </div>
);

export const FeedLoaderRow: React.FC<{
  loaderRef: React.RefObject<HTMLDivElement>;
  isLoadingMore: boolean;
  hasMorePosts: boolean;
  postCount: number;
  style?: React.CSSProperties;
}> = (props) => {
  const { loaderRef, isLoadingMore, hasMorePosts, postCount, style } = props;
  const endOfFeed = !hasMorePosts && postCount > 0;
  const rowPad =
    endOfFeed && !isLoadingMore
      ? 'pt-6 pb-0 md:py-2 md:pb-0 md:mb-0 mb-4'
      : 'py-4';

  return (
    <div ref={loaderRef} style={style} className={rowPad}>
      {isLoadingMore && <InlineLoadingSkeleton />}
      {/* Desktop: marker lives in App footer with protocol links; mobile: footer hidden so show here */}
      {endOfFeed && (
        <div className="mt-20 w-full md:hidden">
          <hr className="m-0 h-0 w-full border-0 border-t border-terminal-text/45" />
          <div className="flex justify-center pt-6">
            <FeedEndMarker />
          </div>
        </div>
      )}
    </div>
  );
};
