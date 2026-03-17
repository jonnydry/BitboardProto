import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Board, Post, UserState } from '../../types';
import { identityService } from '../../services/identityService';
import { encryptedBoardService } from '../../services/encryptedBoardService';
import { logger } from '../../services/loggingService';
import { nostrService } from '../../services/nostr/NostrService';
import { toastService } from '../../services/toastService';
import { inputValidator } from '../../services/inputValidator';
import { UIConfig } from '../../config';

interface UseAppCommentHandlersArgs {
  postsById: Map<string, Post>;
  boardsById: Map<string, Board>;
  userState: UserState;
  setPosts: Dispatch<SetStateAction<Post[]>>;
  getRelayHint: () => string;
}

export function useAppCommentHandlers({
  postsById,
  boardsById,
  userState,
  setPosts,
  getRelayHint,
}: UseAppCommentHandlersArgs) {
  const handleComment = useCallback(
    async (postId: string, content: string, parentCommentId?: string) => {
      const post = postsById.get(postId);
      if (!post) return;

      const board = boardsById.get(post.boardId);
      let encryptedContent: string | undefined;

      if (board?.isEncrypted) {
        const boardKey = encryptedBoardService.getBoardKey(board.id);
        if (!boardKey) {
          toastService.push({
            type: 'error',
            message: 'Encryption key not found',
            detail: 'You need the board share link to comment in this encrypted board.',
            durationMs: UIConfig.TOAST_DURATION_MS,
            dedupeKey: 'encryption-key-missing-comment',
          });
          return;
        }

        try {
          encryptedContent = await encryptedBoardService.encryptContent(content, boardKey);
        } catch (error) {
          logger.error('App', 'Failed to encrypt comment', error);
          toastService.push({
            type: 'error',
            message: 'Failed to encrypt comment',
            detail: error instanceof Error ? error.message : String(error),
            durationMs: UIConfig.TOAST_DURATION_MS,
            dedupeKey: 'encryption-failed-comment',
          });
          return;
        }
      }

      const newComment = {
        id: `c-${Date.now()}`,
        author: userState.username,
        authorPubkey: userState.identity?.pubkey,
        content,
        timestamp: Date.now(),
        parentId: parentCommentId,
        isEncrypted: !!encryptedContent,
        encryptedContent,
        score: 0,
        upvotes: 0,
        downvotes: 0,
      };

      if (userState.identity && post.nostrEventId) {
        const parentComment = parentCommentId
          ? post.comments.find((comment) => comment.id === parentCommentId)
          : undefined;
        const unsigned = nostrService.buildCommentEvent(
          post.nostrEventId,
          content,
          userState.identity.pubkey,
          parentCommentId,
          {
            postAuthorPubkey: post.authorPubkey,
            parentCommentAuthorPubkey: parentComment?.authorPubkey,
            encryptedContent,
          },
        );

        identityService
          .signEvent(unsigned)
          .then((signed) => nostrService.publishSignedEvent(signed))
          .then((event) => {
            setPosts((prevPosts) =>
              prevPosts.map((candidate) => {
                if (candidate.id !== postId) return candidate;
                const updatedComment = { ...newComment, id: event.id, nostrEventId: event.id };
                return {
                  ...candidate,
                  comments: candidate.comments.map((comment) =>
                    comment.id === newComment.id ? updatedComment : comment,
                  ),
                };
              }),
            );
          })
          .catch((error) => {
            logger.error('App', 'Failed to publish comment to Nostr', error);
            const errMsg = error instanceof Error ? error.message : String(error);
            toastService.push({
              type: 'error',
              message: 'Failed to publish comment to Nostr (saved locally)',
              detail: `${errMsg} — ${getRelayHint()}`,
              durationMs: UIConfig.TOAST_DURATION_MS,
              dedupeKey: 'publish-comment-failed',
            });
          });
      }

      setPosts((currentPosts) =>
        currentPosts.map((candidate) => {
          if (candidate.id !== postId) return candidate;
          return {
            ...candidate,
            commentCount: candidate.commentCount + 1,
            comments: [...candidate.comments, newComment],
          };
        }),
      );
    },
    [postsById, boardsById, userState.username, userState.identity, getRelayHint, setPosts],
  );

  const handleEditComment = useCallback(
    async (postId: string, commentId: string, nextContent: string) => {
      const validated = inputValidator.validateCommentContent(nextContent);
      if (!validated) {
        toastService.push({
          type: 'error',
          message: 'Invalid comment content',
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: 'comment-edit-invalid',
        });
        return;
      }

      const post = postsById.get(postId);
      const target = post?.comments.find((comment) => comment.id === commentId);
      if (!post || !target) return;

      setPosts((prev) =>
        prev.map((candidate) => {
          if (candidate.id !== postId) return candidate;
          return {
            ...candidate,
            comments: candidate.comments.map((comment) =>
              comment.id === commentId
                ? { ...comment, content: validated, editedAt: Date.now() }
                : comment,
            ),
          };
        }),
      );

      if (
        userState.identity &&
        post.nostrEventId &&
        target.nostrEventId &&
        target.authorPubkey === userState.identity.pubkey
      ) {
        try {
          const board = boardsById.get(post.boardId);
          let encryptedContent: string | undefined;

          if (board?.isEncrypted) {
            const boardKey = encryptedBoardService.getBoardKey(board.id);
            if (!boardKey) {
              toastService.push({
                type: 'error',
                message: 'Encryption key not found',
                detail: 'You need the board share link to edit comments in this encrypted board.',
                durationMs: UIConfig.TOAST_DURATION_MS,
                dedupeKey: 'encryption-key-missing-comment-edit',
              });
              return;
            }

            try {
              encryptedContent = await encryptedBoardService.encryptContent(validated, boardKey);
            } catch (error) {
              logger.error('App', 'Failed to encrypt comment edit', error);
              toastService.push({
                type: 'error',
                message: 'Failed to encrypt comment edit',
                detail: error instanceof Error ? error.message : String(error),
                durationMs: UIConfig.TOAST_DURATION_MS,
                dedupeKey: 'encryption-failed-comment-edit',
              });
              return;
            }
          }

          const unsigned = nostrService.buildCommentEditEvent({
            rootPostEventId: post.nostrEventId,
            targetCommentEventId: target.nostrEventId,
            content: validated,
            pubkey: userState.identity.pubkey,
            encryptedContent,
          });
          const signed = await identityService.signEvent(unsigned);
          await nostrService.publishSignedEvent(signed);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          toastService.push({
            type: 'error',
            message: 'Failed to publish comment edit to Nostr (saved locally)',
            detail: `${errMsg} — ${getRelayHint()}`,
            durationMs: UIConfig.TOAST_DURATION_MS,
            dedupeKey: `comment-edit-failed-${commentId}`,
          });
        }
      }
    },
    [getRelayHint, postsById, boardsById, userState.identity, setPosts],
  );

  const handleDeleteComment = useCallback(
    async (postId: string, commentId: string) => {
      const post = postsById.get(postId);
      const target = post?.comments.find((comment) => comment.id === commentId);
      if (!post || !target) return;

      setPosts((prev) =>
        prev.map((candidate) => {
          if (candidate.id !== postId) return candidate;
          return {
            ...candidate,
            comments: candidate.comments.map((comment) =>
              comment.id === commentId
                ? {
                    ...comment,
                    isDeleted: true,
                    deletedAt: Date.now(),
                    content: '[deleted]',
                    author: '[deleted]',
                    authorPubkey: undefined,
                  }
                : comment,
            ),
          };
        }),
      );

      if (
        userState.identity &&
        post.nostrEventId &&
        target.nostrEventId &&
        target.authorPubkey === userState.identity.pubkey
      ) {
        try {
          const unsigned = nostrService.buildCommentDeleteEvent({
            rootPostEventId: post.nostrEventId,
            targetCommentEventId: target.nostrEventId,
            pubkey: userState.identity.pubkey,
          });
          const signed = await identityService.signEvent(unsigned);
          await nostrService.publishSignedEvent(signed);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          toastService.push({
            type: 'error',
            message: 'Failed to publish comment delete to Nostr (deleted locally)',
            detail: `${errMsg} — ${getRelayHint()}`,
            durationMs: UIConfig.TOAST_DURATION_MS,
            dedupeKey: `comment-delete-failed-${commentId}`,
          });
        }
      }
    },
    [getRelayHint, postsById, userState.identity, setPosts],
  );

  return {
    handleComment,
    handleEditComment,
    handleDeleteComment,
  };
}
