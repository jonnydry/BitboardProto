import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Board, Post } from '../../types';
import { ViewMode } from '../../types';
import { bookmarkService } from '../../services/bookmarkService';
import { encryptedBoardService } from '../../services/encryptedBoardService';
import { followServiceV2 } from '../../services/followServiceV2';
import { identityService } from '../../services/identityService';
import { logger } from '../../services/loggingService';
import { nostrService } from '../../services/nostrService';
import { nostrEventDeduplicator, voteDeduplicator } from '../../services/messageDeduplicator';
import { rateLimiter } from '../../services/rateLimiter';
import { reportService } from '../../services/reportService';
import { toastService } from '../../services/toastService';
import { votingService } from '../../services/votingService';
import { FeatureFlags, StorageKeys, UIConfig } from '../../config';

interface UseAppLifecycleArgs {
  boards: Board[];
  posts: Post[];
  setBookmarkedIds: (ids: string[]) => void;
  setReportedPostIds: (ids: string[]) => void;
  setFollowingPubkeys: (pubkeys: string[]) => void;
  setUserState: Dispatch<SetStateAction<any>>;
  setActiveBoardId: (id: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
}

export function useAppLifecycle(args: UseAppLifecycleArgs): void {
  const {
    boards,
    posts,
    setBookmarkedIds,
    setReportedPostIds,
    setFollowingPubkeys,
    setUserState,
    setActiveBoardId,
    setViewMode,
  } = args;

  useEffect(() => {
    const unsubscribe = bookmarkService.subscribe(() => {
      setBookmarkedIds(bookmarkService.getBookmarkedIds());
    });
    return unsubscribe;
  }, [setBookmarkedIds]);

  useEffect(() => {
    const unsubscribe = reportService.subscribe(() => {
      setReportedPostIds(reportService.getReportsByType('post').map((report) => report.targetId));
    });
    return unsubscribe;
  }, [setReportedPostIds]);

  useEffect(() => {
    const unsubscribe = followServiceV2.subscribe(() => {
      setFollowingPubkeys(followServiceV2.getFollowingPubkeys());
    });
    return unsubscribe;
  }, [setFollowingPubkeys]);

  useEffect(() => {
    let cancelled = false;

    identityService
      .getIdentityAsync()
      .then((loadedIdentity) => {
        if (cancelled || !loadedIdentity) return;

        const publicIdentity = identityService.getPublicIdentity();
        if (!publicIdentity) return;

        setUserState((prev: any) => {
          if (prev.hasIdentity || prev.identity) return prev;

          const isGuestHandle = prev.username.startsWith('u/guest_');
          return {
            ...prev,
            identity: publicIdentity,
            hasIdentity: true,
            username:
              publicIdentity.displayName && isGuestHandle
                ? publicIdentity.displayName
                : prev.username,
          };
        });
      })
      .catch((err) => {
        logger.warn('App', 'Failed to load identity', err);
        toastService.push({
          type: 'error',
          message: 'Failed to load identity (guest mode)',
          detail: err instanceof Error ? err.message : String(err),
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: 'identity-load-failed',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [setUserState]);

  useEffect(() => {
    const shareData = encryptedBoardService.handleShareLink();
    if (!shareData) return;

    logger.info('App', `Received encrypted board share link: ${shareData.boardId}`);
    setActiveBoardId(shareData.boardId);
    setViewMode(ViewMode.FEED);
    toastService.push({
      type: 'success',
      message: 'Encrypted board access granted',
      detail: `You now have access to board ${shareData.boardId}`,
      durationMs: UIConfig.TOAST_DURATION_MS,
      dedupeKey: 'encrypted-board-access',
    });
  }, [setActiveBoardId, setViewMode]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      nostrService.cleanup();
      votingService.cleanup();
      rateLimiter.stopCleanup();
      nostrEventDeduplicator.stopCleanup();
      voteDeduplicator.stopCleanup();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      handleBeforeUnload();
    };
  }, []);

  useEffect(() => {
    if (!FeatureFlags.ENABLE_OFFLINE_MODE) return;
    if (typeof localStorage === 'undefined') return;

    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(
          StorageKeys.POSTS_CACHE,
          JSON.stringify({ savedAt: Date.now(), posts: posts.slice(0, 200) }),
        );
        localStorage.setItem(
          StorageKeys.BOARDS_CACHE,
          JSON.stringify({ savedAt: Date.now(), boards }),
        );
      } catch {
        // Ignore quota / serialization errors
      }
    }, 500);

    return () => window.clearTimeout(id);
  }, [boards, posts]);
}
