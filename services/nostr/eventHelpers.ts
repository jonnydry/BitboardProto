import type { Event as NostrEvent } from 'nostr-tools';
import { NOSTR_KINDS } from '../../types';
import {
  BITBOARD_TYPE_COMMENT,
  BITBOARD_TYPE_COMMENT_DELETE,
  BITBOARD_TYPE_COMMENT_EDIT,
  BITBOARD_TYPE_POST,
  BITBOARD_TYPE_POST_EDIT,
  BITBOARD_TYPE_TAG,
} from './bitboardEventTypes';

export function getTagValue(event: NostrEvent, name: string): string | undefined {
  const tag = event.tags.find((entry) => entry[0] === name);
  return tag ? tag[1] : undefined;
}

export function hasTag(event: NostrEvent, name: string): boolean {
  return event.tags.some((entry) => entry[0] === name);
}

export function getARef(event: NostrEvent): string | undefined {
  return getTagValue(event, 'a');
}

export function getBitboardType(event: NostrEvent): string | undefined {
  return getTagValue(event, BITBOARD_TYPE_TAG);
}

export function isBitboardPostEvent(event: NostrEvent): boolean {
  const explicit = getBitboardType(event);
  if (explicit === BITBOARD_TYPE_POST) return true;
  if (explicit === BITBOARD_TYPE_COMMENT) return false;
  if (explicit === BITBOARD_TYPE_POST_EDIT) return false;
  if (explicit === BITBOARD_TYPE_COMMENT_EDIT) return false;
  if (explicit === BITBOARD_TYPE_COMMENT_DELETE) return false;

  const titlePresent = hasTag(event, 'title');
  const boardPresent = hasTag(event, 'board');
  const aRef = getARef(event);
  const boardAddressPresent = !!aRef && aRef.startsWith(`${NOSTR_KINDS.BOARD_DEFINITION}:`);
  const hasThreadRefs = event.tags.some((entry) => entry[0] === 'e');

  return titlePresent && (boardPresent || boardAddressPresent) && !hasThreadRefs;
}

export function isBitboardCommentEvent(event: NostrEvent, rootPostEventId?: string): boolean {
  const explicit = getBitboardType(event);
  if (explicit === BITBOARD_TYPE_COMMENT) return true;
  if (explicit === BITBOARD_TYPE_POST) return false;
  if (explicit === BITBOARD_TYPE_POST_EDIT) return false;
  if (explicit === BITBOARD_TYPE_COMMENT_EDIT) return false;
  if (explicit === BITBOARD_TYPE_COMMENT_DELETE) return false;

  const eTags = event.tags.filter((entry) => entry[0] === 'e' && !!entry[1]);
  if (eTags.length === 0) return false;

  if (rootPostEventId) {
    return eTags.some((entry) => entry[1] === rootPostEventId);
  }

  return eTags.some((entry) => entry[3] === 'root' || entry[3] === 'reply');
}

export function isBitboardPostEditEvent(event: NostrEvent): boolean {
  return getBitboardType(event) === BITBOARD_TYPE_POST_EDIT;
}

export function isBitboardCommentEditEvent(event: NostrEvent): boolean {
  return getBitboardType(event) === BITBOARD_TYPE_COMMENT_EDIT;
}

export function isBitboardCommentDeleteEvent(event: NostrEvent): boolean {
  return (
    event.kind === NOSTR_KINDS.DELETE && getBitboardType(event) === BITBOARD_TYPE_COMMENT_DELETE
  );
}

export function getRootPostIdFromEditEvent(event: NostrEvent): string | null {
  const eTag = event.tags.find((entry) => entry[0] === 'e' && !!entry[1]);
  return eTag?.[1] || null;
}

export function getTargetCommentIdFromEditEvent(event: NostrEvent): string | null {
  const editTag = event.tags.find((entry) => entry[0] === 'e' && entry[3] === 'edit' && !!entry[1]);
  if (editTag?.[1]) return editTag[1];
  const eTags = event.tags.filter((entry) => entry[0] === 'e' && !!entry[1]);
  return eTags.length >= 2 ? eTags[1][1] : null;
}

export function getRootPostIdFromCommentScopedEvent(event: NostrEvent): string | null {
  const rootTag = event.tags.find((entry) => entry[0] === 'e' && entry[3] === 'root' && !!entry[1]);
  return rootTag?.[1] || null;
}

export function getTargetCommentIdFromDeleteEvent(event: NostrEvent): string | null {
  const deleteTag = event.tags.find(
    (entry) => entry[0] === 'e' && entry[3] === 'delete' && !!entry[1],
  );
  if (deleteTag?.[1]) return deleteTag[1];
  const eTags = event.tags.filter((entry) => entry[0] === 'e' && !!entry[1]);
  return eTags.length >= 2 ? eTags[1][1] : null;
}
