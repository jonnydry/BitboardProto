import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOSTR_KINDS } from '../../types';

const mocks = vi.hoisted(() => ({
  queryEvents: vi.fn(),
  fetchProfiles: vi.fn(),
  getDisplayName: vi.fn((pubkey: string) => `user-${pubkey.slice(0, 6)}`),
  relaySearch: vi.fn(),
  discoverCommunities: vi.fn(),
  fetchCommunityPreview: vi.fn(),
  getZapTalliesForEvents: vi.fn(),
}));

vi.mock('../../services/nostr/NostrService', () => ({
  nostrService: {
    queryEvents: mocks.queryEvents,
    fetchProfiles: mocks.fetchProfiles,
    getDisplayName: mocks.getDisplayName,
  },
}));

vi.mock('../../services/searchService', () => ({
  searchService: {
    relaySearch: mocks.relaySearch,
  },
}));

vi.mock('../../services/externalCommunityDiscoveryService', () => ({
  externalCommunityDiscoveryService: {
    discoverCommunities: mocks.discoverCommunities,
    fetchCommunityPreview: mocks.fetchCommunityPreview,
  },
}));

vi.mock('../../services/zapService', () => ({
  zapService: {
    getZapTalliesForEvents: mocks.getZapTalliesForEvents,
  },
}));

import { nostrDiscoveryService } from '../../services/nostrDiscoveryService';

describe('nostrDiscoveryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryEvents.mockResolvedValue([]);
    mocks.fetchProfiles.mockResolvedValue(undefined);
    mocks.relaySearch.mockResolvedValue([]);
    mocks.discoverCommunities.mockResolvedValue([]);
    mocks.fetchCommunityPreview.mockResolvedValue([]);
    mocks.getZapTalliesForEvents.mockResolvedValue(new Map());
  });

  it('ranks community-approved posts ahead of general posts when both are present', async () => {
    mocks.queryEvents.mockResolvedValue([
      {
        id: 'general-post-1',
        kind: NOSTR_KINDS.POST,
        pubkey: 'abcdef123456',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['t', 'nostr']],
        content: 'A general post',
      },
    ]);
    mocks.discoverCommunities.mockResolvedValue([
      {
        community: {
          id: 'dev',
          address: '34550:pubkey:dev',
          name: '/n/dev',
          moderators: ['mod1'],
        },
        board: {
          id: '34550:pubkey:dev',
          name: '/n/dev',
          description: 'dev',
          memberCount: 2,
          isPublic: true,
          isReadOnly: true,
          type: 0,
        },
        approvalCount: 12,
        recentApprovalCount: 6,
      },
    ]);
    mocks.fetchCommunityPreview.mockResolvedValue([
      {
        id: 'approved-post-1',
        boardId: '34550:pubkey:dev',
        source: 'nostr-community',
        title: 'Approved developer security post',
        author: 'alice',
        authorPubkey: 'pubkey-1',
        content:
          'This approved developer post breaks down a concrete security issue, explains the tradeoffs, and gives enough context to be a real seed candidate.',
        timestamp: Date.now(),
        score: 0,
        commentCount: 0,
        tags: ['dev', 'security', 'nostr'],
        comments: [],
        upvotes: 0,
        downvotes: 0,
      },
    ]);

    const results = await nostrDiscoveryService.discoverSeedCandidates({
      timeWindow: '24h',
      sourceFilter: 'all',
    });

    expect(results[0].sourceType).toBe('community-approved');
    expect(results[0].provenanceLabel).toContain('/n/dev');
    expect(results[0].confidence).toBe('high');
    expect(results[0].whyTrending.some((reason) => reason.includes('moderator-approved'))).toBe(
      true,
    );
    expect(results.some((result) => result.id === 'general-post-1')).toBe(false);
  });

  it('uses relay search when a query is provided', async () => {
    mocks.relaySearch.mockResolvedValue([
      {
        id: 'search-post-1',
        kind: NOSTR_KINDS.COMMUNITY_POST,
        pubkey: 'fedcba654321',
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['t', 'bitcoin'],
          ['r', 'https://example.com/report'],
        ],
        content:
          'Bitcoin community content with a strong link and enough substance to pass the discovery threshold.',
      },
    ]);
    mocks.getZapTalliesForEvents.mockResolvedValue(
      new Map([
        [
          'search-post-1',
          {
            eventId: 'search-post-1',
            totalSats: 420,
            zapCount: 3,
            topZappers: [],
            lastUpdated: Date.now(),
          },
        ],
      ]),
    );

    const results = await nostrDiscoveryService.discoverSeedCandidates({
      timeWindow: '7d',
      sourceFilter: 'general',
      query: 'bitcoin',
    });

    expect(mocks.relaySearch).toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].post.source).toBe('nostr');
    expect(results[0].sourceDetail).toContain('NIP-72');
    expect(results[0].whyTrending.some((reason) => reason.includes('zaps'))).toBe(true);
    expect(results[0].post.url).toBe('https://example.com/report');
    expect(results[0].confidenceLabel).toBe('Link-backed');
  });

  it('filters out low-signal general chatter but keeps stronger linked posts', async () => {
    mocks.queryEvents.mockResolvedValue([
      {
        id: 'weak-post',
        kind: NOSTR_KINDS.POST,
        pubkey: 'aaaaaa111111',
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: 'nice',
      },
      {
        id: 'strong-post',
        kind: NOSTR_KINDS.POST,
        pubkey: 'bbbbbb222222',
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['t', 'bitcoin'],
          ['t', 'policy'],
          ['r', 'https://example.com/memo'],
        ],
        content:
          'A substantial policy memo on Bitcoin custody and sovereign ownership, with evidence, implications, and a linked source for verification.',
      },
    ]);
    mocks.getZapTalliesForEvents.mockResolvedValue(
      new Map([
        [
          'strong-post',
          {
            eventId: 'strong-post',
            totalSats: 250,
            zapCount: 2,
            topZappers: [],
            lastUpdated: Date.now(),
          },
        ],
      ]),
    );

    const results = await nostrDiscoveryService.discoverSeedCandidates({
      timeWindow: '24h',
      sourceFilter: 'general',
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('strong-post');
    expect(results[0].post.url).toBe('https://example.com/memo');
  });

  it('hard-filters non-English discovery candidates', async () => {
    mocks.queryEvents.mockResolvedValue([
      {
        id: 'spanish-post',
        kind: NOSTR_KINDS.POST,
        pubkey: 'cccccc333333',
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['lang', 'es'],
          ['r', 'https://example.com/es'],
        ],
        content:
          'Este es un articulo importante sobre politica monetaria y soberania tecnologica con enlace para verificacion.',
      },
      {
        id: 'english-post',
        kind: NOSTR_KINDS.POST,
        pubkey: 'dddddd444444',
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['lang', 'en'],
          ['r', 'https://example.com/en'],
          ['t', 'policy'],
          ['t', 'sovereignty'],
        ],
        content:
          'This is an important article about monetary policy and technological sovereignty, with a linked source for verification and enough detail to qualify as a strong seed candidate.',
      },
    ]);

    const results = await nostrDiscoveryService.discoverSeedCandidates({
      timeWindow: '24h',
      sourceFilter: 'general',
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('english-post');
  });
});
