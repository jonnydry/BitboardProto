import React, { createContext, useContext, useState, useMemo, useCallback, useRef } from 'react';
import type { Post, SortMode, BoardType, UserState, Board } from '../../../types';

// LRU Cache configuration
const MAX_POSTS_IN_MEMORY = 500;
const MIN_POSTS_TO_KEEP = 100;

interface PostsContextType {
  // State
  posts: Post[];

  // Computed values
  postsById: Map<string, Post>;

  // Actions
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  markPostAccessed: (postId: string) => void;
  selectedPostId: string | null;
  setSelectedPostId: (postId: string | null) => void;
}

const PostsContext = createContext<PostsContextType | null>(null);

export const PostsProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  
  // Track post access times for LRU eviction
  const postAccessTimes = useRef<Map<string, number>>(new Map());

  /**
   * Mark a post as accessed (for LRU cache)
   */
  const markPostAccessed = useCallback((postId: string) => {
    postAccessTimes.current.set(postId, Date.now());
  }, []);

  /**
   * Wrap setPosts to enforce LRU cache limit
   */
  const setPostsWithLRU = useCallback((updater: React.SetStateAction<Post[]>) => {
    setPosts((prevPosts) => {
      const newPosts = typeof updater === 'function' ? updater(prevPosts) : updater;

      // If we're under the limit, no eviction needed
      if (newPosts.length <= MAX_POSTS_IN_MEMORY) {
        return newPosts;
      }

      console.log(`[PostsContext] LRU eviction triggered: ${newPosts.length} posts -> ${MAX_POSTS_IN_MEMORY}`);

      // Sort posts by access time (most recent first)
      const postsWithScore = newPosts.map((post) => ({
        post,
        accessTime: postAccessTimes.current.get(post.id) ?? post.timestamp,
        isSelected: post.id === selectedPostId,
      }));

      // Sort: selected post first, then by access time, then by timestamp
      postsWithScore.sort((a, b) => {
        if (a.isSelected && !b.isSelected) return -1;
        if (!a.isSelected && b.isSelected) return 1;
        if (a.accessTime !== b.accessTime) return b.accessTime - a.accessTime;
        return b.post.timestamp - a.post.timestamp;
      });

      // Keep the most recent MAX_POSTS_IN_MEMORY posts
      const evictedPosts = postsWithScore.slice(MAX_POSTS_IN_MEMORY);
      const keptPosts = postsWithScore.slice(0, MAX_POSTS_IN_MEMORY).map((item) => item.post);

      // Clean up access times for evicted posts
      for (const item of evictedPosts) {
        postAccessTimes.current.delete(item.post.id);
      }

      return keptPosts;
    });
  }, [selectedPostId]);

  const postsById = useMemo(() => {
    const map = new Map<string, Post>();
    posts.forEach(p => map.set(p.id, p));
    return map;
  }, [posts]);

  // Note: filteredPosts and sortedPosts are now computed in AppProviderInternal
  // to avoid prop drilling and circular dependencies

  const contextValue: PostsContextType = {
    posts,
    postsById,
    setPosts: setPostsWithLRU,
    markPostAccessed,
    selectedPostId,
    setSelectedPostId,
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