import { useEffect, useMemo, useRef, useState } from 'react';
import type { DirectMessage } from '../services/dmService';

interface UseVisibleMessagesArgs {
  messages: DirectMessage[];
  pageSize: number;
  resetKey: string;
}

export function useVisibleMessages(args: UseVisibleMessagesArgs) {
  const { messages, pageSize, resetKey } = args;
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const scrollHeightBeforeRef = useRef<number | null>(null);

  const totalMessages = messages.length;
  const visibleMessages = useMemo(() => {
    const startIndex = Math.max(0, totalMessages - visibleCount);
    return messages.slice(startIndex);
  }, [messages, totalMessages, visibleCount]);

  const hasEarlierMessages = totalMessages > visibleCount;

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [pageSize, resetKey]);

  const handleLoadEarlier = () => {
    const container = messagesContainerRef.current;
    if (container) {
      scrollHeightBeforeRef.current = container.scrollHeight;
    }
    setVisibleCount((value) => value + pageSize);
  };

  useEffect(() => {
    if (scrollHeightBeforeRef.current === null) {
      return;
    }

    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const scrollHeightAfter = container.scrollHeight;
        const scrollHeightBefore = scrollHeightBeforeRef.current!;
        container.scrollTop = scrollHeightAfter - scrollHeightBefore;
        scrollHeightBeforeRef.current = null;
      });
    });
  }, [visibleCount]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      if (isNearBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages.length]);

  return {
    visibleMessages,
    hasEarlierMessages,
    totalMessages,
    visibleCount,
    messagesEndRef,
    messagesContainerRef,
    handleLoadEarlier,
  };
}
