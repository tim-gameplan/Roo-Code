import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import {
  User,
  Device,
  UserPreference,
  SecurityAuditLog,
  CreateUserRequest,
  CreateUserResponse,
  LoginRequest,
  LoginResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  RegisterDeviceRequest,
  RegisterDeviceResponse,
  UpdateUserPreferencesRequest,
  SecurityEventRequest,
  AuthService as IAuthService,
  JWTPayload,
  AuthenticatedRequest,
  SecurityAuditQueryOptions,
} from '@/types/auth';

export class AuthService implements IAuthService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  // User management
  async createUser(data: CreateUserRequest): Promise<CreateUserResponse> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Check if user already exists
      const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [
        data.email,
      ]);

      if (existingUser.rows.length > 0) {
        throw new Error('User with this email already exists');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(data.password, config.server.bcrypt.saltRounds);

      // Create user
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, display_name, preferences, email_verified)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, display_name, preferences, security_settings, created_at, updated_at, last_login, status, email_verified, two_factor_enabled`,
        [
          data.email,
          passwordHash,
          data.display_name || null,
          JSON.stringify(data.preferences || {}),
          false, // email_verified
        ]
      );

      const user = userResult.rows[0];

      // Generate email verification token
      const verificationToken = jwt.sign(
        { userId: user.id, type: 'email_verification' },
        config.server.jwt.secret,
        { expiresIn: '24h' } as jwt.SignOptions
      );

      // Store verification token
      await client.query(
        `INSERT INTO auth_tokens (user_id, token_type, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [
          user.id,
          'email_verification',
          await bcrypt.hash(verificationToken, 10),
          new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        ]
      );

      // Log security event
      await this.logSecurityEvent(user.id, '', '', {
        event_type: 'user_created',
        event_details: { email: data.email },
        risk_score: 0,
      });

      await client.query('COMMIT');

      return {
        user: {
          id: user.id,
          email: user.email,
          display_name: user.display_name,
          preferences: user.preferences,
          security_settings: user.security_settings,
          created_at: user.created_at,
          updated_at: user.updated_at,
          last_login: user.last_login,
          status: user.status,
          email_verified: user.email_verified,
          two_factor_enabled: user.two_factor_enabled,
        },
        verification_token: verificationToken,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create user', { error, email: data.email });
      throw error;
    } finally {
      client.release();
    }
  }

  async getUserById(id: string): Promise<User | null> {
    const result = await this.pool.query('SELECT * FROM users WHERE id = $1 AND status != $2', [
      id,
      'deleted',
    ]);
    return result.rows[0] || null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query('SELECT * FROM users WHERE email = $1 AND status != $2', [
      email,
      'deleted',
    ]);
    return result.rows[0] || null;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const client = await this.pool.connect();
    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (data.display_name !== undefined) {
        updateFields.push(`display_name = $${paramCount++}`);
        values.push(data.display_name);
      }

      if (data.preferences !== undefined) {
        updateFields.push(`preferences = $${paramCount++}`);
        values.push(JSON.stringify(data.preferences));
      }

      if (data.security_settings !== undefined) {
        updateFields.push(`security_settings = $${paramCount++}`);
        values.push(JSON.stringify(data.security_settings));
      }

      if (data.status !== undefined) {
        updateFields.push(`status = $${paramCount++}`);
        values.push(data.status);
      }

      if (data.email_verified !== undefined) {
        updateFields.push(`email_verified = $${paramCount++}`);
        values.push(data.email_verified);
      }

      if (data.two_factor_enabled !== undefined) {
        updateFields.push(`two_factor_enabled = $${paramCount++}`);
        values.push(data.two_factor_enabled);
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(id);

      const query = `
        UPDATE users 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await client.query(query, values);
      if (!result.rows[0]) {
        throw new Error('User not found');
      }

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await this.pool.query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2',
      ['deleted', id]
    );
    return (result.rowCount || 0) > 0;
  }

  async verifyEmail(token: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Decode token
      const decoded = jwt.verify(token, config.server.jwt.secret) as any;
      if (decoded.type !== 'email_verification') {
        throw new Error('Invalid token type');
      }

      // Find and verify token
      const tokenResult = await client.query(
        `SELECT * FROM auth_tokens 
         WHERE user_id = $1 AND token_type = $2 AND expires_at > NOW() AND used_at IS NULL`,
        [decoded.userId, 'email_verification']
      );

      if (tokenResult.rows.length === 0) {
        throw new Error('Invalid or expired token');
      }

      const tokenRecord = tokenResult.rows[0];
      const isValid = await bcrypt.compare(token, tokenRecord.token_hash);
      if (!isValid) {
        throw new Error('Invalid token');
      }

      // Mark token as used
      await client.query('UPDATE auth_tokens SET used_at = NOW() WHERE id = $1', [tokenRecord.id]);

      // Verify user email
      await client.query(
        'UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1',
        [decoded.userId]
      );

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to verify email', { error });
      return false;
    } finally {
      client.release();
    }
  }

  // Authentication
  async login(data: LoginRequest): Promise<LoginResponse> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get user
      const user = await this.getUserByEmail(data.email);
      if (!user || user.status !== 'active') {
        throw new Error('Invalid credentials');
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(data.password, user.password_hash);
      if (!isValidPassword) {
        await this.logSecurityEvent(user.id, '', '', {
          event_type: 'login_failed',
          event_details: { reason: 'invalid_password', email: data.email },
          risk_score: 30,
        });
        throw new Error('Invalid credentials');
      }

      // Register or update device
      let device: Device;
      const existingDevice = await client.query(
        'SELECT * FROM devices WHERE user_id = $1 AND device_fingerprint = $2',
        [user.id, data.device_fingerprint]
      );

      if (existingDevice.rows.length > 0) {
        // Update existing device
        device = (
          await client.query(
            `UPDATE devices 
           SET device_name = $1, last_seen = NOW(), status = 'active',
               platform = $2, capabilities = $3
           WHERE id = $4
           RETURNING *`,
            [
              data.device_name,
              data.platform,
              JSON.stringify(data.capabilities || {}),
              existingDevice.rows[0].id,
            ]
          )
        ).rows[0];
      } else {
        // Create new device
        device = (
          await client.query(
            `INSERT INTO devices (user_id, device_name, device_type, platform, device_fingerprint, capabilities)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
            [
              user.id,
              data.device_name,
              data.device_type,
              data.platform,
              data.device_fingerprint,
              JSON.stringify(data.capabilities || {}),
            ]
          )
        ).rows[0];
      }

      // Create session tokens
      const accessTokenExpiry = this.parseExpiry(config.server.jwt.accessTokenExpiry);
      const refreshTokenExpiry = this.parseExpiry(config.server.jwt.refreshTokenExpiry);

      const sessionToken = jwt.sign(
        {
          user_id: user.id,
          session_id: 'temp', // Will be updated after session creation
          device_id: device.id,
          email: user.email,
        } as JWTPayload,
        config.server.jwt.secret,
        { expiresIn: config.server.jwt.accessTokenExpiry } as jwt.SignOptions
      );

      const refreshToken = jwt.sign(
        { user_id: user.id, device_id: device.id, type: 'refresh' },
        config.server.jwt.secret,
        { expiresIn: config.server.jwt.refreshTokenExpiry } as jwt.SignOptions
      );

      const session = (
        await client.query(
          `INSERT INTO sessions (user_id, device_id, session_token, refresh_token, expires_at, refresh_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
          [
            user.id,
            device.id,
            sessionToken,
            refreshToken,
            new Date(Date.now() + accessTokenExpiry * 1000),
            new Date(Date.now() + refreshTokenExpiry * 1000),
          ]
        )
      ).rows[0];

      // Update last login
      await client.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

      // Log successful login
      await this.logSecurityEvent(user.id, device.id, session.id, {
        event_type: 'login_success',
        event_details: { device_name: data.device_name, device_type: data.device_type },
        risk_score: 0,
      });

      await client.query('COMMIT');

      // Remove password hash from response
      const { password_hash, ...userWithoutPassword } = user;

      return {
        user: userWithoutPassword,
        session: {
          id: session.id,
          user_id: session.user_id,
          device_id: session.device_id,
          session_token: session.session_token,
          expires_at: session.expires_at,
          created_at: session.created_at,
          last_activity: session.last_activity,
          ip_address: session.ip_address,
          user_agent: session.user_agent,
          is_active: session.is_active,
          revoked_at: session.revoked_at,
          revoked_reason: session.revoked_reason,
        },
        access_token: sessionToken,
        refresh_token: refreshToken,
        device,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Login failed', { error, email: data.email });
      throw error;
    } finally {
      client.release();
    }
  }

  async logout(session_id: string): Promise<boolean> {
    const result = await this.pool.query(
      'UPDATE sessions SET is_active = FALSE, revoked_at = NOW(), revoked_reason = $1 WHERE id = $2',
      ['user_logout', session_id]
    );
    return (result.rowCount || 0) > 0;
  }

  async refreshToken(data: RefreshTokenRequest): Promise<RefreshTokenResponse> {
    const client = await this.pool.connect();
    try {
      // Verify refresh token
      const decoded = jwt.verify(data.refresh_token, config.server.jwt.secret) as any;
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Get session
      const sessionResult = await client.query(
        'SELECT * FROM sessions WHERE refresh_token = $1 AND device_id = $2 AND is_active = TRUE',
        [data.refresh_token, data.device_id]
      );

      if (sessionResult.rows.length === 0) {
        throw new Error('Invalid refresh token');
      }

      const session = sessionResult.rows[0];

      // Check if refresh token is expired
      if (session.refresh_expires_at && new Date() > session.refresh_expires_at) {
        throw new Error('Refresh token expired');
      }

      // Generate new tokens
      const accessTokenExpiry = this.parseExpiry(config.server.jwt.accessTokenExpiry);
      const refreshTokenExpiry = this.parseExpiry(config.server.jwt.refreshTokenExpiry);

      // Get user email for token
      const user = await this.getUserById(session.user_id);
      if (!user) {
        throw new Error('User not found');
      }

      const newAccessToken = jwt.sign(
        {
          user_id: session.user_id,
          session_id: session.id,
          device_id: session.device_id,
          email: user.email,
        } as JWTPayload,
        config.server.jwt.secret,
        { expiresIn: config.server.jwt.accessTokenExpiry } as jwt.SignOptions
      );

      const newRefreshToken = jwt.sign(
        { user_id: session.user_id, device_id: session.device_id, type: 'refresh' },
        config.server.jwt.secret,
        { expiresIn: config.server.jwt.refreshTokenExpiry } as jwt.SignOptions
      );

      // Update session with new tokens
      const newExpiresAt = new Date(Date.now() + accessTokenExpiry * 1000);
      const newRefreshExpiresAt = new Date(Date.now() + refreshTokenExpiry * 1000);

      await client.query(
        `UPDATE sessions 
         SET session_token = $1, refresh_token = $2, expires_at = $3, refresh_expires_at = $4, last_activity = NOW()
         WHERE id = $5`,
        [newAccessToken, newRefreshToken, newExpiresAt, newRefreshExpiresAt, session.id]
      );

      return {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        expires_at: newExpiresAt,
      };
    } catch (error) {
      logger.error('Failed to refresh token', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  // Session management
  async validateSession(token: string): Promise<AuthenticatedRequest | null> {
    try {
      const decoded = jwt.verify(token, config.server.jwt.secret) as JWTPayload;

      const sessionResult = await this.pool.query(
        'SELECT * FROM sessions WHERE id = $1 AND is_active = TRUE AND expires_at > NOW()',
        [decoded.session_id]
      );

      if (sessionResult.rows.length === 0) {
        return null;
      }

      const session = sessionResult.rows[0];
      const user = await this.getUserById(session.user_id);

      if (!user || user.status !== 'active') {
        return null;
      }

      // Get device
      const deviceResult = await this.pool.query('SELECT * FROM devices WHERE id = $1', [
        session.device_id,
      ]);

      if (deviceResult.rows.length === 0) {
        return null;
      }

      const device = deviceResult.rows[0];

      // Update last activity
      await this.pool.query('UPDATE sessions SET last_activity = NOW() WHERE id = $1', [
        session.id,
      ]);

      // Remove password hash from user
      const { password_hash, ...userWithoutPassword } = user;

      return {
        user: userWithoutPassword,
        session,
        device,
      };
    } catch (error) {
      logger.error('Failed to validate session', { error });
      return null;
    }
  }

  // Device management
  async registerDevice(data: RegisterDeviceRequest): Promise<RegisterDeviceResponse> {
    const client = await this.pool.connect();
    try {
      // Check if device already exists
      const existingDevice = await client.query(
        'SELECT * FROM devices WHERE user_id = $1 AND device_fingerprint = $2',
        [data.user_id, data.device_fingerprint]
      );

      if (existingDevice.rows.length > 0) {
        // Update existing device
        const device = (
          await client.query(
            `UPDATE devices 
           SET device_name = $1, last_seen = NOW(), status = 'active',
               platform = $2, capabilities = $3
           WHERE id = $4
           RETURNING *`,
            [
              data.device_name,
              data.platform,
              JSON.stringify(data.capabilities || {}),
              existingDevice.rows[0].id,
            ]
          )
        ).rows[0];

        // Generate device token
        const deviceToken = jwt.sign(
          { device_id: device.id, user_id: data.user_id },
          config.server.jwt.secret,
          { expiresIn: '30d' } as jwt.SignOptions
        );

        return { device, device_token: deviceToken };
      }

      // Create new device
      const device = (
        await client.query(
          `INSERT INTO devices (user_id, device_name, device_type, platform, device_fingerprint, capabilities)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
          [
            data.user_id,
            data.device_name,
            data.device_type,
            data.platform,
            data.device_fingerprint,
            JSON.stringify(data.capabilities || {}),
          ]
        )
      ).rows[0];

      // Generate device token
      const deviceToken = jwt.sign(
        { device_id: device.id, user_id: data.user_id },
        config.server.jwt.secret,
        { expiresIn: '30d' } as jwt.SignOptions
      );

      // Log device registration
      await this.logSecurityEvent(data.user_id, device.id, '', {
        event_type: 'device_registered',
        event_details: { device_name: data.device_name, device_type: data.device_type },
        risk_score: 10,
      });

      return { device, device_token: deviceToken };
    } catch (error) {
      logger.error('Failed to register device', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  async getDevicesByUser(user_id: string): Promise<Device[]> {
    const result = await this.pool.query(
      'SELECT * FROM devices WHERE user_id = $1 AND status = $2 ORDER BY last_seen DESC',
      [user_id, 'active']
    );
    return result.rows;
  }

  async updateDevice(id: string, data: Partial<Device>): Promise<Device> {
    const client = await this.pool.connect();
    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (data.device_name !== undefined) {
        updateFields.push(`device_name = $${paramCount++}`);
        values.push(data.device_name);
      }

      if (data.status !== undefined) {
        updateFields.push(`status = $${paramCount++}`);
        values.push(data.status);
      }

      if (data.capabilities !== undefined) {
        updateFields.push(`capabilities = $${paramCount++}`);
        values.push(JSON.stringify(data.capabilities));
      }

      updateFields.push(`last_seen = NOW()`);
      values.push(id);

      const query = `
        UPDATE devices 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await client.query(query, values);
      if (!result.rows[0]) {
        throw new Error('Device not found');
      }

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async revokeDevice(id: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Revoke device
      const deviceResult = await client.query(
        'UPDATE devices SET status = $1, last_seen = NOW() WHERE id = $2 RETURNING *',
        ['revoked', id]
      );

      if (deviceResult.rows.length === 0) {
        throw new Error('Device not found');
      }

      // Revoke all active sessions for this device
      await client.query(
        'UPDATE sessions SET is_active = FALSE, revoked_at = NOW(), revoked_reason = $1 WHERE device_id = $2',
        ['device_revoked', id]
      );

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to revoke device', { error, device_id: id });
      throw error;
    } finally {
      client.release();
    }
  }

  // User preferences
  async getUserPreferences(user_id: string, device_id?: string): Promise<UserPreference[]> {
    let query = 'SELECT * FROM user_preferences WHERE user_id = $1';
    const params = [user_id];

    if (device_id) {
      query += ' AND (device_id = $2 OR device_specific = FALSE)';
      params.push(device_id);
    } else {
      query += ' AND device_specific = FALSE';
    }

    query += ' ORDER BY preference_key';

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async updateUserPreferences(
    user_id: string,
    data: UpdateUserPreferencesRequest
  ): Promise<UserPreference[]> {
    const client = await this.pool.connect();
    try {
      const preferences: UserPreference[] = [];

      for (const pref of data.preferences) {
        const result = await client.query(
          `INSERT INTO user_preferences (user_id, preference_key, preference_value, device_specific, device_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, preference_key, COALESCE(device_id, ''))
           DO UPDATE SET preference_value = $3, device_specific = $4, device_id = $5, updated_at = NOW()
           RETURNING *`,
          [
            user_id,
            pref.key,
            JSON.stringify(pref.value),
            pref.device_specific || false,
            pref.device_id || null,
          ]
        );
        preferences.push(result.rows[0]);
      }

      return preferences;
    } catch (error) {
      logger.error('Failed to update user preferences', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  // Security audit logging
  async logSecurityEvent(
    user_id: string,
    device_id: string,
    session_id: string,
    data: SecurityEventRequest
  ): Promise<string> {
    const result = await this.pool.query(
      `INSERT INTO security_audit_log (user_id, device_id, session_id, event_type, event_details, ip_address, user_agent, risk_score, success)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        user_id || null,
        device_id || null,
        session_id || null,
        data.event_type,
        JSON.stringify(data.event_details || {}),
        data.ip_address || null,
        data.user_agent || null,
        data.risk_score || 0,
        true, // success - we'll assume success unless specified otherwise
      ]
    );
    return result.rows[0].id;
  }

  async getSecurityAuditLog(options: SecurityAuditQueryOptions): Promise<SecurityAuditLog[]> {
    let query = 'SELECT * FROM security_audit_log WHERE 1=1';
    const params: any[] = [];
    let paramCount = 1;

    if (options.user_id) {
      query += ` AND user_id = $${paramCount++}`;
      params.push(options.user_id);
    }

    if (options.device_id) {
      query += ` AND device_id = $${paramCount++}`;
      params.push(options.device_id);
    }

    if (options.event_type && options.event_type.length > 0) {
      query += ` AND event_type = ANY($${paramCount++})`;
      params.push(options.event_type);
    }

    if (options.success_only) {
      query += ` AND success = true`;
    }

    if (options.failed_only) {
      query += ` AND success = false`;
    }

    if (options.min_risk_score !== undefined) {
      query += ` AND risk_score >= $${paramCount++}`;
      params.push(options.min_risk_score);
    }

    if (options.max_risk_score !== undefined) {
      query += ` AND risk_score <= $${paramCount++}`;
      params.push(options.max_risk_score);
    }

    if (options.created_after) {
      query += ` AND created_at >= $${paramCount++}`;
      params.push(options.created_after);
    }

    if (options.created_before) {
      query += ` AND created_at <= $${paramCount++}`;
      params.push(options.created_before);
    }

    if (options.ip_address) {
      query += ` AND ip_address = $${paramCount++}`;
      params.push(options.ip_address);
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  // Maintenance
  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.pool.query(
      'UPDATE sessions SET is_active = FALSE, revoked_at = NOW(), revoked_reason = $1 WHERE expires_at < NOW() AND is_active = TRUE',
      ['expired']
    );
    return result.rowCount || 0;
  }

  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.pool.query('DELETE FROM auth_tokens WHERE expires_at < NOW()');
    return result.rowCount || 0;
  }

  // Utility methods
  private parseExpiry(expiry: string): number {
    // Parse JWT expiry strings like '15m', '7d', '1h'
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match || !match[1] || !match[2]) {
      throw new Error(`Invalid expiry format: ${expiry}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 24 * 60 * 60;
      default:
        throw new Error(`Invalid expiry unit: ${unit}`);
    }
  }
}
