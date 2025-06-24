/**
 * Mobile-Optimized Message Format for TASK-005.1.1
 *
 * This module defines TypeScript interfaces for mobile-optimized communication
 * between handheld devices and the VS Code extension via the CCS.
 */

// Protocol versioning for backward compatibility
export const MOBILE_PROTOCOL_VERSION = '1.0.0';

// Device types supported by the mobile protocol
export type DeviceType = 'mobile' | 'desktop' | 'web' | 'tablet';

// Message priorities for mobile optimization
export type MessagePriority = 'critical' | 'high' | 'normal' | 'low';

// Compression algorithms supported
export type CompressionType = 'gzip' | 'brotli' | 'none';

// Message targets for routing
export type MessageTarget = 'extension' | 'device' | 'broadcast' | 'cloud';

// Connection states for mobile devices
export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'suspended';

// Network types for mobile optimization
export type NetworkType = 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown';

// Backoff strategies for reconnection
export type BackoffStrategy = 'exponential' | 'linear' | 'fixed';

/**
 * Device identification and capabilities
 */
export interface DeviceInfo {
  deviceId: string;
  userId: string;
  deviceType: DeviceType;
  platform: string; // 'ios', 'android', 'macos', 'windows', 'linux', 'web'
  version: string;
  capabilities: {
    compression: CompressionType[];
    maxMessageSize: number;
    supportsBatching: boolean;
    supportsOfflineQueue: boolean;
    batteryOptimized: boolean;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Message source information
 */
export interface MessageSource {
  deviceId: string;
  userId: string;
  deviceType: DeviceType;
  sessionId?: string;
  timestamp: number;
}

/**
 * Message destination information
 */
export interface MessageDestination {
  target: MessageTarget;
  deviceId?: string;
  userId?: string;
  sessionId?: string;
  broadcast?: {
    scope: 'user' | 'device_type' | 'all';
    filter?: Record<string, unknown>;
  };
}

/**
 * Mobile optimization metadata
 */
export interface MobileOptimization {
  priority: MessagePriority;
  ttl?: number; // Time to live in milliseconds
  compression?: CompressionType;
  batchId?: string;
  retryCount?: number;
  maxRetries?: number;
  requiresAck?: boolean;
  offlineCapable?: boolean;
}

/**
 * Core mobile message interface
 */
export interface MobileMessage {
  // Message identification
  id: string;
  correlationId?: string;
  timestamp: number;
  protocolVersion: string;

  // Routing information
  source: MessageSource;
  destination: MessageDestination;

  // Message content
  type: string;
  payload: unknown;

  // Mobile optimization
  optimization: MobileOptimization;

  // Validation and integrity
  checksum?: string;
  signature?: string;
}

/**
 * Batch message container for efficiency
 */
export interface BatchMessage {
  id: string;
  timestamp: number;
  compression?: CompressionType;
  messages: MobileMessage[];
  metadata: {
    totalSize: number;
    messageCount: number;
    priority: MessagePriority;
    ttl?: number;
  };
}

/**
 * Message acknowledgment
 */
export interface MessageAck {
  messageId: string;
  batchId?: string;
  status: 'received' | 'processed' | 'failed' | 'expired';
  timestamp: number;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Connection management interfaces
 */
export interface ConnectionConfig {
  maxAttempts: number;
  backoffStrategy: BackoffStrategy;
  baseDelay: number;
  maxDelay: number;
  jitter: boolean;
  timeout: number;
}

export interface NetworkMonitor {
  connectionType: NetworkType;
  isOnline: boolean;
  bandwidth?: number; // Estimated bandwidth in kbps
  latency?: number; // Estimated latency in ms
  quality: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface ConnectionManager {
  state: ConnectionState;
  deviceInfo: DeviceInfo;
  reconnect: ConnectionConfig;
  networkMonitor: NetworkMonitor;
  lastHeartbeat?: number;
  connectionId: string;
  sessionStartTime: number;
  metrics: {
    messagesReceived: number;
    messagesSent: number;
    reconnectCount: number;
    totalUptime: number;
    averageLatency: number;
  };
}

/**
 * Message queue interfaces for offline support
 */
export interface QueuedMessage {
  message: MobileMessage;
  queuedAt: number;
  attempts: number;
  nextRetry?: number;
  priority: MessagePriority;
}

export interface MessageQueue {
  deviceId: string;
  userId: string;
  messages: QueuedMessage[];
  maxSize: number;
  totalSize: number;
  oldestMessage?: number;
  newestMessage?: number;
}

/**
 * Protocol versioning and compatibility
 */
export interface ProtocolVersion {
  version: string;
  supportedFeatures: string[];
  deprecatedFeatures: string[];
  minimumClientVersion: string;
  maximumClientVersion?: string;
}

export interface CompatibilityCheck {
  clientVersion: string;
  serverVersion: string;
  compatible: boolean;
  warnings: string[];
  requiredUpgrades: string[];
}

/**
 * Message validation schemas
 */
export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: unknown[];
}

export interface ValidationSchema {
  messageType: string;
  version: string;
  rules: ValidationRule[];
}

export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    field: string;
    message: string;
    value?: unknown;
  }>;
  warnings: Array<{
    field: string;
    message: string;
    value?: unknown;
  }>;
}

/**
 * Performance monitoring interfaces
 */
export interface PerformanceMetrics {
  messageLatency: {
    average: number;
    p50: number;
    p95: number;
    p99: number;
  };
  throughput: {
    messagesPerSecond: number;
    bytesPerSecond: number;
  };
  compression: {
    ratio: number;
    savings: number; // Bytes saved
  };
  battery: {
    usagePerHour: number; // Percentage
    efficiency: number; // Messages per mAh
  };
  network: {
    requestCount: number;
    dataUsage: number; // Bytes
    efficiency: number; // Reduction percentage
  };
}

/**
 * Error handling for mobile scenarios
 */
export class MobileProtocolError extends Error {
  public readonly code: string;
  public readonly deviceId?: string;
  public readonly messageId?: string;
  public readonly retryable: boolean;

