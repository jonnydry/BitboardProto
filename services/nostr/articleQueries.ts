import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { NOSTR_KINDS } from '../../types';
import { logger } from '../loggingService';
import { dedupeLatestByDTag } from './shared';
import type { QueryDeps } from './shared';

export async function fetchArticle(
  deps: QueryDeps,
  authorPubkey: string,
  articleId: string,
): Promise<NostrEvent | null> {
  const filter: Filter = {
    kinds: [NOSTR_KINDS.LONG_FORM],
    authors: [authorPubkey],
    '#d': [articleId],
    limit: 1,
  };

  try {
    const events = await deps.pool.querySync(deps.getReadRelays(), filter);
    if (events.length === 0) return null;
    return events.sort((a, b) => b.created_at - a.created_at)[0];
  } catch (error) {
    logger.error('Nostr', 'Failed to fetch article', error);
    return null;
  }
}

export async function fetchArticlesByAuthor(
  deps: QueryDeps,
  authorPubkey: string,
  opts: { limit?: number } = {},
): Promise<NostrEvent[]> {
  const filter: Filter = {
    kinds: [NOSTR_KINDS.LONG_FORM],
    authors: [authorPubkey],
    limit: opts.limit || 50,
  };

  try {
    const events = await deps.pool.querySync(deps.getReadRelays(), filter);
    return dedupeLatestByDTag(events);
  } catch (error) {
    logger.error('Nostr', 'Failed to fetch articles by author', error);
    return [];
  }
}

export async function fetchArticlesForBoard(
  deps: QueryDeps,
  boardId: string,
  opts: { limit?: number } = {},
): Promise<NostrEvent[]> {
  const filter: Filter = {
    kinds: [NOSTR_KINDS.LONG_FORM],
    '#board': [boardId],
    '#client': ['bitboard'],
    limit: opts.limit || 50,
  };

  try {
    const events = await deps.pool.querySync(deps.getReadRelays(), filter);
    return events.sort((a, b) => b.created_at - a.created_at);
  } catch (error) {
    logger.error('Nostr', 'Failed to fetch articles for board', error);
    return [];
  }
}

export async function fetchRecentArticles(
  deps: QueryDeps,
  opts: { limit?: number; since?: number } = {},
): Promise<NostrEvent[]> {
  const filter: Filter = {
    kinds: [NOSTR_KINDS.LONG_FORM],
    '#client': ['bitboard'],
    limit: opts.limit || 50,
  };

  if (opts.since) {
    filter.since = opts.since;
  }

  try {
    const events = await deps.pool.querySync(deps.getReadRelays(), filter);
    return events.sort((a, b) => b.created_at - a.created_at);
  } catch (error) {
    logger.error('Nostr', 'Failed to fetch recent articles', error);
    return [];
  }
}

export async function fetchArticlesByHashtag(
  deps: QueryDeps,
  hashtag: string,
  opts: { limit?: number } = {},
): Promise<NostrEvent[]> {
  const normalizedTag = hashtag.toLowerCase().replace(/^#/, '');
  const filter: Filter = {
    kinds: [NOSTR_KINDS.LONG_FORM],
    '#t': [normalizedTag],
    limit: opts.limit || 50,
  };

  try {
    const events = await deps.pool.querySync(deps.getReadRelays(), filter);
    return events.sort((a, b) => b.created_at - a.created_at);
  } catch (error) {
    logger.error('Nostr', 'Failed to fetch articles by hashtag', error);
    return [];
  }
}
