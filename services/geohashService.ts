import ngeohash from 'ngeohash';
import { GeohashPrecision, BoardType, type Board } from '../types';

// ============================================
// GEOHASH PRECISION LABELS
// ============================================

export const PRECISION_LABELS: Record<GeohashPrecision, string> = {
  [GeohashPrecision.COUNTRY]: 'COUNTRY',
  [GeohashPrecision.REGION]: 'REGION',
  [GeohashPrecision.PROVINCE]: 'PROVINCE',
  [GeohashPrecision.CITY]: 'CITY',
  [GeohashPrecision.NEIGHBORHOOD]: 'NEIGHBORHOOD',
  [GeohashPrecision.BLOCK]: 'BLOCK',
};

export const PRECISION_DESCRIPTIONS: Record<GeohashPrecision, string> = {
  [GeohashPrecision.COUNTRY]: '~2500km radius',
  [GeohashPrecision.REGION]: '~625km radius',
  [GeohashPrecision.PROVINCE]: '~156km radius',
  [GeohashPrecision.CITY]: '~39km radius',
  [GeohashPrecision.NEIGHBORHOOD]: '~9.7km radius',
  [GeohashPrecision.BLOCK]: '~1.2km radius (most local)',
};

// ============================================
// GEOHASH SERVICE CLASS
// ============================================

class GeohashService {
  private currentPosition: GeolocationPosition | null = null;
  private watchId: number | null = null;

  // ----------------------------------------
  // GEOHASH OPERATIONS
  // ----------------------------------------

  /**
   * Encode latitude/longitude to geohash
   */
  encode(lat: number, lon: number, precision: GeohashPrecision = GeohashPrecision.NEIGHBORHOOD): string {
    return ngeohash.encode(lat, lon, precision);
  }

  /**
   * Decode geohash to latitude/longitude
   */
  decode(geohash: string): { latitude: number; longitude: number } {
    return ngeohash.decode(geohash);
  }

  /**
   * Get neighboring geohashes (for expanded search)
   */
  getNeighbors(geohash: string): string[] {
    return ngeohash.neighbors(geohash);
  }

  /**
   * Get all geohashes at different precisions for a location
   */
  getAllPrecisions(lat: number, lon: number): Record<GeohashPrecision, string> {
    return {
      [GeohashPrecision.COUNTRY]: this.encode(lat, lon, GeohashPrecision.COUNTRY),
      [GeohashPrecision.REGION]: this.encode(lat, lon, GeohashPrecision.REGION),
      [GeohashPrecision.PROVINCE]: this.encode(lat, lon, GeohashPrecision.PROVINCE),
      [GeohashPrecision.CITY]: this.encode(lat, lon, GeohashPrecision.CITY),
      [GeohashPrecision.NEIGHBORHOOD]: this.encode(lat, lon, GeohashPrecision.NEIGHBORHOOD),
      [GeohashPrecision.BLOCK]: this.encode(lat, lon, GeohashPrecision.BLOCK),
    };
  }

  // ----------------------------------------
  // LOCATION ACCESS
  // ----------------------------------------

  /**
   * Check if geolocation is available
   */
  isGeolocationAvailable(): boolean {
    return 'geolocation' in navigator;
  }

  /**
   * Get current position (one-time)
   */
  async getCurrentPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!this.isGeolocationAvailable()) {
        reject(new Error('Geolocation not available'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.currentPosition = position;
          resolve(position);
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000, // Cache for 1 minute
        }
      );
    });
  }

  /**
   * Get current geohash at specified precision
   */
  async getCurrentGeohash(precision: GeohashPrecision = GeohashPrecision.NEIGHBORHOOD): Promise<string> {
    const position = await this.getCurrentPosition();
    return this.encode(
      position.coords.latitude,
      position.coords.longitude,
      precision
    );
  }

  /**
   * Get all precision geohashes for current location
   */
  async getCurrentAllPrecisions(): Promise<Record<GeohashPrecision, string>> {
    const position = await this.getCurrentPosition();
    return this.getAllPrecisions(
      position.coords.latitude,
      position.coords.longitude
    );
  }

  /**
   * Watch position changes
   */
  watchPosition(callback: (geohash: string, precision: GeohashPrecision) => void, precision: GeohashPrecision = GeohashPrecision.NEIGHBORHOOD): void {
    if (!this.isGeolocationAvailable()) return;

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.currentPosition = position;
        const geohash = this.encode(
          position.coords.latitude,
          position.coords.longitude,
          precision
        );
        callback(geohash, precision);
      },
      (error) => {
        console.error('[Geohash] Watch error:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  }

  /**
   * Stop watching position
   */
  stopWatching(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  /**
   * Get cached position
   */
  getCachedPosition(): GeolocationPosition | null {
    return this.currentPosition;
  }

  // ----------------------------------------
  // BOARD GENERATION
  // ----------------------------------------

  /**
   * Generate location-based boards from geohash
   */
  generateLocationBoards(lat: number, lon: number): Board[] {
    const geohashes = this.getAllPrecisions(lat, lon);
    
    return Object.entries(geohashes).map(([precisionStr, geohash]) => {
      const precision = Number(precisionStr) as GeohashPrecision;
      
      return {
        id: `geo-${geohash}`,
        name: `${PRECISION_LABELS[precision]} #${geohash}`,
        description: `Location-based board for ${PRECISION_LABELS[precision]} area (${PRECISION_DESCRIPTIONS[precision]})`,
        isPublic: true,
        memberCount: 0,
        type: BoardType.GEOHASH,
        geohash,
        precision,
      };
    });
  }

  /**
   * Generate a single location board
   */
  generateLocationBoard(geohash: string, precision: GeohashPrecision): Board {
    return {
      id: `geo-${geohash}`,
      name: `${PRECISION_LABELS[precision]} #${geohash}`,
      description: `Location-based board for ${PRECISION_LABELS[precision]} area (${PRECISION_DESCRIPTIONS[precision]})`,
      isPublic: true,
      memberCount: 0,
      type: BoardType.GEOHASH,
      geohash,
      precision,
    };
  }

  // ----------------------------------------
  // UTILITY
  // ----------------------------------------

  /**
   * Format geohash for display
   */
  formatGeohash(geohash: string): string {
    return `#${geohash}`;
  }

  /**
   * Get precision from geohash length
   */
  getPrecisionFromGeohash(geohash: string): GeohashPrecision {
    const length = geohash.length;
    
    if (length <= 2) return GeohashPrecision.COUNTRY;
    if (length <= 3) return GeohashPrecision.REGION;
    if (length <= 4) return GeohashPrecision.PROVINCE;
    if (length <= 5) return GeohashPrecision.CITY;
    if (length <= 6) return GeohashPrecision.NEIGHBORHOOD;
    return GeohashPrecision.BLOCK;
  }

  /**
   * Check if a geohash is within another (parent contains child)
   */
  isWithin(childGeohash: string, parentGeohash: string): boolean {
    return childGeohash.startsWith(parentGeohash);
  }

  /**
   * Calculate approximate distance between two geohashes in km
   */
  approximateDistance(geohash1: string, geohash2: string): number {
    const pos1 = this.decode(geohash1);
    const pos2 = this.decode(geohash2);
    
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(pos2.latitude - pos1.latitude);
    const dLon = this.toRad(pos2.longitude - pos1.longitude);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(pos1.latitude)) * Math.cos(this.toRad(pos2.latitude)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}

// Export singleton instance
export const geohashService = new GeohashService();





