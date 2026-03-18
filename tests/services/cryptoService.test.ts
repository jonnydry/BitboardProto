import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/loggingService', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('nostr-tools', () => ({
  nip04: {
    encrypt: vi.fn(
      async (privkey: string, pubkey: string, plaintext: string) =>
        `nip04:${privkey}:${pubkey}:${plaintext}`,
    ),
    decrypt: vi.fn(async (privkey: string, pubkey: string, ciphertext: string) => {
      const prefix = `nip04:${privkey}:${pubkey}:`;
      if (!ciphertext.startsWith(prefix)) {
        throw new Error('bad ciphertext');
      }
      return ciphertext.slice(prefix.length);
    }),
  },
  nip44: {
    getConversationKey: vi.fn(() => 'shared-conversation-key'),
    encrypt: vi.fn((plaintext: string, conversationKey: string) =>
      JSON.stringify({ plaintext, conversationKey }),
    ),
    decrypt: vi.fn((ciphertext: string, conversationKey: string) => {
      const parsed = JSON.parse(ciphertext) as { plaintext: string; conversationKey: string };
      if (parsed.conversationKey !== conversationKey) {
        throw new Error('wrong conversation key');
      }
      return parsed.plaintext;
    }),
  },
  finalizeEvent: vi.fn((event: Record<string, unknown>, privkey: Uint8Array) => ({
    ...event,
    id: `evt-${privkey[0] ?? 0}`,
    pubkey: `pub-${privkey[0] ?? 0}`,
    sig: 'sig',
  })),
  generateSecretKey: vi.fn(() => new Uint8Array(32).fill(7)),
  getPublicKey: vi.fn((privkey: Uint8Array) => `pub-${privkey[0] ?? 0}`),
  // Always return true in tests — real signature verification is tested in nostrService.test.ts
  verifyEvent: vi.fn(() => true),
}));

import { CryptoService } from '../../services/cryptoService';

async function encryptWithRawKey(plaintext: string, rawKey: Uint8Array) {
  const key = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    new TextEncoder().encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

describe('CryptoService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('derives a key, persists salt, and tracks key presence', async () => {
    const service = new CryptoService();

    expect(service.hasKey()).toBe(false);
    expect(service.hasSalt()).toBe(false);

    await service.deriveKeyFromPassphrase('correct horse battery staple');

    expect(service.hasKey()).toBe(true);
    expect(service.hasSalt()).toBe(true);
    expect(localStorage.getItem('bitboard_salt')).toBeTruthy();

    service.clearKey();
    expect(service.hasKey()).toBe(false);
  });

  it('encrypts and decrypts with AES-GCM using the derived key', async () => {
    const service = new CryptoService();
    const plaintext = 'Very secret payload with emoji lock';

    await service.deriveKeyFromPassphrase('correct horse battery staple');
    const encryptedA = await service.encrypt(plaintext);
    const encryptedB = await service.encrypt(plaintext);

    expect(encryptedA).not.toBe(plaintext);
    expect(encryptedA).not.toBe(encryptedB);
    await expect(service.decrypt(encryptedA)).resolves.toBe(plaintext);
    await expect(service.decrypt(encryptedB)).resolves.toBe(plaintext);
  });

  it('fails to decrypt with the wrong passphrase-derived key', async () => {
    const writer = new CryptoService();
    await writer.deriveKeyFromPassphrase('correct horse battery staple');
    const encrypted = await writer.encrypt('classified');

    const reader = new CryptoService();
    await reader.deriveKeyFromPassphrase('wrong passphrase 123');

    await expect(reader.decrypt(encrypted)).rejects.toThrow();
  });

  it('throws if encrypt or decrypt is called before deriving a key', async () => {
    const service = new CryptoService();

    await expect(service.encrypt('hello')).rejects.toThrow('No encryption key');
    await expect(service.decrypt('abc')).rejects.toThrow('No encryption key');
  });

  it('decrypts legacy AES-GCM blobs and deletes legacy key markers', async () => {
    const service = new CryptoService();
    const rawKey = crypto.getRandomValues(new Uint8Array(32));
    const legacyKey = btoa(String.fromCharCode(...rawKey));
    const encrypted = await encryptWithRawKey('legacy secret', rawKey);

    await expect(service.decryptWithLegacyKey(encrypted, legacyKey)).resolves.toBe('legacy secret');

    localStorage.setItem('bitboard_enc_key', legacyKey);
    service.deleteLegacyKey();
    expect(localStorage.getItem('bitboard_enc_key')).toBeNull();
  });

  it('wipes salt and in-memory key on deleteEncryptionKey', async () => {
    const service = new CryptoService();
    await service.deriveKeyFromPassphrase('correct horse battery staple');

    service.deleteEncryptionKey();

    expect(service.hasKey()).toBe(false);
    expect(service.hasSalt()).toBe(false);
    expect(localStorage.getItem('bitboard_salt')).toBeNull();
  });

  it('clears byte arrays in place', () => {
    const service = new CryptoService();
    const bytes = new Uint8Array([1, 2, 3, 4]);

    service.secureClearBytes(bytes);

    expect(Array.from(bytes)).toEqual([0, 0, 0, 0]);
  });

  it('supports NIP-04 encryption and decryption helpers', async () => {
    const service = new CryptoService();
    const ciphertext = await service.encryptNIP04('hello', 'sender-priv', 'recipient-pub');

    expect(ciphertext).toBe('nip04:sender-priv:recipient-pub:hello');
    await expect(service.decryptNIP04(ciphertext!, 'sender-priv', 'recipient-pub')).resolves.toBe(
      'hello',
    );
    await expect(
      service.decryptNIP04(ciphertext!, 'sender-priv', 'recipient-pub'),
    ).resolves.toBe('hello');
  });

  it('supports NIP-44 encryption and decryption helpers', async () => {
    const service = new CryptoService();
    const privkey = '11'.repeat(32);
    const recipientPubkey = 'recipient-pub';
    const ciphertext = await service.encryptNIP44('hello modern', privkey, recipientPubkey);

    expect(ciphertext).toContain('hello modern');
    await expect(service.decryptNIP44(ciphertext!, privkey, recipientPubkey)).resolves.toBe(
      'hello modern',
    );
  });

  it('creates and unwraps gift wraps', async () => {
    const service = new CryptoService();
    const senderPrivkey = '01'.repeat(32);
    const senderPubkey = 'pub-1';
    const recipientPubkey = 'recipient';

    const wrapped = await service.createGiftWrap({
      content: 'hello wrapped',
      senderPrivkey,
      senderPubkey,
      recipientPubkey,
      replyToId: 'reply-123',
    });

    expect(wrapped).not.toBeNull();
    expect(service.isGiftWrap(wrapped!.giftWrap as { kind?: number })).toBe(true);
    expect(service.isLegacyDM({ kind: 4 })).toBe(true);

    const unwrapped = await service.unwrapGiftWrap({
      giftWrapEvent: wrapped!.giftWrap as { pubkey: string; content: string },
      recipientPrivkey: '07'.repeat(32),
    });

    expect(unwrapped).toEqual({
      content: 'hello wrapped',
      senderPubkey,
      timestamp: expect.any(Number),
      replyToId: 'reply-123',
    });
  });

  it('reports crypto availability', () => {
    const service = new CryptoService();
    expect(service.isAvailable()).toBe(true);
  });
});
