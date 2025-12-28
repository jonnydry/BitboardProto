import { type Event as NostrEvent, type Filter, SimplePool } from 'nostr-tools';
import { logger } from '../loggingService';

const PROFILE_CACHE_KEY = 'nostr_profile_cache_v1';
const CACHE_SAVE_DEBOUNCE_MS = 2000;

export interface NostrProfileMetadata {
  pubkey: string;
  displayName: string;
  name?: string;
  about?: string;
  picture?: string;
  nip05?: string;
  createdAt: number; // seconds
  cachedAt: number; // ms
}

export class NostrProfileCache {
  private profileCache: Map<string, NostrProfileMetadata> = new Map();
  private readonly ttlMs: number;
  private readonly maxCount: number;
  private inFlightProfiles: Map<string, Promise<NostrProfileMetadata | null>> = new Map();
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor(args: {
    pool: SimplePool;
    getReadRelays: () => string[];
    ttlMs?: number;
    maxCount?: number;
  }) {
    this.pool = args.pool;
    this.getReadRelays = args.getReadRelays;
    this.ttlMs = args.ttlMs ?? 6 * 60 * 60 * 1000; // 6 hours
    this.maxCount = args.maxCount ?? 2000;
    
    // Load cached profiles from localStorage
    this.loadFromStorage();
  }

  private pool: SimplePool;
  private getReadRelays: () => string[];

  /**
   * Load cached profiles from localStorage
   */
  private loadFromStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      
      const stored = localStorage.getItem(PROFILE_CACHE_KEY);
      if (!stored) return;

      const parsed: Record<string, NostrProfileMetadata> = JSON.parse(stored);
      const now = Date.now();
      let loadedCount = 0;

      // Load non-expired profiles
      for (const [pubkey, profile] of Object.entries(parsed)) {
        if (now - profile.cachedAt < this.ttlMs) {
          this.profileCache.set(pubkey, profile);
          loadedCount++;
        }
      }

