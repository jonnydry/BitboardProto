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
        console.log('[Crypto] Loaded existing encryption key');
      } else {
        // Generate new key
        this.encryptionKey = await this.generateKey();
        const exportedKey = await this.exportKey(this.encryptionKey);
        localStorage.setItem(STORAGE_KEYS.ENCRYPTION_KEY, exportedKey);
        console.log('[Crypto] Generated new encryption key');
      }
    } catch (error) {
      console.error('[Crypto] Failed to initialize:', error);
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
    console.log('[Crypto] Encryption key deleted');
  }

  /**
   * Check if encryption is available (Web Crypto API supported)
   */
  isAvailable(): boolean {
    return typeof crypto !== 'undefined' && 
           typeof crypto.subtle !== 'undefined' &&
           typeof crypto.subtle.encrypt === 'function';
  }
}

// Export singleton instance
export const cryptoService = new CryptoService();


