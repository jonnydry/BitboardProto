import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip19,
  type Event as NostrEvent,
  type EventTemplate,
} from 'nostr-tools';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import type { NostrIdentity, PublicNostrIdentity, UnsignedNostrEvent } from '../types';
import { cryptoService } from './cryptoService';
import { logger } from './loggingService';

const STORAGE_KEYS = {
  // Legacy unencrypted identity (pre-encryption era)
  IDENTITY_LEGACY: 'bitboard_identity',
  // AES-GCM encrypted identity blob
  IDENTITY_ENCRYPTED: 'bitboard_identity_v2',
  DISPLAY_NAME: 'bitboard_display_name',
  // Legacy insecure AES key (present on old installs, deleted on first load)
  LEGACY_ENC_KEY: 'bitboard_enc_key',
} as const;

const MIN_PASSPHRASE_LENGTH = 12;

function validatePassphraseStrength(passphrase: string): { valid: boolean; message?: string } {
  if (!passphrase || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    return {
      valid: false,
      message: `Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`,
    };
  }
  return { valid: true };
}

class IdentityService {
  private identity: NostrIdentity | null = null;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  /**
   * True when an encrypted blob exists but no passphrase has been provided yet.
   * The app should prompt the user to unlock before doing anything else.
   */
  private _needsPassphrase: boolean = false;
  /**
   * True when this is a brand-new install that had the old insecure key scheme.
   * The user must set a passphrase so we can re-encrypt under it.
   */
  private _needsMigration: boolean = false;
  /** The legacy plaintext to re-encrypt once the user sets a passphrase. */
  private _migrationPlaintext: string | null = null;
  /** Keep the old insecure key until migration succeeds, then delete it. */
  private _legacyKeyB64: string | null = null;

  constructor() {
    this.initPromise = this.initializeAsync();
  }

  private async initializeAsync(): Promise<void> {
    try {
      // Delete the legacy insecure AES key if it is still lying around.
      // We keep the encrypted blob — it will be re-encrypted under the
      // passphrase-derived key after the user sets one.
      const legacyKey = localStorage.getItem(STORAGE_KEYS.LEGACY_ENC_KEY);
      if (legacyKey) {
        await this.handleLegacyMigration(legacyKey);
      } else {
        await this.loadIdentity();
      }
      this.initialized = true;
    } catch (error) {
      logger.error('Identity', 'Failed to initialize', error);
      this.initialized = true;
    }
  }

