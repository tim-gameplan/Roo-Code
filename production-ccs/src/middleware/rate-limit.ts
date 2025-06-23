import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export class RateLimitMiddleware {
  /**
   * Create a rate limiter with custom configuration
   */
  static create(config: RateLimitConfig) {
    return rateLimit({
      windowMs: config.windowMs,
      max: config.max,
      message: {
        success: false,
        error: config.message || 'Too many requests, please try again later',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(config.windowMs / 1000),
      },
      standardHeaders: config.standardHeaders ?? true,
      legacyHeaders: config.legacyHeaders ?? false,
      skipSuccessfulRequests: config.skipSuccessfulRequests ?? false,
      skipFailedRequests: config.skipFailedRequests ?? false,
      handler: (req: Request, res: Response) => {
        logger.warn('Rate limit exceeded', {
          ip: req.ip,
          path: req.path,
          method: req.method,
          userAgent: req.get('User-Agent'),
        });

        res.status(429).json({
          success: false,
          error: config.message || 'Too many requests, please try again later',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil(config.windowMs / 1000),
        });
      },
    });
  }

  /**
   * Strict rate limiter for authentication endpoints
   */
  static authStrict = RateLimitMiddleware.create({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: 'Too many authentication attempts, please try again in 15 minutes',
  });

  /**
   * Moderate rate limiter for authentication endpoints
   */
  static authModerate = RateLimitMiddleware.create({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per window
    message: 'Too many authentication requests, please try again later',
  });

  /**
   * General API rate limiter
   */
  static general = RateLimitMiddleware.create({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: 'Too many API requests, please try again later',
  });

  /**
   * Lenient rate limiter for read operations
   */
  static read = RateLimitMiddleware.create({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // 200 requests per window
    message: 'Too many read requests, please try again later',
    skipSuccessfulRequests: true,
  });

  /**
   * Strict rate limiter for write operations
   */
  static write = RateLimitMiddleware.create({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // 50 requests per window
    message: 'Too many write requests, please try again later',
  });

  /**
   * Very strict rate limiter for sensitive operations
   */
  static sensitive = RateLimitMiddleware.create({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 attempts per hour
    message: 'Too many sensitive operation attempts, please try again in 1 hour',
  });

  /**
   * File upload rate limiter
   */
  static upload = RateLimitMiddleware.create({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 uploads per window
    message: 'Too many file uploads, please try again later',
  });

  /**
   * Search rate limiter
   */
  static search = RateLimitMiddleware.create({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 searches per minute
    message: 'Too many search requests, please try again later',
  });

  /**
   * Real-time operations rate limiter
   */
  static realtime = RateLimitMiddleware.create({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute
    message: 'Too many real-time requests, please slow down',
  });
}

/**
 * Custom rate limiter that can be configured per user/IP
 */
export class CustomRateLimiter {
  private limits: Map<string, { count: number; resetTime: number }> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;

    // Clean up expired entries every minute
    setInterval(() => {
      this.cleanup();
    }, 60 * 1000);
  }

  middleware = (req: Request, res: Response, next: NextFunction): void => {
    const key = this.getKey(req);
    const now = Date.now();
    const limit = this.limits.get(key);

    if (!limit || now > limit.resetTime) {
      // Reset or create new limit
      this.limits.set(key, {
        count: 1,
        resetTime: now + this.config.windowMs,
      });
      next();
      return;
    }

    if (limit.count >= this.config.max) {
      // Rate limit exceeded
      logger.warn('Custom rate limit exceeded', {
        key,
        count: limit.count,
        max: this.config.max,
        path: req.path,
        method: req.method,
      });

      res.status(429).json({
        success: false,
        error: this.config.message || 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((limit.resetTime - now) / 1000),
      });
      return;
    }

    // Increment counter
    limit.count++;
    next();
  };

  private getKey(req: Request): string {
    // Use user ID if authenticated, otherwise use IP
    const user = (req as any).user;
    return user?.id || req.ip || 'unknown';
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, limit] of this.limits.entries()) {
      if (now > limit.resetTime) {
        this.limits.delete(key);
      }
    }
  }

  // Get current usage for a key
  getUsage(req: Request): { count: number; max: number; resetTime: number } | null {
    const key = this.getKey(req);
    const limit = this.limits.get(key);

    if (!limit) {
      return null;
    }

    return {
      count: limit.count,
      max: this.config.max,
      resetTime: limit.resetTime,
    };
  }
}

/**
 * Rate limiter specifically for API endpoints with different limits per endpoint type
 */
export class APIRateLimiter {
  private static instance: APIRateLimiter;
  private limiters: Map<string, CustomRateLimiter> = new Map();

  private constructor() {
    // Initialize different rate limiters for different endpoint types
    this.limiters.set(
      'auth:login',
      new CustomRateLimiter({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5,
        message: 'Too many login attempts',
      })
    );

    this.limiters.set(
      'auth:register',
      new CustomRateLimiter({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 3,
        message: 'Too many registration attempts',
      })
    );

    this.limiters.set(
      'auth:refresh',
      new CustomRateLimiter({
        windowMs: 5 * 60 * 1000, // 5 minutes
        max: 10,
        message: 'Too many token refresh attempts',
      })
    );

    this.limiters.set(
      'conversation:create',
      new CustomRateLimiter({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 20,
        message: 'Too many conversation creation attempts',
      })
    );

    this.limiters.set(
      'message:send',
      new CustomRateLimiter({
        windowMs: 1 * 60 * 1000, // 1 minute
        max: 30,
        message: 'Too many messages sent',
      })
    );

    this.limiters.set(
      'file:upload',
      new CustomRateLimiter({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 10,
        message: 'Too many file uploads',
      })
    );
  }

  static getInstance(): APIRateLimiter {
    if (!APIRateLimiter.instance) {
      APIRateLimiter.instance = new APIRateLimiter();
    }
    return APIRateLimiter.instance;
  }

  getLimiter(type: string): CustomRateLimiter | undefined {
    return this.limiters.get(type);
  }

  // Middleware factory for specific endpoint types
  static forEndpoint(type: string) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const limiter = APIRateLimiter.getInstance().getLimiter(type);
      if (limiter) {
        limiter.middleware(req, res, next);
      } else {
        next();
      }
    };
  }
}
