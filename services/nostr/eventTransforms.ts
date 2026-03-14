import type { Event as NostrEvent } from 'nostr-tools';
import { BoardType, type Board, type Comment, NOSTR_KINDS, type Post } from '../../types';
import { inputValidator } from '../inputValidator';
import {
  getARef,
  getRootPostIdFromCommentScopedEvent,
  getRootPostIdFromEditEvent,
  getTagValue,
  getTargetCommentIdFromDeleteEvent,
  getTargetCommentIdFromEditEvent,
  isBitboardCommentDeleteEvent,
  isBitboardCommentEditEvent,
  isBitboardPostEditEvent,
} from './eventHelpers';

export function eventToPost(event: NostrEvent, getDisplayName: (pubkey: string) => string): Post {
  const getAllTags = (name: string): string[] => {
    return event.tags.filter((entry) => entry[0] === name).map((entry) => entry[1]);
  };

  const aRef = getARef(event);
  const boardIdFromA =
    aRef && aRef.startsWith(`${NOSTR_KINDS.BOARD_DEFINITION}:`)
      ? aRef.split(':').slice(2).join(':') || undefined
      : undefined;

  const isEncrypted = getTagValue(event, 'encrypted') === 'true';
  const encryptedTitle = getTagValue(event, 'encrypted_title');
  const titleRaw = getTagValue(event, 'title') || 'Untitled';
  const contentRaw = event.content ?? '';
  const tagsRaw = getAllTags('t');
  const urlRaw = getTagValue(event, 'r');
  const imageRaw = getTagValue(event, 'image');

  const post: Post = {
    id: event.id,
    nostrEventId: event.id,
    boardId: getTagValue(event, 'board') || boardIdFromA || 'b-random',
    title: inputValidator.validateTitle(titleRaw) ?? 'Untitled',
    author: getDisplayName(event.pubkey),
    authorPubkey: event.pubkey,
    content: '',
    timestamp: event.created_at * 1000,
    score: 0,
    upvotes: 0,
    downvotes: 0,
    commentCount: 0,
    tags: inputValidator.validateTags(tagsRaw),
    url: urlRaw ? (inputValidator.validateUrl(urlRaw) ?? undefined) : undefined,
    imageUrl: imageRaw ? (inputValidator.validateUrl(imageRaw) ?? undefined) : undefined,
    comments: [],
  };

  if (isEncrypted) {
    post.isEncrypted = true;
    if (encryptedTitle) {
      post.encryptedTitle = encryptedTitle;
      post.title = '[Encrypted]';
    }
    post.encryptedContent = contentRaw;
    post.content = '[Encrypted - Access Required]';
  } else {
    post.content = inputValidator.validatePostContent(contentRaw) ?? '';
  }

  return post;
}

export function eventToBoard(event: NostrEvent): Board {
  const boardType = (getTagValue(event, 'type') as BoardType) || BoardType.TOPIC;
  const isPublic = getTagValue(event, 'public') !== 'false';
  const isEncrypted =
    getTagValue(event, 'encrypted') === 'true' ||
    (!isPublic && getTagValue(event, 'encrypted') !== 'false');

  return {
    id: getTagValue(event, 'd') || event.id,
    nostrEventId: event.id,
    name: getTagValue(event, 'name') || 'Unknown',
    description: event.content,
    isPublic,
    memberCount: 0,
    type: boardType,
    geohash: getTagValue(event, 'g'),
    createdBy: event.pubkey,
    isEncrypted,
  };
}

export function eventToComment(
  event: NostrEvent,
  getDisplayName: (pubkey: string) => string,
): Comment {
  const replyTag = event.tags.find((entry) => entry[0] === 'e' && entry[3] === 'reply');
  const parentId = replyTag?.[1];
  const isEncrypted = getTagValue(event, 'encrypted') === 'true';
  const contentRaw = event.content ?? '';

  const comment: Comment = {
    id: event.id,
    nostrEventId: event.id,
    author: getDisplayName(event.pubkey),
    authorPubkey: event.pubkey,
    content: '',
    timestamp: event.created_at * 1000,
    parentId,
  };

  if (isEncrypted) {
    comment.isEncrypted = true;
    comment.encryptedContent = contentRaw;
    comment.content = '[Encrypted - Access Required]';
  } else {
    comment.content = inputValidator.validateCommentContent(contentRaw) ?? '';
  }

  return comment;
}

