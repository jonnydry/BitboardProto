import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardType } from '../../types';

const mocks = vi.hoisted(() => ({
  discoverCommunities: vi.fn(),
  buildSections: vi.fn(),
  fetchCommunityPreview: vi.fn(),
  hydrateApprovedPost: vi.fn(),
  getCategoryLabel: vi.fn((category: string) => category),
  getRelayStatuses: vi.fn(() => [
    { url: 'wss://relay.one', isConnected: true },
    { url: 'wss://relay.two', isConnected: false },
  ]),
  subscribeToCommunityApprovals: vi.fn(),
  unsubscribe: vi.fn(),
  upsertApprovalEvent: vi.fn((event: any) => ({ postEventId: event.id })),
}));

vi.mock('../../services/externalCommunityDiscoveryService', () => ({
  externalCommunityDiscoveryService: {
    discoverCommunities: mocks.discoverCommunities,
    buildSections: mocks.buildSections,
    fetchCommunityPreview: mocks.fetchCommunityPreview,
    hydrateApprovedPost: mocks.hydrateApprovedPost,
    getCategoryLabel: mocks.getCategoryLabel,
  },
}));

vi.mock('../../services/communityService', () => ({
  communityService: {
    upsertApprovalEvent: mocks.upsertApprovalEvent,
  },
}));

vi.mock('../../services/nostr/NostrService', () => ({
  nostrService: {
    getRelayStatuses: mocks.getRelayStatuses,
    subscribeToCommunityApprovals: mocks.subscribeToCommunityApprovals,
    unsubscribe: mocks.unsubscribe,
  },
}));

import { ExternalCommunitiesBrowser } from '../../components/ExternalCommunitiesBrowser';

const makeCommunity = (index: number) => ({
  community: {
    id: `dev-${index}`,
    address: `34550:pubkey:dev-${index}`,
    name: `Dev ${index}`,
    description: `Developer group ${index}`,
    moderators: ['mod1'],
    relays: ['wss://relay.example'],
    creatorPubkey: 'creator',
    image: index === 0 ? 'https://example.com/banner.png' : undefined,
  },
  board: {
    id: `34550:pubkey:dev-${index}`,
    name: `Dev ${index}`,
    description: `Developer group ${index}`,
    memberCount: 10 + index,
    communityAddress: `34550:pubkey:dev-${index}`,
    isPublic: true,
    isReadOnly: true,
    type: BoardType.TOPIC,
  },
  category: 'technology' as const,
  discoveryScore: 100 - index,
  approvalCount: 20 - index,
  recentApprovalCount: 5,
  latestApprovalAt: Date.now(),
});

