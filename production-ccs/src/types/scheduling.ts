/**
 * TASK-008.1.4.1: Core Scheduling Engine - Type Definitions
 *
 * Comprehensive TypeScript interfaces for workflow scheduling system
 * Supporting cron expressions, event triggers, and execution management
 */

// ============================================================================
// CORE SCHEDULING TYPES
// ============================================================================

export interface ScheduleDefinition {
  id: string;
  workflowId: string;
  name: string;
  description?: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  startDate?: Date;
  endDate?: Date;
  maxExecutions?: number;
  retryPolicy: RetryPolicy;
  metadata: ScheduleMetadata;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleMetadata {
  tags: string[];
  priority: SchedulePriority;
  category?: string;
  environment?: string;
  notifications?: NotificationConfig;
  customData?: Record<string, any>;
}

export interface ScheduleStatus {
  id: string;
  status: ScheduleState;
  enabled: boolean;
  executionCount: number;
  lastExecution?: Date;
  nextExecution?: Date;
  lastExecutionStatus?: ExecutionStatus;
  lastError?: string;
  health: ScheduleHealth;
  metrics: ScheduleMetrics;
}

export interface ScheduleHealth {
  status: 'healthy' | 'warning' | 'critical';
  successRate: number;
  averageExecutionTime: number;
  lastHealthCheck: Date;
  issues: HealthIssue[];
}

export interface HealthIssue {
  type: 'performance' | 'reliability' | 'configuration';
  severity: 'low' | 'medium' | 'high';
  message: string;
  timestamp: Date;
}

export interface ScheduleMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  lastExecutionTime?: number;
  successRate: number;
  uptimePercentage: number;
}

// ============================================================================
// EXECUTION TYPES
// ============================================================================

export interface ScheduledExecution {
  id: string;
  scheduleId: string;
  workflowId: string;
  scheduledTime: Date;
  actualStartTime?: Date;
  completionTime?: Date;
  status: ExecutionStatus;
  priority: ExecutionPriority;
  context: ExecutionContext;
  result?: ExecutionResult;
  error?: ExecutionError;
  retryCount: number;
  maxRetries: number;
}

export interface ExecutionContext {
  triggeredBy: TriggerSource;
  triggerData?: any;
  environment: string;
  userId?: string;
  sessionId?: string;
  metadata: Record<string, any>;
}

export interface ExecutionResult {
  success: boolean;
  output?: any;
  metrics: ExecutionMetrics;
  logs: ExecutionLog[];
  artifacts?: ExecutionArtifact[];
}

export interface ExecutionMetrics {
  duration: number;
  memoryUsage: number;
  cpuUsage: number;
  networkRequests: number;
  databaseQueries: number;
  customMetrics: Record<string, number>;
}

export interface ExecutionLog {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
  component?: string;
  metadata?: Record<string, any>;
}

export interface ExecutionArtifact {
  type: 'file' | 'data' | 'report';
  name: string;
  path: string;
  size: number;
  mimeType: string;
  metadata: Record<string, any>;
}

export interface ExecutionError {
  code: string;
  message: string;
  stack?: string;
  component?: string;
  retryable: boolean;
  timestamp: Date;
  context?: Record<string, any>;
}

export interface ExecutionHistory {
  executions: ScheduledExecution[];
  totalCount: number;
  successCount: number;
  failureCount: number;
  averageDuration: number;
  trends: ExecutionTrends;
}

export interface ExecutionTrends {
  successRate: number[];
  averageDuration: number[];
  executionCount: number[];
  timestamps: Date[];
}

// ============================================================================
// RETRY AND RECOVERY TYPES
// ============================================================================

export interface RetryPolicy {
  enabled: boolean;
  maxRetries: number;
  retryDelay: number;
  backoffStrategy: BackoffStrategy;
  retryableErrors: string[];
  escalationPolicy?: EscalationPolicy;
}

export interface EscalationPolicy {
  enabled: boolean;
  escalateAfter: number;
  notificationChannels: string[];
  fallbackAction?: FallbackAction;
}

export interface FallbackAction {
  type: 'skip' | 'manual' | 'alternative';
  alternativeWorkflowId?: string;
  notifyUsers: string[];
  metadata: Record<string, any>;
}

