import React, { useState, useRef, useEffect, useCallback, memo } from 'react';

// ============================================
// LAZY IMAGE COMPONENT
// ============================================
// Uses Intersection Observer for efficient lazy loading
// Includes blur-up placeholder effect and error handling

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  placeholderColor?: string;
  width?: number | string;
  height?: number | string;
  aspectRatio?: string;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  onLoad?: () => void;
  onError?: () => void;
  priority?: boolean;      // Skip lazy loading for above-the-fold images
  threshold?: number;      // Intersection threshold (0-1)
  rootMargin?: string;     // Margin around viewport for preloading
}

// Cache for loaded images to prevent re-loading
const imageCache = new Set<string>();

export const LazyImage = memo<LazyImageProps>(({
  src,
  alt,
  className = '',
  placeholderColor = 'rgb(var(--color-terminal-dim) / 0.2)',
  width,
  height,
  aspectRatio,
  objectFit = 'cover',
  onLoad,
  onError,
  priority = false,
  threshold = 0.1,
  rootMargin = '200px',
}) => {
  const [isLoaded, setIsLoaded] = useState(imageCache.has(src));
  const [isInView, setIsInView] = useState(priority || imageCache.has(src));
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority || isInView) return;

    const element = imgRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [priority, isInView, threshold, rootMargin]);

  // Handle image load
  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    imageCache.add(src);
    onLoad?.();
  }, [src, onLoad]);

  // Handle image error
  const handleError = useCallback(() => {
    setHasError(true);
    onError?.();
  }, [onError]);

  // Container styles
  const containerStyle: React.CSSProperties = {
    width: width || '100%',
    height: height || (aspectRatio ? 'auto' : '100%'),
    aspectRatio: aspectRatio,
    backgroundColor: placeholderColor,
    position: 'relative',
    overflow: 'hidden',
  };

  // Image styles
  const imageStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit,
    opacity: isLoaded ? 1 : 0,
    transition: 'opacity 0.3s ease-in-out',
  };

  // Placeholder styles (blur effect)
  const placeholderStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    backgroundColor: placeholderColor,
    opacity: isLoaded ? 0 : 1,
    transition: 'opacity 0.3s ease-in-out',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  if (hasError) {
    return (
      <div
        ref={imgRef}
        style={containerStyle}
        className={`lazy-image lazy-image--error ${className}`}
      >
        <div style={placeholderStyle}>
          <span className="text-terminal-dim text-xs opacity-50">
            ⚠ Image failed
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={imgRef}
      style={containerStyle}
      className={`lazy-image ${isLoaded ? 'lazy-image--loaded' : ''} ${className}`}
    >
      {/* Placeholder */}
      <div style={placeholderStyle}>
        {!isInView && (
          <div className="w-6 h-6 border border-terminal-dim/30 animate-pulse" />
        )}
        {isInView && !isLoaded && (
          <div className="w-6 h-6 border border-terminal-dim/50 animate-spin rounded-full border-t-transparent" />
        )}
      </div>

      {/* Actual Image */}
      {isInView && (
        <img
          src={src}
          alt={alt}
          style={imageStyle}
          onLoad={handleLoad}
          onError={handleError}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
        />
      )}
    </div>
  );
});

LazyImage.displayName = 'LazyImage';

// ============================================
// LAZY BACKGROUND IMAGE
// ============================================
// For background images (banners, etc.)

interface LazyBackgroundProps {
  src: string;
  children?: React.ReactNode;
  className?: string;
  placeholderColor?: string;
  threshold?: number;
  rootMargin?: string;
}

export const LazyBackground = memo<LazyBackgroundProps>(({
  src,
  children,
  className = '',
  placeholderColor = 'rgb(var(--color-terminal-dim) / 0.2)',
  threshold = 0.1,
  rootMargin = '200px',
}) => {
  const [isLoaded, setIsLoaded] = useState(imageCache.has(src));
  const [isInView, setIsInView] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Intersection Observer
  useEffect(() => {
    if (isLoaded) {
      setIsInView(true);
      return;
    }

    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      { threshold, rootMargin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [isLoaded, threshold, rootMargin]);

  // Preload image
  useEffect(() => {
    if (!isInView || isLoaded) return;

    const img = new Image();
    img.onload = () => {
      setIsLoaded(true);
      imageCache.add(src);
    };
    img.src = src;
  }, [src, isInView, isLoaded]);

  return (
    <div
      ref={containerRef}
      className={`lazy-background ${className}`}
      style={{
        backgroundColor: placeholderColor,
        backgroundImage: isLoaded ? `url(${src})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        transition: 'background-image 0.3s ease-in-out',
      }}
    >
      {children}
    </div>
  );
});

LazyBackground.displayName = 'LazyBackground';

// ============================================
// UTILITIES
// ============================================

/**
 * Preload images for better UX
 */
export function preloadImages(urls: string[]): void {
  urls.forEach(url => {
    if (!imageCache.has(url)) {
      const img = new Image();
      img.onload = () => imageCache.add(url);
      img.src = url;
    }
  });
}

/**
 * Clear image cache (useful for memory management)
 */
export function clearImageCache(): void {
  imageCache.clear();
}

/**
 * Get cache size
 */
export function getImageCacheSize(): number {
  return imageCache.size;
}

export default LazyImage;
