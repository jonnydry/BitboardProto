import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  searchRelays: vi.fn(),
}));

vi.mock('../../services/nostr/NostrService', () => ({
  nostrService: {
    searchRelays: mocks.searchRelays,
  },
}));

vi.mock('../../services/loggingService', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('SearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('falls back to main-thread search when worker is unavailable', async () => {
    vi.stubGlobal('Worker', undefined);
    const { searchService: service } = await import('../../services/searchService');
    service.updateIndex([
      {
        id: 'post-1',
        boardId: 'board-1',
        title: 'Alpha Title',
        author: 'Alice',
        authorPubkey: 'alice',
        content: 'Contains keywords',
        tags: ['alpha'],
        comments: [{ author: 'Bob', content: 'comment term' }],
      },
    ] as any);

    const results = await service.search('comment');
    expect(results).toEqual(['post-1']);
    expect(service.isWorkerReady()).toBe(false);
    service.destroy();
  });

  it('uses relay search helpers and filters by board', async () => {
    const { searchService: service } = await import('../../services/searchService');
    mocks.searchRelays.mockResolvedValue([
      {
        id: 'e1',
        kind: 1,
        tags: [['board', 'board-1']],
        content: 'a',
        pubkey: 'p',
        created_at: 1,
        sig: 'sig',
      },
      {
        id: 'e2',
        kind: 1,
        tags: [['board', 'board-2']],
        content: 'b',
        pubkey: 'p',
        created_at: 1,
        sig: 'sig',
      },
    ]);

    expect(await service.relaySearch('hi')).toHaveLength(2);
    expect(await service.searchPosts('hi', { boardId: 'board-1' })).toHaveLength(1);
    expect(await service.searchArticles('hi')).toEqual(expect.any(Array));
    service.destroy();
  });
});
