import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';

const {
  mockVerifyEvent,
  mockFetchVoteEvents,
  mockBuildVoteEvent,
  mockBuildReactionDeleteEvent,
  mockPublishSignedEvent,
} = vi.hoisted(() => ({
  mockVerifyEvent: vi.fn(),
  mockFetchVoteEvents: vi.fn(),
  mockBuildVoteEvent: vi.fn(),
  mockBuildReactionDeleteEvent: vi.fn(),
  mockPublishSignedEvent: vi.fn(),
}));

const { mockAllowVote, mockIsVoteDuplicate, mockMarkVoteProcessed, mockSignEvent } = vi.hoisted(
  () => ({
    mockAllowVote: vi.fn(),
    mockIsVoteDuplicate: vi.fn(),
    mockMarkVoteProcessed: vi.fn(),
    mockSignEvent: vi.fn(),
  }),
);

vi.mock('nostr-tools', () => ({
  verifyEvent: mockVerifyEvent,
}));

vi.mock('../../services/nostr/NostrService', () => ({
  nostrService: {
    fetchVoteEvents: mockFetchVoteEvents,
    buildVoteEvent: mockBuildVoteEvent,
    buildReactionDeleteEvent: mockBuildReactionDeleteEvent,
    publishSignedEvent: mockPublishSignedEvent,
  },
}));

vi.mock('../../services/rateLimiter', () => ({
  rateLimiter: {
    allowVote: mockAllowVote,
  },
}));

vi.mock('../../services/messageDeduplicator', () => ({
  voteDeduplicator: {
    isVoteDuplicate: mockIsVoteDuplicate,
    markVoteProcessed: mockMarkVoteProcessed,
  },
}));

