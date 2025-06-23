/**
 * Authentication and User Management Types
 * Task: TASK-007.1.1.1 - Core User & Authentication Schema
 * Created: 2025-06-23
 */

export interface User {
  id: string;
  email: string;
  password_hash: string;
  display_name?: string;
  preferences: Record<string, any>;
  security_settings: Record<string, any>;
  created_at: Date;
  updated_at: Date;
  last_login?: Date;
  status: 'active' | 'inactive' | 'suspended' | 'deleted';
  email_verified: boolean;
  two_factor_enabled: boolean;
  password_reset_token?: string;
  password_reset_expires?: Date;
  email_verification_token?: string;
  email_verification_expires?: Date;
}

export interface Device {
  id: string;
  user_id: string;
  device_name: string;
  device_type: 'desktop' | 'mobile' | 'tablet' | 'web';
  platform?: string;
  device_fingerprint?: string;
  capabilities: Record<string, any>;
  last_seen: Date;
  created_at: Date;
  status: 'active' | 'inactive' | 'revoked';
  push_token?: string;
  app_version?: string;
  os_version?: string;
}

export interface Session {
  id: string;
  user_id: string;
  device_id: string;
  session_token: string;
  refresh_token?: string;
  expires_at: Date;
  refresh_expires_at?: Date;
  created_at: Date;
  last_activity: Date;
  ip_address?: string;
  user_agent?: string;
  is_active: boolean;
  revoked_at?: Date;
  revoked_reason?: string;
}

export interface AuthToken {
  id: string;
  user_id: string;
  token_type: 'password_reset' | 'email_verification' | 'two_factor' | 'api_key';
  token_hash: string;
  expires_at: Date;
  created_at: Date;
  used_at?: Date;
  metadata: Record<string, any>;
}

export interface UserPreference {
  id: string;
  user_id: string;
  preference_key: string;
  preference_value: any;
  device_specific: boolean;
  device_id?: string;
  created_at: Date;
  updated_at: Date;
}

export interface SecurityAuditLog {
  id: string;
  user_id?: string;
  device_id?: string;
  session_id?: string;
  event_type: string;
  event_details: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  success: boolean;
  created_at: Date;
  risk_score: number;
}

// Request/Response types for API endpoints
export interface CreateUserRequest {
  email: string;
  password: string;
  display_name?: string;
  preferences?: Record<string, any>;
}

export interface CreateUserResponse {
  user: Omit<User, 'password_hash'>;
  verification_token?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  device_name: string;
  device_type: Device['device_type'];
  device_fingerprint?: string;
  platform?: string;
  capabilities?: Record<string, any>;
}

export interface LoginResponse {
  user: Omit<User, 'password_hash'>;
  session: Omit<Session, 'refresh_token'>;
  access_token: string;
  refresh_token: string;
  device: Device;
}

export interface RefreshTokenRequest {
  refresh_token: string;
  device_id: string;
}

export interface RefreshTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: Date;
}

export interface RegisterDeviceRequest {
  user_id: string;
  device_name: string;
  device_type: Device['device_type'];
  platform?: string;
  device_fingerprint?: string;
  capabilities?: Record<string, any>;
  push_token?: string;
  app_version?: string;
  os_version?: string;
}

export interface RegisterDeviceResponse {
  device: Device;
  device_token: string;
}

export interface UpdateUserPreferencesRequest {
  preferences: Array<{
    key: string;
    value: any;
    device_specific?: boolean;
    device_id?: string;
  }>;
}

export interface SecurityEventRequest {
  event_type: string;
  event_details?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  risk_score?: number;
}

// Authentication middleware types
export interface AuthenticatedRequest {
  user: Omit<User, 'password_hash'>;
  session: Session;
  device: Device;
}

export interface JWTPayload {
  user_id: string;
  session_id: string;
  device_id: string;
  email: string;
  iat: number;
  exp: number;
}

// Database query types
export interface UserQueryOptions {
  include_deleted?: boolean;
  email_verified_only?: boolean;
  status?: User['status'][];
  created_after?: Date;
  created_before?: Date;
  last_login_after?: Date;
  last_login_before?: Date;
}

