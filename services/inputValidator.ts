// ============================================
// INPUT VALIDATOR SERVICE
// ============================================
// Comprehensive input validation for BitBoard
// Prevents injection attacks, XSS, and malformed data
// Adopted from BitChat's InputValidator.swift

// ============================================
// CONSTANTS
// ============================================

export const InputLimits = {
  MAX_USERNAME_LENGTH: 50,
  MAX_TITLE_LENGTH: 300,
  MAX_POST_CONTENT_LENGTH: 60000, // 60KB - matches BitChat's limit
  MAX_COMMENT_LENGTH: 10000,
  MAX_TAG_LENGTH: 50,
  MAX_TAGS_COUNT: 10,
  MAX_URL_LENGTH: 2048,
  MAX_BOARD_NAME_LENGTH: 50,
  MAX_BOARD_DESCRIPTION_LENGTH: 500,
  // Timestamp validation window (1 hour in ms)
  TIMESTAMP_WINDOW_MS: 60 * 60 * 1000,
} as const;

// ============================================
// INPUT VALIDATOR CLASS
// ============================================

class InputValidator {
  // ----------------------------------------
  // STRING CONTENT VALIDATION
  // ----------------------------------------

  /**
   * Validates and sanitizes user-provided strings
   * Rejects strings containing control characters to prevent security issues
   * and UI rendering problems
   * 
   * @param input - The string to validate
   * @param maxLength - Maximum allowed length
   * @returns Sanitized string or null if invalid
   */
  validateUserString(input: string, maxLength: number): string | null {
    if (!input || typeof input !== 'string') {
      return null;
    }

    const trimmed = input.trim();
    
    if (trimmed.length === 0) {
      return null;
    }
    
    if (trimmed.length > maxLength) {
      return null;
    }

    // Reject control characters (prevents injection attacks)
    // Control characters are U+0000 to U+001F and U+007F to U+009F
    // Exception: allow newlines (\n) and tabs (\t) in content fields
    const controlCharRegex = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/;
    if (controlCharRegex.test(trimmed)) {
      console.warn('[InputValidator] Rejected string with control characters');
      return null;
    }

    return trimmed;
  }

  /**
   * Validates and sanitizes single-line strings (no newlines allowed)
   * Used for usernames, titles, tags, etc.
   */
  validateSingleLine(input: string, maxLength: number): string | null {
    const validated = this.validateUserString(input, maxLength);
    if (!validated) return null;

    // Reject newlines for single-line fields
    if (/[\n\r]/.test(validated)) {
      return null;
    }

    return validated;
  }

  // ----------------------------------------
  // SPECIFIC FIELD VALIDATORS
  // ----------------------------------------

  /**
   * Validates username/display name
   */
  validateUsername(username: string): string | null {
    return this.validateSingleLine(username, InputLimits.MAX_USERNAME_LENGTH);
  }

  /**
   * Validates post title
   */
  validateTitle(title: string): string | null {
    return this.validateSingleLine(title, InputLimits.MAX_TITLE_LENGTH);
  }

  /**
   * Validates post content (allows newlines)
   */
  validatePostContent(content: string): string | null {
    return this.validateUserString(content, InputLimits.MAX_POST_CONTENT_LENGTH);
  }

  /**
   * Validates comment content (allows newlines)
   */
  validateCommentContent(content: string): string | null {
    return this.validateUserString(content, InputLimits.MAX_COMMENT_LENGTH);
  }

  /**
   * Validates a single tag
   */
  validateTag(tag: string): string | null {
    const validated = this.validateSingleLine(tag, InputLimits.MAX_TAG_LENGTH);
    if (!validated) return null;

    // Tags should be alphanumeric with optional hyphens/underscores
    // Convert to lowercase for consistency
    const normalized = validated.toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(normalized)) {
      return null;
    }

