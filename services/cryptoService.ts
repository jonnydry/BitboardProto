// ============================================
// CRYPTO SERVICE
// ============================================
// AES-256-GCM encryption for identity storage
// Adopts patterns from BitChat's SecureIdentityStateManager
//
// Security Properties:
// - AES-256-GCM authenticated encryption
// - Random 12-byte IV per encryption operation
// - Encryption key stored separately from encrypted data
// - Browser-derived key (no password needed)

import { logger } from './loggingService';

// ============================================
// STORAGE KEYS
// ============================================

const STORAGE_KEYS = {
  ENCRYPTION_KEY: 'bitboard_enc_key',
} as const;

// ============================================
// CRYPTO SERVICE CLASS
// ============================================

class CryptoService {
  private encryptionKey: CryptoKey | null = null;
  private initPromise: Promise<void> | null = null;

  // ----------------------------------------
  // INITIALIZATION
  // ----------------------------------------

  /**
   * Initialize the crypto service by loading or creating encryption key
   */
  async initialize(): Promise<void> {
    // Prevent multiple simultaneous initializations
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize(): Promise<void> {
    try {
      // Try to load existing key from storage
      const storedKey = localStorage.getItem(STORAGE_KEYS.ENCRYPTION_KEY);
      
      if (storedKey) {
        this.encryptionKey = await this.importKey(storedKey);
        logger.debug('Crypto', 'Loaded existing encryption key');
      } else {
        // Generate new key
        this.encryptionKey = await this.generateKey();
        const exportedKey = await this.exportKey(this.encryptionKey);
        localStorage.setItem(STORAGE_KEYS.ENCRYPTION_KEY, exportedKey);
        logger.debug('Crypto', 'Generated new encryption key');
      }
    } catch (error) {
      logger.error('Crypto', 'Failed to initialize', error);
      throw error;
    }
  }

  // ----------------------------------------
  // KEY MANAGEMENT
  // ----------------------------------------

  /**
   * Generate a new AES-256-GCM encryption key
   */
  private async generateKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256, // 256-bit key (matches BitChat's SymmetricKey.bits256)
      },
      true, // extractable (needed for storage)
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Export key to base64 string for storage
   */
  private async exportKey(key: CryptoKey): Promise<string> {
    const rawKey = await crypto.subtle.exportKey('raw', key);
    return this.arrayBufferToBase64(rawKey);
  }

  /**
   * Import key from base64 string
   */
  private async importKey(base64Key: string): Promise<CryptoKey> {
    const rawKey = this.base64ToArrayBuffer(base64Key);
    return await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  // ----------------------------------------
  // ENCRYPTION / DECRYPTION
  // ----------------------------------------

  /**
   * Encrypt data using AES-256-GCM
   * Returns base64 encoded string: IV (12 bytes) + ciphertext + tag (16 bytes)
   * Matches BitChat's AES.GCM.seal pattern
   */
  async encrypt(plaintext: string): Promise<string> {
    await this.ensureInitialized();

    if (!this.encryptionKey) {
      throw new Error('Encryption key not available');
    }

    // Generate random 12-byte IV (standard for AES-GCM)
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Encode plaintext to bytes
    const encoder = new TextEncoder();
    const plaintextBytes = encoder.encode(plaintext);

    // Encrypt with AES-GCM (includes authentication tag)
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128, // 16-byte authentication tag
      },
      this.encryptionKey,
      plaintextBytes
    );

