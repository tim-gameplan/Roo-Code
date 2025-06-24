/**
 * Device Relay System Type Definitions
 * Types for managing multi-device coordination, discovery, and handoff
 */

import { DeviceInfo, DeviceCapabilities, CloudMessage, MessagePriority } from './rccs';

// Device Topology and Coordination
export interface DeviceTopology {
  userId: string;
  devices: Map<string, DeviceNode>;
  primaryDevice?: string;
  lastUpdated: Date;
  version: number;
}

export interface DeviceNode {
  deviceInfo: DeviceInfo;
  connections: DeviceConnection[];
  priority: number;
  role: DeviceRole;
  capabilities: DeviceCapabilities;
  performance: DevicePerformance;
  lastActivity: Date;
  isReachable: boolean;
}

export enum DeviceRole {
  PRIMARY = 'primary',
  SECONDARY = 'secondary',
  BACKUP = 'backup',
  OBSERVER = 'observer',
}

export interface DeviceConnection {
  connectionId: string;
  quality: ConnectionQuality;
  latency: number;
  bandwidth: number;
  reliability: number;
  lastPing: Date;
  isActive: boolean;
}

export enum ConnectionQuality {
  EXCELLENT = 'excellent',
  GOOD = 'good',
  FAIR = 'fair',
  POOR = 'poor',
  UNSTABLE = 'unstable',
}

export interface DevicePerformance {
  cpuUsage: number;
  memoryUsage: number;
  batteryLevel?: number;
  networkStrength: number;
  responseTime: number;
  throughput: number;
  lastMeasured: Date;
}

// Device Discovery
export interface DeviceDiscoveryRequest {
  userId: string;
  requestingDeviceId: string;
  discoveryType: DiscoveryType;
  timeout: number;
  filters?: DeviceFilter[];
}

export enum DiscoveryType {
  FULL_SCAN = 'full_scan',
  CAPABILITY_MATCH = 'capability_match',
  PROXIMITY_BASED = 'proximity_based',
  PERFORMANCE_BASED = 'performance_based',
}

export interface DeviceFilter {
  type: FilterType;
  value: any;
  operator: FilterOperator;
}

export enum FilterType {
  DEVICE_TYPE = 'device_type',
  PLATFORM = 'platform',
  CAPABILITY = 'capability',
  PERFORMANCE = 'performance',
  LOCATION = 'location',
  BATTERY_LEVEL = 'battery_level',
}

export enum FilterOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  CONTAINS = 'contains',
  IN = 'in',
}

export interface DeviceDiscoveryResult {
  requestId: string;
  discoveredDevices: DiscoveredDevice[];
  totalFound: number;
  discoveryTime: number;
  completedAt: Date;
  errors?: DiscoveryError[];
}

export interface DiscoveredDevice {
  deviceInfo: DeviceInfo;
  matchScore: number;
  distance?: number;
  capabilities: DeviceCapabilities;
  performance: DevicePerformance;
  availability: DeviceAvailability;
}

export enum DeviceAvailability {
  AVAILABLE = 'available',
  BUSY = 'busy',
  IDLE = 'idle',
  DO_NOT_DISTURB = 'do_not_disturb',
  OFFLINE = 'offline',
}

export interface DiscoveryError {
  deviceId: string;
  error: string;
  code: string;
  timestamp: Date;
}

// Device Handoff
export interface HandoffRequest {
  id: string;
  userId: string;
  fromDeviceId: string;
  toDeviceId: string;
  handoffType: HandoffType;
  context: HandoffContext;
  priority: MessagePriority;
  timeout: number;
  createdAt: Date;
}

export enum HandoffType {
  MANUAL = 'manual',
  AUTOMATIC = 'automatic',
  FAILOVER = 'failover',
  LOAD_BALANCE = 'load_balance',
  CAPABILITY_BASED = 'capability_based',
}

export interface HandoffContext {
  sessionId?: string;
  conversationId?: string;
  taskId?: string;
  state: any;
  metadata: {
    reason: string;
    preserveState: boolean;
    transferFiles: boolean;
    notifyUser: boolean;
    [key: string]: any;
  };
}

export interface HandoffResult {
  requestId: string;
  success: boolean;
  fromDeviceId: string;
  toDeviceId: string;
  handoffTime: number;
  completedAt: Date;
  stateTransferred: boolean;
  error?: HandoffError;
}

export interface HandoffError {
  code: string;
  message: string;
  details?: any;
  recoverable: boolean;
}

// Capability Negotiation
export interface CapabilityNegotiation {
  id: string;
  userId: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  context: CapabilityNegotiationContext;
  createdAt: Date;
  expiresAt: Date;
}

export interface CapabilityNegotiationContext {
  requiresFileSync: boolean;
  requiresRealTimeComm: boolean;
  requiresVideoStreaming: boolean;
  requiresVoiceCommands: boolean;
  [key: string]: any;
}

export interface CapabilityRequirement {
  capability: string;
  required: boolean;
  minVersion: string;
  priority: 'high' | 'medium' | 'low';
}

export interface CapabilityMatch {
  capability: string;
  sourceSupported: boolean;
  targetSupported: boolean;
  compatible: boolean;
  limitations: string[];
}

export interface CapabilityScore {
  overall: number;
  fileSync: number;
  communication: number;
  performance: number;
  security: number;
}

export enum NegotiationStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  ERROR = 'error',
}

