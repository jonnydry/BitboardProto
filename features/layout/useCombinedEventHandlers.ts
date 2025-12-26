import { useCallback } from 'react';
import { useUser } from './UserContext';
import { useUI } from './UIContext';
import { usePosts } from './PostsContext';
import { useBoards } from './BoardsContext';
import { Post, Board, BoardType, NOSTR_KINDS, ViewMode } from '../../types';
import { nostrService } from '../../services/nostrService';
import { identityService } from '../../services/identityService';
import { votingService } from '../../services/votingService';
import { toastService } from '../../services/toastService';
// inputValidator available for future use
import { UIConfig } from '../../config';
import { makeUniqueBoardId } from '../../services/boardIdService';
import { boardRateLimiter } from '../../services/boardRateLimiter';
import { encryptedBoardService } from '../../services/encryptedBoardService';
import type { Event as NostrEvent } from 'nostr-tools';

export const useCombinedEventHandlers = () => {
  const user = useUser();
  const ui = useUI();
  const posts = usePosts();
  const boards = useBoards();

  const getRelayHint = useCallback(() => {
    const connected = nostrService.getConnectedCount();
    const total = nostrService.getRelays().length;
    const state = connected > 0 ? 'Some relays are reachable.' : 'No relays appear reachable.';
    return `${state} Relays: ${connected}/${total}. Open relays to adjust/retry.`;
  }, []);

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
    if (user.userState.identity) {
      try {
        // Check if posting to a geohash board and include the geohash
        const targetBoard = boards.boardsById.get(newPostData.boardId);
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

        // Check if board is encrypted and encrypt content if needed
        let encryptedTitle: string | undefined;
        let encryptedContent: string | undefined;

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
            return; // Abort post creation
          }

          try {
            const encrypted = await encryptedBoardService.encryptPost(
              { title: newPostData.title, content: newPostData.content },
              boardKey
            );
            encryptedTitle = encrypted.encryptedTitle;
            encryptedContent = encrypted.encryptedContent;
            newPost.isEncrypted = true;
            newPost.encryptedTitle = encryptedTitle;
            newPost.encryptedContent = encryptedContent;
          } catch (error) {
            console.error('[CombinedEventHandlers] Failed to encrypt post:', error);
            toastService.push({
              type: 'error',
              message: 'Failed to encrypt post',
              detail: error instanceof Error ? error.message : String(error),
              durationMs: UIConfig.TOAST_DURATION_MS,
              dedupeKey: 'encryption-failed',
            });
            return; // Abort post creation
          }
        }

        const unsigned = nostrService.buildPostEvent(eventPayload, user.userState.identity.pubkey, geohash, {
          boardAddress,
          boardName: targetBoard?.name,
        });
        const signed = await identityService.signEvent(unsigned);
        const event = await nostrService.publishSignedEvent(signed);
        newPost.nostrEventId = event.id;
        newPost.id = event.id;
      } catch (error) {
        console.error('[CombinedEventHandlers] Failed to publish post to Nostr:', error);
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

    posts.setPosts(prev => [newPost, ...prev]);
    ui.setViewMode(ViewMode.FEED);
  }, [user.userState.identity, boards.boardsById, getRelayHint, posts, ui]);

  const handleCreateBoard = useCallback(async (newBoardData: Omit<Board, 'id' | 'memberCount' | 'nostrEventId'>) => {
    // Require identity for board creation
    if (!user.userState.identity) {
      toastService.push({
        type: 'error',
        message: 'Identity required to create boards',
        detail: 'Please connect your Nostr identity first',
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'create-board-no-identity',
      });
      return;
    }

    // Check rate limit
    const rateCheck = boardRateLimiter.canCreateBoard(user.userState.identity.pubkey);
    if (!rateCheck.allowed) {
      const resetIn = rateCheck.resetAt ? boardRateLimiter.formatResetTime(rateCheck.resetAt) : 'later';
      toastService.push({
        type: 'error',
        message: 'Board creation limit reached',
        detail: `You can create ${boardRateLimiter.getLimit()} boards per day. Try again in ${resetIn}.`,
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'create-board-rate-limit',
      });
      return;
    }

    const existingIds = new Set<string>([...boards.boards, ...ui.locationBoards].map(b => b.id));
    const id = makeUniqueBoardId(newBoardData.name, existingIds);

    const newBoard: Board = {
      ...newBoardData,
      id,
      memberCount: 1,
      createdBy: user.userState.identity.pubkey,
    };

    // Publish to Nostr
    try {
      const unsigned = nostrService.buildBoardEvent(newBoard, user.userState.identity.pubkey);
      const signed = await identityService.signEvent(unsigned);
      const event = await nostrService.publishSignedEvent(signed);
      newBoard.nostrEventId = event.id;

      // Record successful creation for rate limiting
      boardRateLimiter.recordCreation(user.userState.identity.pubkey, newBoard.id);
    } catch (error) {
      console.error('[CombinedEventHandlers] Failed to publish board to Nostr:', error);
      const errMsg = error instanceof Error ? error.message : String(error);
      toastService.push({
        type: 'error',
        message: 'Failed to publish board to Nostr (saved locally)',
        detail: `${errMsg} — ${getRelayHint()}`,
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'publish-board-failed',
      });
    }

    boards.setBoards(prev => [...prev, newBoard]);
    ui.setActiveBoardId(newBoard.id);
    ui.setViewMode(ViewMode.FEED);
  }, [boards, ui, user.userState.identity, getRelayHint]);

  const handleSavePost = useCallback(
    (postId: string, updates: Partial<Post>) => {
      const existing = posts.posts.find(p => p.id === postId);
      if (!existing) return;

      const merged: Post = { ...existing, ...updates };

      // Update local state immediately (works for offline + fast UI)
      posts.setPosts((currentPosts) =>
        currentPosts.map((p) => (p.id === postId ? { ...p, ...updates } : p))
      );
      ui.setEditingPostId(null);
      ui.setViewMode(ViewMode.FEED);

      // If this post is on Nostr and we have an identity, publish an edit companion event.
      if (existing.nostrEventId && user.userState.identity) {
        (async () => {
          try {
            // Check if board is encrypted and encrypt content if needed
            const board = boards.boardsById.get(existing.boardId);
            // TODO: Use encrypted values in buildPostEditEvent when encryption support is added
            let _encryptedTitle: string | undefined;
            let _encryptedContent: string | undefined;

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
                  boardKey
                );
                _encryptedTitle = encrypted.encryptedTitle;
                _encryptedContent = encrypted.encryptedContent;
              } catch (error) {
                console.error('[CombinedEventHandlers] Failed to encrypt post edit:', error);
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
              pubkey: user.userState.identity!.pubkey,
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
            console.error('[CombinedEventHandlers] Failed to publish post edit to Nostr:', error);
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
      } else if (existing.nostrEventId && !user.userState.identity) {
        toastService.push({
          type: 'info',
          message: 'Edit saved locally. Connect an identity to publish to Nostr.',
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: `post-edit-local-only-${existing.nostrEventId}`,
        });
      }
    },
    [posts, ui, user.userState.identity, boards.boardsById, getRelayHint]
  );

  const handleDeletePost = useCallback(async (postId: string) => {
    const post = posts.posts.find(p => p.id === postId);
    if (!post) return;

    // Check ownership
    if (user.userState.identity && post.authorPubkey && post.authorPubkey !== user.userState.identity.pubkey) {
      toastService.push({
        type: 'error',
        message: 'Cannot delete post',
        detail: 'You can only delete your own posts.',
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'delete-post-not-owner',
      });
      return;
    }

    // Remove from local state immediately
    posts.setPosts(currentPosts => currentPosts.filter(p => p.id !== postId));
    // Also remove from bookmarks if bookmarked
    user.handleToggleBookmark(postId);
    ui.setEditingPostId(null);
    ui.setViewMode(ViewMode.FEED);

    // TODO: Implement NIP-09 delete event for posts
    // For now, just delete locally
    toastService.push({
      type: 'success',
      message: 'Post deleted locally',
      durationMs: UIConfig.TOAST_DURATION_MS,
      dedupeKey: `post-deleted-local-${postId}`,
    });
  }, [posts, user, ui]);

  const loadMorePosts = useCallback(async () => {
    if (!posts.oldestTimestamp || !posts.hasMorePosts) return;

    try {
      // Fetch posts older than the current oldest
      const loadMoreLimit = UIConfig.POSTS_LOAD_MORE_COUNT;
      const olderPosts = await nostrService.fetchPosts({
        limit: loadMoreLimit,
        until: Math.floor(posts.oldestTimestamp / 1000) - 1, // Convert to seconds, get older posts
      });

      if (olderPosts.length > 0) {
        const convertedPosts = olderPosts.map(event => nostrService.eventToPost(event));

        // Fetch votes for new posts
        const postsWithNostrIds = convertedPosts.filter(p => p.nostrEventId);
        const postIds = postsWithNostrIds.map(p => p.nostrEventId!);
        const voteTallies = await votingService.fetchVotesForPosts(postIds);

        const postsWithVotes = convertedPosts.map((post) => {
          if (post.nostrEventId) {
            const tally = voteTallies.get(post.nostrEventId);
            if (tally) {
              return {
                ...post,
                upvotes: tally.upvotes,
                downvotes: tally.downvotes,
                score: tally.score,
                uniqueVoters: tally.uniqueVoters,
                votesVerified: true,
              };
            }
          }
          return post;
        });

        // Fetch and apply latest post edits
        try {
          const editEvents = await nostrService.fetchPostEdits(postIds, { limit: 300 });
          if (editEvents.length > 0) {
            const latestByRoot = new Map<string, { created_at: number; event: NostrEvent }>();
            for (const ev of editEvents) {
              const parsed = nostrService.eventToPostEditUpdate(ev);
              if (!parsed) continue;
              const existing = latestByRoot.get(parsed.rootPostEventId);
              if (!existing || ev.created_at > existing.created_at) {
                latestByRoot.set(parsed.rootPostEventId, { created_at: ev.created_at, event: ev });
              }
            }

            for (let i = 0; i < postsWithVotes.length; i++) {
              const p = postsWithVotes[i];
              const rootId = p.nostrEventId;
              if (!rootId) continue;
              const latest = latestByRoot.get(rootId);
              if (!latest) continue;
              const parsed = nostrService.eventToPostEditUpdate(latest.event);
              if (!parsed) continue;
              postsWithVotes[i] = { ...p, ...parsed.updates };
            }
          }
        } catch (err) {
          console.warn('[CombinedEventHandlers] Failed to fetch post edits for pagination:', err);
        }

        posts.setPosts(prev => {
          const existingIds = new Set(prev.map(p => p.nostrEventId).filter(Boolean));
          const newPosts = postsWithVotes.filter(p => !existingIds.has(p.nostrEventId));
          return [...prev, ...newPosts];
        });

        // Update oldest timestamp
        const timestamps = postsWithVotes.map(p => p.timestamp);
        if (timestamps.length > 0) {
          posts.setOldestTimestamp(Math.min(...timestamps));
        }

        // Check if there might be more
        posts.setHasMorePosts(olderPosts.length >= loadMoreLimit);
      } else {
        posts.setHasMorePosts(false);
      }
    } catch (error) {
      console.error('[CombinedEventHandlers] Failed to load more posts:', error);
      toastService.push({
        type: 'error',
        message: 'Failed to load more posts',
        detail: error instanceof Error ? error.message : String(error),
        durationMs: UIConfig.TOAST_DURATION_MS,
        dedupeKey: 'load-more-failed',
      });
    }
  }, [posts]);

  return {
    handleCreatePost,
    handleCreateBoard,
    handleSavePost,
    handleDeletePost,
    loadMorePosts,
  };
};
