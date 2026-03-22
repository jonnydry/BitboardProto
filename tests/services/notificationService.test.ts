import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/loggingService', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { notificationService, NotificationType } from '../../services/notificationService';

describe('notificationService', () => {
  beforeEach(() => {
    notificationService.cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('notifies subscribers when system notifications are created and read', async () => {
    const listener = vi.fn();
    notificationService.subscribe(listener);

    await notificationService.initialize('user-pubkey');
    const notification = notificationService.createSystem({ title: 'System', preview: 'hello' });

    expect(notification).not.toBeNull();
    expect(notificationService.getUnreadCount()).toBe(1);

    notificationService.markAllAsRead();

    expect(notificationService.getUnreadCount()).toBe(0);
    expect(listener).toHaveBeenCalled();
  });

  it('suppresses notifications from muted pubkeys', async () => {
    await notificationService.initialize('user-pubkey');
    notificationService.mutePubkey('muted-pubkey');

    const notification = notificationService.createFollow({ fromPubkey: 'muted-pubkey' });

    expect(notification).toBeNull();
    expect(notificationService.getUnreadCount()).toBe(0);
  });

  it('persists notifications and preferences for the active user across reinitialize', async () => {
    await notificationService.initialize('user-pubkey');
    await notificationService.updatePreferences({ enableVotes: true });
    notificationService.createSystem({ title: 'System', preview: 'saved notification' });
    notificationService.cleanup();

    await notificationService.initialize('user-pubkey');

    expect(notificationService.getAll()).toHaveLength(1);
    expect(notificationService.getPreferences().enableVotes).toBe(true);
  });

  it('deduplicates event notifications and cleanup removes stale listeners', async () => {
    const listener = vi.fn();
    notificationService.subscribe(listener);
    await notificationService.initialize('user-pubkey');

    const event = {
      id: 'evt-1',
      kind: 1,
      pubkey: 'author-pubkey',
      created_at: Math.floor(Date.now() / 1000),
      tags: [['e', 'post-1']],
      content: 'hello world',
      sig: 'sig',
    };

    expect(notificationService.createFromEvent(event, NotificationType.MENTION)).not.toBeNull();
    expect(notificationService.createFromEvent(event, NotificationType.MENTION)).toBeNull();
    expect(notificationService.getUnreadCount()).toBe(1);

    notificationService.cleanup();
    listener.mockClear();
    await notificationService.initialize('new-user-pubkey');
    expect(listener).not.toHaveBeenCalled();
  });

  it('respects disabled notification types and quiet hours', async () => {
    await notificationService.initialize('user-pubkey');
    await notificationService.updatePreferences({ enableMentions: false });

    vi.setSystemTime(new Date('2026-03-17T23:00:00.000Z'));
    const mockedHour = new Date().getHours();
    await notificationService.updatePreferences({
      quietHoursEnabled: true,
      quietHoursStart: mockedHour,
      quietHoursEnd: (mockedHour + 1) % 24,
    });

    const mention = notificationService.createFromEvent(
      {
        id: 'evt-quiet',
        kind: 1,
        pubkey: 'author-pubkey',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['e', 'post-1']],
        content: 'hello world',
        sig: 'sig',
      },
      NotificationType.MENTION,
    );

    const follow = notificationService.createFollow({ fromPubkey: 'sender-pubkey' });

    expect(mention).toBeNull();
    expect(follow).toBeNull();
    expect(notificationService.getUnreadCount()).toBe(0);
    vi.useRealTimers();
  });

  it('disables push when permission is denied and emits browser notifications when granted', async () => {
    const requestPermission = vi.fn(async () => 'denied' as NotificationPermission);
    const NotificationMock = vi.fn();
    Object.assign(NotificationMock, {
      permission: 'default',
      requestPermission,
    });
    vi.stubGlobal('Notification', NotificationMock as unknown as typeof Notification);
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      writable: true,
      value: NotificationMock,
    });
    Object.defineProperty(global.navigator, 'serviceWorker', {
      configurable: true,
      value: {},
    });

    await notificationService.initialize('user-pubkey');
    await notificationService.updatePreferences({ pushEnabled: true });
    expect(notificationService.getPreferences().pushEnabled).toBe(false);

    const grantedPermission = vi.fn(async () => 'granted' as NotificationPermission);
    Object.assign(NotificationMock, {
      permission: 'granted',
      requestPermission: grantedPermission,
    });

    await notificationService.updatePreferences({
      pushEnabled: false,
      enableFollows: true,
      quietHoursEnabled: false,
      mutedPubkeys: [],
    });
    await notificationService.updatePreferences({ pushEnabled: true });
    const notification = notificationService.createFollow({
      fromPubkey: 'sender-pubkey',
      fromDisplayName: 'Sender',
      fromAvatar: '/avatar.png',
    });

    expect(grantedPermission).toHaveBeenCalled();
    expect(notificationService.getPreferences().pushEnabled).toBe(true);
    expect(notification).not.toBeNull();
  });
});
