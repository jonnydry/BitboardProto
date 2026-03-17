import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('nostr-tools/utils', () => ({
  bytesToHex: (bytes: Uint8Array) =>
    Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''),
  hexToBytes: (hex: string) => {
    if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
      throw new Error('invalid hex');
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  },
}));

vi.mock('nostr-tools', async () => {
  const { bytesToHex, hexToBytes } = await import('nostr-tools/utils');
  return {
    generateSecretKey: () => Uint8Array.from({ length: 32 }, (_, i) => i + 1),
    getPublicKey: (bytes: Uint8Array) => bytesToHex(bytes).slice(0, 64).padEnd(64, '0'),
    finalizeEvent: (event: Record<string, unknown>, privateKeyBytes: Uint8Array) => ({
      ...event,
      pubkey: bytesToHex(privateKeyBytes).slice(0, 64).padEnd(64, '0'),
      id: '1'.repeat(64),
      sig: '2'.repeat(128),
    }),
    nip04: {
      encrypt: async (privkey: string, pubkey: string, plaintext: string) =>
        `nip04:${privkey}:${pubkey}:${plaintext}`,
      decrypt: async (privkey: string, pubkey: string, ciphertext: string) => {
        const prefix = `nip04:${privkey}:${pubkey}:`;
        if (!ciphertext.startsWith(prefix)) {
          throw new Error('bad ciphertext');
        }
        return ciphertext.slice(prefix.length);
      },
    },
    nip19: {
      nsecEncode: (bytes: Uint8Array) => `nsec_${bytesToHex(bytes)}`,
      npubEncode: (pubkey: string) => `npub_${pubkey}`,
      decode: (value: string) => {
        if (value.startsWith('nsec_')) {
          return { type: 'nsec', data: hexToBytes(value.slice(5)) };
        }
        if (value.startsWith('npub_')) {
          return { type: 'npub', data: value.slice(5) };
        }
        throw new Error('invalid bech32');
      },
    },
  };
});

import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { bytesToHex } from 'nostr-tools/utils';

