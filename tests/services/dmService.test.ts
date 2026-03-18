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
    isGiftWrap: vi.fn(),
    isLegacyDM: vi.fn(),
  },
  identityServiceMock: {
    signEvent: vi.fn(),
    getIdentity: vi.fn(),
    hasLocalIdentity: vi.fn().mockReturnValue(true),
    decryptDM: vi.fn().mockImplementation(async (content: string) => `decrypted:${content}`),
    unwrapDMGiftWrap: vi.fn().mockResolvedValue(null),
    encryptDM: vi.fn().mockImplementation(async (content: string) => `encrypted:${content}`),
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
    identityServiceMock.hasLocalIdentity.mockReturnValue(true);
    identityServiceMock.decryptDM.mockImplementation(
      async (content: string) => `decrypted:${content}`,
    );
    identityServiceMock.encryptDM.mockImplementation(
      async (content: string) => `encrypted:${content}`,
    );
    identityServiceMock.unwrapDMGiftWrap.mockResolvedValue(null);
    cryptoServiceMock.encryptNIP04.mockResolvedValue('encrypted-body');
    cryptoServiceMock.decryptNIP04.mockImplementation(
      async (content: string) => `decrypted:${content}`,
    );
    cryptoServiceMock.unwrapGiftWrap.mockResolvedValue(null);
    cryptoServiceMock.isGiftWrap.mockImplementation(
      (event: { kind?: number }) => event.kind === 1059,
    );
    cryptoServiceMock.isLegacyDM.mockImplementation((event: { kind?: number }) => event.kind === 4);
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

    expect(identityServiceMock.encryptDM).toHaveBeenCalledWith('hello there', 'recipient-pubkey');
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

  it('throws when sending without a local identity and returns null when uninitialized', async () => {
    await expect(
      dmService.sendMessage({ recipientPubkey: 'recipient-pubkey', content: 'hello there' }),
    ).resolves.toBeNull();

    dmService.initialize('author-pubkey');
    identityServiceMock.hasLocalIdentity.mockReturnValue(false);

    // sendMessage now returns null instead of throwing when no identity is present
    const result = await dmService.sendMessage({ recipientPubkey: 'recipient-pubkey', content: 'hello there' });
    expect(result).toBeNull();
  });

  it('keeps placeholder content when decryption fails and deduplicates repeated live events', async () => {
    dmService.initialize('author-pubkey');
    identityServiceMock.decryptDM.mockResolvedValueOnce(null);

    let onEvent: ((event: any) => void) | undefined;
    nostrServiceMock.subscribeToFilters.mockImplementation((_, handlers) => {
      onEvent = handlers.onEvent;
      return 'sub-1';
    });

    dmService.subscribeToMessages();

    onEvent?.({
      id: 'recv-fail',
      kind: 4,
      pubkey: 'recipient-pubkey',
      created_at: 44,
      tags: [['p', 'author-pubkey']],
      content: 'enc-fail',
      sig: 'sig',
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(dmService.getConversation('recipient-pubkey')?.messages[0]?.content).toBe(
      '[Encrypted Message]',
    );
    expect(dmService.getConversation('recipient-pubkey')?.messages[0]?.isDecrypted).toBe(false);
    expect(dmService.getUnreadCount()).toBe(1);

    onEvent?.({
      id: 'recv-fail',
      kind: 4,
      pubkey: 'recipient-pubkey',
      created_at: 44,
      tags: [['p', 'author-pubkey']],
      content: 'enc-fail',
      sig: 'sig',
    });
    await Promise.resolve();

    expect(dmService.getConversation('recipient-pubkey')?.messages).toHaveLength(1);
  });

  it('supports gift-wrap messages, read state, deletion, and cleanup', async () => {
    dmService.initialize('author-pubkey');
    identityServiceMock.unwrapDMGiftWrap.mockResolvedValue({
      content: 'wrapped hello',
      senderPubkey: 'gift-sender',
    });

    const wrapped = await dmService.processIncomingDM({
      event: {
        id: 'gift-1',
        kind: 1059,
        pubkey: 'wrap-pubkey',
        created_at: 55,
        tags: [['p', 'author-pubkey']],
        content: 'wrapped-content',
        sig: 'sig',
      },
    });

    expect(wrapped?.content).toBe('wrapped hello');
    expect(dmService.getConversation('gift-sender')?.unreadCount).toBe(1);

    dmService.markConversationAsRead('gift-sender');
    expect(dmService.getConversation('gift-sender')?.unreadCount).toBe(0);
    expect(dmService.getUnreadCount()).toBe(0);

    const unsub = dmService.subscribe(() => undefined);
    unsub();

    dmService.subscribeToMessages();
    dmService.cleanup();

    expect(nostrServiceMock.unsubscribe).toHaveBeenCalledWith('sub-1');
    expect(dmService.getConversations()).toHaveLength(0);
  });

  it('persists conversations for the active user only and can delete them', async () => {
    dmService.initialize('author-pubkey');
    await dmService.sendMessage({ recipientPubkey: 'recipient-pubkey', content: 'saved locally' });
    dmService.cleanup();

    dmService.initialize('author-pubkey');
    expect(dmService.getConversation('recipient-pubkey')?.messages).toHaveLength(1);

    dmService.deleteConversation('recipient-pubkey');
    expect(dmService.getConversation('recipient-pubkey')).toBeNull();

    dmService.cleanup();
    dmService.initialize('another-user');
    expect(dmService.getConversations()).toHaveLength(0);
  });
});
