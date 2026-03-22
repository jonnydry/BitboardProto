// ============================================
// CRYPTO SERVICE
// ============================================
// AES-256-GCM encryption for identity storage.
//
// Security model:
//   The AES key is derived from a user-supplied passphrase via PBKDF2
//   (310 000 iterations, SHA-256) and is NEVER written to storage.
//   Only a random 16-byte salt (not secret) is persisted.  Without the
//   passphrase the localStorage blob is unreadable.
//
// Storage layout:
//   bitboard_salt          – 16-byte random salt (base64), written once
//   bitboard_identity_v2   – AES-GCM encrypted identity blob (managed by identityService)
//   bitboard_enc_key       – DELETED on first load (legacy, insecure)

import { logger } from './loggingService';
import { hexToBytes as _nostrHexToBytes } from 'nostr-tools/utils';

const STORAGE_KEYS = {
  SALT: 'bitboard_salt',
  // Legacy key — present on old installs, deleted during migration
  LEGACY_ENC_KEY: 'bitboard_enc_key',
} as const;

// PBKDF2 iteration count — high enough to be slow on commodity hardware
const PBKDF2_ITERATIONS = 310_000;

class CryptoService {
  /** In-memory AES-GCM key derived from the passphrase. Never persisted. */
  private encryptionKey: CryptoKey | null = null;

  // ----------------------------------------
  // PASSPHRASE-BASED KEY DERIVATION
  // ----------------------------------------

  /**
   * Derive an AES-256-GCM key from a passphrase + stored salt using PBKDF2.
   * Stores the result in memory; does NOT write the key to storage.
   * Creates a new random salt if one does not already exist.
   */
  async deriveKeyFromPassphrase(passphrase: string): Promise<void> {
    const salt = this.getOrCreateSalt();

    const encoder = new TextEncoder();
    const passphraseBytes = encoder.encode(passphrase);

    // Import passphrase as raw key material
    const keyMaterial = await crypto.subtle.importKey('raw', passphraseBytes, 'PBKDF2', false, [
      'deriveKey',
    ]);

    // Derive an AES-GCM key — non-extractable so it can never be exported
    this.encryptionKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable
      ['encrypt', 'decrypt'],
    );

