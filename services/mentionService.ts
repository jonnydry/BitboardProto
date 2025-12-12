import React from 'react';

// ============================================
// MENTION SERVICE
// ============================================
// Handles @mention parsing, rendering, and autocomplete

export interface MentionMatch {
  username: string;
  startIndex: number;
  endIndex: number;
}

// Regex to match @mentions (alphanumeric, underscores, and dots)
// Matches: @username, @user_name, @user.name, @u/username
const MENTION_REGEX = /@([a-zA-Z0-9_./]+)/g;

class MentionService {
  /**
   * Parse @mentions from content
   * @returns Array of matches with username and positions
   */
  parseMentions(content: string): MentionMatch[] {
    const matches: MentionMatch[] = [];
    let match: RegExpExecArray | null;
    
    // Reset regex lastIndex
    MENTION_REGEX.lastIndex = 0;
    
    while ((match = MENTION_REGEX.exec(content)) !== null) {
      matches.push({
        username: match[1], // The captured group (without @)
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }
    
    return matches;
  }

  /**
   * Check if content contains any @mentions
   */
  hasMentions(content: string): boolean {
    MENTION_REGEX.lastIndex = 0;
    return MENTION_REGEX.test(content);
  }

  /**
   * Extract unique usernames mentioned in content
   */
  getUniqueMentions(content: string): string[] {
    const mentions = this.parseMentions(content);
    return [...new Set(mentions.map(m => m.username))];
  }

  /**
   * Render content with clickable @mention components
   * Returns an array of React nodes (strings and span elements)
   */
  renderWithMentions(
    content: string,
    onMentionClick?: (username: string) => void
  ): React.ReactNode[] {
    const mentions = this.parseMentions(content);
    
    if (mentions.length === 0) {
      return [content];
    }

    const result: React.ReactNode[] = [];
    let lastIndex = 0;

    mentions.forEach((mention, idx) => {
      // Add text before the mention
      if (mention.startIndex > lastIndex) {
        result.push(content.slice(lastIndex, mention.startIndex));
      }

      // Add the mention as a clickable element
      const mentionText = `@${mention.username}`;
      result.push(
        React.createElement(
          'button',
          {
            key: `mention-${idx}-${mention.startIndex}`,
            onClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              onMentionClick?.(mention.username);
            },
            className: 'text-terminal-text font-bold hover:underline cursor-pointer bg-transparent border-none p-0 inline',
            title: `View ${mention.username}'s profile`,
          },
          mentionText
        )
      );

      lastIndex = mention.endIndex;
    });

    // Add remaining text after the last mention
    if (lastIndex < content.length) {
      result.push(content.slice(lastIndex));
    }

    return result;
  }

  /**
   * Filter usernames for autocomplete suggestions
   * @param query - The partial username being typed (without @)
   * @param knownUsers - Set of known usernames to search
   * @param limit - Maximum number of suggestions
   */
  getAutocompleteSuggestions(
    query: string,
    knownUsers: Set<string>,
    limit: number = 5
  ): string[] {
    if (!query.trim()) return [];

    const lowerQuery = query.toLowerCase();
    const suggestions: string[] = [];

    for (const username of knownUsers) {
      if (username.toLowerCase().startsWith(lowerQuery)) {
        suggestions.push(username);
        if (suggestions.length >= limit) break;
      }
    }

    // If not enough prefix matches, try contains
    if (suggestions.length < limit) {
      for (const username of knownUsers) {
        if (
          !suggestions.includes(username) &&
          username.toLowerCase().includes(lowerQuery)
        ) {
          suggestions.push(username);
          if (suggestions.length >= limit) break;
        }
      }
    }

    return suggestions;
  }

  /**
   * Detect if user is currently typing a mention
   * @param text - Current input text
   * @param cursorPosition - Current cursor position
   * @returns The partial mention being typed, or null
   */
  detectMentionInProgress(
    text: string,
    cursorPosition: number
  ): { query: string; startIndex: number } | null {
    // Look backwards from cursor to find @
    let startIndex = cursorPosition - 1;
    
    while (startIndex >= 0) {
      const char = text[startIndex];
      
      // Found the @ symbol
      if (char === '@') {
        const query = text.slice(startIndex + 1, cursorPosition);
        // Only valid if query contains valid characters
        if (/^[a-zA-Z0-9_./]*$/.test(query)) {
          return { query, startIndex };
        }
        return null;
      }
      
      // Invalid character for mention - stop searching
      if (!/[a-zA-Z0-9_./]/.test(char)) {
        return null;
      }
      
      startIndex--;
    }
    
    return null;
  }

  /**
   * Insert a mention into text at the given position
   */
  insertMention(
    text: string,
    username: string,
    mentionStartIndex: number,
    cursorPosition: number
  ): { newText: string; newCursorPosition: number } {
    const before = text.slice(0, mentionStartIndex);
    const after = text.slice(cursorPosition);
    const mention = `@${username} `;
    
    return {
      newText: before + mention + after,
      newCursorPosition: mentionStartIndex + mention.length,
    };
  }
}

export const mentionService = new MentionService();