      logger.debug('ProfileCache', `Loaded ${loadedCount} profiles from localStorage`);
    } catch (e) {
      logger.warn('ProfileCache', 'Failed to load from localStorage', e);
      // Clear corrupted data
      this.clearStorage();
    }
  }

  /**
   * Schedule a save to localStorage (debounced)
   */
  private scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.saveToStorage();
    }, CACHE_SAVE_DEBOUNCE_MS);
  }

  /**
   * Save current cache to localStorage
   */
  private saveToStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;

      // Convert Map to plain object for JSON serialization
      const toSave: Record<string, NostrProfileMetadata> = {};
      for (const [pubkey, profile] of this.profileCache.entries()) {
        toSave[pubkey] = profile;
      }

      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(toSave));
      logger.debug('ProfileCache', `Saved ${this.profileCache.size} profiles to localStorage`);
    } catch (e) {
      logger.warn('ProfileCache', 'Failed to save to localStorage', e);
      
      // Handle quota exceeded
      if (e instanceof Error && e.name === 'QuotaExceededError') {
        logger.warn('ProfileCache', 'Storage quota exceeded, clearing old cache');
        this.clearStorage();
      }
    }
  }

  /**
   * Clear localStorage cache
   */
  private clearStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.removeItem(PROFILE_CACHE_KEY);
    } catch (e) {
      logger.warn('ProfileCache', 'Failed to clear localStorage', e);
    }
  }

  private getCachedProfile(pubkey: string): NostrProfileMetadata | null {
    const cached = this.profileCache.get(pubkey);
    if (!cached) return null;
    if (Date.now() - cached.cachedAt > this.ttlMs) return null;
    return cached;
  }

  /**
   * Clear cached profile metadata (local cache only).
   * - If pubkey is omitted, clears the entire profile cache.
   */
  clear(pubkey?: string): void {
    if (pubkey) {
      this.profileCache.delete(pubkey);
    } else {
      this.profileCache.clear();
      this.clearStorage();
    }
    
    // Schedule save after clearing
    this.scheduleSave();
  }

  private enforceProfileCacheLimit(): void {
    const over = this.profileCache.size - this.maxCount;
    if (over <= 0) return;

    // Evict oldest cachedAt entries
    const entries = Array.from(this.profileCache.entries());
    entries.sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    for (let i = 0; i < over; i++) {
      const [pubkey] = entries[i];
      this.profileCache.delete(pubkey);
    }
    
    // Schedule save after eviction
    this.scheduleSave();
  }

  /**
   * Best-effort display name for a pubkey.
   * Falls back to pubkey prefix when metadata isn't available.
   */
  getDisplayName(pubkey: string): string {
    const cached = this.getCachedProfile(pubkey);
    if (cached?.displayName) return cached.displayName;
    return `${pubkey.slice(0, 8)}...`;
  }

  private parseProfileEvent(event: NostrEvent): NostrProfileMetadata | null {
    try {
      const raw = JSON.parse(event.content || '{}') as unknown;
      if (!raw || typeof raw !== 'object') return null;

      const obj = raw as Record<string, unknown>;
      const getTrimmedString = (key: string) => (typeof obj[key] === 'string' ? obj[key].trim() : undefined);

      const name = getTrimmedString('name');
      const displayNameRaw = getTrimmedString('display_name');
      const nip05 = getTrimmedString('nip05');
      const about = getTrimmedString('about');
      const picture = getTrimmedString('picture');

      const displayName =
        displayNameRaw || name || (nip05 ? nip05.split('@')[0] : '') || `${event.pubkey.slice(0, 8)}...`;

      return {
        pubkey: event.pubkey,
        displayName,
        name,
        about,
        picture,
        nip05,
        createdAt: event.created_at,
        cachedAt: Date.now(),
      };
    } catch {
      return null;
    }
  }

  async fetchProfiles(pubkeys: string[], opts: { force?: boolean } = {}): Promise<Map<string, NostrProfileMetadata>> {
    const unique = Array.from(new Set(pubkeys.filter(Boolean)));
    const result = new Map<string, NostrProfileMetadata>();

    const toFetch: string[] = [];
    for (const pubkey of unique) {
      const cached = this.getCachedProfile(pubkey);
      if (cached && !opts.force) {
        result.set(pubkey, cached);
      } else {
        toFetch.push(pubkey);
      }
    }

    if (toFetch.length === 0) return result;

    // Fetch remaining in parallel (with per-pubkey inFlight dedupe)
    const promises = toFetch.map((pubkey) => {
      const p = this.fetchProfile(pubkey, { force: !!opts.force });
      return p.then((meta) => ({ pubkey, meta }));
    });

    const settled = await Promise.all(promises);
    for (const { pubkey, meta } of settled) {
      if (!meta) continue;
      result.set(pubkey, meta);
    }

    return result;
  }

  private async fetchProfile(pubkey: string, opts: { force?: boolean } = {}): Promise<NostrProfileMetadata | null> {
    if (!pubkey) return null;

    if (!opts.force) {
      const cached = this.getCachedProfile(pubkey);
      if (cached) return cached;
    }

    const inFlight = this.inFlightProfiles.get(pubkey);
    if (inFlight) return inFlight;

    const p = (async () => {
      try {
        const filter: Filter = {
          kinds: [0],
          authors: [pubkey],
          limit: 10,
        };

        const events = await this.pool.querySync(this.getReadRelays(), filter);
        if (!events || events.length === 0) return null;

        // Choose latest by created_at
        let latest = events[0];
        for (const ev of events) {
          if (ev.created_at > latest.created_at) latest = ev;
        }

        const parsed = this.parseProfileEvent(latest);
        if (!parsed) return null;

        this.profileCache.set(pubkey, parsed);
        this.enforceProfileCacheLimit();
        
        // Schedule save to localStorage
        this.scheduleSave();
        
        return parsed;
      } catch {
        return null;
      } finally {
        this.inFlightProfiles.delete(pubkey);
      }
    })();

    this.inFlightProfiles.set(pubkey, p);
    return p;
  }
  
  /**
   * Cleanup method to save immediately before unload
   */
  destroy(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveToStorage();
  }
}







