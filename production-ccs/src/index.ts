import 'module-alias/register';
import { createServer } from 'http';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { expressApp } from '@/app';
import { RCCSWebSocketServer } from '@/services/rccs-websocket-server';
import { RCCSConfig } from '@/types/rccs';
// import { ExtensionBridgeService } from '@/services/extension-bridge';

async function startServer(): Promise<void> {
  try {
    // Initialize the Express application
    await expressApp.initialize();

    // Create HTTP server with the Express app
    const server = createServer(expressApp.getApp());

    // Start HTTP server
    server.listen(config.server.port, config.server.host, () => {
      logger.info(`HTTP Server started successfully`, {
        host: config.server.host,
        port: config.server.port,
        env: config.env,
        pid: process.pid,
      });
    });

    // Initialize and start WebSocket server on port 3001
    const wsConfig: RCCSConfig = {
      port: 3001, // WebSocket on separate port for now
      maxConnections: 1000,
      sessionTimeout: 300000, // 5 minutes
      heartbeatInterval: 30000, // 30 seconds
      messageTimeout: 30000,
      retryAttempts: 3,
      redis: {
        host: config.redis?.host || 'localhost',
        port: config.redis?.port || 6379,
        db: config.redis?.database || 0,
      },
      database: {
        host: config.database.host,
        port: config.database.port,
        database: config.database.database,
        username: config.database.username,
        password: config.database.password,
      },
    };

    const wsServer = new RCCSWebSocketServer(wsConfig);
    await wsServer.start();

    logger.info(`WebSocket Server started successfully`, {
      port: wsConfig.port,
      maxConnections: wsConfig.maxConnections,
    });

    // TODO: Initialize Extension Bridge for AI communication
    // const bridgeService = new ExtensionBridgeService(wsServer, {
    //   socketPath: config.extensionSocket.path,
    //   timeout: config.extensionSocket.timeout,
    //   retryAttempts: config.extensionSocket.retryAttempts,
    //   retryDelay: config.extensionSocket.retryDelay,
    // });

    // await bridgeService.start();

    logger.info(`Extension Bridge (placeholder) initialized`);

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      // TODO: Close Extension Bridge
      // await bridgeService.stop();
      logger.info('Extension Bridge (placeholder) closed');

      // Close WebSocket server
      await wsServer.stop();
      logger.info('WebSocket server closed');

      // Close HTTP server
      server.close(() => {
        logger.info('HTTP server closed');
      });

      // Shutdown Express app
      await expressApp.shutdown();

      logger.info('Graceful shutdown completed');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error });
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection', { reason, promise });
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Start the application
startServer().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
