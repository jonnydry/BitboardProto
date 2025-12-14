import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { MAX_DAILY_BITS, INITIAL_POSTS, INITIAL_BOARDS } from '../../constants';
import { Post, UserState, ViewMode, Board, ThemeId, BoardType, NostrIdentity, SortMode } from '../../types';
import { nostrService } from '../../services/nostrService';
import { identityService } from '../../services/identityService';
import { votingService } from '../../services/votingService';
import { bookmarkService } from '../../services/bookmarkService';
import { reportService } from '../../services/reportService';
import { makeUniqueBoardId } from '../../services/boardIdService';
import { toastService } from '../../services/toastService';
import { inputValidator } from '../../services/inputValidator';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { FeatureFlags, StorageKeys, UIConfig } from '../../config';
import { useTheme } from '../../hooks/useTheme';
import { useUrlPostRouting } from '../../hooks/useUrlPostRouting';
import { useNostrFeed } from '../../hooks/useNostrFeed';
import { useCommentsLoader } from '../../hooks/useCommentsLoader';
import { useVoting } from '../../hooks/useVoting';
import { useAppEventHandlers } from './useAppEventHandlers';

const MAX_CACHED_POSTS = 200;

// ============================================
// DATA LOADING FUNCTIONS
// ============================================

function loadCachedPosts(): Post[] | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(StorageKeys.POSTS_CACHE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; posts?: unknown };
    if (!parsed || !Array.isArray(parsed.posts)) return null;

    // Basic structural validation; discard obviously malformed entries.
    const posts = (parsed.posts as any[]).filter((p) => p && typeof p.id === 'string' && typeof p.title === 'string');
    return posts as Post[];
  } catch {
    return null;
  }
}

function loadCachedBoards(): Board[] | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(StorageKeys.BOARDS_CACHE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; boards?: unknown };
    if (!parsed || !Array.isArray(parsed.boards)) return null;

    const boards = (parsed.boards as any[]).filter((b) => b && typeof b.id === 'string' && typeof b.name === 'string');
    return boards as Board[];
  } catch {
    return null;
  }
}

// ============================================
// APP CONTEXT TYPE
// ============================================

interface AppContextType {
  // State
  posts: Post[];
  boards: Board[];
  viewMode: ViewMode;
  selectedBitId: string | null;
  activeBoardId: string | null;
  theme: ThemeId;
  isNostrConnected: boolean;
  locationBoards: Board[];
  feedFilter: 'all' | 'topic' | 'location';
  searchQuery: string;
  sortMode: SortMode;
  profileUser: { username: string; pubkey?: string } | null;
  editingPostId: string | null;
  bookmarkedIds: string[];
  reportedPostIds: string[];
  userState: UserState;
  hasMorePosts: boolean;
  oldestTimestamp: number | null;

  // Computed values
  boardsById: Map<string, Board>;
  postsById: Map<string, Post>;
  filteredPosts: Post[];
  sortedPosts: Post[];
  knownUsers: Set<string>;
  selectedPost: Post | null;
  activeBoard: Board | null;
  topicBoards: Board[];
  geohashBoards: Board[];
  bookmarkedIdSet: Set<string>;
  reportedPostIdSet: Set<string>;

  // Actions
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  setBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  setViewMode: (mode: ViewMode) => void;
  setSelectedBitId: (id: string | null) => void;
  setActiveBoardId: (id: string | null) => void;
  setTheme: (theme: ThemeId) => void;
  setLocationBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  setFeedFilter: (filter: 'all' | 'topic' | 'location') => void;
  setSearchQuery: (query: string) => void;
  setSortMode: (mode: SortMode) => void;
  setProfileUser: (user: { username: string; pubkey?: string } | null) => void;
  setEditingPostId: (id: string | null) => void;
  setUserState: React.Dispatch<React.SetStateAction<UserState>>;
  setHasMorePosts: (hasMore: boolean) => void;
  setOldestTimestamp: (timestamp: number | null) => void;

