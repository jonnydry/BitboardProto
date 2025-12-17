// Error tracking service for production monitoring
// Supports Sentry integration (optional)

interface ErrorTrackingConfig {
  enabled: boolean;
  dsn?: string;
  environment?: string;
  release?: string;
}

class ErrorTrackingService {
  private config: ErrorTrackingConfig = {
    enabled: false,
  };

  private sentry: any = null;

  /**
   * Initialize error tracking (Sentry)
   * Call this once at app startup if error tracking is desired
   */
  async initialize(config: ErrorTrackingConfig): Promise<void> {
    this.config = config;

    if (!config.enabled || !config.dsn) {
      console.log('[ErrorTracking] Error tracking disabled');
      return;
    }

    try {
      // Dynamically import Sentry to avoid bundling it if not used
      const Sentry = await import('@sentry/react');
      
      Sentry.init({
        dsn: config.dsn,
        environment: config.environment || 'production',
        release: config.release,
        integrations: [
          new Sentry.BrowserTracing(),
          new Sentry.Replay(),
        ],
        tracesSampleRate: 0.1, // 10% of transactions
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
      });

      this.sentry = Sentry;
      console.log('[ErrorTracking] Sentry initialized');
    } catch (error) {
      console.warn('[ErrorTracking] Failed to initialize Sentry:', error);
    }
  }

  /**
   * Capture an exception
   */
  captureException(error: Error, context?: Record<string, any>): void {
    if (!this.config.enabled) {
      console.error('[ErrorTracking] Exception (tracking disabled):', error, context);
      return;
    }

    if (this.sentry) {
      this.sentry.captureException(error, {
        contexts: {
          custom: context,
        },
      });
    } else {
      console.error('[ErrorTracking] Exception:', error, context);
    }
  }

  /**
   * Capture a message
   */
  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    if (!this.config.enabled) {
      console.log(`[ErrorTracking] ${level}:`, message);
      return;
    }

    if (this.sentry) {
      this.sentry.captureMessage(message, level);
    } else {
      console.log(`[ErrorTracking] ${level}:`, message);
    }
  }

  /**
   * Set user context
   */
  setUser(user: { id?: string; username?: string; email?: string } | null): void {
    if (!this.config.enabled || !this.sentry) return;

    this.sentry.setUser(user);
  }

  /**
   * Add breadcrumb for debugging
   */
  addBreadcrumb(breadcrumb: { message: string; category?: string; level?: 'info' | 'warning' | 'error' }): void {
    if (!this.config.enabled || !this.sentry) return;

    this.sentry.addBreadcrumb(breadcrumb);
  }
}

export const errorTrackingService = new ErrorTrackingService();

