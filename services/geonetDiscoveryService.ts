// ============================================
// GEONET DISCOVERY SERVICE
// ============================================
// Discovers active location-based communities by querying
// Nostr relays for posts tagged with geohash prefixes.

import { geohashService, PRECISION_LABELS, PRECISION_DESCRIPTIONS } from './geohashService';
import { nostrService } from './nostrService';
import { GeohashPrecision, BoardType, type Board } from '../types';

// ============================================
// TYPES
// ============================================

export interface GeoChannel {
  geohash: string;
  precision: GeohashPrecision;
  postCount: number;
  uniqueAuthors: number;
  lastActivityAt: number;  // timestamp ms
  label: string;           // e.g., "NEIGHBORHOOD"
  description: string;     // e.g., "~9.7km radius"
}

export interface DiscoveryResult {
  channels: GeoChannel[];
  userGeohashes: Record<GeohashPrecision, string>;
  timestamp: number;
}

// ============================================
// STORAGE
// ============================================

const STORAGE_KEY = 'bitboard_geonet_discovery_cache';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================
// GEONET DISCOVERY SERVICE CLASS
// ============================================

class GeonetDiscoveryService {
  private cache: DiscoveryResult | null = null;
  private discoveryInProgress: Promise<DiscoveryResult> | null = null;

  constructor() {
    this.loadCache();
  }

  // ----------------------------------------
  // CACHE MANAGEMENT
  // ----------------------------------------

  private loadCache(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as DiscoveryResult;
        // Check if cache is still valid
        if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
          this.cache = parsed;
        }
      }
    } catch (error) {
      console.error('[GeonetDiscovery] Failed to load cache:', error);
    }
  }

  private saveCache(result: DiscoveryResult): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
      this.cache = result;
    } catch (error) {
      console.error('[GeonetDiscovery] Failed to save cache:', error);
    }
  }

  // ----------------------------------------
  // DISCOVERY
  // ----------------------------------------

  /**
   * Discover active geo channels near a location
   * Returns channels sorted by recent activity
   */
  async discoverNearbyChannels(
    lat: number,
    lon: number,
    options: {
      forceRefresh?: boolean;
      includeNeighbors?: boolean;
    } = {}
  ): Promise<DiscoveryResult> {
    const { forceRefresh = false, includeNeighbors = true } = options;

    // Return cached result if valid
    if (!forceRefresh && this.cache) {
      const cacheAge = Date.now() - this.cache.timestamp;
      if (cacheAge < CACHE_TTL_MS) {
        return this.cache;
      }
    }

    // Prevent duplicate discoveries
    if (this.discoveryInProgress) {
      return this.discoveryInProgress;
    }

    this.discoveryInProgress = this._doDiscover(lat, lon, includeNeighbors);
    
    try {
      const result = await this.discoveryInProgress;
      return result;
    } finally {
      this.discoveryInProgress = null;
    }
  }

  private async _doDiscover(
    lat: number,
    lon: number,
    includeNeighbors: boolean
  ): Promise<DiscoveryResult> {
    console.log('[GeonetDiscovery] Starting discovery for', lat, lon);

    // Get geohashes at all precision levels
    const userGeohashes = geohashService.getAllPrecisions(lat, lon);

    // Build list of geohashes to query
    const geohashesToQuery = new Set<string>();

    // Add user's geohashes at each precision
    Object.values(userGeohashes).forEach(gh => geohashesToQuery.add(gh));

    // Optionally add neighboring geohashes for broader discovery
    if (includeNeighbors) {
      // Only add neighbors for more local precisions (CITY and below)
      const localGeohashes = [
        userGeohashes[GeohashPrecision.CITY],
        userGeohashes[GeohashPrecision.NEIGHBORHOOD],
        userGeohashes[GeohashPrecision.BLOCK],
      ];

      localGeohashes.forEach(gh => {
        geohashService.getNeighbors(gh).forEach(neighbor => {
          geohashesToQuery.add(neighbor);
        });
      });
    }

    // Query activity for each geohash
    const channelMap = new Map<string, GeoChannel>();
    const queryPromises: Promise<void>[] = [];

    // Group queries by precision for efficiency
    const geohashArray = Array.from(geohashesToQuery);
    
    // Query in batches to avoid overwhelming relays
    const BATCH_SIZE = 5;
    for (let i = 0; i < geohashArray.length; i += BATCH_SIZE) {
      const batch = geohashArray.slice(i, i + BATCH_SIZE);
      
      const batchPromise = Promise.all(
        batch.map(async (geohash) => {
          try {
            const activity = await this.queryGeohashActivity(geohash);
            if (activity.postCount > 0) {
              channelMap.set(geohash, activity);
            }
          } catch (error) {
            console.warn('[GeonetDiscovery] Failed to query', geohash, error);
          }
        })
      );

      queryPromises.push(batchPromise.then(() => {}));
    }

    await Promise.all(queryPromises);

    // Convert to array and sort by recent activity
    const channels = Array.from(channelMap.values())
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt);

    const result: DiscoveryResult = {
      channels,
      userGeohashes,
      timestamp: Date.now(),
    };

    this.saveCache(result);
    console.log('[GeonetDiscovery] Found', channels.length, 'active channels');

    return result;
  }

  /**
   * Query activity for a specific geohash
   */
  private async queryGeohashActivity(geohash: string): Promise<GeoChannel> {
    const precision = geohashService.getPrecisionFromGeohash(geohash);

    // Fetch recent posts for this geohash
    // We query with a time window to focus on recent activity
    const ONE_WEEK_AGO = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

    const posts = await nostrService.fetchPosts({
      geohash,
      limit: 50,
      since: ONE_WEEK_AGO,
    });

    // Aggregate activity
    const authors = new Set<string>();
    let lastActivityAt = 0;

    posts.forEach(post => {
      authors.add(post.pubkey);
      const postTime = post.created_at * 1000;
      if (postTime > lastActivityAt) {
        lastActivityAt = postTime;
      }
    });

    return {
      geohash,
      precision,
      postCount: posts.length,
      uniqueAuthors: authors.size,
      lastActivityAt: lastActivityAt || Date.now(),
      label: PRECISION_LABELS[precision],
      description: PRECISION_DESCRIPTIONS[precision],
    };
  }

  // ----------------------------------------
  // UTILITY
  // ----------------------------------------

  /**
   * Convert a GeoChannel to a Board
   */
  channelToBoard(channel: GeoChannel): Board {
    return geohashService.generateLocationBoard(channel.geohash, channel.precision);
  }

  /**
   * Get cached result if available
   */
  getCachedResult(): DiscoveryResult | null {
    return this.cache;
  }

  /**
   * Clear the discovery cache
   */
  clearCache(): void {
    this.cache = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Format last activity time for display
   */
  formatLastActivity(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    const minutes = Math.floor(diff / (60 * 1000));
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
  }

  /**
   * Check if a channel has recent activity (last 24 hours)
   */
  isRecentlyActive(channel: GeoChannel): boolean {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    return Date.now() - channel.lastActivityAt < ONE_DAY_MS;
  }
}

// Export singleton instance
export const geonetDiscoveryService = new GeonetDiscoveryService();



