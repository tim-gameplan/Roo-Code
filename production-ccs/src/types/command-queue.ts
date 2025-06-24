/**
 * Command Queue Management System Type Definitions
 *
 * Comprehensive TypeScript interfaces for distributed command processing,
 * intelligent routing, and cross-device coordination capabilities.
 *
 * @fileoverview Command Queue System Types
 * @version 1.0.0
 * @since 2025-06-24
 */

import { EventEmitter } from 'events';

// ============================================================================
// CORE COMMAND TYPES
// ============================================================================

/**
 * Command priority levels for queue management
 */
export enum CommandPriority {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
  CRITICAL = 3,
  EMERGENCY = 4,
}

/**
 * Command lifecycle states
 */
export enum CommandStatus {
  CREATED = 'created',
  QUEUED = 'queued',
  ROUTING = 'routing',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout',
  RETRYING = 'retrying',
}

/**
 * Command types for different operations
 */
export enum CommandType {
  // File operations
  FILE_SYNC = 'file_sync',
  FILE_UPLOAD = 'file_upload',
  FILE_DOWNLOAD = 'file_download',
  FILE_DELETE = 'file_delete',

  // Device operations
  DEVICE_HANDOFF = 'device_handoff',
  DEVICE_SYNC = 'device_sync',
  DEVICE_STATUS = 'device_status',

  // Communication operations
  MESSAGE_SEND = 'message_send',
  MESSAGE_BROADCAST = 'message_broadcast',
  NOTIFICATION_SEND = 'notification_send',

  // System operations
  SYSTEM_BACKUP = 'system_backup',
  SYSTEM_RESTORE = 'system_restore',
  SYSTEM_CLEANUP = 'system_cleanup',

  // Custom operations
  CUSTOM = 'custom',
}

/**
 * Command routing strategies
 */
export enum RoutingStrategy {
  DIRECT = 'direct', // Route to specific device
  BROADCAST = 'broadcast', // Route to all devices
  OPTIMAL = 'optimal', // Route to best available device
  FAILOVER = 'failover', // Route with failover chain
  LOAD_BALANCED = 'load_balanced', // Distribute across devices
  ROUND_ROBIN = 'round_robin', // Round-robin distribution
}

/**
 * Command execution modes
 */
export enum ExecutionMode {
  SYNCHRONOUS = 'synchronous', // Wait for completion
  ASYNCHRONOUS = 'asynchronous', // Fire and forget
  STREAMING = 'streaming', // Stream results
  BATCH = 'batch', // Batch execution
}

// ============================================================================
// COMMAND INTERFACES
// ============================================================================

/**
 * Core command interface
 */
export interface Command {
  /** Unique command identifier */
  id: string;

  /** Command type */
  type: CommandType;

  /** Command priority */
  priority: CommandPriority;

  /** Current command status */
  status: CommandStatus;

  /** User ID who created the command */
  userId: string;

  /** Source device ID */
  sourceDeviceId: string;

  /** Target device ID(s) */
  targetDeviceIds: string[];

  /** Command payload data */
  payload: Record<string, any>;

  /** Command metadata */
  metadata: CommandMetadata;

  /** Command configuration */
  config: CommandConfig;

  /** Command timestamps */
  timestamps: CommandTimestamps;

  /** Command dependencies */
  dependencies?: string[];

  /** Command tags for categorization */
  tags?: string[];
}

/**
 * Command metadata interface
 */
export interface CommandMetadata {
  /** Human-readable command description */
  description?: string;

  /** Command category */
  category?: string;

  /** Expected execution time in milliseconds */
  estimatedDuration?: number;

  /** Required device capabilities */
  requiredCapabilities?: string[];

  /** Resource requirements */
  resourceRequirements?: ResourceRequirements;

  /** Command context information */
  context?: Record<string, any>;

  /** User-defined metadata */
  userMetadata?: Record<string, any>;
}

/**
 * Command configuration interface
 */
export interface CommandConfig {
  /** Execution mode */
  executionMode: ExecutionMode;

