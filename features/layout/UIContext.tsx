import React, { createContext, useContext, useState, useCallback } from 'react';
import { ViewMode, ThemeId, Board } from '../../types';
import { useTheme } from '../../hooks/useTheme';
import { useUrlPostRouting } from '../../hooks/useUrlPostRouting';
import { useCombinedEventHandlers } from './useCombinedEventHandlers';

interface UIContextType {
  // UI State
  viewMode: ViewMode;
  selectedBitId: string | null;
  activeBoardId: string | null;
  theme: ThemeId;
  feedFilter: 'all' | 'topic' | 'location';
  searchQuery: string;
  sortMode: any; // Will be imported from types later
  profileUser: { username: string; pubkey?: string } | null;
  editingPostId: string | null;
  locationBoards: Board[];

  // UI Actions
  setViewMode: (mode: ViewMode) => void;
  setSelectedBitId: (id: string | null) => void;
  setActiveBoardId: (id: string | null) => void;
  setTheme: (theme: ThemeId) => void;
  setFeedFilter: (filter: 'all' | 'topic' | 'location') => void;
  setSearchQuery: (query: string) => void;
  setSortMode: (mode: any) => void;
  setProfileUser: (user: { username: string; pubkey?: string } | null) => void;
  setEditingPostId: (id: string | null) => void;
  setLocationBoards: React.Dispatch<React.SetStateAction<Board[]>>;

  // UI Helpers
  getThemeColor: (id: ThemeId) => string;
  handleViewBit: (postId: string) => void;
  navigateToBoard: (boardId: string | null) => void;
  returnToFeed: () => void;
  handleTagClick: (tag: string) => void;
  handleSearch: (query: string) => void;

  // Complex handlers (TODO: implement)
  handleCreatePost: (data: any) => Promise<void>;
  handleCreateBoard: (data: any) => Promise<void>;
  handleLocationBoardSelect: (board: Board) => void;
  handleEditPost: (postId: string) => void;
  handleSavePost: (postId: string, updates: any) => void;
  handleDeletePost: (postId: string) => Promise<void>;
  loadMorePosts: () => Promise<void>;
}

const UIContext = createContext<UIContextType | null>(null);

export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.FEED);
  const [selectedBitId, setSelectedBitId] = useState<string | null>(null);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeId>(ThemeId.AMBER);
  const [feedFilter, setFeedFilter] = useState<'all' | 'topic' | 'location'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<any>('TOP'); // Will be imported properly
  const [profileUser, setProfileUser] = useState<{ username: string; pubkey?: string } | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [locationBoards, setLocationBoards] = useState<Board[]>([]);

  // Theme hook
  useTheme(theme);

  // URL routing hook
  useUrlPostRouting({
    viewMode,
    selectedBitId,
    setViewMode,
    setSelectedBitId
  });

  // Theme colors map
  const themeColors = React.useMemo(() => {
    return new Map<ThemeId, string>([
      [ThemeId.AMBER, '#ffb000'],
      [ThemeId.PHOSPHOR, '#00ff41'],
      [ThemeId.PLASMA, '#00f0ff'],
      [ThemeId.VERMILION, '#ff4646'],
      [ThemeId.SLATE, '#c8c8c8'],
      [ThemeId.PATRIOT, '#ffffff'],
      [ThemeId.SAKURA, '#ffb4dc'],
      [ThemeId.BITBORING, '#ffffff'],
    ]);
  }, []);

  // UI Action handlers
  const getThemeColor = useCallback((id: ThemeId) => themeColors.get(id) || '#fff', [themeColors]);

  const handleViewBit = useCallback((postId: string) => {
    setSelectedBitId(postId);
    setViewMode(ViewMode.SINGLE_BIT);
  }, []);

  const navigateToBoard = useCallback((boardId: string | null) => {
    setActiveBoardId(boardId);
    setSelectedBitId(null);
    setViewMode(ViewMode.FEED);
  }, []);

  const returnToFeed = useCallback(() => {
    setSelectedBitId(null);
    setViewMode(ViewMode.FEED);
  }, []);

  const handleTagClick = useCallback((tag: string) => {
    setSearchQuery(`#${tag}`);
    setSelectedBitId(null);
    setViewMode(ViewMode.FEED);
  }, []);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  // Combined event handlers
  const { handleCreatePost: combinedHandleCreatePost, handleCreateBoard: combinedHandleCreateBoard, handleSavePost: combinedHandleSavePost, handleDeletePost: combinedHandleDeletePost, loadMorePosts: combinedLoadMorePosts } = useCombinedEventHandlers();

  const handleCreatePost = useCallback(async (data: any) => {
    return combinedHandleCreatePost(data);
  }, [combinedHandleCreatePost]);

  const handleCreateBoard = useCallback(async (data: any) => {
    return combinedHandleCreateBoard(data);
  }, [combinedHandleCreateBoard]);

  const handleLocationBoardSelect = useCallback((board: Board) => {
    setLocationBoards((prev) => {
      if (prev.some(b => b.id === board.id)) return prev;
      return [...prev, board];
    });
    navigateToBoard(board.id);
    setViewMode(ViewMode.FEED);
  }, [navigateToBoard, setViewMode]);

  const handleEditPost = useCallback((postId: string) => {
    setEditingPostId(postId);
  }, []);

  const handleSavePost = useCallback((postId: string, updates: any) => {
    return combinedHandleSavePost(postId, updates);
  }, [combinedHandleSavePost]);

  const handleDeletePost = useCallback(async (postId: string) => {
    return combinedHandleDeletePost(postId);
  }, [combinedHandleDeletePost]);

  const contextValue: UIContextType = {
    // UI State
    viewMode,
    selectedBitId,
    activeBoardId,
    theme,
    feedFilter,
    searchQuery,
    sortMode,
    profileUser,
    editingPostId,
    locationBoards,

    // UI Actions
    setViewMode,
    setSelectedBitId,
    setActiveBoardId,
    setTheme,
    setFeedFilter,
    setSearchQuery,
    setSortMode,
    setProfileUser,
    setEditingPostId,
    setLocationBoards,

    // UI Helpers
    getThemeColor,
    handleViewBit,
    navigateToBoard,
    returnToFeed,
    handleTagClick,
    handleSearch,

    // Complex handlers
    handleCreatePost,
    handleCreateBoard,
    handleLocationBoardSelect,
    handleEditPost,
    handleSavePost,
    handleDeletePost,
    loadMorePosts: combinedLoadMorePosts,
  };

  return (
    <UIContext.Provider value={contextValue}>
      {children}
    </UIContext.Provider>
  );
};

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};
