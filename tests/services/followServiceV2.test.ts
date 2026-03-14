import { beforeEach, describe, expect, it, vi } from 'vitest';

const { nostrServiceMock, identityServiceMock } = vi.hoisted(() => ({
  nostrServiceMock: {
    fetchContactListEvent: vi.fn(),
    publishSignedEvent: vi.fn(),
    queryEvents: vi.fn(),
  },
  identityServiceMock: {
    signEvent: vi.fn(),
  },
}));

vi.mock('../../services/nostr/NostrService', () => ({
  nostrService: nostrServiceMock,
}));

vi.mock('../../services/identityService', () => ({
  identityService: identityServiceMock,
}));

vi.mock('../../services/loggingService', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { followServiceV2 } from '../../services/followServiceV2';

describe('followServiceV2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    followServiceV2.cleanup();
    localStorage.clear();

    nostrServiceMock.fetchContactListEvent.mockResolvedValue(null);
    nostrServiceMock.publishSignedEvent.mockImplementation(async (event: any) => ({
      ...event,
      id: 'contact-event-1',
    }));
    nostrServiceMock.queryEvents.mockResolvedValue([]);
    identityServiceMock.signEvent.mockImplementation(async (event: unknown) => ({
      ...(event as Record<string, unknown>),
      id: 'signed-contact',
      sig: 'sig',
    }));
  });

  it('loads follows from relays and publishes updates when following users', async () => {
    nostrServiceMock.fetchContactListEvent.mockResolvedValue({
      id: 'existing-contact-list',
      created_at: 100,
      pubkey: 'author-pubkey',
      tags: [
        ['p', 'alice'],
        ['p', 'bob', '', 'Bob'],
      ],
      content: '',
    });

    await followServiceV2.initialize('author-pubkey');

    expect(followServiceV2.getFollowingPubkeys()).toEqual(['alice', 'bob']);

    const success = await followServiceV2.follow('charlie');

    expect(success).toBe(true);
    expect(identityServiceMock.signEvent).toHaveBeenCalled();
    expect(nostrServiceMock.publishSignedEvent).toHaveBeenCalled();
    expect(followServiceV2.isFollowing('charlie')).toBe(true);
  });
});
