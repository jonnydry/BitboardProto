import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewMode } from '../../types';

const mocks = vi.hoisted(() => ({
  uiState: {
    viewMode: 'FEED',
    setViewMode: vi.fn(),
    bookmarkedIds: ['one', 'two'],
  },
  userState: {
    userState: {
      identity: { pubkey: 'p'.repeat(64), npub: 'npub-test', displayName: 'Alice' },
    },
  },
  navigateToBoard: vi.fn(),
  unreadCount: 5,
  subscribe: vi.fn((listener: () => void) => {
    listener();
    return () => undefined;
  }),
}));

vi.mock('../../services/notificationService', () => ({
  notificationService: {
    subscribe: mocks.subscribe,
    getUnreadCount: () => mocks.unreadCount,
  },
}));

vi.mock('../../stores/uiStore', () => ({
  useUIStore: (selector: (state: typeof mocks.uiState) => unknown) => selector(mocks.uiState),
}));

vi.mock('../../stores/userStore', () => ({
  useUserStore: (selector: (state: typeof mocks.userState) => unknown) => selector(mocks.userState),
}));

vi.mock('../../features/layout/useAppNavigationHandlers', () => ({
  useAppNavigationHandlers: () => ({ navigateToBoard: mocks.navigateToBoard }),
}));

import { MobileNav } from '../../features/layout/MobileNav';

describe('MobileNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.uiState.viewMode = 'FEED';
    mocks.unreadCount = 5;
  });

  it('renders badges and navigates to other views', () => {
    render(<MobileNav />);

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('NEW'));
    expect(mocks.uiState.setViewMode).toHaveBeenCalledWith(ViewMode.CREATE);
  });

  it('double-tap home scrolls to top and otherwise navigates global', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    render(<MobileNav />);

    fireEvent.click(screen.getByLabelText('HOME'));
    expect(mocks.navigateToBoard).toHaveBeenCalledWith(null);

    fireEvent.click(screen.getByLabelText('HOME'));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.click(screen.getByLabelText('HOME'));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    act(() => {
      vi.advanceTimersByTime(500);
    });
  });
});
