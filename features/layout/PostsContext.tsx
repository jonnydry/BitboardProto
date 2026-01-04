import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { Post, UserState } from '../../types';
import { useCommentsLoader } from '../../hooks/useCommentsLoader';
import { useVoting } from '../../hooks/useVoting';
import { useCommentVoting } from '../../hooks/useCommentVoting';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { useAppEventHandlers } from './useAppEventHandlers';
import { StorageKeys } from '../../config';
import { nostrService } from '../../services/nostrService';

interface PostsContextType {
  // Posts data
  posts: Post[];
  selectedPost: Post | null;
  selectedBitId: string | null;
  filteredPosts: Post[];
  sortedPosts: Post[];
  hasMorePosts: boolean;
  oldestTimestamp: number | null;
  isLoadingMore: boolean;

  // Actions
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  setSelectedBitId: (id: string | null) => void;
  setHasMorePosts: (hasMore: boolean) => void;
  setOldestTimestamp: (timestamp: number | null) => void;

  // Event handlers
  handleVote: (postId: string, direction: 'up' | 'down') => void;
  handleCommentVote: (postId: string, commentId: string, direction: 'up' | 'down') => void;
  handleComment: (postId: string, content: string, parentCommentId?: string) => Promise<void>;
  handleEditComment: (postId: string, commentId: string, nextContent: string) => Promise<void>;
  handleDeleteComment: (postId: string, commentId: string) => Promise<void>;
  handleViewBit: (postId: string) => void;

  // Hooks
  loaderRef: React.RefObject<HTMLDivElement>;
}

const PostsContext = createContext<PostsContextType | null>(null);

interface PostsProviderProps {
  children: React.ReactNode;
  userState: UserState;
  activeBoardId: string | null;
  feedFilter: 'all' | 'topic' | 'location';
  searchQuery: string;
  sortMode: any;
  viewMode: any;
}

