/**
 * Test file to verify config exports and values
 */
import { describe, it, expect } from 'vitest';
import {
  Config,
  WoTConfig,
  ZapConfig,
  FeatureFlags,
  UserConfig,
  NostrConfig,
  InputLimits,
  RateLimitConfig,
  DeduplicatorConfig,
  UIConfig,
  SecurityConfig,
  GeohashConfig,
  StorageKeys,
} from '../config';

describe('Config Exports', () => {
  it('exports all config sections individually', () => {
    expect(UserConfig).toBeDefined();
    expect(NostrConfig).toBeDefined();
    expect(InputLimits).toBeDefined();
    expect(RateLimitConfig).toBeDefined();
    expect(DeduplicatorConfig).toBeDefined();
    expect(UIConfig).toBeDefined();
    expect(SecurityConfig).toBeDefined();
    expect(GeohashConfig).toBeDefined();
    expect(StorageKeys).toBeDefined();
    expect(WoTConfig).toBeDefined();
    expect(ZapConfig).toBeDefined();
    expect(FeatureFlags).toBeDefined();
  });

  it('exports combined Config object', () => {
    expect(Config).toBeDefined();
    expect(Config.User).toBe(UserConfig);
    expect(Config.Nostr).toBe(NostrConfig);
    expect(Config.Input).toBe(InputLimits);
    expect(Config.RateLimit).toBe(RateLimitConfig);
    expect(Config.Deduplicator).toBe(DeduplicatorConfig);
    expect(Config.UI).toBe(UIConfig);
    expect(Config.Security).toBe(SecurityConfig);
    expect(Config.Geohash).toBe(GeohashConfig);
    expect(Config.Storage).toBe(StorageKeys);
    expect(Config.Features).toBe(FeatureFlags);
    expect(Config.Zap).toBe(ZapConfig);
    expect(Config.WoT).toBe(WoTConfig);
  });
});

describe('WoTConfig', () => {
  it('has all expected properties', () => {
    expect(WoTConfig.CACHE_TTL_MS).toBeDefined();
    expect(WoTConfig.MAX_GRAPH_DEPTH).toBeDefined();
    expect(WoTConfig.MAX_FOLLOWS_PER_LEVEL).toBeDefined();
    expect(WoTConfig.TRUST_DECAY_FACTOR).toBeDefined();
    expect(WoTConfig.DEFAULT_TRUST_DISTANCE).toBeDefined();
    expect(WoTConfig.MIN_FEED_SCORE).toBeDefined();
  });

  it('has reasonable default values', () => {
    expect(WoTConfig.CACHE_TTL_MS).toBe(5 * 60 * 1000); // 5 minutes
    expect(WoTConfig.MAX_GRAPH_DEPTH).toBe(3);
    expect(WoTConfig.MAX_FOLLOWS_PER_LEVEL).toBe(500);
    expect(WoTConfig.TRUST_DECAY_FACTOR).toBe(0.5);
    expect(WoTConfig.DEFAULT_TRUST_DISTANCE).toBe(2);
    expect(WoTConfig.MIN_FEED_SCORE).toBe(0);
  });
});

describe('ZapConfig', () => {
  it('has all expected properties', () => {
    expect(ZapConfig.CACHE_TTL_MS).toBeDefined();
    expect(ZapConfig.MAX_COMMENT_LENGTH).toBeDefined();
    expect(ZapConfig.SUGGESTED_AMOUNTS).toBeDefined();
    expect(ZapConfig.DEFAULT_AMOUNT).toBeDefined();
    expect(ZapConfig.LNURL_TIMEOUT_MS).toBeDefined();
    expect(ZapConfig.MAX_TOP_ZAPPERS).toBeDefined();
  });

  it('has reasonable default values', () => {
    expect(ZapConfig.CACHE_TTL_MS).toBe(60 * 1000); // 1 minute
    expect(ZapConfig.MAX_COMMENT_LENGTH).toBe(280);
    expect(ZapConfig.DEFAULT_AMOUNT).toBe(100);
    expect(ZapConfig.LNURL_TIMEOUT_MS).toBe(10000);
    expect(ZapConfig.MAX_TOP_ZAPPERS).toBe(10);
    
    // Verify suggested amounts are reasonable
    expect(ZapConfig.SUGGESTED_AMOUNTS).toContain(21);
    expect(ZapConfig.SUGGESTED_AMOUNTS).toContain(100);
    expect(ZapConfig.SUGGESTED_AMOUNTS).toContain(1000);
    expect(ZapConfig.SUGGESTED_AMOUNTS.length).toBeGreaterThan(0);
  });
});

