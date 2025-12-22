/**
 * Link Preview Service
 * 
 * Fetches OpenGraph metadata from URLs and caches results.
 * Uses a CORS proxy for direct fetching with fallback to Gemini AI.
 */

import { scanLink } from './geminiService';

export interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
  type?: string;
  error?: string;
  loading?: boolean;
}

// In-memory cache for link previews
const previewCache = new Map<string, LinkPreviewData>();
const pendingRequests = new Map<string, Promise<LinkPreviewData>>();

// Cache duration: 1 hour
const CACHE_TTL = 60 * 60 * 1000;
const cacheTimestamps = new Map<string, number>();

// CORS proxies to try (in order)
const CORS_PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

/**
 * Extract domain from URL for favicon
 */
const extractDomain = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return '';
  }
};

/**
 * Get favicon URL for a domain
 */
const getFaviconUrl = (url: string): string => {
  const domain = extractDomain(url);
  if (!domain) return '';
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
};

/**
 * Parse HTML and extract OpenGraph metadata
 */
const parseOpenGraphFromHtml = (html: string, url: string): LinkPreviewData => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  const getMeta = (property: string): string | undefined => {
    // Try og: prefix first
    const ogMeta = doc.querySelector(`meta[property="og:${property}"]`);
    if (ogMeta) return ogMeta.getAttribute('content') || undefined;
    
    // Try twitter: prefix
    const twitterMeta = doc.querySelector(`meta[name="twitter:${property}"]`);
    if (twitterMeta) return twitterMeta.getAttribute('content') || undefined;
    
    // Try name attribute
    const nameMeta = doc.querySelector(`meta[name="${property}"]`);
    if (nameMeta) return nameMeta.getAttribute('content') || undefined;
    
    return undefined;
  };
  
  // Get title from multiple sources
  const title = getMeta('title') || doc.querySelector('title')?.textContent || undefined;
  
  // Get description
  const description = getMeta('description');
  
  // Get image
  let image = getMeta('image');
  
  // Make image URL absolute if relative
  if (image && !image.startsWith('http')) {
    try {
      const baseUrl = new URL(url);
      if (image.startsWith('//')) {
        image = `${baseUrl.protocol}${image}`;
      } else if (image.startsWith('/')) {
        image = `${baseUrl.origin}${image}`;
      } else {
        image = `${baseUrl.origin}/${image}`;
      }
    } catch {
      // Keep as-is if URL parsing fails
    }
  }
  
  // Get site name
  const siteName = getMeta('site_name') || extractDomain(url);
  
  // Get type
  const type = getMeta('type');
  
  return {
    url,
    title: title?.trim(),
    description: description?.trim(),
    image,
    siteName,
    favicon: getFaviconUrl(url),
    type,
  };
};

/**
 * Fetch HTML through CORS proxy
 */
const fetchWithProxy = async (url: string): Promise<string | null> => {
  for (const proxyFn of CORS_PROXIES) {
    try {
      const proxyUrl = proxyFn(url);
      const response = await fetch(proxyUrl, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
      
      if (response.ok) {
        const text = await response.text();
        // Basic validation that we got HTML
        if (text.includes('<') && (text.includes('<!DOCTYPE') || text.includes('<html') || text.includes('<head'))) {
          return text;
        }
      }
    } catch (error) {
      console.debug(`[LinkPreview] Proxy failed for ${url}:`, error);
      continue;
    }
  }
  return null;
};

/**
 * Fetch link preview using Gemini AI as fallback
 */
const fetchWithGemini = async (url: string): Promise<LinkPreviewData | null> => {
  try {
    const result = await scanLink(url);
    if (result) {
      return {
        url,
        title: result.title,
        description: result.description,
        image: result.imageUrl || undefined,
        siteName: extractDomain(url),
        favicon: getFaviconUrl(url),
      };
    }
  } catch (error) {
    console.debug('[LinkPreview] Gemini fallback failed:', error);
  }
  return null;
};

/**
 * Fetch link preview data for a URL
 */
export const fetchLinkPreview = async (url: string): Promise<LinkPreviewData> => {
  // Validate URL
  try {
    new URL(url);
  } catch {
    return { url, error: 'Invalid URL' };
  }
  
  // Check cache
  const cached = previewCache.get(url);
  const cacheTime = cacheTimestamps.get(url);
  if (cached && cacheTime && Date.now() - cacheTime < CACHE_TTL) {
    return cached;
  }
  
  // Check for pending request to avoid duplicate fetches
  const pending = pendingRequests.get(url);
  if (pending) {
    return pending;
  }
  
  // Create the fetch promise
  const fetchPromise = (async (): Promise<LinkPreviewData> => {
    try {
      // Try fetching directly through CORS proxy
      const html = await fetchWithProxy(url);
      
      if (html) {
        const preview = parseOpenGraphFromHtml(html, url);
        // Only cache if we got useful data
        if (preview.title || preview.description || preview.image) {
          previewCache.set(url, preview);
          cacheTimestamps.set(url, Date.now());
          return preview;
        }
      }
      
      // Fallback to Gemini AI
      const geminiResult = await fetchWithGemini(url);
      if (geminiResult) {
        previewCache.set(url, geminiResult);
        cacheTimestamps.set(url, Date.now());
        return geminiResult;
      }
      
      // Return minimal preview with just the URL info
      const minimalPreview: LinkPreviewData = {
        url,
        title: extractDomain(url),
        siteName: extractDomain(url),
        favicon: getFaviconUrl(url),
      };
      previewCache.set(url, minimalPreview);
      cacheTimestamps.set(url, Date.now());
      return minimalPreview;
      
    } catch (error) {
      console.error('[LinkPreview] Failed to fetch preview:', error);
      const errorPreview: LinkPreviewData = {
        url,
        error: 'Failed to load preview',
        siteName: extractDomain(url),
        favicon: getFaviconUrl(url),
      };
      return errorPreview;
    } finally {
      pendingRequests.delete(url);
    }
  })();
  
  pendingRequests.set(url, fetchPromise);
  return fetchPromise;
};

/**
 * Extract URLs from text content
 */
export const extractUrls = (content: string): string[] => {
  const urlRegex = /https?:\/\/[^\s<>\[\]()]+/g;
  const matches = content.match(urlRegex) || [];
  
  // Filter out image URLs and clean up
  return matches
    .map(url => {
      // Remove trailing punctuation
      return url.replace(/[.,;:!?)]+$/, '');
    })
    .filter(url => {
      // Exclude direct image links (they're handled separately)
      const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(url);
      return !isImage;
    })
    // Deduplicate
    .filter((url, index, self) => self.indexOf(url) === index);
};

/**
 * Get cached preview if available
 */
export const getCachedPreview = (url: string): LinkPreviewData | undefined => {
  const cached = previewCache.get(url);
  const cacheTime = cacheTimestamps.get(url);
  if (cached && cacheTime && Date.now() - cacheTime < CACHE_TTL) {
    return cached;
  }
  return undefined;
};

/**
 * Prefetch previews for multiple URLs
 */
export const prefetchPreviews = (urls: string[]): void => {
  urls.forEach(url => {
    if (!getCachedPreview(url) && !pendingRequests.has(url)) {
      fetchLinkPreview(url).catch(() => {
        // Silently ignore prefetch errors
      });
    }
  });
};

/**
 * Clear the preview cache
 */
export const clearPreviewCache = (): void => {
  previewCache.clear();
  cacheTimestamps.clear();
};


