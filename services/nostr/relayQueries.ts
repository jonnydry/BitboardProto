import type { Event as NostrEvent, Filter, SimplePool } from 'nostr-tools';
import { NOSTR_KINDS, type UnsignedNostrEvent } from '../../types';

interface QueryDeps {
  pool: SimplePool;
  getReadRelays: () => string[];
}

function getLatestEvent(events: NostrEvent[]): NostrEvent | null {
  if (!events.length) {
    return null;
  }

  return events.sort((a, b) => b.created_at - a.created_at)[0];
}

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
    return getLatestEvent(events);
  } catch {
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
    return getLatestEvent(events);
  } catch {
    return null;
  }
}

export function parseContactList(event: NostrEvent): string[] {
  return event.tags.filter((tag) => tag[0] === 'p' && tag[1]).map((tag) => tag[1]);
}