export interface FailedExecution extends ScheduledExecution {
  failureReason: string;
  retryAttempts: RetryAttempt[];
  escalated: boolean;
  deadLetterQueue: boolean;
}

export interface RetryAttempt {
  attemptNumber: number;
  scheduledTime: Date;
  actualTime?: Date;
  status: 'pending' | 'running' | 'failed' | 'skipped';
  error?: ExecutionError;
  delay: number;
}

// ============================================================================
// EVENT TRIGGER TYPES
// ============================================================================

export interface EventTriggerDefinition {
  id: string;
  workflowId: string;
  name: string;
  eventType: string;
  eventSource: EventSource;
  filters: EventFilter[];
  authentication: TriggerAuth;
  retryPolicy: RetryPolicy;
  enabled: boolean;
  metadata: TriggerMetadata;
}

export interface EventFilter {
  field: string;
  operator: FilterOperator;
  value: any;
  caseSensitive?: boolean;
}

export interface TriggerAuth {
  type: 'none' | 'api_key' | 'jwt' | 'webhook_signature';
  credentials: Record<string, string>;
  validation: AuthValidation;
}

export interface AuthValidation {
  required: boolean;
  algorithm?: string;
  secretKey?: string;
  headerName?: string;
  queryParam?: string;
}

export interface TriggerMetadata {
  description?: string;
  tags: string[];
  category?: string;
  rateLimit?: RateLimit;
  customData?: Record<string, any>;
}

export interface RateLimit {
  enabled: boolean;
  requestsPerMinute: number;
  burstLimit: number;
  windowSize: number;
}

export interface WorkflowEvent {
  id: string;
  type: string;
  source: EventSource;
  timestamp: Date;
  data: any;
  metadata: EventMetadata;
  correlationId?: string;
}

export interface EventMetadata {
  version: string;
  contentType: string;
  encoding?: string;
  headers?: Record<string, string>;
  customData?: Record<string, any>;
}

// ============================================================================
// WEBHOOK TYPES
// ============================================================================

export interface WebhookConfig {
  id: string;
  endpoint: string;
  secret: string;
  events: string[];
  filters: EventFilter[];
  retryPolicy: RetryPolicy;
  authentication: TriggerAuth;
  enabled: boolean;
  metadata: WebhookMetadata;
}

export interface WebhookMetadata {
  description?: string;
  tags: string[];
  rateLimit?: RateLimit;
  timeout: number;
  customHeaders?: Record<string, string>;
}

export interface WebhookRequest {
  id: string;
  webhookId: string;
  method: string;
  headers: Record<string, string>;
  body: any;
  timestamp: Date;
  sourceIp: string;
  userAgent?: string;
}

export interface WebhookResponse {
  requestId: string;
  statusCode: number;
  headers: Record<string, string>;
  body?: any;
  processingTime: number;
  timestamp: Date;
}

// ============================================================================
// QUEUE MANAGEMENT TYPES
// ============================================================================

export interface QueueStats {
  size: number;
  processing: number;
  completed: number;
  failed: number;
  averageWaitTime: number;
  averageProcessingTime: number;
  throughput: number;
  lastUpdated: Date;
}

export interface QueueConfiguration {
  maxSize: number;
  maxConcurrency: number;
  priorityLevels: number;
  retentionPeriod: number;
  deadLetterQueue: boolean;
  monitoring: QueueMonitoring;
}

export interface QueueMonitoring {
  enabled: boolean;
  alertThresholds: AlertThresholds;
  metricsRetention: number;
  notificationChannels: string[];
}

export interface AlertThresholds {
  queueSize: number;
  waitTime: number;
  failureRate: number;
  throughputDrop: number;
}

// ============================================================================
// OPTIMIZATION TYPES
// ============================================================================

export interface OptimizationReport {
  scheduleId: string;
  analysisDate: Date;
  recommendations: OptimizationRecommendation[];
  performanceMetrics: PerformanceMetrics;
  resourceUtilization: ResourceUtilization;
}

export interface OptimizationRecommendation {
  type: 'schedule_adjustment' | 'resource_allocation' | 'retry_policy' | 'load_balancing';
  priority: 'low' | 'medium' | 'high';
  description: string;
  expectedImpact: string;
  implementation: string;
  estimatedSavings?: ResourceSavings;
}

export interface PerformanceMetrics {
  averageExecutionTime: number;
  successRate: number;
  resourceEfficiency: number;
  costPerExecution: number;
  scalabilityScore: number;
}