vi.mock('../../services/identityService', () => ({
  identityService: {
    signEvent: mockSignEvent,
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

function makeVoteEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: overrides.id ?? 'evt-1',
    pubkey: overrides.pubkey ?? 'pubkey-1',
    created_at: overrides.created_at ?? 100,
    kind: overrides.kind ?? 7,
    tags: overrides.tags ?? [['e', 'post-1']],
    content: overrides.content ?? '+',
    sig: overrides.sig ?? 'sig',
  };
}

async function loadVotingService() {
  vi.resetModules();
  const mod = await import('../../services/votingService');
  return mod.votingService;
}

describe('votingService', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('Worker', undefined);
    mockVerifyEvent.mockReset();
    mockFetchVoteEvents.mockReset();
    mockBuildVoteEvent.mockReset();
    mockBuildReactionDeleteEvent.mockReset();
    mockPublishSignedEvent.mockReset();
    mockAllowVote.mockReset();
    mockIsVoteDuplicate.mockReset();
    mockMarkVoteProcessed.mockReset();
    mockSignEvent.mockReset();
    mockVerifyEvent.mockReturnValue(true);
    mockAllowVote.mockReturnValue(true);
    mockIsVoteDuplicate.mockReturnValue(false);
  });

  it('verifies well-formed vote events and rejects invalid ones', async () => {
    const votingService = await loadVotingService();

    expect(votingService.verifyVoteEvent(makeVoteEvent())).toBe(true);

    mockVerifyEvent.mockReturnValue(false);
    expect(votingService.verifyVoteEvent(makeVoteEvent({ id: 'bad' }))).toBe(false);

    mockVerifyEvent.mockReturnValue(true);
    expect(votingService.verifyVoteEvent(makeVoteEvent({ kind: 1 }))).toBe(false);
    expect(votingService.verifyVoteEvent(makeVoteEvent({ content: '?' }))).toBe(false);
    expect(votingService.verifyVoteEvent(makeVoteEvent({ tags: [] }))).toBe(false);

    votingService.cleanup();
  });

  it('processes vote changes so the latest vote per user wins', async () => {
    const votingService = await loadVotingService();

    const oldVote = makeVoteEvent({ id: 'old', content: '+', created_at: 100, pubkey: 'user-1' });
    const newVote = makeVoteEvent({ id: 'new', content: '-', created_at: 200, pubkey: 'user-1' });
    const secondUser = makeVoteEvent({
      id: 'two',
      content: '+',
      created_at: 150,
      pubkey: 'user-2',
    });

    expect(votingService.processVoteEvent(oldVote)?.direction).toBe('up');
    expect(votingService.processVoteEvent(newVote)?.direction).toBe('down');
    expect(votingService.processVoteEvent(secondUser)?.direction).toBe('up');

    const tally = votingService.getCachedTally('post-1');
    expect(tally?.upvotes).toBe(1);
    expect(tally?.downvotes).toBe(1);
    expect(tally?.score).toBe(0);
    expect(tally?.uniqueVoters).toBe(2);

    votingService.cleanup();
  });

  it('fetches votes for a post, verifies them, and caches the tally', async () => {
    const votingService = await loadVotingService();
    mockFetchVoteEvents.mockResolvedValue([
      makeVoteEvent({ id: 'a', pubkey: 'user-1', content: '+', created_at: 100 }),
      makeVoteEvent({ id: 'b', pubkey: 'user-1', content: '-', created_at: 200 }),
      makeVoteEvent({ id: 'c', pubkey: 'user-2', content: '+', created_at: 150 }),
      makeVoteEvent({ id: 'bad-content', pubkey: 'user-3', content: '?' }),
    ]);
    mockVerifyEvent.mockImplementation((event: NostrEvent) => event.id !== 'bad-content');

    const tally = await votingService.fetchVotesForPost('post-1');

    expect(tally.upvotes).toBe(1);
    expect(tally.downvotes).toBe(1);
    expect(tally.uniqueVoters).toBe(2);
    expect(votingService.getScore('post-1')).toBe(0);
    expect(votingService.getUserVote('user-1', 'post-1')).toBe('down');

    await votingService.fetchVotesForPost('post-1');
    expect(mockFetchVoteEvents).toHaveBeenCalledTimes(1);

    votingService.cleanup();
  });

  it('fetches votes for multiple posts in batch form', async () => {
    const votingService = await loadVotingService();
    mockFetchVoteEvents.mockImplementation(async (postId: string) => {
      if (postId === 'post-1') {
        return [
          makeVoteEvent({ id: 'a', tags: [['e', 'post-1']], pubkey: 'user-1', content: '+' }),
        ];
      }
      return [makeVoteEvent({ id: 'b', tags: [['e', 'post-2']], pubkey: 'user-2', content: '-' })];
    });

    const tallies = await votingService.fetchVotesForPosts(['post-1', 'post-2']);

    expect(tallies.get('post-1')?.score).toBe(1);
    expect(tallies.get('post-2')?.score).toBe(-1);
    await expect(votingService.fetchVotesForComments(['post-1'])).resolves.toBeInstanceOf(Map);

    votingService.cleanup();
  });

  it('casts votes, updates local tally state, and tracks user votes', async () => {
    const votingService = await loadVotingService();
    const identity = {
      pubkey: 'user-1',
      npub: 'npub',
      kind: 'local' as const,
      privkey: '11'.repeat(32),
    };
    const unsigned = {
      kind: 7,
      created_at: 123,
      tags: [['e', 'post-1']],
      content: '+',
      pubkey: 'user-1',
    };
    const signed = { ...unsigned, id: 'signed-1', sig: 'sig' };

    mockBuildVoteEvent.mockReturnValue(unsigned);
    mockSignEvent.mockResolvedValue(signed);
    mockPublishSignedEvent.mockResolvedValue(signed);

    const result = await votingService.castVote('post-1', 'up', identity);

    expect(result.success).toBe(true);
    expect(result.newTally?.score).toBe(1);
    expect(votingService.getUserVote('user-1', 'post-1')).toBe('up');
    expect(votingService.hasUserVoted('user-1', 'post-1')).toBe(true);
    expect(mockMarkVoteProcessed).toHaveBeenCalledWith('user-1', 'post-1');

    votingService.cleanup();
  });

  it('returns an error when rate limited or publish fails', async () => {
    const votingService = await loadVotingService();
    const identity = {
      pubkey: 'user-1',
      npub: 'npub',
      kind: 'local' as const,
      privkey: '11'.repeat(32),
    };

    mockAllowVote.mockReturnValue(false);
    await expect(votingService.castVote('post-1', 'up', identity)).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Rate limit exceeded'),
      }),
    );

    mockAllowVote.mockReturnValue(true);
    mockBuildVoteEvent.mockReturnValue({
      kind: 7,
      created_at: 123,
      tags: [['e', 'post-1']],
      content: '+',
      pubkey: 'user-1',
    });
    mockSignEvent.mockResolvedValue({
      id: 'signed-1',
      sig: 'sig',
      kind: 7,
      created_at: 123,
      tags: [['e', 'post-1']],
      content: '+',
      pubkey: 'user-1',
    });
    mockPublishSignedEvent.mockRejectedValue(new Error('relay failed'));

    await expect(votingService.castVote('post-1', 'up', identity)).resolves.toEqual(
      expect.objectContaining({ success: false, error: 'relay failed' }),
    );

    votingService.cleanup();
  });

  it('clears and invalidates cached tallies', async () => {
    const votingService = await loadVotingService();
    votingService.processVoteEvent(makeVoteEvent({ id: 'cached', created_at: 100 }));
    const tally = votingService.getCachedTally('post-1');
    expect(tally).not.toBeNull();

    (tally as { lastUpdated: number }).lastUpdated = Date.now() - 10_000;
    votingService.invalidateStaleCache(1000);
    expect(votingService.getCachedTally('post-1')).toBeNull();

    votingService.processVoteEvent(makeVoteEvent({ id: 'fresh', created_at: 200 }));
    expect(votingService.getCachedTally('post-1')).not.toBeNull();
    votingService.clearPostCache('post-1');
    expect(votingService.getCachedTally('post-1')).toBeNull();
  });

  it('retracts a vote by publishing a NIP-09 deletion of the cached reaction', async () => {
    const votingService = await loadVotingService();
    const identity = {
      pubkey: 'user-1',
      npub: 'npub',
      kind: 'local' as const,
      privkey: '11'.repeat(32),
    };
    const unsigned = {
      kind: 7,
      created_at: 123,
      tags: [['e', 'post-1']],
      content: '+',
      pubkey: 'user-1',
    };
    const signed = { ...unsigned, id: 'signed-1', sig: 'sig' };

    mockBuildVoteEvent.mockReturnValue(unsigned);
    mockSignEvent.mockResolvedValue(signed);
    mockPublishSignedEvent.mockResolvedValue(signed);

    await votingService.castVote('post-1', 'up', identity);
    expect(votingService.getUserVote('user-1', 'post-1')).toBe('up');

    const deleteUnsigned = {
      kind: 5,
      created_at: 124,
      tags: [
        ['e', 'signed-1'],
        ['k', '7'],
      ],
      content: '',
      pubkey: 'user-1',
    };
    mockBuildReactionDeleteEvent.mockReturnValue(deleteUnsigned);
    mockSignEvent.mockResolvedValue({ ...deleteUnsigned, id: 'del-1', sig: 'sig' });

    const result = await votingService.retractVote('post-1', identity);

    expect(result.success).toBe(true);
    // Deletion targets the reaction we cast earlier
    expect(mockBuildReactionDeleteEvent).toHaveBeenCalledWith('signed-1', 'user-1');
    expect(votingService.getUserVote('user-1', 'post-1')).toBeNull();
    expect(result.newTally?.score).toBe(0);
    expect(result.newTally?.uniqueVoters).toBe(0);

    votingService.cleanup();
  });

  it('retracts by looking up the reaction on relays when the tally is not cached', async () => {
    const votingService = await loadVotingService();
    const identity = {
      pubkey: 'user-1',
      npub: 'npub',
      kind: 'local' as const,
      privkey: '11'.repeat(32),
    };

    mockFetchVoteEvents.mockResolvedValue([
      makeVoteEvent({ id: 'older', pubkey: 'user-1', created_at: 100 }),
      makeVoteEvent({ id: 'latest', pubkey: 'user-1', created_at: 200 }),
      makeVoteEvent({ id: 'other-user', pubkey: 'user-2', created_at: 300 }),
    ]);
    mockBuildReactionDeleteEvent.mockReturnValue({
      kind: 5,
      created_at: 301,
      tags: [['e', 'latest']],
      content: '',
      pubkey: 'user-1',
    });
    mockSignEvent.mockResolvedValue({ id: 'del-2', sig: 'sig' });
    mockPublishSignedEvent.mockResolvedValue({ id: 'del-2' });

    const result = await votingService.retractVote('post-1', identity);

    expect(result.success).toBe(true);
    // Deletes the user's LATEST reaction, not another user's
    expect(mockBuildReactionDeleteEvent).toHaveBeenCalledWith('latest', 'user-1');

    votingService.cleanup();
  });

  it('ignores reactions whose NIP-25 target (last e tag) is a different event', async () => {
    const votingService = await loadVotingService();
    mockFetchVoteEvents.mockResolvedValue([
      // Genuine vote on the post
      makeVoteEvent({ id: 'direct', pubkey: 'user-1', content: '+', tags: [['e', 'post-1']] }),
      // Reaction to a comment that also carries the post as root 'e' tag —
      // relays match it via #e=post-1 but it must not count toward the post
      makeVoteEvent({
        id: 'comment-reaction',
        pubkey: 'user-2',
        content: '+',
        tags: [
          ['e', 'post-1'],
          ['e', 'comment-9'],
        ],
      }),
    ]);

    const tally = await votingService.fetchVotesForPost('post-1');

    expect(tally.upvotes).toBe(1);
    expect(tally.uniqueVoters).toBe(1);
    expect(tally.votes.has('user-2')).toBe(false);

    votingService.cleanup();
  });

  it('supports bits economy flow: spend on first vote, free switch, refund on retract (via userStore + voteMath; service tracks uniqueVoters)', async () => {
    const votingService = await loadVotingService();
    // Unique voters from verified kind-7
    const v1 = makeVoteEvent({ id: 'v1', pubkey: 'p1', content: '+' });
    const v2 = makeVoteEvent({ id: 'v2', pubkey: 'p2', content: '-' });
    votingService.processVoteEvent(v1);
    votingService.processVoteEvent(v2);
    const tally = votingService.getCachedTally('post-1');
    expect(tally?.uniqueVoters).toBe(2);
    expect(tally?.score).toBe(0);
    // Retract would be handled by userStore bits + optimistic in hooks/voteMath computeRollback
    votingService.cleanup();
  });
});
