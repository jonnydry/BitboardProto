import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardType, ThemeId, ViewMode } from '../../types';

const mocks = vi.hoisted(() => ({
  nearbyChannels: [
    { geohash: 'abcd1234', postCount: 5, uniqueAuthors: 2 },
    { geohash: 'efgh5678', postCount: 2, uniqueAuthors: 1 },
  ],
  relayStatuses: [
    { url: 'wss://relay.one', isConnected: true, nextReconnectTime: null, lastError: null },
    {
      url: 'wss://relay.two',
      isConnected: false,
      nextReconnectTime: Date.now() + 1000,
      lastError: null,
    },
  ],
  discoverNearbyChannels: vi.fn(async () => ({ channels: [] })),
  channelToBoard: vi.fn((channel: any) => ({ id: `geo-${channel.geohash}` })),
  getCachedResult: vi.fn(() => ({ channels: [] })),
  isRecentlyActive: vi.fn(() => true),
  getCachedPosition: vi.fn(() => ({ coords: { latitude: 1, longitude: 2 } })),
  getEncryptedBoardIds: vi.fn(() => ['secure-1', 'broken-1']),
}));

vi.mock('../../services/geonetDiscoveryService', () => ({
  geonetDiscoveryService: {
    getCachedResult: mocks.getCachedResult,
    discoverNearbyChannels: mocks.discoverNearbyChannels,
    channelToBoard: mocks.channelToBoard,
    isRecentlyActive: mocks.isRecentlyActive,
  },
}));

vi.mock('../../services/geohashService', () => ({
  geohashService: {
    getCachedPosition: mocks.getCachedPosition,
  },
}));

vi.mock('../../services/encryptedBoardService', () => ({
  encryptedBoardService: {
    getEncryptedBoardIds: mocks.getEncryptedBoardIds,
  },
}));

vi.mock('../../services/nostr/NostrService', () => ({
  nostrService: {
    getRelayStatuses: vi.fn(() => mocks.relayStatuses),
  },
}));

import { Sidebar } from '../../features/layout/Sidebar';

describe('Sidebar', () => {
  const baseProps = {
    userState: { identity: { npub: 'npub123', pubkey: 'p'.repeat(64) }, username: 'alice' },
    setUserState: vi.fn(),
    theme: ThemeId.AMBER,
    setTheme: vi.fn(),
    getThemeColor: vi.fn(() => '#fff000'),
    isNostrConnected: true,
    viewMode: ViewMode.FEED,
    activeBoardId: null,
    feedFilter: 'all',
    setFeedFilter: vi.fn(),
    topicBoards: [
      {
        id: 'pub-1',
        name: 'Public One',
        description: 'Public board',
        memberCount: 0,
        type: BoardType.TOPIC,
        isPublic: true,
      },
      {
        id: 'pub-2',
        name: 'Public Two',
        description: 'Public board',
        memberCount: 0,
        type: BoardType.TOPIC,
        isPublic: true,
      },
      {
        id: 'priv-1',
        name: 'Private One',
        description: 'Private board',
        memberCount: 0,
        type: BoardType.TOPIC,
        isPublic: false,
      },
    ],
    geohashBoards: [
      {
        id: 'geo-1',
        name: 'Geo One',
        description: 'Geo board',
        memberCount: 0,
        isPublic: true,
        geohash: 'abcd1234',
        type: BoardType.GEOHASH,
      },
    ],
    externalCommunities: [],
    boardsById: new Map([
      [
        'secure-1',
        {
          id: 'secure-1',
          name: 'Secure One',
          description: 'Encrypted board',
          memberCount: 0,
          isPublic: false,
          isEncrypted: true,
          type: BoardType.TOPIC,
        },
      ],
      [
        'broken-1',
        {
          id: 'broken-1',
          name: 'Broken One',
          description: 'Broken encrypted board',
          memberCount: 0,
          isPublic: false,
          isEncrypted: true,
          type: BoardType.TOPIC,
        },
      ],
    ]),
    decryptionFailedBoardIds: new Set(['broken-1']),
    removeFailedDecryptionKey: vi.fn(),
    navigateToBoard: vi.fn(),
    onSetViewMode: vi.fn(),
    onRequestCloseNav: vi.fn(),
    layout: 'inline' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCachedPosition.mockReturnValue(
      null as unknown as { coords: { latitude: number; longitude: number } },
    );
    mocks.getCachedResult.mockReturnValue({ channels: [] });
  });

  it('navigates to a topic board and closes the nav', () => {
    act(() => {
      render(<Sidebar {...baseProps} />);
    });

    fireEvent.click(screen.getByText('Public One'));
    expect(baseProps.navigateToBoard).toHaveBeenCalledWith('pub-1');
    expect(baseProps.onRequestCloseNav).toHaveBeenCalled();
  });

  it('navigates to a secure board and closes the nav', () => {
    act(() => {
      render(<Sidebar {...baseProps} layout="drawer" />);
    });

    fireEvent.click(screen.getByText('Secure One'));
    expect(baseProps.navigateToBoard).toHaveBeenCalledWith('secure-1');
    expect(baseProps.onRequestCloseNav).toHaveBeenCalled();
  });

  it('removes a failed decryption key', () => {
    act(() => {
      render(<Sidebar {...baseProps} layout="drawer" />);
    });

    fireEvent.click(screen.getByRole('button', { name: /SECURE_NET/i }));
    fireEvent.click(screen.getByTitle('Remove invalid key'));
    expect(baseProps.removeFailedDecryptionKey).toHaveBeenCalledWith('broken-1');
  });

  it('opens identity settings and closes the nav', () => {
    act(() => {
      render(<Sidebar {...baseProps} layout="drawer" />);
    });

    fireEvent.click(screen.getByText('Keys'));
    expect(baseProps.onSetViewMode).toHaveBeenCalledWith(ViewMode.IDENTITY);
    expect(baseProps.onRequestCloseNav).toHaveBeenCalled();
  });

  it('changes the theme', () => {
    act(() => {
      render(<Sidebar {...baseProps} />);
    });

    fireEvent.click(screen.getByText('Phosphor'));
    expect(baseProps.setTheme).toHaveBeenCalledWith(ThemeId.PHOSPHOR);
  });

  it('changes the feed filter', () => {
    act(() => {
      render(<Sidebar {...baseProps} />);
    });

    fireEvent.click(screen.getByText('TOPIC'));
    expect(baseProps.setFeedFilter).toHaveBeenCalledWith('topic');
  });
});
