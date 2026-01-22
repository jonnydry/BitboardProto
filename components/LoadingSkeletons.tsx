import React, { memo } from 'react';

// ============================================
// LOADING SKELETONS
// ============================================
// Consistent loading states for Suspense boundaries

/**
 * Base skeleton component with animation
 */
const SkeletonBase = memo<{ 
  className?: string; 
  style?: React.CSSProperties;
}>(({ className = '', style }) => (
  <div 
    className={`animate-pulse bg-terminal-dim/20 ${className}`}
    style={style}
  />
));
SkeletonBase.displayName = 'SkeletonBase';

/**
 * Post skeleton - matches PostItem layout
 */
export const PostSkeleton = memo(() => (
  <div className="w-full border-2 border-terminal-dim/30 bg-terminal-bg p-4 mb-4">
    <div className="flex gap-3">
      {/* Vote column */}
      <div className="flex flex-col items-center w-12 gap-2">
        <SkeletonBase className="w-6 h-6 rounded" />
        <SkeletonBase className="w-8 h-4" />
        <SkeletonBase className="w-6 h-6 rounded" />
      </div>
      
      {/* Content */}
      <div className="flex-1 space-y-3">
        {/* Meta */}
        <div className="flex gap-2">
          <SkeletonBase className="w-16 h-3" />
          <SkeletonBase className="w-24 h-3" />
          <SkeletonBase className="w-12 h-3" />
        </div>
        
        {/* Title */}
        <SkeletonBase className="w-3/4 h-6" />
        
        {/* Content */}
        <SkeletonBase className="w-full h-4" />
        <SkeletonBase className="w-5/6 h-4" />
        
        {/* Tags & actions */}
        <div className="flex justify-between items-center pt-2 border-t border-terminal-dim/20">
          <div className="flex gap-2">
            <SkeletonBase className="w-12 h-5" />
            <SkeletonBase className="w-16 h-5" />
          </div>
          <SkeletonBase className="w-20 h-5" />
        </div>
      </div>
    </div>
  </div>
));
PostSkeleton.displayName = 'PostSkeleton';

/**
 * Multiple posts loading
 */
export const FeedSkeleton = memo<{ count?: number }>(({ count = 5 }) => (
  <div className="space-y-4">
    {Array.from({ length: count }).map((_, i) => (
      <PostSkeleton key={i} />
    ))}
  </div>
));
FeedSkeleton.displayName = 'FeedSkeleton';

/**
 * Comment skeleton
 */
export const CommentSkeleton = memo<{ depth?: number }>(({ depth = 0 }) => (
  <div 
    className="border-l-2 border-terminal-dim/30 pl-3 py-2"
    style={{ marginLeft: depth * 16 }}
  >
    <div className="flex gap-2 items-center mb-2">
      <SkeletonBase className="w-4 h-4 rounded-full" />
      <SkeletonBase className="w-20 h-3" />
      <SkeletonBase className="w-8 h-3" />
    </div>
    <SkeletonBase className="w-full h-3 mb-1" />
    <SkeletonBase className="w-3/4 h-3" />
  </div>
));
CommentSkeleton.displayName = 'CommentSkeleton';

/**
 * Comment thread skeleton
 */
export const CommentThreadSkeleton = memo<{ count?: number }>(({ count = 3 }) => (
  <div className="space-y-2">
    {Array.from({ length: count }).map((_, i) => (
      <CommentSkeleton key={i} depth={i % 2} />
    ))}
  </div>
));
CommentThreadSkeleton.displayName = 'CommentThreadSkeleton';

/**
 * Notification skeleton
 */
export const NotificationSkeleton = memo(() => (
  <div className="flex gap-3 p-3 border-b border-terminal-dim/20">
    <SkeletonBase className="w-8 h-8 rounded" />
    <div className="flex-1 space-y-2">
      <SkeletonBase className="w-3/4 h-3" />
      <SkeletonBase className="w-1/2 h-3" />
      <SkeletonBase className="w-16 h-2" />
    </div>
  </div>
));
NotificationSkeleton.displayName = 'NotificationSkeleton';

/**
 * Notification list skeleton
 */
export const NotificationListSkeleton = memo<{ count?: number }>(({ count = 5 }) => (
  <div>
    {Array.from({ length: count }).map((_, i) => (
      <NotificationSkeleton key={i} />
    ))}
  </div>
));
NotificationListSkeleton.displayName = 'NotificationListSkeleton';

