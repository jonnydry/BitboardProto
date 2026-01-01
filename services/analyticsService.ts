/**
 * Analytics Service for BitBoard
 *
 * Provides product analytics using PostHog.
 * Tracks user behavior, feature usage, and engagement metrics.
 */

import posthog from 'posthog-js';
import { logger } from './loggingService';

export interface AnalyticsConfig {
  /** Enable/disable analytics */
  enabled: boolean;
  /** PostHog API key */
  apiKey?: string;
  /** PostHog host URL */
  host?: string;
  /** Auto-capture pageviews */
  capturePageviews?: boolean;
  /** Auto-capture clicks */
  captureClicks?: boolean;
}

// Event names - centralized for type safety
export const AnalyticsEvents = {
  // User actions
  USER_CREATED_IDENTITY: 'user_created_identity',
  USER_IMPORTED_IDENTITY: 'user_imported_identity',
  USER_CHANGED_THEME: 'user_changed_theme',
  USER_CHANGED_USERNAME: 'user_changed_username',

  // Posts
  POST_CREATED: 'post_created',
  POST_EDITED: 'post_edited',
  POST_DELETED: 'post_deleted',
  POST_VIEWED: 'post_viewed',

  // Comments
  COMMENT_CREATED: 'comment_created',
  COMMENT_EDITED: 'comment_edited',
  COMMENT_DELETED: 'comment_deleted',

  // Voting
  VOTE_CAST: 'vote_cast',
  VOTE_RETRACTED: 'vote_retracted',
  VOTE_CHANGED: 'vote_changed',

  // Boards
  BOARD_CREATED: 'board_created',
  BOARD_VIEWED: 'board_viewed',
  BOARD_ENCRYPTED_CREATED: 'encrypted_board_created',
  BOARD_GEOHASH_VIEWED: 'geohash_board_viewed',

  // Features
  SEARCH_PERFORMED: 'search_performed',
  BOOKMARK_ADDED: 'bookmark_added',
  BOOKMARK_REMOVED: 'bookmark_removed',
  USER_MUTED: 'user_muted',
  USER_UNMUTED: 'user_unmuted',
  REPORT_SUBMITTED: 'report_submitted',

  // Relays
  RELAY_ADDED: 'relay_added',
  RELAY_REMOVED: 'relay_removed',
  RELAY_CONNECTED: 'relay_connected',
  RELAY_DISCONNECTED: 'relay_disconnected',

  // Errors
  ERROR_OCCURRED: 'error_occurred',
  OFFLINE_MODE_ENTERED: 'offline_mode_entered',
  PUBLISH_FAILED: 'publish_failed',
  PUBLISH_RETRIED: 'publish_retried',

  // Onboarding
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  ONBOARDING_SKIPPED: 'onboarding_skipped',

  // Engagement
  SESSION_STARTED: 'session_started',
  FEED_SCROLLED: 'feed_scrolled',
  LINK_CLICKED: 'link_clicked',
} as const;

class AnalyticsService {
  private initialized = false;
  private config: AnalyticsConfig = {
    enabled: false,
  };

  /**
   * Initialize PostHog analytics
   * Should be called early in application startup
   */
  initialize(config?: Partial<AnalyticsConfig>): void {
    if (this.initialized) {
      logger.warn('Analytics', 'Already initialized, skipping');
      return;
    }

    // Auto-detect from environment
    const apiKey = config?.apiKey || import.meta.env.VITE_POSTHOG_API_KEY;
    const host = config?.host || import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';
    const enabled = config?.enabled !== false && !!apiKey;

    this.config = {
      enabled,
      apiKey,
      host,
      capturePageviews: config?.capturePageviews ?? true,
      captureClicks: config?.captureClicks ?? false, // Manual tracking preferred
    };

    if (!enabled) {
      logger.debug('Analytics', 'Analytics disabled (no API key provided or explicitly disabled)');
      this.initialized = true;
      return;
    }

    try {
      posthog.init(apiKey, {
        api_host: host,
        loaded: (posthog) => {
          if (import.meta.env.DEV) {
            posthog.opt_out_capturing(); // Don't track in dev
            logger.debug('Analytics', 'PostHog loaded (capturing disabled in dev)');
          } else {
            logger.info('Analytics', 'PostHog loaded and capturing');
          }
        },
        capture_pageview: this.config.capturePageviews,
        autocapture: this.config.captureClicks,
        disable_session_recording: import.meta.env.DEV, // No session recording in dev
        sanitize_properties: (properties) => {
          // Remove sensitive data
          const sanitized = { ...properties };
          delete sanitized.nsec;
          delete sanitized.privateKey;
          delete sanitized.encryptionKey;
          return sanitized;
        },
      });

      this.initialized = true;
    } catch (error) {
      logger.error('Analytics', 'Failed to initialize PostHog', error);
      this.config.enabled = false;
    }
  }

  /**
   * Track an event
   */
  track(event: string, properties?: Record<string, unknown>): void {
    if (!this.config.enabled) {
      logger.debug('Analytics', `Event (analytics disabled): ${event}`, properties);
      return;
    }

    posthog.capture(event, properties);
  }

  /**
   * Identify a user
   */
  identify(userId: string, traits?: Record<string, unknown>): void {
    if (!this.config.enabled) return;

    // Never send private keys or sensitive data
    const sanitizedTraits = traits ? { ...traits } : {};
    delete sanitizedTraits.nsec;
    delete sanitizedTraits.privateKey;
    delete sanitizedTraits.encryptionKey;

    posthog.identify(userId, sanitizedTraits);
  }

  /**
   * Set user properties
   */
  setUserProperties(properties: Record<string, unknown>): void {
    if (!this.config.enabled) return;

    posthog.people.set(properties);
  }

  /**
   * Reset analytics (on logout)
   */
  reset(): void {
    if (!this.config.enabled) return;
    posthog.reset();
  }

  /**
   * Track a page view manually
   */
  pageView(pageName?: string): void {
    if (!this.config.enabled) return;
    posthog.capture('$pageview', { page: pageName });
  }

  /**
   * Start a feature flag check
   */
  isFeatureEnabled(flag: string): boolean {
    if (!this.config.enabled) return false;
    return posthog.isFeatureEnabled(flag) || false;
  }

  /**
   * Get feature flag variant
   */
  getFeatureFlag(flag: string): string | boolean | undefined {
    if (!this.config.enabled) return undefined;
    return posthog.getFeatureFlag(flag);
  }

  /**
   * Opt user out of tracking
   */
  optOut(): void {
    if (!this.config.enabled) return;
    posthog.opt_out_capturing();
  }

  /**
   * Opt user in to tracking
   */
  optIn(): void {
    if (!this.config.enabled) return;
    posthog.opt_in_capturing();
  }

  /**
   * Check if analytics is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Check if user has opted out
   */
  hasOptedOut(): boolean {
    if (!this.config.enabled) return true;
    return posthog.has_opted_out_capturing();
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
