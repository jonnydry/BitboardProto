import React, { useState, useRef, useCallback, useEffect } from 'react';
import { mentionService } from '../services/mentionService';

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  knownUsers: Set<string>;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  minHeight?: string;
}

export const MentionInput: React.FC<MentionInputProps> = ({
  value,
  onChange,
  knownUsers,
  placeholder = 'Type your message...',
  className = '',
  autoFocus = false,
  minHeight = '60px',
}) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Detect mention in progress and update suggestions
  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    
    onChange(newValue);

    // Check if typing a mention
    const mentionInProgress = mentionService.detectMentionInProgress(newValue, cursorPos);
    
    if (mentionInProgress) {
      const newSuggestions = mentionService.getAutocompleteSuggestions(
        mentionInProgress.query,
        knownUsers,
        5
      );
      setSuggestions(newSuggestions);
      setMentionStart(mentionInProgress.startIndex);
      setSelectedIndex(0);
    } else {
      setSuggestions([]);
      setMentionStart(null);
    }
  }, [onChange, knownUsers]);

  // Handle keyboard navigation in suggestions
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case 'Tab':
      case 'Enter':
        if (suggestions.length > 0 && mentionStart !== null) {
          e.preventDefault();
          insertSuggestion(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setSuggestions([]);
        setMentionStart(null);
        break;
    }
  }, [suggestions, selectedIndex, mentionStart]);

  // Insert selected suggestion
  const insertSuggestion = useCallback((username: string) => {
    if (mentionStart === null || !textareaRef.current) return;

    const cursorPos = textareaRef.current.selectionStart || 0;
    const { newText, newCursorPosition } = mentionService.insertMention(
      value,
      username,
      mentionStart,
      cursorPos
    );

    onChange(newText);
    setSuggestions([]);
    setMentionStart(null);

    // Set cursor position after React updates
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = newCursorPosition;
        textareaRef.current.selectionEnd = newCursorPosition;
        textareaRef.current.focus();
      }
    }, 0);
  }, [mentionStart, value, onChange]);

  // Handle click on suggestion
  const handleSuggestionClick = useCallback((username: string) => {
    insertSuggestion(username);
  }, [insertSuggestion]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.mention-input-container')) {
        setSuggestions([]);
        setMentionStart(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="mention-input-container relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`bg-terminal-bg border border-terminal-dim p-2 text-sm text-terminal-text 
          focus:border-terminal-text focus:outline-none w-full font-mono resize-y ${className}`}
        style={{ minHeight }}
      />

      {/* Autocomplete dropdown */}
      {suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 border border-terminal-dim bg-terminal-bg shadow-hard max-h-40 overflow-y-auto">
          {suggestions.map((username, index) => (
            <button
              key={username}
              onClick={() => handleSuggestionClick(username)}
              className={`w-full text-left px-3 py-2 text-sm font-mono transition-colors
                ${index === selectedIndex 
                  ? 'bg-terminal-dim/30 text-terminal-text' 
                  : 'text-terminal-dim hover:bg-terminal-dim/20 hover:text-terminal-text'
                }`}
            >
              <span className="text-terminal-text">@</span>
              {username}
            </button>
          ))}
          <div className="px-3 py-1 text-[10px] text-terminal-dim border-t border-terminal-dim/30">
            TAB or ENTER to select • ESC to close
          </div>
        </div>
      )}
    </div>
  );
};
