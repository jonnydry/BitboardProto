import React, { useCallback, useRef, useEffect, useState } from 'react';

// ============================================
// PERFORMANCE HOOKS
// ============================================
// Collection of hooks for performance optimization

/**
 * Debounce hook - delays function execution
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Debounced callback hook - memoized debounced function
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return useCallback(
    ((...args: unknown[]) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => callbackRef.current(...args), delay);
    }) as T,
    [delay]
  );
}

/**
 * Throttle hook - limits function execution rate
 */
export function useThrottle<T>(value: T, limit: number): T {
  const [throttledValue, setThrottledValue] = useState(value);
  const lastRan = useRef(Date.now());

  useEffect(() => {
    const handler = setTimeout(() => {
      if (Date.now() - lastRan.current >= limit) {
        setThrottledValue(value);
        lastRan.current = Date.now();
      }
    }, limit - (Date.now() - lastRan.current));

    return () => clearTimeout(handler);
  }, [value, limit]);

  return throttledValue;
}

/**
 * Throttled callback hook
 */
export function useThrottledCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  limit: number
): T {
  const lastRan = useRef(0);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback(
    ((...args: unknown[]) => {
      const now = Date.now();
      if (now - lastRan.current >= limit) {
        lastRan.current = now;
        callbackRef.current(...args);
      }
    }) as T,
    [limit]
  );
}

/**
 * Intersection Observer hook for visibility tracking
 */
export function useIntersectionObserver(
  options: IntersectionObserverInit = {}
): [React.RefObject<HTMLDivElement>, boolean] {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, options);

    observer.observe(element);
    return () => observer.disconnect();
  }, [options.threshold, options.root, options.rootMargin]);

  return [ref, isIntersecting];
}

/**
 * Previous value hook - useful for comparison
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

/**
 * Memoized selector with shallow comparison
 */
export function useShallowMemo<T extends object>(value: T): T {
  const ref = useRef<T>(value);
  
  if (!shallowEqual(ref.current, value)) {
    ref.current = value;
  }
  
  return ref.current;
}

function shallowEqual<T extends object>(a: T, b: T): boolean {
  if (a === b) return true;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if ((a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) return false;
  }
  return true;
}

/**
 * Request idle callback hook - execute when browser is idle
 */
export function useIdleCallback(
  callback: () => void,
  options?: { timeout?: number }
): void {
  useEffect(() => {
    const handle = 'requestIdleCallback' in window
      ? (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout?: number }) => number })
          .requestIdleCallback(callback, options)
      : setTimeout(callback, 1);

    return () => {
      if ('cancelIdleCallback' in window) {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(handle as number);
      } else {
        clearTimeout(handle as number);
      }
    };
  }, [callback, options?.timeout]);
}

/**
 * Media query hook for responsive optimizations
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => 
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    
    mediaQuery.addEventListener('change', handler);
    setMatches(mediaQuery.matches);
    
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/**
 * Reduced motion preference hook
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/**
 * Memory usage tracking (development only)
 */
export function useMemoryUsage(): { usedHeapSize: number; totalHeapSize: number } | null {
  const [memory, setMemory] = useState<{ usedHeapSize: number; totalHeapSize: number } | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    
    interface PerformanceMemory {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
    }
    
    const perf = performance as Performance & { memory?: PerformanceMemory };
    if (!perf.memory) return;

    const update = () => {
      if (perf.memory) {
        setMemory({
          usedHeapSize: perf.memory.usedJSHeapSize,
          totalHeapSize: perf.memory.totalJSHeapSize,
        });
      }
    };

    update();
    const interval = setInterval(update, 5000);
    return () => clearInterval(interval);
  }, []);

  return memory;
}

/**
 * Render count hook (development only)
 */
export function useRenderCount(name: string): number {
  const renderCount = useRef(0);
  renderCount.current += 1;

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[RenderCount] ${name}: ${renderCount.current}`);
    }
  });

  return renderCount.current;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Batch DOM reads/writes to prevent layout thrashing
 */
export const batchedUpdates = {
  reads: [] as (() => void)[],
  writes: [] as (() => void)[],
  scheduled: false,

  read(fn: () => void): void {
    this.reads.push(fn);
    this.schedule();
  },

  write(fn: () => void): void {
    this.writes.push(fn);
    this.schedule();
  },

  schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;

    requestAnimationFrame(() => {
      // Execute reads first
      const reads = this.reads;
      this.reads = [];
      reads.forEach(fn => fn());

      // Then writes
      const writes = this.writes;
      this.writes = [];
      writes.forEach(fn => fn());

      this.scheduled = false;
    });
  },
};

/**
 * Check if we should skip animations (reduced motion or low battery)
 */
export function shouldReduceMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Defer non-critical work
 */
export function deferWork(callback: () => void, priority: 'high' | 'normal' | 'low' = 'normal'): void {
  const timeouts = { high: 0, normal: 100, low: 500 };
  
  if ('requestIdleCallback' in window && priority !== 'high') {
    (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout?: number }) => number })
      .requestIdleCallback(callback, { timeout: timeouts[priority] + 1000 });
  } else {
    setTimeout(callback, timeouts[priority]);
  }
}

export default {
  useDebounce,
  useDebouncedCallback,
  useThrottle,
  useThrottledCallback,
  useIntersectionObserver,
  usePrevious,
  useShallowMemo,
  useIdleCallback,
  useMediaQuery,
  usePrefersReducedMotion,
  useMemoryUsage,
  useRenderCount,
  batchedUpdates,
  shouldReduceMotion,
  deferWork,
};