vi.mock('../../services/loggingService', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

async function loadIdentityModule() {
  vi.resetModules();
  return import('../../services/identityService');
}

describe('identityService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('generates an encrypted local identity and exposes only public data safely', async () => {
    const { identityService } = await loadIdentityModule();

    const identity = await identityService.generateIdentity(
      'Alice',
      'correct horse battery staple',
    );

    expect(identity.kind).toBe('local');
    expect(identity.displayName).toBe('Alice');
    expect(identity.pubkey).toHaveLength(64);
    expect(localStorage.getItem('bitboard_identity_v2')).toBeTruthy();
    expect(localStorage.getItem('bitboard_identity')).toBeNull();
    expect(identityService.hasIdentity()).toBe(true);
    expect(identityService.hasLocalIdentity()).toBe(true);
    expect(identityService.getPublicIdentity()).toEqual({
      kind: 'local',
      pubkey: identity.pubkey,
      npub: identity.npub,
      displayName: 'Alice',
    });
  });

  it('imports from nsec and hex private keys', async () => {
    const secret = generateSecretKey();
    const nsec = nip19.nsecEncode(secret);
    const privkeyHex = bytesToHex(secret);

    {
      const { identityService } = await loadIdentityModule();
      const imported = await identityService.importFromNsec(
        nsec,
        'FromNsec',
        'correct horse battery staple',
      );
      expect(imported?.displayName).toBe('FromNsec');
      expect(imported?.pubkey).toBe(getPublicKey(secret));
    }

    {
      const { identityService } = await loadIdentityModule();
      const imported = await identityService.importFromHex(
        privkeyHex,
        'FromHex',
        'correct horse battery staple',
      );
      expect(imported?.displayName).toBe('FromHex');
      expect(imported?.pubkey).toBe(getPublicKey(secret));
    }
  });

  it('rejects short passphrases and invalid imports', async () => {
    const { identityService } = await loadIdentityModule();

    await expect(identityService.generateIdentity('Alice', 'short')).rejects.toThrow(
      'Passphrase must be at least 12 characters',
    );
    await expect(identityService.importFromNsec('invalid', 'Alice', 'short')).rejects.toThrow(
      'Passphrase must be at least 12 characters',
    );
    await expect(
      identityService.importFromHex('not-hex', 'Alice', 'correct horse battery staple'),
    ).resolves.toBeNull();
  });

  it('unlocks persisted identities with the correct passphrase and fails closed otherwise', async () => {
    let pubkey: string;
    {
      const { identityService } = await loadIdentityModule();
      const identity = await identityService.generateIdentity(
        'Alice',
        'correct horse battery staple',
      );
      pubkey = identity.pubkey;
    }

    {
      const { identityService } = await loadIdentityModule();
      expect(identityService.needsPassphrase()).toBe(true);
      await expect(identityService.unlockWithPassphrase('wrong passphrase 123')).resolves.toBe(
        false,
      );
      expect(identityService.getIdentity()).toBeNull();
      expect(identityService.hasIdentity()).toBe(false);
    }

    {
      const { identityService } = await loadIdentityModule();
      await expect(
        identityService.unlockWithPassphrase('correct horse battery staple'),
      ).resolves.toBe(true);
      expect(identityService.needsPassphrase()).toBe(false);
      expect(identityService.getIdentity()?.pubkey).toBe(pubkey!);
    }
  });

  it('signs events with a local identity', async () => {
    const { identityService } = await loadIdentityModule();
    const identity = await identityService.generateIdentity(
      'Alice',
      'correct horse battery staple',
    );

    const signed = await identityService.signEvent({
      pubkey: identity.pubkey,
      kind: 1,
      created_at: 123,
      tags: [],
      content: 'hello',
    });

    expect(signed.pubkey).toBe(identity.pubkey);
    expect(signed.sig).toHaveLength(128);
    expect(signed.id).toHaveLength(64);
  });

  it('uses NIP-07 for extension identities when available', async () => {
    const { identityService } = await loadIdentityModule();
    const signEvent = vi.fn(async (event: Record<string, unknown>) => ({
      ...event,
      id: '1'.repeat(64),
      sig: '2'.repeat(128),
      pubkey: '3'.repeat(64),
    }));
    const getPublicKeyFromExtension = vi.fn(async () => '3'.repeat(64));
    vi.stubGlobal('nostr', { signEvent, getPublicKey: getPublicKeyFromExtension });

    const extensionPubkey = await identityService.getPublicKeyFromExtension();
    identityService.setSessionIdentity({
      kind: 'nip07',
      pubkey: extensionPubkey!,
      npub: nip19.npubEncode(extensionPubkey!),
      displayName: 'Extension',
    });

    const signed = await identityService.signEvent({
      pubkey: extensionPubkey!,
      kind: 1,
      created_at: 123,
      tags: [],
      content: 'hello',
    });

    expect(signEvent).toHaveBeenCalled();
    expect(signed.sig).toBe('2'.repeat(128));
  });

  it('encrypts and decrypts DMs for local identities only', async () => {
    const { identityService } = await loadIdentityModule();
    const secret = generateSecretKey();
    const counterparty = getPublicKey(secret);

    await identityService.generateIdentity('Alice', 'correct horse battery staple');

    const encrypted = await identityService.encryptDM('hello dm', counterparty);
    const decrypted = await identityService.decryptDM(encrypted!, counterparty);

    expect(encrypted).toBeTruthy();
    expect(decrypted).toBe('hello dm');
  });

  it('does not persist session identities across reloads', async () => {
    const { identityService } = await loadIdentityModule();
    const pubkey = '4'.repeat(64);
    identityService.setSessionIdentity({
      kind: 'nip07',
      pubkey,
      npub: nip19.npubEncode(pubkey),
      displayName: 'Session Only',
    });

    expect(identityService.hasIdentity()).toBe(true);
    expect(localStorage.getItem('bitboard_identity_v2')).toBeNull();

    const reloaded = await loadIdentityModule();
    expect(reloaded.identityService.hasIdentity()).toBe(false);
  });

  it('clears identity state and encrypted storage', async () => {
    const { identityService } = await loadIdentityModule();
    await identityService.generateIdentity('Alice', 'correct horse battery staple');

    expect(localStorage.getItem('bitboard_identity_v2')).toBeTruthy();
    expect(localStorage.getItem('bitboard_salt')).toBeTruthy();

    identityService.clearIdentity();

    expect(identityService.hasIdentity()).toBe(false);
    expect(localStorage.getItem('bitboard_identity_v2')).toBeNull();
    expect(localStorage.getItem('bitboard_identity')).toBeNull();
    expect(localStorage.getItem('bitboard_salt')).toBeNull();
  });
});
