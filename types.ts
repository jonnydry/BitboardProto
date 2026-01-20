import type { Event as NostrEvent } from 'nostr-tools';

// ============================================
// NOSTR PROTOCOL TYPES
// ============================================

export type LocalNostrIdentity = {
  kind: 'local';
  pubkey: string;      // hex public key (32 bytes -> 64 hex chars)
  privkey: string;     // hex private key (stored encrypted at rest)
  npub: string;        // bech32 encoded public key
  displayName?: string;
};

export type Nip07NostrIdentity = {
  kind: 'nip07';
  pubkey: string;      // hex public key from extension
  npub: string;        // bech32 encoded public key
  displayName?: string;
};

export type NostrIdentity = LocalNostrIdentity | Nip07NostrIdentity;

export interface NostrRelay {
  url: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
}

// Re-export for convenience
export type { NostrEvent };

// Unsigned event shape used for signing (NIP-07 + local keys)
export type UnsignedNostrEvent = Omit<NostrEvent, 'id' | 'sig'>;

// ============================================
// BOARD TYPES (Hybrid: Topic + Geohash)
// ============================================

export enum BoardType {
  TOPIC = 'topic',       // Traditional named boards (like subreddits)
  GEOHASH = 'geohash'    // Location-based (like BitChat)
}

export enum GeohashPrecision {
  COUNTRY = 2,     // ~2500km
  REGION = 3,      // ~625km  
  PROVINCE = 4,    // ~156km
  CITY = 5,        // ~39km
  NEIGHBORHOOD = 6, // ~9.7km
  BLOCK = 7        // ~1.2km (BitChat's most precise)
}

export interface Board {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  memberCount: number;
  // Nostr integration
  type: BoardType;
  geohash?: string;           // For geohash boards
  precision?: GeohashPrecision;
  nostrEventId?: string;      // Reference to Nostr event
  createdBy?: string;         // Creator's pubkey
  // Encryption (for private boards)
  isEncrypted?: boolean;      // True if content is encrypted
  encryptionKeyHash?: string; // Hash of key for verification (not the key itself)
}

// ============================================
// POST & COMMENT TYPES
// ============================================

export interface Comment {
  id: string;
  author: string;
  authorPubkey?: string;
  content: string;
  timestamp: number;
  nostrEventId?: string;
  editedAt?: number;        // ms (client-derived; for Nostr edits we use edit event timestamp)
  isDeleted?: boolean;      // local UI state (and can be mirrored from Nostr delete events)
  deletedAt?: number;       // ms
  // Threading fields
  parentId?: string;        // null/undefined = top-level, otherwise references parent comment
  replies?: Comment[];      // Populated client-side for tree rendering
  depth?: number;           // Calculated depth for indentation
  isCollapsed?: boolean;    // UI state for collapsing threads
  // Encryption fields
  encryptedContent?: string;
  isEncrypted?: boolean;
  // Voting fields
  score?: number;
  upvotes?: number;
  downvotes?: number;
  uniqueVoters?: number;
  votesVerified?: boolean;
}

// Sync status for optimistic updates
export type SyncStatus = 'pending' | 'synced' | 'failed';

export interface Post {
  id: string;
  boardId: string;
  title: string;
  author: string;
  authorPubkey?: string;
  content: string;
  timestamp: number;
  score: number;
  commentCount: number;
  tags: string[];
  url?: string;
  imageUrl?: string;
  linkDescription?: string;
  comments: Comment[];
  // Nostr integration
  nostrEventId?: string;
  upvotes: number;
  downvotes: number;
  // Voting metadata (optional, derived from Nostr)
  uniqueVoters?: number;
  votesVerified?: boolean;
  // Encryption fields
  encryptedTitle?: string;
  encryptedContent?: string;
  isEncrypted?: boolean;
  // Sync status for optimistic updates
  syncStatus?: SyncStatus;
  syncError?: string;
  // NIP-57 Zap fields (Layer 2 engagement)
  zapCount?: number;          // Number of zaps received
  zapTotal?: number;          // Total satoshis received
}

// ============================================
// USER STATE
// ============================================

