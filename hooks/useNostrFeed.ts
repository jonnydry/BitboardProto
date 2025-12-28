import React, { useEffect } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import type { Board, Post } from '../types';
import { UIConfig } from '../config';
import { nostrService } from '../services/nostrService';
import { votingService } from '../services/votingService';
import { toastService } from '../services/toastService';
import { logger } from '../services/loggingService';

export function useNostrFeed(args: {
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  setBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  setIsNostrConnected: React.Dispatch<React.SetStateAction<boolean>>;
  setOldestTimestamp: React.Dispatch<React.SetStateAction<number | null>>;
  setHasMorePosts: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { setPosts, setBoards, setIsNostrConnected, setOldestTimestamp, setHasMorePosts } = args;

  // Initialize Nostr connection and fetch posts
  useEffect(() => {
    const initNostr = async () => {
      try {
        logger.mark('nostr-init-start');
        const initialLimit = UIConfig.INITIAL_POSTS_COUNT;

        // PHASE 1: Parallel fetch posts and boards
        logger.mark('nostr-fetch-start');
        const [nostrPosts, nostrBoards] = await Promise.all([
          nostrService.fetchPosts({ limit: initialLimit }),
          nostrService.fetchBoards()
        ]);
        logger.mark('nostr-fetch-end');
        logger.measure('nostr-initial-fetch', 'nostr-fetch-start', 'nostr-fetch-end');

        // Process posts
        let processedPosts: Post[] = [];
        if (nostrPosts.length > 0) {
          const convertedPosts = nostrPosts
            .filter((event) => nostrService.isBitboardPostEvent(event))
            .map((event) => nostrService.eventToPost(event));

          // Batch fetch cryptographically verified votes for all posts
          const postsWithNostrIds = convertedPosts.filter((p) => p.nostrEventId);
          const postIds = postsWithNostrIds.map((p) => p.nostrEventId!);

          // PHASE 2: Parallel fetch votes and edits
          const [voteTallies, editEventsResult] = await Promise.all([
            votingService.fetchVotesForPosts(postIds),
            nostrService.fetchPostEdits(postIds, { limit: 300 }).catch((err) => {
              logger.warn('NostrFeed', 'Failed to fetch post edits', err);
              return [];
            })
          ]);

          const postsWithVotes = convertedPosts.map((post) => {
            if (post.nostrEventId) {
              const tally = voteTallies.get(post.nostrEventId);
              if (tally) {
                return {
                  ...post,
                  upvotes: tally.upvotes,
                  downvotes: tally.downvotes,
                  score: tally.score,
                  uniqueVoters: tally.uniqueVoters,
                  votesVerified: true,
                };
              }
            }
            return post;
          });

          // Apply latest post edits (BitBoard edit companion events)
          let postsWithEdits = postsWithVotes;
          if (editEventsResult.length > 0) {
            const latestByRoot = new Map<string, { created_at: number; event: NostrEvent }>();
            for (const ev of editEventsResult) {
              const parsed = nostrService.eventToPostEditUpdate(ev);
              if (!parsed) continue;
              const existing = latestByRoot.get(parsed.rootPostEventId);
              if (!existing || ev.created_at > existing.created_at) {
                latestByRoot.set(parsed.rootPostEventId, { created_at: ev.created_at, event: ev });
              }
            }

            postsWithEdits = postsWithVotes.map((p) => {
              const rootId = p.nostrEventId;
              if (!rootId) return p;
              const latest = latestByRoot.get(rootId);
              if (!latest) return p;
              const parsed = nostrService.eventToPostEditUpdate(latest.event);
              if (!parsed) return p;
              return {
                ...p,
                ...parsed.updates,
              };
            });
          }

          processedPosts = postsWithEdits;

          const timestamps = postsWithVotes.map((p) => p.timestamp);
          if (timestamps.length > 0) {
            setOldestTimestamp(Math.min(...timestamps));
          }

          setHasMorePosts(nostrPosts.length >= initialLimit);
        } else {
          setHasMorePosts(false);
        }

        // Process boards
        let processedBoards: Board[] = [];
        if (nostrBoards.length > 0) {
          processedBoards = nostrBoards.map((event) => nostrService.eventToBoard(event));
        }

        // Single state update with all data
        setPosts((prev) => {
          const existingIds = new Set(prev.map((p) => p.nostrEventId).filter(Boolean));
          const newPosts = processedPosts.filter((p) => !existingIds.has(p.nostrEventId));
          return [...prev, ...newPosts];
        });

        setBoards((prev) => {
          const existingIds = new Set(prev.map((b) => b.id));
          const newBoards = processedBoards.filter((b) => !existingIds.has(b.id));
          return [...prev, ...newBoards];
        });

        setIsNostrConnected(true);
        logger.mark('nostr-init-end');
        logger.measure('nostr-initialization', 'nostr-init-start', 'nostr-init-end');

        // PHASE 3: Defer profile fetching to after initial render
        if (processedPosts.length > 0) {
          // Use requestIdleCallback if available, otherwise setTimeout
          const scheduleProfiles = typeof requestIdleCallback !== 'undefined'
            ? () => requestIdleCallback(fetchProfiles)
            : () => setTimeout(fetchProfiles, 100);

          const fetchProfiles = () => {
            const pubkeys = Array.from(
              new Set(processedPosts.map((p) => p.authorPubkey).filter(Boolean) as string[])
            );
            if (pubkeys.length > 0) {
              nostrService.fetchProfiles(pubkeys).then(() => {
                setPosts((prev) =>
                  prev.map((p) =>
                    p.authorPubkey ? { ...p, author: nostrService.getDisplayName(p.authorPubkey) } : p
                  )
                );
              }).catch((err) => {
                logger.warn('NostrFeed', 'Failed to fetch profiles', err);
              });
            }
          };

          scheduleProfiles();
        }
      } catch (error) {
        logger.error('NostrFeed', 'Failed to initialize Nostr', error);
        setIsNostrConnected(false);
        const connected = nostrService.getConnectedCount();
        const total = nostrService.getRelays().length;
        toastService.push({
          type: 'error',
          message: 'Nostr connection failed (offline mode)',
          detail: `${error instanceof Error ? error.message : String(error)} — Relays: ${connected}/${total}. Check RELAYS settings.`,
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: 'nostr-init-failed',
        });
      }
    };

    initNostr();

    // Subscribe to real-time updates
    const subId = nostrService.subscribeToFeed((event) => {
      if (!nostrService.isBitboardPostEvent(event)) return;
      const post = nostrService.eventToPost(event);
      setPosts((prev) => {
        if (prev.some((p) => p.nostrEventId === post.nostrEventId)) return prev;
        return [post, ...prev];
      });

      if (post.authorPubkey) {
        nostrService.fetchProfiles([post.authorPubkey]).then(() => {
          setPosts((prev) =>
            prev.map((p) =>
              p.authorPubkey === post.authorPubkey
                ? { ...p, author: nostrService.getDisplayName(post.authorPubkey!) }
                : p
            )
          );
        });
      }
    });

    // Subscribe to post edit events and merge into local state
    const subIdEdits = nostrService.subscribeToPostEdits((event) => {
      const parsed = nostrService.eventToPostEditUpdate(event);
      if (!parsed) return;
      setPosts((prev) =>
        prev.map((p) => {
          if (p.nostrEventId !== parsed.rootPostEventId && p.id !== parsed.rootPostEventId) return p;
          return { ...p, ...parsed.updates };
        })
      );
    });

    return () => {
      nostrService.unsubscribe(subId);
      nostrService.unsubscribe(subIdEdits);
    };
  }, [setBoards, setHasMorePosts, setIsNostrConnected, setOldestTimestamp, setPosts]);

  // Cleanup on unmount and beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      nostrService.cleanup();
      votingService.cleanup();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      nostrService.cleanup();
      votingService.cleanup();
    };
  }, []);
}
