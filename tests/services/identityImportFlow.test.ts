import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function bytesToString(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join('');
}

function makeCryptoMock() {
  const encoder = new TextEncoder();

  return {
    subtle: {
      importKey: vi.fn(async (_format, keyData, algorithm) => {
        if (algorithm === 'PBKDF2') {
          return { type: 'pbkdf2', secret: bytesToString(new Uint8Array(keyData as ArrayBuffer)) };
        }

        return { type: 'raw', data: new Uint8Array(keyData as ArrayBuffer) };
      }),

      deriveKey: vi.fn(async (params, keyMaterial) => {
        const salt = bytesToString(new Uint8Array((params as { salt: Uint8Array }).salt));
        return {
          type: 'secret',
          algorithm: { name: 'AES-GCM', length: 256 },
          id: `${(keyMaterial as { secret: string }).secret}|${salt}`,
        };
      }),

      encrypt: vi.fn(async (_algorithm, key, data) => {
        const prefix = encoder.encode(`k:${(key as { id: string }).id}:`);
        const plaintext = new Uint8Array(data as ArrayBuffer);
        const combined = new Uint8Array(prefix.length + plaintext.length);
        combined.set(prefix, 0);
        combined.set(plaintext, prefix.length);
        return combined.buffer;
      }),

      decrypt: vi.fn(async (_algorithm, key, data) => {
        const expectedPrefix = encoder.encode(`k:${(key as { id: string }).id}:`);
        const ciphertext = new Uint8Array(data as ArrayBuffer);

        const matches =
          ciphertext.length >= expectedPrefix.length &&
          expectedPrefix.every((byte, index) => ciphertext[index] === byte);

        if (!matches) {
          throw new Error('OperationError');
        }

        return ciphertext.slice(expectedPrefix.length).buffer;
      }),

      generateKey: vi.fn(),
      exportKey: vi.fn(),
    },

    getRandomValues: vi.fn().mockImplementation((array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) array[i] = (i + 17) % 256;
      return array;
    }),
  };
}

describe('identity import flow', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    Object.defineProperty(global, 'crypto', {
      value: makeCryptoMock(),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, 'crypto', {
      value: global.crypto,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    localStorage.clear();
    Object.defineProperty(global, 'crypto', {
      value: makeCryptoMock(),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, 'crypto', {
      value: global.crypto,
      configurable: true,
      writable: true,
    });
  });

  it('imports an nsec, requires unlock after reload, and restores the same key after unlock', async () => {
    const { nip19 } = await import('nostr-tools');
    const { identityService } = await import('../../services/identityService');
    const privateKeyBytes = new Uint8Array(32).fill(7);
    const nsec = nip19.nsecEncode(privateKeyBytes);

    const imported = await identityService.importFromNsec(
      nsec,
      'alice',
      'correct horse battery staple',
    );

    expect(imported).not.toBeNull();
    expect(localStorage.getItem('bitboard_identity_v2')).toBeTruthy();
    expect(localStorage.getItem('bitboard_enc_key')).toBeNull();

    vi.resetModules();

    const reloadedModule = await import('../../services/identityService');
    const reloadedIdentityService = reloadedModule.identityService;

    await reloadedIdentityService.getIdentityAsync();
    expect(reloadedIdentityService.needsPassphrase()).toBe(true);
    expect(await reloadedIdentityService.unlockWithPassphrase('wrong passphrase')).toBe(false);
    expect(await reloadedIdentityService.unlockWithPassphrase('correct horse battery staple')).toBe(
      true,
    );

    const unlocked = await reloadedIdentityService.getIdentityAsync();
    expect(unlocked?.kind).toBe('local');
    expect(unlocked?.displayName).toBe('alice');
    expect(reloadedIdentityService.getPrivateKeyBytes()).toBeInstanceOf(Uint8Array);
    expect(reloadedIdentityService.exportNsec()).toBe(nsec);
  });

  it('imports a raw hex private key, requires unlock after reload, and restores the same key after unlock', async () => {
    const { nip19 } = await import('nostr-tools');
    const { identityService } = await import('../../services/identityService');
    const privateKeyBytes = new Uint8Array(32).fill(11);
    const hexPrivkey = Array.from(privateKeyBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const expectedNsec = nip19.nsecEncode(privateKeyBytes);

    const imported = await identityService.importFromHex(
      hexPrivkey,
      'bob',
      'hex import passphrase',
    );

    expect(imported).not.toBeNull();
    expect(imported?.kind).toBe('local');
    expect(localStorage.getItem('bitboard_identity_v2')).toBeTruthy();

    vi.resetModules();

    const reloadedModule = await import('../../services/identityService');
    const reloadedIdentityService = reloadedModule.identityService;

    await reloadedIdentityService.getIdentityAsync();
    expect(reloadedIdentityService.needsPassphrase()).toBe(true);
    expect(await reloadedIdentityService.unlockWithPassphrase('wrong hex passphrase')).toBe(false);
    expect(await reloadedIdentityService.unlockWithPassphrase('hex import passphrase')).toBe(true);

    const unlocked = await reloadedIdentityService.getIdentityAsync();
    expect(unlocked?.kind).toBe('local');
    expect(unlocked?.displayName).toBe('bob');
    expect(reloadedIdentityService.getPrivateKeyBytes()).toBeInstanceOf(Uint8Array);
    expect(reloadedIdentityService.exportNsec()).toBe(expectedNsec);
  });

  it('keeps key material inaccessible after wrong unlock attempts and clears encrypted state', async () => {
    const { nip19 } = await import('nostr-tools');
    const { identityService } = await import('../../services/identityService');
    const privateKeyBytes = new Uint8Array(32).fill(13);
    const nsec = nip19.nsecEncode(privateKeyBytes);

    await identityService.importFromNsec(nsec, 'carol', 'strong passphrase');
    vi.resetModules();

    const reloadedModule = await import('../../services/identityService');
    const reloadedIdentityService = reloadedModule.identityService;
    await reloadedIdentityService.getIdentityAsync();

    expect(await reloadedIdentityService.unlockWithPassphrase('wrong passphrase')).toBe(false);
    expect(reloadedIdentityService.getIdentity()).toBeNull();
    expect(reloadedIdentityService.getPrivateKeyBytes()).toBeNull();

    reloadedIdentityService.clearIdentity();
    expect(localStorage.getItem('bitboard_identity_v2')).toBeNull();
    expect(localStorage.getItem('bitboard_identity')).toBeNull();
    expect(localStorage.getItem('bitboard_salt')).toBeNull();
  });

  it('does not persist session identities across reloads', async () => {
    const { identityService } = await import('../../services/identityService');
    identityService.setSessionIdentity({
      kind: 'nip07',
      pubkey: 'a'.repeat(64),
      npub: 'npub-session',
      displayName: 'session-user',
    });

    expect(identityService.getIdentity()?.kind).toBe('nip07');
    expect(localStorage.getItem('bitboard_identity_v2')).toBeNull();

    vi.resetModules();
    const reloadedModule = await import('../../services/identityService');
    expect(await reloadedModule.identityService.getIdentityAsync()).toBeNull();
  });
});
