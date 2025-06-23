import { Response } from 'express';
import { AuthDatabaseService } from '../services/auth-db';
import { DatabaseService } from '../services/database';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/auth';
import { User, Device } from '../types/auth';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';

export interface UserProfileUpdateRequest {
  display_name?: string;
  preferences?: Record<string, any>;
}

export interface UserPreferencesUpdateRequest {
  preferences: Record<string, any>;
}

export interface DeviceRegistrationRequest {
  device_name: string;
  device_type: 'desktop' | 'mobile' | 'tablet' | 'web';
  platform?: string;
  device_fingerprint?: string;
  capabilities?: Record<string, any>;
  push_token?: string;
  app_version?: string;
  os_version?: string;
}

export interface DeviceUpdateRequest {
  device_name?: string;
  platform?: string;
  capabilities?: Record<string, any>;
  push_token?: string;
  app_version?: string;
  os_version?: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export class UsersController {
  private authDbService: AuthDatabaseService;
  private db: Pool;

  constructor(databaseService: DatabaseService) {
    // Access the pool through the query method since getPool doesn't exist
    this.db = (databaseService as any).pool;
    this.authDbService = new AuthDatabaseService(this.db);
  }

  /**
   * GET /api/users/profile - Get user profile
   */
  getProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const user = await this.authDbService.getUserById(req.user.id);

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND',
        });
        return;
      }

      // Remove sensitive information
      const { password_hash, ...userProfile } = user;

      logger.info('User profile retrieved', {
        userId: user['id'],
        email: user['email'],
      });

      res.json({
        success: true,
        data: {
          user: userProfile,
        },
      });
    } catch (error) {
      logger.error('Failed to get user profile', {
        error: (error as Error).message,
        userId: req.user?.id,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve user profile',
        code: 'INTERNAL_ERROR',
      });
    }
  };

  /**
   * PUT /api/users/profile - Update user profile
   */
  updateProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const { display_name, preferences }: UserProfileUpdateRequest = req.body;

      // Validate input
      if (display_name !== undefined && typeof display_name !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Display name must be a string',
          code: 'INVALID_INPUT',
        });
        return;
      }

      if (display_name && display_name.trim().length > 100) {
        res.status(400).json({
          success: false,
          error: 'Display name must be 100 characters or less',
          code: 'INVALID_INPUT',
        });
        return;
      }

      if (preferences !== undefined && typeof preferences !== 'object') {
        res.status(400).json({
          success: false,
          error: 'Preferences must be an object',
          code: 'INVALID_INPUT',
        });
        return;
      }

      const updates: Partial<Pick<User, 'display_name' | 'preferences'>> = {};

      if (display_name !== undefined) {
        const trimmed = display_name.trim();
        if (trimmed) {
          updates.display_name = trimmed;
        }
        // If trimmed is empty, we don't set display_name in updates, leaving it unchanged
      }

      if (preferences !== undefined) {
        updates.preferences = preferences;
      }

      const updatedUser = await this.authDbService.updateUserProfile(req.user.id, updates);

      // Remove sensitive information
      const { password_hash, ...userProfile } = updatedUser;

      logger.info('User profile updated', {
        userId: updatedUser['id'],
        updates: Object.keys(updates),
      });

      res.json({
        success: true,
        data: {
          user: userProfile,
        },
      });
    } catch (error) {
      logger.error('Failed to update user profile', {
        error: (error as Error).message,
        userId: req.user?.id,
      });

      if ((error as any).code === 'USER_NOT_FOUND') {
        res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update user profile',
        code: 'INTERNAL_ERROR',
      });
    }
  };

  /**
   * GET /api/users/preferences - Get user preferences
   */
  getPreferences = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const user = await this.authDbService.getUserById(req.user.id);

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND',
        });
        return;
      }

      logger.info('User preferences retrieved', {
        userId: user['id'],
        preferencesCount: Object.keys(user['preferences'] || {}).length,
      });

      res.json({
        success: true,
        data: {
          preferences: user.preferences || {},
        },
      });
    } catch (error) {
      logger.error('Failed to get user preferences', {
        error: (error as Error).message,
        userId: req.user?.id,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve user preferences',
        code: 'INTERNAL_ERROR',
      });
    }
  };

  /**
   * PUT /api/users/preferences - Update user preferences
   */
  updatePreferences = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const { preferences }: UserPreferencesUpdateRequest = req.body;

      if (!preferences || typeof preferences !== 'object') {
        res.status(400).json({
          success: false,
          error: 'Preferences must be provided as an object',
          code: 'INVALID_INPUT',
        });
        return;
      }

      const updatedUser = await this.authDbService.updateUserProfile(req.user.id, {
        preferences,
      });

      logger.info('User preferences updated', {
        userId: updatedUser['id'],
        preferencesCount: Object.keys(preferences).length,
      });

      res.json({
        success: true,
        data: {
          preferences: updatedUser.preferences,
        },
      });
    } catch (error) {
      logger.error('Failed to update user preferences', {
        error: (error as Error).message,
        userId: req.user?.id,
      });

      if ((error as any).code === 'USER_NOT_FOUND') {
        res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update user preferences',
        code: 'INTERNAL_ERROR',
      });
    }
  };

  /**
   * GET /api/users/devices - List user devices
   */
  getDevices = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const devices = await this.getUserDevices(req.user.id);

      logger.info('User devices retrieved', {
        userId: req.user.id,
        deviceCount: devices.length,
      });

      res.json({
        success: true,
        data: {
          devices,
        },
      });
    } catch (error) {
      logger.error('Failed to get user devices', {
        error: (error as Error).message,
        userId: req.user?.id,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve user devices',
        code: 'INTERNAL_ERROR',
      });
    }
  };

  /**
   * POST /api/users/devices - Register new device
   */
  registerDevice = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const deviceData: DeviceRegistrationRequest = req.body;

      // Validate required fields
      if (!deviceData.device_name || !deviceData.device_type) {
        res.status(400).json({
          success: false,
          error: 'Device name and type are required',
          code: 'INVALID_INPUT',
        });
        return;
      }

      // Validate device type
      const validDeviceTypes = ['desktop', 'mobile', 'tablet', 'web'];
      if (!validDeviceTypes.includes(deviceData.device_type)) {
        res.status(400).json({
          success: false,
          error: 'Invalid device type',
          code: 'INVALID_INPUT',
        });
        return;
      }

      const device = await this.createDevice(req.user.id, deviceData);

      logger.info('Device registered', {
        userId: req.user.id,
        deviceId: device['id'],
        deviceType: device.device_type,
      });

      res.status(201).json({
        success: true,
        data: {
          device,
        },
      });
    } catch (error) {
      logger.error('Failed to register device', {
        error: (error as Error).message,
        userId: req.user?.id,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to register device',
        code: 'INTERNAL_ERROR',
      });
    }
  };

  /**
   * PUT /api/users/devices/:id - Update device info
   */
  updateDevice = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const deviceId = req.params['id'];
      const updateData: DeviceUpdateRequest = req.body;

      if (!deviceId) {
        res.status(400).json({
          success: false,
          error: 'Device ID is required',
          code: 'INVALID_INPUT',
        });
        return;
      }

      const device = await this.updateUserDevice(req.user.id, deviceId, updateData);

      if (!device) {
        res.status(404).json({
          success: false,
          error: 'Device not found',
          code: 'DEVICE_NOT_FOUND',
        });
        return;
      }

      logger.info('Device updated', {
        userId: req.user.id,
        deviceId: device['id'],
        updates: Object.keys(updateData),
      });

      res.json({
        success: true,
        data: {
          device,
        },
      });
    } catch (error) {
      logger.error('Failed to update device', {
        error: (error as Error).message,
        userId: req.user?.id,
        deviceId: req.params['id'],
      });

      res.status(500).json({
        success: false,
        error: 'Failed to update device',
        code: 'INTERNAL_ERROR',
      });
    }
  };

  /**
   * DELETE /api/users/devices/:id - Remove device
   */
  removeDevice = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const deviceId = req.params['id'];

      if (!deviceId) {
        res.status(400).json({
          success: false,
          error: 'Device ID is required',
          code: 'INVALID_INPUT',
        });
        return;
      }

      const success = await this.deleteUserDevice(req.user.id, deviceId);

      if (!success) {
        res.status(404).json({
          success: false,
          error: 'Device not found',
          code: 'DEVICE_NOT_FOUND',
        });
        return;
      }

      logger.info('Device removed', {
        userId: req.user.id,
        deviceId,
      });

      res.json({
        success: true,
        message: 'Device removed successfully',
      });
    } catch (error) {
      logger.error('Failed to remove device', {
        error: (error as Error).message,
        userId: req.user?.id,
        deviceId: req.params['id'],
      });

      res.status(500).json({
        success: false,
        error: 'Failed to remove device',
        code: 'INTERNAL_ERROR',
      });
    }
  };

  /**
   * POST /api/users/change-password - Change password
   */
  changePassword = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const { current_password, new_password }: ChangePasswordRequest = req.body;

      // Validate input
      if (!current_password || !new_password) {
        res.status(400).json({
          success: false,
          error: 'Current password and new password are required',
          code: 'INVALID_INPUT',
        });
        return;
      }

      if (new_password.length < 8) {
        res.status(400).json({
          success: false,
          error: 'New password must be at least 8 characters long',
          code: 'INVALID_INPUT',
        });
        return;
      }

      // Get current user to verify password
      const user = await this.authDbService.getUserById(req.user.id);
      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND',
        });
        return;
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(current_password, user.password_hash);
      if (!isCurrentPasswordValid) {
        res.status(400).json({
          success: false,
          error: 'Current password is incorrect',
          code: 'INVALID_PASSWORD',
        });
        return;
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(new_password, 12);

      // Update password in database
      await this.updateUserPassword(req.user.id, hashedNewPassword);

      // Terminate all other sessions for security
      await this.authDbService.terminateAllUserSessions(req.user.id);

      logger.info('Password changed successfully', {
        userId: req.user.id,
        email: user['email'],
      });

      res.json({
        success: true,
        message: 'Password changed successfully. Please log in again.',
      });
    } catch (error) {
      logger.error('Failed to change password', {
        error: (error as Error).message,
        userId: req.user?.id,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to change password',
        code: 'INTERNAL_ERROR',
      });
    }
  };

  /**
   * Helper method to get user devices
   */
  private async getUserDevices(userId: string): Promise<Device[]> {
    try {
      const result = await this.db.query(
        'SELECT * FROM devices WHERE user_id = $1 AND status = $2 ORDER BY last_seen DESC',
        [userId, 'active']
      );
      return result.rows;
    } catch (error) {
      logger.error('Failed to get user devices', {
        error: (error as Error).message,
        userId,
      });
      throw error;
    }
  }

  /**
   * Helper method to create a device
   */
  private async createDevice(
    userId: string,
    deviceData: DeviceRegistrationRequest
  ): Promise<Device> {
    try {
      const deviceId = uuidv4();
      const now = new Date();

      const result = await this.db.query(
        `INSERT INTO devices (
          id, user_id, device_name, device_type, platform, device_fingerprint,
          capabilities, push_token, app_version, os_version, created_at, last_seen, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          deviceId,
          userId,
          deviceData.device_name,
          deviceData.device_type,
          deviceData.platform || null,
          deviceData.device_fingerprint || null,
          deviceData.capabilities || {},
          deviceData.push_token || null,
          deviceData.app_version || null,
          deviceData.os_version || null,
          now,
          now,
          'active',
        ]
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create device', {
        error: (error as Error).message,
        userId,
      });
      throw error;
    }
  }

  /**
   * Helper method to update a device
   */
  private async updateUserDevice(
    userId: string,
    deviceId: string,
    updateData: DeviceUpdateRequest
  ): Promise<Device | null> {
    try {
      const setClause = [];
      const values = [];
      let paramIndex = 1;

      if (updateData.device_name !== undefined) {
        setClause.push(`device_name = $${paramIndex++}`);
        values.push(updateData.device_name);
      }

      if (updateData.platform !== undefined) {
        setClause.push(`platform = $${paramIndex++}`);
        values.push(updateData.platform);
      }

      if (updateData.capabilities !== undefined) {
        setClause.push(`capabilities = $${paramIndex++}`);
        values.push(updateData.capabilities);
      }

      if (updateData.push_token !== undefined) {
        setClause.push(`push_token = $${paramIndex++}`);
        values.push(updateData.push_token);
      }

      if (updateData.app_version !== undefined) {
        setClause.push(`app_version = $${paramIndex++}`);
        values.push(updateData.app_version);
      }

      if (updateData.os_version !== undefined) {
        setClause.push(`os_version = $${paramIndex++}`);
        values.push(updateData.os_version);
      }

      if (setClause.length === 0) {
        // No updates provided, return current device
        const result = await this.db.query('SELECT * FROM devices WHERE id = $1 AND user_id = $2', [
          deviceId,
          userId,
        ]);
        return result.rows[0] || null;
      }

      setClause.push(`last_seen = $${paramIndex++}`);
      values.push(new Date());
      values.push(deviceId);
      values.push(userId);

      const result = await this.db.query(
        `UPDATE devices SET ${setClause.join(', ')} 
         WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
         RETURNING *`,
        values
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to update device', {
        error: (error as Error).message,
        userId,
        deviceId,
      });
      throw error;
    }
  }

  /**
   * Helper method to delete a device
   */
  private async deleteUserDevice(userId: string, deviceId: string): Promise<boolean> {
    try {
      const result = await this.db.query(
        'UPDATE devices SET status = $1 WHERE id = $2 AND user_id = $3',
        ['revoked', deviceId, userId]
      );

      return (result.rowCount || 0) > 0;
    } catch (error) {
      logger.error('Failed to delete device', {
        error: (error as Error).message,
        userId,
        deviceId,
      });
      throw error;
    }
  }

  /**
   * Helper method to update user password
   */
  private async updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
    try {
      await this.db.query('UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3', [
        hashedPassword,
        new Date(),
        userId,
      ]);
    } catch (error) {
      logger.error('Failed to update user password', {
        error: (error as Error).message,
        userId,
      });
      throw error;
    }
  }
}
