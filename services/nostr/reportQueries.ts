import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { NOSTR_KINDS } from '../../types';
import { logger } from '../loggingService';
import type { QueryDeps } from './shared';

export async function fetchReportsForEvent(
  deps: QueryDeps,
  eventId: string,
): Promise<NostrEvent[]> {
  const filter: Filter = {
    kinds: [NOSTR_KINDS.REPORT],
    '#e': [eventId],
  };

  try {
    const events = await deps.pool.querySync(deps.getReadRelays(), filter);
    return events.filter((event) =>
      event.tags.some((tag) => tag[0] === 'client' && tag[1] === 'bitboard'),
    );
  } catch (error) {
    logger.error('Nostr', 'Failed to fetch reports:', error);
    return [];
  }
}

export async function fetchReportsByUser(deps: QueryDeps, pubkey: string): Promise<NostrEvent[]> {
  const filter: Filter = {
    kinds: [NOSTR_KINDS.REPORT],
    authors: [pubkey],
  };

  try {
    return await deps.pool.querySync(deps.getReadRelays(), filter);
  } catch (error) {
    logger.error('Nostr', 'Failed to fetch user reports:', error);
    return [];
  }
}
