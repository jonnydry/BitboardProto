import { describe, it, expect, beforeEach } from 'vitest';
import type { Post } from '../../types';
import {
  ownPostsCacheReadAll,
  ownPostsCacheRemove,
  ownPostsCacheUpsert,
  postOutboxStorageReadAll,
  postOutboxStorageRemoveMatching,
  postOutboxStorageUpsert,
} from '../../services/postOutboxStorage';

const basePost = (over: Partial<Post>): Post => ({
  id: 'local-1',
  boardId: 'b-tech',
  title: 'T',
  content: 'C',
  author: 'a',
  authorPubkey: 'p'.repeat(64),
  timestamp: Date.now(),
  score: 0,
  commentCount: 0,
  comments: [],
  upvotes: 0,
  downvotes: 0,
  tags: [],
  ...over,
});

describe('postOutboxStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists pending and removes after sync', () => {
    const pending = basePost({ syncStatus: 'pending' });
    postOutboxStorageUpsert(pending);
    expect(postOutboxStorageReadAll()).toHaveLength(1);

    postOutboxStorageRemoveMatching('local-1', 'eventhex');
    expect(postOutboxStorageReadAll()).toHaveLength(0);
  });

  it('replaces failed state on upsert', () => {
    postOutboxStorageUpsert(basePost({ syncStatus: 'pending' }));
    postOutboxStorageUpsert(basePost({ syncStatus: 'failed', syncError: 'relay down' }));
    const all = postOutboxStorageReadAll();
    expect(all).toHaveLength(1);
    expect(all[0].syncStatus).toBe('failed');
    expect(all[0].syncError).toBe('relay down');
  });

  it('persists synced own posts by nostr id and removes them by either id', () => {
    ownPostsCacheUpsert(basePost({ id: 'event-1', nostrEventId: 'event-1', syncStatus: 'synced' }));
    ownPostsCacheUpsert(
      basePost({ id: 'local-shadow', nostrEventId: 'event-1', syncStatus: 'synced' }),
    );

    const cached = ownPostsCacheReadAll();
    expect(cached).toHaveLength(1);
    expect(cached[0].nostrEventId).toBe('event-1');

    ownPostsCacheRemove('local-shadow', 'event-1');
    expect(ownPostsCacheReadAll()).toHaveLength(0);
  });

  it('prunes expired outbox and own-post cache entries on read', () => {
    const staleTimestamp = Date.now() - 40 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      'bitboard_post_outbox_v1',
      JSON.stringify([
        basePost({ id: 'stale-outbox', timestamp: staleTimestamp, syncStatus: 'failed' }),
      ]),
    );
    localStorage.setItem(
      'bitboard_own_posts_v1',
      JSON.stringify([
        basePost({
          id: 'stale-own',
          nostrEventId: 'stale-own',
          timestamp: staleTimestamp,
          syncStatus: 'synced',
        }),
      ]),
    );

    expect(postOutboxStorageReadAll()).toEqual([]);
    expect(ownPostsCacheReadAll()).toEqual([]);
  });
});
