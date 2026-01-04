import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Filter, X, Clock, Save, Trash2, 
  ChevronDown, ChevronUp, Image, Link2, TrendingUp,
  MessageSquare, Hash, User
} from 'lucide-react';
import {
  advancedSearchService,
  type SearchFilters,
  type SearchResult,
  type SavedSearch,
  DateRange,
  ContentType,
  SearchSortBy,
} from '../services/advancedSearchService';

// ============================================
// TYPES
// ============================================

interface AdvancedSearchProps {
  onResultClick?: (result: SearchResult) => void;
  onClose?: () => void;
  initialQuery?: string;
}

// ============================================
// ADVANCED SEARCH COMPONENT
// ============================================

export const AdvancedSearch: React.FC<AdvancedSearchProps> = ({
  onResultClick,
  onClose,
  initialQuery = '',
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<Partial<SearchFilters>>({});
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showSavedSearches, setShowSavedSearches] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Load saved searches on mount
  useEffect(() => {
    setSavedSearches(advancedSearchService.getSavedSearches());
  }, []);

  // Update suggestions as user types
  useEffect(() => {
    if (query.length >= 2) {
      setSuggestions(advancedSearchService.getSuggestions(query));
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  }, [query]);

  // Handle search
  const handleSearch = async () => {
    if (!query.trim() && Object.keys(filters).length === 0) return;

    setIsSearching(true);
    setShowSuggestions(false);
    
    try {
      const searchResults = await advancedSearchService.search({
        query,
        ...filters,
      });
      setResults(searchResults);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
    if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  // Save current search
  const handleSaveSearch = () => {
    if (!query.trim()) return;
    
    const name = prompt('Name this search:', query);
    if (name) {
      advancedSearchService.saveSearch(name, { query, ...filters, sortBy: filters.sortBy || SearchSortBy.RELEVANCE });
      setSavedSearches(advancedSearchService.getSavedSearches());
    }
  };

  // Execute saved search
  const handleExecuteSavedSearch = async (saved: SavedSearch) => {
    setQuery(saved.filters.query);
    setFilters(saved.filters);
    setShowSavedSearches(false);
    
    setIsSearching(true);
    try {
      const searchResults = await advancedSearchService.executeSavedSearch(saved.id);
      setResults(searchResults);
    } finally {
      setIsSearching(false);
    }
  };

  // Delete saved search
  const handleDeleteSavedSearch = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    advancedSearchService.deleteSavedSearch(id);
    setSavedSearches(advancedSearchService.getSavedSearches());
  };

  // Select suggestion
  const handleSelectSuggestion = (suggestion: string) => {
    setQuery(suggestion);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full max-h-[80vh]">
      {/* Search Header */}
      <div className="p-4 border-b border-terminal-dim">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Search size={20} />
            ADVANCED_SEARCH
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              className="ml-auto p-2 text-terminal-dim hover:text-terminal-alert transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Search Input */}
        <div className="relative">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyPress}
                onFocus={() => query.length >= 2 && setShowSuggestions(true)}
                placeholder="Search posts, comments, users..."
                className="w-full px-4 py-2 bg-black border border-terminal-dim focus:border-terminal-text outline-none"
              />
              
              {/* Suggestions Dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="absolute top-full left-0 right-0 mt-1 bg-terminal-bg border border-terminal-dim z-10 max-h-48 overflow-y-auto"
                >
                  {suggestions.map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelectSuggestion(suggestion)}
                      className="w-full px-4 py-2 text-left hover:bg-terminal-dim/20 text-sm flex items-center gap-2"
                    >
                      <Clock size={12} className="text-terminal-dim" />
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="px-4 py-2 bg-terminal-text text-black font-bold hover:bg-terminal-dim hover:text-white transition-colors"
            >
              {isSearching ? '...' : 'SEARCH'}
            </button>
          </div>

          {/* Filter Toggle & Actions */}
          <div className="flex items-center gap-2 mt-2 text-xs">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-1 text-terminal-dim hover:text-terminal-text transition-colors"
            >
              <Filter size={12} />
              Filters
              {showFilters ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            
            <button
              onClick={() => setShowSavedSearches(!showSavedSearches)}
              className="flex items-center gap-1 text-terminal-dim hover:text-terminal-text transition-colors"
            >
              <Save size={12} />
              Saved ({savedSearches.length})
            </button>

            {query.trim() && (
              <button
                onClick={handleSaveSearch}
                className="flex items-center gap-1 text-terminal-dim hover:text-terminal-text transition-colors ml-auto"
              >
                <Save size={12} />
                Save this search
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Saved Searches Panel */}
      {showSavedSearches && savedSearches.length > 0 && (
        <div className="p-3 border-b border-terminal-dim bg-terminal-dim/10">
          <div className="text-xs font-bold mb-2 text-terminal-dim">SAVED SEARCHES</div>
          <div className="flex flex-wrap gap-2">
            {savedSearches.map(saved => (
              <button
                key={saved.id}
                onClick={() => handleExecuteSavedSearch(saved)}
                className="px-2 py-1 border border-terminal-dim hover:border-terminal-text text-xs flex items-center gap-2 group"
              >
                <span>{saved.name}</span>
                <button
                  onClick={(e) => handleDeleteSavedSearch(saved.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-terminal-dim hover:text-terminal-alert transition-all"
                >
                  <X size={10} />
                </button>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters Panel */}
      {showFilters && (
        <SearchFiltersPanel filters={filters} onChange={setFilters} />
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {results.length === 0 && !isSearching && query && (
          <div className="p-8 text-center text-terminal-dim">
            No results found for "{query}"
          </div>
        )}

        {results.map(result => (
          <SearchResultItem
            key={result.id}
            result={result}
            onClick={() => onResultClick?.(result)}
          />
        ))}
      </div>
    </div>
  );
};

// ============================================
// FILTERS PANEL
// ============================================

const SearchFiltersPanel: React.FC<{
  filters: Partial<SearchFilters>;
  onChange: (filters: Partial<SearchFilters>) => void;
}> = ({ filters, onChange }) => {
  const updateFilter = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="p-4 border-b border-terminal-dim bg-terminal-dim/5 text-sm">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Date Range */}
        <div>
          <label className="text-xs text-terminal-dim block mb-1">Date Range</label>
          <select
            value={filters.dateRange || DateRange.ALL_TIME}
            onChange={(e) => updateFilter('dateRange', e.target.value as DateRange)}
            className="w-full px-2 py-1 bg-black border border-terminal-dim focus:border-terminal-text outline-none"
          >
            {Object.entries(DateRange).map(([key, value]) => (
              <option key={value} value={value}>
                {key.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* Content Type */}
        <div>
          <label className="text-xs text-terminal-dim block mb-1">Content Type</label>
          <select
            value={filters.contentType || ContentType.ALL}
            onChange={(e) => updateFilter('contentType', e.target.value as ContentType)}
            className="w-full px-2 py-1 bg-black border border-terminal-dim focus:border-terminal-text outline-none"
          >
            {Object.entries(ContentType).map(([key, value]) => (
              <option key={value} value={value}>
                {key}
              </option>
            ))}
          </select>
        </div>

        {/* Sort By */}
        <div>
          <label className="text-xs text-terminal-dim block mb-1">Sort By</label>
          <select
            value={filters.sortBy || SearchSortBy.RELEVANCE}
            onChange={(e) => updateFilter('sortBy', e.target.value as SearchSortBy)}
            className="w-full px-2 py-1 bg-black border border-terminal-dim focus:border-terminal-text outline-none"
          >
            {Object.entries(SearchSortBy).map(([key, value]) => (
              <option key={value} value={value}>
                {key.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* Min Score */}
        <div>
          <label className="text-xs text-terminal-dim block mb-1">Min Score</label>
          <input
            type="number"
            value={filters.minScore || ''}
            onChange={(e) => updateFilter('minScore', e.target.value ? parseInt(e.target.value) : undefined)}
            placeholder="Any"
            min={0}
            className="w-full px-2 py-1 bg-black border border-terminal-dim focus:border-terminal-text outline-none"
          />
        </div>
      </div>

      {/* Toggle Filters */}
      <div className="flex gap-4 mt-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.hasImage || false}
            onChange={(e) => updateFilter('hasImage', e.target.checked || undefined)}
            className="accent-terminal-text"
          />
          <Image size={14} />
          <span className="text-xs">Has Image</span>
        </label>
        
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.hasLink || false}
            onChange={(e) => updateFilter('hasLink', e.target.checked || undefined)}
            className="accent-terminal-text"
          />
          <Link2 size={14} />
          <span className="text-xs">Has Link</span>
        </label>
      </div>

      {/* Clear Filters */}
      <button
        onClick={() => onChange({})}
        className="mt-3 text-xs text-terminal-dim hover:text-terminal-alert flex items-center gap-1"
      >
        <Trash2 size={12} />
        Clear all filters
      </button>
    </div>
  );
};

// ============================================
// SEARCH RESULT ITEM
// ============================================

const SearchResultItem: React.FC<{
  result: SearchResult;
  onClick: () => void;
}> = ({ result, onClick }) => {
  return (
    <div
      onClick={onClick}
      className="p-4 border-b border-terminal-dim/30 hover:bg-terminal-dim/10 cursor-pointer transition-colors"
    >
      {/* Title */}
      {result.title && (
        <h3 className="font-bold text-terminal-text mb-1">{result.title}</h3>
      )}

      {/* Content Preview */}
      <p className="text-sm text-terminal-dim line-clamp-2">
        {result.highlightedContent || result.content}
      </p>

      {/* Metadata */}
      <div className="flex items-center gap-3 mt-2 text-xs text-terminal-dim">
        <span className="flex items-center gap-1">
          <User size={12} />
          {result.authorName || result.authorPubkey.slice(0, 8)}...
        </span>
        
        {result.boardName && (
          <span className="flex items-center gap-1">
            <Hash size={12} />
            {result.boardName}
          </span>
        )}
        
        <span className="flex items-center gap-1">
          <TrendingUp size={12} />
          {result.score}
        </span>
        
        <span className="flex items-center gap-1">
          <MessageSquare size={12} />
          {result.commentCount}
        </span>
        
        <span className="ml-auto">
          {formatDate(result.timestamp)}
        </span>
      </div>

      {/* Match Indicators */}
      <div className="flex gap-1 mt-2">
        {result.matchedOn.map(match => (
          <span
            key={match}
            className="px-1.5 py-0.5 text-xs bg-terminal-dim/20 border border-terminal-dim/50"
          >
            {match}
          </span>
        ))}
      </div>
    </div>
  );
};

// ============================================
// QUICK SEARCH BAR (for header)
// ============================================

export const QuickSearchBar: React.FC<{
  onAdvancedClick?: () => void;
  onResultClick?: (result: SearchResult) => void;
}> = ({ onAdvancedClick, onResultClick }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }

    const timeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const searchResults = await advancedSearchService.quickSearch(query, 5);
        setResults(searchResults);
        setShowResults(true);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [query]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center border border-terminal-dim focus-within:border-terminal-text">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search..."
          className="px-3 py-1.5 bg-transparent outline-none text-sm w-40 sm:w-56"
        />
        <button
          onClick={onAdvancedClick}
          className="px-2 py-1.5 text-terminal-dim hover:text-terminal-text border-l border-terminal-dim"
          title="Advanced search"
        >
          <Filter size={14} />
        </button>
      </div>

      {/* Quick Results Dropdown */}
      {showResults && (results.length > 0 || isSearching) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-terminal-bg border border-terminal-dim z-50 max-h-80 overflow-y-auto">
          {isSearching && (
            <div className="p-3 text-sm text-terminal-dim text-center">Searching...</div>
          )}
          
          {results.map(result => (
            <button
              key={result.id}
              onClick={() => {
                onResultClick?.(result);
                setShowResults(false);
                setQuery('');
              }}
              className="w-full p-3 text-left hover:bg-terminal-dim/20 border-b border-terminal-dim/30 last:border-0"
            >
              <div className="font-bold text-sm truncate">
                {result.title || result.content.slice(0, 50)}
              </div>
              <div className="text-xs text-terminal-dim truncate">
                {result.content.slice(0, 100)}
              </div>
            </button>
          ))}

          {results.length > 0 && (
            <button
              onClick={onAdvancedClick}
              className="w-full p-2 text-xs text-terminal-dim hover:text-terminal-text text-center bg-terminal-dim/10"
            >
              See all results →
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================
// HELPERS
// ============================================

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  
  return date.toLocaleDateString();
}

export default AdvancedSearch;
