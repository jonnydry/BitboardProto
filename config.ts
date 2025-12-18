// ============================================
// BITBOARD CONFIGURATION
// ============================================
// Centralized configuration for all magic numbers and settings
// Adopted from BitChat's TransportConfig.swift pattern
//
// Benefits:
// - Easy to tune and maintain
// - Single source of truth
// - Clear documentation of limits
// - Easy to override for testing

// ============================================
// USER ECONOMY
// ============================================

export const UserConfig = {
  /** Maximum bits a user can have per day */
  MAX_DAILY_BITS: 100,
  
  /** Starting bits for new users */
  INITIAL_BITS: 100,
  
  /** Cost to create a post */
  POST_COST: 0,
  
  /**
   * Cost to vote (refunded if vote is retracted)
   * 
   * BIT-TO-VOTE MAPPING:
   * - 1 bit = permission to cast 1 cryptographic Nostr vote
   * - Bits are spent locally BEFORE publishing to Nostr
   * - If Nostr publish fails, bit is refunded (rollback)
   * - Switching vote direction is FREE (bit stays locked)
   * - Retracting vote refunds the bit
   * 
   * This matches the cryptographic model: one vote per pubkey per post.
   * Bits gate access; Nostr enforces the rule cryptographically.
   */
  VOTE_COST: 1,
  
  /** Cost to create a board */
  BOARD_COST: 0,
} as const;

// ============================================
// NOSTR CONFIGURATION
// ============================================

export const NostrConfig = {
  /** Default relay URLs */
  DEFAULT_RELAYS: [
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://nostr.wine',
    'wss://relay.nostr.info',
  ] as const,

  /** Maximum number of posts to fetch at once */
  DEFAULT_FETCH_LIMIT: 50,
  
  /** Maximum number of boards to fetch */
  BOARDS_FETCH_LIMIT: 100,
  
  /** Subscription lookback window (1 hour in seconds) */
  SUBSCRIPTION_SINCE_SECONDS: 3600,

  // Relay backoff configuration (matches BitChat)
  /** Initial backoff interval in ms */
  RELAY_INITIAL_BACKOFF_MS: 1000,
  
  /** Maximum backoff interval in ms (5 minutes) */
  RELAY_MAX_BACKOFF_MS: 300000,
  
  /** Backoff multiplier */
  RELAY_BACKOFF_MULTIPLIER: 2.0,
  
  /** Maximum reconnection attempts before giving up */
  RELAY_MAX_RECONNECT_ATTEMPTS: 10,

  // Offline message queue (when some relays are down)
  /** Maximum queued messages to retain */
  MESSAGE_QUEUE_MAX_SIZE: 500,
  /** Drop queued messages older than this */
  MESSAGE_QUEUE_MAX_AGE_MS: 5 * 60 * 1000,

  // Geohash settings
  /** Initial lookback for geohash queries (1 hour) */
  GEOHASH_INITIAL_LOOKBACK_SECONDS: 3600,
  
  /** Limit for geohash queries */
  GEOHASH_QUERY_LIMIT: 200,
} as const;

// ============================================
// INPUT VALIDATION LIMITS
// ============================================

export const InputLimits = {
  /** Maximum username/display name length */
  MAX_USERNAME_LENGTH: 50,
  
  /** Maximum post title length */
  MAX_TITLE_LENGTH: 300,
  
  /** Maximum post content length (60KB - matches BitChat) */
  MAX_POST_CONTENT_LENGTH: 60000,
  
  /** Maximum comment length */
  MAX_COMMENT_LENGTH: 10000,
  
  /** Maximum single tag length */
  MAX_TAG_LENGTH: 50,
  
  /** Maximum number of tags per post */
  MAX_TAGS_COUNT: 10,
  
  /** Maximum URL length */
  MAX_URL_LENGTH: 2048,
  
  /** Maximum board name length */
  MAX_BOARD_NAME_LENGTH: 50,
  
  /** Maximum board description length */
  MAX_BOARD_DESCRIPTION_LENGTH: 500,
  
  /** Timestamp validation window (1 hour in ms) */
  TIMESTAMP_WINDOW_MS: 60 * 60 * 1000,
} as const;

// ============================================
// RATE LIMITING
// ============================================

export const RateLimitConfig = {
  // Per-user posting limits
  /** Maximum burst of posts */
  POST_CAPACITY: 5,
  /** Posts per second refill rate */
  POST_REFILL_PER_SEC: 0.1,

  // Per-user voting limits
  /** Maximum burst of votes */
  VOTE_CAPACITY: 20,
  /** Votes per second refill rate */
  VOTE_REFILL_PER_SEC: 1,

  // Per-user comment limits
  /** Maximum burst of comments */
  COMMENT_CAPACITY: 10,
  /** Comments per second refill rate */
  COMMENT_REFILL_PER_SEC: 0.5,

  // Content-based limits
  /** Max identical content submissions */
  CONTENT_CAPACITY: 3,
  /** Content refill rate */
  CONTENT_REFILL_PER_SEC: 0.5,

  // Global limits
  /** Global post capacity */
  GLOBAL_POST_CAPACITY: 100,
  /** Global post refill rate */
  GLOBAL_POST_REFILL_PER_SEC: 10,

  // Relay limits
  /** Relay message capacity */
  RELAY_MESSAGE_CAPACITY: 100,
  /** Relay message refill rate */
  RELAY_MESSAGE_REFILL_PER_SEC: 50,
} as const;

