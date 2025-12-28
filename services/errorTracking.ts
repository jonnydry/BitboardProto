/**
 * Error Tracking Service for BitBoard
 * 
 * Supports optional Sentry integration for production error monitoring.
 * 
 * ## Setup Instructions for Sentry (Optional)
 * 
 * To enable Sentry error tracking in production:
 * 
 * 1. Install the Sentry SDK:
 *    ```bash
 *    npm install @sentry/react
 *    ```
 * 
 * 2. Set the SENTRY_ENABLED flag to true in the initialize call:
 *    ```typescript
 *    errorTrackingService.initialize({
 *      enabled: true,
 *      dsn: 'YOUR_SENTRY_DSN',
 *      environment: 'production',
 *      release: '1.0.0'
 *    });
 *    ```
 * 
 * 3. Call initialize() early in your app startup (e.g., in index.tsx)
 * 
 * ## Without Sentry
 * 
 * The service gracefully handles cases where Sentry is not installed.
 * All error tracking methods will log to the console instead, ensuring
 * the app continues to function normally.
 */

import { logger } from './loggingService';

export interface ErrorTrackingConfig {
  /** Enable/disable error tracking */
  enabled: boolean;
  /** Sentry DSN (required if enabled) */
  dsn?: string;
  /** Environment name (e.g., 'production', 'staging', 'development') */
  environment?: string;
  /** Application release version */
  release?: string;
}

interface SentryLike {
  init: (config: unknown) => void;
  captureException: (error: Error, context?: unknown) => void;
  captureMessage: (message: string, level: string) => void;
  setUser: (user: unknown) => void;
  addBreadcrumb: (breadcrumb: unknown) => void;
  browserTracingIntegration: () => unknown;
  replayIntegration: () => unknown;
}

class ErrorTrackingService {
  private config: ErrorTrackingConfig = {
    enabled: false,
  };

  private sentry: SentryLike | null = null;
  private initialized = false;

  /**
   * Initialize error tracking service
   * 
   * @param config - Configuration options for error tracking
   * @example
   * ```typescript
   * await errorTrackingService.initialize({
   *   enabled: true,
   *   dsn: 'https://your-sentry-dsn',
   *   environment: 'production',
   *   release: '1.0.0'
   * });
   * ```
   */
  async initialize(config: ErrorTrackingConfig): Promise<void> {
    if (this.initialized) {
      logger.warn('ErrorTracking', 'Already initialized, skipping');
      return;
    }

    this.config = config;
    this.initialized = true;

    if (!config.enabled) {
      logger.debug('ErrorTracking', 'Error tracking disabled');
      return;
    }

    if (!config.dsn) {
      logger.warn('ErrorTracking', 'No DSN provided, error tracking disabled');
      return;
    }

    try {
      // Dynamically import Sentry to avoid build errors when not installed
      // Using a variable prevents Vite from statically analyzing the import
      const sentryModule = '@sentry/react';
      const Sentry = await import(/* @vite-ignore */ sentryModule) as SentryLike;
      
      Sentry.init({
        dsn: config.dsn,
        environment: config.environment || 'production',
        release: config.release,
        integrations: [
          Sentry.browserTracingIntegration(),
          Sentry.replayIntegration(),
        ],
        // Performance monitoring: sample 10% of transactions
        tracesSampleRate: 0.1,
        // Session replay: sample 10% of sessions, 100% on error
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
      });

      this.sentry = Sentry;
      logger.info('ErrorTracking', 'Sentry initialized successfully');
    } catch (_error) {
      // Sentry not installed - this is expected in development
      logger.debug('ErrorTracking', 'Sentry not available (install @sentry/react to enable)');
    }
  }

  /**
   * Capture an exception for error tracking
   * 
   * @param error - The error to capture
   * @param context - Optional additional context for debugging
   */
  captureException(error: Error, context?: Record<string, unknown>): void {
    if (this.sentry) {
      this.sentry.captureException(error, {
        contexts: {
          custom: context,
        },
      });
    }
    
    // Always log to console for local debugging
    logger.error('ErrorTracking', `Exception: ${error.message}`, context);
  }

  /**
   * Capture a message for tracking
   * 
   * @param message - The message to capture
   * @param level - Severity level
   */
  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    if (this.sentry) {
      this.sentry.captureMessage(message, level);
    }
    
    // Log based on level
    if (level === 'error') {
      logger.error('ErrorTracking', message);
    } else if (level === 'warning') {
      logger.warn('ErrorTracking', message);
    } else {
      logger.info('ErrorTracking', message);
    }
  }

  /**
   * Set the current user context for error tracking
   * 
   * @param user - User information, or null to clear
   */
  setUser(user: { id?: string; username?: string; email?: string } | null): void {
    if (this.sentry) {
      this.sentry.setUser(user);
    }
  }

  /**
   * Add a breadcrumb for debugging context
   * 
   * @param breadcrumb - Breadcrumb data
   */
  addBreadcrumb(breadcrumb: { 
    message: string; 
    category?: string; 
    level?: 'info' | 'warning' | 'error';
    data?: Record<string, unknown>;
  }): void {
    if (this.sentry) {
      this.sentry.addBreadcrumb(breadcrumb);
    }
  }

  /**
   * Check if error tracking is enabled and initialized
   */
  isEnabled(): boolean {
    return this.config.enabled && this.sentry !== null;
  }
}

export const errorTrackingService = new ErrorTrackingService();



