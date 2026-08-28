import { Board, BoardType, GeohashPrecision } from './types';
import { GeohashConfig, NostrConfig, UIConfig, UserConfig } from './config';

// ============================================
// USER ECONOMY
// ============================================

export const MAX_DAILY_BITS = UserConfig.MAX_DAILY_BITS;

// ============================================
// NOSTR RELAY CONFIGURATION
// ============================================

export const DEFAULT_RELAYS = [...NostrConfig.DEFAULT_RELAYS];

// ============================================
// GEOHASH DEFAULTS
// ============================================

export const DEFAULT_GEOHASH_PRECISION = GeohashConfig.DEFAULT_PRECISION as GeohashPrecision;

// ============================================
// UI CONSTANTS
// ============================================

/** Maximum comments before requiring full page view */
export const EXPANSION_THRESHOLD = UIConfig.COMMENT_EXPANSION_THRESHOLD;

/** Number of comments to show in inline preview */
export const INLINE_PREVIEW_COMMENT_COUNT = UIConfig.INLINE_PREVIEW_COMMENT_COUNT;

// ============================================
// INITIAL DATA (Fallback when offline)
// ============================================

export const INITIAL_BOARDS: Board[] = [
  {
    id: 'b-meta',
    name: 'META',
    description: 'BitBoard feedback, bugs, and feature requests.',
    isPublic: true,
    memberCount: 0,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-random',
    name: 'RANDOM',
    description: 'Off-topic noise and general chaos.',
    isPublic: true,
    memberCount: 0,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-tech',
    name: 'TECH',
    description: 'Hardware, software, and cybernetics.',
    isPublic: true,
    memberCount: 0,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-nostr',
    name: 'NOSTR',
    description: 'Protocol discussion and ecosystem development.',
    isPublic: true,
    memberCount: 0,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-dev',
    name: 'DEV',
    description: 'Programming, coding, and software engineering.',
    isPublic: true,
    memberCount: 0,
    type: BoardType.TOPIC,
  },
];

/** Former catalog boards. Do not resurrect them from local cache. */
export const RETIRED_DEFAULT_BOARD_IDS: readonly string[] = [
  'b-system',
  'b-crypto',
  'b-security',
  'b-opensource',
  'b-ai',
  'b-selfhost',
  'b-gaming',
  'b-music',
  'b-movies',
  'b-books',
  'b-anime',
  'b-art',
  'b-science',
  'b-diy',
  'b-learn',
  'b-news',
  'b-finance',
  'b-health',
  'b-food',
];