    // Combine IV + ciphertext (tag is appended by Web Crypto)
    // Format: [IV (12 bytes)][ciphertext + tag]
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return this.arrayBufferToBase64(combined.buffer);
  }

  /**
   * Decrypt data using AES-256-GCM
   * Expects base64 encoded string: IV (12 bytes) + ciphertext + tag (16 bytes)
   * Matches BitChat's AES.GCM.open pattern
   */
  async decrypt(encryptedData: string): Promise<string> {
    await this.ensureInitialized();

    if (!this.encryptionKey) {
      throw new Error('Encryption key not available');
    }

    // Decode from base64
    const combined = new Uint8Array(this.base64ToArrayBuffer(encryptedData));

    // Extract IV (first 12 bytes)
    const iv = combined.slice(0, 12);
    
    // Extract ciphertext + tag (remaining bytes)
    const ciphertext = combined.slice(12);

    // Decrypt with AES-GCM
    const plaintextBytes = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128,
      },
      this.encryptionKey,
      ciphertext
    );

    // Decode plaintext
    const decoder = new TextDecoder();
    return decoder.decode(plaintextBytes);
  }

  // ----------------------------------------
  // SECURE CLEAR (Best effort in JS)
  // ----------------------------------------

  /**
   * Attempt to securely clear sensitive string data
   * Note: JavaScript doesn't guarantee memory clearing like Swift's memset_s,
   * but we do our best to overwrite and dereference
   */
  secureClear(sensitiveData: string): void {
    // In JavaScript, strings are immutable and we can't directly overwrite memory
    // The best we can do is ensure the reference is cleared and hope for GC
    // This is a limitation of the browser environment vs native (BitChat's KeychainManager)
    
    // For typed arrays, we can overwrite:
    if (sensitiveData && typeof sensitiveData === 'string') {
      // Create a temporary array to overwrite any cached encoder buffers
      const encoder = new TextEncoder();
      const bytes = encoder.encode(sensitiveData);
      crypto.getRandomValues(bytes); // Overwrite with random data
    }
  }

  /**
   * Securely clear a Uint8Array by overwriting with zeros
   */
  secureClearBytes(data: Uint8Array): void {
    if (data) {
      crypto.getRandomValues(data); // First overwrite with random
      data.fill(0); // Then zero out
    }
  }

  // ----------------------------------------
  // UTILITY METHODS
  // ----------------------------------------

  private async ensureInitialized(): Promise<void> {
    if (!this.encryptionKey) {
      await this.initialize();
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
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

  // ----------------------------------------
  // KEY MANAGEMENT (for panic/reset)
  // ----------------------------------------

  /**
   * Delete the encryption key (for panic mode / identity reset)
   * Warning: This will make any encrypted data unrecoverable!
   */
  deleteEncryptionKey(): void {
    localStorage.removeItem(STORAGE_KEYS.ENCRYPTION_KEY);
    this.encryptionKey = null;
    this.initPromise = null;
    logger.info('Crypto', 'Encryption key deleted');
  }

  /**
   * Check if encryption is available (Web Crypto API supported)
   */
  isAvailable(): boolean {
    return typeof crypto !== 'undefined' && 
           typeof crypto.subtle !== 'undefined' &&
           typeof crypto.subtle.encrypt === 'function';
  }

  // ----------------------------------------
  // NIP-04 ENCRYPTION (Legacy - for backward compatibility)
  // ----------------------------------------

  /**
   * Encrypt a message using NIP-04 (secp256k1 ECDH + AES-256-CBC)
   * Format: base64(ciphertext)?iv=base64(iv)
   * 
   * NOTE: NIP-04 is legacy. Prefer NIP-44 for new messages.
   */
  async encryptNIP04(
    plaintext: string,
    senderPrivkey: string,
    recipientPubkey: string
  ): Promise<string | null> {
    try {
      const { nip04 } = await import('nostr-tools');
      const encrypted = await nip04.encrypt(senderPrivkey, recipientPubkey, plaintext);
      return encrypted;
    } catch (error) {
      logger.error('Crypto', 'NIP-04 encryption failed', error);
      return null;
    }
  }

  /**
   * Decrypt a NIP-04 encrypted message (async)
   */
  async decryptNIP04(
    encryptedContent: string,
    receiverPrivkey: string,
    senderPubkey: string
  ): Promise<string | null> {
    try {
      const { nip04 } = await import('nostr-tools');
      const decrypted = await nip04.decrypt(receiverPrivkey, senderPubkey, encryptedContent);
      return decrypted;
    } catch (error) {
      logger.error('Crypto', 'NIP-04 decryption failed', error);
      return null;
    }
  }

  // Alias for backward compatibility
  async decryptNIP04Async(
    encryptedContent: string,
    receiverPrivkey: string,
    senderPubkey: string
  ): Promise<string | null> {
    return this.decryptNIP04(encryptedContent, receiverPrivkey, senderPubkey);
  }

  // ----------------------------------------
  // NIP-44 ENCRYPTION (Modern - Recommended)
  // ----------------------------------------

  /**
   * Convert hex string to Uint8Array
   */
  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  /**
   * Encrypt a message using NIP-44 (versioned encryption)
   * 
   * Benefits over NIP-04:
   * - Message padding (hides message length)
   * - ChaCha20-Poly1305 (modern AEAD)
   * - Versioned for future upgrades
   * - Better key derivation
   */
  async encryptNIP44(
    plaintext: string,
    senderPrivkey: string,
    recipientPubkey: string
  ): Promise<string | null> {
    try {
      const { nip44 } = await import('nostr-tools');
      
      // Convert hex string to Uint8Array
      const privkeyBytes = this.hexToBytes(senderPrivkey);
      
      // Derive conversation key using ECDH
      const conversationKey = nip44.getConversationKey(privkeyBytes, recipientPubkey);
      
      // Encrypt with NIP-44
      const encrypted = nip44.encrypt(plaintext, conversationKey);
      return encrypted;
    } catch (error) {
      logger.error('Crypto', 'NIP-44 encryption failed', error);
      return null;
    }
  }

  /**
   * Decrypt a NIP-44 encrypted message
   */
  async decryptNIP44(
    encryptedContent: string,
    receiverPrivkey: string,
    senderPubkey: string
  ): Promise<string | null> {
    try {
      const { nip44 } = await import('nostr-tools');
      
      // Convert hex string to Uint8Array
      const privkeyBytes = this.hexToBytes(receiverPrivkey);
      
      // Derive conversation key using ECDH
      const conversationKey = nip44.getConversationKey(privkeyBytes, senderPubkey);
      
      // Decrypt with NIP-44
      const decrypted = nip44.decrypt(encryptedContent, conversationKey);
      return decrypted;
    } catch (error) {
      logger.error('Crypto', 'NIP-44 decryption failed', error);
      return null;
    }
  }

  // ----------------------------------------
  // NIP-17 GIFT WRAPPING (Most Private DMs)
  // ----------------------------------------

  /**
   * Create a NIP-17 gift-wrapped DM
   * 
   * Structure:
   * 1. Rumor (unsigned kind 14) - actual message content
   * 2. Seal (kind 13) - encrypted rumor, signed by sender
   * 3. Gift Wrap (kind 1059) - encrypted seal, signed by random key
   * 
   * Benefits:
   * - Hides sender/recipient from relays
   * - Provides plausible deniability
   * - Combines NIP-44 encryption for security
   */
  async createGiftWrap(args: {
    content: string;
    senderPrivkey: string;
    senderPubkey: string;
    recipientPubkey: string;
    replyToId?: string;
  }): Promise<{ giftWrap: any; sealEvent: any; rumor: any } | null> {
    try {
      const { nip44, nip59: _nip59, finalizeEvent, generateSecretKey, getPublicKey } = await import('nostr-tools');
      
      // 1. Create the rumor (unsigned kind 14 event)
      const rumor = {
        kind: 14, // NIP-17 private DM kind
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', args.recipientPubkey]],
        content: args.content,
        pubkey: args.senderPubkey,
      };

      // Add reply reference if applicable
      if (args.replyToId) {
        rumor.tags.push(['e', args.replyToId, '', 'reply']);
      }

      // 2. Create the seal (kind 13) - encrypted rumor
      const senderPrivkeyBytes = this.hexToBytes(args.senderPrivkey);
      const sealConversationKey = nip44.getConversationKey(senderPrivkeyBytes, args.recipientPubkey);
      const encryptedRumor = nip44.encrypt(JSON.stringify(rumor), sealConversationKey);
      
      const sealEvent = finalizeEvent({
        kind: 13,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: encryptedRumor,
      }, senderPrivkeyBytes);

      // 3. Create the gift wrap (kind 1059) - encrypted seal with random key
      const randomPrivkey = generateSecretKey();
      const _randomPubkey = getPublicKey(randomPrivkey);
      
      const wrapConversationKey = nip44.getConversationKey(randomPrivkey, args.recipientPubkey);
      const encryptedSeal = nip44.encrypt(JSON.stringify(sealEvent), wrapConversationKey);

      const giftWrap = finalizeEvent({
        kind: 1059,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', args.recipientPubkey]],
        content: encryptedSeal,
      }, randomPrivkey);

      return { giftWrap, sealEvent, rumor };
    } catch (error) {
      logger.error('Crypto', 'Failed to create gift wrap', error);
      return null;
    }
  }

  /**
   * Unwrap a NIP-17 gift-wrapped DM
   * 
   * @returns The decrypted rumor (message content) or null
   */
  async unwrapGiftWrap(args: {
    giftWrapEvent: any;
    recipientPrivkey: string;
  }): Promise<{
    content: string;
    senderPubkey: string;
    timestamp: number;
    replyToId?: string;
  } | null> {
    try {
      const { nip44 } = await import('nostr-tools');
      
      // Convert hex string to Uint8Array
      const recipientPrivkeyBytes = this.hexToBytes(args.recipientPrivkey);
      
      // 1. Decrypt the gift wrap to get the seal
      const wrapperPubkey = args.giftWrapEvent.pubkey;
      const wrapConversationKey = nip44.getConversationKey(recipientPrivkeyBytes, wrapperPubkey);
      const sealJson = nip44.decrypt(args.giftWrapEvent.content, wrapConversationKey);
      const sealEvent = JSON.parse(sealJson);

      // 2. Decrypt the seal to get the rumor
      const sealConversationKey = nip44.getConversationKey(recipientPrivkeyBytes, sealEvent.pubkey);
      const rumorJson = nip44.decrypt(sealEvent.content, sealConversationKey);
      const rumor = JSON.parse(rumorJson);

      // 3. Extract message details
      const replyTag = rumor.tags?.find((t: string[]) => t[0] === 'e' && t[3] === 'reply');

      return {
        content: rumor.content,
        senderPubkey: sealEvent.pubkey, // Actual sender from seal
        timestamp: rumor.created_at * 1000,
        replyToId: replyTag?.[1],
      };
    } catch (error) {
      logger.error('Crypto', 'Failed to unwrap gift wrap', error);
      return null;
    }
  }

  /**
   * Detect if an event is a NIP-17 gift wrap
   */
  isGiftWrap(event: any): boolean {
    return event?.kind === 1059;
  }

  /**
   * Detect if an event is a NIP-04 DM (legacy)
   */
  isLegacyDM(event: any): boolean {
    return event?.kind === 4;
  }
}

// Export singleton instance
export const cryptoService = new CryptoService();

// Export the class for testing
export { CryptoService };
