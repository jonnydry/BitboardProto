import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LoggingService, LogLevel, logger } from '../../services/loggingService';

describe('LoggingService', () => {
  let loggingService: LoggingService;
  let consoleSpy: {
    debug: ReturnType<typeof vi.spyOn>;
    log: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    loggingService = new LoggingService();
    consoleSpy = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    consoleSpy.debug.mockRestore();
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  describe('Log Level Filtering', () => {
    it('should log debug messages when level is DEBUG', () => {
      loggingService.setLevel(LogLevel.DEBUG);
      loggingService.debug('TestModule', 'Debug message');
      expect(consoleSpy.debug).toHaveBeenCalled();
    });

    it('should not log debug messages when level is INFO', () => {
      loggingService.setLevel(LogLevel.INFO);
      loggingService.debug('TestModule', 'Debug message');
      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });

    it('should log info messages when level is INFO', () => {
      loggingService.setLevel(LogLevel.INFO);
      loggingService.info('TestModule', 'Info message');
      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('should log warn messages when level is WARN', () => {
      loggingService.setLevel(LogLevel.WARN);
      loggingService.warn('TestModule', 'Warning message');
      expect(consoleSpy.warn).toHaveBeenCalled();
    });

    it('should log error messages when level is ERROR', () => {
      loggingService.setLevel(LogLevel.ERROR);
      loggingService.error('TestModule', 'Error message');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should not log anything when level is NONE', () => {
      loggingService.setLevel(LogLevel.NONE);
      loggingService.debug('TestModule', 'Debug');
      loggingService.info('TestModule', 'Info');
      loggingService.warn('TestModule', 'Warn');
      loggingService.error('TestModule', 'Error');
      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });
  });

  describe('Message Formatting', () => {
    it('should include module name in message', () => {
      loggingService.setLevel(LogLevel.DEBUG);
      loggingService.info('MyModule', 'Test message');
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('[MyModule]'));
    });

    it('should include log level in message', () => {
      loggingService.setLevel(LogLevel.DEBUG);
      loggingService.info('MyModule', 'Test message');
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('[INFO]'));
    });

    it('should pass context to console', () => {
      loggingService.setLevel(LogLevel.DEBUG);
      const context = { foo: 'bar' };
      loggingService.info('MyModule', 'Test message', context);
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.any(String), context);
    });
  });

  describe('Scoped Logger', () => {
    it('should create a scoped logger', () => {
      loggingService.setLevel(LogLevel.DEBUG);
      const scoped = loggingService.scope('ScopedModule');
      
      scoped.info('Test message');
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('[ScopedModule]'));
    });

    it('should support all log levels in scoped logger', () => {
      loggingService.setLevel(LogLevel.DEBUG);
      const scoped = loggingService.scope('TestScope');
      
      scoped.debug('Debug');
      scoped.info('Info');
      scoped.warn('Warn');
      scoped.error('Error');
      
      expect(consoleSpy.debug).toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });

  describe('Timer', () => {
    it('should measure operation duration', async () => {
      loggingService.setLevel(LogLevel.DEBUG);
      
      const done = loggingService.time('TestModule', 'Test operation');
      
      // Simulate some async work
      await new Promise(resolve => setTimeout(resolve, 10));
      
      done();
      
      // Should log start and completion
      expect(consoleSpy.debug).toHaveBeenCalledTimes(2);
      expect(consoleSpy.debug).toHaveBeenCalledWith(expect.stringContaining('started'));
      expect(consoleSpy.debug).toHaveBeenCalledWith(expect.stringContaining('completed'));
    });
  });

  describe('Configuration', () => {
    it('should allow configuration changes', () => {
      loggingService.configure({ level: LogLevel.WARN });
      expect(loggingService.getLevel()).toBe(LogLevel.WARN);
    });

    it('should return current log level', () => {
      loggingService.setLevel(LogLevel.INFO);
      expect(loggingService.getLevel()).toBe(LogLevel.INFO);
    });
  });

  describe('Singleton Export', () => {
    it('should export a singleton instance', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });
  });
});
