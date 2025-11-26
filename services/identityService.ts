import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import type { NostrIdentity } from '../types';
import { cryptoService } from './cryptoService';

// ============================================
// STORAGE KEYS
// ============================================

const STORAGE_KEYS = {
  // Legacy key (unencrypted) - for migration
  IDENTITY_LEGACY: 'bitboard_identity',
  // New encrypted storage key
  IDENTITY_ENCRYPTED: 'bitboard_identity_v2',
  DISPLAY_NAME: 'bitboard_display_name',
} as const;

// ============================================
// IDENTITY SERVICE
// ============================================

class IdentityService {
  private identity: NostrIdentity | null = null;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Start async initialization
    this.initPromise = this.initializeAsync();
  }

  /**
   * Async initialization - loads identity with encryption support
   */
  private async initializeAsync(): Promise<void> {
    try {
      await this.loadIdentity();
      this.initialized = true;
    } catch (error) {
      console.error('[Identity] Failed to initialize:', error);
      this.initialized = true; // Mark as initialized even on error
    }
  }

  /**
   * Ensure service is initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  // ----------------------------------------
  // IDENTITY MANAGEMENT
  // ----------------------------------------

  /**
   * Generate a new Nostr keypair
   */
  async generateIdentity(displayName?: string): Promise<NostrIdentity> {
    await this.ensureInitialized();
    
    const privateKeyBytes = generateSecretKey();
    const pubkey = getPublicKey(privateKeyBytes);
    const privkey = bytesToHex(privateKeyBytes);
    const npub = nip19.npubEncode(pubkey);

    const identity: NostrIdentity = {
      pubkey,
      privkey,
      npub,
      displayName: displayName || `anon_${pubkey.slice(0, 6)}`,
    };

    this.identity = identity;
    await this.saveIdentity();
    
    // Attempt to clear sensitive data from memory
    cryptoService.secureClear(privkey);
    
    return identity;
  }

  /**
   * Import existing identity from nsec
   */
  async importFromNsec(nsec: string, displayName?: string): Promise<NostrIdentity | null> {
    await this.ensureInitialized();
    
    try {
      const decoded = nip19.decode(nsec);
      if (decoded.type !== 'nsec') {
        throw new Error('Invalid nsec format');
      }

      const privateKeyBytes = decoded.data as Uint8Array;
      const pubkey = getPublicKey(privateKeyBytes);
      const privkey = bytesToHex(privateKeyBytes);
      const npub = nip19.npubEncode(pubkey);

      const identity: NostrIdentity = {
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
      console.error('[Identity] Failed to import nsec:', error);
      return null;
    }
  }

  /**
   * Import from hex private key
   */
  async importFromHex(hexPrivkey: string, displayName?: string): Promise<NostrIdentity | null> {
    await this.ensureInitialized();
    
    try {
      const privateKeyBytes = hexToBytes(hexPrivkey);
      const pubkey = getPublicKey(privateKeyBytes);
      const npub = nip19.npubEncode(pubkey);

      const identity: NostrIdentity = {
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
      console.error('[Identity] Failed to import hex key:', error);
      return null;
    }
  }

  /**
   * Get current identity (sync for backward compatibility)
   * Note: May return null if still initializing
   */
  getIdentity(): NostrIdentity | null {
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
    return hexToBytes(this.identity.privkey);
  }

  /**
   * Export nsec for backup
   */
  exportNsec(): string | null {
    if (!this.identity) return null;
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
   * Update display name
   */
  async setDisplayName(name: string): Promise<void> {
    await this.ensureInitialized();
    
    if (this.identity) {
      this.identity.displayName = name;
      await this.saveIdentity();
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
  }

  // ----------------------------------------
  // ENCRYPTED PERSISTENCE
  // ----------------------------------------

  /**
   * Save identity with AES-GCM encryption
   */
  private async saveIdentity(): Promise<void> {
    if (!this.identity) return;

    try {
      // Check if crypto is available
      if (!cryptoService.isAvailable()) {
        console.warn('[Identity] Web Crypto not available, falling back to unencrypted storage');
        const data = JSON.stringify(this.identity);
        localStorage.setItem(STORAGE_KEYS.IDENTITY_LEGACY, data);
        return;
      }

      // Encrypt identity data
      const plaintext = JSON.stringify(this.identity);
      const encrypted = await cryptoService.encrypt(plaintext);
      
      // Store encrypted data
      localStorage.setItem(STORAGE_KEYS.IDENTITY_ENCRYPTED, encrypted);
      
      // Remove legacy unencrypted data if it exists
      localStorage.removeItem(STORAGE_KEYS.IDENTITY_LEGACY);
      
      console.log('[Identity] Identity saved with encryption');
    } catch (error) {
      console.error('[Identity] Failed to save identity:', error);
      throw error;
    }
  }

  /**
   * Load identity with decryption and migration support
   */
  private async loadIdentity(): Promise<void> {
    try {
      // First, try to load encrypted identity (v2)
      const encryptedData = localStorage.getItem(STORAGE_KEYS.IDENTITY_ENCRYPTED);
      
      if (encryptedData) {
        // Decrypt and parse
        if (cryptoService.isAvailable()) {
          const decrypted = await cryptoService.decrypt(encryptedData);
          this.identity = JSON.parse(decrypted);
          console.log('[Identity] Loaded encrypted identity');
          return;
        } else {
          console.warn('[Identity] Cannot decrypt - Web Crypto not available');
        }
      }

      // Migration: Check for legacy unencrypted identity
      const legacyData = localStorage.getItem(STORAGE_KEYS.IDENTITY_LEGACY);
      
      if (legacyData) {
        console.log('[Identity] Found legacy unencrypted identity, migrating...');
        this.identity = JSON.parse(legacyData);
        
        // Migrate to encrypted storage
        if (cryptoService.isAvailable()) {
          await this.saveIdentity();
          console.log('[Identity] Migration complete - identity now encrypted');
        }
        return;
      }

      // No identity found
      this.identity = null;
    } catch (error) {
      console.error('[Identity] Failed to load identity:', error);
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
    return typeof window !== 'undefined' && 'nostr' in window;
  }

  /**
   * Get public key from NIP-07 extension
   */
  async getPublicKeyFromExtension(): Promise<string | null> {
    if (!this.hasNip07Extension()) return null;
    
    try {
      const pubkey = await (window as any).nostr.getPublicKey();
      return pubkey;
    } catch (error) {
      console.error('[Identity] NIP-07 getPublicKey failed:', error);
      return null;
    }
  }

  /**
   * Sign event using NIP-07 extension
   */
  async signEventWithExtension(event: any): Promise<any | null> {
    if (!this.hasNip07Extension()) return null;
    
    try {
      const signedEvent = await (window as any).nostr.signEvent(event);
      return signedEvent;
    } catch (error) {
      console.error('[Identity] NIP-07 signEvent failed:', error);
      return null;
    }
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
