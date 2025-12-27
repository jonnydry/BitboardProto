import React from 'react';

/**
 * PostSkeleton - Terminal-style skeleton loader for posts
 * Matches the PostItem layout to prevent layout shifts (CLS)
 */
export const PostSkeleton: React.FC<{ count?: number }> = ({ count = 1 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="w-full border-2 border-terminal-dim/50 bg-terminal-bg mb-4 relative font-mono animate-pulse"
          style={{ containIntrinsicSize: '420px' }}
        >
          {/* Scanline effect overlay */}
          <div className="absolute inset-0 pointer-events-none bg-scanline opacity-5" />
          
          <div className="flex flex-row gap-2 md:gap-3 p-2">
            {/* Voting Column Skeleton */}
            <div className="flex flex-col items-center w-10 md:w-12 border-r border-terminal-dim/30 pr-1 md:pr-2 justify-start pt-1 gap-1 flex-shrink-0">
              {/* Up arrow placeholder */}
              <div className="w-6 h-6 bg-terminal-dim/20 rounded" />
              
              {/* Score placeholder */}
              <div className="w-6 h-4 bg-terminal-dim/30 rounded my-1" />
              
              {/* Down arrow placeholder */}
              <div className="w-6 h-6 bg-terminal-dim/20 rounded" />
              
              {/* Comment count placeholder */}
              <div className="w-8 h-4 bg-terminal-dim/20 rounded mt-2" />
            </div>

            {/* Content Column Skeleton */}
            <div className="flex-1 min-w-0">
              {/* Header row: author, timestamp, board */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {/* Author avatar placeholder */}
                <div className="w-5 h-5 bg-terminal-dim/30 rounded-full" />
                
                {/* Author name */}
                <div className="h-3 w-20 bg-terminal-dim/40 rounded" />
                
                {/* Timestamp */}
                <div className="h-3 w-16 bg-terminal-dim/20 rounded" />
                
                {/* Board badge */}
                <div className="h-4 w-24 bg-terminal-dim/20 border border-terminal-dim/30 rounded" />
              </div>

              {/* Title placeholder */}
              <div className="h-5 w-3/4 bg-terminal-dim/40 rounded mb-2" />

              {/* Content lines placeholder */}
              <div className="space-y-2 mb-3">
                <div className="h-3 w-full bg-terminal-dim/20 rounded" />
                <div className="h-3 w-5/6 bg-terminal-dim/20 rounded" />
                <div className="h-3 w-4/6 bg-terminal-dim/15 rounded" />
              </div>

              {/* Tags placeholder */}
              <div className="flex gap-2 mb-2">
                <div className="h-4 w-12 bg-terminal-dim/20 border border-terminal-dim/30 rounded" />
                <div className="h-4 w-16 bg-terminal-dim/20 border border-terminal-dim/30 rounded" />
                <div className="h-4 w-10 bg-terminal-dim/15 border border-terminal-dim/20 rounded" />
              </div>

              {/* Action bar placeholder */}
              <div className="flex items-center gap-3 pt-2 border-t border-terminal-dim/20">
                <div className="h-4 w-16 bg-terminal-dim/20 rounded" />
                <div className="h-4 w-14 bg-terminal-dim/15 rounded" />
                <div className="h-4 w-12 bg-terminal-dim/15 rounded" />
              </div>
            </div>
          </div>

          {/* Terminal-style loading indicator */}
          <div className="absolute bottom-1 right-2 text-[10px] text-terminal-dim/50 font-mono flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 bg-terminal-dim/50 rounded-full animate-ping" />
            <span>LOADING_DATA...</span>
          </div>
        </div>
      ))}
    </>
  );
};

/**
 * FeedSkeleton - Full feed loading state with terminal aesthetic
 */
export const FeedSkeleton: React.FC = () => {
  return (
    <div className="space-y-2">
      {/* Header skeleton */}
      <div className="mb-6 pb-2 border-b border-terminal-dim/30">
        <div className="flex justify-between items-end">
          <div>
            <div className="h-7 w-48 bg-terminal-dim/30 rounded mb-2 animate-pulse" />
            <div className="h-3 w-64 bg-terminal-dim/20 rounded animate-pulse" />
          </div>
          <div className="h-6 w-32 bg-terminal-dim/20 border border-terminal-dim/30 rounded animate-pulse" />
        </div>
      </div>

      {/* Post skeletons */}
      <PostSkeleton count={3} />

      {/* Terminal loading message */}
      <div className="text-center py-4 text-terminal-dim/60 font-mono text-xs animate-pulse">
        <span className="inline-block">▓▓▓</span>
        <span className="mx-2">FETCHING_SIGNALS...</span>
        <span className="inline-block">▓▓▓</span>
      </div>
    </div>
  );
};

/**
 * InlineLoadingSkeleton - For "load more" states
 */
export const InlineLoadingSkeleton: React.FC = () => {
  return (
    <div className="py-8">
      <PostSkeleton count={2} />
      <div className="flex items-center justify-center gap-3 text-terminal-dim font-mono">
        <div className="flex gap-0.5">
          <span className="inline-block w-2 h-4 bg-terminal-dim/40 animate-pulse" style={{ animationDelay: '0ms' }} />
          <span className="inline-block w-2 h-4 bg-terminal-dim/40 animate-pulse" style={{ animationDelay: '150ms' }} />
          <span className="inline-block w-2 h-4 bg-terminal-dim/40 animate-pulse" style={{ animationDelay: '300ms' }} />
        </div>
        <span className="text-sm uppercase tracking-wider">Loading more signals...</span>
        <div className="flex gap-0.5">
          <span className="inline-block w-2 h-4 bg-terminal-dim/40 animate-pulse" style={{ animationDelay: '300ms' }} />
          <span className="inline-block w-2 h-4 bg-terminal-dim/40 animate-pulse" style={{ animationDelay: '150ms' }} />
          <span className="inline-block w-2 h-4 bg-terminal-dim/40 animate-pulse" style={{ animationDelay: '0ms' }} />
        </div>
      </div>
    </div>
  );
};

export default PostSkeleton;
