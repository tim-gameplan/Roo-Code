export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  refreshToken: string;
  expiresAt: Date;
  createdAt: Date;
  isActive: boolean;
  ipAddress?: string;
  userAgent?: string;
}

export interface ExtensionConnection {
  id: string;
  userId: string;
  socketPath: string;
  isConnected: boolean;
  lastHeartbeat: Date;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface Message {
  id: string;
  sessionId: string;
  type: MessageType;
  payload: Record<string, unknown>;
  timestamp: Date;
  status: MessageStatus;
  correlationId?: string;
}

export enum MessageType {
  SEND_MESSAGE = 'sendMessage',
  GET_STATUS = 'getStatus',
  HEARTBEAT = 'heartbeat',
  TASK_CREATED = 'taskCreated',
  TASK_COMPLETED = 'taskCompleted',
  ERROR = 'error',
}

export enum MessageStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}

export interface AuthTokenPayload {
  userId: string;
  sessionId: string;
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  userId: string;
  sessionId: string;
  tokenVersion: number;
  iat: number;
  exp: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
  requestId: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: Omit<User, 'passwordHash'>;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface SendMessageRequest {
  message: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

export interface SendMessageResponse {
  messageId: string;
  status: MessageStatus;
  timestamp: string;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  services: {
    database: 'connected' | 'disconnected' | 'error';
    redis: 'connected' | 'disconnected' | 'error';
    extension: 'connected' | 'disconnected' | 'error';
  };
  metrics: {
    activeConnections: number;
    totalMessages: number;
    errorRate: number;
    averageResponseTime: number;
  };
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  connectionTimeout?: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  database?: number;
  keyPrefix?: string;
  maxRetries?: number;
}

export interface ServerConfig {
  port: number;
  host: string;
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
  jwt: {
    secret: string;
    accessTokenExpiry: string;
    refreshTokenExpiry: string;
  };
  bcrypt: {
    saltRounds: number;
  };
}

export interface LoggerConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  format: 'json' | 'simple';
  file?: {
    enabled: boolean;
    filename: string;
    maxSize: string;
    maxFiles: number;
  };
  console: {
    enabled: boolean;
    colorize: boolean;
  };
}

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  server: ServerConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  logger: LoggerConfig;
  extensionSocket: {
    path: string;
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
  };
}

// WebSocket message types
export interface WSMessage {
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
  correlationId?: string;
}

export interface WSConnectionInfo {
  id: string;
  userId: string;
  connectedAt: Date;
  lastActivity: Date;
  isAuthenticated: boolean;
}

// Error types
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;

    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, 'VALIDATION_ERROR');
    if (details) {
      this.details = details;
    }
  }

  public readonly details?: Record<string, unknown>;
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND_ERROR');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

// Export mobile types and interfaces
export * from './mobile';
