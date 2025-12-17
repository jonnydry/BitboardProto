import type { Event as NostrEvent } from 'nostr-tools';
import { NOSTR_KINDS, type Post, type Board, type UnsignedNostrEvent, ReportType } from '../../types';
import {
  BITBOARD_TYPE_COMMENT,
  BITBOARD_TYPE_COMMENT_DELETE,
  BITBOARD_TYPE_COMMENT_EDIT,
  BITBOARD_TYPE_POST,
  BITBOARD_TYPE_POST_EDIT,
  BITBOARD_TYPE_TAG,
} from './bitboardEventTypes';

export function buildPostEvent(
  post: Omit<Post, 'id' | 'score' | 'commentCount' | 'comments' | 'nostrEventId' | 'upvotes' | 'downvotes'>,
  pubkey: string,
  geohash?: string,
  opts?: {
    /** NIP-33 board address (30001:<pubkey>:<d>) */
    boardAddress?: string;
    /** Used as a discoverability hashtag */
    boardName?: string;
    /** Encrypted title (base64) */
    encryptedTitle?: string;
    /** Encrypted content (base64) */
    encryptedContent?: string;
  }
): UnsignedNostrEvent {
  const isEncrypted = !!(opts?.encryptedTitle || opts?.encryptedContent);
  
  const tags: string[][] = [
    ['client', 'bitboard'],
    [BITBOARD_TYPE_TAG, BITBOARD_TYPE_POST],
    ['board', post.boardId],
  ];

  // Handle encryption
  if (isEncrypted) {
    tags.push(['encrypted', 'true']);
    // Store encrypted title in tag if provided
    if (opts?.encryptedTitle) {
      tags.push(['encrypted_title', opts.encryptedTitle]);
      // Use placeholder title for discoverability
      tags.push(['title', '[Encrypted]']);
    } else {
      // Title not encrypted, use original
      tags.push(['title', post.title]);
    }
    // Encrypted content goes in event.content (if provided)
  } else {
    // Normal unencrypted post
    tags.push(['title', post.title]);
  }

  // Add topic tags
  post.tags.forEach((tag) => tags.push(['t', tag]));

  // NIP-33: addressable reference to board (preferred), keep legacy 'board' tag too
  if (opts?.boardAddress) {
    tags.push(['a', opts.boardAddress]);
  }

  // Discoverability hashtag for board name
  if (opts?.boardName) {
    const boardTag = opts.boardName.toLowerCase();
    if (boardTag && !post.tags.some((t) => t.toLowerCase() === boardTag)) {
      tags.push(['t', boardTag]);
    }
  }

  // Add URL if present
  if (post.url) {
    tags.push(['r', post.url]);
  }

  // Add image if present
  if (post.imageUrl) {
    tags.push(['image', post.imageUrl]);
  }

  // Add geohash for location-based posts (BitChat compatible)
  if (geohash) {
    tags.push(['g', geohash]);
  }

  const event: Partial<NostrEvent> = {
    pubkey,
    kind: NOSTR_KINDS.POST,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: isEncrypted && opts?.encryptedContent ? opts.encryptedContent : post.content,
  };

  return event as UnsignedNostrEvent;
}

export function buildPostEditEvent(args: {
  /** The original post's event id (canonical post id for voting) */
  rootPostEventId: string;
  /** The post's board id (kept for filtering / UX) */
  boardId: string;
  /** New title */
  title: string;
  /** New content */
  content: string;
  /** New tag list */
  tags: string[];
  /** Optional URL */
  url?: string;
  /** Optional image URL */
  imageUrl?: string;
  /** Editor pubkey (must match signing key) */
  pubkey: string;
  /** Encrypted title (base64) */
  encryptedTitle?: string;
  /** Encrypted content (base64) */
  encryptedContent?: string;
}): UnsignedNostrEvent {
  const isEncrypted = !!(args.encryptedTitle || args.encryptedContent);
  
  const tags: string[][] = [
    ['client', 'bitboard'],
    [BITBOARD_TYPE_TAG, BITBOARD_TYPE_POST_EDIT],
    // Reference the original post. Marker is non-standard but harmless.
    ['e', args.rootPostEventId, '', 'edit'],
    ['board', args.boardId],
  ];

  // Handle encryption
  if (isEncrypted) {
    tags.push(['encrypted', 'true']);
    if (args.encryptedTitle) {
      tags.push(['encrypted_title', args.encryptedTitle]);
      tags.push(['title', '[Encrypted]']);
    } else {
      tags.push(['title', args.title]);
    }
  } else {
    tags.push(['title', args.title]);
  }

  for (const t of args.tags) {
    tags.push(['t', t]);
  }

  if (args.url) tags.push(['r', args.url]);
  if (args.imageUrl) tags.push(['image', args.imageUrl]);

  const event: Partial<NostrEvent> = {
    pubkey: args.pubkey,
    kind: NOSTR_KINDS.POST,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: isEncrypted && args.encryptedContent ? args.encryptedContent : args.content,
  };

  return event as UnsignedNostrEvent;
}

