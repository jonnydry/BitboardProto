import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Post } from '../../types';
import { ViewMode } from '../../types';

vi.mock('../../services/nostr/NostrService', () => ({
  nostrService: {
    buildPostDeleteEvent: vi.fn(() => ({})),
  },
}));

vi.mock('../../services/identityService', () => ({
  identityService: { signEvent: vi.fn(async () => ({})) },
}));

vi.mock('../../services/postOutboxStorage', () => ({
  postOutboxStorageRemoveMatching: vi.fn(),
  postOutboxStorageUpsert: vi.fn(),
  ownPostsCacheRemove: vi.fn(),
  ownPostsCacheUpsert: vi.fn(),
}));

vi.mock('../../services/bookmarkService', () => ({
  bookmarkService: { removeBookmark: vi.fn() },
}));

vi.mock('../../services/toastService', () => ({
  toastService: { push: vi.fn() },
}));

vi.mock('../../services/loggingService', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../services/seedRateLimiter', () => ({
  seedRateLimiter: {
    canSeed: vi.fn(() => ({ allowed: true, remaining: 5, resetAt: null })),
  },
}));

vi.mock('../../services/encryptedBoardService', () => ({
  encryptedBoardService: { encryptPost: vi.fn(), getBoardKey: vi.fn() },
}));

import { useAppPostMutationHandlers } from '../../features/layout/useAppPostMutationHandlers';
import { bookmarkService } from '../../services/bookmarkService';
import { ownPostsCacheRemove } from '../../services/postOutboxStorage';
import { postOutboxStorageRemoveMatching } from '../../services/postOutboxStorage';
import { toastService } from '../../services/toastService';

const makePost = (overrides: Partial<Post> = {}): Post => ({
  id: 'p1',
  boardId: 'b1',
  title: 'Test post',
  author: 'alice',
  authorPubkey: 'pub-1',
  content: 'hello',
  timestamp: 0,
  score: 0,
  commentCount: 0,
  tags: [],
  comments: [],
  upvotes: 0,
  downvotes: 0,
  nostrEventId: 'evt-1',
  ...overrides,
});

describe('useAppPostMutationHandlers.handleDeletePost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('removes a locally-owned post from the store and outbox', async () => {
    const setPosts = vi.fn();
    const setEditingPostId = vi.fn();
    const setViewMode = vi.fn();
    const postsById = new Map<string, Post>([['p1', makePost()]]);
    const boardsById = new Map<string, never>();

    const { result } = renderHook(() =>
      useAppPostMutationHandlers({
        boardsById: boardsById as never,
        postsById,
        userState: {
          username: 'alice',
          bits: 0,
          maxBits: 0,
          votedPosts: {},
          votedComments: {},
          hasIdentity: true,
          identity: {
            kind: 'local',
            pubkey: 'pub-1',
            npub: 'npub-1',
            displayName: 'Alice',
          },
        },
        setPosts,
        setViewMode,
        setEditingPostId,
        getRelayHint: () => '',
      }),
    );

    await act(async () => {
      await result.current.handleDeletePost('p1');
    });

    // post is filtered out of the store
    expect(setPosts).toHaveBeenCalled();
    const updater = setPosts.mock.calls[0]?.[0] as (prev: Post[]) => Post[];
    const result2 = updater([makePost(), makePost({ id: 'p2' })]);
    expect(result2).toHaveLength(1);
    expect(result2[0]?.id).toBe('p2');

    // outbox + bookmarks cleaned
    expect(postOutboxStorageRemoveMatching).toHaveBeenCalledWith('p1', 'evt-1');
    expect(ownPostsCacheRemove).toHaveBeenCalledWith('p1', 'evt-1');
    expect(bookmarkService.removeBookmark).toHaveBeenCalledWith('p1');

    // navigation reset
    expect(setEditingPostId).toHaveBeenCalledWith(null);
    expect(setViewMode).toHaveBeenCalledWith(ViewMode.FEED);

    // no error toast (we're owner; delete should succeed even though
    // publish would also try to run)
    expect(toastService.push).toHaveBeenCalled();
  });

  it("refuses to delete another user's post when an identity is present", async () => {
    const setPosts = vi.fn();
    const setEditingPostId = vi.fn();
    const setViewMode = vi.fn();
    const postsById = new Map<string, Post>([
      ['p1', makePost({ authorPubkey: 'other-pub', nostrEventId: 'evt-1' })],
    ]);
    const boardsById = new Map<string, never>();

    const { result } = renderHook(() =>
      useAppPostMutationHandlers({
        boardsById: boardsById as never,
        postsById,
        userState: {
          username: 'me',
          bits: 0,
          maxBits: 0,
          votedPosts: {},
          votedComments: {},
          hasIdentity: true,
          identity: {
            kind: 'local',
            pubkey: 'me-pub',
            npub: 'npub-me',
            displayName: 'Me',
          },
        },
        setPosts,
        setViewMode,
        setEditingPostId,
        getRelayHint: () => '',
      }),
    );

    await act(async () => {
      await result.current.handleDeletePost('p1');
    });

    // not-owner error toast is shown and post is NOT removed
    expect(toastService.push).toHaveBeenCalled();
    const toastCall = (toastService.push as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0]?.dedupeKey === 'delete-post-not-owner',
    );
    expect(toastCall).toBeTruthy();
    expect(setPosts).not.toHaveBeenCalled();
  });

  it('is a no-op for unknown post ids', async () => {
    const setPosts = vi.fn();
    const setEditingPostId = vi.fn();
    const setViewMode = vi.fn();
    const postsById = new Map<string, Post>();
    const boardsById = new Map<string, never>();

    const { result } = renderHook(() =>
      useAppPostMutationHandlers({
        boardsById: boardsById as never,
        postsById,
        userState: {
          username: 'me',
          bits: 0,
          maxBits: 0,
          votedPosts: {},
          votedComments: {},
          hasIdentity: false,
        },
        setPosts,
        setViewMode,
        setEditingPostId,
        getRelayHint: () => '',
      }),
    );

    await act(async () => {
      await result.current.handleDeletePost('missing');
    });

    expect(setPosts).not.toHaveBeenCalled();
    expect(setEditingPostId).not.toHaveBeenCalled();
    expect(setViewMode).not.toHaveBeenCalled();
  });
});
