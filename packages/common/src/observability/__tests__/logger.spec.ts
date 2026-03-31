import { LoggerService } from '../logger.service';

// Mock winston so no real transports are created during tests
jest.mock('winston', () => {
  const info = jest.fn();
  const error = jest.fn();
  const warn = jest.fn();
  const debug = jest.fn();
  const verbose = jest.fn();

  return {
    format: {
      combine: jest.fn(() => ({})),
      timestamp: jest.fn(() => ({})),
      json: jest.fn(() => ({})),
    },
    transports: {
      Console: jest.fn().mockImplementation(() => ({})),
    },
    createLogger: jest.fn(() => ({ info, error, warn, debug, verbose })),
  };
});

describe('LoggerService', () => {
  let logger: LoggerService;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new LoggerService('test-service');
  });

  it('should be instantiated without errors', () => {
    expect(logger).toBeDefined();
  });

  it('log() should not throw', () => {
    expect(() => logger.log('hello')).not.toThrow();
  });

  it('log() with context should not throw', () => {
    expect(() => logger.log('hello', 'TestContext')).not.toThrow();
  });

  it('log() with data object should not throw', () => {
    expect(() => logger.log('hello', { key: 'value' }, 'TestContext')).not.toThrow();
  });

  it('error() should not throw', () => {
    expect(() => logger.error('an error', 'stack-trace', 'TestContext')).not.toThrow();
  });

  it('error() with data object should not throw', () => {
    expect(() => logger.error('an error', { detail: 'x' }, 'stack', 'TestContext')).not.toThrow();
  });

  it('warn() should not throw', () => {
    expect(() => logger.warn('a warning')).not.toThrow();
  });

  it('debug() should not throw', () => {
    expect(() => logger.debug('debug msg')).not.toThrow();
  });

  it('verbose() should not throw', () => {
    expect(() => logger.verbose('verbose msg')).not.toThrow();
  });

  it('should mask PII fields in logged objects', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const winston = require('winston');
    const winstonLogger = winston.createLogger();

    // Log an object containing PII
    logger.log('user created', { phone: '+233245678901', name: 'Alice' }, 'TestContext');

    // Extract the call args to the underlying winston info method
    const callArgs = (winstonLogger.info as jest.Mock).mock.calls[0];
    expect(callArgs).toBeDefined();
    const meta = callArgs[1] as Record<string, unknown>;
    // phone should be masked
    const data = meta.data as Record<string, unknown>;
    expect(data.phone).not.toBe('+233245678901');
    expect(typeof data.phone).toBe('string');
    expect(data.phone as string).toContain('***');
  });

  it('should default service name when none provided', () => {
    expect(() => new LoggerService()).not.toThrow();
  });
});
