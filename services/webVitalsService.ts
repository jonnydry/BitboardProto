/**
 * Web Vitals Monitoring Service for BitBoard
 *
 * Tracks Core Web Vitals and reports them to analytics.
 * Monitors: LCP, FID, CLS, TTFB, FCP, INP
 */

import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';
import { logger } from './loggingService';
import { analyticsService } from './analyticsService';
import { sentryService } from './sentryService';

export interface WebVitalsConfig {
  /** Enable/disable web vitals tracking */
  enabled: boolean;
  /** Send to analytics */
  sendToAnalytics?: boolean;
  /** Send to Sentry */
  sendToSentry?: boolean;
  /** Log to console */
  logToConsole?: boolean;
}

// Web Vitals thresholds (Google standards)
const THRESHOLDS = {
  LCP: { good: 2500, needsImprovement: 4000 }, // Largest Contentful Paint
  FID: { good: 100, needsImprovement: 300 }, // First Input Delay (deprecated)
  INP: { good: 200, needsImprovement: 500 }, // Interaction to Next Paint
  CLS: { good: 0.1, needsImprovement: 0.25 }, // Cumulative Layout Shift
  TTFB: { good: 800, needsImprovement: 1800 }, // Time to First Byte
  FCP: { good: 1800, needsImprovement: 3000 }, // First Contentful Paint
} as const;

class WebVitalsService {
  private config: WebVitalsConfig = {
    enabled: false,
    sendToAnalytics: true,
    sendToSentry: true,
    logToConsole: import.meta.env.DEV,
  };

  /**
   * Initialize Web Vitals monitoring
   */
  initialize(config?: Partial<WebVitalsConfig>): void {
    this.config = { ...this.config, ...config };

    if (!this.config.enabled) {
      logger.debug('WebVitals', 'Web Vitals tracking disabled');
      return;
    }

    // Track all Core Web Vitals
    onCLS(this.handleMetric.bind(this), { reportAllChanges: false });
    onFCP(this.handleMetric.bind(this));
    onINP(this.handleMetric.bind(this));
    onLCP(this.handleMetric.bind(this), { reportAllChanges: false });
    onTTFB(this.handleMetric.bind(this));

    logger.info('WebVitals', 'Web Vitals monitoring initialized');
  }

  /**
   * Handle a web vitals metric
   */
  private handleMetric(metric: Metric): void {
    const { name, value, rating, delta } = metric;

    // Get threshold rating
    const threshold = this.getRating(name, value);

    // Log to console in development
    if (this.config.logToConsole) {
      const color = threshold === 'good' ? '🟢' : threshold === 'needs-improvement' ? '🟡' : '🔴';
      logger.info('WebVitals', `${color} ${name}: ${value.toFixed(2)}ms (${rating})`);
    }

    // Send to analytics
    if (this.config.sendToAnalytics && analyticsService.isEnabled()) {
      analyticsService.track('web_vital_measured', {
        metric: name,
        value: Math.round(value),
        rating,
        threshold,
        delta: Math.round(delta),
        id: metric.id,
        navigationType: metric.navigationType,
      });
    }

    // Send poor metrics to Sentry for alerting
    if (this.config.sendToSentry && sentryService.isEnabled() && threshold === 'poor') {
      sentryService.captureMessage(`Poor ${name}: ${value.toFixed(2)}ms`, 'warning');
      sentryService.setContext('web_vitals', {
        metric: name,
        value,
        rating,
        threshold,
      });
    }
  }

  /**
   * Get threshold rating for a metric
   */
  private getRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
    const threshold = THRESHOLDS[name as keyof typeof THRESHOLDS];
    if (!threshold) return 'good';

    if (value <= threshold.good) return 'good';
    if (value <= threshold.needsImprovement) return 'needs-improvement';
    return 'poor';
  }

  /**
   * Manually report a custom performance metric
   */
  reportCustomMetric(name: string, value: number, unit: string = 'ms'): void {
    if (!this.config.enabled) return;

    if (this.config.logToConsole) {
      logger.info('WebVitals', `Custom metric: ${name} = ${value}${unit}`);
    }

    if (this.config.sendToAnalytics && analyticsService.isEnabled()) {
      analyticsService.track('custom_performance_metric', {
        name,
        value,
        unit,
      });
    }
  }

  /**
   * Track a page load time
   */
  trackPageLoad(): void {
    if (!this.config.enabled) return;

    // Use Performance API
    if (window.performance && window.performance.timing) {
      const timing = window.performance.timing;
      const loadTime = timing.loadEventEnd - timing.navigationStart;
      const domReadyTime = timing.domContentLoadedEventEnd - timing.navigationStart;
      const renderTime = timing.domComplete - timing.domLoading;

      this.reportCustomMetric('page_load_time', loadTime);
      this.reportCustomMetric('dom_ready_time', domReadyTime);
      this.reportCustomMetric('render_time', renderTime);
    }
  }

  /**
   * Track a specific operation duration
   */
  measureOperation<T>(name: string, operation: () => T): T {
    const start = performance.now();
    try {
      const result = operation();
      const duration = performance.now() - start;
      this.reportCustomMetric(name, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.reportCustomMetric(`${name}_error`, duration);
      throw error;
    }
  }

  /**
   * Track an async operation duration
   */
  async measureAsyncOperation<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await operation();
      const duration = performance.now() - start;
      this.reportCustomMetric(name, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.reportCustomMetric(`${name}_error`, duration);
      throw error;
    }
  }
}

// Export singleton instance
export const webVitalsService = new WebVitalsService();