  /**
   * Called when we find the old insecure key in localStorage.
   * Decrypts the identity with the old key and flags that a passphrase
   * must be set before we re-save. We do NOT delete the old key yet,
   * so a failed migration cannot strand the user.
   */
  private async handleLegacyMigration(legacyKeyB64: string): Promise<void> {
    const encryptedBlob = localStorage.getItem(STORAGE_KEYS.IDENTITY_ENCRYPTED);
    if (encryptedBlob) {
      const plaintext = await cryptoService.decryptWithLegacyKey(encryptedBlob, legacyKeyB64);
      if (plaintext) {
        this._migrationPlaintext = plaintext;
        this._needsMigration = true;
        this._legacyKeyB64 = legacyKeyB64;
        // Don't load the identity into memory yet — wait for passphrase
        return;
      }
    }

    // No encrypted blob found (or decryption failed) — fall through to the
    // standard load path which handles plain-text legacy identities.
    logger.warn('Identity', 'Legacy key found but no encrypted blob — falling through to loadIdentity');
    await this.loadIdentity();
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  // ----------------------------------------
  // PASSPHRASE LOCK / UNLOCK
  // ----------------------------------------

  /** True when the app must prompt the user for their passphrase. */
  needsPassphrase(): boolean {
    return this._needsPassphrase || this._needsMigration;
  }

  /** True specifically for the migration case (user must SET a new passphrase). */
  needsMigration(): boolean {
    return this._needsMigration;
  }

  /**
   * Attempt to unlock with the given passphrase.
   * Returns true on success, false if the passphrase was wrong.
   */
  async unlockWithPassphrase(passphrase: string): Promise<boolean> {
    await this.ensureInitialized();
    try {
      await cryptoService.deriveKeyFromPassphrase(passphrase);
      const encryptedBlob = localStorage.getItem(STORAGE_KEYS.IDENTITY_ENCRYPTED);
      if (!encryptedBlob) {
        // Nothing stored — passphrase was accepted, nothing to decrypt
        this._needsPassphrase = false;
        return true;
      }
      const plaintext = await cryptoService.decrypt(encryptedBlob);
      const parsed = JSON.parse(plaintext);
      this.identity = parsed?.kind ? parsed : { ...parsed, kind: 'local' };
      this._needsPassphrase = false;
      return true;
    } catch {
      // Wrong passphrase — AES-GCM auth tag mismatch
      cryptoService.clearKey();
      return false;
    }
  }

  /**
   * Migrate an old install: derive a new key from the given passphrase,
   * re-encrypt the decrypted plaintext, and load the identity.
   * Returns true on success.
   */
  async migrateWithPassphrase(passphrase: string): Promise<boolean> {
    if (!this._needsMigration || !this._migrationPlaintext) return false;
    try {
      await cryptoService.deriveKeyFromPassphrase(passphrase);
      const parsed = JSON.parse(this._migrationPlaintext);
      this.identity = parsed?.kind ? parsed : { ...parsed, kind: 'local' };
      await this.saveIdentity(); // re-encrypts under new passphrase-derived key
      if (this._legacyKeyB64) {
        cryptoService.deleteLegacyKey();
      }
      this._needsMigration = false;
      this._migrationPlaintext = null;
      this._legacyKeyB64 = null;
      return true;
    } catch (err) {
      logger.error('Identity', 'Migration failed', err);
      return false;
    }
  }

  // ----------------------------------------
  // IDENTITY MANAGEMENT
  // ----------------------------------------

  /**
   * Override identity for the current session (e.g. NIP-07).
   * Note: Only local identities are persisted; session identities are not.
   */
  setSessionIdentity(identity: NostrIdentity | null): void {
    this.identity = identity;
  }

  /**
   * Generate a new Nostr keypair
   */
  async generateIdentity(displayName?: string, passphrase?: string): Promise<NostrIdentity> {
    await this.ensureInitialized();

    if (!passphrase?.trim()) {
      throw new Error('Passphrase is required');
    }

    const validation = validatePassphraseStrength(passphrase.trim());
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    await cryptoService.deriveKeyFromPassphrase(passphrase.trim());

    const privateKeyBytes = generateSecretKey();
    const pubkey = getPublicKey(privateKeyBytes);
    const privkey = bytesToHex(privateKeyBytes);
    const npub = nip19.npubEncode(pubkey);

    const identity: NostrIdentity = {
      kind: 'local',
      pubkey,
      privkey,
      npub,
      displayName: displayName || `anon_${pubkey.slice(0, 6)}`,
    };

    this.identity = identity;
    await this.saveIdentity();

    return identity;
  }

  /**
   * Import existing identity from nsec
   */
  async importFromNsec(
    nsec: string,
    displayName?: string,
    passphrase?: string,
  ): Promise<NostrIdentity | null> {
    await this.ensureInitialized();

    if (!passphrase?.trim()) {
      throw new Error('Passphrase is required');
    }

    const validation = validatePassphraseStrength(passphrase.trim());
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    try {
      await cryptoService.deriveKeyFromPassphrase(passphrase.trim());
      const decoded = nip19.decode(nsec);
      if (decoded.type !== 'nsec') {
        throw new Error('Invalid nsec format');
      }

      const privateKeyBytes = decoded.data as Uint8Array;
      const pubkey = getPublicKey(privateKeyBytes);
      const privkey = bytesToHex(privateKeyBytes);
      const npub = nip19.npubEncode(pubkey);

      const identity: NostrIdentity = {
        kind: 'local',
        pubkey,
        privkey,
        npub,
        displayName: displayName || `anon_${pubkey.slice(0, 6)}`,
      };

      this.identity = identity;
      await this.saveIdentity();

      // Attempt to clear sensitive data from memory
      cryptoService.secureClearBytes(privateKeyBytes);

      return identity;
    } catch (error) {
      logger.error('Identity', 'Failed to import nsec', error);
      return null;
    }
  }

  /**
   * Import from hex private key
   */
  async importFromHex(
    hexPrivkey: string,
    displayName?: string,
    passphrase?: string,
  ): Promise<NostrIdentity | null> {
    await this.ensureInitialized();

    if (!passphrase?.trim()) {
      throw new Error('Passphrase is required');
    }

    const validation = validatePassphraseStrength(passphrase.trim());
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    try {
      await cryptoService.deriveKeyFromPassphrase(passphrase.trim());
      const privateKeyBytes = hexToBytes(hexPrivkey);
      const pubkey = getPublicKey(privateKeyBytes);
      const npub = nip19.npubEncode(pubkey);

      const identity: NostrIdentity = {
        kind: 'local',
        pubkey,
        privkey: hexPrivkey,
        npub,
        displayName: displayName || `anon_${pubkey.slice(0, 6)}`,
      };

      this.identity = identity;
      await this.saveIdentity();

      // Attempt to clear sensitive data from memory
      cryptoService.secureClearBytes(privateKeyBytes);

      return identity;
    } catch (error) {
      logger.error('Identity', 'Failed to import hex key', error);
      return null;
    }
  }

  /**
   * Get current identity (sync for backward compatibility)
   * WARNING: May return null if still initializing. Use getIdentityAsync() for
   * guaranteed results after initialization.
   */
  getIdentity(): NostrIdentity | null {
    if (!this.initialized && this.initPromise) {
      logger.warn(
        'Identity',
        'getIdentity() called before initialization complete. Use getIdentityAsync() for guaranteed results.',
      );
    }
    return this.identity;
  }

  /**
   * Get current identity (async, ensures initialization)
   */
  async getIdentityAsync(): Promise<NostrIdentity | null> {
    await this.ensureInitialized();
    return this.identity;
  }

  /**
   * Get private key as Uint8Array for signing
   */
  getPrivateKeyBytes(): Uint8Array | null {
    if (!this.identity) return null;
    if (this.identity.kind !== 'local') return null;
    return hexToBytes(this.identity.privkey);
  }

  /**
   * Returns the identity with privkey stripped — safe to store in shared
   * React/Zustand state. All key operations must go through identityService.
   */
  getPublicIdentity(): PublicNostrIdentity | null {
    if (!this.identity) return null;
    if (this.identity.kind === 'local') {
      const { privkey: _stripped, ...pub } = this.identity;
      return pub as PublicNostrIdentity;
    }
    return this.identity;
  }

  // ----------------------------------------
  // DM ENCRYPTION (keeps privkey inside this service)
  // ----------------------------------------

  /**
   * Encrypt a plaintext message for a recipient using NIP-04.
   * The private key never leaves this service.
   */
  async encryptDM(plaintext: string, recipientPubkey: string): Promise<string | null> {
    if (!this.identity || this.identity.kind !== 'local') return null;
    return cryptoService.encryptNIP04(plaintext, this.identity.privkey, recipientPubkey);
  }

  /**
   * Decrypt a NIP-04 ciphertext from a counterparty.
   * The private key never leaves this service.
   */
  async decryptDM(ciphertext: string, counterpartyPubkey: string): Promise<string | null> {
    if (!this.identity || this.identity.kind !== 'local') return null;
    return cryptoService.decryptNIP04(ciphertext, this.identity.privkey, counterpartyPubkey);
  }

  /**
   * Unwrap a NIP-17 gift-wrap event addressed to the current user.
   * The private key never leaves this service.
   */
  async unwrapDMGiftWrap(
    giftWrapEvent: NostrEvent,
  ): Promise<{ content: string; senderPubkey: string } | null> {
    if (!this.identity || this.identity.kind !== 'local') return null;
    return cryptoService.unwrapGiftWrap({
      giftWrapEvent,
      recipientPrivkey: this.identity.privkey,
    });
  }

  /**
   * Export nsec for backup
   */
  exportNsec(): string | null {
    if (!this.identity) return null;
    if (this.identity.kind !== 'local') return null;
    const privateKeyBytes = hexToBytes(this.identity.privkey);
    return nip19.nsecEncode(privateKeyBytes);
  }

  /**
   * Check if identity exists
   */
  hasIdentity(): boolean {
    return this.identity !== null;
  }

  /**
   * Check if the current identity is a local keypair (can perform DM crypto)
   */
  hasLocalIdentity(): boolean {
    return this.identity?.kind === 'local';
  }

  /**
   * Update display name
   */
  async setDisplayName(name: string): Promise<void> {
    await this.ensureInitialized();

    if (this.identity) {
      // Validate and sanitize before persisting
      const { inputValidator } = await import('./inputValidator');
      const sanitized = inputValidator.validateUsername(name);
      if (!sanitized) {
        throw new Error('Invalid display name');
      }
      this.identity.displayName = sanitized;
      if (this.identity.kind === 'local') {
        await this.saveIdentity();
      }
    }
  }

  /**
   * Clear identity (logout)
   */
  clearIdentity(): void {
    this.identity = null;
    // Remove both legacy and encrypted storage
    localStorage.removeItem(STORAGE_KEYS.IDENTITY_LEGACY);
    localStorage.removeItem(STORAGE_KEYS.IDENTITY_ENCRYPTED);
    cryptoService.deleteEncryptionKey();
    cryptoService.clearKey();
    this._needsPassphrase = false;
    this._needsMigration = false;
    this._migrationPlaintext = null;
    this._legacyKeyB64 = null;
  }

  // ----------------------------------------
  // ENCRYPTED PERSISTENCE
  // ----------------------------------------

  /**
   * Save identity with AES-GCM encryption
   */
  private async saveIdentity(): Promise<void> {
    if (!this.identity) return;
    if (this.identity.kind !== 'local') return;

    try {
      if (!cryptoService.isAvailable()) {
        // Never store the private key in plaintext — this browser is not supported.
        throw new Error(
          'Web Crypto API is not available in this browser. Your identity cannot be stored securely.',
        );
      }

      if (!cryptoService.hasKey()) {
        throw new Error('Passphrase key not loaded');
      }

      const plaintext = JSON.stringify(this.identity);
      const encrypted = await cryptoService.encrypt(plaintext);
      localStorage.setItem(STORAGE_KEYS.IDENTITY_ENCRYPTED, encrypted);
      localStorage.removeItem(STORAGE_KEYS.IDENTITY_LEGACY);
      this._needsPassphrase = false;
    } catch (error) {
      logger.error('Identity', 'Failed to save identity', error);
      throw error;
    }
  }

  /**
   * Load identity with decryption and migration support
   */
  private async loadIdentity(): Promise<void> {
    try {
      const encryptedData = localStorage.getItem(STORAGE_KEYS.IDENTITY_ENCRYPTED);

      if (encryptedData) {
        if (!cryptoService.isAvailable()) {
          logger.warn('Identity', 'Cannot decrypt - Web Crypto not available');
          return;
        }

        if (!cryptoService.hasKey()) {
          this._needsPassphrase = true;
          this.identity = null;
          return;
        }

        const decrypted = await cryptoService.decrypt(encryptedData);
        const parsed = JSON.parse(decrypted);
        this.identity = parsed?.kind ? parsed : { ...parsed, kind: 'local' };
        this._needsPassphrase = false;
        return;
      }

      const legacyData = localStorage.getItem(STORAGE_KEYS.IDENTITY_LEGACY);

      if (legacyData) {
        this._migrationPlaintext = legacyData;
        this._needsMigration = true;
        this.identity = null;
        return;
      }

      this.identity = null;
    } catch (error) {
      logger.error('Identity', 'Failed to load identity', error);
      this.identity = null;
    }
  }

  // ----------------------------------------
  // NIP-07 BROWSER EXTENSION SUPPORT
  // ----------------------------------------

  /**
   * Check if NIP-07 extension (Alby, nos2x) is available
   */
  hasNip07Extension(): boolean {
    return typeof window !== 'undefined' && !!window.nostr;
  }

  /**
   * Get public key from NIP-07 extension
   */
  async getPublicKeyFromExtension(): Promise<string | null> {
    if (!this.hasNip07Extension()) return null;

    try {
      return await window.nostr!.getPublicKey();
    } catch (error) {
      logger.error('Identity', 'NIP-07 getPublicKey failed', error);
      return null;
    }
  }

  /**
   * Sign event using NIP-07 extension
   */
  async signEventWithExtension(event: UnsignedNostrEvent): Promise<NostrEvent | null> {
    if (!this.hasNip07Extension()) return null;

    try {
      return await window.nostr!.signEvent(event);
    } catch (error) {
      logger.error('Identity', 'NIP-07 signEvent failed', error);
      return null;
    }
  }

  // ----------------------------------------
  // SIGNING (Local + NIP-07)
  // ----------------------------------------

  /**
   * Sign an unsigned event with the active identity.
   * - Local: signs with stored private key
   * - NIP-07: delegates to browser extension
   */
  async signEvent(unsigned: UnsignedNostrEvent): Promise<NostrEvent> {
    await this.ensureInitialized();
    if (!this.identity) {
      throw new Error('No identity available');
    }

    if (this.identity.kind === 'local') {
      const privateKeyBytes = hexToBytes(this.identity.privkey);
      const template: EventTemplate = {
        kind: unsigned.kind,
        created_at: unsigned.created_at,
        tags: unsigned.tags,
        content: unsigned.content,
      };
      const signed = finalizeEvent(template, privateKeyBytes);
      // Best-effort clear
      cryptoService.secureClearBytes(privateKeyBytes);
      return signed;
    }

    const signed = await this.signEventWithExtension({ ...unsigned, pubkey: this.identity.pubkey });
    if (!signed) {
      throw new Error('Failed to sign with NIP-07 extension');
    }
    return signed;
  }

  // ----------------------------------------
  // UTILITY
  // ----------------------------------------

  /**
   * Format pubkey for display
   */
  formatPubkey(pubkey: string, length: number = 8): string {
    if (pubkey.length <= length * 2) return pubkey;
    return `${pubkey.slice(0, length)}...${pubkey.slice(-length)}`;
  }

  /**
   * Validate nsec format
   */
  isValidNsec(nsec: string): boolean {
    try {
      const decoded = nip19.decode(nsec);
      return decoded.type === 'nsec';
    } catch {
      return false;
    }
  }

  /**
   * Validate npub format
   */
  isValidNpub(npub: string): boolean {
    try {
      const decoded = nip19.decode(npub);
      return decoded.type === 'npub';
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const identityService = new IdentityService();
