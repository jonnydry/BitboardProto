import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { ViewMode, ThemeId, SortMode } from '../types';

interface UIState {
  // State
  viewMode: ViewMode;
  theme: ThemeId;
  searchQuery: string;
  sortMode: SortMode;
  profileUser: { username: string; pubkey?: string } | null;
  editingPostId: string | null;

  // Actions
  setViewMode: (mode: ViewMode) => void;
  setTheme: (theme: ThemeId) => void;
  setSearchQuery: (query: string) => void;
  setSortMode: (mode: SortMode) => void;
  setProfileUser: (user: { username: string; pubkey?: string } | null) => void;
  setEditingPostId: (id: string | null) => void;
}

export const useUIStore = create<UIState>()(
  subscribeWithSelector((set) => ({
    viewMode: ViewMode.FEED,
    theme: ThemeId.AMBER,
    searchQuery: '',
    sortMode: SortMode.TOP,
    profileUser: null,
    editingPostId: null,

    setViewMode: (mode) => set({ viewMode: mode }),
    setTheme: (theme) => set({ theme }),
    setSearchQuery: (query) => set({ searchQuery: query }),
    setSortMode: (mode) => set({ sortMode: mode }),
    setProfileUser: (user) => set({ profileUser: user }),
    setEditingPostId: (id) => set({ editingPostId: id }),
  }))
);

// Selective selectors prevent unnecessary re-renders
export const useViewMode = () => useUIStore((state) => state.viewMode);
export const useTheme = () => useUIStore((state) => state.theme);
export const useSearchQuery = () => useUIStore((state) => state.searchQuery);
export const useSortMode = () => useUIStore((state) => state.sortMode);
export const useProfileUser = () => useUIStore((state) => state.profileUser);
export const useEditingPostId = () => useUIStore((state) => state.editingPostId);