    return normalized;
  }

  /**
   * Validates an array of tags
   */
  validateTags(tags: string[]): string[] {
    if (!Array.isArray(tags)) return [];

    const validTags: string[] = [];
    const seen = new Set<string>();

    for (const tag of tags) {
      if (validTags.length >= InputLimits.MAX_TAGS_COUNT) break;
      
      const validated = this.validateTag(tag);
      if (validated && !seen.has(validated)) {
        validTags.push(validated);
        seen.add(validated);
      }
    }

    return validTags;
  }

  /**
   * Validates URL
   */
  validateUrl(url: string): string | null {
    if (!url || typeof url !== 'string') return null;

    const trimmed = url.trim();
    if (trimmed.length === 0 || trimmed.length > InputLimits.MAX_URL_LENGTH) {
      return null;
    }

    // Basic URL validation
    try {
      const parsed = new URL(trimmed);
      // Only allow http and https protocols
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return null;
      }
      return trimmed;
    } catch {
      return null;
    }
  }

  /**
   * Validates board name
   */
  validateBoardName(name: string): string | null {
    const validated = this.validateSingleLine(name, InputLimits.MAX_BOARD_NAME_LENGTH);
    if (!validated) return null;

    // Board names should be alphanumeric with optional underscores
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(validated)) {
      return null;
    }

    return validated.toUpperCase();
  }

  /**
   * Validates board description
   */
  validateBoardDescription(description: string): string | null {
    return this.validateUserString(description, InputLimits.MAX_BOARD_DESCRIPTION_LENGTH);
  }

  // ----------------------------------------
  // TIMESTAMP VALIDATION
  // ----------------------------------------

  /**
   * Validates timestamp is reasonable (not too far in past or future)
   * Matches BitChat's 1-hour window
   */
  validateTimestamp(timestamp: number): boolean {
    const now = Date.now();
    const oneHourAgo = now - InputLimits.TIMESTAMP_WINDOW_MS;
    const oneHourFromNow = now + InputLimits.TIMESTAMP_WINDOW_MS;
    
    return timestamp >= oneHourAgo && timestamp <= oneHourFromNow;
  }

  // ----------------------------------------
  // HTML SANITIZATION
  // ----------------------------------------

  /**
   * Escapes HTML special characters to prevent XSS
   * Use this when displaying user content in HTML context
   */
  escapeHtml(input: string): string {
    if (!input || typeof input !== 'string') return '';
    
    const htmlEscapes: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
    };

    return input.replace(/[&<>"'/]/g, (char) => htmlEscapes[char] || char);
  }

  /**
   * Strips all HTML tags from input
   */
  stripHtml(input: string): string {
    if (!input || typeof input !== 'string') return '';
    return input.replace(/<[^>]*>/g, '');
  }

  // ----------------------------------------
  // NOSTR-SPECIFIC VALIDATION
  // ----------------------------------------

  /**
   * Validates Nostr public key (hex format)
   */
  validatePubkeyHex(pubkey: string): string | null {
    if (!pubkey || typeof pubkey !== 'string') return null;
    
    const trimmed = pubkey.trim().toLowerCase();
    
    // Nostr pubkeys are 64 hex characters (32 bytes)
    if (!/^[a-f0-9]{64}$/.test(trimmed)) {
      return null;
    }

    return trimmed;
  }

  /**
   * Validates Nostr event ID (hex format)
   */
  validateEventId(eventId: string): string | null {
    // Event IDs have the same format as pubkeys (64 hex chars)
    return this.validatePubkeyHex(eventId);
  }

  /**
   * Validates npub (bech32 encoded public key)
   */
  validateNpub(npub: string): string | null {
    if (!npub || typeof npub !== 'string') return null;
    
    const trimmed = npub.trim().toLowerCase();
    
    // npub starts with 'npub1' and is ~63 characters
    if (!trimmed.startsWith('npub1') || trimmed.length < 60 || trimmed.length > 65) {
      return null;
    }

    // Basic bech32 character validation
    if (!/^npub1[023456789acdefghjklmnpqrstuvwxyz]+$/.test(trimmed)) {
      return null;
    }

    return trimmed;
  }

  /**
   * Validates nsec (bech32 encoded private key)
   */
  validateNsec(nsec: string): string | null {
    if (!nsec || typeof nsec !== 'string') return null;
    
    const trimmed = nsec.trim().toLowerCase();
    
    // nsec starts with 'nsec1' and is ~63 characters
    if (!trimmed.startsWith('nsec1') || trimmed.length < 60 || trimmed.length > 65) {
      return null;
    }

    // Basic bech32 character validation
    if (!/^nsec1[023456789acdefghjklmnpqrstuvwxyz]+$/.test(trimmed)) {
      return null;
    }

    return trimmed;
  }

  // ----------------------------------------
  // GEOHASH VALIDATION
  // ----------------------------------------

  /**
   * Validates geohash string
   */
  validateGeohash(geohash: string): string | null {
    if (!geohash || typeof geohash !== 'string') return null;
    
    const trimmed = geohash.trim().toLowerCase();
    
    // Geohashes are 1-12 characters, base32 encoded
    if (trimmed.length < 1 || trimmed.length > 12) {
      return null;
    }

    // Valid geohash characters
    if (!/^[0123456789bcdefghjkmnpqrstuvwxyz]+$/.test(trimmed)) {
      return null;
    }

    return trimmed;
  }
}

// Export singleton instance
export const inputValidator = new InputValidator();




