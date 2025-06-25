/**
 * Comprehensive workflow type definitions for Phase 4 Advanced Orchestration
 * Implements workflow schema definition, validation, and execution types
 */

// Core workflow definition interfaces
export interface WorkflowDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  steps: WorkflowStep[];
  conditions?: ConditionalLogic[];
  parallelGroups?: ParallelGroup[];
  errorHandling: ErrorHandlingConfig;
  timeout: number;
  retryPolicy: RetryPolicy;
  metadata: WorkflowMetadata;
  variables?: Record<string, WorkflowVariable>;
  triggers?: WorkflowTrigger[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  status: WorkflowStatus;
}

export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  type: WorkflowStepType;
  action: ActionDefinition;
  dependencies: string[];
  timeout: number;
  retryPolicy: RetryPolicy;
  onSuccess?: string;
  onFailure?: string;
  onTimeout?: string;
  variables?: Record<string, any>;
  conditions?: ConditionalLogic[];
  position?: StepPosition;
  enabled: boolean;
}

export interface ConditionalLogic {
  id: string;
  expression: string;
  operator: ConditionalOperator;
  variables: string[];
  nextStepId?: string;
  description?: string;
}

export interface ParallelGroup {
  id: string;
  name: string;
  stepIds: string[];
  maxConcurrency?: number;
  waitForAll: boolean;
  continueOnError: boolean;
  timeout?: number;
}

export interface ActionDefinition {
  type: ActionType;
  command?: CommandAction;
  webhook?: WebhookAction;
  condition?: ConditionAction;
  wait?: WaitAction;
  parallel?: ParallelAction;
  script?: ScriptAction;
  notification?: NotificationAction;
}

export interface CommandAction {
  deviceId?: string;
  deviceType?: string;
  command: string;
  parameters?: Record<string, any>;
  expectedResponse?: string;
  responseTimeout?: number;
}

export interface WebhookAction {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  authentication?: WebhookAuth;
  expectedStatusCodes?: number[];
}

export interface ConditionAction {
  expression: string;
  trueStepId: string;
  falseStepId: string;
  variables: string[];
}

export interface WaitAction {
  duration: number;
  unit: 'seconds' | 'minutes' | 'hours';
  condition?: string;
}

export interface ParallelAction {
  groupId: string;
  stepIds: string[];
  maxConcurrency?: number;
}

export interface ScriptAction {
  language: 'javascript' | 'python' | 'bash';
  code: string;
  environment?: Record<string, string>;
  timeout?: number;
}

export interface NotificationAction {
  type: 'email' | 'sms' | 'webhook' | 'push';
  recipients: string[];
  subject?: string;
  message: string;
  template?: string;
}

export interface ErrorHandlingConfig {
  strategy: ErrorStrategy;
  maxRetries: number;
  retryDelay: number;
  escalationSteps?: string[];
  rollbackSteps?: string[];
  notificationOnError: boolean;
  continueOnError: boolean;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffStrategy: BackoffStrategy;
  initialDelay: number;
  maxDelay: number;
  multiplier: number;
  retryableErrors?: string[];
}

export interface WorkflowMetadata {
  tags: string[];
  category: string;
  priority: WorkflowPriority;
  owner: string;
  team?: string;
  environment: WorkflowEnvironment;
  estimatedDuration?: number;
  resourceRequirements?: ResourceRequirements;
  documentation?: string;
  changelog?: ChangelogEntry[];
}

export interface WorkflowVariable {
  name: string;
  type: VariableType;
  defaultValue?: any;
  required: boolean;
  description?: string;
  validation?: VariableValidation;
}

export interface WorkflowTrigger {
  id: string;
  type: TriggerType;
  schedule?: ScheduleTrigger;
  event?: EventTrigger;
  webhook?: WebhookTrigger;
  manual?: ManualTrigger;
  enabled: boolean;
}

// Execution-related interfaces
export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowVersion: string;
  status: ExecutionStatus;
  context: ExecutionContext;
  result?: WorkflowResult;
  steps: StepExecution[];
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  triggeredBy: string;
  triggerType: TriggerType;
  metadata: ExecutionMetadata;
}

export interface ExecutionContext {
  variables: Record<string, any>;
  environment: WorkflowEnvironment;
  userId: string;
  sessionId?: string;
  deviceContext?: DeviceContext;
  parentExecutionId?: string;
  correlationId: string;
}

