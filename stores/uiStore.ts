import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { ViewMode, ThemeId, SortMode } from '../types';

export type FeedFilter = 'all' | 'topic' | 'location' | 'following';

interface UIState {
  // State
  viewMode: ViewMode;
  theme: ThemeId;
  searchQuery: string;
  sortMode: SortMode;
  profileUser: { username: string; pubkey?: string } | null;
  editingPostId: string | null;
  feedFilter: FeedFilter;
  isNostrConnected: boolean;
  hasMorePosts: boolean;
  oldestTimestamp: number | null;
  bookmarkedIds: string[];
  reportedPostIds: string[];

  // Actions
  setViewMode: (mode: ViewMode) => void;
  setTheme: (theme: ThemeId) => void;
  setSearchQuery: (query: string) => void;
  setSortMode: (mode: SortMode) => void;
  setProfileUser: (user: { username: string; pubkey?: string } | null) => void;
  setEditingPostId: (id: string | null) => void;
  setFeedFilter: (filter: FeedFilter) => void;
  setIsNostrConnected: (connected: boolean) => void;
  setHasMorePosts: (hasMore: boolean) => void;
  setOldestTimestamp: (timestamp: number | null) => void;
  setBookmarkedIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  setReportedPostIds: (ids: string[] | ((prev: string[]) => string[])) => void;
}

export const useUIStore = create<UIState>()(
  subscribeWithSelector((set, get) => ({
    viewMode: ViewMode.FEED,
    theme: ThemeId.AMBER,
    searchQuery: '',
    sortMode: SortMode.TOP,
    profileUser: null,
    editingPostId: null,
    feedFilter: 'all' as FeedFilter,
    isNostrConnected: false,
    hasMorePosts: true,
    oldestTimestamp: null,
    bookmarkedIds: [],
    reportedPostIds: [],

    setViewMode: (mode) => set({ viewMode: mode }),
    setTheme: (theme) => set({ theme }),
    setSearchQuery: (query) => set({ searchQuery: query }),
    setSortMode: (mode) => set({ sortMode: mode }),
    setProfileUser: (user) => set({ profileUser: user }),
    setEditingPostId: (id) => set({ editingPostId: id }),
    setFeedFilter: (filter) => set({ feedFilter: filter }),
    setIsNostrConnected: (connected) => set({ isNostrConnected: connected }),
    setHasMorePosts: (hasMore) => set({ hasMorePosts: hasMore }),
    setOldestTimestamp: (timestamp) => set({ oldestTimestamp: timestamp }),
    setBookmarkedIds: (updater) => {
      const current = get().bookmarkedIds;
      const next = typeof updater === 'function' ? updater(current) : updater;
      set({ bookmarkedIds: next });
    },
    setReportedPostIds: (updater) => {
      const current = get().reportedPostIds;
      const next = typeof updater === 'function' ? updater(current) : updater;
      set({ reportedPostIds: next });
    },
  })),
);

// Selective selectors prevent unnecessary re-renders
export const useViewMode = () => useUIStore((state) => state.viewMode);
export const useTheme = () => useUIStore((state) => state.theme);
export const useSearchQuery = () => useUIStore((state) => state.searchQuery);
export const useSortMode = () => useUIStore((state) => state.sortMode);
export const useProfileUser = () => useUIStore((state) => state.profileUser);
export const useEditingPostId = () => useUIStore((state) => state.editingPostId);
export const useFeedFilter = () => useUIStore((state) => state.feedFilter);
export const useIsNostrConnected = () => useUIStore((state) => state.isNostrConnected);
export const useHasMorePosts = () => useUIStore((state) => state.hasMorePosts);
export const useOldestTimestamp = () => useUIStore((state) => state.oldestTimestamp);
export const useBookmarkedIds = () => useUIStore((state) => state.bookmarkedIds);
export const useReportedPostIds = () => useUIStore((state) => state.reportedPostIds);
