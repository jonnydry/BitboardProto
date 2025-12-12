import { useEffect } from 'react';
import type { Board, Post } from '../types';
import { UIConfig } from '../config';
import { nostrService } from '../services/nostrService';
import { votingService } from '../services/votingService';

export function useNostrFeed(args: {
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  setBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  setIsNostrConnected: React.Dispatch<React.SetStateAction<boolean>>;
  setOldestTimestamp: React.Dispatch<React.SetStateAction<number | null>>;
  setHasMorePosts: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { setPosts, setBoards, setIsNostrConnected, setOldestTimestamp, setHasMorePosts } = args;

  // Initialize Nostr connection and fetch posts
  useEffect(() => {
    const initNostr = async () => {
      try {
        const initialLimit = UIConfig.INITIAL_POSTS_COUNT;
        const nostrPosts = await nostrService.fetchPosts({ limit: initialLimit });

        if (nostrPosts.length > 0) {
          const convertedPosts = nostrPosts.map((event) => nostrService.eventToPost(event));

          // Batch fetch cryptographically verified votes for all posts
          const postsWithNostrIds = convertedPosts.filter((p) => p.nostrEventId);
          const postIds = postsWithNostrIds.map((p) => p.nostrEventId!);
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

          setPosts((prev) => {
            const existingIds = new Set(prev.map((p) => p.nostrEventId).filter(Boolean));
            const newPosts = postsWithVotes.filter((p) => !existingIds.has(p.nostrEventId));
            return [...prev, ...newPosts];
          });

          const timestamps = postsWithVotes.map((p) => p.timestamp);
          if (timestamps.length > 0) {
            setOldestTimestamp(Math.min(...timestamps));
          }

          setHasMorePosts(nostrPosts.length >= initialLimit);
        } else {
          setHasMorePosts(false);
        }

        const nostrBoards = await nostrService.fetchBoards();
        if (nostrBoards.length > 0) {
          const convertedBoards = nostrBoards.map((event) => nostrService.eventToBoard(event));
          setBoards((prev) => {
            const existingIds = new Set(prev.map((b) => b.id));
            const newBoards = convertedBoards.filter((b) => !existingIds.has(b.id));
            return [...prev, ...newBoards];
          });
        }

        setIsNostrConnected(true);
      } catch (error) {
        console.error('[App] Failed to initialize Nostr:', error);
        setIsNostrConnected(false);
      }
    };

    initNostr();

    // Subscribe to real-time updates
    const subId = nostrService.subscribeToFeed((event) => {
      const post = nostrService.eventToPost(event);
      setPosts((prev) => {
        if (prev.some((p) => p.nostrEventId === post.nostrEventId)) return prev;
        return [post, ...prev];
      });
    });

    return () => {
      nostrService.unsubscribe(subId);
    };
  }, [setBoards, setHasMorePosts, setIsNostrConnected, setOldestTimestamp, setPosts]);

  // Cleanup on unmount and beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      nostrService.cleanup();
      votingService.cleanup();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      nostrService.cleanup();
      votingService.cleanup();
    };
  }, []);
}
