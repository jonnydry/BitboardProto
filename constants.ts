import { Post, Board, BoardType, GeohashPrecision } from './types';

// ============================================
// USER ECONOMY
// ============================================

export const MAX_DAILY_BITS = 100;

// ============================================
// NOSTR RELAY CONFIGURATION
// ============================================

export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://nostr.wine',
  'wss://relay.nostr.info',
];

// ============================================
// GEOHASH DEFAULTS
// ============================================

export const DEFAULT_GEOHASH_PRECISION = GeohashPrecision.NEIGHBORHOOD;

// ============================================
// UI CONSTANTS
// ============================================

/** Maximum comments before requiring full page view */
export const EXPANSION_THRESHOLD = 5;

// ============================================
// INITIAL DATA (Fallback when offline)
// ============================================

export const INITIAL_BOARDS: Board[] = [
  {
    id: 'b-system',
    name: 'SYSTEM',
    description: 'Official announcements and rules.',
    isPublic: true,
    memberCount: 1204,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-tech',
    name: 'TECH',
    description: 'Hardware, software, and cybernetics.',
    isPublic: true,
    memberCount: 843,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-random',
    name: 'RANDOM',
    description: 'Off-topic discussions and noise.',
    isPublic: true,
    memberCount: 420,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-private',
    name: 'DARKNET',
    description: 'Encrypted comms.',
    isPublic: false,
    memberCount: 5,
    type: BoardType.TOPIC,
  }
];

export const INITIAL_POSTS: Post[] = [
  {
    id: 'welcome-post',
    boardId: 'b-system',
    title: 'Welcome to BitBoard v3.0 - Nostr Edition',
    author: 'system/admin',
    content: 'BitBoard is now powered by the Nostr protocol for true decentralization. Your posts are stored across 290+ global relays. Create topic-based boards or location-based channels using geohash technology from BitChat. No accounts required - your identity lives in your keys.',
    timestamp: Date.now(),
    score: 999,
    commentCount: 0,
    tags: ['announcement', 'system', 'nostr', 'decentralized'],
    comments: [],
    upvotes: 999,
    downvotes: 0,
  }
];