export interface RequiredCapability {
  name: string;
  minVersion?: string;
  parameters?: { [key: string]: any };
}

export interface OptionalCapability {
  name: string;
  weight: number;
  fallback?: string;
  parameters?: { [key: string]: any };
}

export interface NegotiationConstraint {
  type: ConstraintType;
  value: any;
  priority: number;
}

export enum ConstraintType {
  PERFORMANCE = 'performance',
  BATTERY = 'battery',
  NETWORK = 'network',
  LOCATION = 'location',
  COST = 'cost',
  SECURITY = 'security',
}

export interface NegotiationResult {
  negotiationId: string;
  status: NegotiationStatus;
  compatibilityScore: CapabilityScore;
  matches: CapabilityMatch[];
  recommendations: string[];
  negotiationTime: number;
  completedAt: Date;
  error?: string;
}

export interface AlternativeOption {
  deviceId: string;
  score: number;
  missingCapabilities: string[];
  reasoning: string;
}

// Device Relay Messages
export interface DeviceRelayMessage extends CloudMessage {
  relayType: RelayMessageType;
  routingInfo: RoutingInfo;
  deliveryOptions: DeliveryOptions;
}

export enum RelayMessageType {
  DISCOVERY_REQUEST = 'discovery_request',
  DISCOVERY_RESPONSE = 'discovery_response',
  HANDOFF_REQUEST = 'handoff_request',
  HANDOFF_RESPONSE = 'handoff_response',
  CAPABILITY_QUERY = 'capability_query',
  CAPABILITY_RESPONSE = 'capability_response',
  TOPOLOGY_UPDATE = 'topology_update',
  PERFORMANCE_UPDATE = 'performance_update',
  STATUS_SYNC = 'status_sync',
}

export interface RoutingInfo {
  preferredPath?: string[];
  fallbackDevices?: string[];
  routingStrategy: RoutingStrategy;
  maxHops: number;
  ttl: number;
}

export enum RoutingStrategy {
  DIRECT = 'direct',
  SHORTEST_PATH = 'shortest_path',
  BEST_PERFORMANCE = 'best_performance',
  LOAD_BALANCED = 'load_balanced',
  REDUNDANT = 'redundant',
}

export interface DeliveryOptions {
  requiresAck: boolean;
  timeout: number;
  retryCount: number;
  retryDelay: number;
  fallbackToAny: boolean;
  preserveOrder: boolean;
}

// Device Relay Events
export interface DeviceRelayEvents {
  'device:discovered': (device: DiscoveredDevice, requestId: string) => void;
  'device:lost': (deviceId: string, reason: string) => void;
  'handoff:initiated': (request: HandoffRequest) => void;
  'handoff:completed': (result: HandoffResult) => void;
  'handoff:failed': (request: HandoffRequest, error: HandoffError) => void;
  'topology:updated': (topology: DeviceTopology) => void;
  'capability:negotiated': (result: NegotiationResult) => void;
  'performance:updated': (deviceId: string, performance: DevicePerformance) => void;
  'relay:message:routed': (message: DeviceRelayMessage, path: string[]) => void;
  'relay:message:failed': (message: DeviceRelayMessage, error: Error) => void;
}

// Configuration
export interface DeviceRelayConfig {
  discovery: {
    timeout: number;
    maxDevices: number;
    scanInterval: number;
    cacheTimeout: number;
  };
  handoff: {
    timeout: number;
    maxRetries: number;
    stateTransferTimeout: number;
    fallbackEnabled: boolean;
  };
  capability: {
    negotiationTimeout: number;
    cacheTimeout: number;
    autoNegotiate: boolean;
  };
  performance: {
    monitoringInterval: number;
    thresholds: {
      cpu: number;
      memory: number;
      battery: number;
      network: number;
    };
  };
  routing: {
    maxHops: number;
    defaultTtl: number;
    loadBalanceThreshold: number;
  };
}

// Metrics and Monitoring
export interface DeviceRelayMetrics {
  totalDevices: number;
  activeDevices: number;
  discoveryRequests: number;
  successfulDiscoveries: number;
  handoffRequests: number;
  successfulHandoffs: number;
  averageHandoffTime: number;
  capabilityNegotiations: number;
  routedMessages: number;
  failedRoutes: number;
  averageLatency: number;
  lastUpdated: Date;
}

// Error Types
export class DeviceRelayError extends Error {
  constructor(
    message: string,
    public code: string,
    public deviceId?: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'DeviceRelayError';
  }
}

export class DeviceDiscoveryError extends DeviceRelayError {
  constructor(message: string, deviceId?: string) {
    super(message, 'DISCOVERY_ERROR', deviceId, 404);
  }
}

export class HandoffFailedError extends DeviceRelayError {
  constructor(message: string, fromDevice: string, toDevice: string) {
    super(message, 'HANDOFF_FAILED', fromDevice, 500);
    this.toDevice = toDevice;
  }
  public toDevice: string;
}

export class CapabilityMismatchError extends DeviceRelayError {
  constructor(message: string, deviceId: string, capability: string) {
    super(message, 'CAPABILITY_MISMATCH', deviceId, 400);
    this.capability = capability;
  }
  public capability: string;
}

export class RoutingFailedError extends DeviceRelayError {
  constructor(message: string, messageId: string) {
    super(message, 'ROUTING_FAILED', undefined, 500);
    this.messageId = messageId;
  }
  public messageId: string;
}
