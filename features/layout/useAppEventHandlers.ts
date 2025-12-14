import React, { useCallback } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { Post, UserState, ViewMode, Board, NostrIdentity } from '../../types';
import { BoardType, NOSTR_KINDS } from '../../types';
import { nostrService } from '../../services/nostrService';
import { identityService } from '../../services/identityService';
import { votingService } from '../../services/votingService';
import { toastService } from '../../services/toastService';
import { inputValidator } from '../../services/inputValidator';
import { UIConfig } from '../../config';
import { makeUniqueBoardId } from '../../services/boardIdService';

interface UseAppEventHandlersProps {
  posts: Post[];
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  boards: Board[];
  setBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  boardsById: Map<string, Board>;
  postsById: Map<string, Post>;
  userState: UserState;
  setUserState: React.Dispatch<React.SetStateAction<UserState>>;
  setViewMode: (mode: ViewMode) => void;
  setSelectedBitId: (id: string | null) => void;
  setActiveBoardId: (id: string | null) => void;
  setLocationBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  setProfileUser: (user: { username: string; pubkey?: string } | null) => void;
  setEditingPostId: (id: string | null) => void;
  getRelayHint: () => string;
  setSearchQuery: (query: string) => void;
  oldestTimestamp: number | null;
  hasMorePosts: boolean;
}

