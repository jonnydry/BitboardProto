import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/loggingService', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { notificationServiceV2 } from '../../services/notificationServiceV2';

describe('notificationServiceV2', () => {
  beforeEach(() => {
    localStorage.clear();
    notificationServiceV2.cleanup();
  });

  it('notifies subscribers when DM notifications are created and read', async () => {
    const listener = vi.fn();
    notificationServiceV2.subscribe(listener);

    await notificationServiceV2.initialize('user-pubkey');
    const notification = notificationServiceV2.createDM({
      fromPubkey: 'sender-pubkey',
      messageId: 'dm-1',
      preview: 'hello',
    });

    expect(notification).not.toBeNull();
    expect(notificationServiceV2.getUnreadCount()).toBe(1);

    notificationServiceV2.markAllAsRead();

    expect(notificationServiceV2.getUnreadCount()).toBe(0);
    expect(listener).toHaveBeenCalled();
  });
});
