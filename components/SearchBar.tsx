import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      onSearch(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, onSearch]);

  const handleClear = useCallback(() => {
    setQuery('');
    onSearch('');
    inputRef.current?.focus();
  }, [onSearch]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClear();
      inputRef.current?.blur();
    }
  }, [handleClear]);

  return (
    <div 
      className={`relative flex items-center border transition-all duration-200 bg-terminal-bg
        ${isFocused 
          ? 'border-terminal-text shadow-glow' 
          : 'border-terminal-dim hover:border-terminal-text/50'
        }
      `}
    >
      <Search 
        size={16} 
        className={`absolute left-3 transition-colors ${isFocused ? 'text-terminal-text' : 'text-terminal-dim'}`} 
      />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full bg-transparent py-2 pl-10 pr-8 text-sm text-terminal-text font-mono 
          placeholder:text-terminal-dim/50 focus:outline-none"
      />
      {query && (
        <button
          onClick={handleClear}
          className="absolute right-2 p-1 text-terminal-dim hover:text-terminal-text transition-colors"
          title="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};
