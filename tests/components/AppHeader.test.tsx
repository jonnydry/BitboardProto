import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const notificationState = { unreadCount: 3 };
  const uiState = {
    theme: 'amber',
    isNostrConnected: true,
    viewMode: 'FEED',
    showSearch: false,
    bookmarkedIds: ['a', 'b'],
    setViewMode: vi.fn(),
    setShowSearch: vi.fn((value: boolean) => {
      uiState.showSearch = value;
    }),
    setProfileUser: vi.fn(),
  };
  const userState = {
    userState: {
      bits: 4,
      maxBits: 8,
      identity: { pubkey: 'p'.repeat(64), npub: 'npub-test', displayName: 'Alice' },
    },
  };
  const boardState = {
    activeBoardId: null,
    setActiveBoardId: vi.fn((value: string | null) => {
      boardState.activeBoardId = value;
    }),
  };
  const postState = { setSelectedPostId: vi.fn() };
  return {
    notificationState,
    uiState,
    userState,
    boardState,
    postState,
    navigateToBoard: vi.fn(),
    handleViewBit: vi.fn(),
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

vi.mock('../../components/AdvancedSearch', () => ({
  AdvancedSearch: ({ onResultClick }: { onResultClick?: (result: any) => void }) => (
    <button
      onClick={() =>
        onResultClick?.({ id: 'post-1', type: 'post', authorPubkey: 'author', boardId: 'b-tech' })
      }
    >
      Open Search Result
    </button>
  ),
}));

vi.mock('../../components/NotificationCenterV2', () => ({
  NotificationCenterV2: ({
    onClose,
    onNavigate,
  }: {
    onClose: () => void;
    onNavigate?: (deepLink: any) => void;
  }) => (
    <div>
      <span>Notification Center</span>
      <button onClick={onClose}>Close Notifications</button>
      <button
        onClick={() =>
          onNavigate?.({ viewMode: 'SINGLE_BIT', postId: 'post-1', boardId: 'b-tech' })
        }
      >
        Open Notification Link
      </button>
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

vi.mock('../../stores/postStore', () => ({
  usePostStore: (selector: (state: typeof mocks.postState) => unknown) => selector(mocks.postState),
}));

vi.mock('../../features/layout/useAppNavigationHandlers', () => ({
  useAppNavigationHandlers: () => ({
    navigateToBoard: mocks.navigateToBoard,
    handleViewBit: mocks.handleViewBit,
  }),
}));

import { AppHeader } from '../../features/layout/AppHeader';

describe('AppHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notificationState.unreadCount = 3;
    mocks.uiState.viewMode = 'FEED';
    mocks.uiState.showSearch = false;
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

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('How bits work')).not.toBeInTheDocument();
  });

  it('navigates search results to the selected post and board', async () => {
    mocks.uiState.showSearch = true;
    render(<AppHeader />);

    expect(await screen.findByText('Open Search Result')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Open Search Result'));

    expect(mocks.boardState.setActiveBoardId).toHaveBeenCalledWith('b-tech');
    expect(mocks.handleViewBit).toHaveBeenCalledWith('post-1');
  });

  it('passes deep-link navigation into the notification center', () => {
    render(<AppHeader />);

    fireEvent.click(screen.getByTitle('Notifications'));
    fireEvent.click(screen.getByText('Open Notification Link'));

    expect(mocks.boardState.setActiveBoardId).toHaveBeenCalledWith('b-tech');
    expect(mocks.postState.setSelectedPostId).toHaveBeenCalledWith('post-1');
    expect(mocks.uiState.setViewMode).toHaveBeenCalledWith('SINGLE_BIT');
  });
});