export interface ResourceUtilization {
  cpu: number;
  memory: number;
  network: number;
  storage: number;
  database: number;
}

export interface ResourceSavings {
  cpu: number;
  memory: number;
  cost: number;
  time: number;
}

export interface ScheduleAdjustment {
  scheduleId: string;
  currentCron: string;
  recommendedCron: string;
  reason: string;
  expectedImprovement: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ResourceStatus {
  available: boolean;
  capacity: ResourceCapacity;
  utilization: ResourceUtilization;
  constraints: ResourceConstraint[];
  forecast: ResourceForecast;
}

export interface ResourceCapacity {
  cpu: number;
  memory: number;
  network: number;
  storage: number;
  concurrentExecutions: number;
}

export interface ResourceConstraint {
  type: 'cpu' | 'memory' | 'network' | 'storage' | 'concurrency';
  limit: number;
  current: number;
  threshold: number;
  severity: 'warning' | 'critical';
}

export interface ResourceForecast {
  timeHorizon: number;
  predictedUtilization: ResourceUtilization;
  confidence: number;
  recommendations: string[];
}

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export interface NotificationConfig {
  enabled: boolean;
  channels: NotificationChannel[];
  events: NotificationEvent[];
  filters: NotificationFilter[];
}

export interface NotificationChannel {
  type: 'email' | 'slack' | 'webhook' | 'sms';
  config: Record<string, any>;
  enabled: boolean;
}

export interface NotificationEvent {
  type: 'execution_success' | 'execution_failure' | 'schedule_disabled' | 'health_warning';
  enabled: boolean;
  threshold?: number;
}

export interface NotificationFilter {
  field: string;
  operator: FilterOperator;
  value: any;
}

// ============================================================================
// ENUMS AND CONSTANTS
// ============================================================================

export enum ScheduleState {
  ACTIVE = 'active',
  PAUSED = 'paused',
  DISABLED = 'disabled',
  ERROR = 'error',
  EXPIRED = 'expired',
}

export enum SchedulePriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4,
  URGENT = 5,
}

export enum ExecutionStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout',
  RETRYING = 'retrying',
}

export enum ExecutionPriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  URGENT = 4,
  IMMEDIATE = 5,
}

export enum TriggerSource {
  SCHEDULE = 'schedule',
  EVENT = 'event',
  WEBHOOK = 'webhook',
  MANUAL = 'manual',
  API = 'api',
  RETRY = 'retry',
}

export enum EventSource {
  INTERNAL = 'internal',
  WEBHOOK = 'webhook',
  API = 'api',
  SYSTEM = 'system',
  EXTERNAL = 'external',
}

export enum BackoffStrategy {
  FIXED = 'fixed',
  LINEAR = 'linear',
  EXPONENTIAL = 'exponential',
  CUSTOM = 'custom',
}

export enum FilterOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  GREATER_EQUAL = 'greater_equal',
  LESS_EQUAL = 'less_equal',
  IN = 'in',
  NOT_IN = 'not_in',
  REGEX = 'regex',
}

// ============================================================================
// FILTER AND PAGINATION TYPES
// ============================================================================

export interface ScheduleFilters {
  enabled?: boolean;
  status?: ScheduleState[];
  priority?: SchedulePriority[];
  workflowId?: string;
  createdBy?: string;
  tags?: string[];
  category?: string;
  environment?: string;
  cronExpression?: string;
  timezone?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  updatedAfter?: Date;
  updatedBefore?: Date;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: ScheduleSortField;
  sortOrder?: 'asc' | 'desc';
}

export interface ExecutionFilters {
  scheduleId?: string;
  workflowId?: string;
  status?: ExecutionStatus[];
  priority?: ExecutionPriority[];
  triggeredBy?: TriggerSource[];
  executedAfter?: Date;
  executedBefore?: Date;
  userId?: string;
  environment?: string;
  limit?: number;
  offset?: number;
  sortBy?: ExecutionSortField;
  sortOrder?: 'asc' | 'desc';
}

export enum ScheduleSortField {
  NAME = 'name',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  LAST_EXECUTION = 'lastExecution',
  NEXT_EXECUTION = 'nextExecution',
  PRIORITY = 'priority',
  STATUS = 'status',
}

