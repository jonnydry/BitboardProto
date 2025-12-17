import { useState, useEffect, useMemo } from 'react';
import type { Post, Board, Comment } from '../types';
import { encryptedBoardService } from '../services/encryptedBoardService';

/**
 * Hook to decrypt encrypted posts and comments
 * Returns posts with decrypted content if keys are available
 * Uses async decryption with loading state
 */
export function usePostDecryption(
  posts: Post[],
  boardsById: Map<string, Board>
): Post[] {
  const [decryptedCache, setDecryptedCache] = useState<Map<string, { title: string; content: string }>>(new Map());
  const [decryptedCommentCache, setDecryptedCommentCache] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    // Decrypt all encrypted posts that have keys
    const decryptPromises = posts
      .filter((post) => post.isEncrypted)
      .map(async (post) => {
        const board = boardsById.get(post.boardId);
        if (!board?.isEncrypted) return null;

        const boardKey = encryptedBoardService.getBoardKey(post.boardId);
        if (!boardKey) return null;

        try {
          // Only decrypt if we have encrypted fields
          let decryptedTitle = post.title;
          let decryptedContent = post.content;
          
          if (post.encryptedTitle) {
            decryptedTitle = await encryptedBoardService.decryptContent(post.encryptedTitle, boardKey);
          }
          
          if (post.encryptedContent) {
            decryptedContent = await encryptedBoardService.decryptContent(post.encryptedContent, boardKey);
          }

          return {
            postId: post.id,
            title: decryptedTitle,
            content: decryptedContent,
          };
        } catch (error) {
          console.error('[usePostDecryption] Failed to decrypt post:', error);
          return null;
        }
      });

    // Decrypt all encrypted comments
    const commentDecryptPromises: Promise<{ commentId: string; content: string } | null>[] = [];
    posts.forEach((post) => {
      const board = boardsById.get(post.boardId);
      if (!board?.isEncrypted) return;

      const boardKey = encryptedBoardService.getBoardKey(post.boardId);
      if (!boardKey) return;

      const decryptComment = async (comment: Comment): Promise<{ commentId: string; content: string } | null> => {
        if (!comment.isEncrypted || !comment.encryptedContent) return null;
        try {
          const decrypted = await encryptedBoardService.decryptContent(comment.encryptedContent, boardKey);
          return { commentId: comment.id, content: decrypted };
        } catch (error) {
          console.error('[usePostDecryption] Failed to decrypt comment:', error);
          return null;
        }
      };

      const decryptCommentsRecursive = (comments: Comment[]) => {
        comments.forEach((comment) => {
          commentDecryptPromises.push(decryptComment(comment));
          if (comment.replies) {
            decryptCommentsRecursive(comment.replies);
          }
        });
      };

      decryptCommentsRecursive(post.comments);
    });

    Promise.all([...decryptPromises, ...commentDecryptPromises]).then((results) => {
      const newCache = new Map<string, { title: string; content: string }>();
      const newCommentCache = new Map<string, string>();
      
      results.forEach((result) => {
        if (!result) return;
        if ('postId' in result) {
          newCache.set(result.postId, { title: result.title, content: result.content });
        } else if ('commentId' in result) {
          newCommentCache.set(result.commentId, result.content);
        }
      });
      
      setDecryptedCache(newCache);
      setDecryptedCommentCache(newCommentCache);
    });
  }, [posts, boardsById]);

  return useMemo(() => {
    return posts.map((post) => {
      // Decrypt post content if encrypted
      let decryptedPost = post;
      if (post.isEncrypted) {
        const decrypted = decryptedCache.get(post.id);
        if (decrypted) {
          decryptedPost = {
            ...post,
            title: decrypted.title,
            content: decrypted.content,
          };
        }
      }

      // Decrypt comments if encrypted
      const decryptCommentsRecursive = (comments: Comment[]): Comment[] => {
        return comments.map((comment) => {
          if (comment.isEncrypted && comment.encryptedContent) {
            const decryptedContent = decryptedCommentCache.get(comment.id);
            if (decryptedContent) {
              return {
                ...comment,
                content: decryptedContent,
              };
            }
          }
          const updatedComment = { ...comment };
          if (comment.replies) {
            updatedComment.replies = decryptCommentsRecursive(comment.replies);
          }
          return updatedComment;
        });
      };

      return {
        ...decryptedPost,
        comments: decryptCommentsRecursive(decryptedPost.comments),
      };
    });
  }, [posts, decryptedCache, decryptedCommentCache]);
}

