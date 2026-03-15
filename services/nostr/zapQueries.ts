import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { NOSTR_KINDS } from '../../types';
import { nostrEventDeduplicator } from '../messageDeduplicator';
import { logger } from '../loggingService';
import type { QueryDeps, SubscriptionDeps } from './shared';

export async function fetchZapReceipts(deps: QueryDeps, eventId: string): Promise<NostrEvent[]> {
  const filter: Filter = {
    kinds: [NOSTR_KINDS.ZAP_RECEIPT],
    '#e': [eventId],
    limit: 500,
  };

  try {
    return await deps.pool.querySync(deps.getReadRelays(), filter);
  } catch (error) {
    logger.error('Nostr', 'Failed to fetch zap receipts', error);
    return [];
  }
}

export async function fetchZapReceiptsForEvents(
  deps: QueryDeps,
  eventIds: string[],
): Promise<NostrEvent[]> {
  if (eventIds.length === 0) {
    return [];
  }

  const filter: Filter = {
    kinds: [NOSTR_KINDS.ZAP_RECEIPT],
    '#e': eventIds,
  };

  try {
    return await deps.pool.querySync(deps.getReadRelays(), filter);
  } catch (error) {
    logger.error('Nostr', 'Failed to fetch batch zap receipts', error);
    return [];
  }
}

export async function fetchZapsForPubkey(
  deps: QueryDeps,
  pubkey: string,
  opts: { limit?: number } = {},
): Promise<NostrEvent[]> {
  const filter: Filter = {
    kinds: [NOSTR_KINDS.ZAP_RECEIPT],
    '#p': [pubkey],
    limit: opts.limit || 100,
  };

  try {
    const events = await deps.pool.querySync(deps.getReadRelays(), filter);
    return events.sort((a, b) => b.created_at - a.created_at);
  } catch (error) {
    logger.error('Nostr', 'Failed to fetch zaps for pubkey', error);
    return [];
  }
}

export function subscribeToZapReceipts(
  deps: SubscriptionDeps,
  eventIds: string[],
  onEvent: (event: NostrEvent) => void,
): string {
  const subscriptionId = deps.nextSubId('zaps');

  if (eventIds.length === 0) {
    return subscriptionId;
  }

  const filter: Filter = {
    kinds: [NOSTR_KINDS.ZAP_RECEIPT],
    '#e': eventIds,
    since: Math.floor(Date.now() / 1000),
  };

  const sub = deps.pool.subscribeMany(deps.getReadRelays(), [filter] as any, {
    onevent: (event) => {
      if (nostrEventDeduplicator.isEventDuplicate(event.id)) return;
      onEvent(event);
    },
    oneose: () => {
      logger.debug('Nostr', `End of stored zap events for subscription: ${subscriptionId}`);
    },
  });

  deps.subscriptions.set(subscriptionId, { unsub: () => sub.close() });
  return subscriptionId;
}
