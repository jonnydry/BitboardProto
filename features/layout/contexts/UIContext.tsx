import React, { createContext, useContext, useState } from 'react';
import { ViewMode, ThemeId, SortMode } from '../../../types';

interface UIContextType {
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

const UIContext = createContext<UIContextType | null>(null);

export const UIProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.FEED);
  const [theme, setTheme] = useState<ThemeId>(ThemeId.AMBER);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>(SortMode.TOP);
  const [profileUser, setProfileUser] = useState<{ username: string; pubkey?: string } | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  const contextValue: UIContextType = {
    viewMode,
    theme,
    searchQuery,
    sortMode,
    profileUser,
    editingPostId,
    setViewMode,
    setTheme,
    setSearchQuery,
    setSortMode,
    setProfileUser,
    setEditingPostId,
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