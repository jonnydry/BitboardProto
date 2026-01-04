import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { Post, Board, Comment } from '../types';
import { encryptedBoardService } from '../services/encryptedBoardService';
import { toastService } from '../services/toastService';
import { UIConfig } from '../config';

interface DecryptionState {
  posts: Post[];
  failedBoardIds: Set<string>;
  removeFailedKey: (boardId: string) => void;
}

/**
 * Hook to decrypt encrypted posts and comments
 * Returns posts with decrypted content if keys are available
 * Uses async decryption with loading state and caching to prevent re-decryption
 * Tracks decryption failures and provides option to remove invalid keys
 */
export function usePostDecryption(
  posts: Post[],
  boardsById: Map<string, Board>
): DecryptionState {
  const [decryptedCache, setDecryptedCache] = useState<Map<string, { title: string; content: string }>>(new Map());
  const [decryptedCommentCache, setDecryptedCommentCache] = useState<Map<string, string>>(new Map());
  const [failedBoardIds, setFailedBoardIds] = useState<Set<string>>(new Set());
  
  // Track which posts/comments we've already attempted to decrypt to avoid re-processing
  const processedPostsRef = useRef<Set<string>>(new Set());
  const processedCommentsRef = useRef<Set<string>>(new Set());
  const notifiedBoardsRef = useRef<Set<string>>(new Set());

  // Function to remove a failed key and retry
  const removeFailedKey = useCallback((boardId: string) => {
    encryptedBoardService.removeBoardKey(boardId);
    
    // Clear the failure tracking so we don't show error again
    setFailedBoardIds(prev => {
      const next = new Set(prev);
      next.delete(boardId);
      return next;
    });
    
    // Clear processed posts for this board so they can be retried with new key
    const postsToRetry = posts.filter(p => p.boardId === boardId);
    postsToRetry.forEach(p => {
      processedPostsRef.current.delete(p.id);
      setDecryptedCache(prev => {
        const next = new Map(prev);
        next.delete(p.id);
        return next;
      });
    });
    
    notifiedBoardsRef.current.delete(boardId);
    
    toastService.push({
      type: 'success',
      message: 'Encryption key removed',
      detail: 'You can import a new share link for this board',
      durationMs: UIConfig.TOAST_DURATION_MS,
      dedupeKey: `key-removed-${boardId}`,
    });
  }, [posts]);

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
          boardId: post.boardId,
          title: decryptedTitle,
          content: decryptedContent,
          success: true,
        };
      } catch (error) {
        console.error('[usePostDecryption] Failed to decrypt post:', error);
        return {
          postId: post.id,
          boardId: post.boardId,
          success: false,
        };
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
      const newFailedBoards = new Set<string>();
      
      results.forEach((result) => {
        if (!result) return;
        
        if ('postId' in result && 'success' in result) {
          // Post decryption result
          if (result.success && 'title' in result && 'content' in result) {
            newPostCache.set(result.postId, { title: result.title, content: result.content });
          } else if (!result.success) {
            newFailedBoards.add(result.boardId);
          }
        } else if ('commentId' in result && 'content' in result) {
          // Comment decryption result
          newCommentCache.set(result.commentId, result.content);
        }
      });
      
      // Update caches if changed
      if (newPostCache.size !== decryptedCache.size || newCommentCache.size !== decryptedCommentCache.size) {
        setDecryptedCache(newPostCache);
        setDecryptedCommentCache(newCommentCache);
      }
      
      // Track and notify about failures
      if (newFailedBoards.size > 0) {
        setFailedBoardIds(prev => {
          const combined = new Set([...prev, ...newFailedBoards]);
          return combined;
        });
        
        // Show toast for new failures (only once per board)
        newFailedBoards.forEach(boardId => {
          if (!notifiedBoardsRef.current.has(boardId)) {
            notifiedBoardsRef.current.add(boardId);
            const board = boardsById.get(boardId);
            toastService.push({
              type: 'error',
              message: 'Decryption failed',
              detail: `Could not decrypt content in "${board?.name || boardId}". The key may be invalid.`,
              durationMs: UIConfig.TOAST_DURATION_MS * 2,
              dedupeKey: `decrypt-fail-${boardId}`,
            });
          }
        });
      }
    });
  }, [posts, boardsById, decryptedCache, decryptedCommentCache]);

  const decryptedPosts = useMemo(() => {
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

  return {
    posts: decryptedPosts,
    failedBoardIds,
    removeFailedKey,
  };
}

