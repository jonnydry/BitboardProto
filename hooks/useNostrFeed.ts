import React, { useEffect, useState } from 'react';
import type { Board, Post } from '../types';
import { UIConfig } from '../config';
import { nostrService } from '../services/nostr/NostrService';
import { votingService } from '../services/votingService';
import { toastService } from '../services/toastService';
import { logger } from '../services/loggingService';
import { buildFetchPostsArgs, resolveNostrFeedScope } from '../services/nostr/nostrFeedScope';
import {
  mergeAuthoritativeNostrPosts,
  processFetchedPostEvents,
} from '../services/nostr/nostrFeedPosts';

export function useNostrFeed(args: {
  activeBoard: Board | null;
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  setBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  setIsNostrConnected: (connected: boolean) => void;
  setOldestTimestamp: (timestamp: number | null) => void;
  setHasMorePosts: (hasMore: boolean) => void;
}): { isInitialLoading: boolean } {
  const {
    activeBoard,
    setPosts,
    setBoards,
    setIsNostrConnected,
    setOldestTimestamp,
    setHasMorePosts,
  } = args;
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Board definitions from Nostr (once on mount)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const nostrBoards = await nostrService.fetchBoards();
        if (cancelled || nostrBoards.length === 0) return;
        const processedBoards = nostrBoards.map((event) => nostrService.eventToBoard(event));
        setBoards((prev) => {
          const existingIds = new Set(prev.map((b) => b.id));
          const newBoards = processedBoards.filter((b) => !existingIds.has(b.id));
          return [...prev, ...newBoards];
        });
      } catch (error) {
        logger.warn('NostrFeed', 'fetchBoards failed', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setBoards]);

  // Scoped post fetch + live subscription (re-runs when active board changes)
  useEffect(() => {
    let cancelled = false;
    let profileLoadHandle: number | null = null;
    const scope = resolveNostrFeedScope(activeBoard);
    const initialLimit = UIConfig.INITIAL_POSTS_COUNT;

    const initNostr = async () => {
      try {
        logger.mark('nostr-init-start');

        if (scope.mode === 'community') {
          if (cancelled) return;
          setOldestTimestamp(null);
          setHasMorePosts(false);
          setIsNostrConnected(true);
          setIsInitialLoading(false);
          logger.mark('nostr-init-end');
          return;
        }

        logger.mark('nostr-fetch-start');
        const fetchArgs = buildFetchPostsArgs(scope, { limit: initialLimit });
        const nostrPosts = await nostrService.fetchPosts(fetchArgs);
        logger.mark('nostr-fetch-end');
        logger.measure('nostr-initial-fetch', 'nostr-fetch-start', 'nostr-fetch-end');

        if (cancelled) return;

        const { processedPosts, oldestMs } = await processFetchedPostEvents(nostrPosts);

        if (oldestMs !== null && Number.isFinite(oldestMs)) {
          setOldestTimestamp(oldestMs);
        } else {
          setOldestTimestamp(null);
        }

        setHasMorePosts(nostrPosts.length >= initialLimit);

        setPosts((prev) => mergeAuthoritativeNostrPosts(prev, processedPosts));

        setIsNostrConnected(true);
        setIsInitialLoading(false);
        logger.mark('nostr-init-end');
        logger.measure('nostr-initialization', 'nostr-init-start', 'nostr-init-end');

        if (processedPosts.length > 0) {
          const fetchProfiles = () => {
            const pubkeys = Array.from(
              new Set(processedPosts.map((p) => p.authorPubkey).filter(Boolean) as string[]),
            );
            if (pubkeys.length > 0) {
              nostrService
                .fetchProfiles(pubkeys)
                .then(() => {
                  if (cancelled) return;
                  setPosts((prev) =>
                    prev.map((p) =>
                      p.authorPubkey
                        ? { ...p, author: nostrService.getDisplayName(p.authorPubkey) }
                        : p,
                    ),
                  );
                })
                .catch((err) => {
                  logger.warn('NostrFeed', 'Failed to fetch profiles', err);
                });
            }
          };

          const scheduleProfiles =
            typeof requestIdleCallback !== 'undefined'
              ? () => {
                  profileLoadHandle = requestIdleCallback(fetchProfiles);
                }
              : () => {
                  profileLoadHandle = window.setTimeout(fetchProfiles, 100);
                };

          scheduleProfiles();
        }
      } catch (error) {
        logger.error('NostrFeed', 'Failed to initialize Nostr', error);
        if (!cancelled) {
          setIsInitialLoading(false);
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
      }
    };

    void initNostr();

    const subscribeFilters = scope.mode === 'scoped' ? scope.subscribe : {};

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
                : p,
            ),
          );
        });
      }
    }, subscribeFilters);

    const subIdEdits = nostrService.subscribeToPostEdits((event) => {
      const parsed = nostrService.eventToPostEditUpdate(event);
      if (!parsed) return;
      setPosts((prev) =>
        prev.map((p) => {
          if (p.nostrEventId !== parsed.rootPostEventId && p.id !== parsed.rootPostEventId)
            return p;
          return { ...p, ...parsed.updates };
        }),
      );
    });

    return () => {
      cancelled = true;
      if (profileLoadHandle !== null) {
        if (typeof cancelIdleCallback !== 'undefined') {
          cancelIdleCallback(profileLoadHandle);
        } else {
          window.clearTimeout(profileLoadHandle);
        }
      }
      nostrService.unsubscribe(subId);
      nostrService.unsubscribe(subIdEdits);
    };
  }, [activeBoard, setHasMorePosts, setIsNostrConnected, setOldestTimestamp, setPosts]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      nostrService.cleanup();
      votingService.cleanup();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return { isInitialLoading };
}