export const useAppEventHandlers = ({
  posts,
  setPosts,
  boards,
  setBoards,
  boardsById,
  postsById,
  userState,
  setUserState,
  setViewMode,
  setSelectedBitId,
  setActiveBoardId,
  setLocationBoards,
  setProfileUser,
  setEditingPostId,
  getRelayHint,
  setSearchQuery,
  oldestTimestamp,
  hasMorePosts,
}: UseAppEventHandlersProps) => {

  const handleCreatePost = useCallback(async (
    newPostData: Omit<Post, 'id' | 'timestamp' | 'score' | 'commentCount' | 'comments' | 'nostrEventId' | 'upvotes' | 'downvotes'>
  ) => {
    const timestamp = Date.now();

    const newPost: Post = {
      ...newPostData,
      id: `local-${Date.now()}`,
      timestamp,
      score: 1,
      commentCount: 0,
      comments: [],
      upvotes: 1,
      downvotes: 0,
    };

    // Publish to Nostr if identity exists
    if (userState.identity) {
      try {
        // Check if posting to a geohash board and include the geohash
        const targetBoard = boardsById.get(newPostData.boardId);
        const geohash = targetBoard?.type === BoardType.GEOHASH ? targetBoard.geohash : undefined;
        const boardAddress =
          targetBoard?.createdBy
            ? `${NOSTR_KINDS.BOARD_DEFINITION}:${targetBoard.createdBy}:${targetBoard.id}`
            : undefined;

        const eventPayload = {
          ...newPostData,
          timestamp,
          upvotes: 0,
          downvotes: 0,
        };

        const unsigned = nostrService.buildPostEvent(eventPayload, userState.identity.pubkey, geohash, {
          boardAddress,
          boardName: targetBoard?.name,
        });
        const signed = await identityService.signEvent(unsigned);
        const event = await nostrService.publishSignedEvent(signed);
        newPost.nostrEventId = event.id;
        newPost.id = event.id;
      } catch (error) {
        console.error('[App] Failed to publish post to Nostr:', error);
        const errMsg = error instanceof Error ? error.message : String(error);
        toastService.push({
          type: 'error',
          message: 'Failed to publish post to Nostr (saved locally)',
          detail: `${errMsg} — ${getRelayHint()}`,
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: 'publish-post-failed',
        });
      }
    }

    setPosts(prev => [newPost, ...prev]);
    setViewMode(ViewMode.FEED);
  }, [userState.identity, boardsById, getRelayHint, setPosts, setViewMode]);

  const handleCreateBoard = useCallback(async (newBoardData: Omit<Board, 'id' | 'memberCount' | 'nostrEventId'>) => {
    const existingIds = new Set<string>([...boards, ...boards].map(b => b.id)); // Note: should be locationBoards, but using boards for now
    const id = makeUniqueBoardId(newBoardData.name, existingIds);

    const newBoard: Board = {
      ...newBoardData,
      id,
      memberCount: 1,
      createdBy: userState.identity?.pubkey,
    };

    // Publish to Nostr if identity exists
    if (userState.identity) {
      try {
        const unsigned = nostrService.buildBoardEvent(newBoard, userState.identity.pubkey);
        const signed = await identityService.signEvent(unsigned);
        const event = await nostrService.publishSignedEvent(signed);
        newBoard.nostrEventId = event.id;
      } catch (error) {
        console.error('[App] Failed to publish board to Nostr:', error);
        const errMsg = error instanceof Error ? error.message : String(error);
        toastService.push({
          type: 'error',
          message: 'Failed to publish board to Nostr (saved locally)',
          detail: `${errMsg} — ${getRelayHint()}`,
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: 'publish-board-failed',
        });
      }
    }

    setBoards(prev => [...prev, newBoard]);
    setActiveBoardId(newBoard.id);
    setViewMode(ViewMode.FEED);
  }, [boards, userState.identity, getRelayHint, setBoards, setActiveBoardId, setViewMode]);

  const handleComment = useCallback(async (postId: string, content: string, parentCommentId?: string) => {
    const post = postsById.get(postId);
    if (!post) return;

    const newComment = {
      id: `c-${Date.now()}`,
      author: userState.username,
      authorPubkey: userState.identity?.pubkey,
      content: content,
      timestamp: Date.now(),
      parentId: parentCommentId, // For threaded comments
    };

    // Publish to Nostr if connected
    if (userState.identity && post.nostrEventId) {
      const parentComment = parentCommentId ? post.comments.find(c => c.id === parentCommentId) : undefined;
      const unsigned = nostrService.buildCommentEvent(
        post.nostrEventId,
        content,
        userState.identity.pubkey,
        parentCommentId,
        {
          postAuthorPubkey: post.authorPubkey,
          parentCommentAuthorPubkey: parentComment?.authorPubkey,
        }
      );
      identityService.signEvent(unsigned)
        .then(signed => nostrService.publishSignedEvent(signed))
        .then(event => {
          setPosts(prevPosts =>
            prevPosts.map(p => {
              if (p.id === postId) {
                const updatedComment = { ...newComment, id: event.id, nostrEventId: event.id };
                return {
                  ...p,
                  comments: p.comments.map(c => c.id === newComment.id ? updatedComment : c)
                };
              }
              return p;
            })
          );
        })
        .catch(error => {
          console.error('[App] Failed to publish comment to Nostr:', error);
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

    setPosts(currentPosts =>
      currentPosts.map(p => {
        if (p.id === postId) {
          return {
            ...p,
            commentCount: p.commentCount + 1,
            comments: [...p.comments, newComment]
          };
        }
        return p;
      })
    );
  }, [postsById, userState.username, userState.identity, getRelayHint, setPosts]);

  const handleEditComment = useCallback(async (postId: string, commentId: string, nextContent: string) => {
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
    const target = post?.comments.find((c) => c.id === commentId);
    if (!post || !target) return;

    // Update locally immediately
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        return {
          ...p,
          comments: p.comments.map((c) =>
            c.id === commentId ? { ...c, content: validated, editedAt: Date.now() } : c
          ),
        };
      })
    );

    // Publish comment edit companion event if possible
    if (userState.identity && post.nostrEventId && target.nostrEventId && target.authorPubkey === userState.identity.pubkey) {
      try {
        const unsigned = nostrService.buildCommentEditEvent({
          rootPostEventId: post.nostrEventId,
          targetCommentEventId: target.nostrEventId,
          content: validated,
          pubkey: userState.identity.pubkey,
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
  }, [getRelayHint, postsById, userState.identity, setPosts]);

  const handleDeleteComment = useCallback(async (postId: string, commentId: string) => {
    const post = postsById.get(postId);
    const target = post?.comments.find((c) => c.id === commentId);
    if (!post || !target) return;

    // Mark as deleted locally (preserves thread structure)
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        return {
          ...p,
          comments: p.comments.map((c) =>
            c.id === commentId
              ? { ...c, isDeleted: true, deletedAt: Date.now(), content: '[deleted]', author: '[deleted]', authorPubkey: undefined }
              : c
          ),
        };
      })
    );

    // Publish NIP-09 delete event if possible
    if (userState.identity && post.nostrEventId && target.nostrEventId && target.authorPubkey === userState.identity.pubkey) {
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
  }, [getRelayHint, postsById, userState.identity, setPosts]);

  const handleViewBit = useCallback((postId: string) => {
    setSelectedBitId(postId);
    setViewMode(ViewMode.SINGLE_BIT);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setSelectedBitId, setViewMode]);

  const navigateToBoard = useCallback((boardId: string | null) => {
    setActiveBoardId(boardId);
    setSelectedBitId(null);
    setViewMode(ViewMode.FEED);
  }, [setActiveBoardId, setSelectedBitId, setViewMode]);

  const returnToFeed = useCallback(() => {
    setSelectedBitId(null);
    setViewMode(ViewMode.FEED);
  }, [setSelectedBitId, setViewMode]);

  const handleIdentityChange = useCallback((identity: NostrIdentity | null) => {
    setUserState(prev => ({
      ...prev,
      identity: identity || undefined,
      username: identity?.displayName || prev.username,
      hasIdentity: !!identity,
    }));
  }, [setUserState]);

  const handleLocationBoardSelect = useCallback((board: Board) => {
    // Add to location boards if not already present
    setLocationBoards(prev => {
      if (prev.some(b => b.id === board.id)) return prev;
      return [...prev, board];
    });
    setActiveBoardId(board.id);
    setViewMode(ViewMode.FEED);
  }, [setLocationBoards, setActiveBoardId, setViewMode]);

  const handleViewProfile = useCallback((username: string, pubkey?: string) => {
    setProfileUser({ username, pubkey });
    setViewMode(ViewMode.USER_PROFILE);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setProfileUser, setViewMode]);

  const handleEditPost = useCallback((postId: string) => {
    setEditingPostId(postId);
    setViewMode(ViewMode.EDIT_POST);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setEditingPostId, setViewMode]);

  const handleSavePost = useCallback(
    (postId: string, updates: Partial<Post>) => {
      const existing = postsById.get(postId);
      if (!existing) return;

      const merged: Post = { ...existing, ...updates };

      // Update local state immediately (works for offline + fast UI)
      setPosts((currentPosts) =>
        currentPosts.map((p) => (p.id === postId ? { ...p, ...updates } : p))
      );
      setEditingPostId(null);
      setViewMode(ViewMode.FEED);

      // If this post is on Nostr and we have an identity, publish an edit companion event.
      if (existing.nostrEventId && userState.identity) {
        (async () => {
          try {
            const unsigned = nostrService.buildPostEditEvent({
              rootPostEventId: existing.nostrEventId,
              boardId: existing.boardId,
              title: merged.title,
              content: merged.content,
              tags: merged.tags,
              url: merged.url,
              imageUrl: merged.imageUrl,
              pubkey: userState.identity!.pubkey,
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
            console.error('[App] Failed to publish post edit to Nostr:', error);
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
    [postsById, userState.identity, getRelayHint, setPosts, setEditingPostId, setViewMode]
  );

  const handleDeletePost = useCallback((postId: string) => {
    setPosts(currentPosts => currentPosts.filter(p => p.id !== postId));
    // Also remove from bookmarks if bookmarked
    // bookmarkService.removeBookmark(postId); // Would need to import bookmarkService
    setEditingPostId(null);
    setViewMode(ViewMode.FEED);
  }, [setPosts, setEditingPostId, setViewMode]);

  const handleTagClick = useCallback((tag: string) => {
    setSearchQuery(tag);
    setActiveBoardId(null);
    setViewMode(ViewMode.FEED);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setSearchQuery, setActiveBoardId, setViewMode]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, [setSearchQuery]);

  const loadMorePosts = useCallback(async () => {
    // This would need oldestTimestamp and hasMorePosts from context
    // For now, return a placeholder implementation
    console.log('loadMorePosts called');
  }, []);

  const getBoardName = useCallback((postId: string) => {
    const post = postsById.get(postId);
    if (!post) return undefined;
    const board = boardsById.get(post.boardId);
    return board?.name;
  }, [postsById, boardsById]);

  const refreshProfileMetadata = useCallback(async (pubkeys: string[]) => {
    const unique = Array.from(new Set(pubkeys.filter(Boolean)));
    if (unique.length === 0) return;

    try {
      await nostrService.fetchProfiles(unique, { force: true });

      // Update display names across posts + comments
      setPosts((prev) =>
        prev.map((p) => {
          const nextAuthor =
            p.authorPubkey && unique.includes(p.authorPubkey)
              ? nostrService.getDisplayName(p.authorPubkey)
              : p.author;

          const nextComments = p.comments.map((c) => {
            if (!c.authorPubkey) return c;
            if (!unique.includes(c.authorPubkey)) return c;
            return { ...c, author: nostrService.getDisplayName(c.authorPubkey) };
          });

          return {
            ...p,
            author: nextAuthor,
            comments: nextComments,
          };
        })
      );

      toastService.push({
        type: 'success',
        message: 'Profile refreshed',
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: `profile-refresh-${unique.join(',')}`,
      });
    } catch (error) {
      toastService.push({
        type: 'error',
        message: 'Failed to refresh profile',
        detail: error instanceof Error ? error.message : String(error),
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: `profile-refresh-failed-${unique.join(',')}`,
      });
    }
  }, []);

  return {
    handleCreatePost,
    handleCreateBoard,
    handleComment,
    handleEditComment,
    handleDeleteComment,
    handleViewBit,
    navigateToBoard,
    returnToFeed,
    handleIdentityChange,
    handleLocationBoardSelect,
    handleViewProfile,
    handleEditPost,
    handleSavePost,
    handleDeletePost,
    handleTagClick,
    handleSearch,
    loadMorePosts,
    getBoardName,
    refreshProfileMetadata,
  };
};
