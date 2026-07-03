import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Post } from '../../types';

vi.mock('../../services/nostr/NostrService', () => {
  // Defer-forever promises make the hook stay in `isInitialLoading: true`
  // until the test unmounts. We don't need real fetch behaviour to assert
  // that the hook wires up correctly.
  const never = () => new Promise(() => {});
  return {
    nostrService: {
      fetchBoards: never,
      fetchPosts: never,
      fetchProfiles: never,
      subscribeToFeed: () => 'sub-feed',
      subscribeToPostEdits: () => 'sub-edits',
      unsubscribe: vi.fn(),
      cleanup: vi.fn(),
      isBitboardPostEvent: () => true,
      eventToBoard: () => ({}) as never,
      eventToPost: () => ({}) as Post,
      getConnectedCount: () => 0,
      getRelays: () => [],
    },
  };
});

vi.mock('../../services/votingService', () => ({
  votingService: { cleanup: vi.fn() },
}));

vi.mock('../../services/indexerFeedClient', () => ({
  mergePostsWithIndexer: async (posts: Post[]) => posts,
}));

vi.mock('../../services/nostr/nostrFeedScope', () => ({
  buildFetchPostsArgs: () => ({}),
  resolveNostrFeedScope: () => ({ mode: 'scoped', subscribe: {} }),
}));

vi.mock('../../services/nostr/nostrFeedPosts', () => ({
  mergeAuthoritativeNostrPosts: (a: Post[], b: Post[]) => [...a, ...b],
  processFetchedPostEvents: async () => ({ processedPosts: [], oldestMs: null }),
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
    mark: vi.fn(),
    measure: vi.fn(),
  },
}));

import { useNostrFeed } from '../../hooks/useNostrFeed';

const noop = () => undefined;

describe('useNostrFeed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns isInitialLoading=true on first render', () => {
    const { result } = renderHook(() =>
      useNostrFeed({
        activeBoard: null,
        setPosts: noop,
        setBoards: noop,
        setIsNostrConnected: noop,
        setOldestTimestamp: noop,
        setHasMorePosts: noop,
      }),
    );
    expect(result.current.isInitialLoading).toBe(true);
  });

  it('accepts the documented callback signatures without crashing', () => {
    // Smoke test: the hook must accept React state setters and tolerate
    // a null activeBoard without throwing. The internal effects schedule
    // async work that we never let resolve.
    expect(() => {
      renderHook(() =>
        useNostrFeed({
          activeBoard: null,
          setPosts: noop,
          setBoards: noop,
          setIsNostrConnected: noop,
          setOldestTimestamp: noop,
          setHasMorePosts: noop,
        }),
      );
      act(() => {
        vi.advanceTimersByTime(0);
      });
    }).not.toThrow();
  });
});