  /** Routing strategy */
  routingStrategy: RoutingStrategy;

  /** Command timeout in milliseconds */
  timeout: number;

  /** Maximum retry attempts */
  maxRetries: number;

  /** Retry delay in milliseconds */
  retryDelay: number;

  /** Whether to use exponential backoff */
  exponentialBackoff: boolean;

  /** Whether command can be cancelled */
  cancellable: boolean;

  /** Whether to persist command history */
  persistent: boolean;

  /** Whether to notify on completion */
  notifyOnCompletion: boolean;

  /** Custom configuration options */
  customConfig?: Record<string, any>;
}

/**
 * Command timestamps interface
 */
export interface CommandTimestamps {
  /** Command creation time */
  createdAt: Date;

  /** Command queue time */
  queuedAt?: Date;

  /** Command routing start time */
  routingStartedAt?: Date;

  /** Command execution start time */
  executionStartedAt?: Date;

  /** Command completion time */
  completedAt?: Date;

  /** Last update time */
  updatedAt: Date;

  /** Command expiration time */
  expiresAt?: Date;
}

/**
 * Resource requirements interface
 */
export interface ResourceRequirements {
  /** CPU usage percentage (0-100) */
  cpu?: number;

  /** Memory usage in MB */
  memory?: number;

  /** Storage usage in MB */
  storage?: number;

  /** Network bandwidth in Mbps */
  bandwidth?: number;

  /** Battery level requirement (0-100) */
  battery?: number;

  /** Custom resource requirements */
  custom?: Record<string, number>;
}

// ============================================================================
// COMMAND RESULT TYPES
// ============================================================================

/**
 * Command execution result
 */
export interface CommandResult {
  /** Command ID */
  commandId: string;

  /** Execution status */
  status: CommandStatus;

  /** Result data */
  data?: any;

  /** Error information if failed */
  error?: CommandError;

  /** Execution metrics */
  metrics: ExecutionMetrics;

  /** Device that executed the command */
  executedBy: string;

  /** Execution timestamps */
  timestamps: {
    startedAt: Date;
    completedAt: Date;
    duration: number;
  };

  /** Additional result metadata */
  metadata?: Record<string, any>;
}

/**
 * Aggregated command result for batch operations
 */
export interface AggregatedResult {
  /** Batch ID */
  batchId: string;

  /** Individual command results */
  results: CommandResult[];

  /** Overall batch status */
  status: CommandStatus;

  /** Aggregated metrics */
  aggregatedMetrics: AggregatedMetrics;

  /** Batch execution summary */
  summary: {
    total: number;
    successful: number;
    failed: number;
    cancelled: number;
  };

  /** Batch timestamps */
  timestamps: {
    startedAt: Date;
    completedAt: Date;
    totalDuration: number;
  };
}

/**
 * Command error interface
 */
export interface CommandError {
  /** Error code */
  code: string;

  /** Error message */
  message: string;

  /** Error details */
  details?: Record<string, any>;

  /** Error stack trace */
  stack?: string;

  /** Retry information */
  retryInfo?: {
    attempt: number;
    maxAttempts: number;
    nextRetryAt?: Date;
  };

  /** Device that encountered the error */
  deviceId?: string;

  /** Error timestamp */
  timestamp: Date;
}

// ============================================================================
// QUEUE MANAGEMENT TYPES
// ============================================================================

/**
 * Command queue interface
 */
export interface CommandQueue {
  /** Queue identifier */
  id: string;

  /** Queue name */
  name: string;

  /** User ID who owns the queue */
  userId: string;

  /** Queue configuration */
  config: QueueConfig;

  /** Queue statistics */
  stats: QueueStats;

  /** Queue status */
  status: QueueStatus;

  /** Queue timestamps */
  timestamps: {
    createdAt: Date;
    updatedAt: Date;
    lastProcessedAt?: Date;
  };
}

/**
 * Queue configuration interface
 */
export interface QueueConfig {
  /** Maximum queue size */
  maxSize: number;

  /** Queue processing mode */
  processingMode: 'fifo' | 'lifo' | 'priority';