export interface UserState {
  username: string;
  bits: number;
  maxBits: number;
  votedPosts: Record<string, 'up' | 'down'>;
  votedComments: Record<string, 'up' | 'down'>;
  // Nostr identity
  identity?: NostrIdentity;
  hasIdentity: boolean; // Whether user has a Nostr identity (separate from relay connection)
  mutedPubkeys?: string[]; // List of muted public keys
}

// ============================================
// APP STATE
// ============================================

export enum ViewMode {
  FEED = 'FEED',
  CREATE = 'CREATE',
  ABOUT = 'ABOUT',
  SINGLE_BIT = 'SINGLE_BIT',
  CREATE_BOARD = 'CREATE_BOARD',
  BROWSE_BOARDS = 'BROWSE_BOARDS',
  IDENTITY = 'IDENTITY',
  RELAYS = 'RELAYS',
  LOCATION = 'LOCATION',
  USER_PROFILE = 'USER_PROFILE',
  BOOKMARKS = 'BOOKMARKS',
  EDIT_POST = 'EDIT_POST',
  NOTIFICATIONS = 'NOTIFICATIONS',
  DIRECT_MESSAGES = 'DIRECT_MESSAGES',  // NIP-04 encrypted DMs
  PRIVACY_POLICY = 'PRIVACY_POLICY',
  TERMS_OF_SERVICE = 'TERMS_OF_SERVICE'
}

export enum SortMode {
  TOP = 'top',           // By score (default)
  NEWEST = 'newest',     // Most recent first
  OLDEST = 'oldest',     // Oldest first
  TRENDING = 'trending', // Recent + high engagement
  COMMENTS = 'comments'  // Most commented
}

export enum ThemeId {
  AMBER = 'amber',
  PHOSPHOR = 'phosphor',
  PLASMA = 'plasma',
  VERMILION = 'vermilion',
  SLATE = 'slate',
  PATRIOT = 'patriot',
  SAKURA = 'sakura',
  BITBORING = 'bitboring'
}

// ============================================
// NOSTR EVENT KINDS (Custom for BitBoard)
// ============================================

export const NOSTR_KINDS = {
  METADATA: 0,              // NIP-01 profile metadata
  POST: 1,
  CONTACT_LIST: 3,          // NIP-02 follow list
  ENCRYPTED_DM: 4,          // NIP-04 encrypted direct messages (legacy)
  DELETE: 5,
  REACTION: 7,
  BADGE_AWARD: 8,           // NIP-58 badge award
  SEAL: 13,                 // NIP-17 seal (encrypted rumor)
  PRIVATE_DM: 14,           // NIP-17 rumor (actual DM content)
  GIFT_WRAP: 1059,          // NIP-17 gift wrap (most private DMs)
  REPORT: 1984,
  ZAP_REQUEST: 9734,        // NIP-57 zap request
  ZAP_RECEIPT: 9735,        // NIP-57 zap receipt
  MUTE_LIST: 10000,         // NIP-51 mute list
  PIN_LIST: 10001,          // NIP-51 pin list
  RELAY_LIST: 10002,        // NIP-65 relay list
  BOOKMARKS: 10003,         // NIP-51 bookmarks
  COMMUNITIES_LIST: 10004,  // NIP-51 communities list
  BADGE_DEFINITION: 30009,  // NIP-58 badge definition
  BADGE_PROFILE: 30008,     // NIP-58 profile badges
  BOARD_DEFINITION: 30001,
  LONG_FORM: 30023,         // NIP-23 long-form content
  COMMUNITY_DEFINITION: 34550, // NIP-72 community definition
  COMMUNITY_APPROVAL: 4550,    // NIP-72 community post approval
  LIVE_EVENT: 30311,        // NIP-53 live activities
  LIVE_CHAT: 1311,          // NIP-53 live chat message
} as const;

// ============================================
// NIP-56 REPORT TYPES
// ============================================

export enum ReportType {
  SPAM = 'spam',
  NUDITY = 'nudity',
  ILLEGAL = 'illegal',
  IMPERSONATION = 'impersonation',
  PROFANITY = 'profanity',
  OTHER = 'other',
}

// ============================================
// NIP-57 ZAP TYPES
// ============================================

