import { describe, expect, it } from 'vitest';
import type { Post } from '../../types';
import {
  appendUniqueNostrPosts,
  getOldestPostTimestamp,
  mergeAuthoritativeNostrPosts,
} from '../../services/nostr/nostrFeedPosts';

function makePost(overrides: Partial<Post>): Post {
  return {
    id: 'post-1',
    boardId: 'b-tech',
    title: 'Title',
    content: 'Content',
    author: 'alice',
    authorPubkey: 'a'.repeat(64),
    timestamp: 100,
    score: 1,
    commentCount: 0,
    comments: [],
    upvotes: 1,
    downvotes: 0,
    tags: [],
    ...overrides,
  };
}

describe('nostrFeedPosts helpers', () => {
  it('merges authoritative nostr posts without dropping local sync status', () => {
    const existing = [
      makePost({ id: 'evt-1', nostrEventId: 'evt-1', score: 1, syncStatus: 'failed' }),
      makePost({ id: 'local-1', title: 'Draft only', nostrEventId: undefined }),
    ];
    const fetched = [
      makePost({ id: 'evt-1', nostrEventId: 'evt-1', score: 99, upvotes: 99, downvotes: 0 }),
      makePost({ id: 'evt-2', nostrEventId: 'evt-2', title: 'Fresh' }),
    ];

    const merged = mergeAuthoritativeNostrPosts(existing, fetched);

    expect(merged).toHaveLength(3);
    expect(merged[0].id).toBe('evt-2');
    expect(merged[1].score).toBe(99);
    expect(merged[1].syncStatus).toBe('failed');
    expect(merged[2].id).toBe('local-1');
  });

  it('appends only new nostr posts during pagination', () => {
    const existing = [
      makePost({ id: 'evt-1', nostrEventId: 'evt-1' }),
      makePost({ id: 'evt-2', nostrEventId: 'evt-2' }),
    ];
    const paged = [
      makePost({ id: 'evt-2', nostrEventId: 'evt-2' }),
      makePost({ id: 'evt-3', nostrEventId: 'evt-3' }),
    ];

    const merged = appendUniqueNostrPosts(existing, paged);

    expect(merged.map((post) => post.id)).toEqual(['evt-1', 'evt-2', 'evt-3']);
  });

  it('computes oldest post timestamp safely', () => {
    expect(getOldestPostTimestamp([])).toBeNull();
    expect(
      getOldestPostTimestamp([
        makePost({ id: 'a', timestamp: 300 }),
        makePost({ id: 'b', timestamp: 100 }),
        makePost({ id: 'c', timestamp: 200 }),
      ]),
    ).toBe(100);
  });
});