export function buildCommentEvent(
  postEventId: string,
  content: string,
  pubkey: string,
  parentCommentId?: string,
  opts?: {
    /** Post author's pubkey (for NIP-10 p tags) */
    postAuthorPubkey?: string;
    /** Parent comment author's pubkey (for NIP-10 p tags) */
    parentCommentAuthorPubkey?: string;
    /** Encrypted content (base64) */
    encryptedContent?: string;
  }
): UnsignedNostrEvent {
  const isEncrypted = !!opts?.encryptedContent;
  
  const tags: string[][] = [
    ['e', postEventId, '', 'root'], // Reference to the original post
    ['client', 'bitboard'],
    [BITBOARD_TYPE_TAG, BITBOARD_TYPE_COMMENT],
  ];

  // Handle encryption
  if (isEncrypted) {
    tags.push(['encrypted', 'true']);
  }

  // NIP-10: include pubkeys referenced by the thread
  if (opts?.postAuthorPubkey) {
    tags.push(['p', opts.postAuthorPubkey]);
  }

  // If this is a reply to another comment, add parent reference
  if (parentCommentId) {
    tags.push(['e', parentCommentId, '', 'reply']);
    if (opts?.parentCommentAuthorPubkey) {
      tags.push(['p', opts.parentCommentAuthorPubkey]);
    }
  }

  const event: Partial<NostrEvent> = {
    pubkey,
    kind: NOSTR_KINDS.POST,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: isEncrypted && opts?.encryptedContent ? opts.encryptedContent : content,
  };

  return event as UnsignedNostrEvent;
}

export function buildCommentEditEvent(args: {
  rootPostEventId: string;
  targetCommentEventId: string;
  content: string;
  pubkey: string;
  /** Encrypted content (base64) */
  encryptedContent?: string;
}): UnsignedNostrEvent {
  const isEncrypted = !!args.encryptedContent;
  
  const tags: string[][] = [
    ['client', 'bitboard'],
    [BITBOARD_TYPE_TAG, BITBOARD_TYPE_COMMENT_EDIT],
    ['e', args.rootPostEventId, '', 'root'],
    ['e', args.targetCommentEventId, '', 'edit'],
  ];

  // Handle encryption
  if (isEncrypted) {
    tags.push(['encrypted', 'true']);
  }

  const event: Partial<NostrEvent> = {
    pubkey: args.pubkey,
    kind: NOSTR_KINDS.POST,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: isEncrypted && args.encryptedContent ? args.encryptedContent : args.content,
  };

  return event as UnsignedNostrEvent;
}

export function buildCommentDeleteEvent(args: {
  rootPostEventId: string;
  targetCommentEventId: string;
  pubkey: string;
}): UnsignedNostrEvent {
  const tags: string[][] = [
    ['client', 'bitboard'],
    [BITBOARD_TYPE_TAG, BITBOARD_TYPE_COMMENT_DELETE],
    ['e', args.rootPostEventId, '', 'root'],
    ['e', args.targetCommentEventId, '', 'delete'],
  ];

  const event: Partial<NostrEvent> = {
    pubkey: args.pubkey,
    kind: NOSTR_KINDS.DELETE,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: '',
  };

  return event as UnsignedNostrEvent;
}

export function buildVoteEvent(
  postEventId: string,
  direction: 'up' | 'down',
  pubkey: string,
  opts?: {
    /** Post author's pubkey (NIP-25 p tag) */
    postAuthorPubkey?: string;
  }
): UnsignedNostrEvent {
  const tags: string[][] = [['e', postEventId]];

  // NIP-25: include 'p' tag for the author of the reacted-to event
  if (opts?.postAuthorPubkey) {
    tags.push(['p', opts.postAuthorPubkey]);
  }

  const event: Partial<NostrEvent> = {
    pubkey,
    kind: NOSTR_KINDS.REACTION,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: direction === 'up' ? '+' : '-',
  };

  return event as UnsignedNostrEvent;
}

export function buildBoardEvent(
  board: Omit<Board, 'memberCount' | 'nostrEventId'>,
  pubkey: string
): UnsignedNostrEvent {
  const tags: string[][] = [
    ['d', board.id],
    ['name', board.name],
    ['type', board.type],
    ['public', board.isPublic ? 'true' : 'false'],
    ['client', 'bitboard'],
  ];

  // Add encryption flag if board is encrypted
  if (board.isEncrypted) {
    tags.push(['encrypted', 'true']);
  }

  if (board.geohash) {
    tags.push(['g', board.geohash]);
  }

  const event: Partial<NostrEvent> = {
    pubkey,
    kind: NOSTR_KINDS.BOARD_DEFINITION,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: board.description,
  };

  return event as UnsignedNostrEvent;
}

/**
 * Build a NIP-56 report event (kind 1984)
 */
export function buildReportEvent(args: {
  /** The event ID being reported */
  targetEventId: string;
  /** The pubkey of the event author being reported */
  targetPubkey: string;
  /** The type of report */
  reportType: ReportType;
  /** Reporter's pubkey */
  pubkey: string;
  /** Optional additional details */
  details?: string;
}): UnsignedNostrEvent {
  const tags: string[][] = [
    // NIP-56: e tag with report type as 3rd element
    ['e', args.targetEventId, '', args.reportType],
    // NIP-56: p tag for the reported user
    ['p', args.targetPubkey],
    // BitBoard client identifier
    ['client', 'bitboard'],
  ];

  const event: Partial<NostrEvent> = {
    pubkey: args.pubkey,
    kind: NOSTR_KINDS.REPORT,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: args.details || '',
  };

  return event as UnsignedNostrEvent;
}