  /** Whether queue is persistent */
  persistent: boolean;

  /** Queue timeout in milliseconds */
  timeout: number;

  /** Maximum concurrent executions */
  maxConcurrency: number;

  /** Queue priority */
  priority: CommandPriority;

  /** Auto-cleanup configuration */
  autoCleanup: {
    enabled: boolean;
    maxAge: number; // milliseconds
    maxCompletedCommands: number;
  };
}

/**
 * Queue statistics interface
 */
export interface QueueStats {
  /** Total commands processed */
  totalProcessed: number;

  /** Currently queued commands */
  queued: number;

  /** Currently executing commands */
  executing: number;

  /** Completed commands */
  completed: number;

  /** Failed commands */
  failed: number;

  /** Average processing time */
  averageProcessingTime: number;

  /** Queue throughput (commands/second) */
  throughput: number;

  /** Success rate percentage */
  successRate: number;
}

/**
 * Queue status enumeration
 */
export enum QueueStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  ERROR = 'error',
  MAINTENANCE = 'maintenance',
}

// ============================================================================
// ROUTING TYPES
// ============================================================================

/**
 * Command routing plan
 */
export interface RoutingPlan {
  /** Command ID */
  commandId: string;

  /** Selected routing strategy */
  strategy: RoutingStrategy;

  /** Primary target device */
  primaryTarget: string;

  /** Fallback devices */
  fallbackTargets: string[];

  /** Routing score */
  score: number;

  /** Estimated execution time */
  estimatedExecutionTime: number;

  /** Routing metadata */
  metadata: {
    deviceCapabilities: Record<string, any>;
    loadBalancing: LoadBalanceInfo;
    failoverChain: string[];
  };

  /** Routing timestamps */
  timestamps: {
    createdAt: Date;
    expiresAt: Date;
  };
}

/**
 * Device route information
 */
export interface DeviceRoute {
  /** Device ID */
  deviceId: string;

  /** Route priority */
  priority: number;

  /** Route score */
  score: number;

  /** Device capabilities */
  capabilities: Record<string, any>;

  /** Device performance metrics */
  performance: DevicePerformance;

  /** Route metadata */
  metadata: Record<string, any>;
}

/**
 * Load balance information
 */
export interface LoadBalanceInfo {
  /** Current device load */
  currentLoad: number;

  /** Target load distribution */
  targetLoad: number;

  /** Load balancing score */
  score: number;

  /** Load balancing strategy */
  strategy: string;
}

/**
 * Device performance metrics
 */
export interface DevicePerformance {
  /** CPU usage percentage */
  cpu: number;

  /** Memory usage percentage */
  memory: number;

  /** Network latency in milliseconds */
  latency: number;

  /** Battery level percentage */
  battery: number;

  /** Device availability score */
  availability: number;

  /** Performance score */
  score: number;
}

/**
 * Device load information
 */
export interface DeviceLoad {
  /** Device ID */
  deviceId: string;

  /** Current command count */
  commandCount: number;

  /** Resource utilization */
  resourceUtilization: ResourceRequirements;

  /** Load score */
  loadScore: number;

  /** Load capacity */
  capacity: number;

  /** Load timestamp */
  timestamp: Date;
}

// ============================================================================
// EXECUTION TYPES
// ============================================================================

/**
 * Command execution context
 */
export interface ExecutionContext {
  /** Command being executed */
  command: Command;

  /** Execution environment */
  environment: {
    deviceId: string;
    userId: string;
    sessionId: string;
  };

  /** Resource allocation */
  resources: ResourceAllocation;

  /** Execution configuration */
  config: ExecutionConfig;

  /** Execution state */
  state: Record<string, any>;

  /** Execution metadata */
  metadata: Record<string, any>;
}

/**
 * Resource allocation interface
 */
export interface ResourceAllocation {
  /** Allocation ID */
  id: string;

  /** Allocated resources */
  allocated: ResourceRequirements;

  /** Resource limits */
  limits: ResourceRequirements;

