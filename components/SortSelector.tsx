import React from 'react';
import { SortMode } from '../types';

interface SortSelectorProps {
  currentSort: SortMode;
  onSortChange: (sort: SortMode) => void;
}

const SORT_OPTIONS = [
  { id: SortMode.TRENDING, label: 'HOT', description: 'Trending now' },
  { id: SortMode.NEWEST, label: 'NEW', description: 'Most recent' },
  { id: SortMode.TOP, label: 'TOP', description: 'Highest score' },
  { id: SortMode.COMMENTS, label: 'ACTIVE', description: 'Most discussed' },
] as const;

export const SortSelector: React.FC<SortSelectorProps> = ({ currentSort, onSortChange }) => {
  return (
    <div className="flex items-center gap-1 text-xs">
      {SORT_OPTIONS.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onSortChange(id)}
          title={SORT_OPTIONS.find((o) => o.id === id)?.description}
          className={`px-3 py-2 md:px-3 md:py-2 border uppercase tracking-wider transition-all duration-150
            ${
              currentSort === id
                ? 'border-terminal-text text-terminal-text bg-terminal-dim/10'
                : 'border-terminal-dim/40 text-terminal-dim hover:border-terminal-dim hover:text-terminal-text'
            }
          `}
        >
          {label}
        </button>
      ))}
    </div>
  );
};
