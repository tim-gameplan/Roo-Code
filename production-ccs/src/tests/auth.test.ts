import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AuthService } from '../services/auth';

// Mock dependencies
jest.mock('pg');
jest.mock('bcrypt');
jest.mock('jsonwebtoken');
jest.mock('../config', () => ({
  config: {
    server: {
      jwt: {
        secret: 'test-secret',
        accessTokenExpiry: '15m',
        refreshTokenExpiry: '7d',
      },
      bcrypt: {
        saltRounds: 10,
      },
    },
  },
}));
jest.mock('../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockPool = {
  connect: jest.fn(),
  query: jest.fn(),
} as unknown as Pool;

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService(mockPool);
    (mockPool.connect as jest.Mock).mockResolvedValue(mockClient);
  });

  describe('createUser', () => {
    it('should create a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        display_name: 'Test User',
        preferences: { theme: 'dark' },
      };

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        display_name: 'Test User',
        preferences: { theme: 'dark' },
        security_settings: {},
        created_at: new Date(),
        updated_at: new Date(),
        last_login: null,
        status: 'active',
        email_verified: false,
        two_factor_enabled: false,
      };

      // Mock existing user check (no existing user)
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        // Mock user creation
        .mockResolvedValueOnce({ rows: [mockUser] })
        // Mock token storage
        .mockResolvedValueOnce({ rows: [{ id: 'token-123' }] })
        // Mock security log
        .mockResolvedValueOnce({ rows: [{ id: 'log-123' }] });

      (bcrypt.hash as jest.Mock)
        .mockResolvedValueOnce('hashed-password')
        .mockResolvedValueOnce('hashed-token');

      (jwt.sign as jest.Mock).mockReturnValue('verification-token');

      const result = await authService.createUser(userData);

      expect(result.user.email).toBe(userData.email);
      expect(result.verification_token).toBe('verification-token');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should throw error if user already exists', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
      };

      // Mock existing user found
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'existing-user' }] });

      await expect(authService.createUser(userData)).rejects.toThrow(
        'User with this email already exists'
      );

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('login', () => {
    it('should login user successfully', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
        device_name: 'Test Device',
        device_type: 'desktop' as const,
        platform: 'web' as const,
        device_fingerprint: 'device-123',
        capabilities: { notifications: true },
      };

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        password_hash: 'hashed-password',
        status: 'active',
        display_name: 'Test User',
        preferences: {},
        security_settings: {},
        created_at: new Date(),
        updated_at: new Date(),
        last_login: null,
        email_verified: true,
        two_factor_enabled: false,
      };

      const mockDevice = {
        id: 'device-123',
        user_id: 'user-123',
        device_name: 'Test Device',
        device_type: 'desktop',
        platform: 'web',
        device_fingerprint: 'device-123',
        capabilities: { notifications: true },
        status: 'active',
        created_at: new Date(),
        last_seen: new Date(),
      };

      const mockSession = {
        id: 'session-123',
        user_id: 'user-123',
        device_id: 'device-123',
        session_token: 'session-token',
        refresh_token: 'refresh-token',
        expires_at: new Date(),
        refresh_expires_at: new Date(),
        created_at: new Date(),
        last_activity: new Date(),
        ip_address: null,
        user_agent: null,
        is_active: true,
        revoked_at: null,
        revoked_reason: null,
      };

      // Mock getUserByEmail
      (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockUser] });

      // Mock password verification
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      // Mock device operations
      mockClient.query
        // Check existing device
        .mockResolvedValueOnce({ rows: [mockDevice] })
        // Update device
        .mockResolvedValueOnce({ rows: [mockDevice] })
        // Create session
        .mockResolvedValueOnce({ rows: [mockSession] })
        // Update last login
        .mockResolvedValueOnce({ rows: [] })
        // Log security event
        .mockResolvedValueOnce({ rows: [{ id: 'log-123' }] });

      (jwt.sign as jest.Mock)
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');

      const result = await authService.login(loginData);

      expect(result.user.email).toBe(loginData.email);
      expect(result.access_token).toBe('access-token');
      expect(result.refresh_token).toBe('refresh-token');
      expect(result.device.id).toBe('device-123');
    });

    it('should throw error for invalid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'wrong-password',
        device_name: 'Test Device',
        device_type: 'desktop' as const,
        platform: 'web' as const,
        device_fingerprint: 'device-123',
      };

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        password_hash: 'hashed-password',
        status: 'active',
      };

      // Mock getUserByEmail
      (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockUser] });

      // Mock password verification failure
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      // Mock security log
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'log-123' }] });

      await expect(authService.login(loginData)).rejects.toThrow('Invalid credentials');
    });
  });

  describe('validateSession', () => {
    it('should validate session successfully', async () => {
      const token = 'valid-token';
      const decodedToken = {
        user_id: 'user-123',
        session_id: 'session-123',
        device_id: 'device-123',
        email: 'test@example.com',
      };

      const mockSession = {
        id: 'session-123',
        user_id: 'user-123',
        device_id: 'device-123',
        is_active: true,
        expires_at: new Date(Date.now() + 1000000),
      };

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        status: 'active',
        password_hash: 'hashed-password',
      };

      const mockDevice = {
        id: 'device-123',
        user_id: 'user-123',
        device_name: 'Test Device',
      };

      (jwt.verify as jest.Mock).mockReturnValue(decodedToken);

      (mockPool.query as jest.Mock)
        // Session validation
        .mockResolvedValueOnce({ rows: [mockSession] })
        // Get user
        .mockResolvedValueOnce({ rows: [mockUser] })
        // Get device
        .mockResolvedValueOnce({ rows: [mockDevice] })
        // Update last activity
        .mockResolvedValueOnce({ rows: [] });

      const result = await authService.validateSession(token);

      expect(result).toBeTruthy();
      expect(result?.user.email).toBe('test@example.com');
      expect(result?.session.id).toBe('session-123');
      expect(result?.device.id).toBe('device-123');
      expect(result?.user).not.toHaveProperty('password_hash');
    });

    it('should return null for invalid token', async () => {
      const token = 'invalid-token';

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result = await authService.validateSession(token);

      expect(result).toBeNull();
    });

    it('should return null for expired session', async () => {
      const token = 'valid-token';
      const decodedToken = {
        user_id: 'user-123',
        session_id: 'session-123',
        device_id: 'device-123',
        email: 'test@example.com',
      };

      (jwt.verify as jest.Mock).mockReturnValue(decodedToken);

      // Mock no active session found
      (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const result = await authService.validateSession(token);

      expect(result).toBeNull();
    });
  });

  describe('refreshToken', () => {
    it('should refresh tokens successfully', async () => {
      const refreshData = {
        refresh_token: 'valid-refresh-token',
        device_id: 'device-123',
      };

      const decodedToken = {
        user_id: 'user-123',
        device_id: 'device-123',
        type: 'refresh',
      };

      const mockSession = {
        id: 'session-123',
        user_id: 'user-123',
        device_id: 'device-123',
        refresh_expires_at: new Date(Date.now() + 1000000),
      };

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
      };

      (jwt.verify as jest.Mock).mockReturnValue(decodedToken);

      mockClient.query
        // Get session
        .mockResolvedValueOnce({ rows: [mockSession] })
        // Update session
        .mockResolvedValueOnce({ rows: [] });

      // Mock getUserById
      (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockUser] });

      (jwt.sign as jest.Mock)
        .mockReturnValueOnce('new-access-token')
        .mockReturnValueOnce('new-refresh-token');

      const result = await authService.refreshToken(refreshData);

      expect(result.access_token).toBe('new-access-token');
      expect(result.refresh_token).toBe('new-refresh-token');
      expect(result.expires_at).toBeInstanceOf(Date);
    });

    it('should throw error for invalid refresh token', async () => {
      const refreshData = {
        refresh_token: 'invalid-refresh-token',
        device_id: 'device-123',
      };

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.refreshToken(refreshData)).rejects.toThrow('Invalid token');
    });
  });

  describe('registerDevice', () => {
    it('should register new device successfully', async () => {
      const deviceData = {
        user_id: 'user-123',
        device_name: 'New Device',
        device_type: 'mobile' as const,
        platform: 'ios' as const,
        device_fingerprint: 'new-device-123',
        capabilities: { push_notifications: true },
      };

      const mockDevice = {
        id: 'device-456',
        user_id: 'user-123',
        device_name: 'New Device',
        device_type: 'mobile',
        platform: 'ios',
        device_fingerprint: 'new-device-123',
        capabilities: { push_notifications: true },
        status: 'active',
        created_at: new Date(),
        last_seen: new Date(),
      };

      mockClient.query
        // Check existing device (none found)
        .mockResolvedValueOnce({ rows: [] })
        // Create new device
        .mockResolvedValueOnce({ rows: [mockDevice] })
        // Log security event
        .mockResolvedValueOnce({ rows: [{ id: 'log-123' }] });

      (jwt.sign as jest.Mock).mockReturnValue('device-token');

      const result = await authService.registerDevice(deviceData);

      expect(result.device.id).toBe('device-456');
      expect(result.device_token).toBe('device-token');
    });

    it('should update existing device', async () => {
      const deviceData = {
        user_id: 'user-123',
        device_name: 'Updated Device',
        device_type: 'desktop' as const,
        platform: 'web' as const,
        device_fingerprint: 'existing-device-123',
        capabilities: { notifications: true },
      };

      const existingDevice = {
        id: 'device-123',
        user_id: 'user-123',
        device_fingerprint: 'existing-device-123',
      };

      const updatedDevice = {
        ...existingDevice,
        device_name: 'Updated Device',
        platform: 'web',
        capabilities: { notifications: true },
      };

      mockClient.query
        // Check existing device (found)
        .mockResolvedValueOnce({ rows: [existingDevice] })
        // Update existing device
        .mockResolvedValueOnce({ rows: [updatedDevice] });

      (jwt.sign as jest.Mock).mockReturnValue('device-token');

      const result = await authService.registerDevice(deviceData);

      expect(result.device.device_name).toBe('Updated Device');
      expect(result.device_token).toBe('device-token');
    });
  });

  describe('parseExpiry', () => {
    it('should parse various expiry formats correctly', () => {
      // Access private method for testing
      const parseExpiry = (authService as any).parseExpiry.bind(authService);

      expect(parseExpiry('30s')).toBe(30);
      expect(parseExpiry('15m')).toBe(900); // 15 * 60
      expect(parseExpiry('2h')).toBe(7200); // 2 * 60 * 60
      expect(parseExpiry('7d')).toBe(604800); // 7 * 24 * 60 * 60
    });

    it('should throw error for invalid expiry format', () => {
      const parseExpiry = (authService as any).parseExpiry.bind(authService);

      expect(() => parseExpiry('invalid')).toThrow('Invalid expiry format');
      expect(() => parseExpiry('30x')).toThrow('Invalid expiry unit');
      expect(() => parseExpiry('')).toThrow('Invalid expiry format');
    });
  });

  describe('getUserById', () => {
    it('should return user by id', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        status: 'active',
      };

      (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockUser] });

      const result = await authService.getUserById('user-123');

      expect(result).toEqual(mockUser);
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE id = $1 AND status != $2',
        ['user-123', 'deleted']
      );
    });

    it('should return null if user not found', async () => {
      (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const result = await authService.getUserById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should cleanup expired sessions', async () => {
      (mockPool.query as jest.Mock).mockResolvedValueOnce({ rowCount: 5 });

      const result = await authService.cleanupExpiredSessions();

      expect(result).toBe(5);
      expect(mockPool.query).toHaveBeenCalledWith(
        'UPDATE sessions SET is_active = FALSE, revoked_at = NOW(), revoked_reason = $1 WHERE expires_at < NOW() AND is_active = TRUE',
        ['expired']
      );
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should cleanup expired tokens', async () => {
      (mockPool.query as jest.Mock).mockResolvedValueOnce({ rowCount: 3 });

      const result = await authService.cleanupExpiredTokens();

      expect(result).toBe(3);
      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM auth_tokens WHERE expires_at < NOW()'
      );
    });
  });

  describe('logSecurityEvent', () => {
    it('should log security event successfully', async () => {
      const eventData = {
        event_type: 'login_success',
        event_details: { device: 'test-device' },
        risk_score: 0,
        ip_address: '192.168.1.1',
        user_agent: 'test-agent',
      };

      (mockPool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ id: 'log-123' }],
      });

      const result = await authService.logSecurityEvent(
        'user-123',
        'device-123',
        'session-123',
        eventData
      );

      expect(result).toBe('log-123');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO security_audit_log'),
        expect.arrayContaining(['user-123', 'device-123', 'session-123'])
      );
    });
  });
});
