import { useEffect } from 'react';
import type { Post } from '../types';
import { nostrService } from '../services/nostrService';

export function useCommentsLoader(args: {
  selectedBitId: string | null;
  postsById: Map<string, Post>;
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
}) {
  const { selectedBitId, postsById, setPosts } = args;

  useEffect(() => {
    if (!selectedBitId) return;

    const post = postsById.get(selectedBitId);
    if (!post?.nostrEventId) return;

    // Only fetch if post has no comments loaded yet
    if (post.comments.length > 0) return;

    let cancelled = false;

    nostrService
      .fetchComments(post.nostrEventId)
      .then((commentEvents) => {
        if (cancelled) return;
        if (commentEvents.length === 0) return;

        const comments = commentEvents.map((event) => nostrService.eventToComment(event));

        setPosts((prevPosts) =>
          prevPosts.map((p) => {
            if (p.id !== selectedBitId) return p;
            return {
              ...p,
              comments: [...p.comments, ...comments],
              commentCount: p.comments.length + comments.length,
            };
          })
        );
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('[App] Failed to fetch comments:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [postsById, selectedBitId, setPosts]);
}
