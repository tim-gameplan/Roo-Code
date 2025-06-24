import dotenv from 'dotenv';
import { AppConfig, DatabaseConfig, RedisConfig, ServerConfig, LoggerConfig } from '@/types';

// Load environment variables
dotenv.config();

const getEnvVar = (key: string, defaultValue?: string): string => {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  return value;
};

const getEnvNumber = (key: string, defaultValue?: number): number => {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid number`);
  }
  return parsed;
};

const getEnvBoolean = (key: string, defaultValue?: boolean): boolean => {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  return value.toLowerCase() === 'true';
};

const databaseConfig: DatabaseConfig = {
  host: getEnvVar('DB_HOST', 'localhost'),
  port: getEnvNumber('DB_PORT', 5432),
  database: getEnvVar('DB_NAME', 'roo_remote_ui'),
  username: getEnvVar('DB_USER', 'postgres'),
  password: getEnvVar('DB_PASSWORD'),
  ssl: getEnvBoolean('DB_SSL', false),
  maxConnections: getEnvNumber('DB_MAX_CONNECTIONS', 20),
  connectionTimeout: getEnvNumber('DB_CONNECTION_TIMEOUT', 30000),
};

const redisConfig: RedisConfig = {
  host: getEnvVar('REDIS_HOST', 'localhost'),
  port: getEnvNumber('REDIS_PORT', 6379),
  ...(process.env['REDIS_PASSWORD'] && { password: process.env['REDIS_PASSWORD'] }),
  database: getEnvNumber('REDIS_DB', 0),
  keyPrefix: getEnvVar('REDIS_KEY_PREFIX', 'roo:'),
  maxRetries: getEnvNumber('REDIS_MAX_RETRIES', 3),
};

const serverConfig: ServerConfig = {
  port: getEnvNumber('PORT', 3000),
  host: getEnvVar('HOST', '0.0.0.0'),
  cors: {
    origin: getEnvVar('CORS_ORIGIN', 'http://localhost:3000').split(','),
    credentials: getEnvBoolean('CORS_CREDENTIALS', true),
  },
  rateLimit: {
    windowMs: getEnvNumber('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000), // 15 minutes
    max: getEnvNumber('RATE_LIMIT_MAX', 100), // limit each IP to 100 requests per windowMs
  },
  jwt: {
    secret: getEnvVar('JWT_SECRET'),
    accessTokenExpiry: getEnvVar('JWT_ACCESS_TOKEN_EXPIRY', '15m'),
    refreshTokenExpiry: getEnvVar('JWT_REFRESH_TOKEN_EXPIRY', '7d'),
  },
  bcrypt: {
    saltRounds: getEnvNumber('BCRYPT_SALT_ROUNDS', 12),
  },
};

const loggerConfig: LoggerConfig = {
  level: getEnvVar('LOG_LEVEL', 'info') as LoggerConfig['level'],
  format: getEnvVar('LOG_FORMAT', 'json') as LoggerConfig['format'],
  file: {
    enabled: getEnvBoolean('LOG_FILE_ENABLED', true),
    filename: getEnvVar('LOG_FILE_NAME', 'logs/app.log'),
    maxSize: getEnvVar('LOG_FILE_MAX_SIZE', '20m'),
    maxFiles: getEnvNumber('LOG_FILE_MAX_FILES', 5),
  },
  console: {
    enabled: getEnvBoolean('LOG_CONSOLE_ENABLED', true),
    colorize: getEnvBoolean('LOG_CONSOLE_COLORIZE', true),
  },
};

export const config: AppConfig = {
  env: getEnvVar('NODE_ENV', 'development') as AppConfig['env'],
  server: serverConfig,
  database: databaseConfig,
  redis: redisConfig,
  logger: loggerConfig,
  extensionSocket: {
    path: getEnvVar('EXTENSION_SOCKET_PATH', '/tmp/roo-extension.sock'),
    timeout: getEnvNumber('EXTENSION_SOCKET_TIMEOUT', 5000),
    retryAttempts: getEnvNumber('EXTENSION_SOCKET_RETRY_ATTEMPTS', 3),
    retryDelay: getEnvNumber('EXTENSION_SOCKET_RETRY_DELAY', 1000),
  },
};

// Validate configuration
export const validateConfig = (): void => {
  const requiredEnvVars = ['DB_PASSWORD', 'JWT_SECRET'];

  const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  // Validate JWT secret length
  if (config.server.jwt.secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  // Validate log level
  const validLogLevels = ['error', 'warn', 'info', 'debug'];
  if (!validLogLevels.includes(config.logger.level)) {
    throw new Error(`LOG_LEVEL must be one of: ${validLogLevels.join(', ')}`);
  }

  // Validate environment
  const validEnvs = ['development', 'production', 'test'];
  if (!validEnvs.includes(config.env)) {
    throw new Error(`NODE_ENV must be one of: ${validEnvs.join(', ')}`);
  }
};

// Export individual configs for convenience
export { databaseConfig, redisConfig, serverConfig, loggerConfig };
export default config;
