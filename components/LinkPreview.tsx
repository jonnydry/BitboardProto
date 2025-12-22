import React, { useState, useEffect, useCallback } from 'react';
import { ExternalLink, Globe, ImageOff, Loader2, AlertCircle } from 'lucide-react';
import { fetchLinkPreview, getCachedPreview, type LinkPreviewData } from '../services/linkPreviewService';

interface LinkPreviewProps {
  url: string;
  className?: string;
  compact?: boolean;
}

/**
 * OpenGraph Link Preview Card Component
 * 
 * Displays a rich preview card for URLs with:
 * - Title, description, and image from OpenGraph/Twitter Card metadata
 * - Favicon and site name
 * - Fallback states for loading and errors
 */
export const LinkPreview: React.FC<LinkPreviewProps> = ({
  url,
  className = '',
  compact = false,
}) => {
  const [preview, setPreview] = useState<LinkPreviewData | null>(() => getCachedPreview(url) || null);
  const [isLoading, setIsLoading] = useState(!getCachedPreview(url));
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadPreview = async () => {
      // Check cache first
      const cached = getCachedPreview(url);
      if (cached) {
        setPreview(cached);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const data = await fetchLinkPreview(url);
        if (!cancelled) {
          setPreview(data);
          setIsLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setPreview({ url, error: 'Failed to load preview' });
          setIsLoading(false);
        }
      }
    };

    loadPreview();
    return () => { cancelled = true; };
  }, [url]);

  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Extract domain for display
  const displayDomain = preview?.siteName || (() => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  })();

  // Loading state
  if (isLoading) {
    return (
      <div 
        className={`
          border border-terminal-dim/50 bg-terminal-bg/50 
          p-4 flex items-center gap-3 animate-pulse
          ${className}
        `}
      >
        <Loader2 size={20} className="text-terminal-dim animate-spin" />
        <div className="flex-1 min-w-0">
          <div className="h-4 bg-terminal-dim/20 rounded w-3/4 mb-2" />
          <div className="h-3 bg-terminal-dim/20 rounded w-1/2" />
        </div>
      </div>
    );
  }

  // Error state (but still clickable)
  if (preview?.error && !preview.title) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className={`
          block border border-terminal-dim/50 bg-terminal-dim/5 
          p-3 hover:border-terminal-text transition-colors group
          ${className}
        `}
      >
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-terminal-dim/10 border border-terminal-dim/30">
            <AlertCircle size={20} className="text-terminal-dim" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-terminal-dim mb-1 flex items-center gap-2">
              {preview?.favicon && (
                <img 
                  src={preview.favicon} 
                  alt="" 
                  className="w-4 h-4" 
                  onError={(e) => e.currentTarget.style.display = 'none'}
                />
              )}
              <span className="truncate">{displayDomain}</span>
            </div>
            <div className="text-sm text-terminal-text truncate group-hover:underline flex items-center gap-2">
              {url}
              <ExternalLink size={12} className="flex-shrink-0 opacity-50" />
            </div>
          </div>
        </div>
      </a>
    );
  }

  // Compact mode (inline preview)
  if (compact) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className={`
          inline-flex items-center gap-2 px-2 py-1 
          border border-terminal-dim/50 bg-terminal-dim/5
          hover:border-terminal-text hover:bg-terminal-dim/10 
          transition-colors text-sm
          ${className}
        `}
      >
        {preview?.favicon && (
          <img 
            src={preview.favicon} 
            alt="" 
            className="w-4 h-4" 
            onError={(e) => e.currentTarget.style.display = 'none'}
          />
        )}
        <span className="text-terminal-text truncate max-w-[200px]">
          {preview?.title || displayDomain}
        </span>
        <ExternalLink size={10} className="text-terminal-dim flex-shrink-0" />
      </a>
    );
  }

  // Full preview card
  const hasImage = preview?.image && !imageError;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={`
        block border border-terminal-dim/50 bg-terminal-bg/50 
        hover:border-terminal-text hover:bg-terminal-highlight/30
        transition-all duration-200 group overflow-hidden
        ${className}
      `}
    >
      <div className={`flex ${hasImage ? 'flex-col sm:flex-row' : ''}`}>
        {/* Image */}
        {hasImage && (
          <div className="relative flex-shrink-0 sm:w-48 sm:h-32 h-40 overflow-hidden bg-terminal-dim/10">
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 size={24} className="text-terminal-dim animate-spin" />
              </div>
            )}
            <img
              src={preview.image}
              alt={preview.title || 'Preview'}
              className={`
                w-full h-full object-cover 
                transition-all duration-300
                ${imageLoaded ? 'opacity-100' : 'opacity-0'}
                group-hover:scale-105
              `}
              onError={handleImageError}
              onLoad={handleImageLoad}
              loading="lazy"
            />
            {/* Gradient overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-terminal-bg/60 to-transparent sm:bg-gradient-to-r pointer-events-none" />
          </div>
        )}

        {/* Content */}
        <div className={`flex-1 p-3 min-w-0 flex flex-col justify-center ${hasImage ? 'sm:p-4' : ''}`}>
          {/* Site info */}
          <div className="flex items-center gap-2 mb-1.5">
            {preview?.favicon ? (
              <img 
                src={preview.favicon} 
                alt="" 
                className="w-4 h-4 flex-shrink-0" 
                onError={(e) => e.currentTarget.style.display = 'none'}
              />
            ) : (
              <Globe size={14} className="text-terminal-dim flex-shrink-0" />
            )}
            <span className="text-[10px] text-terminal-dim uppercase tracking-wider truncate">
              {displayDomain}
            </span>
          </div>

          {/* Title */}
          {preview?.title && (
            <h4 className="text-sm font-bold text-terminal-text mb-1 line-clamp-2 group-hover:underline decoration-1 underline-offset-2">
              {preview.title}
            </h4>
          )}

          {/* Description */}
          {preview?.description && (
            <p className="text-xs text-terminal-dim line-clamp-2 leading-relaxed">
              {preview.description}
            </p>
          )}

          {/* External link indicator */}
          <div className="mt-2 flex items-center gap-1 text-[10px] text-terminal-dim opacity-0 group-hover:opacity-100 transition-opacity">
            <ExternalLink size={10} />
            <span className="uppercase tracking-wider">Open Link</span>
          </div>
        </div>
      </div>
    </a>
  );
};

/**
 * Multiple Link Previews Container
 * Renders a list of link previews with deduplication
 */
interface LinkPreviewListProps {
  urls: string[];
  className?: string;
  maxPreviews?: number;
}

export const LinkPreviewList: React.FC<LinkPreviewListProps> = ({
  urls,
  className = '',
  maxPreviews = 3,
}) => {
  // Deduplicate URLs
  const uniqueUrls = [...new Set(urls)].slice(0, maxPreviews);

  if (uniqueUrls.length === 0) return null;

  return (
    <div className={`space-y-3 ${className}`}>
      {uniqueUrls.map((url) => (
        <LinkPreview key={url} url={url} />
      ))}
      {urls.length > maxPreviews && (
        <p className="text-xs text-terminal-dim italic">
          + {urls.length - maxPreviews} more link{urls.length - maxPreviews > 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
};


