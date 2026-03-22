import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  discoverSeedCandidates: vi.fn(),
  fetchLinkPreview: vi.fn(),
  getCachedPreview: vi.fn(),
}));

vi.mock('../../services/nostrDiscoveryService', () => ({
  nostrDiscoveryService: {
    discoverSeedCandidates: mocks.discoverSeedCandidates,
  },
}));

vi.mock('../../components/ExternalCommunitiesBrowser', () => ({
  ExternalCommunitiesBrowser: () => <div>Embedded Communities Browser</div>,
}));

vi.mock('../../services/linkPreviewService', () => ({
  fetchLinkPreview: mocks.fetchLinkPreview,
  getCachedPreview: mocks.getCachedPreview,
}));

import { NostrDiscoveryBrowser } from '../../components/NostrDiscoveryBrowser';

describe('NostrDiscoveryBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCachedPreview.mockReturnValue(undefined);
    mocks.fetchLinkPreview.mockResolvedValue({
      url: 'https://example.com/source',
      title: 'Example Source',
      description: 'Useful source material',
      siteName: 'example.com',
      favicon: 'https://example.com/favicon.ico',
    });
    mocks.discoverSeedCandidates.mockResolvedValue([
      {
        id: 'candidate-1',
        sourceType: 'community-approved',
        provenanceLabel: 'Approved in /n/dev',
        sourceDetail: '12 approved posts, 6 approvals this week',
        confidence: 'high',
        confidenceLabel: 'Moderator-approved',
        whyTrending: ['fresh activity', '12 moderator-approved posts in source community'],
        discoveryScore: 42,
        communityName: '/n/dev',
        post: {
          id: 'candidate-1',
          boardId: '__discover_nostr__',
          source: 'nostr-community',
          title: 'Nostr dev post',
          author: 'alice',
          content: 'Interesting content',
          url: 'https://example.com/source',
          timestamp: Date.now(),
          score: 0,
          commentCount: 0,
          tags: ['nostr'],
          comments: [],
          upvotes: 0,
          downvotes: 0,
        },
      },
    ]);
  });

  it('loads trending candidates and allows seeding', async () => {
    const onSeedPost = vi.fn();

    render(
      <NostrDiscoveryBrowser
        externalCommunities={[]}
        onNavigateToBoard={vi.fn()}
        onJoinNostrCommunity={vi.fn(async () => 'joined-id')}
        onClose={vi.fn()}
        onSeedPost={onSeedPost}
      />,
    );

    expect(await screen.findByText('Nostr dev post')).toBeInTheDocument();
    expect(await screen.findByText('Example Source')).toBeInTheDocument();
    expect(screen.getByText('Moderator-approved')).toBeInTheDocument();
    expect(screen.getByText(/Why: fresh activity/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Seed To BitBoard'));
    expect(onSeedPost).toHaveBeenCalled();
  });

  it('switches to the communities tab', async () => {
    render(
      <NostrDiscoveryBrowser
        externalCommunities={[]}
        onNavigateToBoard={vi.fn()}
        onJoinNostrCommunity={vi.fn(async () => 'joined-id')}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(mocks.discoverSeedCandidates).toHaveBeenCalled());
    fireEvent.click(screen.getByText('Communities'));
    expect(await screen.findByText('Embedded Communities Browser')).toBeInTheDocument();
  });

  it('switches to biggest posts mode and reloads discovery', async () => {
    render(
      <NostrDiscoveryBrowser
        externalCommunities={[]}
        onNavigateToBoard={vi.fn()}
        onJoinNostrCommunity={vi.fn(async () => 'joined-id')}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(mocks.discoverSeedCandidates).toHaveBeenCalled());
    fireEvent.click(screen.getByText('Biggest Posts'));

    await waitFor(() =>
      expect(mocks.discoverSeedCandidates).toHaveBeenLastCalledWith(
        expect.objectContaining({ rankingMode: 'biggest' }),
      ),
    );
    expect(screen.getByText(/highest-performing posts across nostr/i)).toBeInTheDocument();
  });

  it('shows diagnostics when expanded', async () => {
    render(
      <NostrDiscoveryBrowser
        externalCommunities={[]}
        onNavigateToBoard={vi.fn()}
        onJoinNostrCommunity={vi.fn(async () => 'joined-id')}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(mocks.discoverSeedCandidates).toHaveBeenCalled());
    fireEvent.click(screen.getByText('Diagnostics'));
    expect((await screen.findAllByText('Source Mix')).length).toBeGreaterThan(1);
    expect(screen.getByText('Confidence Mix')).toBeInTheDocument();
  });
});