export interface StepExecution {
  id: string;
  stepId: string;
  executionId: string;
  status: StepExecutionStatus;
  input?: any;
  output?: any;
  error?: ExecutionError;
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  retryCount: number;
  logs: ExecutionLog[];
}

export interface WorkflowResult {
  status: ExecutionStatus;
  output?: any;
  error?: ExecutionError;
  metrics: ExecutionMetrics;
  summary: ExecutionSummary;
}

export interface ExecutionError {
  code: string;
  message: string;
  details?: any;
  stepId?: string;
  timestamp: Date;
  recoverable: boolean;
  stack?: string;
}

export interface ExecutionMetrics {
  totalDuration: number;
  stepCount: number;
  successfulSteps: number;
  failedSteps: number;
  skippedSteps: number;
  parallelExecutions: number;
  resourceUsage: ResourceUsage;
  performanceMetrics: PerformanceMetrics;
}

// Validation and template interfaces
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions?: ValidationSuggestion[];
}

export interface ValidationError {
  code: string;
  message: string;
  path: string;
  severity: 'error' | 'warning' | 'info';
  details?: any;
}

export interface ValidationWarning {
  code: string;
  message: string;
  path: string;
  suggestion?: string;
}

export interface ValidationSuggestion {
  type: 'optimization' | 'best-practice' | 'security';
  message: string;
  path: string;
  autoFixable: boolean;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  definition: Partial<WorkflowDefinition>;
  parameters: TemplateParameter[];
  examples: TemplateExample[];
  documentation: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  tags: string[];
  popularity: number;
}

export interface TemplateParameter {
  name: string;
  type: VariableType;
  required: boolean;
  defaultValue?: any;
  description: string;
  validation?: VariableValidation;
  examples?: any[];
}

export interface TemplateExample {
  name: string;
  description: string;
  parameters: Record<string, any>;
  expectedOutput?: any;
}

// Enums and type unions
export type WorkflowStepType =
  | 'command'
  | 'condition'
  | 'parallel'
  | 'wait'
  | 'webhook'
  | 'script'
  | 'notification'
  | 'loop'
  | 'switch';

export type ActionType =
  | 'command'
  | 'webhook'
  | 'condition'
  | 'wait'
  | 'parallel'
  | 'script'
  | 'notification';

export type ConditionalOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'greater_equal'
  | 'less_equal'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'regex_match'
  | 'in'
  | 'not_in'
  | 'and'
  | 'or'
  | 'not';

export type ErrorStrategy = 'fail_fast' | 'continue' | 'retry' | 'rollback' | 'escalate';

export type BackoffStrategy = 'fixed' | 'linear' | 'exponential' | 'random';

export type WorkflowStatus = 'draft' | 'active' | 'inactive' | 'deprecated' | 'archived';

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout'
  | 'paused';

export type StepExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'timeout'
  | 'retrying';

export type WorkflowPriority = 'low' | 'normal' | 'high' | 'critical';

export type WorkflowEnvironment = 'development' | 'staging' | 'production';

export type VariableType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'date' | 'file';

export type TriggerType = 'manual' | 'schedule' | 'event' | 'webhook' | 'api';

