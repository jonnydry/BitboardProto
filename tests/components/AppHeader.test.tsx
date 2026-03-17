import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeId, ViewMode } from '../../types';

const mocks = vi.hoisted(() => {
  const notificationState = { unreadCount: 3 };
  const uiState = {
    theme: 'amber',
    isNostrConnected: true,
    viewMode: 'FEED',
    bookmarkedIds: ['a', 'b'],
    setViewMode: vi.fn(),
  };
  const userState = {
    userState: {
      bits: 4,
      maxBits: 8,
      identity: { pubkey: 'p'.repeat(64), npub: 'npub-test', displayName: 'Alice' },
    },
  };
  const boardState = { activeBoardId: null };
  return {
    notificationState,
    uiState,
    userState,
    boardState,
    navigateToBoard: vi.fn(),
    subscribe: vi.fn((listener: () => void) => {
      listener();
      return () => undefined;
    }),
  };
});

vi.mock('../../services/notificationService', () => ({
  notificationService: {
    subscribe: mocks.subscribe,
    getUnreadCount: () => mocks.notificationState.unreadCount,
  },
}));

vi.mock('../../services/profileService', () => ({
  profileService: {
    getCachedProfileSync: vi.fn(() => ({ name: 'Alice Profile', picture: '' })),
  },
}));

vi.mock('../../components/NotificationCenterV2', () => ({
  NotificationCenterV2: ({ onClose }: { onClose: () => void }) => (
    <div>
      <span>Notification Center</span>
      <button onClick={onClose}>Close Notifications</button>
    </div>
  ),
}));

vi.mock('../../components/NetworkIndicator', () => ({
  NetworkIndicator: () => <div>NetworkIndicator</div>,
  InlineNetworkStatus: () => <div>InlineNetworkStatus</div>,
}));

vi.mock('../../stores/uiStore', () => ({
  useUIStore: (selector: (state: typeof mocks.uiState) => unknown) => selector(mocks.uiState),
}));

vi.mock('../../stores/userStore', () => ({
  useUserStore: (selector: (state: typeof mocks.userState) => unknown) => selector(mocks.userState),
}));

vi.mock('../../stores/boardStore', () => ({
  useBoardStore: (selector: (state: typeof mocks.boardState) => unknown) =>
    selector(mocks.boardState),
}));

vi.mock('../../features/layout/useAppNavigationHandlers', () => ({
  useAppNavigationHandlers: () => ({ navigateToBoard: mocks.navigateToBoard }),
}));

import { AppHeader } from '../../features/layout/AppHeader';

describe('AppHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notificationState.unreadCount = 3;
    mocks.uiState.viewMode = 'FEED';
    mocks.boardState.activeBoardId = null;
  });

  it('opens drawer from the mobile menu button', () => {
    const onOpenDrawer = vi.fn();
    render(<AppHeader onOpenDrawer={onOpenDrawer} />);

    fireEvent.click(screen.getByLabelText('Open menu'));
    expect(onOpenDrawer).toHaveBeenCalled();
  });

  it('shows notification count and opens/closes the notification center', () => {
    render(<AppHeader />);

    fireEvent.click(screen.getByTitle('Notifications'));
    expect(screen.getByText('Notification Center')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Notification Center')).not.toBeInTheDocument();
  });

  it('toggles the bits panel and closes it on outside click', () => {
    render(<AppHeader />);

    fireEvent.click(screen.getByTitle('Bits — click to learn more'));
    expect(screen.getByText('How bits work')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('How bits work')).not.toBeInTheDocument();
  });
});
