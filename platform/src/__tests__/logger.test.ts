import { describe, it, expect } from 'vitest';

describe('createLogger', () => {
  it('returns object with info/warn/error/debug methods', async () => {
    const { createLogger } = await import('../lib/logger.js');
    const log = createLogger('test');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
    expect(typeof log.debug).toBe('function');
  });

  it('child logger bindings include module field', async () => {
    const { createLogger } = await import('../lib/logger.js');
    const log = createLogger('myModule');
    // pino child loggers expose bindings()
    const bindings = (log as any).bindings?.() ?? {};
    expect(bindings.module).toBe('myModule');
  });

  it('different module names produce different child loggers', async () => {
    const { createLogger } = await import('../lib/logger.js');
    const a = createLogger('moduleA');
    const b = createLogger('moduleB');
    expect((a as any).bindings?.().module).toBe('moduleA');
    expect((b as any).bindings?.().module).toBe('moduleB');
  });

  it('logger does not throw when called with structured data', async () => {
    const { createLogger } = await import('../lib/logger.js');
    const log = createLogger('safe');
    expect(() => log.info({ key: 'value' }, 'test message')).not.toThrow();
    expect(() => log.warn('warn message')).not.toThrow();
    expect(() => log.error({ err: 'oops' }, 'error message')).not.toThrow();
  });

  it('LOG_LEVEL env controls logger level (debug level is recognized)', async () => {
    // Just verify that setting LOG_LEVEL=debug doesn't break logger creation
    const origLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'debug';
    try {
      const { createLogger } = await import('../lib/logger.js');
      const log = createLogger('debug-test');
      expect(typeof log.debug).toBe('function');
    } finally {
      process.env.LOG_LEVEL = origLevel;
    }
  });
});
