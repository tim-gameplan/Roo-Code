/**
 * Test WebSocket Server for Integration Testing
 *
 * This server provides a lightweight WebSocket server specifically for integration tests.
 * It starts the RCCS WebSocket server on the test port and provides test-specific functionality.
 */

import { RCCSWebSocketServer } from '../../services/rccs-websocket-server';
import { RCCSConfig } from '../../types/rccs';
import { logger } from '../../utils/logger';

export class TestWebSocketServer {
  private server: RCCSWebSocketServer | null = null;
  private config: RCCSConfig;

  constructor(port: number = 3001) {
    this.config = {
      port,
      maxConnections: 100,
      sessionTimeout: 30000, // 30 seconds for tests
      heartbeatInterval: 5000, // 5 seconds for tests
      messageTimeout: 10000, // 10 seconds for tests
      retryAttempts: 3,
      redis: {
        host: 'localhost',
        port: 6379,
        db: 1, // Use test database
      },
      database: {
        host: 'localhost',
        port: 5432,
        database: 'roo_code_test',
        username: 'roo_user',
        password: 'roo_password',
      },
    };
  }

  async start(): Promise<void> {
    try {
      this.server = new RCCSWebSocketServer(this.config);
      await this.server.start();

      logger.info('Test WebSocket server started successfully', {
        port: this.config.port,
        maxConnections: this.config.maxConnections,
      });
    } catch (error) {
      logger.error('Failed to start test WebSocket server', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.server) {
      try {
        await this.server.stop();
        this.server = null;
        logger.info('Test WebSocket server stopped successfully');
      } catch (error) {
        logger.error('Error stopping test WebSocket server', {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }
  }

  getServer(): RCCSWebSocketServer | null {
    return this.server;
  }

  getConfig(): RCCSConfig {
    return this.config;
  }

  isRunning(): boolean {
    return this.server !== null;
  }
}

// Global test server instance
let globalTestServer: TestWebSocketServer | null = null;

export async function startTestServer(port: number = 3001): Promise<TestWebSocketServer> {
  if (globalTestServer && globalTestServer.isRunning()) {
    return globalTestServer;
  }

  globalTestServer = new TestWebSocketServer(port);
  await globalTestServer.start();
  return globalTestServer;
}

export async function stopTestServer(): Promise<void> {
  if (globalTestServer) {
    await globalTestServer.stop();
    globalTestServer = null;
  }
}

export function getTestServer(): TestWebSocketServer | null {
  return globalTestServer;
}

// CLI interface for running the test server standalone
if (require.main === module) {
  const port = parseInt(process.argv[2] || '3001') || 3001;

  async function main() {
    const testServer = new TestWebSocketServer(port);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down test server...');
      await testServer.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down test server...');
      await testServer.stop();
      process.exit(0);
    });

    try {
      await testServer.start();
      logger.info(`Test WebSocket server running on port ${port}`);
      logger.info('Press Ctrl+C to stop the server');
    } catch (error) {
      logger.error('Failed to start test server', { error });
      process.exit(1);
    }
  }

  main().catch((error) => {
    logger.error('Unhandled error in test server', { error });
    process.exit(1);
  });
}
