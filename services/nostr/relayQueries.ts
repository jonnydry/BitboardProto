import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { NOSTR_KINDS, type UnsignedNostrEvent } from '../../types';
import { logger } from '../loggingService';
import { latestEvent } from './shared';
import type { QueryDeps } from './shared';

export function buildRelayListEvent(
  pubkey: string,
  relays: Array<{ url: string; read?: boolean; write?: boolean }>,
): UnsignedNostrEvent {
  const tags: string[][] = [];

  for (const relay of relays) {
    const url = relay.url?.trim();
    if (!url) continue;

    if (relay.read && relay.write) {
      tags.push(['r', url]);
    } else if (relay.read) {
      tags.push(['r', url, 'read']);
    } else if (relay.write) {
      tags.push(['r', url, 'write']);
    } else if (relay.read === false && relay.write === false) {
      continue;
    } else {
      tags.push(['r', url]);
    }
  }

  return {
    pubkey,
    kind: NOSTR_KINDS.RELAY_LIST,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: '',
  } as UnsignedNostrEvent;
}

export async function fetchRelayListEvent(
  deps: QueryDeps,
  pubkey: string,
): Promise<NostrEvent | null> {
  const filter: Filter = {
    kinds: [NOSTR_KINDS.RELAY_LIST],
    authors: [pubkey],
    limit: 1,
  };

  try {
    const events = await deps.pool.querySync(deps.getReadRelays(), filter);
    return latestEvent(events);
  } catch (error) {
    logger.warn(
      'relayQueries',
      `Failed to fetch relay list event for ${pubkey.slice(0, 8)}...: ${error}`,
    );
    return null;
  }
}

export async function fetchContactListEvent(
  deps: QueryDeps,
  pubkey: string,
): Promise<NostrEvent | null> {
  const filter: Filter = {
    kinds: [NOSTR_KINDS.CONTACT_LIST],
    authors: [pubkey],
    limit: 1,
  };

  try {
    const events = await deps.pool.querySync(deps.getReadRelays(), filter);
    return latestEvent(events);
  } catch (error) {
    logger.warn(
      'relayQueries',
      `Failed to fetch contact list event for ${pubkey.slice(0, 8)}...: ${error}`,
    );
    return null;
  }
}

export function parseContactList(event: NostrEvent): string[] {
  return event.tags.filter((tag) => tag[0] === 'p' && tag[1]).map((tag) => tag[1]);
}