/**
 * DM conversation skeleton
 */
export const DMConversationSkeleton = memo(() => (
  <div className="p-4 space-y-4">
    {/* Incoming message */}
    <div className="flex gap-2">
      <SkeletonBase className="w-8 h-8 rounded-full" />
      <div className="space-y-1">
        <SkeletonBase className="w-48 h-12 rounded-lg" />
        <SkeletonBase className="w-12 h-2" />
      </div>
    </div>
    
    {/* Outgoing message */}
    <div className="flex gap-2 justify-end">
      <div className="space-y-1 items-end">
        <SkeletonBase className="w-40 h-8 rounded-lg" />
        <SkeletonBase className="w-12 h-2 ml-auto" />
      </div>
    </div>
    
    {/* Another incoming */}
    <div className="flex gap-2">
      <SkeletonBase className="w-8 h-8 rounded-full" />
      <div className="space-y-1">
        <SkeletonBase className="w-56 h-16 rounded-lg" />
        <SkeletonBase className="w-12 h-2" />
      </div>
    </div>
  </div>
));
DMConversationSkeleton.displayName = 'DMConversationSkeleton';

/**
 * Board card skeleton
 */
export const BoardCardSkeleton = memo(() => (
  <div className="border border-terminal-dim/30 p-3 space-y-2">
    <div className="flex justify-between">
      <SkeletonBase className="w-24 h-5" />
      <SkeletonBase className="w-16 h-4" />
    </div>
    <SkeletonBase className="w-full h-3" />
    <div className="flex gap-2">
      <SkeletonBase className="w-12 h-3" />
      <SkeletonBase className="w-16 h-3" />
    </div>
  </div>
));
BoardCardSkeleton.displayName = 'BoardCardSkeleton';

/**
 * Board list skeleton
 */
export const BoardListSkeleton = memo<{ count?: number }>(({ count = 4 }) => (
  <div className="space-y-2">
    {Array.from({ length: count }).map((_, i) => (
      <BoardCardSkeleton key={i} />
    ))}
  </div>
));
BoardListSkeleton.displayName = 'BoardListSkeleton';

/**
 * Search result skeleton
 */
export const SearchResultSkeleton = memo(() => (
  <div className="border-b border-terminal-dim/20 p-3 space-y-2">
    <SkeletonBase className="w-3/4 h-4" />
    <SkeletonBase className="w-full h-3" />
    <div className="flex gap-2">
      <SkeletonBase className="w-16 h-3" />
      <SkeletonBase className="w-12 h-3" />
    </div>
  </div>
));
SearchResultSkeleton.displayName = 'SearchResultSkeleton';

/**
 * User profile skeleton
 */
export const UserProfileSkeleton = memo(() => (
  <div className="border-2 border-terminal-dim/30 p-6 space-y-4">
    <div className="flex gap-4">
      <SkeletonBase className="w-16 h-16 rounded" />
      <div className="flex-1 space-y-2">
        <SkeletonBase className="w-32 h-6" />
        <SkeletonBase className="w-48 h-3" />
        <SkeletonBase className="w-full h-12" />
      </div>
    </div>
    <div className="flex gap-4">
      <SkeletonBase className="w-20 h-4" />
      <SkeletonBase className="w-24 h-4" />
      <SkeletonBase className="w-20 h-4" />
    </div>
  </div>
));
UserProfileSkeleton.displayName = 'UserProfileSkeleton';

/**
 * Full page loading
 */
export const PageSkeleton = memo<{ title?: string }>(({ title }) => (
  <div className="space-y-6 animate-fade-in">
    {title && (
      <div className="flex items-center gap-2 text-terminal-dim">
        <div className="w-4 h-4 border border-terminal-dim rounded-full animate-spin border-t-transparent" />
        <span className="text-sm uppercase tracking-wider">{title}</span>
      </div>
    )}
    <FeedSkeleton count={3} />
  </div>
));
PageSkeleton.displayName = 'PageSkeleton';

/**
 * Inline loading spinner
 */
