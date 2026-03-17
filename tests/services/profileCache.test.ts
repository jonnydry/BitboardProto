import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NostrProfileCache, type NostrProfileMetadata } from '../../services/nostr/profileCache';

// Mock the logger
vi.mock('../../services/loggingService', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] || null,
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock SimplePool
const mockQuerySync = vi.fn();
const mockPool = {
  querySync: mockQuerySync,
};

describe('NostrProfileCache', () => {
  let cache: NostrProfileCache;
  const mockGetReadRelays = () => ['wss://relay1.test', 'wss://relay2.test'];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    vi.useFakeTimers();

    cache = new NostrProfileCache({
      pool: mockPool as any,
      getReadRelays: mockGetReadRelays,
      ttlMs: 60000, // 1 minute TTL for testing
      maxCount: 10, // Small max for testing eviction
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initialization', () => {
    it('should create cache with default settings', () => {
      const newCache = new NostrProfileCache({
        pool: mockPool as any,
        getReadRelays: mockGetReadRelays,
      });
      expect(newCache).toBeDefined();
    });

    it('should load cached profiles from localStorage', () => {
      const cachedProfile: NostrProfileMetadata = {
        pubkey: 'cached-pubkey',
        displayName: 'Cached User',
        name: 'cached',
        cachedAt: Date.now(),
        createdAt: Math.floor(Date.now() / 1000),
      };

      localStorageMock.setItem(
        'nostr_profile_cache_v1',
        JSON.stringify({
          'cached-pubkey': cachedProfile,
        }),
      );

      const newCache = new NostrProfileCache({
        pool: mockPool as any,
        getReadRelays: mockGetReadRelays,
        ttlMs: 60000,
      });

      expect(newCache.getDisplayName('cached-pubkey')).toBe('Cached User');
    });

    it('should skip expired profiles when loading from localStorage', () => {
      const expiredProfile: NostrProfileMetadata = {
        pubkey: 'expired-pubkey',
        displayName: 'Expired User',
        name: 'expired',
        cachedAt: Date.now() - 120000, // 2 minutes ago
        createdAt: Math.floor(Date.now() / 1000),
      };

      localStorageMock.setItem(
        'nostr_profile_cache_v1',
        JSON.stringify({
          'expired-pubkey': expiredProfile,
        }),
      );

      const newCache = new NostrProfileCache({
        pool: mockPool as any,
        getReadRelays: mockGetReadRelays,
        ttlMs: 60000, // 1 minute TTL
      });

      // Should fall back to pubkey prefix since expired (first 8 chars + ...)
      expect(newCache.getDisplayName('expired-pubkey')).toBe('expired-...');
    });
  });

  describe('getDisplayName', () => {
    it('should return display name if cached', async () => {
      mockQuerySync.mockResolvedValueOnce([
        {
          id: 'event-id',
          pubkey: 'test-pubkey',
          kind: 0,
          created_at: Math.floor(Date.now() / 1000),
          content: JSON.stringify({ display_name: 'Test User' }),
          tags: [],
          sig: 'sig',
        },
      ]);

      // Fetch profile first
      await cache.fetchProfiles(['test-pubkey']);

      expect(cache.getDisplayName('test-pubkey')).toBe('Test User');
    });

    it('should return pubkey prefix if not cached', () => {
      const result = cache.getDisplayName('abcdef1234567890');
      expect(result).toBe('abcdef12...');
    });
  });

  describe('fetchProfiles', () => {
    it('should fetch profiles from relays', async () => {
      mockQuerySync.mockResolvedValueOnce([
        {
          id: 'event-id',
          pubkey: 'fetch-pubkey',
          kind: 0,
          created_at: Math.floor(Date.now() / 1000),
          content: JSON.stringify({ name: 'Fetched User' }),
          tags: [],
          sig: 'sig',
        },
      ]);

      const result = await cache.fetchProfiles(['fetch-pubkey']);

      expect(result.has('fetch-pubkey')).toBe(true);
      expect(result.get('fetch-pubkey')?.name).toBe('Fetched User');
    });

    it('should return cached profiles without fetching', async () => {
      // First fetch
      mockQuerySync.mockResolvedValueOnce([
        {
          id: 'event-id',
          pubkey: 'cache-test',
          kind: 0,
          created_at: Math.floor(Date.now() / 1000),
          content: JSON.stringify({ name: 'First Fetch' }),
          tags: [],
          sig: 'sig',
        },
      ]);

      await cache.fetchProfiles(['cache-test']);

      // Second fetch - should use cache
      mockQuerySync.mockClear();
      const result = await cache.fetchProfiles(['cache-test']);

      expect(mockQuerySync).not.toHaveBeenCalled();
      expect(result.get('cache-test')?.name).toBe('First Fetch');
    });

    it('should force refresh with force option', async () => {
      // First fetch
      mockQuerySync.mockResolvedValueOnce([
        {
          id: 'event-id-1',
          pubkey: 'force-test',
          kind: 0,
          created_at: Math.floor(Date.now() / 1000) - 1,
          content: JSON.stringify({ name: 'Original' }),
          tags: [],
          sig: 'sig',
        },
      ]);

      await cache.fetchProfiles(['force-test']);

      // Force refresh
      mockQuerySync.mockResolvedValueOnce([
        {
          id: 'event-id-2',
          pubkey: 'force-test',
          kind: 0,
          created_at: Math.floor(Date.now() / 1000),
          content: JSON.stringify({ name: 'Updated' }),
          tags: [],
          sig: 'sig',
        },
      ]);

      const result = await cache.fetchProfiles(['force-test'], { force: true });

      expect(result.get('force-test')?.name).toBe('Updated');
    });

    it('should deduplicate in-flight requests', async () => {
      let resolveFirst: (value: any) => void;
      const slowPromise = new Promise((resolve) => {
        resolveFirst = resolve;
      });

      mockQuerySync.mockReturnValue(slowPromise);

      // Start two concurrent fetches
      const fetch1 = cache.fetchProfiles(['dedupe-test']);
      const fetch2 = cache.fetchProfiles(['dedupe-test']);

      // Resolve the request
      resolveFirst!([
        {
          id: 'event-id',
          pubkey: 'dedupe-test',
          kind: 0,
          created_at: Math.floor(Date.now() / 1000),
          content: JSON.stringify({ name: 'Deduped' }),
          tags: [],
          sig: 'sig',
        },
      ]);

      const [result1, result2] = await Promise.all([fetch1, fetch2]);

      // Should only have called querySync once
      expect(mockQuerySync).toHaveBeenCalledTimes(1);
      expect(result1.get('dedupe-test')?.name).toBe('Deduped');
      expect(result2.get('dedupe-test')?.name).toBe('Deduped');
    });
  });

  describe('Cache Eviction', () => {
    it('should evict oldest profiles when over limit', async () => {
      // Fill cache to limit (maxCount = 10)
      for (let i = 0; i < 12; i++) {
        mockQuerySync.mockResolvedValueOnce([
          {
            id: `event-${i}`,
            pubkey: `pubkey-${i}`,
            kind: 0,
            created_at: Math.floor(Date.now() / 1000) + i,
            content: JSON.stringify({ name: `User ${i}` }),
            tags: [],
            sig: 'sig',
          },
        ]);

        await cache.fetchProfiles([`pubkey-${i}`]);
        vi.advanceTimersByTime(100); // Ensure different cachedAt times
      }

      cache.destroy();
      const parsed = JSON.parse(localStorageMock.getItem('nostr_profile_cache_v1')!);
      expect(Object.keys(parsed)).toHaveLength(10);
      expect(parsed['pubkey-0']).toBeUndefined();
      expect(parsed['pubkey-1']).toBeUndefined();
      expect(parsed['pubkey-11']).toBeDefined();
    });
  });

  describe('clear', () => {
    it('should clear specific pubkey', async () => {
      mockQuerySync.mockResolvedValueOnce([
        {
          id: 'event-id',
          pubkey: 'clear-test',
          kind: 0,
          created_at: Math.floor(Date.now() / 1000),
          content: JSON.stringify({ name: 'To Clear' }),
          tags: [],
          sig: 'sig',
        },
      ]);

      await cache.fetchProfiles(['clear-test']);
      cache.clear('clear-test');
      vi.advanceTimersByTime(2100);

      // Should fall back to pubkey prefix
      expect(cache.getDisplayName('clear-test')).toBe('clear-te...');
      const stored = JSON.parse(localStorageMock.getItem('nostr_profile_cache_v1') || '{}');
      expect(stored['clear-test']).toBeUndefined();
    });

    it('should clear entire cache', async () => {
      mockQuerySync.mockResolvedValueOnce([
        {
          id: 'event-1',
          pubkey: 'pubkey-1',
          kind: 0,
          created_at: Math.floor(Date.now() / 1000),
          content: JSON.stringify({ name: 'User 1' }),
          tags: [],
          sig: 'sig',
        },
      ]);

      await cache.fetchProfiles(['pubkey-1']);
      cache.clear();

      expect(cache.getDisplayName('pubkey-1')).toBe('pubkey-1...');
    });
  });

  describe('destroy', () => {
    it('should save cache to localStorage on destroy', async () => {
      mockQuerySync.mockResolvedValueOnce([
        {
          id: 'event-id',
          pubkey: 'destroy-test',
          kind: 0,
          created_at: Math.floor(Date.now() / 1000),
          content: JSON.stringify({ name: 'Before Destroy' }),
          tags: [],
          sig: 'sig',
        },
      ]);

      await cache.fetchProfiles(['destroy-test']);
      cache.destroy();

      // Check localStorage was updated
      const stored = localStorageMock.getItem('nostr_profile_cache_v1');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed['destroy-test']).toBeDefined();
    });

    it('should clear corrupted storage on load', () => {
      localStorageMock.setItem('nostr_profile_cache_v1', '{bad-json');

      const newCache = new NostrProfileCache({
        pool: mockPool as any,
        getReadRelays: mockGetReadRelays,
        ttlMs: 60000,
      });

      expect(newCache.getDisplayName('missing-pubkey')).toBe('missing-...');
      expect(localStorageMock.getItem('nostr_profile_cache_v1')).toBeNull();
    });

    it('should recover from quota exceeded by clearing storage', async () => {
      mockQuerySync.mockResolvedValueOnce([
        {
          id: 'event-id',
          pubkey: 'quota-test',
          kind: 0,
          created_at: Math.floor(Date.now() / 1000),
          content: JSON.stringify({ name: 'Quota Test' }),
          tags: [],
          sig: 'sig',
        },
      ]);

      await cache.fetchProfiles(['quota-test']);
      const originalSetItem = localStorageMock.setItem;
      localStorageMock.setItem = vi.fn(() => {
        const err = new Error('quota');
        err.name = 'QuotaExceededError';
        throw err;
      }) as any;

      cache.destroy();

      expect(localStorageMock.getItem('nostr_profile_cache_v1')).toBeNull();
      localStorageMock.setItem = originalSetItem;
    });

    it('should refetch expired cache entries', async () => {
      localStorageMock.setItem(
        'nostr_profile_cache_v1',
        JSON.stringify({
          'expiring-user': {
            pubkey: 'expiring-user',
            displayName: 'Old User',
            cachedAt: Date.now() - 120000,
            createdAt: Math.floor(Date.now() / 1000) - 120,
          },
        }),
      );

      const newCache = new NostrProfileCache({
        pool: mockPool as any,
        getReadRelays: mockGetReadRelays,
        ttlMs: 60000,
      });
      mockQuerySync.mockResolvedValueOnce([
        {
          id: 'event-new',
          pubkey: 'expiring-user',
          kind: 0,
          created_at: Math.floor(Date.now() / 1000),
          content: JSON.stringify({ name: 'Fresh User' }),
          tags: [],
          sig: 'sig',
        },
      ]);

      const result = await newCache.fetchProfiles(['expiring-user']);
      expect(result.get('expiring-user')?.name).toBe('Fresh User');
      expect(mockQuerySync).toHaveBeenCalled();
    });
  });
});