describe('ExternalCommunitiesBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRelayStatuses.mockReturnValue([
      { url: 'wss://relay.one', isConnected: true },
      { url: 'wss://relay.two', isConnected: false },
    ]);
    mocks.subscribeToCommunityApprovals.mockReturnValue('sub-1');
    mocks.hydrateApprovedPost.mockResolvedValue(null);
  });

  it('shows section pagination and reveals more communities on demand', async () => {
    const discovered = Array.from({ length: 14 }, (_, index) => makeCommunity(index));
    mocks.discoverCommunities.mockResolvedValue(discovered);
    mocks.buildSections.mockImplementation((entries: typeof discovered) => [
      { id: 'technology', label: 'Technology', communities: entries },
    ]);
    mocks.fetchCommunityPreview.mockResolvedValue([]);

    render(
      <ExternalCommunitiesBrowser
        externalCommunities={[]}
        onNavigateToBoard={vi.fn()}
        onJoinNostrCommunity={vi.fn(async () => 'joined-id')}
        onClose={vi.fn()}
        onSeedPost={vi.fn()}
      />,
    );

    await screen.findByText('Dev 0');
    expect(screen.getByText(/Partial relay coverage/i)).toBeInTheDocument();
    expect(screen.getByText('Dev 11')).toBeInTheDocument();
    expect(screen.queryByText('Dev 12')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Show More Technology'));

    expect(await screen.findByText('Dev 12')).toBeInTheDocument();
    expect(screen.getByText('Dev 13')).toBeInTheDocument();
  });

  it('adds a community manually and refreshes discovery', async () => {
    const discovered = [makeCommunity(0)];
    const onJoinNostrCommunity = vi.fn(async () => discovered[0].board.id);

    mocks.discoverCommunities.mockResolvedValue(discovered);
    mocks.buildSections.mockImplementation((entries: typeof discovered) => [
      { id: 'technology', label: 'Technology', communities: entries },
    ]);
    mocks.fetchCommunityPreview.mockResolvedValue([
      {
        id: 'post-1',
        boardId: discovered[0].board.id,
        source: 'nostr-community' as const,
        title: 'Popular post',
        author: 'alice',
        content: 'Hello world',
        timestamp: Date.now(),
        score: 12,
        commentCount: 0,
        tags: ['nostr'],
        comments: [],
        upvotes: 12,
        downvotes: 0,
      },
    ]);

    render(
      <ExternalCommunitiesBrowser
        externalCommunities={[]}
        onNavigateToBoard={vi.fn()}
        onJoinNostrCommunity={onJoinNostrCommunity}
        onClose={vi.fn()}
        onSeedPost={vi.fn()}
      />,
    );

    await screen.findByText('Dev 0');
    fireEvent.change(screen.getByPlaceholderText('34550:pubkey:community or naddr...'), {
      target: { value: 'naddr1example' },
    });
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() => {
      expect(onJoinNostrCommunity).toHaveBeenCalledWith('naddr1example');
    });
    expect(
      await screen.findByText('Community added to your saved external communities.'),
    ).toBeInTheDocument();
    expect(mocks.discoverCommunities).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Popular post')).toBeInTheDocument();
  });

  it('shows offline relay messaging when no relays are connected', async () => {
    const discovered = [makeCommunity(0)];
    mocks.getRelayStatuses.mockReturnValue([
      { url: 'wss://relay.one', isConnected: false },
      { url: 'wss://relay.two', isConnected: false },
    ]);
    mocks.discoverCommunities.mockResolvedValue(discovered);
    mocks.buildSections.mockImplementation((entries: typeof discovered) => [
      { id: 'technology', label: 'Technology', communities: entries },
    ]);
    mocks.fetchCommunityPreview.mockResolvedValue([]);

    render(
      <ExternalCommunitiesBrowser
        externalCommunities={[]}
        onNavigateToBoard={vi.fn()}
        onJoinNostrCommunity={vi.fn(async () => 'joined-id')}
        onClose={vi.fn()}
        onSeedPost={vi.fn()}
      />,
    );

    expect(await screen.findByText(/No read relays are connected/i)).toBeInTheDocument();
  });

  it('merges live approved posts while a community is selected', async () => {
    const discovered = [makeCommunity(0)];
    let approvalHandler: ((event: { id: string }) => Promise<void>) | undefined;

    mocks.discoverCommunities.mockResolvedValue(discovered);
    mocks.buildSections.mockImplementation((entries: typeof discovered) => [
      { id: 'technology', label: 'Technology', communities: entries },
    ]);
    mocks.fetchCommunityPreview.mockResolvedValue([]);
    mocks.subscribeToCommunityApprovals.mockImplementation(
      (_address: string, handler: (event: { id: string }) => Promise<void>) => {
        approvalHandler = handler;
        return 'sub-1';
      },
    );
    mocks.hydrateApprovedPost.mockResolvedValue({
      id: 'live-post-1',
      boardId: discovered[0].board.id,
      source: 'nostr-community',
      title: 'Live approved post',
      author: 'bob',
      content: 'fresh from relays',
      timestamp: Date.now(),
      score: 9,
      commentCount: 0,
      tags: [],
      comments: [],
      upvotes: 9,
      downvotes: 0,
    });

    render(
      <ExternalCommunitiesBrowser
        externalCommunities={[]}
        onNavigateToBoard={vi.fn()}
        onJoinNostrCommunity={vi.fn(async () => 'joined-id')}
        onClose={vi.fn()}
        onSeedPost={vi.fn()}
      />,
    );

    await screen.findByText('Dev 0');
    await waitFor(() => {
      expect(mocks.subscribeToCommunityApprovals).toHaveBeenCalled();
    });

    await act(async () => {
      await approvalHandler?.({ id: 'approval-live-1' });
    });

    expect(await screen.findByText('Live approved post')).toBeInTheDocument();
    expect(mocks.hydrateApprovedPost).toHaveBeenCalledWith(discovered[0].board, 'approval-live-1');
  });
});
