import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Board, Post, UserState } from '../../types';
import { BoardType, NOSTR_KINDS, ViewMode } from '../../types';
import { nostrService } from '../../services/nostr/NostrService';
import { identityService } from '../../services/identityService';
import { toastService } from '../../services/toastService';
import { logger } from '../../services/loggingService';
import { UIConfig } from '../../config';
import { encryptedBoardService } from '../../services/encryptedBoardService';
import { bookmarkService } from '../../services/bookmarkService';
import { seedRateLimiter } from '../../services/seedRateLimiter';
import {
  postOutboxStorageRemoveMatching,
  postOutboxStorageUpsert,
  ownPostsCacheUpsert,
  ownPostsCacheRemove,
} from '../../services/postOutboxStorage';

interface UseAppPostMutationHandlersArgs {
  boardsById: Map<string, Board>;
  postsById: Map<string, Post>;
  userState: UserState;
  setPosts: Dispatch<SetStateAction<Post[]>>;
  setViewMode: (mode: ViewMode) => void;
  setEditingPostId: (id: string | null) => void;
  getRelayHint: () => string;
}

export function useAppPostMutationHandlers({
  boardsById,
  postsById,
  userState,
  setPosts,
  setViewMode,
  setEditingPostId,
  getRelayHint,
}: UseAppPostMutationHandlersArgs) {
  const handleCreatePost = useCallback(
    async (
      newPostData: Omit<
        Post,
        | 'id'
        | 'timestamp'
        | 'score'
        | 'commentCount'
        | 'comments'
        | 'nostrEventId'
        | 'upvotes'
        | 'downvotes'
      >,
    ) => {
      const timestamp = Date.now();
      const localId = `local-${timestamp}`;

      const newPost: Post = {
        ...newPostData,
        id: localId,
        timestamp,
        score: 1,
        commentCount: 0,
        comments: [],
        upvotes: 1,
        downvotes: 0,
        syncStatus: userState.identity ? 'pending' : 'synced',
      };

      const targetBoard = boardsById.get(newPostData.boardId);
      if (targetBoard?.isEncrypted) {
        const boardKey = encryptedBoardService.getBoardKey(targetBoard.id);
        if (!boardKey) {
          toastService.push({
            type: 'error',
            message: 'Encryption key not found',
            detail: 'You need the board share link to post in this encrypted board.',
            durationMs: UIConfig.TOAST_DURATION_MS,
            dedupeKey: 'encryption-key-missing',
          });
          return;
        }

        try {
          const encrypted = await encryptedBoardService.encryptPost(
            { title: newPostData.title, content: newPostData.content },
            boardKey,
          );
          newPost.isEncrypted = true;
          newPost.encryptedTitle = encrypted.encryptedTitle;
          newPost.encryptedContent = encrypted.encryptedContent;
        } catch (error) {
          logger.error('App', 'Failed to encrypt post', error);
          toastService.push({
            type: 'error',
            message: 'Failed to encrypt post',
            detail: error instanceof Error ? error.message : String(error),
            durationMs: UIConfig.TOAST_DURATION_MS,
            dedupeKey: 'encryption-failed',
          });
          return;
        }
      }

      setPosts((prev) => [newPost, ...prev]);
      setViewMode(ViewMode.FEED);

      if (userState.identity) {
        postOutboxStorageUpsert(newPost);
        void (async () => {
          try {
            const geohash =
              targetBoard?.type === BoardType.GEOHASH ? targetBoard.geohash : undefined;
            const boardAddress = targetBoard?.createdBy
              ? `${NOSTR_KINDS.BOARD_DEFINITION}:${targetBoard.createdBy}:${targetBoard.id}`
              : undefined;

            const eventPayload = {
              ...newPostData,
              timestamp,
              upvotes: 0,
              downvotes: 0,
            };

            const unsigned = nostrService.buildPostEvent(
              eventPayload,
              userState.identity.pubkey,
              geohash,
              {
                boardAddress,
                boardName: targetBoard?.name,
                encryptedTitle: newPost.encryptedTitle,
                encryptedContent: newPost.encryptedContent,
              },
            );
            const signed = await identityService.signEvent(unsigned);
            const event = await nostrService.publishSignedEvent(signed);

            postOutboxStorageRemoveMatching(localId, event.id);
            const syncedPost: Post = {
              ...newPost,
              nostrEventId: event.id,
              id: event.id,
              syncStatus: 'synced',
              syncError: undefined,
            };
            ownPostsCacheUpsert(syncedPost);
            setPosts((prev) => prev.map((post) => (post.id === localId ? syncedPost : post)));
          } catch (error) {
            logger.error('App', 'Failed to publish post to Nostr', error);
            const errMsg = error instanceof Error ? error.message : String(error);

            postOutboxStorageUpsert({
              ...newPost,
              syncStatus: 'failed',
              syncError: errMsg,
            });
            setPosts((prev) =>
              prev.map((post) =>
                post.id === localId ? { ...post, syncStatus: 'failed', syncError: errMsg } : post,
              ),
            );

            toastService.push({
              type: 'error',
              message: 'Failed to publish to Nostr',
              detail: 'Your post is saved locally. Tap to retry.',
              durationMs: UIConfig.TOAST_DURATION_MS,
              dedupeKey: 'publish-post-failed',
            });
          }
        })();
      }
    },
    [userState.identity, boardsById, setPosts, setViewMode],
  );

  const handleSavePost = useCallback(
    (postId: string, updates: Partial<Post>) => {
      const existing = postsById.get(postId);
      if (!existing) return;

      const merged: Post = { ...existing, ...updates };

      setPosts((currentPosts) =>
        currentPosts.map((post) => (post.id === postId ? { ...post, ...updates } : post)),
      );
      setEditingPostId(null);
      setViewMode(ViewMode.FEED);

      if (existing.nostrEventId && userState.identity) {
        void (async () => {
          try {
            const board = boardsById.get(existing.boardId);
            let encryptedTitle: string | undefined;
            let encryptedContent: string | undefined;

            if (board?.isEncrypted) {
              const boardKey = encryptedBoardService.getBoardKey(board.id);
              if (!boardKey) {
                toastService.push({
                  type: 'error',
                  message: 'Encryption key not found',
                  detail: 'You need the board share link to edit posts in this encrypted board.',
                  durationMs: UIConfig.TOAST_DURATION_MS,
                  dedupeKey: 'encryption-key-missing-edit',
                });
                return;
              }

              try {
                const encrypted = await encryptedBoardService.encryptPost(
                  { title: merged.title, content: merged.content },
                  boardKey,
                );
                encryptedTitle = encrypted.encryptedTitle;
                encryptedContent = encrypted.encryptedContent;
              } catch (error) {
                logger.error('App', 'Failed to encrypt post edit', error);
                toastService.push({
                  type: 'error',
                  message: 'Failed to encrypt post edit',
                  detail: error instanceof Error ? error.message : String(error),
                  durationMs: UIConfig.TOAST_DURATION_MS,
                  dedupeKey: 'encryption-failed-edit',
                });
                return;
              }
            }

            const unsigned = nostrService.buildPostEditEvent({
              rootPostEventId: existing.nostrEventId,
              boardId: existing.boardId,
              title: merged.title,
              content: merged.content,
              tags: merged.tags,
              url: merged.url,
              imageUrl: merged.imageUrl,
              pubkey: userState.identity.pubkey,
              encryptedTitle,
              encryptedContent,
            });

            const signed = await identityService.signEvent(unsigned);
            await nostrService.publishSignedEvent(signed);

            toastService.push({
              type: 'success',
              message: 'Edit published to Nostr',
              durationMs: UIConfig.TOAST_DURATION_MS,
              dedupeKey: `post-edit-published-${existing.nostrEventId}`,
            });
          } catch (error) {
            logger.error('App', 'Failed to publish post edit to Nostr', error);
            const errMsg = error instanceof Error ? error.message : String(error);
            toastService.push({
              type: 'error',
              message: 'Failed to publish edit to Nostr (saved locally)',
              detail: `${errMsg} — ${getRelayHint()}`,
              durationMs: UIConfig.TOAST_DURATION_MS,
              dedupeKey: `post-edit-failed-${existing.nostrEventId}`,
            });
          }
        })();
      } else if (existing.nostrEventId && !userState.identity) {
        toastService.push({
          type: 'info',
          message: 'Edit saved locally. Connect an identity to publish to Nostr.',
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: `post-edit-local-only-${existing.nostrEventId}`,
        });
      }
    },
    [
      postsById,
      boardsById,
      userState.identity,
      getRelayHint,
      setPosts,
      setEditingPostId,
      setViewMode,
    ],
  );

  const handleDeletePost = useCallback(
    async (postId: string) => {
      const post = postsById.get(postId);
      if (!post) return;

      if (
        userState.identity &&
        post.authorPubkey &&
        post.authorPubkey !== userState.identity.pubkey
      ) {
        toastService.push({
          type: 'error',
          message: 'Cannot delete post',
          detail: 'You can only delete your own posts.',
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: 'delete-post-not-owner',
        });
        return;
      }

      setPosts((currentPosts) => currentPosts.filter((candidate) => candidate.id !== postId));
      bookmarkService.removeBookmark(postId);
      postOutboxStorageRemoveMatching(postId, post.nostrEventId);
      ownPostsCacheRemove(postId, post.nostrEventId ?? '');
      setEditingPostId(null);
      setViewMode(ViewMode.FEED);

      if (userState.identity && post.nostrEventId) {
        try {
          const unsigned = nostrService.buildPostDeleteEvent({
            postEventId: post.nostrEventId,
            pubkey: userState.identity.pubkey,
          });
          const signed = await identityService.signEvent(unsigned);
          await nostrService.publishSignedEvent(signed);

          toastService.push({
            type: 'success',
            message: 'Post deleted',
            detail: 'Delete request published to Nostr relays.',
            durationMs: UIConfig.TOAST_DURATION_MS,
            dedupeKey: `post-deleted-${postId}`,
          });
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          toastService.push({
            type: 'error',
            message: 'Failed to publish delete to Nostr (deleted locally)',
            detail: `${errMsg} — ${getRelayHint()}`,
            durationMs: UIConfig.TOAST_DURATION_MS,
            dedupeKey: `post-delete-failed-${postId}`,
          });
        }
      } else {
        toastService.push({
          type: 'success',
          message: 'Post deleted locally',
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: `post-deleted-local-${postId}`,
        });
      }
    },
    [postsById, userState.identity, getRelayHint, setPosts, setEditingPostId, setViewMode],
  );

  const handleRetryPost = useCallback(
    async (postId: string) => {
      const post = postsById.get(postId);
      if (!post || post.syncStatus !== 'failed') {
        logger.warn('App', `Cannot retry post - not found or not failed: ${postId}`);
        return;
      }

      if (!userState.identity) {
        toastService.push({
          type: 'error',
          message: 'Identity required',
          detail: 'Connect your Nostr identity to publish.',
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: 'retry-no-identity',
        });
        return;
      }

      setPosts((prev) =>
        prev.map((candidate) =>
          candidate.id === postId
            ? { ...candidate, syncStatus: 'pending', syncError: undefined }
            : candidate,
        ),
      );

      const pendingRetry = { ...post, syncStatus: 'pending' as const, syncError: undefined };
      postOutboxStorageUpsert(pendingRetry);

      try {
        const targetBoard = boardsById.get(post.boardId);
        const geohash = targetBoard?.type === BoardType.GEOHASH ? targetBoard.geohash : undefined;
        const boardAddress = targetBoard?.createdBy
          ? `${NOSTR_KINDS.BOARD_DEFINITION}:${targetBoard.createdBy}:${targetBoard.id}`
          : undefined;

        const eventPayload = {
          boardId: post.boardId,
          title: post.title,
          content: post.content,
          author: post.author,
          authorPubkey: post.authorPubkey,
          tags: post.tags,
          url: post.url,
          imageUrl: post.imageUrl,
          linkDescription: post.linkDescription,
          timestamp: post.timestamp,
          upvotes: 0,
          downvotes: 0,
        };

        const unsigned = nostrService.buildPostEvent(
          eventPayload,
          userState.identity.pubkey,
          geohash,
          {
            boardAddress,
            boardName: targetBoard?.name,
            encryptedTitle: post.encryptedTitle,
            encryptedContent: post.encryptedContent,
          },
        );
        const signed = await identityService.signEvent(unsigned);
        const event = await nostrService.publishSignedEvent(signed);

        postOutboxStorageRemoveMatching(postId, event.id);
        const retrySynced: Post = {
          ...post,
          nostrEventId: event.id,
          id: event.id,
          syncStatus: 'synced',
          syncError: undefined,
        };
        ownPostsCacheUpsert(retrySynced);
        setPosts((prev) =>
          prev.map((candidate) => (candidate.id === postId ? retrySynced : candidate)),
        );

        toastService.push({
          type: 'success',
          message: 'Post published to Nostr',
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: `retry-success-${postId}`,
        });
      } catch (error) {
        logger.error('App', 'Retry failed', error);
        const errMsg = error instanceof Error ? error.message : String(error);

        postOutboxStorageUpsert({ ...post, syncStatus: 'failed', syncError: errMsg });
        setPosts((prev) =>
          prev.map((candidate) =>
            candidate.id === postId
              ? { ...candidate, syncStatus: 'failed', syncError: errMsg }
              : candidate,
          ),
        );

        toastService.push({
          type: 'error',
          message: 'Retry failed',
          detail: errMsg,
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: `retry-failed-${postId}`,
        });
      }
    },
    [postsById, boardsById, userState.identity, setPosts],
  );

  return {
    handleCreatePost,
    handleSeedPost: async (sourcePost: Post, destinationBoardId: string) => {
      if (!userState.identity) {
        throw new Error('Identity required to seed posts into BitBoard.');
      }

      const rateCheck = seedRateLimiter.canSeed(userState.identity.pubkey);
      if (!rateCheck.allowed) {
        const resetIn = rateCheck.resetAt
          ? seedRateLimiter.formatResetTime(rateCheck.resetAt)
          : 'later';
        throw new Error(
          `Seed limit reached. You can seed ${seedRateLimiter.getLimit()} posts per day. Try again in ${resetIn}.`,
        );
      }

      const targetBoard = boardsById.get(destinationBoardId);
      if (!targetBoard || targetBoard.isReadOnly) {
        throw new Error('Choose a writable BitBoard destination.');
      }

      const timestamp = Date.now();
      const localId = `local-seed-${timestamp}`;
      const seedTitle = sourcePost.title.trim() || 'Seeded from Nostr';
      const seedContent = sourcePost.content.trim();

      const newPost: Post = {
        id: localId,
        boardId: destinationBoardId,
        seededFrom: 'nostr',
        seedSourceEventId: sourcePost.nostrEventId || sourcePost.id,
        seedSourceAuthorPubkey: sourcePost.authorPubkey,
        seedSourceCommunityAddress: sourcePost.communityAddress,
        title: seedTitle,
        author: userState.username,
        authorPubkey: userState.identity.pubkey,
        content: seedContent,
        timestamp,
        score: 1,
        commentCount: 0,
        tags: sourcePost.tags,
        url: sourcePost.url,
        imageUrl: sourcePost.imageUrl,
        linkDescription: sourcePost.linkDescription,
        comments: [],
        upvotes: 1,
        downvotes: 0,
        syncStatus: 'pending',
      };

      setPosts((prev) => [newPost, ...prev]);
      setViewMode(ViewMode.FEED);
      postOutboxStorageUpsert(newPost);

      try {
        const geohash = targetBoard.type === BoardType.GEOHASH ? targetBoard.geohash : undefined;
        const boardAddress = targetBoard.createdBy
          ? `${NOSTR_KINDS.BOARD_DEFINITION}:${targetBoard.createdBy}:${targetBoard.id}`
          : undefined;

        const unsigned = nostrService.buildPostEvent(
          {
            boardId: destinationBoardId,
            title: seedTitle,
            content: seedContent,
            url: sourcePost.url,
            imageUrl: sourcePost.imageUrl,
            linkDescription: sourcePost.linkDescription,
            author: userState.username,
            authorPubkey: userState.identity.pubkey,
            timestamp,
            tags: sourcePost.tags,
            seededFrom: 'nostr',
            seedSourceEventId: sourcePost.nostrEventId || sourcePost.id,
            seedSourceAuthorPubkey: sourcePost.authorPubkey,
            seedSourceCommunityAddress: sourcePost.communityAddress,
          },
          userState.identity.pubkey,
          geohash,
          {
            boardAddress,
            boardName: targetBoard.name,
            seedSourceEventId: sourcePost.nostrEventId || sourcePost.id,
            seedSourceAuthorPubkey: sourcePost.authorPubkey,
            seedSourceCommunityAddress: sourcePost.communityAddress,
          },
        );
        const signed = await identityService.signEvent(unsigned);
        const event = await nostrService.publishSignedEvent(signed);

        seedRateLimiter.recordSeed(
          userState.identity.pubkey,
          sourcePost.nostrEventId || sourcePost.id,
          destinationBoardId,
        );

        postOutboxStorageRemoveMatching(localId, event.id);
        ownPostsCacheUpsert({
          ...newPost,
          nostrEventId: event.id,
          id: event.id,
          syncStatus: 'synced',
          syncError: undefined,
        });
        setPosts((prev) =>
          prev.map((post) =>
            post.id === localId
              ? {
                  ...post,
                  nostrEventId: event.id,
                  id: event.id,
                  syncStatus: 'synced',
                  syncError: undefined,
                }
              : post,
          ),
        );
      } catch (error) {
        logger.error('App', 'Failed to seed post to BitBoard', error);
        const errMsg = error instanceof Error ? error.message : String(error);
        postOutboxStorageUpsert({ ...newPost, syncStatus: 'failed', syncError: errMsg });
        setPosts((prev) =>
          prev.map((post) =>
            post.id === localId ? { ...post, syncStatus: 'failed', syncError: errMsg } : post,
          ),
        );
        throw new Error(`Failed to publish seeded post. ${getRelayHint()}`);
      }
    },
    handleSavePost,
    handleDeletePost,
    handleRetryPost,
  };
}
