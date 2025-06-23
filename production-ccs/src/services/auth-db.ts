import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { User, CreateUserRequest, Session, Device, LoginRequest } from '../types/auth';

// Custom error class for authentication errors
export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// Device info interface for session creation
export interface DeviceInfo {
  deviceId: string;
  deviceType: Device['device_type'];
  deviceName?: string;
  platform?: string;
  capabilities?: Record<string, any>;
}

export class AuthDatabaseService {
  constructor(private db: Pool) {}

  /**
   * Create a new user with hashed password
   */
  async createUser(userData: CreateUserRequest): Promise<User> {
    try {
      // Check if user already exists
      const existingUser = await this.getUserByEmail(userData.email);
      if (existingUser) {
        throw new AuthError('USER_ALREADY_EXISTS', 'User with this email already exists');
      }

      // Hash password with bcrypt (12 rounds for security)
      const hashedPassword = await bcrypt.hash(userData.password, 12);
      const userId = uuidv4();
      const now = new Date();

      const result = await this.db.query(
        `INSERT INTO users (
          id, email, password_hash, display_name, preferences, 
          security_settings, status, email_verified, two_factor_enabled,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
        RETURNING id, email, password_hash, display_name, preferences, security_settings, 
                  status, email_verified, two_factor_enabled, created_at, updated_at, last_login`,
        [
          userId,
          userData.email.toLowerCase().trim(),
          hashedPassword,
          userData.display_name?.trim() || null,
          userData.preferences || {},
          {},
          'active',
          false,
          false,
          now,
          now,
        ]
      );

      logger.info('User created successfully', {
        userId,
        email: userData.email,
        hasDisplayName: !!userData.display_name,
      });

      return this.mapUserFromDb(result.rows[0]);
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }

      logger.error('Failed to create user', {
        error: (error as Error).message,
        email: userData.email,
      });

      if ((error as any).code === '23505') {
        // PostgreSQL unique violation
        throw new AuthError('USER_ALREADY_EXISTS', 'User with this email already exists');
      }

      throw new AuthError('DATABASE_ERROR', 'Failed to create user');
    }
  }

  /**
   * Validate user credentials and return user if valid
   */
  async validateUser(email: string, password: string): Promise<User | null> {
    try {
      const result = await this.db.query('SELECT * FROM users WHERE email = $1 AND status = $2', [
        email.toLowerCase().trim(),
        'active',
      ]);

      if (result.rows.length === 0) {
        logger.warn('Login attempt for non-existent user', { email });
        return null;
      }

      const user = result.rows[0];
      const isValid = await bcrypt.compare(password, user.password_hash);

      if (!isValid) {
        logger.warn('Invalid password attempt', {
          userId: user.id,
          email: user.email,
        });
        return null;
      }

      // Update last login timestamp
      await this.updateLastLogin(user.id);

      logger.info('User validated successfully', {
        userId: user.id,
        email: user.email,
      });

      return this.mapUserFromDb(user);
    } catch (error) {
      logger.error('Failed to validate user', {
        error: (error as Error).message,
        email,
      });
      throw new AuthError('DATABASE_ERROR', 'Failed to validate user');
    }
  }

  /**
   * Create a new session for authenticated user
   */
  async createSession(userId: string, deviceInfo: DeviceInfo): Promise<Session> {
    try {
      const sessionId = uuidv4();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes
      const refreshExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

      // Register or update device
      await this.registerDevice(userId, deviceInfo);

      // Create session record
      await this.db.query(
        `INSERT INTO sessions (
          id, user_id, device_id, session_token, refresh_token, expires_at, refresh_expires_at,
          created_at, last_activity, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          sessionId,
          userId,
          deviceInfo.deviceId,
          sessionId, // Using sessionId as session_token for now
          uuidv4(), // Generate refresh token
          expiresAt,
          refreshExpiresAt,
          now,
          now,
          true,
        ]
      );

      logger.info('Session created successfully', {
        sessionId,
        userId,
        deviceId: deviceInfo.deviceId,
      });

      return {
        id: sessionId,
        user_id: userId,
        device_id: deviceInfo.deviceId,
        session_token: sessionId,
        refresh_token: uuidv4(),
        expires_at: expiresAt,
        refresh_expires_at: refreshExpiresAt,
        created_at: now,
        last_activity: now,
        is_active: true,
      };
    } catch (error) {
      logger.error('Failed to create session', {
        error: (error as Error).message,
        userId,
        deviceId: deviceInfo.deviceId,
      });
      throw new AuthError('DATABASE_ERROR', 'Failed to create session');
    }
  }

  /**
   * Validate and refresh a session
   */
  async refreshSession(sessionId: string): Promise<Session | null> {
    try {
      const result = await this.db.query(
        `SELECT s.*, u.status as user_status 
         FROM sessions s 
         JOIN users u ON s.user_id = u.id 
         WHERE s.id = $1 AND s.refresh_expires_at > NOW() AND u.status = 'active' AND s.is_active = true`,
        [sessionId]
      );

      if (result.rows.length === 0) {
        logger.warn('Session refresh attempt for invalid session', { sessionId });
        return null;
      }

      const session = result.rows[0];
      const now = new Date();
      const newExpiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes

      // Update session expiration and last activity
      await this.db.query('UPDATE sessions SET expires_at = $1, last_activity = $2 WHERE id = $3', [
        newExpiresAt,
        now,
        sessionId,
      ]);

      logger.info('Session refreshed successfully', {
        sessionId,
        userId: session.user_id,
      });

      return {
        id: session.id,
        user_id: session.user_id,
        device_id: session.device_id,
        session_token: session.session_token,
        refresh_token: session.refresh_token,
        expires_at: newExpiresAt,
        refresh_expires_at: session.refresh_expires_at,
        created_at: session.created_at,
        last_activity: now,
        is_active: session.is_active,
      };
    } catch (error) {
      logger.error('Failed to refresh session', {
        error: (error as Error).message,
        sessionId,
      });
      throw new AuthError('DATABASE_ERROR', 'Failed to refresh session');
    }
  }

  /**
   * Validate an active session
   */
  async validateSession(sessionId: string): Promise<Session | null> {
    try {
      const result = await this.db.query(
        `SELECT s.*, u.status as user_status 
         FROM sessions s 
         JOIN users u ON s.user_id = u.id 
         WHERE s.id = $1 AND s.expires_at > NOW() AND u.status = 'active' AND s.is_active = true`,
        [sessionId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const session = result.rows[0];

      // Update last activity
      await this.db.query('UPDATE sessions SET last_activity = $1 WHERE id = $2', [
        new Date(),
        sessionId,
      ]);

      return {
        id: session.id,
        user_id: session.user_id,
        device_id: session.device_id,
        session_token: session.session_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        refresh_expires_at: session.refresh_expires_at,
        created_at: session.created_at,
        last_activity: new Date(),
        is_active: session.is_active,
      };
    } catch (error) {
      logger.error('Failed to validate session', {
        error: (error as Error).message,
        sessionId,
      });
      throw new AuthError('DATABASE_ERROR', 'Failed to validate session');
    }
  }

  /**
   * Terminate a session (logout)
   */
  async terminateSession(sessionId: string): Promise<void> {
    try {
      const result = await this.db.query(
        'UPDATE sessions SET is_active = false, revoked_at = $1 WHERE id = $2',
        [new Date(), sessionId]
      );

      if ((result.rowCount || 0) > 0) {
        logger.info('Session terminated successfully', { sessionId });
      } else {
        logger.warn('Attempted to terminate non-existent session', { sessionId });
      }
    } catch (error) {
      logger.error('Failed to terminate session', {
        error: (error as Error).message,
        sessionId,
      });
      throw new AuthError('DATABASE_ERROR', 'Failed to terminate session');
    }
  }

  /**
   * Terminate all sessions for a user
   */
  async terminateAllUserSessions(userId: string): Promise<void> {
    try {
      const result = await this.db.query(
        'UPDATE sessions SET is_active = false, revoked_at = $1 WHERE user_id = $2 AND is_active = true',
        [new Date(), userId]
      );

      logger.info('All user sessions terminated', {
        userId,
        sessionCount: result.rowCount || 0,
      });
    } catch (error) {
      logger.error('Failed to terminate all user sessions', {
        error: (error as Error).message,
        userId,
      });
      throw new AuthError('DATABASE_ERROR', 'Failed to terminate sessions');
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    try {
      const result = await this.db.query(
        `SELECT id, email, password_hash, display_name, preferences, security_settings, 
                status, email_verified, two_factor_enabled, created_at, updated_at, last_login
         FROM users WHERE id = $1`,
        [userId]
      );

      return result.rows.length > 0 ? this.mapUserFromDb(result.rows[0]) : null;
    } catch (error) {
      logger.error('Failed to get user by ID', {
        error: (error as Error).message,
        userId,
      });
      throw new AuthError('DATABASE_ERROR', 'Failed to get user');
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const result = await this.db.query(
        `SELECT id, email, password_hash, display_name, preferences, security_settings, 
                status, email_verified, two_factor_enabled, created_at, updated_at, last_login
         FROM users WHERE email = $1`,
        [email.toLowerCase().trim()]
      );

      return result.rows.length > 0 ? this.mapUserFromDb(result.rows[0]) : null;
    } catch (error) {
      logger.error('Failed to get user by email', {
        error: (error as Error).message,
        email,
      });
      throw new AuthError('DATABASE_ERROR', 'Failed to get user');
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(
    userId: string,
    updates: Partial<Pick<User, 'display_name' | 'preferences'>>
  ): Promise<User> {
    try {
      const setClause = [];
      const values = [];
      let paramIndex = 1;

      if (updates.display_name !== undefined) {
        setClause.push(`display_name = $${paramIndex++}`);
        values.push(updates.display_name?.trim() || null);
      }

      if (updates.preferences !== undefined) {
        setClause.push(`preferences = $${paramIndex++}`);
        values.push(updates.preferences);
      }

      if (setClause.length === 0) {
        throw new AuthError('INVALID_REQUEST', 'No valid updates provided');
      }

      setClause.push(`updated_at = $${paramIndex++}`);
      values.push(new Date());
      values.push(userId);

      const result = await this.db.query(
        `UPDATE users SET ${setClause.join(', ')} 
         WHERE id = $${paramIndex} 
         RETURNING id, email, password_hash, display_name, preferences, security_settings, 
                   status, email_verified, two_factor_enabled, created_at, updated_at, last_login`,
        values
      );

      if (result.rows.length === 0) {
        throw new AuthError('USER_NOT_FOUND', 'User not found');
      }

      logger.info('User profile updated successfully', {
        userId,
        updates: Object.keys(updates),
      });

      return this.mapUserFromDb(result.rows[0]);
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }

      logger.error('Failed to update user profile', {
        error: (error as Error).message,
        userId,
      });
      throw new AuthError('DATABASE_ERROR', 'Failed to update user profile');
    }
  }

  /**
   * Register or update device information
   */
  private async registerDevice(userId: string, deviceInfo: DeviceInfo): Promise<void> {
    try {
      const now = new Date();

      await this.db.query(
        `INSERT INTO devices (id, user_id, device_type, device_name, platform, capabilities, 
                             created_at, last_seen, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           device_type = EXCLUDED.device_type,
           device_name = EXCLUDED.device_name,
           platform = EXCLUDED.platform,
           capabilities = EXCLUDED.capabilities,
           last_seen = EXCLUDED.last_seen`,
        [
          deviceInfo.deviceId,
          userId,
          deviceInfo.deviceType,
          deviceInfo.deviceName || null,
          deviceInfo.platform || null,
          deviceInfo.capabilities || {},
          now,
          now,
          'active',
        ]
      );

      logger.debug('Device registered/updated', {
        deviceId: deviceInfo.deviceId,
        userId,
        deviceType: deviceInfo.deviceType,
      });
    } catch (error) {
      logger.error('Failed to register device', {
        error: (error as Error).message,
        deviceId: deviceInfo.deviceId,
        userId,
      });
      // Don't throw here - device registration failure shouldn't block auth
    }
  }

  /**
   * Update user's last login timestamp
   */
  private async updateLastLogin(userId: string): Promise<void> {
    try {
      await this.db.query('UPDATE users SET last_login = $1, updated_at = $2 WHERE id = $3', [
        new Date(),
        new Date(),
        userId,
      ]);
    } catch (error) {
      logger.error('Failed to update last login', {
        error: (error as Error).message,
        userId,
      });
      // Don't throw here - last login update failure shouldn't block auth
    }
  }

  /**
   * Map database row to User object
   */
  private mapUserFromDb(row: any): User {
    return {
      id: row.id,
      email: row.email,
      password_hash: row.password_hash,
      display_name: row.display_name,
      preferences: row.preferences || {},
      security_settings: row.security_settings || {},
      status: row.status,
      email_verified: row.email_verified || false,
      two_factor_enabled: row.two_factor_enabled || false,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_login: row.last_login,
      password_reset_token: row.password_reset_token,
      password_reset_expires: row.password_reset_expires,
      email_verification_token: row.email_verification_token,
      email_verification_expires: row.email_verification_expires,
    };
  }
}
