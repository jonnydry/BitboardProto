import React, { useCallback } from 'react';
import type { Post, Comment } from '../types';
import { votingService, computeOptimisticUpdate, computeRollback } from '../services/votingService';
import { useUserStore } from '../stores/userStore';
import { usePostStore } from '../stores/postStore';

export function useCommentVoting(args: {
  postsById: Map<string, Post>;
}) {
  const { postsById } = args;

  // Use selective Zustand selectors instead of full userState object
  const userBits = useUserStore((state) => state.userState.bits);
  const userIdentity = useUserStore((state) => state.userState.identity);
  const votedComments = useUserStore((state) => state.userState.votedComments ?? {});
  const setUserState = useUserStore((state) => state.setUserState);
  
  // Use targeted post update instead of array mapping
  const updatePost = usePostStore((state) => state.updatePost);
  const getPost = usePostStore((state) => (id: string) => state.posts.find(p => p.id === id));

  const handleCommentVote = useCallback(
    async (postId: string, commentId: string, direction: 'up' | 'down') => {
      const post = postsById.get(postId);
      if (!post) return;

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
      if (!comment) return;

      const currentVote = votedComments[commentId];

      if (!userIdentity) {
        console.warn('[CommentVote] No identity - connect an identity to vote.');
        return;
      }

      if (!currentVote && userBits <= 0) {
        return;
      }

      const optimisticUpdate = computeOptimisticUpdate(
        currentVote ?? null,
        direction,
        userBits,
        votedComments,
        commentId
      );

      setUserState((prev) => ({
        ...prev,
        bits: optimisticUpdate.newBits,
        votedComments: optimisticUpdate.newVotedPosts ?? {}, // Reusing newVotedPosts field
      }));

      // Update comment score optimistically - use targeted update
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

      // Use targeted update instead of array mapping
      const updatedComments = updateCommentInTree(post.comments);
      updatePost(postId, {
        comments: updatedComments,
      });

      if (userIdentity && comment.nostrEventId) {
        try {
          const result = await votingService.castVote(
            comment.nostrEventId,
            direction,
            userIdentity,
            comment.authorPubkey
          );

          if (result.success && result.newTally) {
            // Get latest post from store to ensure we have current comments
            const currentPost = getPost(postId) || post;
            
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

            // Use targeted update instead of array mapping
            const updatedCommentsWithTally = updateCommentWithTally(currentPost.comments);
            updatePost(postId, {
              comments: updatedCommentsWithTally,
            });
          } else if (result.error) {
            console.error('[CommentVote] Failed:', result.error);
            const rollback = computeRollback(optimisticUpdate, votedComments, commentId);
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

            // Get latest post from store for rollback
            const currentPostForRollback = getPost(postId) || post;
            // Use targeted update for rollback
            const rolledBackComments = rollbackCommentScore(currentPostForRollback.comments);
            updatePost(postId, {
              comments: rolledBackComments,
            });
          }
        } catch (error) {
          console.error('[CommentVote] Error publishing:', error);
          // Best-effort rollback for publish exceptions
          const rollback = computeRollback(optimisticUpdate, votedComments, commentId);
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

          // Get latest post from store for rollback
          const currentPostForRollback = getPost(postId) || post;
          // Use targeted update for rollback
          const rolledBackComments = rollbackCommentScore(currentPostForRollback.comments);
          updatePost(postId, {
            comments: rolledBackComments,
          });
        }
      }
    },
    [postsById, updatePost, setUserState, votedComments, userBits, userIdentity, getPost]
  );

  return { handleCommentVote };
}

