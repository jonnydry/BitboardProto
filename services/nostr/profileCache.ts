import { type Event as NostrEvent, type Filter, SimplePool } from 'nostr-tools';

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
  }

  private pool: SimplePool;
  private getReadRelays: () => string[];

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
    }
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
      const raw = JSON.parse(event.content || '{}');
      if (!raw || typeof raw !== 'object') return null;

      const name = typeof (raw as any).name === 'string' ? (raw as any).name.trim() : undefined;
      const displayNameRaw =
        typeof (raw as any).display_name === 'string' ? (raw as any).display_name.trim() : undefined;
      const nip05 = typeof (raw as any).nip05 === 'string' ? (raw as any).nip05.trim() : undefined;
      const about = typeof (raw as any).about === 'string' ? (raw as any).about.trim() : undefined;
      const picture = typeof (raw as any).picture === 'string' ? (raw as any).picture.trim() : undefined;

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
}






