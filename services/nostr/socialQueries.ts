import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { NOSTR_KINDS } from '../../types';
import { nostrEventDeduplicator } from '../messageDeduplicator';
import { logger } from '../loggingService';
import { latestEvent, dedupeLatestByDTag } from './shared';
import type { QueryDeps, SubscriptionDeps } from './shared';

export async function fetchList(
  deps: QueryDeps,
  pubkey: string,
  kind: number,
): Promise<NostrEvent | null> {
  const filter: Filter = {
    kinds: [kind],
    authors: [pubkey],
    limit: 1,
  };

  try {
    return latestEvent(await deps.pool.querySync(deps.getReadRelays(), filter));
  } catch (error) {
    logger.error('Nostr', `Failed to fetch list kind ${kind}`, error);
    return null;
  }
}

export async function fetchNamedList(
  deps: QueryDeps,
  pubkey: string,
  kind: number,
  name: string,
): Promise<NostrEvent | null> {
  const filter: Filter = {
    kinds: [kind],
    authors: [pubkey],
    '#d': [name],
    limit: 1,
  };

  try {
    return latestEvent(await deps.pool.querySync(deps.getReadRelays(), filter));
  } catch (error) {
    logger.error('Nostr', `Failed to fetch named list ${kind}:${name}`, error);
    return null;
  }
}

export async function fetchAllNamedLists(
  deps: QueryDeps,
  pubkey: string,
  kind: number,
): Promise<NostrEvent[]> {
  const filter: Filter = {
    kinds: [kind],
    authors: [pubkey],
  };

  try {
    const events = await deps.pool.querySync(deps.getReadRelays(), filter);
    return dedupeLatestByDTag(events);
  } catch (error) {
    logger.error('Nostr', `Failed to fetch all named lists kind ${kind}`, error);
    return [];
  }
}

export async function fetchCommunityDefinition(
  deps: QueryDeps,
  creatorPubkey: string,
  communityId: string,
): Promise<NostrEvent | null> {
  const filter: Filter = {
    kinds: [NOSTR_KINDS.COMMUNITY_DEFINITION],
    authors: [creatorPubkey],
    '#d': [communityId],
    limit: 1,
  };

  try {
    return latestEvent(await deps.pool.querySync(deps.getReadRelays(), filter));
  } catch (error) {
    logger.error('Nostr', 'Failed to fetch community definition', error);
    return null;
  }
}

export async function fetchCommunities(
  deps: QueryDeps,
  opts: { limit?: number } = {},
): Promise<NostrEvent[]> {
  const filter: Filter = {
    kinds: [NOSTR_KINDS.COMMUNITY_DEFINITION],
    '#client': ['bitboard'],
    limit: opts.limit || 100,
  };

  try {
    const events = await deps.pool.querySync(deps.getReadRelays(), filter);
    return events.sort((a, b) => b.created_at - a.created_at);
  } catch (error) {
    logger.error('Nostr', 'Failed to fetch communities', error);
    return [];
  }
}

export async function fetchCommunityApprovals(
  deps: QueryDeps,
  communityAddress: string,
): Promise<NostrEvent[]> {
  const filter: Filter = {
    kinds: [NOSTR_KINDS.COMMUNITY_APPROVAL],
    '#a': [communityAddress],
    limit: 500,
  };

  try {
    return await deps.pool.querySync(deps.getReadRelays(), filter);
  } catch (error) {
    logger.error('Nostr', 'Failed to fetch community approvals', error);
    return [];
  }
}

export function subscribeToCommunityApprovals(
  deps: SubscriptionDeps,
  communityAddress: string,
  onEvent: (event: NostrEvent) => void,
): string {
  const subscriptionId = deps.nextSubId('community-approvals');
  const filter: Filter = {
    kinds: [NOSTR_KINDS.COMMUNITY_APPROVAL],
    '#a': [communityAddress],
    since: Math.floor(Date.now() / 1000),
  };

  const sub = deps.pool.subscribeMany(deps.getReadRelays(), [filter] as any, {
    onevent: (event) => {
      if (nostrEventDeduplicator.isEventDuplicate(event.id)) return;
      onEvent(event);
    },
    oneose: () => {
      logger.debug('Nostr', `End of stored community approvals for: ${subscriptionId}`);
    },
  });

  deps.subscriptions.set(subscriptionId, { unsub: () => sub.close() });
  return subscriptionId;
}

export async function fetchBadgeDefinitions(
  deps: QueryDeps,
  creatorPubkey: string,
): Promise<NostrEvent[]> {
  const filter: Filter = {
    kinds: [NOSTR_KINDS.BADGE_DEFINITION],
    authors: [creatorPubkey],
  };

  try {
    return await deps.pool.querySync(deps.getReadRelays(), filter);
  } catch (error) {
    logger.error('Nostr', 'Failed to fetch badge definitions', error);
    return [];
  }
}

export async function fetchBadgeDefinition(
  deps: QueryDeps,
  creatorPubkey: string,
  badgeId: string,
): Promise<NostrEvent | null> {
  const filter: Filter = {
    kinds: [NOSTR_KINDS.BADGE_DEFINITION],
    authors: [creatorPubkey],
    '#d': [badgeId],
    limit: 1,
  };

  try {
    return latestEvent(await deps.pool.querySync(deps.getReadRelays(), filter));
  } catch (error) {
    logger.error('Nostr', 'Failed to fetch badge definition', error);
    return null;
  }
}

export async function fetchBadgeAwards(deps: QueryDeps, pubkey: string): Promise<NostrEvent[]> {
  const filter: Filter = {
    kinds: [NOSTR_KINDS.BADGE_AWARD],
    '#p': [pubkey],
  };

  try {
    return await deps.pool.querySync(deps.getReadRelays(), filter);
  } catch (error) {
    logger.error('Nostr', 'Failed to fetch badge awards', error);
    return [];
  }
}

export async function fetchProfileBadges(
  deps: QueryDeps,
  pubkey: string,
): Promise<NostrEvent | null> {
  const filter: Filter = {
    kinds: [NOSTR_KINDS.BADGE_PROFILE],
    authors: [pubkey],
    '#d': ['profile_badges'],
    limit: 1,
  };

  try {
    return latestEvent(await deps.pool.querySync(deps.getReadRelays(), filter));
  } catch (error) {
    logger.error('Nostr', 'Failed to fetch profile badges', error);
    return null;
  }
}
