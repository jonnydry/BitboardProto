import type { Event as NostrEvent } from 'nostr-tools';

// ============================================
// NOSTR PROTOCOL TYPES
// ============================================

export interface NostrIdentity {
  pubkey: string;      // npub in hex format
  privkey: string;     // nsec in hex format (stored encrypted)
  npub: string;        // bech32 encoded public key
  displayName?: string;
}

export interface NostrRelay {
  url: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
}

// Re-export for convenience
export type { NostrEvent };

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
  // Threading fields
  parentId?: string;        // null/undefined = top-level, otherwise references parent comment
  replies?: Comment[];      // Populated client-side for tree rendering
  depth?: number;           // Calculated depth for indentation
  isCollapsed?: boolean;    // UI state for collapsing threads
}

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
}

// ============================================
// USER STATE
// ============================================

export interface UserState {
  username: string;
  bits: number;
  maxBits: number;
  votedPosts: Record<string, 'up' | 'down'>;
  // Nostr identity
  identity?: NostrIdentity;
  hasIdentity: boolean; // Whether user has a Nostr identity (separate from relay connection)
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
  IDENTITY = 'IDENTITY',
  LOCATION = 'LOCATION',
  USER_PROFILE = 'USER_PROFILE',
  BOOKMARKS = 'BOOKMARKS',
  EDIT_POST = 'EDIT_POST'
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
  BITBORING = 'bitboring'
}

// ============================================
// NOSTR EVENT KINDS (Custom for BitBoard)
// ============================================

export const NOSTR_KINDS = {
  POST: 1,                    // Standard text note (we add tags)
  REACTION: 7,                // Upvote/downvote
  BOARD_DEFINITION: 30001,    // Parameterized replaceable for boards
  LONG_FORM: 30023,           // Long-form content
} as const;
