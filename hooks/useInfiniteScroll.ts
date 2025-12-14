import React, { useRef, useCallback, useEffect, useState } from 'react';

interface UseInfiniteScrollOptions {
  threshold?: number;      // How many pixels before bottom to trigger (default: 200)
  debounceMs?: number;     // Debounce time in ms (default: 200)
}

interface UseInfiniteScrollResult {
  loaderRef: React.RefObject<HTMLDivElement>;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

/**
 * Hook for implementing infinite scroll using IntersectionObserver
 * 
 * @param loadMore - Async function to load more items
 * @param hasMore - Whether there are more items to load
 * @param options - Configuration options
 * @returns Object with loaderRef to attach to sentinel element and loading state
 */
export function useInfiniteScroll(
  loadMore: () => Promise<void>,
  hasMore: boolean,
  options: UseInfiniteScrollOptions = {}
): UseInfiniteScrollResult {
  const { threshold = 200, debounceMs = 200 } = options;
  
  const loaderRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const loadMoreRef = useRef(loadMore);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep loadMore reference up to date
  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

  // Debounced load handler
  const handleIntersect = useCallback(async () => {
    if (isLoading || !hasMore) return;

    // Clear any existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the load
    debounceTimerRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        await loadMoreRef.current();
      } catch (error) {
        console.error('[InfiniteScroll] Failed to load more:', error);
      } finally {
        setIsLoading(false);
      }
    }, debounceMs);
  }, [isLoading, hasMore, debounceMs]);

  // Set up IntersectionObserver
  useEffect(() => {
    const loader = loaderRef.current;
    if (!loader) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !isLoading) {
          handleIntersect();
        }
      },
      {
        root: null,
        rootMargin: `${threshold}px`,
        threshold: 0,
      }
    );

    observer.observe(loader);

    return () => {
      observer.disconnect();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [hasMore, isLoading, handleIntersect, threshold]);

  return {
    loaderRef,
    isLoading,
    setIsLoading,
  };
}
