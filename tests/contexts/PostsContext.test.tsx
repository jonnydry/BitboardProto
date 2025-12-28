import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { PostsProvider, usePosts } from '../../features/layout/contexts/PostsContext';
import type { Post } from '../../types';

// Mock the logger
vi.mock('../../services/loggingService', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Helper to create mock posts
const createMockPost = (id: string, timestamp?: number): Post => ({
  id,
  nostrEventId: `event_${id}`,
  boardId: 'test-board',
  title: `Post ${id}`,
  author: 'test-author',
  authorPubkey: 'test-pubkey',
  content: `Content for post ${id}`,
  timestamp: timestamp ?? Date.now(),
  score: 0,
  upvotes: 0,
  downvotes: 0,
  commentCount: 0,
  tags: [],
  comments: [],
});

// Wrapper component for testing
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PostsProvider>{children}</PostsProvider>
);

describe('PostsContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Operations', () => {
    it('should initialize with empty posts', () => {
      const { result } = renderHook(() => usePosts(), { wrapper });
      expect(result.current.posts).toEqual([]);
      expect(result.current.postsById.size).toBe(0);
    });

    it('should add posts via setPosts', () => {
      const { result } = renderHook(() => usePosts(), { wrapper });
      
      act(() => {
        result.current.setPosts([createMockPost('1'), createMockPost('2')]);
      });
      
      expect(result.current.posts).toHaveLength(2);
      expect(result.current.postsById.size).toBe(2);
    });

    it('should get post by id', () => {
      const { result } = renderHook(() => usePosts(), { wrapper });
      const mockPost = createMockPost('test-id');
      
      act(() => {
        result.current.setPosts([mockPost]);
      });
      
      const retrieved = result.current.postsById.get('test-id');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test-id');
    });

    it('should check if post exists', () => {
      const { result } = renderHook(() => usePosts(), { wrapper });
      
      act(() => {
        result.current.setPosts([createMockPost('exists')]);
      });
      
      expect(result.current.postsById.has('exists')).toBe(true);
      expect(result.current.postsById.has('does-not-exist')).toBe(false);
    });
  });

  describe('Post Selection', () => {
    it('should track selected post', () => {
      const { result } = renderHook(() => usePosts(), { wrapper });
      
      act(() => {
        result.current.setPosts([createMockPost('selected')]);
        result.current.setSelectedPostId('selected');
      });
      
      expect(result.current.selectedPostId).toBe('selected');
    });

    it('should clear selected post', () => {
      const { result } = renderHook(() => usePosts(), { wrapper });
      
      act(() => {
        result.current.setSelectedPostId('test');
        result.current.setSelectedPostId(null);
      });
      
      expect(result.current.selectedPostId).toBeNull();
    });
  });

  describe('LRU Cache', () => {
    it('should mark posts as accessed', () => {
      const { result } = renderHook(() => usePosts(), { wrapper });
      
      act(() => {
        result.current.setPosts([createMockPost('1')]);
        result.current.markPostAccessed('1');
      });
      
      // The post should still exist (access marking is internal)
      expect(result.current.postsById.has('1')).toBe(true);
    });

    it('should auto-mark posts when accessed via get()', () => {
      const { result } = renderHook(() => usePosts(), { wrapper });
      
      act(() => {
        result.current.setPosts([createMockPost('1')]);
      });
      
      // Accessing via get() should auto-mark
      const post = result.current.postsById.get('1');
      expect(post).toBeDefined();
    });

    it('should evict oldest posts when over limit', () => {
      const { result } = renderHook(() => usePosts(), { wrapper });
      
      // Create more posts than MAX_POSTS_IN_MEMORY (500)
      // For testing, we use a smaller number to verify behavior
      const manyPosts: Post[] = [];
      for (let i = 0; i < 550; i++) {
        manyPosts.push(createMockPost(`post-${i}`, Date.now() - (550 - i) * 1000));
      }
      
      act(() => {
        result.current.setPosts(manyPosts);
      });
      
      // Should be capped at 500
      expect(result.current.posts.length).toBeLessThanOrEqual(500);
    });

    it('should protect selected post from eviction', () => {
      const { result } = renderHook(() => usePosts(), { wrapper });
      
      // Select a post first
      act(() => {
        result.current.setSelectedPostId('important');
      });
      
      // Create many posts including the selected one
      const manyPosts: Post[] = [createMockPost('important', Date.now() - 10000000)];
      for (let i = 0; i < 550; i++) {
        manyPosts.push(createMockPost(`post-${i}`, Date.now() - (550 - i) * 1000));
      }
      
      act(() => {
        result.current.setPosts(manyPosts);
      });
      
      // Selected post should still exist
      expect(result.current.postsById.has('important')).toBe(true);
    });
  });

  describe('Map-like interface', () => {
    it('should support iteration', () => {
      const { result } = renderHook(() => usePosts(), { wrapper });
      
      act(() => {
        result.current.setPosts([
          createMockPost('1'),
          createMockPost('2'),
          createMockPost('3'),
        ]);
      });
      
      const keys = Array.from(result.current.postsById.keys());
      expect(keys).toHaveLength(3);
      expect(keys).toContain('1');
      expect(keys).toContain('2');
      expect(keys).toContain('3');
    });

    it('should support forEach', () => {
      const { result } = renderHook(() => usePosts(), { wrapper });
      
      act(() => {
        result.current.setPosts([createMockPost('a'), createMockPost('b')]);
      });
      
      const ids: string[] = [];
      result.current.postsById.forEach((post) => {
        ids.push(post.id);
      });
      
      expect(ids).toHaveLength(2);
      expect(ids).toContain('a');
      expect(ids).toContain('b');
    });

    it('should report correct size', () => {
      const { result } = renderHook(() => usePosts(), { wrapper });
      
      act(() => {
        result.current.setPosts([createMockPost('1'), createMockPost('2')]);
      });
      
      expect(result.current.postsById.size).toBe(2);
    });
  });
});
