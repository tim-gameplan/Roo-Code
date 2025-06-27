import winston from 'winston';
import { config } from '../config';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
  return `${timestamp} [${level}]: ${message} ${metaStr}`;
});

// Create logger transports based on configuration
const transports: winston.transport[] = [];

// Console transport
if (config.logger.console.enabled) {
  const consoleTransport = new winston.transports.Console({
    format: combine(
      timestamp(),
      errors({ stack: true }),
      config.logger.console.colorize ? colorize() : winston.format.uncolorize(),
      config.logger.format === 'json' ? json() : consoleFormat
    ),
  });
  transports.push(consoleTransport);
}

// File transport
if (config.logger.file?.enabled) {
  const fileTransport = new winston.transports.File({
    filename: config.logger.file.filename,
    maxsize: parseSize(config.logger.file.maxSize),
    maxFiles: config.logger.file.maxFiles,
    format: combine(timestamp(), errors({ stack: true }), json()),
  });
  transports.push(fileTransport);
}

// Parse size string (e.g., "20m", "1g") to bytes
function parseSize(sizeStr: string): number {
  const units: Record<string, number> = {
    b: 1,
    k: 1024,
    m: 1024 * 1024,
    g: 1024 * 1024 * 1024,
  };

  const match = sizeStr.toLowerCase().match(/^(\d+)([bkmg]?)$/);
  if (!match) {
    throw new Error(`Invalid size format: ${sizeStr}`);
  }

  const [, sizeValue, unit] = match;
  const sizeNum = parseInt(sizeValue || '0', 10);
  const multiplier = units[unit || 'b'] || 1;
  return sizeNum * multiplier;
}

// Create the logger instance
export const logger = winston.createLogger({
  level: config.logger.level,
  format: combine(timestamp(), errors({ stack: true })),
  transports,
  // Don't exit on handled exceptions
  exitOnError: false,
});

// Add request ID to logger context
export const createRequestLogger = (requestId: string) => {
  return logger.child({ requestId });
};

// Helper functions for structured logging
export const logError = (error: Error, context?: Record<string, unknown>) => {
  logger.error('Error occurred', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...context,
  });
};

export const logRequest = (
  method: string,
  url: string,
  statusCode: number,
  responseTime: number,
  context?: Record<string, unknown>
) => {
  logger.info('HTTP Request', {
    method,
    url,
    statusCode,
    responseTime,
    ...context,
  });
};

export const logDatabaseQuery = (
  query: string,
  duration: number,
  context?: Record<string, unknown>
) => {
  logger.debug('Database Query', {
    query,
    duration,
    ...context,
  });
};

export const logWebSocketEvent = (
  event: string,
  connectionId: string,
  context?: Record<string, unknown>
) => {
  logger.info('WebSocket Event', {
    event,
    connectionId,
    ...context,
  });
};

export const logExtensionCommunication = (
  action: string,
  success: boolean,
  duration?: number,
  context?: Record<string, unknown>
) => {
  logger.info('Extension Communication', {
    action,
    success,
    duration,
    ...context,
  });
};

// Performance monitoring helpers
export const createTimer = () => {
  const start = Date.now();
  return {
    end: () => Date.now() - start,
  };
};

export const withTiming = async <T>(
  operation: () => Promise<T>,
  operationName: string,
  context?: Record<string, unknown>
): Promise<T> => {
  const timer = createTimer();
  try {
    const result = await operation();
    const duration = timer.end();
    logger.info(`Operation completed: ${operationName}`, {
      duration,
      success: true,
      ...context,
    });
    return result;
  } catch (error) {
    const duration = timer.end();
    logger.error(`Operation failed: ${operationName}`, {
      duration,
      success: false,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
      ...context,
    });
    throw error;
  }
};

export default logger;
