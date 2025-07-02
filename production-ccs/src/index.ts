import { createServer } from 'http';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { expressApp } from '@/app';

async function startServer(): Promise<void> {
  try {
    // Initialize the Express application
    await expressApp.initialize();

    // Create HTTP server with the Express app
    const server = createServer(expressApp.getApp());

    // Start server
    server.listen(config.server.port, config.server.host, () => {
      logger.info(`Server started successfully`, {
        host: config.server.host,
        port: config.server.port,
        env: config.env,
        pid: process.pid,
      });
    });

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

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