  constructor(
    message: string,
    code: string,
    retryable: boolean = true,
    deviceId?: string,
    messageId?: string
  ) {
    super(message);
    this.name = 'MobileProtocolError';
    this.code = code;
    this.retryable = retryable;
    if (deviceId !== undefined) {
      this.deviceId = deviceId;
    }
    if (messageId !== undefined) {
      this.messageId = messageId;
    }
  }
}

export class CompressionError extends MobileProtocolError {
  constructor(message: string, algorithm: CompressionType) {
    super(`Compression failed with ${algorithm}: ${message}`, 'COMPRESSION_ERROR', false);
  }
}

export class ValidationError extends MobileProtocolError {
  public readonly validationErrors: ValidationResult['errors'];

  constructor(message: string, errors: ValidationResult['errors']) {
    super(message, 'VALIDATION_ERROR', false);
    this.validationErrors = errors;
  }
}

export class NetworkError extends MobileProtocolError {
  public readonly networkType: NetworkType;

  constructor(message: string, networkType: NetworkType, retryable: boolean = true) {
    super(message, 'NETWORK_ERROR', retryable);
    this.networkType = networkType;
  }
}

export class QueueOverflowError extends MobileProtocolError {
  public readonly queueSize: number;
  public readonly maxSize: number;

  constructor(queueSize: number, maxSize: number) {
    super(`Message queue overflow: ${queueSize}/${maxSize}`, 'QUEUE_OVERFLOW', false);
    this.queueSize = queueSize;
    this.maxSize = maxSize;
  }
}

/**
 * Utility types for mobile message handling
 */
export type MessageHandler<T = unknown> = (
  message: MobileMessage & { payload: T }
) => Promise<void>;

export type MessageFilter = (message: MobileMessage) => boolean;

export type MessageTransformer = (message: MobileMessage) => MobileMessage;

export interface MessageMiddleware {
  name: string;
  priority: number;
  handler: (message: MobileMessage, next: () => Promise<void>) => Promise<void>;
}

/**
 * Configuration interfaces
 */
export interface MobileProtocolConfig {
  version: string;
  compression: {
    enabled: boolean;
    algorithms: CompressionType[];
    threshold: number; // Minimum message size to compress
    level: number; // Compression level (1-9)
  };
  batching: {
    enabled: boolean;
    maxSize: number; // Maximum messages per batch
    maxWait: number; // Maximum wait time in ms
    priorityThreshold: MessagePriority; // Don't batch above this priority
  };
  queue: {
    maxSize: number;
    maxAge: number; // Maximum age in ms
    persistToDisk: boolean;
    retryPolicy: {
      maxAttempts: number;
      backoffMultiplier: number;
      maxDelay: number;
    };
  };
  heartbeat: {
    interval: number; // Heartbeat interval in ms
    timeout: number; // Heartbeat timeout in ms
    maxMissed: number; // Maximum missed heartbeats before disconnect
  };
  performance: {
    metricsEnabled: boolean;
    samplingRate: number; // Percentage of messages to sample
    historySize: number; // Number of metrics to keep in memory
  };
}

/**
 * Default configuration values
 */
export const DEFAULT_MOBILE_CONFIG: MobileProtocolConfig = {
  version: MOBILE_PROTOCOL_VERSION,
  compression: {
    enabled: true,
    algorithms: ['gzip', 'brotli'],
    threshold: 1024, // 1KB
    level: 6,
  },
  batching: {
    enabled: true,
    maxSize: 10,
    maxWait: 100, // 100ms
    priorityThreshold: 'high',
  },
  queue: {
    maxSize: 1000,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    persistToDisk: true,
    retryPolicy: {
      maxAttempts: 3,
      backoffMultiplier: 2,
      maxDelay: 30000, // 30 seconds
    },
  },
  heartbeat: {
    interval: 30000, // 30 seconds
    timeout: 10000, // 10 seconds
    maxMissed: 3,
  },
  performance: {
    metricsEnabled: true,
    samplingRate: 10, // 10%
    historySize: 1000,
  },
};
