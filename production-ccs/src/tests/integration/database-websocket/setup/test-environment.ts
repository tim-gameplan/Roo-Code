import { Pool } from 'pg';
import Redis from 'ioredis';
import { WebSocket } from 'ws';

// Simple logger for tests
const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.debug(`[DEBUG] ${message}`, ...args),
};

export interface TestEnvironment {
  database: Pool;
  redis: Redis;
  websocketClients: WebSocket[];
  cleanup: () => Promise<void>;
}

export interface TestConfig {
  database: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  };
  redis: {
    host: string;
    port: number;
  };
  websocket: {
    port: number;
    host: string;
  };
}

export const defaultTestConfig: TestConfig = {
  database: {
    host: 'localhost',
    port: 5432,
    database: 'roo_code_test',
    username: 'roo_user',
    password: 'roo_password',
  },
  redis: {
    host: 'localhost',
    port: 6379,
  },
  websocket: {
    port: 3001,
    host: 'localhost',
  },
};

export class IntegrationTestEnvironment {
  private database: Pool | null = null;
  private redis: Redis | null = null;
  private websocketClients: WebSocket[] = [];
  private config: TestConfig;

  constructor(config: TestConfig = defaultTestConfig) {
    this.config = config;
  }

  async setup(): Promise<TestEnvironment> {
    try {
      // Initialize database connection
      this.database = new Pool({
        host: this.config.database.host,
        port: this.config.database.port,
        database: this.config.database.database,
        user: this.config.database.username,
        password: this.config.database.password,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Test database connection
      const dbClient = await this.database.connect();
      await dbClient.query('SELECT NOW()');
      dbClient.release();
      logger.info('Database connection established for integration tests');

      // Initialize Redis connection
      this.redis = new Redis({
        host: this.config.redis.host,
        port: this.config.redis.port,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      // Test Redis connection
      await this.redis.ping();
      logger.info('Redis connection established for integration tests');

      return {
        database: this.database,
        redis: this.redis,
        websocketClients: this.websocketClients,
        cleanup: this.cleanup.bind(this),
      };
    } catch (error) {
      logger.error('Failed to setup integration test environment:', error);
      await this.cleanup();
      throw error;
    }
  }

  async createWebSocketClient(url?: string): Promise<WebSocket> {
    const wsUrl = url || `ws://${this.config.websocket.host}:${this.config.websocket.port}`;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        this.websocketClients.push(ws);
        logger.info(`WebSocket client connected to ${wsUrl}`);
        resolve(ws);
      });

      ws.on('error', (error) => {
        logger.error('WebSocket connection error:', error);
        reject(error);
      });

      // Set timeout for connection
      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.terminate();
          reject(new Error('WebSocket connection timeout'));
        }
      }, 5000);
    });
  }

  async clearTestData(): Promise<void> {
    if (!this.database || !this.redis) {
      throw new Error('Test environment not initialized');
    }

    try {
      // Clear database test data
      await this.database.query('TRUNCATE TABLE messages CASCADE');
      await this.database.query('TRUNCATE TABLE conversations CASCADE');
      await this.database.query('TRUNCATE TABLE user_sessions CASCADE');
      await this.database.query("DELETE FROM users WHERE email LIKE '%test%'");

      // Clear Redis test data
      const keys = await this.redis.keys('test:*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }

      logger.info('Test data cleared successfully');
    } catch (error) {
      logger.error('Failed to clear test data:', error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    try {
      // Close WebSocket connections
      for (const ws of this.websocketClients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.terminate();
        }
      }
      this.websocketClients = [];

      // Close Redis connection
      if (this.redis) {
        await this.redis.quit();
        this.redis = null;
      }

      // Close database connection
      if (this.database) {
        await this.database.end();
        this.database = null;
      }

      logger.info('Integration test environment cleaned up successfully');
    } catch (error) {
      logger.error('Error during test environment cleanup:', error);
      throw error;
    }
  }

  async waitForWebSocketMessage(ws: WebSocket, timeout: number = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('WebSocket message timeout'));
      }, timeout);

      ws.once('message', (data) => {
        clearTimeout(timer);
        try {
          const message = JSON.parse(data.toString());
          resolve(message);
        } catch (error) {
          reject(new Error('Failed to parse WebSocket message'));
        }
      });
    });
  }

  async sendWebSocketMessage(ws: WebSocket, message: any): Promise<void> {
    if (ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }

    ws.send(JSON.stringify(message));
  }
}

export default IntegrationTestEnvironment;