  /** Allocation status */
  status: 'allocated' | 'released' | 'exceeded';

  /** Allocation timestamps */
  timestamps: {
    allocatedAt: Date;
    releasedAt?: Date;
  };
}

/**
 * Execution configuration
 */
export interface ExecutionConfig {
  /** Execution timeout */
  timeout: number;

  /** Resource limits */
  resourceLimits: ResourceRequirements;

  /** Execution environment variables */
  environment: Record<string, string>;

  /** Execution options */
  options: Record<string, any>;
}

/**
 * Execution metrics
 */
export interface ExecutionMetrics {
  /** Execution duration in milliseconds */
  duration: number;

  /** Resource usage */
  resourceUsage: ResourceRequirements;

  /** Performance metrics */
  performance: {
    throughput: number;
    latency: number;
    errorRate: number;
  };

  /** Custom metrics */
  custom: Record<string, number>;
}

/**
 * Aggregated execution metrics
 */
export interface AggregatedMetrics {
  /** Total execution time */
  totalDuration: number;

  /** Average execution time */
  averageDuration: number;

  /** Total resource usage */
  totalResourceUsage: ResourceRequirements;

  /** Average resource usage */
  averageResourceUsage: ResourceRequirements;

  /** Performance statistics */
  performance: {
    totalThroughput: number;
    averageLatency: number;
    overallErrorRate: number;
  };
}

// ============================================================================
// COORDINATION TYPES
// ============================================================================

/**
 * Cross-device coordination plan
 */
export interface CoordinationPlan {
  /** Coordination ID */
  id: string;

  /** Command ID being coordinated */
  commandId: string;

  /** Participating devices */
  devices: string[];

  /** Coordination strategy */
  strategy: CoordinationStrategy;

  /** Synchronization points */
  syncPoints: SyncPoint[];

  /** Coordination status */
  status: CoordinationStatus;

  /** Coordination metadata */
  metadata: Record<string, any>;

  /** Coordination timestamps */
  timestamps: {
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
  };
}

/**
 * Coordination strategies
 */
export enum CoordinationStrategy {
  SEQUENTIAL = 'sequential', // Execute in sequence
  PARALLEL = 'parallel', // Execute in parallel
  PIPELINE = 'pipeline', // Pipeline execution
  CONSENSUS = 'consensus', // Require consensus
  LEADER_FOLLOWER = 'leader_follower', // Leader-follower pattern
}

/**
 * Coordination status
 */
export enum CoordinationStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Synchronization point
 */
export interface SyncPoint {
  /** Sync point ID */
  id: string;

  /** Sync point name */
  name: string;

  /** Required devices for sync */
  requiredDevices: string[];

  /** Sync condition */
  condition: SyncCondition;

  /** Sync timeout */
  timeout: number;

  /** Sync status */
  status: SyncStatus;

  /** Sync timestamp */
  timestamp?: Date;
}

/**
 * Sync condition interface
 */
export interface SyncCondition {
  /** Condition type */
  type: 'all' | 'any' | 'majority' | 'custom';

  /** Custom condition function */
  customCondition?: string;

  /** Condition parameters */
  parameters?: Record<string, any>;
}

/**
 * Sync status enumeration
 */
export enum SyncStatus {
  WAITING = 'waiting',
  READY = 'ready',
  COMPLETED = 'completed',
  TIMEOUT = 'timeout',
  FAILED = 'failed',
}

/**
 * Sync result interface
 */
export interface SyncResult {
  /** Sync point ID */
  syncPointId: string;

  /** Sync status */
  status: SyncStatus;

  /** Participating devices */
  devices: string[];

  /** Sync duration */
  duration: number;

  /** Sync metadata */
  metadata: Record<string, any>;

  /** Sync timestamp */
  timestamp: Date;
}

/**
 * Command conflict interface
 */
export interface CommandConflict {
  /** Conflict ID */
  id: string;

  /** Conflicting commands */
  commands: string[];

  /** Conflict type */
  type: ConflictType;

  /** Conflict description */
  description: string;