// ============================================
// MESSAGE DEDUPLICATION
// ============================================

export const DeduplicatorConfig = {
  /** Maximum age of tracked messages (5 minutes) */
  MAX_AGE_MS: 5 * 60 * 1000,
  
  /** Maximum number of messages to track */
  MAX_COUNT: 1000,
  
  /** Cleanup interval (1 minute) */
  CLEANUP_INTERVAL_MS: 60 * 1000,
} as const;

// ============================================
// UI CONFIGURATION
// ============================================

export const UIConfig = {
  // Feed settings
  /** Number of posts to show initially */
  INITIAL_POSTS_COUNT: 50,
  
  /** Number of posts to load on scroll */
  POSTS_LOAD_MORE_COUNT: 25,
  
  /** Comment expansion threshold (show inline vs full page) */
  COMMENT_EXPANSION_THRESHOLD: 5,
  
  /** Number of comments to show in inline preview */
  INLINE_PREVIEW_COMMENT_COUNT: 5,

  // Animation durations (in ms)
  /** Short animation duration */
  ANIMATION_SHORT_MS: 150,
  
  /** Medium animation duration */
  ANIMATION_MEDIUM_MS: 200,
  
  /** Long animation duration */
  ANIMATION_LONG_MS: 300,

  // Debounce/throttle
  /** Scroll throttle interval */
  SCROLL_THROTTLE_MS: 500,
  
  /** Search debounce interval */
  SEARCH_DEBOUNCE_MS: 300,
  
  /** Auto-save debounce interval */
  AUTOSAVE_DEBOUNCE_MS: 2000,

  // Timeouts
  /** Network request timeout */
  NETWORK_TIMEOUT_MS: 30000,
  
  /** Toast notification duration */
  TOAST_DURATION_MS: 3000,
} as const;

// ============================================
// SECURITY CONFIGURATION
// ============================================

export const SecurityConfig = {
  /** Maximum message size (64KB - Noise spec) */
  MAX_MESSAGE_SIZE: 65535,
  
  /** Session timeout (24 hours in ms) */
  SESSION_TIMEOUT_MS: 24 * 60 * 60 * 1000,
  
  /** Encryption key size in bits */
  ENCRYPTION_KEY_BITS: 256,
  
  /** IV size for AES-GCM in bytes */
  AES_GCM_IV_SIZE: 12,
  
  /** Tag size for AES-GCM in bits */
  AES_GCM_TAG_BITS: 128,
} as const;

// ============================================
// GEOHASH CONFIGURATION
// ============================================

export const GeohashConfig = {
  /** Default precision for location boards */
  DEFAULT_PRECISION: 6, // ~1.2km (NEIGHBORHOOD)
  
  /** Minimum precision (country level) */
  MIN_PRECISION: 2,
  
  /** Maximum precision (block level) */
  MAX_PRECISION: 7,
  
  // Precision descriptions
  PRECISION_LABELS: {
    2: 'COUNTRY',
    3: 'REGION',
    4: 'PROVINCE',
    5: 'CITY',
    6: 'NEIGHBORHOOD',
    7: 'BLOCK',
  } as const,
  
  PRECISION_RADIUS: {
    2: '~2500km',
    3: '~625km',
    4: '~156km',
    5: '~39km',
    6: '~9.7km',
    7: '~1.2km',
  } as const,
} as const;

// ============================================
// STORAGE KEYS
// ============================================

export const StorageKeys = {
  // Identity
  IDENTITY_ENCRYPTED: 'bitboard_identity_v2',
  IDENTITY_LEGACY: 'bitboard_identity',
  ENCRYPTION_KEY: 'bitboard_enc_key',
  
  // User preferences
  THEME: 'bitboard_theme',
  DISPLAY_NAME: 'bitboard_display_name',
  
  // Cache
  BOARDS_CACHE: 'bitboard_boards_cache',
  POSTS_CACHE: 'bitboard_posts_cache',
  
  // Bookmarks
  FAVORITE_BOARDS: 'bitboard_favorite_boards',
  GEOHASH_BOOKMARKS: 'bitboard_geohash_bookmarks',
} as const;

// ============================================
// FEATURE FLAGS
// ============================================

export const FeatureFlags = {
  /** Enable geohash/location features */
  ENABLE_GEOHASH: true,
  
  /** Enable Gemini AI link scanning */
  ENABLE_LINK_SCANNING: true,
  
  /** Enable NIP-07 browser extension support */
  ENABLE_NIP07: true,
  
  /** Enable offline mode with cached data */
  ENABLE_OFFLINE_MODE: true,
  
  /** Enable debug logging */
  ENABLE_DEBUG_LOGGING: import.meta.env.DEV,
} as const;

// ============================================
// EXPORT ALL
// ============================================

export const Config = {
  User: UserConfig,
  Nostr: NostrConfig,
  Input: InputLimits,
  RateLimit: RateLimitConfig,
  Deduplicator: DeduplicatorConfig,
  UI: UIConfig,
  Security: SecurityConfig,
  Geohash: GeohashConfig,
  Storage: StorageKeys,
  Features: FeatureFlags,
} as const;

export default Config;


