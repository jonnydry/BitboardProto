import React, { createContext, useContext, useCallback, useMemo, useEffect, useState } from 'react';
import {
  Post,
  UserState,
  ViewMode,
  Board,
  NostrIdentity,
  SortMode,
  BoardType,
  ThemeId,
} from '../../types';
import { nostrService } from '../../services/nostr/NostrService';
import { identityService } from '../../services/identityService';
import { bookmarkService } from '../../services/bookmarkService';
import { listService } from '../../services/listService';
import { reportService } from '../../services/reportService';
import { logger } from '../../services/loggingService';
import { toastService } from '../../services/toastService';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { FeatureFlags, UIConfig } from '../../config';
import { useTheme } from '../../hooks/useTheme';
import { useUrlPostRouting } from '../../hooks/useUrlPostRouting';
import { useNostrFeed } from '../../hooks/useNostrFeed';
import { useCommentsLoader } from '../../hooks/useCommentsLoader';
import { useVoting } from '../../hooks/useVoting';
import { useCommentVoting } from '../../hooks/useCommentVoting';
import { useAppDerivedData } from './useAppDerivedData';
import { useAppEventHandlers } from './useAppEventHandlers';
import { useAppLifecycle } from './useAppLifecycle';
import { usePostDecryption } from '../../hooks/usePostDecryption';
import { usePhaseTwoServices } from './usePhaseTwoServices';
import { usePostStore } from '../../stores/postStore';
import { useBoardStore } from '../../stores/boardStore';
import { useUIStore } from '../../stores/uiStore';
import { trendingScore } from '../../services/nostr/shared';
import { communityService } from '../../services/communityService';
import { votingService } from '../../services/votingService';
import { useUserStoreEffects, useUserStore } from '../../stores/userStore';
import { seedRateLimiter } from '../../services/seedRateLimiter';

interface AppContextType {
  // State
  posts: Post[];
  boards: Board[];
  viewMode: ViewMode;
  theme: ThemeId;
  activeBoardId: string | null;
  locationBoards: Board[];
  profileUser: { username: string; pubkey?: string } | null;
  editingPostId: string | null;
  userState: UserState;

  // Computed values
  postsById: Map<string, Post>;
  sortedPosts: Post[];
  knownUsers: Set<string>;
  selectedPost: Post | null;
  activeBoard: Board | null;
  topicBoards: Board[];
  externalCommunities: Board[];
  decryptionFailedBoardIds: Set<string>;

  // Encryption actions
  removeFailedDecryptionKey: (boardId: string) => void;

  // Actions
  setViewMode: (mode: ViewMode) => void;
  setTheme: (theme: ThemeId) => void;
  setLocationBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  getThemeColor: (id: ThemeId) => string;
  feedFilter: 'all' | 'topic' | 'location' | 'following';
  setFeedFilter: (filter: 'all' | 'topic' | 'location' | 'following') => void;
  isNostrConnected: boolean;
  setUserState: React.Dispatch<React.SetStateAction<UserState>>;
  joinNostrCommunity: (reference: string) => Promise<string>;
  seedSourcePost: Post | null;
  seedIdentityPromptPost: Post | null;
  seedableBoards: Board[];
  remainingSeeds: number;
  requestSeedPost: (post: Post) => void;
  closeSeedModal: () => void;
  closeSeedIdentityPrompt: () => void;
  handleConfirmSeedPost: (destinationBoardId: string) => Promise<void>;

  // Event handlers
  handleCreatePost: (
    newPostData: Omit<
      Post,
      | 'id'
      | 'timestamp'
      | 'score'
      | 'commentCount'
      | 'comments'
      | 'nostrEventId'
      | 'upvotes'
      | 'downvotes'
    >,
  ) => Promise<void>;
  handleCreateBoard: (
    newBoardData: Omit<Board, 'id' | 'memberCount' | 'nostrEventId'>,
  ) => Promise<void>;
  handleComment: (postId: string, content: string, parentCommentId?: string) => Promise<void>;
  handleEditComment: (postId: string, commentId: string, nextContent: string) => Promise<void>;
  handleDeleteComment: (postId: string, commentId: string) => Promise<void>;
  navigateToBoard: (boardId: string | null) => void;
  returnToFeed: () => void;
  handleIdentityChange: (identity: NostrIdentity | null) => void;
  handleViewProfile: (username: string, pubkey?: string) => void;
  handleEditPost: (postId: string) => void;
  handleSavePost: (postId: string, updates: Partial<Post>) => void;
  handleDeletePost: (postId: string) => Promise<void>;
  handleTagClick: (tag: string) => void;
  handleVote: (postId: string, direction: 'up' | 'down') => void;
  handleCommentVote: (postId: string, commentId: string, direction: 'up' | 'down') => void;
  handleToggleBookmark: (postId: string) => void;
  getBoardName: (postId: string) => string | undefined;
  refreshProfileMetadata: (pubkeys: string[]) => Promise<void>;
  handleRetryPost: (postId: string) => Promise<void>;
  toggleMute: (pubkey: string) => void;
  isMuted: (pubkey: string) => boolean;

