import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Post } from '../types';
import { logger } from '../services/loggingService';

// LRU Cache configuration (preserved from PostsContext)
const MAX_POSTS_IN_MEMORY = 500;

interface PostState {
  // State
  posts: Post[];
  selectedPostId: string | null;
  postAccessTimes: Map<string, number>;

  // Actions
  setPosts: (posts: Post[] | ((prev: Post[]) => Post[])) => void;
  addPost: (post: Post) => void;
  updatePost: (id: string, updates: Partial<Post>) => void;
  setSelectedPostId: (id: string | null) => void;
  markPostAccessed: (id: string) => void;

  // Computed getter for postsById (Map-like interface)
  getPostsById: () => Map<string, Post>;
}

/**
 * Enforce LRU cache limit on posts array.
 * Returns both the trimmed posts array and a new access-times Map (no mutation).
 * Preserves selected post and most recently accessed posts.
 */
function enforceLRULimit(
  posts: Post[],
  postAccessTimes: Map<string, number>,
  selectedPostId: string | null,
): { posts: Post[]; postAccessTimes: Map<string, number> } {
  // If we're under the limit, no eviction needed
  if (posts.length <= MAX_POSTS_IN_MEMORY) {
    return { posts, postAccessTimes };
  }

  logger.debug(
    'postStore',
    `LRU eviction triggered: ${posts.length} posts -> ${MAX_POSTS_IN_MEMORY}`,
  );

  // Sort posts by access time (most recent first)
  const postsWithScore = posts.map((post) => ({
    post,
    accessTime: postAccessTimes.get(post.id) ?? post.timestamp,
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

  // Build a new Map without the evicted entries (never mutate the input Map)
  const newAccessTimes = new Map(postAccessTimes);
  for (const item of evictedPosts) {
    newAccessTimes.delete(item.post.id);
  }

  return { posts: keptPosts, postAccessTimes: newAccessTimes };
}

export const usePostStore = create<PostState>()(
  subscribeWithSelector((set, get) => ({
    posts: [],
    selectedPostId: null,
    postAccessTimes: new Map(),

    setPosts: (updater) => {
      // Wrap inside set() so get() snapshot is atomic with the subsequent write.
      set((state) => {
        const newPosts = typeof updater === 'function' ? updater(state.posts) : updater;
        const result = enforceLRULimit(newPosts, state.postAccessTimes, state.selectedPostId);
        return { posts: result.posts, postAccessTimes: result.postAccessTimes };
      });
    },

    addPost: (post) => {
      set((state) => {
        const newPosts = [...state.posts, post];
        const result = enforceLRULimit(newPosts, state.postAccessTimes, state.selectedPostId);
        return { posts: result.posts, postAccessTimes: result.postAccessTimes };
      });
    },

    updatePost: (id, updates) => {
      set((state) => {
        const newPosts = state.posts.map((post) =>
          post.id === id ? { ...post, ...updates } : post,
        );
        return { posts: newPosts };
      });
    },

    setSelectedPostId: (id) => {
      set({ selectedPostId: id });
    },

    markPostAccessed: (id) => {
      set((state) => {
        const newAccessTimes = new Map(state.postAccessTimes);
        newAccessTimes.set(id, Date.now());
        return { postAccessTimes: newAccessTimes };
      });
    },

    getPostsById: () => {
      const state = get();
      const map = new Map<string, Post>();
      state.posts.forEach((post) => {
        map.set(post.id, post);
      });
      return map;
    },
  })),
);

// Selective selectors prevent unnecessary re-renders
// NOTE: Do NOT call side-effects (like markPostAccessed) inside selectors.
// Selectors run on every state change; calling set() inside would cause infinite loops.
// Instead, call markPostAccessed from useEffect in the consuming component.
export const usePost = (id: string) =>
  usePostStore((state) => state.posts.find((p) => p.id === id) ?? null);

export const usePosts = () => usePostStore((state) => state.posts);

export const useSelectedPostId = () => usePostStore((state) => state.selectedPostId);

export const useSelectedPost = () =>
  usePostStore((state) => {
    if (!state.selectedPostId) return null;
    return state.posts.find((p) => p.id === state.selectedPostId) || null;
  });

export const usePostsByBoard = (boardId: string) =>
  usePostStore((state) => state.posts.filter((p) => p.boardId === boardId));
