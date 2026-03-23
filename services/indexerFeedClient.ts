import type { Event as NostrEvent } from 'nostr-tools';
import { IndexerConfig } from '../config';
import { logger } from './loggingService';

function mergeUniqueEvents(primary: NostrEvent[], secondary: NostrEvent[]): NostrEvent[] {
  const seen = new Set(primary.map((e) => e.id));
  const out = [...primary];
  for (const ev of secondary) {
    if (!seen.has(ev.id)) {
      seen.add(ev.id);
      out.push(ev);
    }
  }
  return out;
}

/**
 * Optional BitBoard indexer: merges relay results with cached/indexed events from HTTP API.
 */
export async function mergePostsWithIndexer(
  relayEvents: NostrEvent[],
  args: {
    boardId?: string;
    boardAddress?: string;
    geohash?: string;
    limit: number;
    /** Nostr filter `until` (unix seconds) for pagination */
    until?: number;
  },
): Promise<NostrEvent[]> {
  const base = IndexerConfig.BASE_URL.replace(/\/$/, '');
  if (!base) return relayEvents;

  try {
    const u = new URL(`${base}/v1/posts`);
    u.searchParams.set('limit', String(args.limit));
    if (args.boardId) u.searchParams.set('boardId', args.boardId);
    if (args.boardAddress) u.searchParams.set('boardAddress', args.boardAddress);
    if (args.geohash) u.searchParams.set('geohash', args.geohash);
    if (args.until !== undefined) u.searchParams.set('until', String(args.until));

    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(8000)
        : undefined;
    const res = await fetch(u.toString(), signal ? { signal } : {});

    if (!res.ok) {
      logger.warn('IndexerFeed', `Indexer HTTP ${res.status}`, u.toString());
      return relayEvents;
    }

    const body = (await res.json()) as { events?: NostrEvent[] };
    const extra = Array.isArray(body.events) ? body.events : [];
    return mergeUniqueEvents(relayEvents, extra);
  } catch (e) {
    logger.warn('IndexerFeed', 'Indexer fetch failed', e);
    return relayEvents;
  }
}