// Supporting interfaces
export interface StepPosition {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface WebhookAuth {
  type: 'none' | 'basic' | 'bearer' | 'api_key' | 'oauth2';
  credentials?: Record<string, string>;
}

export interface ResourceRequirements {
  cpu?: number;
  memory?: number;
  storage?: number;
  network?: boolean;
  gpu?: boolean;
}

export interface ChangelogEntry {
  version: string;
  date: Date;
  author: string;
  changes: string[];
  breaking: boolean;
}

export interface VariableValidation {
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  enum?: any[];
  custom?: string;
}

export interface ScheduleTrigger {
  cron: string;
  timezone?: string;
  startDate?: Date;
  endDate?: Date;
  maxExecutions?: number;
}

export interface EventTrigger {
  eventType: string;
  source: string;
  filters?: Record<string, any>;
}

export interface WebhookTrigger {
  url: string;
  secret?: string;
  headers?: Record<string, string>;
}

export interface ManualTrigger {
  requiresApproval: boolean;
  approvers?: string[];
  reason?: string;
}

export interface DeviceContext {
  deviceId: string;
  deviceType: string;
  capabilities: string[];
  location?: string;
  metadata?: Record<string, any>;
}

export interface ExecutionMetadata {
  source: string;
  correlationId: string;
  parentWorkflowId?: string;
  tags: string[];
  priority: WorkflowPriority;
  environment: WorkflowEnvironment;
}

export interface ExecutionLog {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: any;
  stepId?: string;
}

export interface ResourceUsage {
  cpuTime: number;
  memoryPeak: number;
  networkBytes: number;
  storageBytes: number;
  executionTime: number;
}

export interface PerformanceMetrics {
  averageStepDuration: number;
  parallelEfficiency: number;
  queueWaitTime: number;
  resourceUtilization: number;
  throughput: number;
}

export interface ExecutionSummary {
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  skippedSteps: number;
  parallelGroups: number;
  retryAttempts: number;
  errorRate: number;
  performance: 'excellent' | 'good' | 'fair' | 'poor';
}

// Workflow state management
export interface WorkflowState {
  executionId: string;
  workflowId: string;
  currentStep?: string;
  completedSteps: string[];
  failedSteps: string[];
  skippedSteps: string[];
  variables: Record<string, any>;
  parallelGroups: Record<string, ParallelGroupState>;
  lastUpdated: Date;
  checkpoints: StateCheckpoint[];
}

export interface ParallelGroupState {
  groupId: string;
  runningSteps: string[];
  completedSteps: string[];
  failedSteps: string[];
  startedAt: Date;
  completedAt?: Date;
}

export interface StateCheckpoint {
  id: string;
  stepId: string;
  timestamp: Date;
  state: Record<string, any>;
  variables: Record<string, any>;
}

// Export utility types
export type WorkflowDefinitionInput = Omit<WorkflowDefinition, 'id' | 'createdAt' | 'updatedAt'>;
export type WorkflowStepInput = Omit<WorkflowStep, 'id'>;
export type WorkflowExecutionInput = Omit<
  WorkflowExecution,
  'id' | 'startedAt' | 'steps' | 'result'
>;

// Constants
export const WORKFLOW_CONSTANTS = {
  MAX_STEPS: 100,
  MAX_PARALLEL_BRANCHES: 20,
  MAX_RETRY_ATTEMPTS: 10,
  DEFAULT_TIMEOUT: 300000, // 5 minutes
  MAX_EXECUTION_TIME: 3600000, // 1 hour
  MAX_VARIABLE_SIZE: 1048576, // 1MB
  MAX_WORKFLOW_NAME_LENGTH: 255,
  MAX_DESCRIPTION_LENGTH: 1000,
  MIN_STEP_TIMEOUT: 1000, // 1 second
  MAX_STEP_TIMEOUT: 1800000, // 30 minutes
  DEFAULT_RETRY_DELAY: 1000, // 1 second
  MAX_RETRY_DELAY: 300000, // 5 minutes
} as const;

// Schema validation constants
export const VALIDATION_PATTERNS = {
  WORKFLOW_ID: /^[a-zA-Z0-9_-]+$/,
  STEP_ID: /^[a-zA-Z0-9_-]+$/,
  VARIABLE_NAME: /^[a-zA-Z][a-zA-Z0-9_]*$/,
  CRON_EXPRESSION:
    /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/,
  URL: /^https?:\/\/.+/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
} as const;

// Default values for workflow components
export const DEFAULT_VALUES = {
  WORKFLOW: {
    timeout: WORKFLOW_CONSTANTS.DEFAULT_TIMEOUT,
    retryPolicy: {
      maxAttempts: 3,
      backoffStrategy: 'exponential' as BackoffStrategy,
      initialDelay: 1000,
      maxDelay: 30000,
      multiplier: 2,
    },
    errorHandling: {
      strategy: 'fail_fast' as ErrorStrategy,
      maxRetries: 3,
      retryDelay: 1000,
      notificationOnError: true,
      continueOnError: false,
    },
    metadata: {
      tags: [],
      category: 'general',
      priority: 'normal' as WorkflowPriority,
      environment: 'development' as WorkflowEnvironment,
    },
  },
  STEP: {
    timeout: 60000, // 1 minute
    retryPolicy: {
      maxAttempts: 3,
      backoffStrategy: 'exponential' as BackoffStrategy,
      initialDelay: 1000,
      maxDelay: 10000,
      multiplier: 2,
    },
    enabled: true,
    dependencies: [],
  },
} as const;
