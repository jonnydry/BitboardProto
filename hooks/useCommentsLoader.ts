import React, { useEffect } from 'react';
import type { Comment, Post, UserState } from '../types';
import { nostrService } from '../services/nostrService';
import { votingService } from '../services/votingService';
import { profileService } from '../services/profileService';

type LatestCommentUpdate = {
  created_at: number;
  updates: Partial<Comment>;
};

export function useCommentsLoader(args: {
  selectedBitId: string | null;
  postsById: Map<string, Post>;
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  userState?: UserState;
  setUserState?: React.Dispatch<React.SetStateAction<UserState>>;
}) {
  const { selectedBitId, postsById, setPosts, userState, setUserState } = args;

  useEffect(() => {
    if (!selectedBitId) return;

    const post = postsById.get(selectedBitId);
    if (!post?.nostrEventId) return;

    let cancelled = false;
    const rootPostId = post.nostrEventId;

    const applyCommentUpdates = (targetCommentId: string, updates: Partial<Comment>) => {
      setPosts((prevPosts) =>
        prevPosts.map((p) => {
          if (p.id !== selectedBitId) return p;
          return {
            ...p,
            comments: p.comments.map((c) => (c.id === targetCommentId ? { ...c, ...updates } : c)),
          };
        })
      );
    };

    const applyBatchEdits = async () => {
      try {
        const [editEvents, deleteEvents] = await Promise.all([
          nostrService.fetchCommentEdits(rootPostId, { limit: 300 }),
          nostrService.fetchCommentDeletes(rootPostId, { limit: 300 }),
        ]);

        if (cancelled) return;

        if (editEvents.length > 0) {
          // Latest edit per comment wins
          const latestByComment = new Map<string, LatestCommentUpdate>();
          for (const ev of editEvents) {
            const parsed = nostrService.eventToCommentEditUpdate(ev);
            if (!parsed) continue;
            const existing = latestByComment.get(parsed.targetCommentId);
            if (!existing || ev.created_at > existing.created_at) {
              latestByComment.set(parsed.targetCommentId, { created_at: ev.created_at, updates: parsed.updates });
            }
          }
          latestByComment.forEach((v, commentId) => applyCommentUpdates(commentId, v.updates));
        }

        if (deleteEvents.length > 0) {
          const latestByComment = new Map<string, LatestCommentUpdate>();
          for (const ev of deleteEvents) {
            const parsed = nostrService.eventToCommentDeleteUpdate(ev);
            if (!parsed) continue;
            const existing = latestByComment.get(parsed.targetCommentId);
            if (!existing || ev.created_at > existing.created_at) {
              latestByComment.set(parsed.targetCommentId, { created_at: ev.created_at, updates: parsed.updates });
            }
          }
          latestByComment.forEach((v, commentId) => applyCommentUpdates(commentId, v.updates));
        }
      } catch (e) {
        console.warn('[CommentsLoader] Failed to fetch comment edits/deletes:', e);
      }
    };

    // Only fetch if post has no comments loaded yet
    const shouldFetchComments = post.comments.length === 0;

    const fetchComments = async () => {
      if (!shouldFetchComments) return;
      const commentEvents = await nostrService.fetchComments(rootPostId);
      if (cancelled) return;
      if (commentEvents.length === 0) return;

      const comments = commentEvents.map((event) => nostrService.eventToComment(event));

      // Filter muted users
      const mutedSet = new Set(userState?.mutedPubkeys || []);
      const filteredComments = comments.filter(c => !c.authorPubkey || !mutedSet.has(c.authorPubkey));

      // Fetch votes for all comments
      const commentNostrIds = filteredComments.filter(c => c.nostrEventId).map(c => c.nostrEventId!);
      const commentVoteTallies = commentNostrIds.length > 0 
        ? await votingService.fetchVotesForComments(commentNostrIds)
        : new Map();

      const commentsWithVotes = filteredComments.map(comment => {
        if (comment.nostrEventId) {
          const tally = commentVoteTallies.get(comment.nostrEventId);
          if (tally) {
            return {
              ...comment,
              upvotes: tally.upvotes,
              downvotes: tally.downvotes,
              score: tally.score,
              uniqueVoters: tally.uniqueVoters,
              votesVerified: true,
            };
          }
        }
        return { ...comment, score: comment.score ?? 0, upvotes: comment.upvotes ?? 0, downvotes: comment.downvotes ?? 0 };
      });

      setPosts((prevPosts) =>
        prevPosts.map((p) => {
          if (p.id !== selectedBitId) return p;
          // Deduplicate by id
          const existing = new Set(p.comments.map((c) => c.id));
          const newOnes = commentsWithVotes.filter((c) => !existing.has(c.id));
          if (newOnes.length === 0) return p;
          return {
            ...p,
            comments: [...p.comments, ...newOnes],
            commentCount: p.comments.length + newOnes.length,
          };
        })
      );

      // Restore user's comment votes from local storage if available
      if (userState?.identity && setUserState) {
        const userCommentVotes = votingService.getUserCommentVotes(userState.identity.pubkey);
        setUserState(prev => ({
          ...prev,
          votedComments: { ...prev.votedComments, ...Object.fromEntries(userCommentVotes) },
        }));
      }

      // Best-effort profile enrichment (kind 0) for comment authors
      // Batch prefetch to warm profileService cache before CommentThread components render
      const pubkeys = Array.from(new Set(comments.map((c) => c.authorPubkey).filter(Boolean) as string[]));
      if (pubkeys.length > 0) {
        profileService.prefetchProfiles(pubkeys).then(() => {
          setPosts((prevPosts) =>
            prevPosts.map((p) => {
              if (p.id !== selectedBitId) return p;
              return {
                ...p,
                comments: p.comments.map((c) =>
                  c.authorPubkey ? { ...c, author: nostrService.getDisplayName(c.authorPubkey) } : c
                ),
              };
            })
          );
        });
      }
    };

    (async () => {
      try {
        await fetchComments();
        if (cancelled) return;
        await applyBatchEdits();
      } catch (error) {
        if (cancelled) return;
        console.error('[App] Failed to fetch comments:', error);
      }
    })();

    // Subscribe to comment edits/deletes while this post is open
    const subEdits = nostrService.subscribeToCommentEdits(rootPostId, (ev) => {
      const parsed = nostrService.eventToCommentEditUpdate(ev);
      if (!parsed) return;
      applyCommentUpdates(parsed.targetCommentId, parsed.updates);
    });

    const subDeletes = nostrService.subscribeToCommentDeletes(rootPostId, (ev) => {
      const parsed = nostrService.eventToCommentDeleteUpdate(ev);
      if (!parsed) return;
      applyCommentUpdates(parsed.targetCommentId, parsed.updates);
    });

    return () => {
      cancelled = true;
      nostrService.unsubscribe(subEdits);
      nostrService.unsubscribe(subDeletes);
    };
  }, [postsById, selectedBitId, setPosts, userState?.identity, setUserState, userState?.mutedPubkeys]);
}
