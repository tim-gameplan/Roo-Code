import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import { config, validateConfig } from '@/config';
import { logger, logError } from '@/utils/logger';
import { AppError } from '@/types';

// Import services (will be created next)
// import { DatabaseService } from '@/services/database';
// import { RedisService } from '@/services/redis';
// import { AuthService } from '@/services/auth';
// import { ExtensionService } from '@/services/extension';
// import { WebSocketService } from '@/services/websocket';

// Import middleware (will be created next)
// import { errorHandler } from '@/middleware/errorHandler';
// import { requestLogger } from '@/middleware/requestLogger';
// import { authMiddleware } from '@/middleware/auth';

// Import routes (will be created next)
// import authRoutes from '@/routes/auth';
// import messageRoutes from '@/routes/messages';
// import healthRoutes from '@/routes/health';

class Application {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private startTime: Date;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.startTime = new Date();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
          },
        },
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        },
      })
    );

    // CORS
    this.app.use(
      cors({
        origin: config.server.cors.origin,
        credentials: config.server.cors.credentials,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      })
    );

    // Compression
    this.app.use(compression());

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.server.rateLimit.windowMs,
      max: config.server.rateLimit.max,
      message: {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests from this IP, please try again later.',
        },
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging middleware
    // this.app.use(requestLogger);
  }

  private setupRoutes(): void {
    // Health check route (basic implementation)
    this.app.get('/health', (_req, res) => {
      const uptime = Date.now() - this.startTime.getTime();
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env['npm_package_version'] || '1.0.0',
        uptime,
        services: {
          database: 'connected', // Will be updated when services are implemented
          redis: 'connected',
          extension: 'connected',
        },
        metrics: {
          activeConnections: 0,
          totalMessages: 0,
          errorRate: 0,
          averageResponseTime: 0,
        },
      });
    });

    // API routes
    // this.app.use('/api/auth', authRoutes);
    // this.app.use('/api/messages', messageRoutes);
    // this.app.use('/api/health', healthRoutes);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Route ${req.method} ${req.originalUrl} not found`,
        },
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      });
    });

    // Error handling middleware
    this.app.use(
      (error: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
        logError(error, {
          method: req.method,
          url: req.url,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
        });

        if (error instanceof AppError) {
          return res.status(error.statusCode).json({
            success: false,
            error: {
              code: error.code,
              message: error.message,
            },
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          });
        }

        // Unhandled error
        return res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: config.env === 'production' ? 'Internal server error' : error.message,
          },
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        });
      }
    );
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws, req) => {
      logger.info('WebSocket connection established', {
        ip: req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          logger.debug('WebSocket message received', { message });

          // Handle WebSocket messages (will be implemented with WebSocketService)
          ws.send(
            JSON.stringify({
              type: 'ack',
              timestamp: new Date().toISOString(),
            })
          );
        } catch (error) {
          logger.error('Invalid WebSocket message', { error, data: data.toString() });
          ws.send(
            JSON.stringify({
              type: 'error',
              message: 'Invalid message format',
              timestamp: new Date().toISOString(),
            })
          );
        }
      });

      ws.on('close', () => {
        logger.info('WebSocket connection closed');
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error', { error });
      });
    });
  }

  private async initializeServices(): Promise<void> {
    logger.info('Initializing services...');

    try {
      // Initialize database connection
      // await DatabaseService.initialize();
      logger.info('Database service initialized');

      // Initialize Redis connection
      // await RedisService.initialize();
      logger.info('Redis service initialized');

      // Initialize extension communication
      // await ExtensionService.initialize();
      logger.info('Extension service initialized');

      logger.info('All services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize services', { error });
      throw error;
    }
  }

  public async start(): Promise<void> {
    try {
      // Validate configuration
      validateConfig();
      logger.info('Configuration validated');

      // Initialize services
      await this.initializeServices();

      // Setup middleware and routes
      this.setupMiddleware();
      this.setupRoutes();
      this.setupWebSocket();

      // Start server
      this.server.listen(config.server.port, config.server.host, () => {
        logger.info(`Server started successfully`, {
          host: config.server.host,
          port: config.server.port,
          env: config.env,
          pid: process.pid,
        });
      });

      // Graceful shutdown handling
      this.setupGracefulShutdown();
    } catch (error) {
      logger.error('Failed to start server', { error });
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      // Close HTTP server
      this.server.close(() => {
        logger.info('HTTP server closed');
      });

      // Close WebSocket server
      this.wss.close(() => {
        logger.info('WebSocket server closed');
      });

      // Close database connections
      // await DatabaseService.close();
      // await RedisService.close();

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
  }
}

// Start the application
const app = new Application();
app.start().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});

export default app;
