/**
 * RCCS (Roo Cloud Coordination Service) Type Definitions
 * Core types for the cloud coordination service that handles cross-device communication
 */

export interface DeviceInfo {
  id: string;
  userId: string;
  type: 'mobile' | 'desktop' | 'extension';
  platform: string;
  version: string;
  capabilities: DeviceCapabilities;
  lastSeen: Date;
  status: 'online' | 'offline' | 'away';
  connectionId?: string;
}

export interface DeviceCapabilities {
  supportsFileSync: boolean;
  supportsVoiceCommands: boolean;
  supportsVideoStreaming: boolean;
  supportsNotifications: boolean;
  maxFileSize: number;
  supportedFormats: string[];
}

export interface DeviceRegistration {
  deviceType: 'mobile' | 'desktop' | 'extension';
  platform: string;
  version: string;
  capabilities: DeviceCapabilities;
  authToken: string;
}

export interface Session {
  id: string;
  userId: string;
  deviceId: string;
  deviceInfo: DeviceInfo;
  connectionId: string;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  isActive: boolean;
  metadata: {
    userAgent: string;
    ipAddress: string;
    platform: string;
    [key: string]: any;
  };
}

export interface CloudMessage {
  id: string;
  type: CloudMessageType;
  fromDeviceId: string;
  toDeviceId?: string;
  userId: string;
  payload: any;
  timestamp: Date;
  priority: MessagePriority;
  requiresAck: boolean;
  retryCount?: number;
}

export enum CloudMessageType {
  // User messages
  USER_MESSAGE = 'user_message',
  USER_RESPONSE = 'user_response',

  // Task control
  TASK_START = 'task_start',
  TASK_PAUSE = 'task_pause',
  TASK_RESUME = 'task_resume',
  TASK_CANCEL = 'task_cancel',
  TASK_STATUS = 'task_status',

  // File operations
  FILE_UPLOAD = 'file_upload',
  FILE_DOWNLOAD = 'file_download',
  FILE_SYNC = 'file_sync',
  FILE_DELETE = 'file_delete',

  // Device coordination
  DEVICE_REGISTER = 'device_register',
  DEVICE_UNREGISTER = 'device_unregister',
  DEVICE_STATUS = 'device_status',
  DEVICE_HANDOFF = 'device_handoff',

  // System messages
  HEARTBEAT = 'heartbeat',
  ACK = 'ack',
  ERROR = 'error',
  NOTIFICATION = 'notification',
}

export enum MessagePriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

export interface ConnectionInfo {
  id: string;
  deviceId: string;
  userId: string;
  sessionId: string;
  connectedAt: Date;
  lastPing: Date;
  isAuthenticated: boolean;
  socket: any; // WebSocket instance
}

export interface RCCSConfig {
  port: number;
  maxConnections: number;
  heartbeatInterval: number;
  sessionTimeout: number;
  messageTimeout: number;
  retryAttempts: number;
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  database: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  };
}

export interface HealthMetrics {
  activeConnections: number;
  totalMessages: number;
  messagesPerSecond: number;
  averageLatency: number;
  errorRate: number;
  memoryUsage: number;
  cpuUsage: number;
  uptime: number;
  lastUpdated: Date;
}

export interface MessageRouteResult {
  success: boolean;
  messageId: string;
  deliveredAt?: Date;
  error?: string;
  retryAfter?: number;
}

export interface DeviceRegistryEntry {
  deviceInfo: DeviceInfo;
  sessions: Session[];
  lastActivity: Date;
  isOnline: boolean;
}

// Error types
export class RCCSError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'RCCSError';
  }
}

export class AuthenticationError extends RCCSError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTH_ERROR', 401);
  }
}

export class DeviceNotFoundError extends RCCSError {
  constructor(deviceId: string) {
    super(`Device not found: ${deviceId}`, 'DEVICE_NOT_FOUND', 404);
  }
}

export class SessionExpiredError extends RCCSError {
  constructor(sessionId: string) {
    super(`Session expired: ${sessionId}`, 'SESSION_EXPIRED', 401);
  }
}

export class MessageDeliveryError extends RCCSError {
  constructor(messageId: string, reason: string) {
    super(`Message delivery failed: ${messageId} - ${reason}`, 'DELIVERY_ERROR', 500);
  }
}

// Event types for the RCCS system
export interface RCCSEvents {
  'device:connected': (deviceInfo: DeviceInfo, connectionInfo: ConnectionInfo) => void;
  'device:disconnected': (deviceId: string, reason: string) => void;
  'device:registered': (deviceInfo: DeviceInfo) => void;
  'device:unregistered': (deviceId: string) => void;
  'message:received': (message: CloudMessage, connectionInfo: ConnectionInfo) => void;
  'message:sent': (message: CloudMessage, result: MessageRouteResult) => void;
  'message:failed': (message: CloudMessage, error: Error) => void;
  'session:created': (session: Session) => void;
  'session:expired': (sessionId: string) => void;
  'health:updated': (metrics: HealthMetrics) => void;
  error: (error: Error, context?: any) => void;
}
