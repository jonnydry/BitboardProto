import React, { useRef, useEffect, useState } from 'react';

interface UseInfiniteScrollOptions {
  threshold?: number; // How many pixels before bottom to trigger (default: 200)
  debounceMs?: number; // Debounce time in ms (default: 200)
}

interface UseInfiniteScrollResult {
  loaderRef: React.RefObject<HTMLDivElement>;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

/**
 * Hook for implementing infinite scroll using IntersectionObserver
 *
 * Uses refs for isLoading/hasMore inside the observer callback to keep the
 * observer stable and avoid disconnecting/reconnecting on every load cycle.
 */
export function useInfiniteScroll(
  loadMore: () => Promise<void>,
  hasMore: boolean,
  options: UseInfiniteScrollOptions = {},
): UseInfiniteScrollResult {
  const { threshold = 200, debounceMs = 200 } = options;

  const loaderRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const loadMoreRef = useRef(loadMore);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep mutable refs in sync so the observer callback always sees fresh values
  const isLoadingRef = useRef(isLoading);
  const hasMoreRef = useRef(hasMore);

  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  // Set up IntersectionObserver — depends only on threshold (stable)
  useEffect(() => {
    const loader = loaderRef.current;
    if (!loader) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMoreRef.current && !isLoadingRef.current) {
          // Clear any existing debounce timer
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }

          debounceTimerRef.current = setTimeout(async () => {
            // Re-check refs inside the timeout for freshest state
            if (!hasMoreRef.current || isLoadingRef.current) return;
            setIsLoading(true);
            try {
              await loadMoreRef.current();
            } catch (error) {
              console.error('[InfiniteScroll] Failed to load more:', error);
            } finally {
              setIsLoading(false);
            }
          }, debounceMs);
        }
      },
      {
        root: null,
        rootMargin: `${threshold}px`,
        threshold: 0,
      },
    );

    observer.observe(loader);

    return () => {
      observer.disconnect();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [threshold, debounceMs]);

  return {
    loaderRef,
    isLoading,
    setIsLoading,
  };
}
