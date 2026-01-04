import React, { useState, useCallback, useEffect, useMemo, memo } from 'react';
import { 
  reactionService, 
  AVAILABLE_REACTIONS, 
  REACTION_LABELS, 
  type ReactionEmoji, 
  type ReactionCounts,
  type ReactionState 
} from '../services/reactionService';
import { Smile } from 'lucide-react';

// ============================================
// REACTION DISPLAY - Shows reaction counts
// ============================================

interface ReactionDisplayProps {
  counts: ReactionCounts;
  userReaction: ReactionEmoji | null;
  onReact: (emoji: ReactionEmoji) => void;
  disabled?: boolean;
  compact?: boolean;
}

export const ReactionDisplay = memo<ReactionDisplayProps>(({
  counts,
  userReaction,
  onReact,
  disabled = false,
  compact = false,
}) => {
  const [showPicker, setShowPicker] = useState(false);

  // Get reactions with counts > 0
  const activeReactions = useMemo(() => {
    return AVAILABLE_REACTIONS.filter(emoji => counts[emoji] > 0);
  }, [counts]);

  const handleEmojiClick = useCallback((emoji: ReactionEmoji) => {
    if (!disabled) {
      onReact(emoji);
      setShowPicker(false);
    }
  }, [onReact, disabled]);

  const handleTogglePicker = useCallback(() => {
    if (!disabled) {
      setShowPicker(prev => !prev);
    }
  }, [disabled]);

  // Close picker when clicking outside
  useEffect(() => {
    if (!showPicker) return;
    
    const handleClickOutside = () => setShowPicker(false);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showPicker]);

  if (compact && counts.total === 0) {
    // Compact mode with no reactions: just show add button
    return (
      <div className="relative inline-flex">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleTogglePicker();
          }}
          disabled={disabled}
          className={`p-1 text-terminal-dim hover:text-terminal-text transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          title="Add reaction"
          aria-label="Add reaction"
        >
          <Smile size={14} />
        </button>
        
        {showPicker && (
          <ReactionPickerPopup
            onSelect={handleEmojiClick}
            userReaction={userReaction}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* Active reactions */}
      {activeReactions.map(emoji => (
        <button
          key={emoji}
          onClick={(e) => {
            e.stopPropagation();
            handleEmojiClick(emoji);
          }}
          disabled={disabled}
          className={`
            inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded border transition-all
            ${userReaction === emoji
              ? 'border-terminal-text bg-terminal-text/10 text-terminal-text'
              : 'border-terminal-dim/50 hover:border-terminal-dim text-terminal-dim hover:text-terminal-text'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
          title={`${REACTION_LABELS[emoji]}${userReaction === emoji ? ' (click to remove)' : ''}`}
        >
          <span>{emoji}</span>
          <span className="font-mono">{counts[emoji]}</span>
        </button>
      ))}

      {/* Add reaction button */}
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleTogglePicker();
          }}
          disabled={disabled}
          className={`
            inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded border border-dashed
            border-terminal-dim/30 text-terminal-dim hover:border-terminal-dim hover:text-terminal-text
            transition-colors
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          title="Add reaction"
          aria-label="Add reaction"
        >
          <Smile size={12} />
          {!compact && <span className="text-[10px]">+</span>}
        </button>

        {showPicker && (
          <ReactionPickerPopup
            onSelect={handleEmojiClick}
            userReaction={userReaction}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>
    </div>
  );
});
ReactionDisplay.displayName = 'ReactionDisplay';

// ============================================
// REACTION PICKER POPUP
// ============================================

interface ReactionPickerPopupProps {
  onSelect: (emoji: ReactionEmoji) => void;
  userReaction: ReactionEmoji | null;
  onClose: () => void;
}

const ReactionPickerPopup = memo<ReactionPickerPopupProps>(({
  onSelect,
  userReaction,
  onClose: _onClose,
}) => {
  return (
    <div 
      className="absolute bottom-full left-0 mb-1 z-50 animate-fade-in"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-terminal-bg border border-terminal-dim shadow-lg p-1 flex gap-0.5">
        {AVAILABLE_REACTIONS.map(emoji => (
          <button
            key={emoji}
            onClick={() => onSelect(emoji)}
            className={`
              p-1.5 text-lg hover:bg-terminal-dim/30 rounded transition-colors
              ${userReaction === emoji ? 'bg-terminal-text/20 ring-1 ring-terminal-text' : ''}
            `}
            title={REACTION_LABELS[emoji]}
            aria-label={REACTION_LABELS[emoji]}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
});
ReactionPickerPopup.displayName = 'ReactionPickerPopup';

// ============================================
// REACTION BAR - Full featured for posts
// ============================================

interface ReactionBarProps {
  eventId: string;
  nostrEventId?: string;
  disabled?: boolean;
  compact?: boolean;
}

export const ReactionBar = memo<ReactionBarProps>(({
  eventId,
  nostrEventId,
  disabled = false,
  compact = false,
}) => {
  const [state, setState] = useState<ReactionState>(() => 
    reactionService.getReactionState(nostrEventId || eventId)
  );
  const [isLoading, setIsLoading] = useState(false);

  // Subscribe to reaction changes
  useEffect(() => {
    const unsubscribe = reactionService.subscribe(() => {
      setState(reactionService.getReactionState(nostrEventId || eventId));
    });
    return unsubscribe;
  }, [eventId, nostrEventId]);

  // Fetch reactions when component mounts
  useEffect(() => {
    if (nostrEventId) {
      reactionService.fetchReactions([nostrEventId]).catch(() => {
        // Ignore fetch errors
      });
    }
  }, [nostrEventId]);

  const handleReact = useCallback(async (emoji: ReactionEmoji) => {
    if (!nostrEventId || isLoading) return;
    
    setIsLoading(true);
    try {
      await reactionService.react(nostrEventId, emoji);
    } finally {
      setIsLoading(false);
    }
  }, [nostrEventId, isLoading]);

  return (
    <ReactionDisplay
      counts={state.counts}
      userReaction={state.userReaction}
      onReact={handleReact}
      disabled={disabled || !nostrEventId || isLoading}
      compact={compact}
    />
  );
});
ReactionBar.displayName = 'ReactionBar';

export default ReactionBar;