export interface DeviceQueryOptions {
  user_id?: string;
  device_type?: Device['device_type'][];
  status?: Device['status'][];
  last_seen_after?: Date;
  last_seen_before?: Date;
  platform?: string[];
}

export interface SessionQueryOptions {
  user_id?: string;
  device_id?: string;
  active_only?: boolean;
  expired_only?: boolean;
  created_after?: Date;
  created_before?: Date;
  last_activity_after?: Date;
  last_activity_before?: Date;
}

export interface SecurityAuditQueryOptions {
  user_id?: string;
  device_id?: string;
  event_type?: string[];
  success_only?: boolean;
  failed_only?: boolean;
  min_risk_score?: number;
  max_risk_score?: number;
  created_after?: Date;
  created_before?: Date;
  ip_address?: string;
}

// Validation schemas
export interface UserValidationRules {
  email: {
    required: true;
    format: 'email';
    max_length: 255;
  };
  password: {
    required: true;
    min_length: 8;
    max_length: 128;
    require_uppercase: boolean;
    require_lowercase: boolean;
    require_numbers: boolean;
    require_special_chars: boolean;
  };
  display_name: {
    max_length: 100;
    allow_unicode: boolean;
  };
}

export interface DeviceValidationRules {
  device_name: {
    required: true;
    max_length: 100;
  };
  device_type: {
    required: true;
    allowed_values: Device['device_type'][];
  };
  device_fingerprint: {
    max_length: 255;
    format: 'alphanumeric';
  };
}

// Error types
export interface AuthError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
  value?: any;
}

// Configuration types
export interface AuthConfig {
  jwt: {
    secret: string;
    access_token_expiry: number; // seconds
    refresh_token_expiry: number; // seconds
  };
  password: {
    min_length: number;
    max_length: number;
    require_uppercase: boolean;
    require_lowercase: boolean;
    require_numbers: boolean;
    require_special_chars: boolean;
    bcrypt_rounds: number;
  };
  session: {
    max_concurrent_sessions: number;
    cleanup_interval: number; // seconds
    extend_on_activity: boolean;
  };
  security: {
    max_login_attempts: number;
    lockout_duration: number; // seconds
    require_email_verification: boolean;
    enable_two_factor: boolean;
    max_devices_per_user: number;
  };
  audit: {
    log_all_events: boolean;
    retention_days: number;
    high_risk_threshold: number;
  };
}

// Service interface types
export interface AuthService {
  // User management
  createUser(data: CreateUserRequest): Promise<CreateUserResponse>;
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
  deleteUser(id: string): Promise<boolean>;
  verifyEmail(token: string): Promise<boolean>;

  // Authentication
  login(data: LoginRequest): Promise<LoginResponse>;
  logout(session_id: string): Promise<boolean>;
  refreshToken(data: RefreshTokenRequest): Promise<RefreshTokenResponse>;
  validateSession(token: string): Promise<AuthenticatedRequest | null>;

  // Device management
  registerDevice(data: RegisterDeviceRequest): Promise<RegisterDeviceResponse>;
  getDevicesByUser(user_id: string): Promise<Device[]>;
  updateDevice(id: string, data: Partial<Device>): Promise<Device>;
  revokeDevice(id: string): Promise<boolean>;

  // Preferences
  getUserPreferences(user_id: string, device_id?: string): Promise<UserPreference[]>;
  updateUserPreferences(
    user_id: string,
    data: UpdateUserPreferencesRequest
  ): Promise<UserPreference[]>;

  // Security
  logSecurityEvent(
    user_id: string,
    device_id: string,
    session_id: string,
    data: SecurityEventRequest
  ): Promise<string>;
  getSecurityAuditLog(options: SecurityAuditQueryOptions): Promise<SecurityAuditLog[]>;

  // Maintenance
  cleanupExpiredSessions(): Promise<number>;
  cleanupExpiredTokens(): Promise<number>;
}
