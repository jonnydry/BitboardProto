import { Post, Board, BoardType, GeohashPrecision } from './types';
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
  // ============================================
  // CORE / META
  // ============================================
  {
    id: 'b-system',
    name: 'SYSTEM',
    description: 'Official announcements and platform rules.',
    isPublic: true,
    memberCount: 1204,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-meta',
    name: 'META',
    description: 'BitBoard feedback, bugs, and feature requests.',
    isPublic: true,
    memberCount: 312,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-random',
    name: 'RANDOM',
    description: 'Off-topic noise and general chaos.',
    isPublic: true,
    memberCount: 420,
    type: BoardType.TOPIC,
  },

  // ============================================
  // TECH / DECENTRALIZATION
  // ============================================
  {
    id: 'b-tech',
    name: 'TECH',
    description: 'Hardware, software, and cybernetics.',
    isPublic: true,
    memberCount: 843,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-dev',
    name: 'DEV',
    description: 'Programming, coding, and software engineering.',
    isPublic: true,
    memberCount: 756,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-nostr',
    name: 'NOSTR',
    description: 'Protocol discussion and ecosystem development.',
    isPublic: true,
    memberCount: 534,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-crypto',
    name: 'CRYPTO',
    description: 'Cryptocurrency, DeFi, and blockchain tech.',
    isPublic: true,
    memberCount: 621,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-security',
    name: 'SECURITY',
    description: 'InfoSec, privacy, and operational security.',
    isPublic: true,
    memberCount: 445,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-opensource',
    name: 'OPENSOURCE',
    description: 'Free software and open source projects.',
    isPublic: true,
    memberCount: 389,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-ai',
    name: 'AI',
    description: 'Artificial intelligence, ML, and automation.',
    isPublic: true,
    memberCount: 892,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-selfhost',
    name: 'SELFHOST',
    description: 'Self-hosting, homelab, and infrastructure.',
    isPublic: true,
    memberCount: 267,
    type: BoardType.TOPIC,
  },

  // ============================================
  // ENTERTAINMENT / MEDIA
  // ============================================
  {
    id: 'b-gaming',
    name: 'GAMING',
    description: 'Video games, tabletop, and game development.',
    isPublic: true,
    memberCount: 978,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-music',
    name: 'MUSIC',
    description: 'Artists, genres, production, and discovery.',
    isPublic: true,
    memberCount: 654,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-movies',
    name: 'MOVIES',
    description: 'Film discussion, reviews, and recommendations.',
    isPublic: true,
    memberCount: 512,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-books',
    name: 'BOOKS',
    description: 'Literature, reading, and written works.',
    isPublic: true,
    memberCount: 298,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-anime',
    name: 'ANIME',
    description: 'Anime, manga, and Japanese media.',
    isPublic: true,
    memberCount: 445,
    type: BoardType.TOPIC,
  },

  // ============================================
  // CREATIVE / LEARNING
  // ============================================
  {
    id: 'b-art',
    name: 'ART',
    description: 'Digital art, design, and creative works.',
    isPublic: true,
    memberCount: 387,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-science',
    name: 'SCIENCE',
    description: 'Research, discoveries, and academic discussion.',
    isPublic: true,
    memberCount: 423,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-diy',
    name: 'DIY',
    description: 'Maker projects, crafts, and builds.',
    isPublic: true,
    memberCount: 334,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-learn',
    name: 'LEARN',
    description: 'Education, tutorials, and skill development.',
    isPublic: true,
    memberCount: 276,
    type: BoardType.TOPIC,
  },

  // ============================================
  // LIFESTYLE / GENERAL
  // ============================================
  {
    id: 'b-news',
    name: 'NEWS',
    description: 'Current events and world news.',
    isPublic: true,
    memberCount: 734,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-finance',
    name: 'FINANCE',
    description: 'Markets, investing, and personal finance.',
    isPublic: true,
    memberCount: 456,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-health',
    name: 'HEALTH',
    description: 'Fitness, wellness, and mental health.',
    isPublic: true,
    memberCount: 345,
    type: BoardType.TOPIC,
  },
  {
    id: 'b-food',
    name: 'FOOD',
    description: 'Cooking, recipes, and culinary discussion.',
    isPublic: true,
    memberCount: 289,
    type: BoardType.TOPIC,
  },
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