export const InlineSpinner = memo<{ size?: number; className?: string }>(({ 
  size = 16, 
  className = '' 
}) => (
  <div 
    className={`inline-block border border-terminal-dim rounded-full animate-spin border-t-transparent ${className}`}
    style={{ width: size, height: size }}
  />
));
InlineSpinner.displayName = 'InlineSpinner';

/**
 * Loading text with dots animation
 */
export const LoadingText = memo<{ text?: string }>(({ text = 'Loading' }) => (
  <span className="text-terminal-dim">
    {text}
    <span className="animate-pulse">...</span>
  </span>
));
LoadingText.displayName = 'LoadingText';

/**
 * Loading phase indicator for multi-step loading processes
 */
export type LoadingPhase = 'connecting' | 'posts' | 'reactions' | 'profiles' | 'complete';

const PHASE_LABELS: Record<LoadingPhase, { label: string; description: string }> = {
  connecting: { label: 'RELAY_LINK', description: 'Connecting to relays...' },
  posts: { label: 'FETCH_POSTS', description: 'Loading posts...' },
  reactions: { label: 'FETCH_VOTES', description: 'Fetching reactions...' },
  profiles: { label: 'FETCH_META', description: 'Loading profiles...' },
  complete: { label: 'READY', description: 'Feed loaded' },
};

const PHASE_ORDER: LoadingPhase[] = ['connecting', 'posts', 'reactions', 'profiles', 'complete'];

export const LoadingPhaseIndicator = memo<{
  currentPhase: LoadingPhase;
  className?: string;
}>(({ currentPhase, className = '' }) => {
  const currentIndex = PHASE_ORDER.indexOf(currentPhase);
  const progress = ((currentIndex + 1) / PHASE_ORDER.length) * 100;

  return (
    <div className={`border border-terminal-dim bg-terminal-bg p-4 ${className}`}>
      {/* Terminal-style header */}
      <div className="flex items-center gap-2 mb-3 text-xs text-terminal-dim">
        <div className="w-2 h-2 rounded-full bg-terminal-text animate-pulse" />
        <span className="uppercase tracking-wider">SYSTEM_INIT</span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-terminal-dim/20 mb-3 overflow-hidden">
        <div
          className="h-full bg-terminal-text transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Phase list */}
      <div className="space-y-1 font-mono text-xs">
        {PHASE_ORDER.slice(0, -1).map((phase, index) => {
          const isActive = phase === currentPhase;
          const isComplete = index < currentIndex;

          return (
            <div
              key={phase}
              className={`flex items-center gap-2 transition-colors ${
                isComplete ? 'text-terminal-text' :
                isActive ? 'text-terminal-text' :
                'text-terminal-dim/50'
              }`}
            >
              <span className="w-4 text-center">
                {isComplete ? '✓' : isActive ? '>' : ' '}
              </span>
              <span className={isActive ? 'animate-pulse' : ''}>
                {PHASE_LABELS[phase].label}
              </span>
              {isActive && (
                <span className="text-terminal-dim ml-auto">
                  {PHASE_LABELS[phase].description}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
LoadingPhaseIndicator.displayName = 'LoadingPhaseIndicator';

/**
 * Compact loading phase for inline display
 */
export const LoadingPhaseCompact = memo<{
  currentPhase: LoadingPhase;
}>(({ currentPhase }) => {
  const phaseInfo = PHASE_LABELS[currentPhase];
  const currentIndex = PHASE_ORDER.indexOf(currentPhase);
  const progress = Math.round(((currentIndex + 1) / PHASE_ORDER.length) * 100);

  return (
    <div className="flex items-center gap-2 text-xs text-terminal-dim">
      <InlineSpinner size={12} />
      <span className="uppercase">{phaseInfo.label}</span>
      <span className="text-terminal-dim/50">[{progress}%]</span>
    </div>
  );
});
LoadingPhaseCompact.displayName = 'LoadingPhaseCompact';

export default {
  PostSkeleton,
  FeedSkeleton,
  CommentSkeleton,
  CommentThreadSkeleton,
  NotificationSkeleton,
  NotificationListSkeleton,
  DMConversationSkeleton,
  BoardCardSkeleton,
  BoardListSkeleton,
  SearchResultSkeleton,
  UserProfileSkeleton,
  PageSkeleton,
  InlineSpinner,
  LoadingText,
  LoadingPhaseIndicator,
  LoadingPhaseCompact,
};