  /** Conflict severity */
  severity: ConflictSeverity;

  /** Conflict resolution strategy */
  resolutionStrategy?: ConflictResolutionStrategy;

  /** Conflict metadata */
  metadata: Record<string, any>;

  /** Conflict timestamp */
  timestamp: Date;
}

/**
 * Conflict types
 */
export enum ConflictType {
  RESOURCE = 'resource', // Resource conflict
  DEPENDENCY = 'dependency', // Dependency conflict
  PRIORITY = 'priority', // Priority conflict
  TIMING = 'timing', // Timing conflict
  DATA = 'data', // Data conflict
}

/**
 * Conflict severity levels
 */
export enum ConflictSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Conflict resolution strategies
 */
export enum ConflictResolutionStrategy {
  PRIORITY_BASED = 'priority_based',
  TIMESTAMP_BASED = 'timestamp_based',
  USER_INTERVENTION = 'user_intervention',
  AUTOMATIC_MERGE = 'automatic_merge',
  CANCEL_CONFLICTING = 'cancel_conflicting',
}

/**
 * Conflict resolution result
 */
export interface Resolution {
  /** Resolution ID */
  id: string;

  /** Conflict ID */
  conflictId: string;

  /** Resolution strategy used */
  strategy: ConflictResolutionStrategy;

  /** Resolution action */
  action: ResolutionAction;

  /** Resolution result */
  result: ResolutionResult;

  /** Resolution metadata */
  metadata: Record<string, any>;

  /** Resolution timestamp */
  timestamp: Date;
}

/**
 * Resolution actions
 */
export enum ResolutionAction {
  PROCEED = 'proceed',
  CANCEL = 'cancel',
  MERGE = 'merge',
  DEFER = 'defer',
  ESCALATE = 'escalate',
}

/**
 * Resolution results
 */
export enum ResolutionResult {
  SUCCESS = 'success',
  FAILURE = 'failure',
  PARTIAL = 'partial',
  PENDING = 'pending',
}

// ============================================================================
// DEPENDENCY TYPES
// ============================================================================

/**
 * Command dependency interface
 */
export interface CommandDependency {
  /** Dependency ID */
  id: string;

  /** Source command ID */
  sourceCommandId: string;

  /** Target command ID */
  targetCommandId: string;

  /** Dependency type */
  type: DependencyType;

  /** Dependency condition */
  condition: DependencyCondition;

  /** Dependency status */
  status: DependencyStatus;

  /** Dependency metadata */
  metadata: Record<string, any>;

  /** Dependency timestamps */
  timestamps: {
    createdAt: Date;
    resolvedAt?: Date;
  };
}

/**
 * Dependency types
 */
export enum DependencyType {
  SEQUENTIAL = 'sequential', // Must execute after
  PARALLEL = 'parallel', // Can execute in parallel
  CONDITIONAL = 'conditional', // Conditional dependency
  RESOURCE = 'resource', // Resource dependency
  DATA = 'data', // Data dependency
}

/**
 * Dependency condition
 */
export interface DependencyCondition {
  /** Condition type */
  type: 'completion' | 'success' | 'failure' | 'custom';

  /** Custom condition */
  customCondition?: string;

  /** Condition parameters */
  parameters?: Record<string, any>;
}

/**
 * Dependency status
 */
export enum DependencyStatus {
  PENDING = 'pending',
  SATISFIED = 'satisfied',
  VIOLATED = 'violated',
  TIMEOUT = 'timeout',
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/**
 * Command queue system configuration
 */
export interface CommandQueueSystemConfig {
  /** Queue configuration */
  queue: {
    defaultMaxSize: number;
    defaultTimeout: number;
    defaultMaxConcurrency: number;
    defaultProcessingMode: 'fifo' | 'lifo' | 'priority';
    autoCleanupEnabled: boolean;
    autoCleanupInterval: number;
  };

  /** Routing configuration */
  routing: {
    defaultStrategy: RoutingStrategy;
    maxRoutingTime: number;
    loadBalanceThreshold: number;
    failoverEnabled: boolean;
    routingCacheTimeout: number;
  };

