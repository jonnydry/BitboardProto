import type { Board } from '../../types';
import { BoardType, NOSTR_KINDS } from '../../types';

export type NostrFeedScope =
  | { mode: 'global' }
  | { mode: 'community' }
  | {
      mode: 'scoped';
      fetch: { boardId?: string; geohash?: string; boardAddress?: string };
      subscribe: { boardId?: string; geohash?: string; boardAddress?: string };
    };

/**
 * Maps the active BitBoard to Nostr fetch/subscribe filters.
 * Default topic boards (e.g. //TECH → id b-tech) use #board; NIP-33 boards use #a; geohash uses #g.
 * External Nostr communities load posts via a separate pipeline — skip the standard post query.
 */
export function resolveNostrFeedScope(activeBoard: Board | null): NostrFeedScope {
  if (!activeBoard) {
    return { mode: 'global' };
  }
  if (activeBoard.source === 'nostr-community') {
    return { mode: 'community' };
  }
  if (activeBoard.type === BoardType.GEOHASH && activeBoard.geohash) {
    const g = { geohash: activeBoard.geohash };
    return { mode: 'scoped', fetch: g, subscribe: g };
  }
  if (activeBoard.createdBy) {
    const boardAddress = `${NOSTR_KINDS.BOARD_DEFINITION}:${activeBoard.createdBy}:${activeBoard.id}`;
    const a = { boardAddress };
    return { mode: 'scoped', fetch: a, subscribe: a };
  }
  const b = { boardId: activeBoard.id };
  return { mode: 'scoped', fetch: b, subscribe: b };
}

export function buildFetchPostsArgs(
  scope: NostrFeedScope,
  paging: { limit: number; since?: number; until?: number },
): {
  limit: number;
  since?: number;
  until?: number;
  boardId?: string;
  geohash?: string;
  boardAddress?: string;
} {
  const base = { limit: paging.limit, since: paging.since, until: paging.until };
  if (scope.mode === 'global' || scope.mode === 'community') {
    return base;
  }
  return { ...base, ...scope.fetch };
}
