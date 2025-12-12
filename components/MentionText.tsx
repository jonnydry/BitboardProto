import React, { useMemo } from 'react';
import { mentionService } from '../services/mentionService';

interface MentionTextProps {
  content: string;
  onMentionClick?: (username: string) => void;
  className?: string;
}

/**
 * Component that renders text with @mentions as clickable links
 */
export const MentionText: React.FC<MentionTextProps> = ({
  content,
  onMentionClick,
  className = '',
}) => {
  const renderedContent = useMemo(() => {
    return mentionService.renderWithMentions(content, onMentionClick);
  }, [content, onMentionClick]);

  return (
    <span className={className}>
      {renderedContent}
    </span>
  );
};
