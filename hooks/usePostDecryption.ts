import { useState, useEffect, useMemo, useRef } from 'react';
import type { Post, Board, Comment } from '../types';
import { encryptedBoardService } from '../services/encryptedBoardService';

/**
 * Hook to decrypt encrypted posts and comments
 * Returns posts with decrypted content if keys are available
 * Uses async decryption with loading state and caching to prevent re-decryption
 */
export function usePostDecryption(
  posts: Post[],
  boardsById: Map<string, Board>
): Post[] {
  const [decryptedCache, setDecryptedCache] = useState<Map<string, { title: string; content: string }>>(new Map());
  const [decryptedCommentCache, setDecryptedCommentCache] = useState<Map<string, string>>(new Map());
  
  // Track which posts/comments we've already attempted to decrypt to avoid re-processing
  const processedPostsRef = useRef<Set<string>>(new Set());
  const processedCommentsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Find posts that need decryption (encrypted and not yet processed)
    const postsToDecrypt = posts.filter((post) => {
      if (!post.isEncrypted) return false;
      if (processedPostsRef.current.has(post.id)) return false;
      
      const board = boardsById.get(post.boardId);
      if (!board?.isEncrypted) return false;
      
      const boardKey = encryptedBoardService.getBoardKey(post.boardId);
      return !!boardKey;
    });

    // Find comments that need decryption
    const commentsToDecrypt: Array<{ postId: string; comment: Comment }> = [];
    posts.forEach((post) => {
      const board = boardsById.get(post.boardId);
      if (!board?.isEncrypted) return;

      const boardKey = encryptedBoardService.getBoardKey(post.boardId);
      if (!boardKey) return;

      const collectEncryptedComments = (comments: Comment[]) => {
        comments.forEach((comment) => {
          if (comment.isEncrypted && comment.encryptedContent && !processedCommentsRef.current.has(comment.id)) {
            commentsToDecrypt.push({ postId: post.boardId, comment });
          }
          if (comment.replies) {
            collectEncryptedComments(comment.replies);
          }
        });
      };

      collectEncryptedComments(post.comments);
    });

    // Early exit if nothing to decrypt
    if (postsToDecrypt.length === 0 && commentsToDecrypt.length === 0) {
      return;
    }

    // Decrypt posts
    const decryptPromises = postsToDecrypt.map(async (post) => {
      const board = boardsById.get(post.boardId);
      const boardKey = encryptedBoardService.getBoardKey(post.boardId);
      if (!board?.isEncrypted || !boardKey) return null;

      try {
        // Mark as processed immediately to prevent re-attempts
        processedPostsRef.current.add(post.id);
        
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

    // Decrypt comments
    const commentDecryptPromises = commentsToDecrypt.map(async ({ postId, comment }) => {
      const boardKey = encryptedBoardService.getBoardKey(postId);
      if (!boardKey) return null;

      try {
        // Mark as processed immediately
        processedCommentsRef.current.add(comment.id);
        
        const decrypted = await encryptedBoardService.decryptContent(comment.encryptedContent!, boardKey);
        return { commentId: comment.id, content: decrypted };
      } catch (error) {
        console.error('[usePostDecryption] Failed to decrypt comment:', error);
        return null;
      }
    });

    Promise.all([...decryptPromises, ...commentDecryptPromises]).then((results) => {
      const newPostCache = new Map(decryptedCache);
      const newCommentCache = new Map(decryptedCommentCache);
      
      results.forEach((result) => {
        if (!result) return;
        if ('postId' in result) {
          newPostCache.set(result.postId, { title: result.title, content: result.content });
        } else if ('commentId' in result) {
          newCommentCache.set(result.commentId, result.content);
        }
      });
      
      // Only update if we actually decrypted something new
      if (newPostCache.size !== decryptedCache.size || newCommentCache.size !== decryptedCommentCache.size) {
        setDecryptedCache(newPostCache);
        setDecryptedCommentCache(newCommentCache);
      }
    });
  }, [posts, boardsById, decryptedCache, decryptedCommentCache]);

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
              const updatedComment = {
                ...comment,
                content: decryptedContent,
              };
              if (comment.replies) {
                updatedComment.replies = decryptCommentsRecursive(comment.replies);
              }
              return updatedComment;
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