    logger.debug('Crypto', 'Key derived from passphrase');
  }

  /**
   * Returns true if a passphrase-derived key is currently in memory.
   */
  hasKey(): boolean {
    return this.encryptionKey !== null;
  }

  /**
   * Wipe the in-memory key (e.g. on logout or lock).
   */
  clearKey(): void {
    this.encryptionKey = null;
  }

  // ----------------------------------------
  // SALT MANAGEMENT
  // ----------------------------------------

  /**
   * Returns the stored salt, or generates + stores a new one.
   * The salt is not secret — it prevents pre-computation attacks.
   * New installs get a 32-byte salt; legacy 16-byte salts are preserved as-is.
   */
  getOrCreateSalt(): Uint8Array {
    const stored = localStorage.getItem(STORAGE_KEYS.SALT);
    if (stored) {
      return this.base64ToUint8Array(stored);
    }
    const salt = crypto.getRandomValues(new Uint8Array(32));
    localStorage.setItem(STORAGE_KEYS.SALT, this.uint8ArrayToBase64(salt));
    return salt;
  }

  /**
   * Returns true if a salt exists in storage, meaning this device has
   * previously stored an identity and will require a passphrase to unlock.
   */
  hasSalt(): boolean {
    return !!localStorage.getItem(STORAGE_KEYS.SALT);
  }

  // ----------------------------------------
  // LEGACY MIGRATION
  // ----------------------------------------

  /**
   * If the legacy insecure encryption key is present, delete it.
   * Called once on app startup — the identity blob remains and will
   * be re-encrypted under the passphrase key on next save.
   */
  deleteLegacyKey(): void {
    if (localStorage.getItem(STORAGE_KEYS.LEGACY_ENC_KEY)) {
      localStorage.removeItem(STORAGE_KEYS.LEGACY_ENC_KEY);
      logger.info('Crypto', 'Deleted legacy insecure encryption key from localStorage');
    }
  }

  /**
   * Attempt to decrypt with the legacy key (used during migration so we
   * can re-encrypt under the new passphrase-derived key).
   */
  async decryptWithLegacyKey(encryptedData: string, legacyKeyB64: string): Promise<string | null> {
    try {
      const rawKey = this.base64ToArrayBuffer(legacyKeyB64);
      const legacyKey = await crypto.subtle.importKey(
        'raw',
        rawKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt'],
      );
      const combined = new Uint8Array(this.base64ToArrayBuffer(encryptedData));
      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);
      const plaintextBytes = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, tagLength: 128 },
        legacyKey,
        ciphertext,
      );
      return new TextDecoder().decode(plaintextBytes);
    } catch {
      return null;
    }
  }

  // ----------------------------------------
  // ENCRYPTION / DECRYPTION
  // ----------------------------------------

  /**
   * Encrypt data using the in-memory AES-256-GCM key.
   * Throws if no key has been derived yet.
   */
  async encrypt(plaintext: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('No encryption key — call deriveKeyFromPassphrase first');
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const plaintextBytes = encoder.encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      this.encryptionKey,
      plaintextBytes,
    );

    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return this.uint8ArrayToBase64(combined);
  }

  /**
   * Decrypt data using the in-memory AES-256-GCM key.
   * Throws if no key has been derived yet, or if decryption fails
   * (wrong passphrase produces an auth-tag mismatch error).
   */
  async decrypt(encryptedData: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('No encryption key — call deriveKeyFromPassphrase first');
    }

    const combined = new Uint8Array(this.base64ToArrayBuffer(encryptedData));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const plaintextBytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      this.encryptionKey,
      ciphertext,
    );

    return new TextDecoder().decode(plaintextBytes);
  }

  // ----------------------------------------
  // FULL WIPE
  // ----------------------------------------

  /**
   * Delete all crypto state — salt + in-memory key.
   * The identity blob becomes permanently unrecoverable.
   */
  deleteEncryptionKey(): void {
    localStorage.removeItem(STORAGE_KEYS.SALT);
    localStorage.removeItem(STORAGE_KEYS.LEGACY_ENC_KEY);
    this.encryptionKey = null;
    logger.info('Crypto', 'Encryption state wiped');
  }

  // ----------------------------------------
  // AVAILABILITY CHECK
  // ----------------------------------------

  isAvailable(): boolean {
    return (
      typeof crypto !== 'undefined' &&
      typeof crypto.subtle !== 'undefined' &&
      typeof crypto.subtle.encrypt === 'function'
    );
  }

  // ----------------------------------------
  // SECURE CLEAR (best-effort in JS)
  // ----------------------------------------

  secureClear(_sensitiveData: string): void {
    // JS strings are immutable — we can't overwrite the backing memory.
    // This is a no-op kept for call-site compatibility.
  }

  secureClearBytes(data: Uint8Array): void {
    if (data) {
      crypto.getRandomValues(data);
      data.fill(0);
    }
  }

  // ----------------------------------------
  // NIP-44 ENCRYPTION (Modern)
  // ----------------------------------------

  private hexToBytes(hex: string): Uint8Array {
    return _nostrHexToBytes(hex);
  }

  async encryptNIP44(
    plaintext: string,
    senderPrivkey: string,
    recipientPubkey: string,
  ): Promise<string | null> {
    try {
      const { nip44 } = await import('nostr-tools');
      const privkeyBytes = this.hexToBytes(senderPrivkey);
      const conversationKey = nip44.getConversationKey(privkeyBytes, recipientPubkey);
      return nip44.encrypt(plaintext, conversationKey);
    } catch (error) {
      logger.error('Crypto', 'NIP-44 encryption failed', error);
      return null;
    }
  }

  async decryptNIP44(
    encryptedContent: string,
    receiverPrivkey: string,
    senderPubkey: string,
  ): Promise<string | null> {
    try {
      const { nip44 } = await import('nostr-tools');
      const privkeyBytes = this.hexToBytes(receiverPrivkey);
      const conversationKey = nip44.getConversationKey(privkeyBytes, senderPubkey);
      return nip44.decrypt(encryptedContent, conversationKey);
    } catch (error) {
      logger.error('Crypto', 'NIP-44 decryption failed', error);
      return null;
    }
  }

  // ----------------------------------------
  // INTERNAL UTILITIES
  // ----------------------------------------

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    return new Uint8Array(this.base64ToArrayBuffer(base64));
  }
}

export const cryptoService = new CryptoService();
export { CryptoService };