export enum ExecutionSortField {
  SCHEDULED_TIME = 'scheduledTime',
  ACTUAL_START_TIME = 'actualStartTime',
  COMPLETION_TIME = 'completionTime',
  DURATION = 'duration',
  STATUS = 'status',
  PRIORITY = 'priority',
}

// ============================================================================
// SCHEDULER INTERFACE
// ============================================================================

export interface WorkflowScheduler {
  // Schedule management
  createSchedule(
    schedule: Omit<ScheduleDefinition, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string>;
  updateSchedule(scheduleId: string, updates: Partial<ScheduleDefinition>): Promise<void>;
  deleteSchedule(scheduleId: string): Promise<void>;
  getSchedule(scheduleId: string): Promise<ScheduleDefinition | null>;
  listSchedules(filters?: ScheduleFilters): Promise<ScheduleDefinition[]>;

  // Schedule control
  start(): Promise<void>;
  stop(): Promise<void>;
  pause(scheduleId: string): Promise<void>;
  resume(scheduleId: string): Promise<void>;
  enableSchedule(scheduleId: string): Promise<void>;
  disableSchedule(scheduleId: string): Promise<void>;

  // Execution management
  triggerSchedule(scheduleId: string, context?: Partial<ExecutionContext>): Promise<string>;
  cancelExecution(executionId: string): Promise<void>;
  retryExecution(executionId: string): Promise<string>;

  // Monitoring and status
  getScheduleStatus(scheduleId: string): Promise<ScheduleStatus>;
  getExecutionHistory(scheduleId: string, filters?: ExecutionFilters): Promise<ExecutionHistory>;
  getExecution(executionId: string): Promise<ScheduledExecution | null>;
  listExecutions(filters?: ExecutionFilters): Promise<ScheduledExecution[]>;

  // Health and metrics
  getScheduleHealth(scheduleId: string): Promise<ScheduleHealth>;
  getScheduleMetrics(scheduleId: string): Promise<ScheduleMetrics>;
  getSystemMetrics(): Promise<SystemMetrics>;

  // Validation and testing
  validateCronExpression(expression: string, timezone?: string): Promise<CronValidationResult>;
  getNextExecutionTimes(scheduleId: string, count?: number): Promise<Date[]>;
  testSchedule(
    schedule: Omit<ScheduleDefinition, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ScheduleTestResult>;
}

// ============================================================================
// CRON ENGINE INTERFACE
// ============================================================================

export interface CronEngine {
  // Expression parsing and validation
  parseExpression(expression: string): Promise<ParsedCronExpression>;
  validateExpression(expression: string): Promise<CronValidationResult>;

  // Time calculations
  getNextExecutionTime(expression: string, timezone: string, fromDate?: Date): Promise<Date | null>;
  getNextExecutionTimes(
    expression: string,
    timezone: string,
    count: number,
    fromDate?: Date
  ): Promise<Date[]>;
  getPreviousExecutionTime(
    expression: string,
    timezone: string,
    fromDate?: Date
  ): Promise<Date | null>;

  // Schedule analysis
  analyzeScheduleFrequency(expression: string): Promise<ScheduleFrequencyAnalysis>;
  detectScheduleConflicts(expressions: string[], timezone: string): Promise<ScheduleConflict[]>;
  optimizeScheduleDistribution(
    expressions: string[],
    timezone: string
  ): Promise<OptimizationSuggestion[]>;
}

export interface ParsedCronExpression {
  original: string;
  fields: CronFields;
  timezone: string;
  description: string;
  frequency: ScheduleFrequency;
  valid: boolean;
  errors: string[];
}

export interface CronFields {
  second?: string;
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
  year?: string;
}

export interface CronValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  description: string;
  frequency: ScheduleFrequency;
  nextExecutions: Date[];
}

export interface ScheduleFrequency {
  type: 'once' | 'minutely' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  interval: number;
  description: string;
  estimatedExecutionsPerDay: number;
}

export interface ScheduleFrequencyAnalysis {
  frequency: ScheduleFrequency;
  peakHours: number[];
  distributionScore: number;
  resourceImpact: ResourceImpactAnalysis;
  recommendations: string[];
}

export interface ResourceImpactAnalysis {
  cpuImpact: 'low' | 'medium' | 'high';
  memoryImpact: 'low' | 'medium' | 'high';
  networkImpact: 'low' | 'medium' | 'high';
  databaseImpact: 'low' | 'medium' | 'high';
  overallImpact: 'low' | 'medium' | 'high';
}

export interface ScheduleConflict {
  scheduleIds: string[];
  conflictTime: Date;
  severity: 'low' | 'medium' | 'high';
  description: string;
  resolution: string;
}

export interface OptimizationSuggestion {
  type: 'time_adjustment' | 'load_balancing' | 'resource_optimization';
  scheduleId: string;
  currentExpression: string;
  suggestedExpression: string;
  reason: string;
  expectedBenefit: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ScheduleTestResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  nextExecutions: Date[];
  estimatedResourceUsage: ResourceUtilization;
  recommendations: string[];
}

// ============================================================================
// SYSTEM METRICS TYPES
// ============================================================================

export interface SystemMetrics {
  totalSchedules: number;
  activeSchedules: number;
  pausedSchedules: number;
  disabledSchedules: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  systemLoad: SystemLoad;
  resourceUtilization: ResourceUtilization;
  queueStats: QueueStats;
  healthStatus: SystemHealthStatus;
  uptime: number;
  lastUpdated: Date;
}

export interface SystemLoad {
  cpu: number;
  memory: number;
  network: number;
  storage: number;
  activeConnections: number;
  queueSize: number;
}

export interface SystemHealthStatus {
  status: 'healthy' | 'warning' | 'critical' | 'down';
  components: ComponentHealth[];
  issues: SystemIssue[];
  lastHealthCheck: Date;
}

export interface ComponentHealth {
  component: string;
  status: 'healthy' | 'warning' | 'critical' | 'down';
  responseTime?: number;
  errorRate?: number;
  lastCheck: Date;
}

export interface SystemIssue {
  id: string;
  type: 'performance' | 'reliability' | 'security' | 'configuration';
  severity: 'low' | 'medium' | 'high' | 'critical';
  component: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
  resolution?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  enabled: true,
  maxRetries: 3,
  retryDelay: 1000,
  backoffStrategy: BackoffStrategy.EXPONENTIAL,
  retryableErrors: ['TIMEOUT', 'NETWORK_ERROR', 'TEMPORARY_FAILURE'],
};

export const DEFAULT_SCHEDULE_METADATA: Partial<ScheduleMetadata> = {
  tags: [],
  priority: SchedulePriority.NORMAL,
};

export const DEFAULT_EXECUTION_CONTEXT: Partial<ExecutionContext> = {
  triggeredBy: TriggerSource.SCHEDULE,
  environment: 'production',
  metadata: {},
};

export const CRON_PRESETS = {
  EVERY_MINUTE: '* * * * *',
  EVERY_5_MINUTES: '*/5 * * * *',
  EVERY_15_MINUTES: '*/15 * * * *',
  EVERY_30_MINUTES: '*/30 * * * *',
  HOURLY: '0 * * * *',
  DAILY_MIDNIGHT: '0 0 * * *',
  DAILY_NOON: '0 12 * * *',
  WEEKLY_SUNDAY: '0 0 * * 0',
  MONTHLY_FIRST: '0 0 1 * *',
  YEARLY: '0 0 1 1 *',
} as const;

export const TIMEZONE_PRESETS = {
  UTC: 'UTC',
  US_EASTERN: 'America/New_York',
  US_CENTRAL: 'America/Chicago',
  US_MOUNTAIN: 'America/Denver',
  US_PACIFIC: 'America/Los_Angeles',
  EUROPE_LONDON: 'Europe/London',
  EUROPE_PARIS: 'Europe/Paris',
  ASIA_TOKYO: 'Asia/Tokyo',
  ASIA_SHANGHAI: 'Asia/Shanghai',
  AUSTRALIA_SYDNEY: 'Australia/Sydney',
} as const;

export const PERFORMANCE_THRESHOLDS = {
  SCHEDULE_EVALUATION_MS: 10,
  TRIGGER_RESPONSE_MS: 50,
  QUEUE_OPERATION_MS: 5,
  EXECUTION_TIMEOUT_MS: 300000, // 5 minutes
  HEALTH_CHECK_INTERVAL_MS: 30000, // 30 seconds
  METRICS_COLLECTION_INTERVAL_MS: 60000, // 1 minute
} as const;
