import type { Event as NostrEvent } from 'nostr-tools';
import type { Post } from '../../types';
import { logger } from '../loggingService';
import { votingService } from '../votingService';
import { nostrService } from './NostrService';

export async function processFetchedPostEvents(nostrPosts: NostrEvent[]): Promise<{
  processedPosts: Post[];
  oldestMs: number | null;
}> {
  if (nostrPosts.length === 0) {
    return { processedPosts: [], oldestMs: null };
  }

  const convertedPosts = nostrPosts
    .filter((event) => nostrService.isBitboardPostEvent(event))
    .map((event) => nostrService.eventToPost(event));

  const postsWithNostrIds = convertedPosts.filter((post) => post.nostrEventId);
  const postIds = postsWithNostrIds.map((post) => post.nostrEventId!);

  const [voteTallies, editEvents] = await Promise.all([
    votingService.fetchVotesForPosts(postIds),
    postIds.length > 0
      ? nostrService.fetchPostEdits(postIds, { limit: 300 }).catch((error) => {
          logger.warn('NostrFeed', 'Failed to fetch post edits', error);
          return [];
        })
      : Promise.resolve([] as NostrEvent[]),
  ]);

  const latestEditsByRoot = new Map<string, Partial<Post>>();
  const latestEditTimestampByRoot = new Map<string, number>();
  for (const event of editEvents) {
    const parsed = nostrService.eventToPostEditUpdate(event);
    if (!parsed) continue;
    const existing = latestEditTimestampByRoot.get(parsed.rootPostEventId);
    if (existing !== undefined && existing >= event.created_at) continue;
    latestEditTimestampByRoot.set(parsed.rootPostEventId, event.created_at);
    latestEditsByRoot.set(parsed.rootPostEventId, parsed.updates);
  }

  const processedPosts = convertedPosts.map((post) => {
    const next: Post = { ...post };

    if (post.nostrEventId) {
      const tally = voteTallies.get(post.nostrEventId);
      if (tally) {
        next.upvotes = tally.upvotes;
        next.downvotes = tally.downvotes;
        next.score = tally.score;
        next.uniqueVoters = tally.uniqueVoters;
        next.votesVerified = true;
      }

      const updates = latestEditsByRoot.get(post.nostrEventId);
      if (updates) {
        Object.assign(next, updates);
      }
    }

    return next;
  });

  return {
    processedPosts,
    oldestMs: getOldestPostTimestamp(processedPosts),
  };
}

export function getOldestPostTimestamp(posts: Post[]): number | null {
  if (posts.length === 0) return null;

  let oldest = Number.POSITIVE_INFINITY;
  for (const post of posts) {
    if (post.timestamp < oldest) {
      oldest = post.timestamp;
    }
  }

  return Number.isFinite(oldest) ? oldest : null;
}

export function mergeAuthoritativeNostrPosts(existingPosts: Post[], fetchedPosts: Post[]): Post[] {
  if (existingPosts.length === 0) {
    return fetchedPosts;
  }

  if (fetchedPosts.length === 0) {
    return existingPosts;
  }

  const existingNostrIds = new Set(
    existingPosts.map((post) => post.nostrEventId).filter(Boolean) as string[],
  );
  const fetchedByNostrId = new Map<string, Post>();
  for (const post of fetchedPosts) {
    if (post.nostrEventId) {
      fetchedByNostrId.set(post.nostrEventId, post);
    }
  }

  if (fetchedByNostrId.size === 0) {
    return existingPosts;
  }

  let changed = false;
  const mergedExisting = existingPosts.map((post) => {
    if (!post.nostrEventId) return post;

    const fresh = fetchedByNostrId.get(post.nostrEventId);
    if (!fresh) return post;

    changed = true;
    return { ...fresh, syncStatus: fresh.syncStatus ?? post.syncStatus };
  });

  const toAdd = fetchedPosts.filter(
    (post) => post.nostrEventId && !existingNostrIds.has(post.nostrEventId),
  );

  if (!changed && toAdd.length === 0) {
    return existingPosts;
  }

  return [...toAdd, ...mergedExisting];
}

export function appendUniqueNostrPosts(existingPosts: Post[], fetchedPosts: Post[]): Post[] {
  if (fetchedPosts.length === 0) return existingPosts;

  const existingIds = new Set(existingPosts.map((post) => post.nostrEventId).filter(Boolean));
  const nextPosts = fetchedPosts.filter(
    (post) => !post.nostrEventId || !existingIds.has(post.nostrEventId),
  );
  return nextPosts.length > 0 ? [...existingPosts, ...nextPosts] : existingPosts;
}
