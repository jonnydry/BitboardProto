import React, { useCallback } from 'react';
import type { Post, UserState, Comment } from '../types';
import { votingService, computeOptimisticUpdate, computeRollback } from '../services/votingService';

export function useCommentVoting(args: {
  postsById: Map<string, Post>;
  userState: UserState;
  setUserState: React.Dispatch<React.SetStateAction<UserState>>;
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
}) {
  const { postsById, userState, setUserState, setPosts } = args;

  const handleCommentVote = useCallback(
    async (postId: string, commentId: string, direction: 'up' | 'down') => {
      // #region agent log
      console.log('[DEBUG] handleCommentVote called:', { postId, commentId, direction });
      fetch('http://127.0.0.1:7242/ingest/ff94bf1c-806f-4431-afc5-ee25db8c5162',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCommentVoting.ts:handleCommentVote',message:'Comment vote attempt',data:{postId,commentId,direction,hasVotedComments:!!userState.votedComments,votedCommentsType:typeof userState.votedComments,currentVote:userState.votedComments?.[commentId]},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A-missing-votedComments'})}).catch(()=>{});
      // #endregion
      const post = postsById.get(postId);
      if (!post) {
        console.warn('[DEBUG] handleCommentVote: Post not found:', postId);
        return;
      }

      // Find the comment in the post's comment tree
      const findComment = (comments: Comment[], targetId: string): Comment | null => {
        for (const comment of comments) {
          if (comment.id === targetId) return comment;
          if (comment.replies) {
            const found = findComment(comment.replies, targetId);
            if (found) return found;
          }
        }
        return null;
      };

      const comment = findComment(post.comments, commentId);
      if (!comment) {
        console.warn('[DEBUG] handleCommentVote: Comment not found:', commentId);
        return;
      }
      console.log('[DEBUG] handleCommentVote: Found comment:', { id: comment.id, nostrEventId: comment.nostrEventId });

      const currentUserState = userState;
      const currentVote = currentUserState.votedComments?.[commentId];
      console.log('[DEBUG] handleCommentVote: Current state:', { hasIdentity: !!currentUserState.identity, bits: currentUserState.bits, currentVote });

      if (!currentUserState.identity) {
        console.warn('[CommentVote] No identity - connect an identity to vote.');
        return;
      }

      if (!currentVote && currentUserState.bits <= 0) {
        console.warn('[CommentVote] Insufficient bits');
        return;
      }
      console.log('[DEBUG] handleCommentVote: Proceeding with optimistic update');

      const optimisticUpdate = computeOptimisticUpdate(
        currentVote ?? null,
        direction,
        currentUserState.bits,
        currentUserState.votedComments ?? {},
        commentId
      );

      setUserState((prev) => ({
        ...prev,
        bits: optimisticUpdate.newBits,
        votedComments: optimisticUpdate.newVotedPosts ?? {}, // Reusing newVotedPosts field
      }));

      // Update comment score optimistically
      const updateCommentInTree = (comments: Comment[]): Comment[] => {
        return comments.map((c) => {
          if (c.id === commentId) {
            return {
              ...c,
              score: (c.score || 0) + optimisticUpdate.scoreDelta,
            };
          }
          if (c.replies) {
            return {
              ...c,
              replies: updateCommentInTree(c.replies),
            };
          }
          return c;
        });
      };

      setPosts((currentPosts) =>
        currentPosts.map((p) =>
          p.id === postId
            ? {
                ...p,
                comments: updateCommentInTree(p.comments),
              }
            : p
        )
      );

      if (currentUserState.identity && comment.nostrEventId) {
        try {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/ff94bf1c-806f-4431-afc5-ee25db8c5162',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useCommentVoting.ts:castVote',message:'FIX APPLIED: Changed castCommentVote to castVote',data:{commentNostrEventId:comment.nostrEventId,direction,runId:'post-fix'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B-missing-castCommentVote'})}).catch(()=>{});
          // #endregion
          const result = await votingService.castVote(
            comment.nostrEventId,
            direction,
            currentUserState.identity,
            comment.authorPubkey
          );

          if (result.success && result.newTally) {
            // Update comment with verified vote data
            const updateCommentWithTally = (comments: Comment[]): Comment[] => {
              return comments.map((c) => {
                if (c.id === commentId) {
                  return {
                    ...c,
                    upvotes: result.newTally!.upvotes,
                    downvotes: result.newTally!.downvotes,
                    score: result.newTally!.score,
                    uniqueVoters: result.newTally!.uniqueVoters,
                    votesVerified: true,
                  };
                }
                if (c.replies) {
                  return {
                    ...c,
                    replies: updateCommentWithTally(c.replies),
                  };
                }
                return c;
              });
            };

            setPosts((currentPosts) =>
              currentPosts.map((p) =>
                p.id === postId
                  ? {
                      ...p,
                      comments: updateCommentWithTally(p.comments),
                    }
                  : p
              )
            );
          } else if (result.error) {
            console.error('[CommentVote] Failed:', result.error);
            const rollback = computeRollback(optimisticUpdate, currentUserState.votedComments ?? {}, commentId);
            setUserState((prev) => ({
              ...prev,
              bits: prev.bits + rollback.bitAdjustment,
              votedComments: rollback.previousVotedPosts ?? {}, // Reusing previousVotedPosts field
            }));

            // Rollback comment score
            const rollbackCommentScore = (comments: Comment[]): Comment[] => {
              return comments.map((c) => {
                if (c.id === commentId) {
                  return {
                    ...c,
                    score: (c.score || 0) + rollback.scoreDelta,
                  };
                }
                if (c.replies) {
                  return {
                    ...c,
                    replies: rollbackCommentScore(c.replies),
                  };
                }
                return c;
              });
            };

            setPosts((currentPosts) =>
              currentPosts.map((p) =>
                p.id === postId
                  ? {
                      ...p,
                      comments: rollbackCommentScore(p.comments),
                    }
                  : p
              )
            );
          }
        } catch (error) {
          console.error('[CommentVote] Error publishing:', error);
          // Best-effort rollback for publish exceptions
          const rollback = computeRollback(optimisticUpdate, currentUserState.votedComments ?? {}, commentId);
          setUserState((prev) => ({
            ...prev,
            bits: prev.bits + rollback.bitAdjustment,
            votedComments: rollback.previousVotedPosts ?? {},
          }));

          const rollbackCommentScore = (comments: Comment[]): Comment[] => {
            return comments.map((c) => {
              if (c.id === commentId) {
                return {
                  ...c,
                  score: (c.score || 0) + rollback.scoreDelta,
                };
              }
              if (c.replies) {
                return {
                  ...c,
                  replies: rollbackCommentScore(c.replies),
                };
              }
              return c;
            });
          };

          setPosts((currentPosts) =>
            currentPosts.map((p) =>
              p.id === postId
                ? {
                    ...p,
                    comments: rollbackCommentScore(p.comments),
                  }
                : p
            )
          );
        }
      }
    },
    [postsById, setPosts, setUserState, userState]
  );

  return { handleCommentVote };
}

