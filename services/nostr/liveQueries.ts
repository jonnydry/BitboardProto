import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { NOSTR_KINDS } from '../../types';
import { nostrEventDeduplicator } from '../messageDeduplicator';
import { logger } from '../loggingService';
import type { QueryDeps, SubscriptionDeps } from './shared';

export async function fetchLiveEvent(
  deps: QueryDeps,
  hostPubkey: string,
  eventId: string,
): Promise<NostrEvent | null> {
  const filter: Filter = {
    kinds: [NOSTR_KINDS.LIVE_EVENT],
    authors: [hostPubkey],
    '#d': [eventId],
    limit: 1,
  };

  try {
    const events = await deps.pool.querySync(deps.getReadRelays(), filter);
    if (events.length === 0) return null;
    return events.sort((a, b) => b.created_at - a.created_at)[0];
  } catch (error) {
    logger.error('Nostr', 'Failed to fetch live event', error);
    return null;
  }
}

export async function fetchLiveEvents(
  deps: QueryDeps,
  opts: { status?: 'planned' | 'live' | 'ended'; limit?: number } = {},
): Promise<NostrEvent[]> {
  const filter: Filter = {
    kinds: [NOSTR_KINDS.LIVE_EVENT],
    '#client': ['bitboard'],
    limit: opts.limit || 50,
  };

  if (opts.status) {
    filter['#status'] = [opts.status];
  }

  try {
    const events = await deps.pool.querySync(deps.getReadRelays(), filter);
    const byDTag = new Map<string, NostrEvent>();
    for (const event of events) {
      const dTag = event.tags.find((tag) => tag[0] === 'd')?.[1] || event.id;
      const key = `${event.pubkey}:${dTag}`;
      const existing = byDTag.get(key);
      if (!existing || event.created_at > existing.created_at) {
        byDTag.set(key, event);
      }
    }

    return Array.from(byDTag.values()).sort((a, b) => b.created_at - a.created_at);
  } catch (error) {
    logger.error('Nostr', 'Failed to fetch live events', error);
    return [];
  }
}

export async function fetchLiveChatMessages(
  deps: QueryDeps,
  liveEventAddress: string,
  opts: { limit?: number; since?: number } = {},
): Promise<NostrEvent[]> {
  const filter: Filter = {
    kinds: [NOSTR_KINDS.LIVE_CHAT],
    '#a': [liveEventAddress],
    limit: opts.limit || 100,
  };

  if (opts.since) {
    filter.since = opts.since;
  }

  try {
    const events = await deps.pool.querySync(deps.getReadRelays(), filter);
    return events.sort((a, b) => a.created_at - b.created_at);
  } catch (error) {
    logger.error('Nostr', 'Failed to fetch live chat messages', error);
    return [];
  }
}

export function subscribeToLiveChat(
  deps: SubscriptionDeps,
  liveEventAddress: string,
  onEvent: (event: NostrEvent) => void,
): string {
  const subscriptionId = deps.nextSubId('live-chat');

  const filter: Filter = {
    kinds: [NOSTR_KINDS.LIVE_CHAT],
    '#a': [liveEventAddress],
    since: Math.floor(Date.now() / 1000),
  };

  const sub = deps.pool.subscribeMany(deps.getReadRelays(), [filter] as any, {
    onevent: (event) => {
      if (nostrEventDeduplicator.isEventDuplicate(event.id)) return;
      onEvent(event);
    },
    oneose: () => {
      logger.debug('Nostr', `End of stored live chat for: ${subscriptionId}`);
    },
  });

  deps.subscriptions.set(subscriptionId, { unsub: () => sub.close() });
  return subscriptionId;
}
