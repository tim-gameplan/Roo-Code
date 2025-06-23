import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config, validateConfig } from './config';
import { logger } from './utils/logger';
// import { AuthMiddleware } from './middleware/auth';
import { RateLimitMiddleware } from './middleware/rate-limit';
// import { ErrorMiddleware } from './middleware/error';
import { databaseService } from './services/database';

// Import routes
import authRoutes from './routes/auth';
import { healthRoutes } from './routes/health';
import { initializeUsersRoutes } from './routes/users';

export class ExpressApp {
  public app: Application;
  // private authMiddleware: AuthMiddleware;

  constructor() {
    this.app = express();

    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  /**
   * Initialize Express middleware
   */
  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'ws:', 'wss:'],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
          },
        },
        crossOriginEmbedderPolicy: false,
      })
    );

    // CORS configuration
    this.app.use(
      cors({
        origin: config.server.cors.origin,
        credentials: config.server.cors.credentials,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: [
          'Origin',
          'X-Requested-With',
          'Content-Type',
          'Accept',
          'Authorization',
          'X-Device-ID',
          'X-Request-ID',
          'X-Client-Version',
        ],
        exposedHeaders: [
          'X-Total-Count',
          'X-Page-Count',
          'X-Rate-Limit-Remaining',
          'X-Rate-Limit-Reset',
        ],
      })
    );

    // Compression middleware
    this.app.use(
      compression({
        filter: (req: Request, res: Response) => {
          if (req.headers['x-no-compression']) {
            return false;
          }
          return compression.filter(req, res);
        },
        threshold: 1024, // Only compress responses larger than 1KB
      })
    );

    // Body parsing middleware
    this.app.use(
      express.json({
        limit: '10mb',
        verify: (req: any, _res: Response, buf: Buffer) => {
          req.rawBody = buf;
        },
      })
    );
    this.app.use(
      express.urlencoded({
        extended: true,
        limit: '10mb',
      })
    );

    // Request logging middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      const requestId =
        req.headers['x-request-id'] ||
        `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Add request ID to request object
      (req as any).requestId = requestId;

      // Add request ID to response headers
      res.setHeader('X-Request-ID', requestId);

      // Log request
      logger.info('Incoming request', {
        requestId,
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        contentLength: req.get('Content-Length'),
      });

      // Log response when finished
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.info('Request completed', {
          requestId,
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          contentLength: res.get('Content-Length'),
        });
      });

      next();
    });

    // General rate limiting
    this.app.use(RateLimitMiddleware.general);

    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', 1);
  }

  /**
   * Initialize application routes
   */
  private initializeRoutes(): void {
    // Health check routes (no authentication required)
    this.app.use('/health', healthRoutes);

    // API version prefix
    const apiV1 = '/api/v1';

    // Authentication routes (with specific rate limiting)
    this.app.use(`${apiV1}/auth`, authRoutes);

    // Protected API routes
    // User management routes (TASK-007.2.1.3)
    this.app.use(`${apiV1}/users`, initializeUsersRoutes(databaseService));

    // Conversation management routes (TASK-007.2.1.4)
    // this.app.use(`${apiV1}/conversations`, conversationRoutes);

    // File sync routes (TASK-007.2.1.4)
    // this.app.use(`${apiV1}/files`, fileRoutes);

    // WebSocket upgrade handling (for real-time features)
    this.app.get('/ws', (_req: Request, res: Response) => {
      res.status(426).json({
        success: false,
        error: 'WebSocket upgrade required',
        code: 'WEBSOCKET_UPGRADE_REQUIRED',
        message: 'This endpoint requires WebSocket connection',
      });
    });

    // API documentation route
    this.app.get('/api', (_req: Request, res: Response) => {
      res.json({
        name: 'Roo Remote UI Central Communication Server',
        version: '1.0.0',
        description: 'Production API for cross-device communication and synchronization',
        endpoints: {
          health: {
            basic: 'GET /health',
            detailed: 'GET /health/detailed',
            metrics: 'GET /health/metrics',
          },
          auth: {
            base: `${apiV1}/auth`,
            endpoints: [
              'POST /auth/register',
              'POST /auth/login',
              'POST /auth/refresh',
              'POST /auth/logout',
              'GET /auth/profile',
              'PUT /auth/profile',
              'POST /auth/change-password',
            ],
          },
          // Additional endpoints will be documented as they're implemented
        },
        documentation: 'https://github.com/tim-gameplan/Roo-Code/docs',
      });
    });

    // Catch-all route for undefined endpoints
    this.app.all('*', (req: Request, res: Response) => {
      logger.warn('Route not found', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.status(404).json({
        success: false,
        error: 'Route not found',
        code: 'ROUTE_NOT_FOUND',
        message: `The requested endpoint ${req.method} ${req.url} does not exist`,
        availableEndpoints: [
          'GET /health',
          'GET /health/detailed',
          'GET /health/metrics',
          'GET /api',
          `${apiV1}/auth/*`,
        ],
      });
    });
  }

  /**
   * Initialize error handling middleware
   */
  private initializeErrorHandling(): void {
    // Global error handler (must be last middleware)
    this.app.use((error: any, req: Request, res: Response, _next: NextFunction) => {
      const requestId = (req as any).requestId || 'unknown';
      const timestamp = new Date().toISOString();

      logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        requestId,
        method: req.method,
        url: req.url,
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        timestamp,
        requestId,
      });
    });
  }

  /**
   * Initialize the application
   */
  public async initialize(): Promise<void> {
    try {
      // Validate configuration
      validateConfig();
      logger.info('Configuration validated successfully');

      // Initialize database connection
      await databaseService.connect();
      logger.info('Database connection established');

      // Additional initialization steps can be added here
      // - Redis connection
      // - WebSocket server setup
      // - Background job processors

      logger.info('Express application initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Express application', error);
      throw error;
    }
  }

  /**
   * Get the Express application instance
   */
  public getApp(): Application {
    return this.app;
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    try {
      logger.info('Starting graceful shutdown...');

      // Close database connections
      await databaseService.disconnect();
      logger.info('Database connections closed');

      // Additional cleanup can be added here
      // - Close Redis connections
      // - Stop background jobs
      // - Close WebSocket connections

      logger.info('Graceful shutdown completed');
    } catch (error) {
      logger.error('Error during graceful shutdown', error);
      throw error;
    }
  }
}

// Export singleton instance
export const expressApp = new ExpressApp();
export default expressApp;