export const PostsProvider: React.FC<PostsProviderProps> = ({
  children,
  userState,
  activeBoardId,
  feedFilter: _feedFilter,
  searchQuery,
  sortMode,
  viewMode,
}) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedBitId, setSelectedBitId] = useState<string | null>(null);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [oldestTimestamp, setOldestTimestamp] = useState<number | null>(null);

  // Get relay hint helper (extracted from AppContext)
  const getRelayHint = useCallback(() => {
    const connected = nostrService.getConnectedCount();
    const total = nostrService.getRelays().length;
    const state = connected > 0 ? 'Some relays are reachable.' : 'No relays appear reachable.';
    return `${state} Relays: ${connected}/${total}. Open relays to adjust/retry.`;
  }, []);

  // Load cached posts on mount
  useEffect(() => {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(StorageKeys.POSTS_CACHE);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { savedAt?: number; posts?: unknown };
      if (!parsed || !Array.isArray(parsed.posts)) return;

      // Filter for valid posts
      const cachedPosts = parsed.posts.filter((p: any) =>
        p && typeof p.id === 'string' && typeof p.title === 'string'
      );
      setPosts(cachedPosts);
    } catch (error) {
      console.error('[PostsContext] Failed to load cached posts:', error);
    }
  }, []);

  // Save posts to cache when they change
  useEffect(() => {
    if (posts.length === 0) return;
    const timeoutId = window.setTimeout(() => {
      try {
        if (typeof localStorage === 'undefined') return;
        const postsToStore = posts.slice(0, 200); // Keep only recent posts
        localStorage.setItem(
          StorageKeys.POSTS_CACHE,
          JSON.stringify({ savedAt: Date.now(), posts: postsToStore })
        );
      } catch (error) {
        console.error('[PostsContext] Failed to cache posts:', error);
      }
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [posts]);

  // Computed values
  const filteredPosts = useMemo(() => {
    let result = posts;

    // Filter by board
    if (activeBoardId) {
      result = result.filter(p => p.boardId === activeBoardId);
    } else {
      // Global feed filtering
      result = result.filter(_p => {
        // Skip posts from boards that don't exist or aren't public
        // This will be enhanced when boards context is available
        return true; // For now, show all posts
      });
    }

    // Filter muted users
    if (userState.mutedPubkeys && userState.mutedPubkeys.length > 0) {
      const mutedSet = new Set(userState.mutedPubkeys);
      result = result.filter(p => !p.authorPubkey || !mutedSet.has(p.authorPubkey));
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((p) => {
        const inPost =
          p.title.toLowerCase().includes(query) ||
          p.content.toLowerCase().includes(query) ||
          p.author.toLowerCase().includes(query) ||
          p.tags.some((tag) => tag.toLowerCase().includes(query));

        if (inPost) return true;

        // Also search comments
        return p.comments.some(
          (c) =>
            c.author.toLowerCase().includes(query) ||
            c.content.toLowerCase().includes(query)
        );
      });
    }

    return result;
  }, [posts, activeBoardId, userState.mutedPubkeys, searchQuery]);

  const sortedPosts = useMemo(() => {
    const sorted = [...filteredPosts];

    switch (sortMode) {
      case 'NEWEST':
        return sorted.sort((a, b) => b.timestamp - a.timestamp);
      case 'OLDEST':
        return sorted.sort((a, b) => a.timestamp - b.timestamp);
      case 'TRENDING': {
        const now = Date.now();
        const HOUR = 1000 * 60 * 60;
        return sorted.sort((a, b) => {
          const ageA = (now - a.timestamp) / HOUR;
          const ageB = (now - b.timestamp) / HOUR;
          const trendA = (a.score + a.commentCount * 2) / Math.pow(ageA + 2, 1.5);
          const trendB = (b.score + b.commentCount * 2) / Math.pow(ageB + 2, 1.5);
          return trendB - trendA;
        });
      }
      case 'COMMENTS':
        return sorted.sort((a, b) => b.commentCount - a.commentCount);
      case 'TOP':
      default:
        return sorted.sort((a, b) => b.score - a.score);
    }
  }, [filteredPosts, sortMode]);

  const selectedPost = useMemo(() => {
    return selectedBitId ? posts.find(p => p.id === selectedBitId) || null : null;
  }, [selectedBitId, posts]);

  // Hooks
  useCommentsLoader({ selectedBitId, postsById: new Map(posts.map(p => [p.id, p])), setPosts });

  const { handleVote } = useVoting({
    postsById: new Map(posts.map(p => [p.id, p])),
    userState,
    setUserState: () => {}, // This will be passed down from parent
    setPosts
  });

  const { handleCommentVote } = useCommentVoting({
    postsById: new Map(posts.map(p => [p.id, p])),
    userState,
    setUserState: () => {}, // This will be passed down from parent
    setPosts
  });

  // Event handlers placeholder - will be implemented when we split useAppEventHandlers
  const eventHandlers = useAppEventHandlers({
    posts,
    setPosts,
    boards: [], // Will be passed from boards context
    setBoards: () => {},
    boardsById: new Map(),
    postsById: new Map(posts.map(p => [p.id, p])),
    userState,
    setUserState: () => {},
    setViewMode: () => {},
    setSelectedBitId,
    setActiveBoardId: () => {},
    setLocationBoards: () => {},
    setProfileUser: () => {},
    setEditingPostId: () => {},
    getRelayHint,
    setSearchQuery: () => {},
    oldestTimestamp,
    hasMorePosts,
    setOldestTimestamp,
    setHasMorePosts,
    locationBoards: [], // Will be passed from boards context
  });

  const { loaderRef, isLoading } = useInfiniteScroll(
    eventHandlers.loadMorePosts,
    hasMorePosts && viewMode === 'FEED',
    { threshold: 300 }
  );

  const contextValue: PostsContextType = {
    // Posts data
    posts,
    selectedPost,
    selectedBitId,
    filteredPosts,
    sortedPosts,
    hasMorePosts,
    oldestTimestamp,
    isLoadingMore: isLoading,

    // Actions
    setPosts,
    setSelectedBitId,
    setHasMorePosts,
    setOldestTimestamp,

    // Event handlers
    handleVote,
    handleCommentVote,
    handleComment: eventHandlers.handleComment,
    handleEditComment: eventHandlers.handleEditComment,
    handleDeleteComment: eventHandlers.handleDeleteComment,
    handleViewBit: eventHandlers.handleViewBit,

    // Hooks
    loaderRef,
  };

  return (
    <PostsContext.Provider value={contextValue}>
      {children}
    </PostsContext.Provider>
  );
};

export const usePosts = () => {
  const context = useContext(PostsContext);
  if (!context) {
    throw new Error('usePosts must be used within a PostsProvider');
  }
  return context;
};
