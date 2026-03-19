import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardType } from '../../types';

const mocks = vi.hoisted(() => ({
  fetchCommunities: vi.fn(),
  fetchApprovalsForCommunity: vi.fn(),
  communityToBoard: vi.fn((community: any) => ({
    id: community.address,
    name: community.name,
    description: community.description ?? '',
    memberCount: community.moderators.length + 1,
    communityAddress: community.address,
    isPublic: true,
    isReadOnly: true,
    type: 'topic',
  })),
  fetchApprovedPosts: vi.fn(),
  eventToCommunityPost: vi.fn(),
  fetchVotesForPosts: vi.fn(),
  fetchProfiles: vi.fn(),
  getDisplayName: vi.fn((pubkey: string) => `user-${pubkey.slice(0, 6)}`),
}));

vi.mock('../../services/communityService', () => ({
  communityService: {
    fetchCommunities: mocks.fetchCommunities,
    fetchApprovalsForCommunity: mocks.fetchApprovalsForCommunity,
    communityToBoard: mocks.communityToBoard,
    fetchApprovedPosts: mocks.fetchApprovedPosts,
    eventToCommunityPost: mocks.eventToCommunityPost,
  },
}));

vi.mock('../../services/votingService', () => ({
  votingService: {
    fetchVotesForPosts: mocks.fetchVotesForPosts,
  },
}));

vi.mock('../../services/nostr/NostrService', () => ({
  nostrService: {
    fetchProfiles: mocks.fetchProfiles,
    getDisplayName: mocks.getDisplayName,
  },
}));

import { externalCommunityDiscoveryService } from '../../services/externalCommunityDiscoveryService';

describe('externalCommunityDiscoveryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchVotesForPosts.mockResolvedValue(new Map());
    mocks.fetchApprovedPosts.mockResolvedValue([]);
    mocks.fetchProfiles.mockResolvedValue(undefined);
  });

  it('categorizes communities using rules and relay hints', async () => {
    mocks.fetchCommunities.mockResolvedValue([
      {
        id: 'quiet-room',
        address: '34550:pubkey:quiet-room',
        name: 'Quiet Room',
        description: 'General discussion',
        rules: 'Privacy first. No doxxing.',
        relays: ['wss://relay.example'],
        moderators: ['mod1'],
        creatorPubkey: 'creator-1',
        createdAt: Date.now(),
      },
      {
        id: 'makers',
        address: '34550:pubkey:makers',
        name: 'Makers',
        description: 'Shipping things',
        rules: 'Bring code and protocol ideas.',
        relays: ['wss://nostr-dev-relay.example'],
        moderators: ['mod1', 'mod2'],
        creatorPubkey: 'creator-2',
        createdAt: Date.now(),
      },
    ]);
    mocks.fetchApprovalsForCommunity.mockResolvedValue([]);

    const discovered = await externalCommunityDiscoveryService.discoverCommunities({
      forceRefresh: true,
    });

    expect(discovered.find((entry) => entry.community.id === 'quiet-room')?.category).toBe(
      'privacy',
    );
    expect(discovered.find((entry) => entry.community.id === 'makers')?.category).toBe(
      'technology',
    );
  });

  it('boosts communities with recent approval activity', async () => {
    const now = Date.now();
    mocks.fetchCommunities.mockResolvedValue([
      {
        id: 'active-lounge',
        address: '34550:pubkey:active-lounge',
        name: 'Active Lounge',
        description: 'General discussion',
        moderators: ['mod1'],
        creatorPubkey: 'creator-1',
        createdAt: now - 1000 * 60 * 60 * 24 * 90,
      },
      {
        id: 'archive-room',
        address: '34550:pubkey:archive-room',
        name: 'Archive Room',
        description: 'General discussion',
        moderators: ['mod1'],
        creatorPubkey: 'creator-2',
        createdAt: now - 1000 * 60 * 60 * 24 * 5,
      },
    ]);

    mocks.fetchApprovalsForCommunity.mockImplementation(async (address: string) => {
      if (address.includes('active-lounge')) {
        return [
          { postEventId: 'p1', timestamp: now - 1000 * 60 * 60 },
          { postEventId: 'p2', timestamp: now - 1000 * 60 * 60 * 12 },
          { postEventId: 'p3', timestamp: now - 1000 * 60 * 60 * 24 },
        ];
      }
      return [{ postEventId: 'p4', timestamp: now - 1000 * 60 * 60 * 24 * 40 }];
    });

    const discovered = await externalCommunityDiscoveryService.discoverCommunities({
      forceRefresh: true,
    });

    expect(discovered[0].community.id).toBe('active-lounge');
    expect(discovered[0].recentApprovalCount).toBe(3);
    expect(discovered[0].approvalCount).toBe(3);
  });

  it('builds full uncapped sections for browser pagination', () => {
    const communities = Array.from({ length: 15 }, (_, index) => ({
      community: {
        id: `dev-${index}`,
        address: `34550:pubkey:dev-${index}`,
        name: `Dev ${index}`,
        description: 'Developer hangout',
        moderators: ['mod1'],
        creatorPubkey: 'creator',
      },
      board: {
        id: `34550:pubkey:dev-${index}`,
        name: `Dev ${index}`,
        description: 'Developer hangout',
        memberCount: 2,
        isPublic: true,
        isReadOnly: true,
        type: BoardType.TOPIC,
      },
      category: 'technology' as const,
      discoveryScore: 100 - index,
      approvalCount: index,
      recentApprovalCount: index,
    }));

    const sections = externalCommunityDiscoveryService.buildSections(communities);
    const technology = sections.find((section) => section.id === 'technology');

    expect(technology?.communities).toHaveLength(15);
    expect(sections.find((section) => section.id === 'trending')?.communities).toHaveLength(15);
  });

  it('caches community previews until force-refreshed', async () => {
    const board = {
      id: '34550:pubkey:dev-1',
      name: 'Dev 1',
      description: 'Developer hangout',
      memberCount: 4,
      communityAddress: '34550:pubkey:dev-1',
      isPublic: true,
      isReadOnly: true,
      type: BoardType.TOPIC,
    };

    mocks.fetchApprovedPosts.mockResolvedValue([{ id: 'approval-1' }]);
    mocks.eventToCommunityPost.mockReturnValue({
      id: 'post-1',
      boardId: board.id,
      source: 'nostr-community',
      title: 'Cached preview post',
      author: 'alice',
      authorPubkey: 'abc123',
      content: 'hello world',
      timestamp: Date.now(),
      score: 4,
      commentCount: 0,
      tags: [],
      comments: [],
      nostrEventId: 'nostr-post-1',
      upvotes: 4,
      downvotes: 0,
    });
    mocks.fetchVotesForPosts.mockResolvedValue(new Map());

    const first = await externalCommunityDiscoveryService.fetchCommunityPreview(board, 8, true);
    const second = await externalCommunityDiscoveryService.fetchCommunityPreview(board, 8);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(mocks.fetchApprovedPosts).toHaveBeenCalledTimes(1);

    await externalCommunityDiscoveryService.fetchCommunityPreview(board, 8, true);
    expect(mocks.fetchApprovedPosts).toHaveBeenCalledTimes(2);
  });
});
