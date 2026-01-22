import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Search, X, Loader2, Clock, ArrowUpRight } from 'lucide-react';
import { UIConfig } from '../config';

const RECENT_SEARCHES_KEY = 'bitboard_recent_searches';
const MAX_RECENT_SEARCHES = 5;

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  placeholder = 'Search posts, users, tags...'
}) => {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load recent searches on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      }
    } catch { /* ignore */ }
  }, []);

  // Save recent search
  const saveRecentSearch = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setRecentSearches(prev => {
      const filtered = prev.filter(s => s !== searchQuery);
      const updated = [searchQuery, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } catch { /* ignore */ }
      return updated;
    });
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Show searching indicator immediately
    if (query) {
      setIsSearching(true);
    }

    debounceRef.current = setTimeout(() => {
      onSearch(query);
      setIsSearching(false);
      if (query.trim()) {
        saveRecentSearch(query.trim());
      }
    }, UIConfig.SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, onSearch, saveRecentSearch]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClear = useCallback(() => {
    setQuery('');
    onSearch('');
    setIsSearching(false);
    inputRef.current?.focus();
  }, [onSearch]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClear();
      inputRef.current?.blur();
      setShowDropdown(false);
    }
    if (e.key === 'Enter') {
      setShowDropdown(false);
    }
  }, [handleClear]);

  const handleRecentSearchClick = useCallback((search: string) => {
    setQuery(search);
    setShowDropdown(false);
    inputRef.current?.focus();
  }, []);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    if (recentSearches.length > 0 && !query) {
      setShowDropdown(true);
    }
  }, [recentSearches.length, query]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    // Delay hiding dropdown to allow click events
    setTimeout(() => setShowDropdown(false), 150);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        className={`relative flex items-center border transition-all duration-200 bg-terminal-bg
          ${isFocused
            ? 'border-terminal-text shadow-glow'
            : 'border-terminal-dim hover:border-terminal-text/50'
          }
        `}
      >
        {/* Search icon or loading spinner */}
        {isSearching ? (
          <Loader2
            size={16}
            className="absolute left-3 text-terminal-text animate-spin"
          />
        ) : (
          <Search
            size={16}
            className={`absolute left-3 transition-colors ${isFocused ? 'text-terminal-text' : 'text-terminal-dim'}`}
          />
        )}

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full bg-transparent py-2 pl-10 pr-16 text-sm text-terminal-text font-mono
            placeholder:text-terminal-dim/50 focus:outline-none"
        />

        {/* Status indicators */}
        <div className="absolute right-2 flex items-center gap-1">
          {isSearching && (
            <span className="text-[10px] text-terminal-dim uppercase animate-pulse">
              Searching...
            </span>
          )}
          {query && !isSearching && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-terminal-dim hover:text-terminal-text transition-colors"
              title="Clear search (Esc)"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
          {!query && !isFocused && (
            <span className="text-[10px] text-terminal-dim/50 hidden md:block">
              Press /
            </span>
          )}
        </div>
      </div>

      {/* Recent searches dropdown */}
      {showDropdown && recentSearches.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-terminal-bg border border-terminal-dim shadow-hard z-20">
          <div className="px-3 py-2 text-[10px] text-terminal-dim uppercase border-b border-terminal-dim/30 flex items-center gap-1">
            <Clock size={10} />
            Recent searches
          </div>
          {recentSearches.map((search, index) => (
            <button
              key={index}
              onClick={() => handleRecentSearchClick(search)}
              className="w-full text-left px-3 py-2 text-sm text-terminal-dim hover:text-terminal-text hover:bg-terminal-dim/10 transition-colors flex items-center justify-between group"
            >
              <span className="truncate">{search}</span>
              <ArrowUpRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
