import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Post } from '../../types';
import { usePostStore } from '../../stores/postStore';

vi.mock('../../services/loggingService', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Test helper: derive a Map from the current posts list. Replaces the removed
// `getPostsById()` method on the store (it was unsafe to use as a Zustand
// selector because it created a fresh Map on every call). Production code
// should derive this with useMemo at the call site instead.
const buildPostsById = (posts: Post[]): Map<string, Post> => {
  const map = new Map<string, Post>();
  posts.forEach((post) => map.set(post.id, post));
  return map;
};

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

describe('postStore', () => {
  beforeEach(() => {
    usePostStore.setState({
      posts: [],
      selectedPostId: null,
      postAccessTimes: new Map(),
    });
    vi.clearAllMocks();
  });

  describe('basic operations', () => {
    it('initializes with empty posts', () => {
      const state = usePostStore.getState();
      expect(state.posts).toEqual([]);
      expect(buildPostsById(state.posts).size).toBe(0);
    });

    it('adds posts via setPosts', () => {
      usePostStore.getState().setPosts([createMockPost('1'), createMockPost('2')]);

      const state = usePostStore.getState();
      expect(state.posts).toHaveLength(2);
      expect(buildPostsById(state.posts).size).toBe(2);
    });

    it('gets posts by id', () => {
      usePostStore.getState().setPosts([createMockPost('test-id')]);

      const retrieved = buildPostsById(usePostStore.getState().posts).get('test-id');
      expect(retrieved?.id).toBe('test-id');
    });

    it('checks if a post exists', () => {
      usePostStore.getState().setPosts([createMockPost('exists')]);

      const postsById = buildPostsById(usePostStore.getState().posts);
      expect(postsById.has('exists')).toBe(true);
      expect(postsById.has('does-not-exist')).toBe(false);
    });
  });

  describe('post selection', () => {
    it('tracks selected post', () => {
      const store = usePostStore.getState();
      store.setPosts([createMockPost('selected')]);
      store.setSelectedPostId('selected');

      expect(usePostStore.getState().selectedPostId).toBe('selected');
    });

    it('clears selected post', () => {
      const store = usePostStore.getState();
      store.setSelectedPostId('test');
      store.setSelectedPostId(null);

      expect(usePostStore.getState().selectedPostId).toBeNull();
    });
  });

  describe('LRU cache', () => {
    it('marks posts as accessed', () => {
      const store = usePostStore.getState();
      store.setPosts([createMockPost('1')]);
      store.markPostAccessed('1');

      expect(usePostStore.getState().postAccessTimes.has('1')).toBe(true);
      expect(buildPostsById(usePostStore.getState().posts).has('1')).toBe(true);
    });

    it('does not auto-mark access times when reading posts (no direct state mutation)', () => {
      usePostStore.getState().setPosts([createMockPost('1')]);

      const post = buildPostsById(usePostStore.getState().posts).get('1');

      expect(post).toBeDefined();
      // Reading the map should NOT auto-mark access times (that was a mutation bug).
      // Access times are now only updated via explicit markPostAccessed calls.
      expect(usePostStore.getState().postAccessTimes.has('1')).toBe(false);
    });

    it('evicts old posts when over limit', () => {
      const manyPosts: Post[] = [];
      for (let i = 0; i < 550; i++) {
        manyPosts.push(createMockPost(`post-${i}`, Date.now() - (550 - i) * 1000));
      }

      usePostStore.getState().setPosts(manyPosts);

      expect(usePostStore.getState().posts.length).toBeLessThanOrEqual(500);
    });

    it('protects selected post from eviction', () => {
      const store = usePostStore.getState();
      store.setSelectedPostId('important');

      const manyPosts: Post[] = [createMockPost('important', Date.now() - 10000000)];
      for (let i = 0; i < 550; i++) {
        manyPosts.push(createMockPost(`post-${i}`, Date.now() - (550 - i) * 1000));
      }

      store.setPosts(manyPosts);

      expect(buildPostsById(usePostStore.getState().posts).has('important')).toBe(true);
    });
  });

  describe('map-like interface', () => {
    it('supports iteration', () => {
      usePostStore
        .getState()
        .setPosts([createMockPost('1'), createMockPost('2'), createMockPost('3')]);

      const keys = Array.from(buildPostsById(usePostStore.getState().posts).keys());
      expect(keys).toHaveLength(3);
      expect(keys).toContain('1');
      expect(keys).toContain('2');
      expect(keys).toContain('3');
    });

    it('supports forEach', () => {
      usePostStore.getState().setPosts([createMockPost('a'), createMockPost('b')]);

      const ids: string[] = [];
      buildPostsById(usePostStore.getState().posts).forEach((post) => {
        ids.push(post.id);
      });

      expect(ids).toHaveLength(2);
      expect(ids).toContain('a');
      expect(ids).toContain('b');
    });

    it('reports correct size', () => {
      usePostStore.getState().setPosts([createMockPost('1'), createMockPost('2')]);

      expect(buildPostsById(usePostStore.getState().posts).size).toBe(2);
    });
  });
});
