// ============================================
// ENCRYPTED BOARD SERVICE
// ============================================
// Handles board-specific encryption for private boards.
// Each encrypted board has its own symmetric key that can be
// shared via URL fragments (never sent to servers).
//
// Key in URL: bitboard.app/b/boardid#base64key
// The URL fragment stays client-side only.

const STORAGE_KEY = 'bitboard_encrypted_board_keys';

interface EncryptedBoardKey {
  boardId: string;
  key: string;  // base64-encoded AES-256 key
  createdAt: number;
}

class EncryptedBoardService {
  private boardKeys: Map<string, EncryptedBoardKey> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  // ----------------------------------------
  // STORAGE
  // ----------------------------------------

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const keys: EncryptedBoardKey[] = JSON.parse(stored);
        keys.forEach(k => this.boardKeys.set(k.boardId, k));
      }
    } catch (error) {
      console.error('[EncryptedBoard] Failed to load keys:', error);
    }
  }

  private saveToStorage(): void {
    try {
      const keys = Array.from(this.boardKeys.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
    } catch (error) {
      console.error('[EncryptedBoard] Failed to save keys:', error);
    }
  }

  // ----------------------------------------
  // KEY GENERATION
  // ----------------------------------------

  /**
   * Generate a new AES-256 key for a board
   * Returns the base64-encoded raw key
   */
  async generateBoardKey(): Promise<string> {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    
    const rawKey = await crypto.subtle.exportKey('raw', key);
    return this.arrayBufferToBase64(rawKey);
  }

  /**
   * Import a base64 key string into a CryptoKey
   */
  private async importKey(base64Key: string): Promise<CryptoKey> {
    const rawKey = this.base64ToArrayBuffer(base64Key);
    return await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // ----------------------------------------
  // KEY STORAGE
  // ----------------------------------------

  /**
   * Save a board key (when creating or receiving a share link)
   */
  saveBoardKey(boardId: string, key: string): void {
    const entry: EncryptedBoardKey = {
      boardId,
      key,
      createdAt: Date.now(),
    };
    this.boardKeys.set(boardId, entry);
    this.saveToStorage();
    console.log(`[EncryptedBoard] Saved key for board: ${boardId}`);
  }

  /**
   * Get the stored key for a board
   */
  getBoardKey(boardId: string): string | null {
    const entry = this.boardKeys.get(boardId);
    return entry?.key || null;
  }

  /**
   * Check if we have the key for a board
   */
  hasBoardKey(boardId: string): boolean {
    return this.boardKeys.has(boardId);
  }

  /**
   * Remove a board key
   */
  removeBoardKey(boardId: string): void {
    this.boardKeys.delete(boardId);
    this.saveToStorage();
  }

  // ----------------------------------------
  // ENCRYPTION / DECRYPTION
  // ----------------------------------------

  /**
   * Encrypt content for a board
   * Returns base64-encoded ciphertext (IV + encrypted + tag)
   */
  async encryptContent(plaintext: string, base64Key: string): Promise<string> {
    const key = await this.importKey(base64Key);
    
    // Generate random 12-byte IV
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Encode plaintext
    const encoder = new TextEncoder();
    const plaintextBytes = encoder.encode(plaintext);

    // Encrypt with AES-GCM
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      key,
      plaintextBytes
    );

    // Combine IV + ciphertext
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return this.arrayBufferToBase64(combined.buffer);
  }

  /**
   * Decrypt content from a board
   */
  async decryptContent(ciphertext: string, base64Key: string): Promise<string> {
    const key = await this.importKey(base64Key);
    
    // Decode from base64
    const combined = new Uint8Array(this.base64ToArrayBuffer(ciphertext));

    // Extract IV (first 12 bytes)
    const iv = combined.slice(0, 12);
    
    // Extract ciphertext (remaining bytes)
    const encryptedData = combined.slice(12);

    // Decrypt
    const plaintextBytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      key,
      encryptedData
    );

    // Decode
    const decoder = new TextDecoder();
    return decoder.decode(plaintextBytes);
  }

  /**
   * Encrypt a post's content for an encrypted board
   */
  async encryptPost(
    post: { title: string; content: string },
    base64Key: string
  ): Promise<{ encryptedTitle: string; encryptedContent: string }> {
    const [encryptedTitle, encryptedContent] = await Promise.all([
      this.encryptContent(post.title, base64Key),
      this.encryptContent(post.content, base64Key),
    ]);
    return { encryptedTitle, encryptedContent };
  }

  /**
   * Decrypt a post's content from an encrypted board
   */
  async decryptPost(
    encrypted: { encryptedTitle: string; encryptedContent: string },
    base64Key: string
  ): Promise<{ title: string; content: string }> {
    try {
      const [title, content] = await Promise.all([
        this.decryptContent(encrypted.encryptedTitle, base64Key),
        this.decryptContent(encrypted.encryptedContent, base64Key),
      ]);
      return { title, content };
    } catch (error) {
      console.error('[EncryptedBoard] Failed to decrypt post:', error);
      return {
        title: '[Encrypted - Access Required]',
        content: '[This content is encrypted. You need the share link to view it.]',
      };
    }
  }

  // ----------------------------------------
  // SHARE LINK GENERATION
  // ----------------------------------------

  /**
   * Generate a shareable link with the key in the URL fragment
   * The fragment is never sent to servers
   */
  generateShareLink(boardId: string, base64Key: string): string {
    // Use URL-safe base64
    const urlSafeKey = base64Key
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    // Get the base URL (works in browser)
    const baseUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : 'https://bitboard.app';
    
    return `${baseUrl}/b/${boardId}#key=${urlSafeKey}`;
  }

  /**
   * Parse a key from URL fragment
   * Returns null if no key found
   */
  parseKeyFromUrl(): { boardId: string; key: string } | null {
    if (typeof window === 'undefined') return null;

    const hash = window.location.hash;
    if (!hash.includes('key=')) return null;

    // Extract key from fragment
    const keyMatch = hash.match(/key=([A-Za-z0-9_-]+)/);
    if (!keyMatch) return null;

    // Convert URL-safe base64 back to standard base64
    let key = keyMatch[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    // Add padding if needed
    while (key.length % 4 !== 0) {
      key += '=';
    }

    // Extract board ID from path
    const pathMatch = window.location.pathname.match(/\/b\/([^/]+)/);
    const boardId = pathMatch?.[1] || '';

    if (!boardId || !key) return null;

    return { boardId, key };
  }

  /**
   * Handle incoming share link
   * Saves the key and returns board info
   */
  handleShareLink(): { boardId: string; key: string } | null {
    const parsed = this.parseKeyFromUrl();
    if (!parsed) return null;

    // Save the key for this board
    this.saveBoardKey(parsed.boardId, parsed.key);

    // Clear the hash from URL (security: don't leave key in browser history)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.hash = '';
      window.history.replaceState(null, '', url.toString());
    }

    console.log(`[EncryptedBoard] Received share link for board: ${parsed.boardId}`);
    return parsed;
  }

  // ----------------------------------------
  // UTILITY
  // ----------------------------------------

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

  /**
   * Check if crypto is available
   */
  isAvailable(): boolean {
    return typeof crypto !== 'undefined' && 
           typeof crypto.subtle !== 'undefined';
  }

  /**
   * Get all board IDs with stored keys
   */
  getEncryptedBoardIds(): string[] {
    return Array.from(this.boardKeys.keys());
  }
}

// Export singleton
export const encryptedBoardService = new EncryptedBoardService();



