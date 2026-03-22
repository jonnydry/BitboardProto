import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const notifications = [
    {
      id: 'n1',
      type: 'mention',
      timestamp: Date.now(),
      isRead: false,
      fromPubkey: 'alice',
      fromDisplayName: 'Alice',
      preview: 'hello there',
      deepLink: { viewMode: 'SINGLE_BIT', postId: 'post-1' },
    },
    {
      id: 'n2',
      type: 'system',
      timestamp: Date.now() - 1000,
      isRead: true,
      title: 'System notice',
      preview: 'system preview',
    },
  ];
  return {
    notifications,
    prefs: {
      enableMentions: true,
      enableReplies: true,
      enableFollows: true,
      enableVotes: true,
      pushEnabled: false,
      pushSound: true,
      quietHoursEnabled: false,
    },
    subscribe: vi.fn((listener: () => void) => {
      listener();
      return () => undefined;
    }),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    delete: vi.fn(),
    clearAll: vi.fn(),
    updatePreferences: vi.fn(async () => undefined),
  };
});

vi.mock('../../services/notificationService', () => ({
  NotificationType: {
    MENTION: 'mention',
    REPLY: 'reply',
    FOLLOW: 'follow',
    VOTE: 'vote',
    REPOST: 'repost',
    BOARD_ACTIVITY: 'board_activity',
    SYSTEM: 'system',
  },
  notificationService: {
    getAll: vi.fn((opts?: any) => {
      if (opts?.type) return mocks.notifications.filter((n) => n.type === opts.type);
      return mocks.notifications;
    }),
    getUnreadCount: vi.fn(() => mocks.notifications.filter((n) => !n.isRead).length),
    subscribe: mocks.subscribe,
    markAsRead: mocks.markAsRead,
    markAllAsRead: mocks.markAllAsRead,
    delete: mocks.delete,
    clearAll: mocks.clearAll,
    getPreferences: vi.fn(() => mocks.prefs),
    updatePreferences: mocks.updatePreferences,
  },
}));

import { NotificationCenterV2 } from '../../components/NotificationCenterV2';

describe('NotificationCenterV2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders notifications, marks them read, deletes, and navigates', () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    render(<NotificationCenterV2 onClose={onClose} onNavigate={onNavigate} />);

    expect(screen.getByRole('heading', { name: /notifications/i })).toBeInTheDocument();
    expect(screen.getByText('Alice mentioned you')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Mark as read'));
    expect(mocks.markAsRead).toHaveBeenCalledWith('n1');

    fireEvent.click(screen.getAllByTitle('Delete')[0]);
    expect(mocks.delete).toHaveBeenCalledWith('n1');

    fireEvent.click(screen.getByText('Alice mentioned you'));
    expect(onNavigate).toHaveBeenCalledWith({ viewMode: 'SINGLE_BIT', postId: 'post-1' });
    expect(onClose).toHaveBeenCalled();
  });

  it('supports filtering, mark all read, clear all confirmation, and settings toggles', async () => {
    render(<NotificationCenterV2 onClose={() => undefined} />);

    fireEvent.click(screen.getByText('System'));
    expect(screen.getByText('System notice')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Mark all read'));
    expect(mocks.markAllAsRead).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Clear all'));
    fireEvent.click(screen.getByText('Confirm Clear All'));
    expect(mocks.clearAll).toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Settings'));
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Mentions' }));
    });
    expect(mocks.updatePreferences).toHaveBeenCalled();
  });
});
