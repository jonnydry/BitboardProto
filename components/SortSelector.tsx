import React from 'react';
import { SortMode } from '../types';
import { ArrowUpDown, Clock, TrendingUp, MessageSquare, Trophy } from 'lucide-react';

interface SortSelectorProps {
  currentSort: SortMode;
  onSortChange: (sort: SortMode) => void;
}

const SORT_OPTIONS = [
  { id: SortMode.TOP, label: 'TOP', icon: Trophy, description: 'Highest score' },
  { id: SortMode.NEWEST, label: 'NEW', icon: Clock, description: 'Most recent' },
  { id: SortMode.TRENDING, label: 'HOT', icon: TrendingUp, description: 'Trending now' },
  { id: SortMode.COMMENTS, label: 'ACTIVE', icon: MessageSquare, description: 'Most discussed' },
] as const;

export const SortSelector: React.FC<SortSelectorProps> = ({ currentSort, onSortChange }) => {
  return (
    <div className="flex items-center gap-1 text-xs">
      <ArrowUpDown size={12} className="text-terminal-dim mr-1" />
      {SORT_OPTIONS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onSortChange(id)}
          title={SORT_OPTIONS.find(o => o.id === id)?.description}
          className={`px-2 py-1 border transition-all duration-150 flex items-center gap-1
            ${currentSort === id 
              ? 'border-terminal-text text-terminal-text bg-terminal-dim/20' 
              : 'border-terminal-dim/50 text-terminal-dim hover:border-terminal-dim hover:text-terminal-text'
            }
          `}
        >
          <Icon size={10} />
          {label}
        </button>
      ))}
    </div>
  );
};
