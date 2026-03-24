/**
 * Analytics Service for BitBoard
 *
 * Provides product analytics using PostHog.
 * Tracks user behavior, feature usage, and engagement metrics.
 *
 * CONSENT MODEL:
 * - Analytics are OFF by default (opt-in required)
 * - User must explicitly consent via cookie banner
 * - Consent preference is stored in localStorage
 */

import { logger } from './loggingService';

type PostHogModule = typeof import('posthog-js');
type PostHogClient = PostHogModule['default'];

const CONSENT_STORAGE_KEY = 'bitboard_analytics_consent';

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
  private client: PostHogClient | null = null;
  private loadPromise: Promise<PostHogClient | null> | null = null;
  private config: AnalyticsConfig = {
    enabled: false,
  };

  private async loadClient(): Promise<PostHogClient | null> {
    if (this.client) return this.client;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = import('posthog-js')
      .then((module) => {
        this.client = module.default;
        return this.client;
      })
      .catch((error) => {
        logger.error('Analytics', 'Failed to load PostHog', error);
        this.config.enabled = false;
        return null;
      });

    return this.loadPromise;
  }

  /**
   * Preconfigure lightweight runtime flags before the analytics SDK loads.
   */
  configure(config?: Partial<AnalyticsConfig>): void {
    const apiKey = config?.apiKey || import.meta.env.VITE_POSTHOG_API_KEY;
    const host = config?.host || import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';
    const envEnabled = config?.enabled !== false && !!apiKey;

    this.config = {
      enabled: envEnabled,
      apiKey,
      host,
      capturePageviews: config?.capturePageviews ?? true,
      captureClicks: config?.captureClicks ?? false,
    };
  }

  /**
   * Check if user has provided consent for analytics
   */
  hasUserConsent(): boolean {
    const consent = localStorage.getItem(CONSENT_STORAGE_KEY);
    return consent === 'true';
  }

  /**
   * Store user consent preference
   */
  private setUserConsent(consent: boolean): void {
    localStorage.setItem(CONSENT_STORAGE_KEY, consent.toString());
  }

  /**
   * Initialize PostHog analytics
   * Should be called early in application startup
   *
   * IMPORTANT: Analytics are disabled by default unless user explicitly consents.
   * The app must show a consent banner and call optIn() after user agrees.
   */
  async initialize(config?: Partial<AnalyticsConfig>): Promise<void> {
    if (this.initialized) {
      logger.warn('Analytics', 'Already initialized, skipping');
      return;
    }

    this.configure(config);

    const apiKey = this.config.apiKey;
    const host = this.config.host;
    const envEnabled = this.config.enabled;

    // Check if PostHog API key is configured
    if (!envEnabled) {
      logger.debug('Analytics', 'Analytics disabled (no API key provided or explicitly disabled)');
      this.initialized = true;
      return;
    }

    // Even if API key exists, require explicit user consent
    // Default to opt-out unless user has previously opted in
    const userConsent = this.hasUserConsent();

    try {
      const posthog = await this.loadClient();
      if (!posthog) return;

      posthog.init(apiKey, {
        api_host: host,
        loaded: (posthog) => {
          if (import.meta.env.DEV) {
            posthog.opt_out_capturing(); // Don't track in dev
            logger.debug('Analytics', 'PostHog loaded (capturing disabled in dev)');
          } else if (userConsent) {
            // User previously consented - enable tracking
            posthog.opt_in_capturing();
            logger.info('Analytics', 'PostHog loaded with user consent');
          } else {
            // No consent yet - remain opt-ed out
            posthog.opt_out_capturing();
            logger.info('Analytics', 'PostHog loaded, waiting for user consent');
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
    if (!this.config.enabled || !this.client) {
      logger.debug('Analytics', `Event (analytics disabled): ${event}`, properties);
      return;
    }

    this.client.capture(event, properties);
  }

  /**
   * Identify a user
   */
  identify(userId: string, traits?: Record<string, unknown>): void {
    if (!this.config.enabled || !this.client) return;

    // Never send private keys or sensitive data
    const sanitizedTraits = traits ? { ...traits } : {};
    delete sanitizedTraits.nsec;
    delete sanitizedTraits.privateKey;
    delete sanitizedTraits.encryptionKey;

    this.client.identify(userId, sanitizedTraits);
  }

  /**
   * Set user properties
   */
  setUserProperties(properties: Record<string, unknown>): void {
    if (!this.config.enabled || !this.client) return;

    this.client.people.set(properties);
  }

  /**
   * Reset analytics (on logout)
   */
  reset(): void {
    if (!this.config.enabled || !this.client) return;
    this.client.reset();
  }

  /**
   * Track a page view manually
   */
  pageView(pageName?: string): void {
    if (!this.config.enabled || !this.client) return;
    this.client.capture('$pageview', { page: pageName });
  }

  /**
   * Start a feature flag check
   */
  isFeatureEnabled(flag: string): boolean {
    if (!this.config.enabled || !this.client) return false;
    return this.client.isFeatureEnabled(flag) || false;
  }

  /**
   * Get feature flag variant
   */
  getFeatureFlag(flag: string): string | boolean | undefined {
    if (!this.config.enabled || !this.client) return undefined;
    return this.client.getFeatureFlag(flag);
  }

  /**
   * Opt user out of tracking
   */
  optOut(): void {
    this.setUserConsent(false);
    if (!this.config.enabled) return;

    if (this.client) {
      this.client.opt_out_capturing();
    } else {
      void this.loadClient().then((client) => client?.opt_out_capturing());
    }

    logger.info('Analytics', 'User opted out of tracking');
  }

  /**
   * Opt user in to tracking
   */
  optIn(): void {
    this.setUserConsent(true);
    if (!this.config.enabled) return;

    if (this.client) {
      this.client.opt_in_capturing();
    } else {
      void this.loadClient().then((client) => client?.opt_in_capturing());
    }

    logger.info('Analytics', 'User opted in to tracking');
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
    if (!this.config.enabled || !this.client) return true;
    return this.client.has_opted_out_capturing();
  }

  /**
   * Check if user needs to provide consent
   * Returns true if analytics is configured but user hasn't made a choice yet
   */
  needsConsent(): boolean {
    if (!this.config.enabled) return false;
    // Check if user has made a choice (localStorage has a value)
    const consent = localStorage.getItem(CONSENT_STORAGE_KEY);
    return consent === null;
  }

  /**
   * Get the current consent status for UI display
   */
  getConsentStatus(): 'opted_in' | 'opted_out' | 'needs_choice' | 'disabled' {
    if (!this.config.enabled) return 'disabled';
    if (!this.hasUserConsent() && this.needsConsent()) return 'needs_choice';
    if (this.hasUserConsent()) return 'opted_in';
    return 'opted_out';
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