describe('FeatureFlags', () => {
  it('has all expected properties', () => {
    expect(typeof FeatureFlags.ENABLE_GEOHASH).toBe('boolean');
    expect(typeof FeatureFlags.ENABLE_LINK_SCANNING).toBe('boolean');
    expect(typeof FeatureFlags.ENABLE_NIP07).toBe('boolean');
    expect(typeof FeatureFlags.ENABLE_OFFLINE_MODE).toBe('boolean');
    expect(typeof FeatureFlags.ENABLE_DEBUG_LOGGING).toBe('boolean');
    expect(typeof FeatureFlags.ENABLE_ZAPS).toBe('boolean');
    expect(typeof FeatureFlags.ENABLE_BADGES).toBe('boolean');
    expect(typeof FeatureFlags.ENABLE_WOT).toBe('boolean');
    expect(typeof FeatureFlags.ENABLE_COMMUNITIES).toBe('boolean');
    expect(typeof FeatureFlags.ENABLE_LISTS).toBe('boolean');
    expect(typeof FeatureFlags.ENABLE_LONG_FORM).toBe('boolean');
    expect(typeof FeatureFlags.ENABLE_LIVE_EVENTS).toBe('boolean');
  });

  it('has new NIP features defined', () => {
    // These are the new feature flags that should be added
    expect(FeatureFlags.ENABLE_ZAPS).toBeDefined();       // NIP-57
    expect(FeatureFlags.ENABLE_BADGES).toBeDefined();     // NIP-58
    expect(FeatureFlags.ENABLE_WOT).toBeDefined();        // Web of Trust
    expect(FeatureFlags.ENABLE_COMMUNITIES).toBeDefined();// NIP-72
    expect(FeatureFlags.ENABLE_LISTS).toBeDefined();      // NIP-51
    expect(FeatureFlags.ENABLE_LONG_FORM).toBeDefined();  // NIP-23
    expect(FeatureFlags.ENABLE_LIVE_EVENTS).toBeDefined();// NIP-53
  });

  it('has safe defaults for new features', () => {
    // Live events should be disabled by default until fully implemented
    expect(FeatureFlags.ENABLE_LIVE_EVENTS).toBe(false);
    
    // Other new features can be enabled by default if ready
    // These are just verifying the current state
    expect(FeatureFlags.ENABLE_ZAPS).toBe(true);
    expect(FeatureFlags.ENABLE_BADGES).toBe(true);
    expect(FeatureFlags.ENABLE_WOT).toBe(true);
    expect(FeatureFlags.ENABLE_COMMUNITIES).toBe(true);
    expect(FeatureFlags.ENABLE_LISTS).toBe(true);
    expect(FeatureFlags.ENABLE_LONG_FORM).toBe(true);
  });
});

describe('Config Type Safety', () => {
  it('config values are correctly typed', () => {
    // Verify types are what we expect
    // Numbers
    expect(typeof WoTConfig.CACHE_TTL_MS).toBe('number');
    expect(typeof ZapConfig.DEFAULT_AMOUNT).toBe('number');
    
    // Booleans
    expect(typeof FeatureFlags.ENABLE_ZAPS).toBe('boolean');
    
    // Arrays
    expect(Array.isArray(ZapConfig.SUGGESTED_AMOUNTS)).toBe(true);
    expect(Array.isArray(NostrConfig.DEFAULT_RELAYS)).toBe(true);
  });
});
