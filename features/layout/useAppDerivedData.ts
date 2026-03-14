import { useEffect, useMemo, useRef, useState } from 'react';
import type { Board, Post } from '../../types';
import { BoardType, SortMode } from '../../types';
import { searchService } from '../../services/searchService';
import { logger } from '../../services/loggingService';

interface UseAppDerivedDataArgs {
  posts: Post[];
  postsById: Map<string, Post>;
  boardsById: Map<string, Board>;
  activeBoardId: string | null;
  feedFilter: 'all' | 'topic' | 'location' | 'following';
  followingPubkeys: string[];
  mutedPubkeys: string[];
  searchQuery: string;
  sortMode: SortMode;
  selectedBitId: string | null;
  bookmarkedIds: string[];
  reportedPostIds: string[];
  markPostAccessed: (postId: string) => void;
  setSelectedPostId: (postId: string | null) => void;
}

export function useAppDerivedData(args: UseAppDerivedDataArgs) {
  const {
    posts,
    postsById,
    boardsById,
    activeBoardId,
    feedFilter,
    followingPubkeys,
    mutedPubkeys,
    searchQuery,
    sortMode,
    selectedBitId,
    bookmarkedIds,
    reportedPostIds,
    markPostAccessed,
    setSelectedPostId,
  } = args;

  const [workerSearchIds, setWorkerSearchIds] = useState<Set<string> | null>(null);
  const lastSearchQuery = useRef('');

  useEffect(() => {
    searchService.updateIndex(posts);
  }, [posts]);

  useEffect(() => {
    const query = searchQuery.trim();

    if (query === lastSearchQuery.current) return;
    lastSearchQuery.current = query;

    if (!query) {
      setWorkerSearchIds(null);
      return;
    }

    if (searchService.isWorkerReady()) {
      searchService
        .search(query)
        .then((ids) => {
          if (lastSearchQuery.current === query) {
            setWorkerSearchIds(new Set(ids));
          }
        })
        .catch((error) => {
          logger.warn('AppContext', 'Search worker failed, falling back to main thread', error);
          setWorkerSearchIds(null);
        });
    }
  }, [searchQuery]);

  const mutedPubkeysSet = useMemo(() => new Set(mutedPubkeys), [mutedPubkeys]);
  const followingPubkeysSet = useMemo(() => new Set(followingPubkeys), [followingPubkeys]);

  const filteredPosts = useMemo(() => {
    let result = posts;

    if (activeBoardId) {
      result = result.filter((post) => post.boardId === activeBoardId);
    } else {
      result = result.filter((post) => {
        const board = boardsById.get(post.boardId);
        if (!board?.isPublic) return false;

        if (feedFilter === 'topic') return board.type === BoardType.TOPIC;
        if (feedFilter === 'location') return board.type === BoardType.GEOHASH;
        return true;
      });
    }

    if (feedFilter === 'following') {
      result = result.filter(
        (post) => !!post.authorPubkey && followingPubkeysSet.has(post.authorPubkey),
      );
    }

    if (mutedPubkeysSet.size > 0) {
      result = result.filter(
        (post) => !post.authorPubkey || !mutedPubkeysSet.has(post.authorPubkey),
      );
    }

    if (searchQuery.trim()) {
      if (workerSearchIds) {
        result = result.filter((post) => workerSearchIds.has(post.id));
      } else {
        const query = searchQuery.toLowerCase().trim();
        result = result.filter((post) => {
          const board = boardsById.get(post.boardId);
          const boardName = board?.name?.toLowerCase() ?? '';

          const inPost =
            post.title.toLowerCase().includes(query) ||
            post.content.toLowerCase().includes(query) ||
            post.author.toLowerCase().includes(query) ||
            boardName.includes(query) ||
            post.tags.some((tag) => tag.toLowerCase().includes(query));

          if (inPost) return true;

          return post.comments.some(
            (comment) =>
              comment.author.toLowerCase().includes(query) ||
              comment.content.toLowerCase().includes(query),
          );
        });
      }
    }

    return result;
  }, [
    posts,
    activeBoardId,
    boardsById,
    feedFilter,
    followingPubkeysSet,
    mutedPubkeysSet,
    searchQuery,
    workerSearchIds,
  ]);

  const sortedPosts = useMemo(() => {
    const sorted = [...filteredPosts];

    switch (sortMode) {
      case SortMode.NEWEST:
        return sorted.sort((a, b) => b.timestamp - a.timestamp);
      case SortMode.OLDEST:
        return sorted.sort((a, b) => a.timestamp - b.timestamp);
      case SortMode.TRENDING: {
        const now = Date.now();
        const HOUR = 1000 * 60 * 60;
        return sorted.sort((a, b) => {
          const ageA = (now - a.timestamp) / HOUR;
          const ageB = (now - b.timestamp) / HOUR;
          const trendA = (a.score + a.commentCount * 2) / Math.pow(ageA + 2, 1.5);
          const trendB = (b.score + b.commentCount * 2) / Math.pow(ageB + 2, 1.5);
          return trendB - trendA;
        });
      }
      case SortMode.COMMENTS:
        return sorted.sort((a, b) => b.commentCount - a.commentCount);
      case SortMode.TOP:
      default:
        return sorted.sort((a, b) => b.score - a.score);
    }
  }, [filteredPosts, sortMode]);

  const knownUsers = useMemo(() => {
    const users = new Set<string>();
    posts.forEach((post) => {
      users.add(post.author);
      post.comments.forEach((comment) => {
        users.add(comment.author);
      });
    });
    return users;
  }, [posts]);

  const selectedPost = useMemo(() => {
    const post = selectedBitId ? postsById.get(selectedBitId) || null : null;

    if (post && selectedBitId) {
      markPostAccessed(selectedBitId);
      setSelectedPostId(selectedBitId);
    }

    return post;
  }, [selectedBitId, postsById, markPostAccessed, setSelectedPostId]);

  const bookmarkedIdSet = useMemo(() => new Set(bookmarkedIds), [bookmarkedIds]);
  const reportedPostIdSet = useMemo(() => new Set(reportedPostIds), [reportedPostIds]);

  return {
    filteredPosts,
    sortedPosts,
    knownUsers,
    selectedPost,
    bookmarkedIdSet,
    reportedPostIdSet,
  };
}