  // Event handlers
  handleCreatePost: (newPostData: Omit<Post, 'id' | 'timestamp' | 'score' | 'commentCount' | 'comments' | 'nostrEventId' | 'upvotes' | 'downvotes'>) => Promise<void>;
  handleCreateBoard: (newBoardData: Omit<Board, 'id' | 'memberCount' | 'nostrEventId'>) => Promise<void>;
  handleComment: (postId: string, content: string, parentCommentId?: string) => Promise<void>;
  handleEditComment: (postId: string, commentId: string, nextContent: string) => Promise<void>;
  handleDeleteComment: (postId: string, commentId: string) => Promise<void>;
  handleViewBit: (postId: string) => void;
  navigateToBoard: (boardId: string | null) => void;
  returnToFeed: () => void;
  handleIdentityChange: (identity: NostrIdentity | null) => void;
  handleLocationBoardSelect: (board: Board) => void;
  handleViewProfile: (username: string, pubkey?: string) => void;
  handleEditPost: (postId: string) => void;
  handleSavePost: (postId: string, updates: Partial<Post>) => void;
  handleDeletePost: (postId: string) => void;
  handleTagClick: (tag: string) => void;
  handleVote: (postId: string, direction: 'up' | 'down') => void;
  handleSearch: (query: string) => void;
  loadMorePosts: () => Promise<void>;
  getThemeColor: (id: ThemeId) => string;
  getBoardName: (postId: string) => string | undefined;
  refreshProfileMetadata: (pubkeys: string[]) => Promise<void>;

  // Hooks
  loaderRef: React.RefObject<HTMLDivElement>;
  isLoadingMore: boolean;
}

