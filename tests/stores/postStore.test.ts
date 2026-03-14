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
      expect(state.getPostsById().size).toBe(0);
    });

    it('adds posts via setPosts', () => {
      usePostStore.getState().setPosts([createMockPost('1'), createMockPost('2')]);

      const state = usePostStore.getState();
      expect(state.posts).toHaveLength(2);
      expect(state.getPostsById().size).toBe(2);
    });

    it('gets posts by id', () => {
      usePostStore.getState().setPosts([createMockPost('test-id')]);

      const retrieved = usePostStore.getState().getPostsById().get('test-id');
      expect(retrieved?.id).toBe('test-id');
    });

    it('checks if a post exists', () => {
      usePostStore.getState().setPosts([createMockPost('exists')]);

      const postsById = usePostStore.getState().getPostsById();
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
      expect(usePostStore.getState().getPostsById().has('1')).toBe(true);
    });

    it('auto-marks posts when accessed via getPostsById', () => {
      usePostStore.getState().setPosts([createMockPost('1')]);

      const post = usePostStore.getState().getPostsById().get('1');

      expect(post).toBeDefined();
      expect(usePostStore.getState().postAccessTimes.has('1')).toBe(true);
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

      expect(usePostStore.getState().getPostsById().has('important')).toBe(true);
    });
  });

  describe('map-like interface', () => {
    it('supports iteration', () => {
      usePostStore
        .getState()
        .setPosts([createMockPost('1'), createMockPost('2'), createMockPost('3')]);

      const keys = Array.from(usePostStore.getState().getPostsById().keys());
      expect(keys).toHaveLength(3);
      expect(keys).toContain('1');
      expect(keys).toContain('2');
      expect(keys).toContain('3');
    });

    it('supports forEach', () => {
      usePostStore.getState().setPosts([createMockPost('a'), createMockPost('b')]);

      const ids: string[] = [];
      usePostStore
        .getState()
        .getPostsById()
        .forEach((post) => {
          ids.push(post.id);
        });

      expect(ids).toHaveLength(2);
      expect(ids).toContain('a');
      expect(ids).toContain('b');
    });

    it('reports correct size', () => {
      usePostStore.getState().setPosts([createMockPost('1'), createMockPost('2')]);

      expect(usePostStore.getState().getPostsById().size).toBe(2);
    });
  });
});