export function eventToPostEditUpdate(
  event: NostrEvent,
): { rootPostEventId: string; updates: Partial<Post> } | null {
  if (!isBitboardPostEditEvent(event)) return null;
  const rootPostEventId = getRootPostIdFromEditEvent(event);
  if (!rootPostEventId) return null;

  const getAllTags = (name: string): string[] => {
    return event.tags.filter((entry) => entry[0] === name).map((entry) => entry[1]);
  };

  const isEncrypted = getTagValue(event, 'encrypted') === 'true';
  const encryptedTitle = getTagValue(event, 'encrypted_title');
  const titleRaw = getTagValue(event, 'title');
  const contentRaw = event.content ?? '';
  const tagsRaw = getAllTags('t');
  const urlRaw = getTagValue(event, 'r');
  const imageRaw = getTagValue(event, 'image');

  const updates: Partial<Post> = {
    tags: inputValidator.validateTags(tagsRaw),
    url: urlRaw ? (inputValidator.validateUrl(urlRaw) ?? undefined) : undefined,
    imageUrl: imageRaw ? (inputValidator.validateUrl(imageRaw) ?? undefined) : undefined,
  };

  if (isEncrypted) {
    updates.isEncrypted = true;
    if (encryptedTitle) {
      updates.encryptedTitle = encryptedTitle;
      updates.title = '[Encrypted]';
    } else if (titleRaw) {
      updates.title = inputValidator.validateTitle(titleRaw) ?? undefined;
    }
    updates.encryptedContent = contentRaw;
    updates.content = '[Encrypted - Access Required]';
  } else {
    if (titleRaw) {
      updates.title = inputValidator.validateTitle(titleRaw) ?? undefined;
    }
    updates.content = inputValidator.validatePostContent(contentRaw) ?? '';
  }

  return { rootPostEventId, updates };
}

export function eventToCommentEditUpdate(
  event: NostrEvent,
): { rootPostEventId: string; targetCommentId: string; updates: Partial<Comment> } | null {
  if (!isBitboardCommentEditEvent(event)) return null;
  const rootPostEventId = getRootPostIdFromCommentScopedEvent(event);
  const targetCommentId = getTargetCommentIdFromEditEvent(event);
  if (!rootPostEventId || !targetCommentId) return null;

  const isEncrypted = getTagValue(event, 'encrypted') === 'true';
  const contentRaw = event.content ?? '';

  const updates: Partial<Comment> = {
    editedAt: event.created_at * 1000,
  };

  if (isEncrypted) {
    updates.isEncrypted = true;
    updates.encryptedContent = contentRaw;
    updates.content = '[Encrypted - Access Required]';
  } else {
    updates.content = inputValidator.validateCommentContent(contentRaw) ?? '';
  }

  return { rootPostEventId, targetCommentId, updates };
}

export function eventToCommentDeleteUpdate(
  event: NostrEvent,
): { rootPostEventId: string; targetCommentId: string; updates: Partial<Comment> } | null {
  if (!isBitboardCommentDeleteEvent(event)) return null;
  const rootPostEventId = getRootPostIdFromCommentScopedEvent(event);
  const targetCommentId = getTargetCommentIdFromDeleteEvent(event);
  if (!rootPostEventId || !targetCommentId) return null;

  const updates: Partial<Comment> = {
    isDeleted: true,
    deletedAt: event.created_at * 1000,
    content: '[deleted]',
    author: '[deleted]',
    authorPubkey: undefined,
  };

  return { rootPostEventId, targetCommentId, updates };
}