  /** Execution configuration */
  execution: {
    defaultTimeout: number;
    maxRetries: number;
    retryDelay: number;
    exponentialBackoffEnabled: boolean;
    maxConcurrentExecutions: number;
    resourceMonitoringEnabled: boolean;
  };

  /** Coordination configuration */
  coordination: {
    defaultStrategy: CoordinationStrategy;
    syncTimeout: number;
    conflictResolutionEnabled: boolean;
    automaticConflictResolution: boolean;
  };

  /** Performance configuration */
  performance: {
    metricsEnabled: boolean;
    metricsInterval: number;
    performanceThresholds: {
      queueProcessing: number;
      routing: number;
      execution: number;
      coordination: number;
    };
  };

  /** Integration configuration */
  integration: {
    deviceRelayEnabled: boolean;
    websocketEnabled: boolean;
    databaseEnabled: boolean;
    authenticationEnabled: boolean;
  };
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Command queue events
 */
export interface CommandQueueEvents {
  // Command lifecycle events
  'command:created': (command: Command) => void;
  'command:queued': (command: Command) => void;
  'command:routing': (command: Command) => void;
  'command:executing': (command: Command) => void;
  'command:completed': (command: Command, result: CommandResult) => void;
  'command:failed': (command: Command, error: CommandError) => void;
  'command:cancelled': (command: Command) => void;
  'command:timeout': (command: Command) => void;
  'command:retrying': (command: Command, attempt: number) => void;

  // Queue events
  'queue:created': (queue: CommandQueue) => void;
  'queue:started': (queue: CommandQueue) => void;
  'queue:paused': (queue: CommandQueue) => void;
  'queue:stopped': (queue: CommandQueue) => void;
  'queue:error': (queue: CommandQueue, error: Error) => void;

  // Routing events
  'routing:started': (command: Command) => void;
  'routing:completed': (command: Command, plan: RoutingPlan) => void;
  'routing:failed': (command: Command, error: Error) => void;

  // Execution events
  'execution:started': (command: Command, context: ExecutionContext) => void;
  'execution:progress': (command: Command, progress: number) => void;
  'execution:completed': (command: Command, result: CommandResult) => void;
  'execution:failed': (command: Command, error: CommandError) => void;

  // Coordination events
  'coordination:started': (plan: CoordinationPlan) => void;
  'coordination:sync': (syncPoint: SyncPoint, result: SyncResult) => void;
  'coordination:conflict': (conflict: CommandConflict) => void;
  'coordination:resolved': (conflict: CommandConflict, resolution: Resolution) => void;
  'coordination:completed': (plan: CoordinationPlan) => void;

  // Performance events
  'performance:metrics': (metrics: PerformanceMetrics) => void;
  'performance:threshold': (metric: string, value: number, threshold: number) => void;
}

/**
 * Performance metrics interface
 */
export interface PerformanceMetrics {
  /** Queue metrics */
  queue: {
    totalCommands: number;
    queuedCommands: number;
    executingCommands: number;
    completedCommands: number;
    failedCommands: number;
    averageQueueTime: number;
    throughput: number;
  };

  /** Routing metrics */
  routing: {
    averageRoutingTime: number;
    routingSuccessRate: number;
    loadBalanceEfficiency: number;
  };

  /** Execution metrics */
  execution: {
    averageExecutionTime: number;
    executionSuccessRate: number;
    resourceUtilization: ResourceRequirements;
  };

  /** Coordination metrics */
  coordination: {
    averageCoordinationTime: number;
    syncSuccessRate: number;
    conflictRate: number;
    resolutionSuccessRate: number;
  };

  /** System metrics */
  system: {
    memoryUsage: number;
    cpuUsage: number;
    networkLatency: number;
    errorRate: number;
  };

  /** Timestamp */
  timestamp: Date;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Command queue service interface
 */
export interface ICommandQueueService extends EventEmitter {
  // Queue management
  createQueue(config: Partial<QueueConfig>): Promise<CommandQueue>;
  deleteQueue(queueId: string): Promise<void>;
  getQueue(queueId: string): Promise<CommandQueue | null>;
  listQueues(userId: string): Promise<CommandQueue[]>;

