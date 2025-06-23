import { Request, Response } from 'express';
import { databaseService } from '../services/database';
import { logger } from '../utils/logger';
import { config } from '../config';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'error';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
}

export interface DetailedHealthStatus extends HealthStatus {
  services: {
    database: 'connected' | 'disconnected' | 'error';
    redis?: 'connected' | 'disconnected' | 'error';
    api: 'operational' | 'degraded' | 'error';
  };
  metrics: {
    memory: {
      used: string;
      total: string;
      percentage: number;
    };
    requests: {
      total: number;
      errors: number;
      errorRate: number;
    };
    responseTime: {
      average: number;
      p95: number;
      p99: number;
    };
  };
}

export interface MetricsStatus {
  timestamp: string;
  uptime: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
  cpu: {
    user: number;
    system: number;
  };
  eventLoop: {
    delay: number;
  };
  gc?: {
    count: number;
    duration: number;
  };
}

export class HealthController {
  private startTime: number;
  private requestCount: number = 0;
  private errorCount: number = 0;
  private responseTimes: number[] = [];

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Basic health check endpoint
   * Returns simple status for load balancers and monitoring
   */
  basicHealthCheck = async (_req: Request, res: Response): Promise<void> => {
    try {
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);

      const healthStatus: HealthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime,
        version: '1.0.0',
        environment: config.env,
      };

      // Quick database connectivity check
      try {
        await databaseService.healthCheck();
      } catch (error) {
        logger.warn('Database connectivity issue in health check', error);
        healthStatus.status = 'degraded';
      }

      // Set appropriate status code
      const statusCode = healthStatus.status === 'healthy' ? 200 : 503;

      res.status(statusCode).json(healthStatus);
    } catch (error) {
      logger.error('Health check failed', error);

      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        version: '1.0.0',
        environment: config.env,
        error: 'Health check failed',
      });
    }
  };

  /**
   * Detailed health check endpoint
   * Returns comprehensive system status
   */
  detailedHealthCheck = async (_req: Request, res: Response): Promise<void> => {
    try {
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      const memoryUsage = process.memoryUsage();

      // Check database connectivity
      let databaseStatus: 'connected' | 'disconnected' | 'error' = 'disconnected';
      try {
        await databaseService.healthCheck();
        databaseStatus = 'connected';
      } catch (error) {
        logger.warn('Database connectivity issue in detailed health check', error);
        databaseStatus = 'error';
      }

      // Calculate metrics
      const errorRate = this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0;
      const avgResponseTime =
        this.responseTimes.length > 0
          ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
          : 0;

      // Calculate percentiles
      const sortedTimes = [...this.responseTimes].sort((a, b) => a - b);
      const p95Index = Math.floor(sortedTimes.length * 0.95);
      const p99Index = Math.floor(sortedTimes.length * 0.99);
      const p95 = sortedTimes[p95Index] || 0;
      const p99 = sortedTimes[p99Index] || 0;

      // Determine overall status
      let overallStatus: 'healthy' | 'degraded' | 'error' = 'healthy';
      if (databaseStatus === 'error' || errorRate > 10) {
        overallStatus = 'error';
      } else if (databaseStatus !== 'connected' || errorRate > 5 || avgResponseTime > 1000) {
        overallStatus = 'degraded';
      }

      const detailedStatus: DetailedHealthStatus = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime,
        version: '1.0.0',
        environment: config.env,
        services: {
          database: databaseStatus,
          api:
            overallStatus === 'error'
              ? 'error'
              : overallStatus === 'degraded'
                ? 'degraded'
                : 'operational',
        },
        metrics: {
          memory: {
            used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
            total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
            percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
          },
          requests: {
            total: this.requestCount,
            errors: this.errorCount,
            errorRate: Math.round(errorRate * 100) / 100,
          },
          responseTime: {
            average: Math.round(avgResponseTime * 100) / 100,
            p95: Math.round(p95 * 100) / 100,
            p99: Math.round(p99 * 100) / 100,
          },
        },
      };

      // Set appropriate status code
      const statusCode =
        overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

      res.status(statusCode).json(detailedStatus);
    } catch (error) {
      logger.error('Detailed health check failed', error);

      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        version: '1.0.0',
        environment: config.env,
        error: 'Detailed health check failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * Metrics endpoint for monitoring systems
   * Returns detailed performance metrics
   */
  metricsCheck = async (_req: Request, res: Response): Promise<void> => {
    try {
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      const metrics: MetricsStatus = {
        timestamp: new Date().toISOString(),
        uptime,
        memory: {
          rss: memoryUsage.rss,
          heapTotal: memoryUsage.heapTotal,
          heapUsed: memoryUsage.heapUsed,
          external: memoryUsage.external,
          arrayBuffers: memoryUsage.arrayBuffers,
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
        eventLoop: {
          delay: 0, // Would need additional monitoring for accurate event loop delay
        },
      };

      res.status(200).json(metrics);
    } catch (error) {
      logger.error('Metrics check failed', error);

      res.status(503).json({
        error: 'Metrics check failed',
        timestamp: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * Record request metrics
   * Called by middleware to track request statistics
   */
  recordRequest = (responseTime: number, isError: boolean = false): void => {
    this.requestCount++;
    if (isError) {
      this.errorCount++;
    }

    // Store response time (keep only last 1000 for memory efficiency)
    this.responseTimes.push(responseTime);
    if (this.responseTimes.length > 1000) {
      this.responseTimes.shift();
    }
  };

  /**
   * Get current statistics
   */
  getStats = (): {
    requests: number;
    errors: number;
    errorRate: number;
    avgResponseTime: number;
  } => {
    const errorRate = this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0;
    const avgResponseTime =
      this.responseTimes.length > 0
        ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
        : 0;

    return {
      requests: this.requestCount,
      errors: this.errorCount,
      errorRate: Math.round(errorRate * 100) / 100,
      avgResponseTime: Math.round(avgResponseTime * 100) / 100,
    };
  };

  /**
   * Reset statistics (useful for testing)
   */
  resetStats = (): void => {
    this.requestCount = 0;
    this.errorCount = 0;
    this.responseTimes = [];
  };
}