  // Hooks
  loaderRef: React.RefObject<HTMLDivElement>;
  isLoadingMore: boolean;
  isInitialLoading: boolean;
}

const AppContext = createContext<AppContextType | null>(null);

const themeColorMap = new Map<ThemeId, string>([
  [ThemeId.AMBER, '#ffb000'],
  [ThemeId.PHOSPHOR, '#00ff41'],
  [ThemeId.PLASMA, '#00f0ff'],
  [ThemeId.VERMILION, '#ff4646'],
  [ThemeId.SLATE, '#c8c8c8'],
  [ThemeId.PATRIOT, '#ffffff'],
  [ThemeId.SAKURA, '#ffb4dc'],
  [ThemeId.BITBORING, '#ffffff'],
]);

// AppProvider now uses Zustand stores directly (no Context providers needed)
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize user store effects (replaces useEffect from UserProvider)
  useUserStoreEffects();

  return <AppProviderInternal>{children}</AppProviderInternal>;
};

// Internal provider that aggregates from focused contexts
const AppProviderInternal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // selectedBitId now lives in postStore as the single source of truth
  const selectedBitId = usePostStore((state) => state.selectedPostId);
  const setSelectedBitId = usePostStore((state) => state.setSelectedPostId);

  const posts = usePostStore((state) => state.posts);
  const setPosts = usePostStore((state) => state.setPosts);
  const markPostAccessed = usePostStore((state) => state.markPostAccessed);

  const boards = useBoardStore((state) => state.boards);
  const locationBoards = useBoardStore((state) => state.locationBoards);
  const activeBoardId = useBoardStore((state) => state.activeBoardId);
  const setBoards = useBoardStore((state) => state.setBoards);
  const setLocationBoards = useBoardStore((state) => state.setLocationBoards);
  const setActiveBoardId = useBoardStore((state) => state.setActiveBoardId);

  const viewMode = useUIStore((state) => state.viewMode);
  const theme = useUIStore((state) => state.theme);
  const searchQuery = useUIStore((state) => state.searchQuery);
  const sortMode = useUIStore((state) => state.sortMode);
  const profileUser = useUIStore((state) => state.profileUser);
  const editingPostId = useUIStore((state) => state.editingPostId);
  const setViewMode = useUIStore((state) => state.setViewMode);
  const setTheme = useUIStore((state) => state.setTheme);
  const setEditingPostId = useUIStore((state) => state.setEditingPostId);
  const feedFilter = useUIStore((state) => state.feedFilter);
  const setFeedFilter = useUIStore((state) => state.setFeedFilter);
  const isNostrConnected = useUIStore((state) => state.isNostrConnected);
  const setIsNostrConnected = useUIStore((state) => state.setIsNostrConnected);
  const hasMorePosts = useUIStore((state) => state.hasMorePosts);
  const setHasMorePosts = useUIStore((state) => state.setHasMorePosts);
  const oldestTimestamp = useUIStore((state) => state.oldestTimestamp);
  const setOldestTimestamp = useUIStore((state) => state.setOldestTimestamp);
  const bookmarkedIds = useUIStore((state) => state.bookmarkedIds);
  const setBookmarkedIds = useUIStore((state) => state.setBookmarkedIds);
  const reportedPostIds = useUIStore((state) => state.reportedPostIds);
  const setReportedPostIds = useUIStore((state) => state.setReportedPostIds);

  const userState = useUserStore((state) => state.userState);
  const setUserState = useUserStore((state) => state.setUserState);
  const toggleMute = useUserStore((state) => state.toggleMute);
  const isMuted = useUserStore((state) => state.isMuted);
  const handleIdentityChange = useUserStore((state) => state.handleIdentityChange);
  const followingPubkeys = useUserStore((state) => state.followingPubkeys);
  const setFollowingPubkeys = useUserStore((state) => state.setFollowingPubkeys);
  const [seedSourcePost, setSeedSourcePost] = useState<Post | null>(null);
  const [seedIdentityPromptPost, setSeedIdentityPromptPost] = useState<Post | null>(null);

  // Initialize bookmarkedIds and reportedPostIds from services on mount
  useEffect(() => {
    setBookmarkedIds(bookmarkService.getBookmarkedIds());
    setReportedPostIds(reportService.getReportsByType('post').map((r) => r.targetId));
  }, [setBookmarkedIds, setReportedPostIds]);

  const postsById = useMemo(() => {
    const map = new Map<string, Post>();
    posts.forEach((post) => map.set(post.id, post));
    return map;
  }, [posts]);

  const boardsById = useMemo(() => {
    const map = new Map<string, Board>();
    boards.forEach((board) => map.set(board.id, board));
    locationBoards.forEach((board) => map.set(board.id, board));
    return map;
  }, [boards, locationBoards]);

  const activeBoard = useMemo(() => {
    if (!activeBoardId) return null;
    return boardsById.get(activeBoardId) || null;
  }, [activeBoardId, boardsById]);

  const topicBoards = useMemo(() => {
    return boards.filter(
      (board) => board.type === BoardType.TOPIC && board.source !== 'nostr-community',
    );
  }, [boards]);

  const externalCommunities = useMemo(() => {
    return boards.filter((board) => board.source === 'nostr-community');
  }, [boards]);

  const postsCtx = {
    posts,
    postsById,
    setPosts,
    markPostAccessed,
  };

  const boardsCtx = {
    boards,
    locationBoards,
    activeBoardId,
    boardsById,
    topicBoards,
    activeBoard,
    setBoards,
    setLocationBoards,
    setActiveBoardId,
  };

  const uiCtx = {
    viewMode,
    theme,
    searchQuery,
    sortMode,
    profileUser,
    editingPostId,
    setViewMode,
    setEditingPostId,
  };

  const userCtx = {
    userState,
    setUserState,
    toggleMute,
    isMuted,
    handleIdentityChange,
  };

  const seedableBoards = useMemo(
    () => [...boards.filter((board) => board.isPublic && !board.isReadOnly), ...locationBoards],
    [boards, locationBoards],
  );

  const remainingSeeds = useMemo(() => {
    const pubkey = userCtx.userState.identity?.pubkey;
    if (!pubkey) return seedRateLimiter.getLimit();
    return seedRateLimiter.canSeed(pubkey).remaining;
  }, [userCtx.userState.identity?.pubkey, posts]);

  const handleToggleBookmark = useCallback(
    async (postId: string) => {
      // 1. Update locally
      bookmarkService.toggleBookmark(postId);

      // 2. Persist to Nostr (NIP-51) if identity is available
      if (userCtx.userState.identity && FeatureFlags.ENABLE_LISTS) {
        try {
          const currentBookmarked = bookmarkService.getBookmarkedIds();
          const unsigned = listService.buildBookmarksList({
            eventIds: currentBookmarked,
            pubkey: userCtx.userState.identity.pubkey,
          });
          const signed = await identityService.signEvent(unsigned);
          nostrService.publishSignedEvent(signed).catch((err) => {
            logger.warn('AppContext', 'Failed to publish bookmarks to Nostr', err);
          });
        } catch (err) {
          logger.warn('AppContext', 'Failed to sign bookmarks event', err);
        }
      }
    },
    [userCtx.userState.identity],
  );

  const joinNostrCommunity = useCallback(
    async (reference: string) => {
      const resolved = communityService.resolveCommunityReference(reference);
      if (!resolved) {
        throw new Error('Enter a valid community address or naddr.');
      }

      const community = await communityService.fetchCommunity(
        resolved.creatorPubkey,
        resolved.communityId,
      );
      if (!community) {
        throw new Error('Community not found on the configured relays.');
      }

      const board = communityService.communityToBoard(community);
      setBoards((prev) => {
        if (prev.some((candidate) => candidate.id === board.id)) return prev;
        return [...prev, board];
      });

      toastService.push({
        type: 'success',
        message: 'Nostr community joined',
        detail: `Added ${board.name} to External Communities.`,
        durationMs: UIConfig.TOAST_DURATION_MS,
      });

      return board.id;
    },
    [setBoards],
  );

  const requestSeedPost = useCallback(
    (post: Post) => {
      if (post.source !== 'nostr-community') return;

      if (!userCtx.userState.identity) {
        setSeedIdentityPromptPost(post);
        return;
      }

      const rateCheck = seedRateLimiter.canSeed(userCtx.userState.identity.pubkey);
      if (!rateCheck.allowed) {
        const resetIn = rateCheck.resetAt
          ? seedRateLimiter.formatResetTime(rateCheck.resetAt)
          : 'later';
        toastService.push({
          type: 'error',
          message: 'Seed limit reached',
          detail: `You can seed ${seedRateLimiter.getLimit()} posts per day. Try again in ${resetIn}.`,
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: 'seed-post-rate-limit',
        });
        return;
      }

      setSeedSourcePost(post);
    },
    [userCtx.userState.identity],
  );

  const closeSeedModal = useCallback(() => {
    setSeedSourcePost(null);
  }, []);

  const closeSeedIdentityPrompt = useCallback(() => {
    setSeedIdentityPromptPost(null);
  }, []);

  useEffect(() => {
    if (!seedIdentityPromptPost || !userCtx.userState.identity) return;

    setSeedIdentityPromptPost(null);
    setSeedSourcePost(seedIdentityPromptPost);
    uiCtx.setViewMode(ViewMode.FEED);
  }, [seedIdentityPromptPost, uiCtx.setViewMode, userCtx.userState.identity]);

  // Get relay hint helper
  const getRelayHint = useCallback(() => {
    const connected = nostrService.getConnectedCount();
    const total = nostrService.getRelays().length;
    const state = connected > 0 ? 'Some relays are reachable.' : 'No relays appear reachable.';
    return `${state} Relays: ${connected}/${total}. Open RELAYS to adjust/retry.`;
  }, []);

  const mutedPubkeys = useMemo(
    () => userCtx.userState.mutedPubkeys || [],
    [userCtx.userState.mutedPubkeys],
  );
  const {
    filteredPosts,
    sortedPosts: derivedSortedPosts,
    knownUsers,
    selectedPost,
  } = useAppDerivedData({
    posts: postsCtx.posts,
    postsById: postsCtx.postsById,
    boardsById: boardsCtx.boardsById,
    activeBoardId: boardsCtx.activeBoardId,
    feedFilter,
    followingPubkeys,
    mutedPubkeys,
    searchQuery: uiCtx.searchQuery,
    sortMode: uiCtx.sortMode,
    selectedBitId,
    bookmarkedIds,
    reportedPostIds,
    markPostAccessed: postsCtx.markPostAccessed,
  });

  // Decrypt encrypted posts/comments if we have the keys
  const {
    posts: decryptedPosts,
    failedBoardIds: decryptionFailedBoardIds,
    removeFailedKey,
  } = usePostDecryption(filteredPosts, boardsCtx.boardsById);

  const hydrateCommunityPosts = useCallback(async (communityPosts: Post[]) => {
    const postIds = communityPosts.map((post) => post.nostrEventId).filter(Boolean) as string[];
    const voteTallies = await votingService.fetchVotesForPosts(postIds);
    const postsWithVotes = communityPosts.map((post) => {
      const tally = post.nostrEventId ? voteTallies.get(post.nostrEventId) : undefined;
      if (!tally) return post;
      return {
        ...post,
        upvotes: tally.upvotes,
        downvotes: tally.downvotes,
        score: tally.score,
        uniqueVoters: tally.uniqueVoters,
        votesVerified: true,
      };
    });

    const pubkeys = Array.from(
      new Set(postsWithVotes.map((post) => post.authorPubkey).filter(Boolean) as string[]),
    );
    if (pubkeys.length > 0) {
      await nostrService.fetchProfiles(pubkeys);
      return postsWithVotes.map((post) =>
        post.authorPubkey
          ? { ...post, author: nostrService.getDisplayName(post.authorPubkey) }
          : post,
      );
    }

    return postsWithVotes;
  }, []);

  const upsertExternalCommunityPosts = useCallback(
    (boardId: string, nextPosts: Post[], opts: { replace?: boolean } = {}) => {
      setPosts((prev) => {
        const remaining = prev.filter((post) => post.boardId !== boardId);
        const existingBoardPosts = opts.replace
          ? []
          : prev.filter((post) => post.boardId === boardId);
        const merged = new Map<string, Post>();
        [...remaining, ...existingBoardPosts, ...nextPosts].forEach((post) => {
          merged.set(post.id, post);
        });
        return Array.from(merged.values());
      });
    },
    [setPosts],
  );

  const sortedPosts = useMemo(() => {
    if (decryptedPosts === filteredPosts) {
      return derivedSortedPosts;
    }

    const sorted = [...decryptedPosts];

    switch (uiCtx.sortMode) {
      case SortMode.NEWEST:
        return sorted.sort((a, b) => b.timestamp - a.timestamp);
      case SortMode.OLDEST:
        return sorted.sort((a, b) => a.timestamp - b.timestamp);
      case SortMode.TRENDING: {
        const now = Date.now();
        return sorted.sort(
          (a, b) =>
            trendingScore(b.score, b.commentCount, b.timestamp, now) -
            trendingScore(a.score, a.commentCount, a.timestamp, now),
        );
      }
      case SortMode.COMMENTS:
        return sorted.sort((a, b) => b.commentCount - a.commentCount);
      case SortMode.TOP:
      default:
        return sorted.sort((a, b) => b.score - a.score);
    }
  }, [decryptedPosts, derivedSortedPosts, filteredPosts, uiCtx.sortMode]);

  useEffect(() => {
    if (!activeBoard || activeBoard.source !== 'nostr-community') return;

    let cancelled = false;
    const communityAddress = activeBoard.communityAddress || activeBoard.id;
    let subscriptionId: string | null = null;

    const loadCommunityPosts = async () => {
      try {
        const approvedEvents = await communityService.fetchApprovedPosts(
          communityAddress,
          activeBoard.authorRelayHints ?? activeBoard.relayHints,
        );
        const communityPosts = approvedEvents
          .map((event) =>
            communityService.eventToCommunityPost(event, activeBoard.id, communityAddress),
          )
          .filter((post): post is Post => post !== null);
        const hydratedPosts = await hydrateCommunityPosts(communityPosts);
        if (cancelled) return;
        upsertExternalCommunityPosts(activeBoard.id, hydratedPosts, { replace: true });

        const overlapSince = Math.max(0, Math.floor(Date.now() / 1000) - 30);
        subscriptionId = nostrService.subscribeToCommunityApprovals(
          communityAddress,
          async (event) => {
            const approval = communityService.upsertApprovalEvent(event);
            if (!approval || cancelled) return;
            try {
              const approvedEvent = await communityService.fetchApprovedPostById(
                communityAddress,
                approval.postEventId,
                activeBoard.authorRelayHints ?? activeBoard.relayHints,
              );
              if (!approvedEvent || cancelled) return;
              const nextPost = communityService.eventToCommunityPost(
                approvedEvent,
                activeBoard.id,
                communityAddress,
              );
              if (!nextPost) return;
              const [hydratedPost] = await hydrateCommunityPosts([nextPost]);
              if (!hydratedPost || cancelled) return;
              upsertExternalCommunityPosts(activeBoard.id, [hydratedPost]);
            } catch (subscriptionError) {
              if (cancelled) return;
              logger.warn(
                'AppContext',
                'Failed to process community approval update',
                subscriptionError,
              );
            }
          },
          {
            since: overlapSince,
            relayHints: activeBoard.approvalRelayHints ?? activeBoard.relayHints,
          },
        );
      } catch (error) {
        if (cancelled) return;
        logger.warn('AppContext', 'Failed to load external community posts', error);
        toastService.push({
          type: 'error',
          message: 'Failed to load community feed',
          detail: error instanceof Error ? error.message : String(error),
          durationMs: UIConfig.TOAST_DURATION_MS,
        });
      }
    };

    loadCommunityPosts();

    return () => {
      cancelled = true;
      if (subscriptionId) {
        nostrService.unsubscribe(subscriptionId);
      }
    };
  }, [activeBoard, hydrateCommunityPosts, upsertExternalCommunityPosts]);

  // Hooks
  useTheme(uiCtx.theme);
  useUrlPostRouting({
    viewMode: uiCtx.viewMode,
    selectedBitId,
    setViewMode: uiCtx.setViewMode,
    setSelectedBitId,
  });

  // Nostr feed hook with focused context setters
  const { isInitialLoading } = useNostrFeed({
    setPosts: postsCtx.setPosts,
    setBoards: boardsCtx.setBoards,
    setIsNostrConnected,
    setOldestTimestamp,
    setHasMorePosts,
  });

  useCommentsLoader({
    selectedBitId,
    postsById: postsCtx.postsById,
    setPosts: postsCtx.setPosts,
  });

  const { handleVote } = useVoting({
    postsById: postsCtx.postsById,
  });

  const { handleCommentVote } = useCommentVoting({
    postsById: postsCtx.postsById,
  });

  // Event handlers (imported from separate file with updated context access)
  const eventHandlers = useAppEventHandlers({
    setPosts: postsCtx.setPosts,
    boards: boardsCtx.boards,
    setBoards: boardsCtx.setBoards,
    boardsById: boardsCtx.boardsById,
    postsById: postsCtx.postsById,
    userState: userCtx.userState,
    setUserState: userCtx.setUserState,
    setViewMode: uiCtx.setViewMode,
    setActiveBoardId: boardsCtx.setActiveBoardId,
    setEditingPostId: uiCtx.setEditingPostId,
    getRelayHint,
    oldestTimestamp,
    hasMorePosts,
    setOldestTimestamp,
    setHasMorePosts,
    locationBoards: boardsCtx.locationBoards,
  });

  const handleConfirmSeedPost = useCallback(
    async (destinationBoardId: string) => {
      if (!seedSourcePost) {
        throw new Error('No source post selected.');
      }
      if (!userCtx.userState.identity) {
        throw new Error('Identity required to seed posts.');
      }

      const sourceEventId = seedSourcePost.nostrEventId || seedSourcePost.id;
      const existingSeed = posts.find(
        (post) =>
          post.seededFrom === 'nostr' &&
          post.seedSourceEventId === sourceEventId &&
          post.boardId === destinationBoardId,
      );
      if (existingSeed) {
        toastService.push({
          type: 'warning',
          message: 'Post already seeded',
          detail: 'That source note already exists in the selected BitBoard board.',
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: `seed-duplicate-${sourceEventId}-${destinationBoardId}`,
        });
        setSeedSourcePost(null);
        boardsCtx.setActiveBoardId(destinationBoardId);
        uiCtx.setViewMode(ViewMode.FEED);
        return;
      }

      await eventHandlers.handleSeedPost(seedSourcePost, destinationBoardId);
      setSeedSourcePost(null);
      boardsCtx.setActiveBoardId(destinationBoardId);
      uiCtx.setViewMode(ViewMode.FEED);
      toastService.push({
        type: 'success',
        message: 'Seeded into BitBoard',
        detail: 'The note is now a native BitBoard post with provenance attached.',
        durationMs: UIConfig.TOAST_DURATION_MS,
      });
    },
    [boardsCtx, eventHandlers, posts, seedSourcePost, uiCtx, userCtx.userState.identity],
  );

  // Infinite scroll hook
  const { loaderRef, isLoading: isLoadingMore } = useInfiniteScroll(
    eventHandlers.loadMorePosts,
    hasMorePosts && uiCtx.viewMode === ViewMode.FEED && activeBoard?.source !== 'nostr-community',
    { threshold: 300 },
  );

  // Effects
  usePhaseTwoServices({ pubkey: userCtx.userState.identity?.pubkey });
  useAppLifecycle({
    boards: boardsCtx.boards,
    posts: postsCtx.posts,
    setBookmarkedIds,
    setReportedPostIds,
    setFollowingPubkeys,
    setUserState: userCtx.setUserState,
    setActiveBoardId: boardsCtx.setActiveBoardId,
    setViewMode: uiCtx.setViewMode,
  });

  // Memoize contextValue so that consumers only re-render when the specific
  // slice they depend on actually changes, rather than on every render of
  // AppProviderInternal (which re-renders whenever any Zustand store changes).
  const contextValue: AppContextType = useMemo(
    () => ({
      // State (aggregated from focused contexts)
      posts: postsCtx.posts,
      boards: boardsCtx.boards,
      viewMode: uiCtx.viewMode,
      theme,
      activeBoardId: boardsCtx.activeBoardId,
      locationBoards: boardsCtx.locationBoards,
      profileUser: uiCtx.profileUser,
      editingPostId: uiCtx.editingPostId,
      userState: userCtx.userState,

      // Computed values (aggregated from focused contexts)
      postsById: postsCtx.postsById,
      sortedPosts,
      knownUsers,
      selectedPost,
      activeBoard: boardsCtx.activeBoard,
      topicBoards: boardsCtx.topicBoards,
      externalCommunities,
      decryptionFailedBoardIds,
      removeFailedDecryptionKey: removeFailedKey,

      // Actions (delegated to focused contexts)
      setViewMode: uiCtx.setViewMode,
      setTheme,
      setLocationBoards: boardsCtx.setLocationBoards,
      getThemeColor: (id: ThemeId) => themeColorMap.get(id) || '#ffffff',
      feedFilter,
      setFeedFilter,
      isNostrConnected,
      setUserState: userCtx.setUserState,
      joinNostrCommunity,
      seedSourcePost,
      seedIdentityPromptPost,
      seedableBoards,
      remainingSeeds,
      requestSeedPost,
      closeSeedModal,
      closeSeedIdentityPrompt,
      handleConfirmSeedPost,

      // Event handlers
      handleCreatePost: eventHandlers.handleCreatePost,
      handleCreateBoard: eventHandlers.handleCreateBoard,
      handleComment: eventHandlers.handleComment,
      handleEditComment: eventHandlers.handleEditComment,
      handleDeleteComment: eventHandlers.handleDeleteComment,
      navigateToBoard: eventHandlers.navigateToBoard,
      returnToFeed: eventHandlers.returnToFeed,
      handleIdentityChange: userCtx.handleIdentityChange,
      handleViewProfile: eventHandlers.handleViewProfile,
      handleEditPost: eventHandlers.handleEditPost,
      handleSavePost: eventHandlers.handleSavePost,
      handleDeletePost: eventHandlers.handleDeletePost,
      handleTagClick: eventHandlers.handleTagClick,
      handleVote,
      handleCommentVote,
      handleToggleBookmark,
      getBoardName: eventHandlers.getBoardName,
      refreshProfileMetadata: eventHandlers.refreshProfileMetadata,
      handleRetryPost: eventHandlers.handleRetryPost,
      toggleMute: userCtx.toggleMute,
      isMuted: userCtx.isMuted,

      // Hooks
      loaderRef,
      isLoadingMore,
      isInitialLoading,
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }),
    [
      postsCtx.posts,
      postsCtx.postsById,
      postsCtx.setPosts,
      postsCtx.markPostAccessed,
      boardsCtx.boards,
      boardsCtx.locationBoards,
      boardsCtx.activeBoardId,
      boardsCtx.topicBoards,
      boardsCtx.activeBoard,
      boardsCtx.setBoards,
      boardsCtx.setLocationBoards,
      boardsCtx.setActiveBoardId,
      uiCtx.viewMode,
      theme,
      uiCtx.profileUser,
      uiCtx.editingPostId,
      uiCtx.setViewMode,
      uiCtx.setEditingPostId,
      userCtx.userState,
      userCtx.toggleMute,
      userCtx.isMuted,
      userCtx.handleIdentityChange,
      sortedPosts,
      knownUsers,
      selectedPost,
      externalCommunities,
      decryptionFailedBoardIds,
      removeFailedKey,
      feedFilter,
      setFeedFilter,
      isNostrConnected,
      setTheme,
      userCtx.setUserState,
      joinNostrCommunity,
      seedSourcePost,
      seedIdentityPromptPost,
      seedableBoards,
      remainingSeeds,
      requestSeedPost,
      closeSeedModal,
      closeSeedIdentityPrompt,
      handleConfirmSeedPost,
      eventHandlers.handleCreatePost,
      eventHandlers.handleCreateBoard,
      eventHandlers.handleComment,
      eventHandlers.handleEditComment,
      eventHandlers.handleDeleteComment,
      eventHandlers.navigateToBoard,
      eventHandlers.returnToFeed,
      eventHandlers.handleViewProfile,
      eventHandlers.handleEditPost,
      eventHandlers.handleSavePost,
      eventHandlers.handleDeletePost,
      eventHandlers.handleTagClick,
      eventHandlers.getBoardName,
      eventHandlers.refreshProfileMetadata,
      eventHandlers.handleRetryPost,
      handleVote,
      handleCommentVote,
      handleToggleBookmark,
      loaderRef,
      isLoadingMore,
      isInitialLoading,
    ],
  );

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