  // Command management
  enqueueCommand(command: Command): Promise<string>;
  dequeueCommand(queueId: string): Promise<Command | null>;
  getCommand(commandId: string): Promise<Command | null>;
  updateCommand(commandId: string, updates: Partial<Command>): Promise<void>;
  cancelCommand(commandId: string): Promise<void>;

  // Queue operations
  startQueue(queueId: string): Promise<void>;
  pauseQueue(queueId: string): Promise<void>;
  stopQueue(queueId: string): Promise<void>;
  clearQueue(queueId: string): Promise<void>;

  // Status and monitoring
  getQueueStatus(queueId: string): Promise<QueueStatus>;
  getQueueStats(queueId: string): Promise<QueueStats>;
  getPerformanceMetrics(): Promise<PerformanceMetrics>;
}

/**
 * Command routing service interface
 */
export interface ICommandRoutingService extends EventEmitter {
  // Routing operations
  routeCommand(command: Command, strategy?: RoutingStrategy): Promise<RoutingPlan>;
  calculateOptimalRoute(command: Command): Promise<DeviceRoute>;
  validateRoute(plan: RoutingPlan): Promise<boolean>;

  // Load balancing
  balanceLoad(commands: Command[]): Promise<LoadBalancePlan>;
  getDeviceLoad(deviceId: string): Promise<DeviceLoad>;
  updateDeviceLoad(deviceId: string, load: Partial<DeviceLoad>): Promise<void>;

  // Dependency management
  resolveDependencies(command: Command): Promise<Command[]>;
  checkDependencyStatus(commandId: string): Promise<DependencyStatus>;
  addDependency(dependency: CommandDependency): Promise<void>;
  removeDependency(dependencyId: string): Promise<void>;
}

/**
 * Load balance plan interface
 */
export interface LoadBalancePlan {
  /** Plan ID */
  id: string;

  /** Commands to be balanced */
  commands: string[];

  /** Device assignments */
  assignments: Record<string, string[]>;

  /** Load distribution */
  distribution: Record<string, number>;

  /** Balance score */
  score: number;

  /** Plan metadata */
  metadata: Record<string, any>;

  /** Plan timestamp */
  timestamp: Date;
}

/**
 * Command execution service interface
 */
export interface ICommandExecutionService extends EventEmitter {
  // Execution operations
  executeCommand(command: Command): Promise<CommandResult>;
  executeCommandBatch(commands: Command[]): Promise<CommandResult[]>;
  cancelExecution(commandId: string): Promise<void>;

  // Resource management
  allocateResources(command: Command): Promise<ResourceAllocation>;
  releaseResources(allocationId: string): Promise<void>;
  getResourceUsage(deviceId: string): Promise<ResourceRequirements>;

  // Result management
  getResult(commandId: string): Promise<CommandResult | null>;
  aggregateResults(results: CommandResult[]): Promise<AggregatedResult>;
  streamResults(commandId: string): AsyncIterator<CommandResult>;
}

/**
 * Command coordinator service interface
 */
export interface ICommandCoordinatorService extends EventEmitter {
  // Coordination operations
  coordinateExecution(command: Command): Promise<CoordinationPlan>;
  synchronizeDevices(deviceIds: string[]): Promise<SyncResult>;

  // Status tracking
  trackCommandStatus(commandId: string): Promise<CommandStatus>;
  broadcastStatusUpdate(status: CommandStatus): Promise<void>;

  // Conflict resolution
  resolveConflicts(conflicts: CommandConflict[]): Promise<Resolution[]>;
  detectConflicts(commands: Command[]): Promise<CommandConflict[]>;

  // Synchronization
  createSyncPoint(syncPoint: Omit<SyncPoint, 'id' | 'status'>): Promise<SyncPoint>;
  waitForSync(syncPointId: string): Promise<SyncResult>;
}
