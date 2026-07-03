import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Post } from '../../types';

const { mockDiscoverSeedCandidates } = vi.hoisted(() => ({
  mockDiscoverSeedCandidates: vi.fn(),
}));

vi.mock('../../services/nostrDiscoveryService', () => ({
  nostrDiscoveryService: {
    discoverSeedCandidates: mockDiscoverSeedCandidates,
  },
}));

vi.mock('../../services/loggingService', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: overrides.id ?? 'ext-1',
    nostrEventId: overrides.nostrEventId ?? overrides.id ?? 'ext-1',
    boardId: '__discover_nostr__',
    source: 'nostr',
    title: 'External note',
    author: 'someone',
    content: 'hello from the wider nostr',
    timestamp: Date.now(),
    score: 0,
    commentCount: 0,
    tags: [],
    comments: [],
    upvotes: 0,
    downvotes: 0,
    ...overrides,
  };
}

function makeCandidate(post: Post) {
  return { id: post.id, post, sourceType: 'general', discoveryScore: 10 };
}

async function loadService() {
  vi.resetModules();
  const mod = await import('../../services/blendedFeedService');
  return mod;
}

describe('blendedFeedService', () => {
  beforeEach(() => {
    localStorage.clear();
    mockDiscoverSeedCandidates.mockReset();
  });

  it('marks fetched posts with the scope they were blended into', async () => {
    const { blendedFeedService } = await loadService();
    mockDiscoverSeedCandidates.mockResolvedValue([makeCandidate(makePost({ id: 'a'.repeat(64) }))]);

    const posts = await blendedFeedService.fetchBlendedPosts('b-tech', null, []);

    expect(posts).toHaveLength(1);
    expect(posts[0]?.blendedInto).toBe('b-tech');
    expect(posts[0]?.source).toBe('nostr');
  });

  it('dedupes against native posts by event id and seed provenance', async () => {
    const { blendedFeedService } = await loadService();
    const dupId = 'b'.repeat(64);
    const seededId = 'c'.repeat(64);
    mockDiscoverSeedCandidates.mockResolvedValue([
      makeCandidate(makePost({ id: dupId })),
      makeCandidate(makePost({ id: seededId })),
      makeCandidate(makePost({ id: 'd'.repeat(64) })),
    ]);

    const nativePosts: Post[] = [
      // Same event already native in the feed
      makePost({ id: dupId, source: 'bitboard', boardId: 'b-tech' }),
      // A native post that was seeded FROM the external note
      makePost({
        id: 'native-seeded',
        nostrEventId: 'native-seeded-evt',
        source: 'bitboard',
        boardId: 'b-tech',
        seededFrom: 'nostr',
        seedSourceEventId: seededId,
      }),
    ];

    const posts = await blendedFeedService.fetchBlendedPosts('global', null, nativePosts);

    expect(posts.map((p) => p.id)).toEqual(['d'.repeat(64)]);
  });

  it('caches per scope and serves the cache without refetching', async () => {
    const { blendedFeedService } = await loadService();
    mockDiscoverSeedCandidates.mockResolvedValue([makeCandidate(makePost({ id: 'e'.repeat(64) }))]);

    await blendedFeedService.fetchBlendedPosts('global', null, []);
    await blendedFeedService.fetchBlendedPosts('global', null, []);

    expect(mockDiscoverSeedCandidates).toHaveBeenCalledTimes(1);

    // A different scope triggers its own fetch
    await blendedFeedService.fetchBlendedPosts('b-tech', null, []);
    expect(mockDiscoverSeedCandidates).toHaveBeenCalledTimes(2);
  });

  it('survives discovery failures by returning empty (or stale cache)', async () => {
    const { blendedFeedService } = await loadService();
    mockDiscoverSeedCandidates.mockRejectedValue(new Error('relays down'));

    await expect(blendedFeedService.fetchBlendedPosts('global', null, [])).resolves.toEqual([]);
  });

  it('reports sparse scopes under the threshold only', async () => {
    const { blendedFeedService } = await loadService();
    expect(blendedFeedService.isSparse(0)).toBe(true);
    expect(blendedFeedService.isSparse(10)).toBe(true);
    expect(blendedFeedService.isSparse(11)).toBe(false);
  });

  it('derives board discovery queries, skipping meta boards', async () => {
    const { boardDiscoveryQuery } = await loadService();
    const board = (name: string) =>
      ({ id: 'x', name, description: '', isPublic: true, memberCount: 0, type: 'topic' }) as never;

    expect(boardDiscoveryQuery(board('TECH'))).toBe('tech');
    expect(boardDiscoveryQuery(board('RANDOM'))).toBeUndefined();
    expect(boardDiscoveryQuery(board('META'))).toBeUndefined();
  });
});
