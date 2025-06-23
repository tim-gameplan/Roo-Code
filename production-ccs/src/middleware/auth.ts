import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { config } from '../config';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    display_name?: string;
  };
}

export class AuthMiddleware {
  constructor() {}

  /**
   * JWT Authentication middleware
   * Validates JWT token and attaches user to request
   */
  authenticate = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      if (!token) {
        res.status(401).json({
          success: false,
          error: 'Invalid token format',
          code: 'INVALID_TOKEN',
        });
        return;
      }

      // Verify JWT token
      const decoded = jwt.verify(token, config.server.jwt.secret) as any;

      // For now, we'll use a simplified approach until the full auth service is integrated
      // This will be enhanced when we implement the full authentication routes
      if (!decoded.user_id || !decoded.email) {
        res.status(401).json({
          success: false,
          error: 'Invalid token payload',
          code: 'INVALID_TOKEN',
        });
        return;
      }

      // Attach user to request
      req.user = {
        id: decoded.user_id,
        email: decoded.email,
        display_name: decoded.display_name,
      };

      next();
    } catch (error) {
      logger.error('Authentication error:', error);

      if (error instanceof jwt.JsonWebTokenError) {
        res.status(401).json({
          success: false,
          error: 'Invalid token',
          code: 'INVALID_TOKEN',
        });
        return;
      }

      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({
          success: false,
          error: 'Token expired',
          code: 'TOKEN_EXPIRED',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Authentication failed',
        code: 'AUTH_ERROR',
      });
    }
  };

  /**
   * Optional authentication middleware
   * Attaches user if token is valid, but doesn't require authentication
   */
  optionalAuth = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        next();
        return;
      }

      const token = authHeader.substring(7);

      if (!token) {
        next();
        return;
      }

      const decoded = jwt.verify(token, config.server.jwt.secret) as any;

      if (decoded.user_id && decoded.email) {
        req.user = {
          id: decoded.user_id,
          email: decoded.email,
          display_name: decoded.display_name,
        };
      }

      next();
    } catch (error) {
      // Silently fail for optional auth
      next();
    }
  };
}
