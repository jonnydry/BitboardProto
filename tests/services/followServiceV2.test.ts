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

  it('rejects invalid follow states and rolls back failed publish attempts', async () => {
    expect(await followServiceV2.follow('alice')).toBe(false);

    await followServiceV2.initialize('author-pubkey');
    expect(await followServiceV2.follow('author-pubkey')).toBe(false);

    nostrServiceMock.publishSignedEvent.mockRejectedValueOnce(new Error('relay failed'));
    const followResult = await followServiceV2.follow('charlie', {
      petname: 'Chuck',
      relay: 'wss://relay',
    });
    expect(followResult).toBe(false);
    expect(followServiceV2.isFollowing('charlie')).toBe(false);

    await followServiceV2.follow('bob');
    nostrServiceMock.publishSignedEvent.mockRejectedValueOnce(new Error('relay failed'));
    const unfollowResult = await followServiceV2.unfollow('bob');
    expect(unfollowResult).toBe(false);
    expect(followServiceV2.isFollowing('bob')).toBe(true);
  });

  it('preserves petnames and relays in contact events and persists active-user storage', async () => {
    await followServiceV2.initialize('author-pubkey');
    await followServiceV2.follow('charlie', { petname: 'Chuck', relay: 'wss://relay-charlie' });

    const signedArg = identityServiceMock.signEvent.mock.calls.at(-1)?.[0] as {
      tags: string[][];
    };
    expect(signedArg.tags).toContainEqual(['p', 'charlie', 'wss://relay-charlie', 'Chuck']);

    followServiceV2.cleanup();
    await followServiceV2.initialize('author-pubkey');
    expect(followServiceV2.getFollowingPubkeys()).toContain('charlie');

    followServiceV2.cleanup();
    await followServiceV2.initialize('other-user');
    expect(followServiceV2.getFollowingPubkeys()).toEqual([]);
  });

  it('dedupes follower queries by latest author contact list and exposes stats', async () => {
    await followServiceV2.initialize('author-pubkey');
    nostrServiceMock.queryEvents.mockResolvedValue([
      {
        id: 'old-a',
        created_at: 100,
        pubkey: 'alice',
        tags: [['p', 'author-pubkey']],
        content: '',
        kind: 3,
        sig: 'sig',
      },
      {
        id: 'new-a',
        created_at: 200,
        pubkey: 'alice',
        tags: [['p', 'author-pubkey']],
        content: '',
        kind: 3,
        sig: 'sig',
      },
      {
        id: 'new-b',
        created_at: 150,
        pubkey: 'bob',
        tags: [['p', 'someone-else']],
        content: '',
        kind: 3,
        sig: 'sig',
      },
      {
        id: 'new-c',
        created_at: 175,
        pubkey: 'carol',
        tags: [['p', 'author-pubkey']],
        content: '',
        kind: 3,
        sig: 'sig',
      },
    ]);

    const followers = await followServiceV2.fetchFollowers('author-pubkey');
    expect(followers.map((f) => f.pubkey).sort()).toEqual(['alice', 'carol']);
    expect(followServiceV2.getStats()).toEqual({ followingCount: 0, followersCount: 2 });
  });
});
