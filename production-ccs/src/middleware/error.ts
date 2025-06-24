import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

export interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  message?: string;
  details?: any;
  timestamp: string;
  requestId?: string;
  stack?: string;
}

export class ErrorMiddleware {
  /**
   * Global error handler middleware
   * Must be the last middleware in the chain
   */
  static globalErrorHandler = (
    error: any,
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const requestId = (req as any).requestId || 'unknown';
    const timestamp = new Date().toISOString();

    // Log the error
    logger.error('Unhandled error', {
      error: error.message,
      stack: error.stack,
      requestId,
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    // Default error response
    let statusCode = 500;
    let errorResponse: ErrorResponse = {
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      timestamp,
      requestId,
    };

    // Handle specific error types
    if (error instanceof ZodError) {
      // Validation errors
      statusCode = 400;
      errorResponse = {
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        })),
        timestamp,
        requestId,
      };
    } else if (error.name === 'ValidationError') {
      // Custom validation errors
      statusCode = 400;
      errorResponse = {
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        message: error.message,
        details: error.details,
        timestamp,
        requestId,
      };
    } else if (error.name === 'UnauthorizedError' || error.code === 'UNAUTHORIZED') {
      // Authentication errors
      statusCode = 401;
      errorResponse = {
        success: false,
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
        message: error.message || 'Authentication required',
        timestamp,
        requestId,
      };
    } else if (error.name === 'ForbiddenError' || error.code === 'FORBIDDEN') {
      // Authorization errors
      statusCode = 403;
      errorResponse = {
        success: false,
        error: 'Forbidden',
        code: 'FORBIDDEN',
        message: error.message || 'Insufficient permissions',
        timestamp,
        requestId,
      };
    } else if (error.name === 'NotFoundError' || error.code === 'NOT_FOUND') {
      // Resource not found errors
      statusCode = 404;
      errorResponse = {
        success: false,
        error: 'Not found',
        code: 'NOT_FOUND',
        message: error.message || 'Resource not found',
        timestamp,
        requestId,
      };
    } else if (error.name === 'ConflictError' || error.code === 'CONFLICT') {
      // Conflict errors (e.g., duplicate resources)
      statusCode = 409;
      errorResponse = {
        success: false,
        error: 'Conflict',
        code: 'CONFLICT',
        message: error.message || 'Resource conflict',
        timestamp,
        requestId,
      };
    } else if (error.name === 'TooManyRequestsError' || error.code === 'RATE_LIMIT_EXCEEDED') {
      // Rate limiting errors
      statusCode = 429;
      errorResponse = {
        success: false,
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        message: error.message || 'Rate limit exceeded',
        timestamp,
        requestId,
      };
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      // Database/external service connection errors
      statusCode = 503;
      errorResponse = {
        success: false,
        error: 'Service unavailable',
        code: 'SERVICE_UNAVAILABLE',
        message: 'External service temporarily unavailable',
        timestamp,
        requestId,
      };
    } else if (error.code && error.message) {
      // Custom application errors with codes
      statusCode = error.statusCode || 500;
      errorResponse = {
        success: false,
        error: error.name || 'Application error',
        code: error.code,
        message: error.message,
        details: error.details,
        timestamp,
        requestId,
      };
    } else if (error.statusCode || error.status) {
      // HTTP errors with status codes
      statusCode = error.statusCode || error.status;
      errorResponse = {
        success: false,
        error: error.name || 'HTTP error',
        code: error.code || 'HTTP_ERROR',
        message: error.message || 'HTTP error occurred',
        timestamp,
        requestId,
      };
    }

    // Include stack trace in development
    if (process.env['NODE_ENV'] === 'development') {
      errorResponse.stack = error.stack;
    }

    // Send error response
    res.status(statusCode).json(errorResponse);
  };

  /**
   * 404 handler for unknown routes
   */
  static notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
    const requestId = (req as any).requestId || 'unknown';
    const timestamp = new Date().toISOString();

    logger.warn('Route not found', {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId,
    });

    const errorResponse: ErrorResponse = {
      success: false,
      error: 'Not found',
      code: 'ROUTE_NOT_FOUND',
      message: `The requested endpoint ${req.method} ${req.url} does not exist`,
      timestamp,
      requestId,
    };

    res.status(404).json(errorResponse);
  };

  /**
   * Async error wrapper for route handlers
   * Catches async errors and passes them to the global error handler
   */
  static asyncHandler = (fn: Function) => {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  };

  /**
   * Database error handler
   * Converts database-specific errors to application errors
   */
  static handleDatabaseError = (error: any): Error => {
    if (error.code === '23505') {
      // PostgreSQL unique violation
      const customError = new Error('Resource already exists');
      (customError as any).code = 'CONFLICT';
      (customError as any).statusCode = 409;
      return customError;
    }

    if (error.code === '23503') {
      // PostgreSQL foreign key violation
      const customError = new Error('Referenced resource does not exist');
      (customError as any).code = 'INVALID_REFERENCE';
      (customError as any).statusCode = 400;
      return customError;
    }

    if (error.code === '23502') {
      // PostgreSQL not null violation
      const customError = new Error('Required field is missing');
      (customError as any).code = 'VALIDATION_ERROR';
      (customError as any).statusCode = 400;
      return customError;
    }

    if (error.code === 'ECONNREFUSED') {
      // Database connection refused
      const customError = new Error('Database service unavailable');
      (customError as any).code = 'SERVICE_UNAVAILABLE';
      (customError as any).statusCode = 503;
      return customError;
    }

    // Return original error if no specific handling
    return error;
  };

  /**
   * Validation error creator
   */
  static createValidationError = (message: string, details?: any): Error => {
    const error = new Error(message);
    (error as any).name = 'ValidationError';
    (error as any).code = 'VALIDATION_ERROR';
    (error as any).statusCode = 400;
    (error as any).details = details;
    return error;
  };

  /**
   * Authorization error creator
   */
  static createAuthorizationError = (message: string = 'Insufficient permissions'): Error => {
    const error = new Error(message);
    (error as any).name = 'ForbiddenError';
    (error as any).code = 'FORBIDDEN';
    (error as any).statusCode = 403;
    return error;
  };

  /**
   * Not found error creator
   */
  static createNotFoundError = (message: string = 'Resource not found'): Error => {
    const error = new Error(message);
    (error as any).name = 'NotFoundError';
    (error as any).code = 'NOT_FOUND';
    (error as any).statusCode = 404;
    return error;
  };

  /**
   * Conflict error creator
   */
  static createConflictError = (message: string = 'Resource conflict'): Error => {
    const error = new Error(message);
    (error as any).name = 'ConflictError';
    (error as any).code = 'CONFLICT';
    (error as any).statusCode = 409;
    return error;
  };
}
