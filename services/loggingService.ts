/**
 * Logging Service for BitBoard
 * 
 * Provides structured logging with log levels and optional module prefixes.
 * In production, debug logs are suppressed for better performance.
 * 
 * ## Usage
 * 
 * ```typescript
 * import { logger } from './loggingService';
 * 
 * logger.debug('MyModule', 'Debug message');
 * logger.info('MyModule', 'Info message');
 * logger.warn('MyModule', 'Warning message');
 * logger.error('MyModule', 'Error message', { extra: 'context' });
 * ```
 * 
 * ## Log Levels
 * 
 * - DEBUG: Detailed information for debugging (suppressed in production)
 * - INFO: General operational messages
 * - WARN: Warnings that should be noticed
 * - ERROR: Error conditions
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

interface LogConfig {
  /** Minimum log level to output */
  level: LogLevel;
  /** Whether to include timestamps */
  includeTimestamp: boolean;
  /** Whether to include log level in output */
  includeLevel: boolean;
}

class LoggingService {
  private config: LogConfig;

  constructor() {
    // Default configuration based on environment
    const isDev = typeof process !== 'undefined' 
      ? process.env.NODE_ENV === 'development'
      : !window.location.hostname.includes('bitboard');

    this.config = {
      level: isDev ? LogLevel.DEBUG : LogLevel.INFO,
      includeTimestamp: false,
      includeLevel: true,
    };
  }

  /**
   * Configure the logging service
   */
  configure(config: Partial<LogConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Format a log message with optional prefix and context
   */
  private formatMessage(
    level: LogLevel,
    module: string,
    message: string
  ): string {
    const parts: string[] = [];

    if (this.config.includeTimestamp) {
      parts.push(new Date().toISOString());
    }

    if (this.config.includeLevel) {
      const levelName = LogLevel[level];
      parts.push(`[${levelName}]`);
    }

    parts.push(`[${module}]`);
    parts.push(message);

    return parts.join(' ');
  }

  /**
   * Log a debug message (suppressed in production)
   */
  debug(module: string, message: string, context?: unknown): void {
    if (this.config.level > LogLevel.DEBUG) return;
    
    const formatted = this.formatMessage(LogLevel.DEBUG, module, message);
    if (context !== undefined) {
      console.debug(formatted, context);
    } else {
      console.debug(formatted);
    }
  }

  /**
   * Log an informational message
   */
  info(module: string, message: string, context?: unknown): void {
    if (this.config.level > LogLevel.INFO) return;
    
    const formatted = this.formatMessage(LogLevel.INFO, module, message);
    if (context !== undefined) {
      console.log(formatted, context);
    } else {
      console.log(formatted);
    }
  }

  /**
   * Log a warning message
   */
  warn(module: string, message: string, context?: unknown): void {
    if (this.config.level > LogLevel.WARN) return;
    
    const formatted = this.formatMessage(LogLevel.WARN, module, message);
    if (context !== undefined) {
      console.warn(formatted, context);
    } else {
      console.warn(formatted);
    }
  }

  /**
   * Log an error message
   */
  error(module: string, message: string, context?: unknown): void {
    if (this.config.level > LogLevel.ERROR) return;
    
    const formatted = this.formatMessage(LogLevel.ERROR, module, message);
    if (context !== undefined) {
      console.error(formatted, context);
    } else {
      console.error(formatted);
    }
  }

  /**
   * Create a scoped logger for a specific module
   * 
   * @example
   * const log = logger.scope('MyComponent');
   * log.info('Something happened');
   */
  scope(module: string): {
    debug: (message: string, context?: unknown) => void;
    info: (message: string, context?: unknown) => void;
    warn: (message: string, context?: unknown) => void;
    error: (message: string, context?: unknown) => void;
  } {
    return {
      debug: (message: string, context?: unknown) => this.debug(module, message, context),
      info: (message: string, context?: unknown) => this.info(module, message, context),
      warn: (message: string, context?: unknown) => this.warn(module, message, context),
      error: (message: string, context?: unknown) => this.error(module, message, context),
    };
  }

  /**
   * Log with performance timing
   * Returns a function to call when the operation completes
   * 
   * @example
   * const done = logger.time('MyModule', 'Expensive operation');
   * await expensiveOperation();
   * done(); // Logs: "[MyModule] Expensive operation completed in 123ms"
   */
  time(module: string, operation: string): () => void {
    const start = performance.now();
    this.debug(module, `${operation} started`);
    
    return () => {
      const duration = Math.round(performance.now() - start);
      this.debug(module, `${operation} completed in ${duration}ms`);
    };
  }

  /**
   * Add a performance mark (for use with Performance API)
   * Marks are visible in browser dev tools under Performance tab
   */
  mark(name: string): void {
    if (typeof performance !== 'undefined' && performance.mark) {
      try {
        performance.mark(name);
      } catch {
        // Ignore if performance API not available
      }
    }
  }

  /**
   * Measure duration between two marks
   * 
   * @example
   * logger.mark('fetch-start');
   * await fetchData();
   * logger.mark('fetch-end');
   * logger.measure('data-fetch', 'fetch-start', 'fetch-end');
   */
  measure(name: string, startMark: string, endMark: string): number | null {
    if (typeof performance !== 'undefined' && performance.measure) {
      try {
        const measure = performance.measure(name, startMark, endMark);
        const duration = Math.round(measure.duration);
        this.debug('Performance', `${name}: ${duration}ms`);
        return duration;
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Clear all performance marks and measures
   */
  clearPerformanceMarks(): void {
    if (typeof performance !== 'undefined') {
      try {
        performance.clearMarks();
        performance.clearMeasures();
      } catch {
        // Ignore if performance API not available
      }
    }
  }
}

// Export singleton instance
export const logger = new LoggingService();

// Export class for testing
export { LoggingService };
