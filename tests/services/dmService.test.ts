import { beforeEach, describe, expect, it, vi } from 'vitest';

const { nostrServiceMock, cryptoServiceMock, identityServiceMock } = vi.hoisted(() => ({
  nostrServiceMock: {
    publishSignedEvent: vi.fn(),
    queryEvents: vi.fn(),
    subscribeToFilters: vi.fn(),
    unsubscribe: vi.fn(),
  },
  cryptoServiceMock: {
    encryptNIP04: vi.fn(),
    decryptNIP04: vi.fn(),
    unwrapGiftWrap: vi.fn(),
  },
  identityServiceMock: {
    signEvent: vi.fn(),
    getIdentity: vi.fn(),
  },
}));

vi.mock('../../services/nostr/NostrService', () => ({
  nostrService: nostrServiceMock,
}));

vi.mock('../../services/cryptoService', () => ({
  cryptoService: cryptoServiceMock,
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

import { dmService } from '../../services/dmService';

describe('dmService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dmService.cleanup();
    localStorage.clear();

    identityServiceMock.getIdentity.mockReturnValue({
      kind: 'local',
      pubkey: 'author-pubkey',
      privkey: 'privkey-hex',
      npub: 'npub-test',
      displayName: 'test',
    });
    cryptoServiceMock.encryptNIP04.mockResolvedValue('encrypted-body');
    cryptoServiceMock.decryptNIP04.mockImplementation(
      async (content: string) => `decrypted:${content}`,
    );
    cryptoServiceMock.unwrapGiftWrap.mockResolvedValue(null);
    identityServiceMock.signEvent.mockImplementation(async (event: unknown) => ({
      ...(event as Record<string, unknown>),
      id: 'signed-id',
      sig: 'signed-sig',
    }));
    nostrServiceMock.publishSignedEvent.mockImplementation(async (event: any) => ({
      ...event,
      id: 'event-1',
      content: 'encrypted-body',
      created_at: 123,
    }));
    nostrServiceMock.queryEvents.mockResolvedValue([]);
    nostrServiceMock.subscribeToFilters.mockReturnValue('sub-1');
  });

  it('publishes encrypted direct messages and stores them locally', async () => {
    dmService.initialize('author-pubkey');

    const message = await dmService.sendMessage({
      recipientPubkey: 'recipient-pubkey',
      content: 'hello there',
    });

    expect(cryptoServiceMock.encryptNIP04).toHaveBeenCalledWith(
      'hello there',
      'privkey-hex',
      'recipient-pubkey',
    );
    expect(identityServiceMock.signEvent).toHaveBeenCalled();
    expect(nostrServiceMock.publishSignedEvent).toHaveBeenCalled();
    expect(message?.nostrEventId).toBe('event-1');
    expect(dmService.getConversation('recipient-pubkey')?.messages).toHaveLength(1);
  });

  it('fetches and decrypts DM history from relays', async () => {
    dmService.initialize('author-pubkey');

    nostrServiceMock.queryEvents
      .mockResolvedValueOnce([
        {
          id: 'sent-1',
          kind: 4,
          pubkey: 'author-pubkey',
          created_at: 10,
          tags: [['p', 'recipient-pubkey']],
          content: 'enc-sent',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'recv-1',
          kind: 4,
          pubkey: 'recipient-pubkey',
          created_at: 20,
          tags: [['p', 'author-pubkey']],
          content: 'enc-recv',
        },
      ]);

    const messages = await dmService.fetchMessages();

    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('decrypted:enc-sent');
    expect(messages[1].content).toBe('decrypted:enc-recv');
    expect(dmService.getConversation('recipient-pubkey')?.messages).toHaveLength(2);
  });

  it('subscribes to realtime messages and appends new events', async () => {
    dmService.initialize('author-pubkey');

    let onEvent: ((event: any) => void) | undefined;
    nostrServiceMock.subscribeToFilters.mockImplementation((_, handlers) => {
      onEvent = handlers.onEvent;
      return 'sub-1';
    });

    dmService.subscribeToMessages();

    onEvent?.({
      id: 'recv-live',
      kind: 4,
      pubkey: 'recipient-pubkey',
      created_at: 33,
      tags: [['p', 'author-pubkey']],
      content: 'enc-live',
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(dmService.getConversation('recipient-pubkey')?.messages.at(-1)?.content).toBe(
      'decrypted:enc-live',
    );
  });
});