// ============================================
// CONTEXT PROVIDER
// ============================================

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State
  const [posts, setPosts] = useState<Post[]>(() => loadCachedPosts() ?? INITIAL_POSTS);
  const [boards, setBoards] = useState<Board[]>(() => loadCachedBoards() ?? INITIAL_BOARDS);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.FEED);
  const [selectedBitId, setSelectedBitId] = useState<string | null>(null);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeId>(ThemeId.AMBER);
  const [isNostrConnected, setIsNostrConnected] = useState(false);
  const [locationBoards, setLocationBoards] = useState<Board[]>([]);
  const [feedFilter, setFeedFilter] = useState<'all' | 'topic' | 'location'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>(SortMode.TOP);
  const [profileUser, setProfileUser] = useState<{ username: string; pubkey?: string } | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => bookmarkService.getBookmarkedIds());
  const [reportedPostIds, setReportedPostIds] = useState<string[]>(() =>
    reportService.getReportsByType('post').map(r => r.targetId)
  );
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [oldestTimestamp, setOldestTimestamp] = useState<number | null>(null);

  const [userState, setUserState] = useState<UserState>(() => {
    const existingIdentity = identityService.getIdentity();
    return {
      username: existingIdentity?.displayName || 'u/guest_' + Math.floor(Math.random() * 10000).toString(16),
      bits: MAX_DAILY_BITS,
      maxBits: MAX_DAILY_BITS,
      votedPosts: {},
      identity: existingIdentity || undefined,
      hasIdentity: !!existingIdentity,
    };
  });

  // Get relay hint helper
  const getRelayHint = useCallback(() => {
    const connected = nostrService.getConnectedCount();
    const total = nostrService.getRelays().length;
    const state = connected > 0 ? 'Some relays are reachable.' : 'No relays appear reachable.';
    return `${state} Relays: ${connected}/${total}. Open RELAYS to adjust/retry.`;
  }, []);

  // Computed values
  const boardsById = useMemo(() => {
    const map = new Map<string, Board>();
    boards.forEach(b => map.set(b.id, b));
    locationBoards.forEach(b => map.set(b.id, b));
    return map;
  }, [boards, locationBoards]);

  const postsById = useMemo(() => {
    const map = new Map<string, Post>();
    posts.forEach(p => map.set(p.id, p));
    return map;
  }, [posts]);

  const filteredPosts = useMemo(() => {
    let result = posts;

    // Filter by board
    if (activeBoardId) {
      result = result.filter(p => p.boardId === activeBoardId);
    } else {
      result = result.filter(p => {
        const board = boardsById.get(p.boardId);
        if (!board?.isPublic) return false;

        if (feedFilter === 'topic') return board.type === BoardType.TOPIC;
        if (feedFilter === 'location') return board.type === BoardType.GEOHASH;
        return true;
      });
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((p) => {
        const board = boardsById.get(p.boardId);
        const boardName = board?.name?.toLowerCase() ?? '';

        const inPost =
          p.title.toLowerCase().includes(query) ||
          p.content.toLowerCase().includes(query) ||
          p.author.toLowerCase().includes(query) ||
          boardName.includes(query) ||
          p.tags.some((tag) => tag.toLowerCase().includes(query));

        if (inPost) return true;

        // Also search comments (author + content)
        return p.comments.some(
          (c) =>
            c.author.toLowerCase().includes(query) ||
            c.content.toLowerCase().includes(query)
        );
      });
    }

    return result;
  }, [posts, activeBoardId, boardsById, feedFilter, searchQuery]);

  const sortedPosts = useMemo(() => {
    const sorted = [...filteredPosts];

    switch (sortMode) {
      case SortMode.NEWEST:
        return sorted.sort((a, b) => b.timestamp - a.timestamp);
      case SortMode.OLDEST:
        return sorted.sort((a, b) => a.timestamp - b.timestamp);
      case SortMode.TRENDING: {
        // Trending = recent posts with high engagement (score + comments weighted by recency)
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
    posts.forEach(post => {
      users.add(post.author);
      post.comments.forEach(comment => {
        users.add(comment.author);
      });
    });
    return users;
  }, [posts]);

  const selectedPost = useMemo(() => {
    return selectedBitId ? postsById.get(selectedBitId) || null : null;
  }, [selectedBitId, postsById]);

  const activeBoard = useMemo(() => {
    return activeBoardId ? boardsById.get(activeBoardId) : null;
  }, [activeBoardId, boardsById]);

  const topicBoards = useMemo(() => {
    return boards.filter(b => b.type === BoardType.TOPIC);
  }, [boards]);

  const geohashBoards = useMemo(() => {
    const geohashBoardsFromState = boards.filter(b => b.type === BoardType.GEOHASH);
    const geohashBoardsMap = new Map<string, Board>();
    // Add boards from state first
    geohashBoardsFromState.forEach(b => geohashBoardsMap.set(b.id, b));
    // Add location boards, which will overwrite duplicates (locationBoards take precedence)
    locationBoards.forEach(b => geohashBoardsMap.set(b.id, b));
    return Array.from(geohashBoardsMap.values());
  }, [boards, locationBoards]);

  const bookmarkedIdSet = useMemo(() => new Set(bookmarkedIds), [bookmarkedIds]);
  const reportedPostIdSet = useMemo(() => new Set(reportedPostIds), [reportedPostIds]);

  // Theme colors map
  const themeColors = useMemo(() => {
    return new Map<ThemeId, string>([
      [ThemeId.AMBER, '#ffb000'],
      [ThemeId.PHOSPHOR, '#00ff41'],
      [ThemeId.PLASMA, '#00f0ff'],
      [ThemeId.VERMILION, '#ff4646'],
      [ThemeId.SLATE, '#c8c8c8'],
      [ThemeId.PATRIOT, '#ffffff'],
      [ThemeId.BITBORING, '#ffffff'],
    ]);
  }, []);

  // Hooks
  useTheme(theme);
  useUrlPostRouting({ viewMode, selectedBitId, setViewMode, setSelectedBitId });

  // Offline persistence
  useEffect(() => {
    if (!FeatureFlags.ENABLE_OFFLINE_MODE) return;
    if (typeof localStorage === 'undefined') return;

    const id = window.setTimeout(() => {
      try {
        const postsToStore = posts.slice(0, MAX_CACHED_POSTS);
        localStorage.setItem(
          StorageKeys.POSTS_CACHE,
          JSON.stringify({ savedAt: Date.now(), posts: postsToStore })
        );
        localStorage.setItem(
          StorageKeys.BOARDS_CACHE,
          JSON.stringify({ savedAt: Date.now(), boards })
        );
      } catch {
        // Ignore quota / serialization errors
      }
    }, 500);

    return () => window.clearTimeout(id);
  }, [boards, posts]);

  // Subscribe to bookmark changes
  useEffect(() => {
    const unsubscribe = bookmarkService.subscribe(() => {
      setBookmarkedIds(bookmarkService.getBookmarkedIds());
    });
    return unsubscribe;
  }, []);

  // Subscribe to report changes
  useEffect(() => {
    const unsubscribe = reportService.subscribe(() => {
      setReportedPostIds(reportService.getReportsByType('post').map(r => r.targetId));
    });
    return unsubscribe;
  }, []);

  useNostrFeed({ setPosts, setBoards, setIsNostrConnected, setOldestTimestamp, setHasMorePosts });
  useCommentsLoader({ selectedBitId, postsById, setPosts });

  const { handleVote } = useVoting({ postsById, userState, setUserState, setPosts });

  // Ensure identity is loaded
  useEffect(() => {
    let cancelled = false;

    identityService
      .getIdentityAsync()
      .then((identity) => {
        if (cancelled) return;
        if (!identity) return;

        setUserState((prev) => {
          // If user already has an identity in state, don't override it.
          if (prev.hasIdentity || prev.identity) return prev;

          const isGuestHandle = prev.username.startsWith('u/guest_');
          return {
            ...prev,
            identity,
            hasIdentity: true,
            username: identity.displayName && isGuestHandle ? identity.displayName : prev.username,
          };
        });
      })
      .catch((err) => {
        // Non-fatal: app can run in guest mode
        console.warn('[App] Failed to load identity:', err);
        toastService.push({
          type: 'error',
          message: 'Failed to load identity (guest mode)',
          detail: err instanceof Error ? err.message : String(err),
          durationMs: UIConfig.TOAST_DURATION_MS,
          dedupeKey: 'identity-load-failed',
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Event handlers (imported from separate file)
  const eventHandlers = useAppEventHandlers({
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
  });

  // Infinite scroll hook
  const { loaderRef, isLoading: isLoadingMore } = useInfiniteScroll(
    eventHandlers.loadMorePosts,
    hasMorePosts && viewMode === ViewMode.FEED,
    { threshold: 300 }
  );

  const contextValue: AppContextType = {
    // State
    posts,
    boards,
    viewMode,
    selectedBitId,
    activeBoardId,
    theme,
    isNostrConnected,
    locationBoards,
    feedFilter,
    searchQuery,
    sortMode,
    profileUser,
    editingPostId,
    bookmarkedIds,
    reportedPostIds,
    userState,
    hasMorePosts,
    oldestTimestamp,

    // Computed values
    boardsById,
    postsById,
    filteredPosts,
    sortedPosts,
    knownUsers,
    selectedPost,
    activeBoard,
    topicBoards,
    geohashBoards,
    bookmarkedIdSet,
    reportedPostIdSet,

    // Actions
    setPosts,
    setBoards,
    setViewMode,
    setSelectedBitId,
    setActiveBoardId,
    setTheme,
    setLocationBoards,
    setFeedFilter,
    setSearchQuery,
    setSortMode,
    setProfileUser,
    setEditingPostId,
    setUserState,
    setHasMorePosts,
    setOldestTimestamp,

    // Event handlers
    handleCreatePost: eventHandlers.handleCreatePost,
    handleCreateBoard: eventHandlers.handleCreateBoard,
    handleComment: eventHandlers.handleComment,
    handleEditComment: eventHandlers.handleEditComment,
    handleDeleteComment: eventHandlers.handleDeleteComment,
    handleViewBit: eventHandlers.handleViewBit,
    navigateToBoard: eventHandlers.navigateToBoard,
    returnToFeed: eventHandlers.returnToFeed,
    handleIdentityChange: eventHandlers.handleIdentityChange,
    handleLocationBoardSelect: eventHandlers.handleLocationBoardSelect,
    handleViewProfile: eventHandlers.handleViewProfile,
    handleEditPost: eventHandlers.handleEditPost,
    handleSavePost: eventHandlers.handleSavePost,
    handleDeletePost: eventHandlers.handleDeletePost,
    handleTagClick: eventHandlers.handleTagClick,
    handleVote,
    handleSearch: eventHandlers.handleSearch,
    loadMorePosts: eventHandlers.loadMorePosts,
    getThemeColor: (id: ThemeId) => themeColors.get(id) || '#fff',
    getBoardName: eventHandlers.getBoardName,
    refreshProfileMetadata: eventHandlers.refreshProfileMetadata,

    // Hooks
    loaderRef,
    isLoadingMore,
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

// ============================================
// HOOK TO USE CONTEXT
// ============================================

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