export interface ZapRequest {
  recipientPubkey: string;
  eventId?: string;           // Post/comment being zapped (optional for profile zaps)
  amount: number;             // Amount in millisatoshis
  relays: string[];           // Relays to publish receipt to
  content?: string;           // Optional zap comment
  lnurl: string;              // LNURL endpoint
}

export interface ZapReceipt {
  id: string;                 // Event ID of the zap receipt
  zapperPubkey: string;       // Who sent the zap
  recipientPubkey: string;    // Who received the zap
  eventId?: string;           // Post/comment that was zapped
  amount: number;             // Amount in satoshis
  content: string;            // Zap comment
  timestamp: number;          // When the zap was received
  bolt11?: string;            // Lightning invoice
  preimage?: string;          // Payment preimage (proof of payment)
}

export interface ZapTally {
  eventId: string;            // Post/comment ID
  totalSats: number;          // Total satoshis received
  zapCount: number;           // Number of zaps
  topZappers: Array<{         // Top contributors
    pubkey: string;
    amount: number;
    comment?: string;
  }>;
  lastUpdated: number;
}

export interface LNURLPayResponse {
  callback: string;           // URL to get invoice from
  maxSendable: number;        // Max amount in millisats
  minSendable: number;        // Min amount in millisats
  metadata: string;           // JSON metadata string
  tag: string;                // Should be "payRequest"
  allowsNostr?: boolean;      // Whether provider supports NIP-57
  nostrPubkey?: string;       // Provider's pubkey for signing receipts
}

// ============================================
// NIP-58 BADGE TYPES
// ============================================

export interface BadgeDefinition {
  id: string;                 // Badge identifier (d tag)
  creatorPubkey: string;      // Who created the badge
  name: string;               // Badge name
  description?: string;       // Badge description
  image?: string;             // Badge image URL
  thumbImage?: string;        // Thumbnail image URL
  nostrEventId?: string;      // Event ID
}

export interface BadgeAward {
  id: string;                 // Event ID
  badgeId: string;            // Reference to badge definition
  awardedTo: string[];        // Pubkeys who received this badge
  awardedBy: string;          // Creator's pubkey
  timestamp: number;
}

export interface ProfileBadge {
  badgeId: string;            // Badge definition reference
  awardEventId: string;       // Award event reference
}

// ============================================
// NIP-51 LIST TYPES
// ============================================

export interface NostrList {
  id: string;                 // d tag identifier
  kind: number;               // List kind (10000, 10001, 30000, etc.)
  name?: string;              // List name (for parameterized lists)
  pubkeys: string[];          // p tags - pubkeys in the list
  eventIds: string[];         // e tags - events in the list
  addresses: string[];        // a tags - parameterized replaceable events
  hashtags: string[];         // t tags - hashtags
  createdAt: number;
}

// ============================================
// NIP-72 COMMUNITY TYPES
// ============================================

export interface Community {
  id: string;                 // d tag identifier
  name: string;
  description?: string;
  image?: string;
  creatorPubkey: string;
  moderators: string[];       // Pubkeys of moderators
  rules?: string;
  relays?: string[];          // Preferred relays
  nostrEventId?: string;
}

export interface CommunityApproval {
  id: string;                 // Approval event ID
  communityId: string;        // Community being approved for
  postEventId: string;        // Post being approved
  approverPubkey: string;     // Moderator who approved
  timestamp: number;
}

// ============================================
// NIP-53 LIVE EVENT TYPES
// ============================================

export interface LiveEvent {
  id: string;                 // d tag identifier
  title: string;
  summary?: string;
  image?: string;
  streamingUrl?: string;
  recordingUrl?: string;
  status: 'planned' | 'live' | 'ended';
  startsAt?: number;
  endsAt?: number;
  hostPubkey: string;
  participants: Array<{
    pubkey: string;
    role: 'host' | 'speaker' | 'participant';
    relay?: string;
  }>;
  hashtags: string[];
  nostrEventId?: string;
}

// ============================================
// WEB OF TRUST TYPES
// ============================================

export interface WoTScore {
  pubkey: string;
  distance: number;           // Hops from user (0 = self, 1 = direct follow, etc.)
  score: number;              // Calculated trust score (0-1)
  followedBy: string[];       // Which of your follows follow this person
}
