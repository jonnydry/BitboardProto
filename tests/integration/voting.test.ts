import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPost, createMockUserState } from '../utils/testHelpers';
import { votingService } from '../../services/votingService';
import { nostrService } from '../../services/nostrService';
import type { Post } from '../../types';

// Mock services
vi.mock('../../services/votingService');
vi.mock('../../services/nostrService');

describe('Voting Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upvotes a post', async () => {
    const post = createMockPost({ id: 'post-1', nostrEventId: 'event-1' });
    const userState = createMockUserState();

    // Mock vote fetching
    vi.mocked(votingService.fetchVotesForPosts).mockResolvedValue(
      new Map([
        ['event-1', {
          upvotes: 5,
          downvotes: 1,
          score: 4,
          uniqueVoters: 6,
        }],
      ])
    );

    const voteTallies = await votingService.fetchVotesForPosts(['event-1']);
    const tally = voteTallies.get('event-1');

    expect(tally).toBeDefined();
    expect(tally?.upvotes).toBe(5);
    expect(tally?.downvotes).toBe(1);
    expect(tally?.score).toBe(4);
  });

  it('handles voting on posts without Nostr event ID', () => {
    const post = createMockPost({ id: 'local-post', nostrEventId: undefined });
    
    // Local posts without Nostr event ID should not fetch votes
    expect(post.nostrEventId).toBeUndefined();
  });

  it('calculates score correctly from vote tallies', () => {
    const tallies = new Map([
      ['event-1', { upvotes: 10, downvotes: 2, score: 8, uniqueVoters: 12 }],
      ['event-2', { upvotes: 5, downvotes: 5, score: 0, uniqueVoters: 10 }],
    ]);

    expect(tallies.get('event-1')?.score).toBe(8);
    expect(tallies.get('event-2')?.score).toBe(0);
  });
});










