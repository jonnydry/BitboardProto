import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  queryEvents: vi.fn(),
}));

vi.mock('../../services/nostr/NostrService', () => ({
  nostrService: {
    queryEvents: mocks.queryEvents,
  },
}));

vi.mock('../../services/loggingService', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  AdvancedSearchService,
  ContentType,
  DateRange,
  SearchSortBy,
} from '../../services/advancedSearchService';

describe('AdvancedSearchService', () => {
  let service: AdvancedSearchService;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    service = new AdvancedSearchService();
    service.initialize('user-pubkey');
  });

  it('searches, filters, sorts, and highlights results', async () => {
    mocks.queryEvents.mockResolvedValue([
      {
        id: 'e1',
        pubkey: 'alice',
        created_at: 10,
        kind: 1,
        tags: [
          ['title', 'Alpha title'],
          ['d', 'board-1'],
          ['t', 'alpha'],
        ],
        content: 'contains alpha and https://example.com/image.jpg',
        sig: 'sig',
      },
      {
        id: 'e2',
        pubkey: 'bob',
        created_at: 20,
        kind: 1,
        tags: [
          ['title', 'Beta title'],
          ['d', 'board-2'],
        ],
        content: 'contains beta only',
        sig: 'sig',
      },
    ]);

    const results = await service.search({
      query: 'alpha',
      boards: ['board-1'],
      contentType: ContentType.LINKS,
      sortBy: SearchSortBy.RELEVANCE,
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('e1');
    expect(results[0].highlightedContent).toContain('**alpha**');
    expect(service.getHistory()[0]).toEqual(
      expect.objectContaining({ query: 'alpha', resultCount: 1 }),
    );
  });

  it('supports saved searches, suggestions, history clear, and date-range quick search', async () => {
    mocks.queryEvents.mockResolvedValue([
      {
        id: 'e1',
        pubkey: 'alice',
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [
          ['title', 'Gamma title'],
          ['t', 'gamma'],
        ],
        content: 'gamma content',
        sig: 'sig',
      },
    ]);

    const saved = service.saveSearch('Gamma Search', {
      query: 'gamma',
      dateRange: DateRange.PAST_WEEK,
      contentType: ContentType.ALL,
      sortBy: SearchSortBy.NEWEST,
    });

    const executed = await service.executeSavedSearch(saved.id);
    expect(executed).toHaveLength(1);
    expect(service.getSavedSearches()[0]).toEqual(
      expect.objectContaining({ name: 'Gamma Search', useCount: 1 }),
    );
    expect(service.getSuggestions('gam')).toContain('gamma');

    const quick = await service.quickSearch('gamma');
    expect(quick).toHaveLength(1);

    service.clearHistory();
    expect(service.getHistory()).toEqual([]);

    service.deleteSavedSearch(saved.id);
    expect(service.getSavedSearches()).toEqual([]);
  });
});
