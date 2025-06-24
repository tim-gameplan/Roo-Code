import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { JWTPayload, Session, User } from '../types/auth';

// JWT configuration interface
export interface JWTConfig {
  accessTokenSecret: string;
  refreshTokenSecret: string;
  accessTokenExpiry: string; // e.g., '15m'
  refreshTokenExpiry: string; // e.g., '30d'
  issuer: string;
  audience: string;
}

// Token pair interface
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
}

// JWT verification result
export interface JWTVerificationResult {
  valid: boolean;
  payload?: JWTPayload;
  error?: string;
}

export class JWTService {
  private config: JWTConfig;

  constructor(config: JWTConfig) {
    this.config = config;
  }

  /**
   * Generate access token for authenticated user
   */
  generateAccessToken(user: User, session: Session): string {
    try {
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = this.parseExpiry(this.config.accessTokenExpiry);

      const payload: JWTPayload = {
        user_id: user.id,
        session_id: session.id,
        device_id: session.device_id,
        email: user.email,
        iat: now,
        exp: now + expiresIn,
      };

      const token = jwt.sign(payload, this.config.accessTokenSecret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithm: 'HS256',
      });

      logger.debug('Access token generated', {
        userId: user.id,
        sessionId: session.id,
        expiresAt: new Date((now + expiresIn) * 1000),
      });

      return token;
    } catch (error) {
      logger.error('Failed to generate access token', {
        error: (error as Error).message,
        userId: user.id,
        sessionId: session.id,
      });
      throw new Error('Failed to generate access token');
    }
  }

  /**
   * Generate refresh token for session
   */
  generateRefreshToken(session: Session): string {
    try {
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = this.parseExpiry(this.config.refreshTokenExpiry);

      const payload = {
        session_id: session.id,
        user_id: session.user_id,
        device_id: session.device_id,
        type: 'refresh',
        jti: uuidv4(), // JWT ID for tracking
        iat: now,
        exp: now + expiresIn,
      };

      const token = jwt.sign(payload, this.config.refreshTokenSecret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithm: 'HS256',
      });

      logger.debug('Refresh token generated', {
        sessionId: session.id,
        userId: session.user_id,
        expiresAt: new Date((now + expiresIn) * 1000),
      });

      return token;
    } catch (error) {
      logger.error('Failed to generate refresh token', {
        error: (error as Error).message,
        sessionId: session.id,
        userId: session.user_id,
      });
      throw new Error('Failed to generate refresh token');
    }
  }

  /**
   * Generate both access and refresh tokens
   */
  generateTokenPair(user: User, session: Session): TokenPair {
    try {
      const accessToken = this.generateAccessToken(user, session);
      const refreshToken = this.generateRefreshToken(session);

      const now = Date.now();
      const accessExpiry = this.parseExpiry(this.config.accessTokenExpiry) * 1000;
      const refreshExpiry = this.parseExpiry(this.config.refreshTokenExpiry) * 1000;

      return {
        accessToken,
        refreshToken,
        expiresAt: new Date(now + accessExpiry),
        refreshExpiresAt: new Date(now + refreshExpiry),
      };
    } catch (error) {
      logger.error('Failed to generate token pair', {
        error: (error as Error).message,
        userId: user.id,
        sessionId: session.id,
      });
      throw new Error('Failed to generate token pair');
    }
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): JWTVerificationResult {
    try {
      const payload = jwt.verify(token, this.config.accessTokenSecret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: ['HS256'],
      }) as JWTPayload;

      // Validate required fields
      if (!payload.user_id || !payload.session_id || !payload.device_id || !payload.email) {
        return {
          valid: false,
          error: 'Invalid token payload: missing required fields',
        };
      }

      logger.debug('Access token verified successfully', {
        userId: payload.user_id,
        sessionId: payload.session_id,
        deviceId: payload.device_id,
      });

      return {
        valid: true,
        payload,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;

      logger.warn('Access token verification failed', {
        error: errorMessage,
        token: token.substring(0, 20) + '...', // Log partial token for debugging
      });

      return {
        valid: false,
        error: this.getTokenErrorMessage(error as Error),
      };
    }
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token: string): JWTVerificationResult {
    try {
      const payload = jwt.verify(token, this.config.refreshTokenSecret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: ['HS256'],
      }) as any;

      // Validate required fields for refresh token
      if (
        !payload.session_id ||
        !payload.user_id ||
        !payload.device_id ||
        payload.type !== 'refresh'
      ) {
        return {
          valid: false,
          error: 'Invalid refresh token payload',
        };
      }

      logger.debug('Refresh token verified successfully', {
        sessionId: payload.session_id,
        userId: payload.user_id,
        deviceId: payload.device_id,
      });

      return {
        valid: true,
        payload: {
          user_id: payload.user_id,
          session_id: payload.session_id,
          device_id: payload.device_id,
          email: '', // Not included in refresh token
          iat: payload.iat,
          exp: payload.exp,
        },
      };
    } catch (error) {
      const errorMessage = (error as Error).message;

      logger.warn('Refresh token verification failed', {
        error: errorMessage,
        token: token.substring(0, 20) + '...',
      });

      return {
        valid: false,
        error: this.getTokenErrorMessage(error as Error),
      };
    }
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) {
      return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1] || null;
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token: string): boolean {
    try {
      const decoded = jwt.decode(token) as any;
      if (!decoded || !decoded.exp) {
        return true;
      }

      const now = Math.floor(Date.now() / 1000);
      return decoded.exp < now;
    } catch (error) {
      return true;
    }
  }

  /**
   * Get token expiration date
   */
  getTokenExpiration(token: string): Date | null {
    try {
      const decoded = jwt.decode(token) as any;
      if (!decoded || !decoded.exp) {
        return null;
      }

      return new Date(decoded.exp * 1000);
    } catch (error) {
      return null;
    }
  }

  /**
   * Decode token without verification (for debugging)
   */
  decodeToken(token: string): any {
    try {
      return jwt.decode(token);
    } catch (error) {
      logger.error('Failed to decode token', {
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Parse expiry string to seconds
   */
  private parseExpiry(expiry: string): number {
    const unit = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1));

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 24 * 60 * 60;
      case 'w':
        return value * 7 * 24 * 60 * 60;
      default:
        throw new Error(`Invalid expiry format: ${expiry}`);
    }
  }

  /**
   * Get user-friendly error message from JWT error
   */
  private getTokenErrorMessage(error: Error): string {
    if (error.name === 'TokenExpiredError') {
      return 'Token has expired';
    } else if (error.name === 'JsonWebTokenError') {
      return 'Invalid token';
    } else if (error.name === 'NotBeforeError') {
      return 'Token not active yet';
    } else {
      return 'Token verification failed';
    }
  }
}

// Factory function to create JWT service with environment configuration
export function createJWTService(): JWTService {
  const config: JWTConfig = {
    accessTokenSecret: process.env['JWT_ACCESS_SECRET'] || 'your-access-secret-key',
    refreshTokenSecret: process.env['JWT_REFRESH_SECRET'] || 'your-refresh-secret-key',
    accessTokenExpiry: process.env['JWT_ACCESS_EXPIRY'] || '15m',
    refreshTokenExpiry: process.env['JWT_REFRESH_EXPIRY'] || '30d',
    issuer: process.env['JWT_ISSUER'] || 'roo-code-api',
    audience: process.env['JWT_AUDIENCE'] || 'roo-code-clients',
  };

  // Validate configuration
  if (
    config.accessTokenSecret === 'your-access-secret-key' ||
    config.refreshTokenSecret === 'your-refresh-secret-key'
  ) {
    logger.warn('Using default JWT secrets - this is not secure for production!');
  }

  return new JWTService(config);
}

// Export singleton instance
export const jwtService = createJWTService();
