/**
 * Enhanced Sentry Service for BitBoard
 *
 * Provides production-ready error tracking with Sentry integration.
 * Replaces the basic errorTracking.ts with full Sentry features.
 */

import * as Sentry from '@sentry/react';
import { logger } from './loggingService';

export interface SentryConfig {
  /** Enable/disable Sentry */
  enabled: boolean;
  /** Sentry DSN from environment */
  dsn?: string;
  /** Environment name (production, staging, development) */
  environment?: string;
  /** Application release version */
  release?: string;
  /** Sample rate for performance monitoring (0.0 to 1.0) */
  tracesSampleRate?: number;
  /** Sample rate for session replay (0.0 to 1.0) */
  replaysSessionSampleRate?: number;
  /** Sample rate for error replays (0.0 to 1.0) */
  replaysOnErrorSampleRate?: number;
}

class SentryService {
  private initialized = false;
  private config: SentryConfig = {
    enabled: false,
  };

  /**
   * Initialize Sentry with configuration
   * Should be called early in application startup (index.tsx)
   */
  async initialize(config?: Partial<SentryConfig>): Promise<void> {
    if (this.initialized) {
      logger.warn('Sentry', 'Already initialized, skipping');
      return;
    }

    // Auto-detect from environment variables
    const dsn = config?.dsn || import.meta.env.VITE_SENTRY_DSN;
    const environment = config?.environment || import.meta.env.VITE_ENVIRONMENT || 'production';
    const enabled = config?.enabled !== false && !!dsn;

    this.config = {
      enabled,
      dsn,
      environment,
      release: config?.release || import.meta.env.VITE_APP_VERSION || '1.0.0',
      tracesSampleRate: config?.tracesSampleRate ?? 0.1,
      replaysSessionSampleRate: config?.replaysSessionSampleRate ?? 0.1,
      replaysOnErrorSampleRate: config?.replaysOnErrorSampleRate ?? 1.0,
    };

    if (!enabled) {
      logger.debug('Sentry', 'Sentry disabled (no DSN provided or explicitly disabled)');
      this.initialized = true;
      return;
    }

    try {
      Sentry.init({
        dsn: this.config.dsn,
        environment: this.config.environment,
        release: this.config.release,

        integrations: [
          Sentry.browserTracingIntegration({
            // Track route changes
            enableInp: true,
          }),
          Sentry.replayIntegration({
            // Mask all text and images by default for privacy
            maskAllText: true,
            blockAllMedia: true,
          }),
          Sentry.feedbackIntegration({
            // User feedback widget
            colorScheme: 'dark',
          }),
        ],

        // Performance Monitoring
        tracesSampleRate: this.config.tracesSampleRate,

        // Session Replay
        replaysSessionSampleRate: this.config.replaysSessionSampleRate,
        replaysOnErrorSampleRate: this.config.replaysOnErrorSampleRate,

        // Don't send errors in development
        beforeSend(event, hint) {
          if (import.meta.env.DEV) {
            console.error('Sentry event (not sent in dev):', event, hint);
            return null;
          }
          return event;
        },

        // Filter out noise
        ignoreErrors: [
          // Browser extensions
          'top.GLOBALS',
          'chrome-extension://',
          'moz-extension://',
          // Network errors that are expected
          'NetworkError',
          'Failed to fetch',
          // WebSocket expected disconnects
          'WebSocket connection',
        ],

        denyUrls: [
          // Browser extensions
          /extensions\//i,
          /^chrome:\/\//i,
          /^moz-extension:\/\//i,
        ],
      });

      this.initialized = true;
      logger.info('Sentry', `Initialized successfully (env: ${environment})`);
    } catch (error) {
      logger.error('Sentry', 'Failed to initialize', error);
      this.config.enabled = false;
    }
  }

  /**
   * Capture an exception with context
   */
  captureException(error: Error, context?: Record<string, unknown>): void {
    if (!this.config.enabled) {
      logger.error('Sentry', `Exception (Sentry disabled): ${error.message}`, context);
      return;
    }

    Sentry.captureException(error, {
      contexts: {
        custom: context,
      },
    });
  }

  /**
   * Capture a message
   */
  captureMessage(message: string, level: Sentry.SeverityLevel = 'info'): void {
    if (!this.config.enabled) {
      logger.info('Sentry', `Message (Sentry disabled): ${message}`);
      return;
    }

    Sentry.captureMessage(message, level);
  }

  /**
   * Set user context
   */
  setUser(user: { id?: string; username?: string; pubkey?: string } | null): void {
    if (!this.config.enabled) return;

    Sentry.setUser(user ? {
      id: user.id || user.pubkey,
      username: user.username,
    } : null);
  }

  /**
   * Add breadcrumb for debugging
   */
  addBreadcrumb(breadcrumb: {
    message: string;
    category?: string;
    level?: Sentry.SeverityLevel;
    data?: Record<string, unknown>;
  }): void {
    if (!this.config.enabled) return;

    Sentry.addBreadcrumb({
      message: breadcrumb.message,
      category: breadcrumb.category || 'app',
      level: breadcrumb.level || 'info',
      data: breadcrumb.data,
      timestamp: Date.now() / 1000,
    });
  }

  /**
   * Set custom context
   */
  setContext(name: string, context: Record<string, unknown>): void {
    if (!this.config.enabled) return;
    Sentry.setContext(name, context);
  }

  /**
   * Set a tag
   */
  setTag(key: string, value: string): void {
    if (!this.config.enabled) return;
    Sentry.setTag(key, value);
  }

  /**
   * Start a span for performance monitoring (Sentry v8+)
   * Returns a function to end the span
   */
  startSpan<T>(name: string, op: string, callback: () => T): T {
    if (!this.config.enabled) return callback();
    return Sentry.startSpan({ name, op }, callback);
  }

  /**
   * Start an inactive span for performance monitoring (Sentry v8+)
   * Returns the span object that must be manually finished
   */
  startInactiveSpan(name: string, op: string): Sentry.Span | null {
    if (!this.config.enabled) return null;
    return Sentry.startInactiveSpan({ name, op });
  }

  /**
   * Check if Sentry is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get the Sentry ErrorBoundary component
   */
  getErrorBoundary() {
    return Sentry.ErrorBoundary;
  }

  /**
   * Show the user feedback dialog
   */
  showReportDialog(): void {
    if (!this.config.enabled) return;
    Sentry.showReportDialog();
  }
}

// Export singleton instance
export const sentryService = new SentryService();

// Re-export Sentry types for convenience
export type { SeverityLevel } from '@sentry/react';
export { Sentry };
