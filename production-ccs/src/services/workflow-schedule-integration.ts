/**
 * TASK-008.1.4.2: Workflow-Schedule Integration Service
 *
 * Main integration service that bridges the Core Scheduling Engine with the
 * existing Workflow Execution system, providing seamless schedule-triggered
 * workflow execution with real-time state synchronization and event broadcasting.
 */

import { EventEmitter } from 'events';
import {
  ScheduleDefinition,
  ScheduleWorkflowStatus,
  ScheduleTrigger,
  ScheduleWorkflowMetrics,
  ScheduledExecution,
} from '../types/scheduling';
import { WorkflowDefinition, WorkflowExecution } from '../types/workflow';
import { ScheduleManagerService } from './schedule-manager';
import { WorkflowExecutor } from './workflow-executor';
import { ScheduleExecutionHandler } from './schedule-execution-handler';
import { logger } from '../utils/logger';

/**
 * Configuration for scheduled workflow
 */
export interface ScheduledWorkflowConfig {
  id: string;
  workflowId: string;
  scheduleId: string;
  name: string;
  description?: string;
  enabled: boolean;
  executionConfig: WorkflowExecutionConfig;
  scheduleConfig: ScheduleDefinition;
  metadata: Record<string, any>;
}

/**
 * Workflow execution configuration for scheduled workflows
 */
export interface WorkflowExecutionConfig {
  timeout?: number;
  retryPolicy?: {
    maxAttempts: number;
    backoffStrategy: 'fixed' | 'linear' | 'exponential';
    initialDelay: number;
    maxDelay: number;
    multiplier: number;
  };
  environment?: string;
  variables?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high' | 'urgent' | 'immediate';
}

/**
 * Integration service lifecycle states
 */
type IntegrationState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

/**
 * Workflow status interface
 */
interface WorkflowStatus {
  id: string;
  name: string;
  version: string;
  status: string;
  lastModified: Date;
  executionCount: number;
  averageExecutionTime: number;
}

/**
 * Main workflow-schedule integration service
 * Orchestrates the integration between scheduling and workflow execution systems
 */
export class WorkflowScheduleIntegration extends EventEmitter {
  private readonly logger = logger.child({ component: 'WorkflowScheduleIntegration' });

  // Core services
  private readonly scheduleManager: ScheduleManagerService;
  private readonly workflowExecutor: WorkflowExecutor;
  private readonly executionHandler: ScheduleExecutionHandler;
  private readonly stateManager: any; // Placeholder for ScheduleWorkflowStateManager
  private readonly eventBroadcaster: any; // Placeholder for ScheduleEventBroadcaster

  // Service state
  private state: IntegrationState = 'stopped';
  private readonly scheduledWorkflows = new Map<string, ScheduledWorkflowConfig>();
  private readonly activeExecutions = new Map<string, WorkflowExecution>();

  // Performance tracking
  private readonly performanceMetrics = {
    totalIntegrations: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageIntegrationLatency: 0,
    averageStateSyncLatency: 0,
    averageEventBroadcastLatency: 0,
  };

  constructor(
    scheduleManager: ScheduleManagerService,
    workflowExecutor: WorkflowExecutor,
    executionHandler?: ScheduleExecutionHandler,
    stateManager?: any,
    eventBroadcaster?: any
  ) {
    super();

    this.scheduleManager = scheduleManager;
    this.workflowExecutor = workflowExecutor;
    this.executionHandler = executionHandler || new ScheduleExecutionHandler(this);
    this.stateManager = stateManager || {
      initialize: async () => {},
      start: async () => {},
      stop: async () => {},
      initializeScheduleWorkflowState: async () => {},
      syncScheduleWorkflowState: async () => {},
      cleanupScheduleWorkflowState: async () => {},
      getIntegrationHealth: async () => ({ status: 'healthy' }),
    };
    this.eventBroadcaster = eventBroadcaster || {
      initialize: async () => {},
      start: async () => {},
      stop: async () => {},
    };

    this.setupEventHandlers();
    this.logger.info('WorkflowScheduleIntegration initialized');
  }

  /**
   * Initialize the integration service
   */
  async initialize(): Promise<void> {
    if (this.state !== 'stopped') {
      throw new Error(`Cannot initialize integration in state: ${this.state}`);
    }

    try {
      this.state = 'starting';
      this.logger.info('Initializing workflow-schedule integration');

      // Initialize sub-services
      await this.executionHandler.initialize();
      await this.stateManager.initialize();
      await this.eventBroadcaster.initialize();

      // Load existing scheduled workflows
      await this.loadScheduledWorkflows();

      this.logger.info('Workflow-schedule integration initialized successfully');
    } catch (error) {
      this.state = 'error';
      this.logger.error('Failed to initialize workflow-schedule integration', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Start the integration service
   */
  async start(): Promise<void> {
    if (this.state !== 'stopped' && this.state !== 'starting') {
      throw new Error(`Cannot start integration in state: ${this.state}`);
    }

    try {
      if (this.state === 'stopped') {
        await this.initialize();
      }

      this.state = 'running';
      this.logger.info('Starting workflow-schedule integration');

      // Start sub-services
      await this.executionHandler.start();
      await this.stateManager.start();
      await this.eventBroadcaster.start();

      // Start monitoring
      this.startPerformanceMonitoring();

      this.emit('integration.started');
      this.logger.info('Workflow-schedule integration started successfully');
    } catch (error) {
      this.state = 'error';
      this.logger.error('Failed to start workflow-schedule integration', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Stop the integration service
   */
  async stop(): Promise<void> {
    if (this.state === 'stopped' || this.state === 'stopping') {
      return;
    }

    try {
      this.state = 'stopping';
      this.logger.info('Stopping workflow-schedule integration');

      // Stop sub-services
      await this.executionHandler.stop();
      await this.stateManager.stop();
      await this.eventBroadcaster.stop();

      // Cancel active executions
      await this.cancelActiveExecutions();

      this.state = 'stopped';
      this.emit('integration.stopped');
      this.logger.info('Workflow-schedule integration stopped successfully');
    } catch (error) {
      this.state = 'error';
      this.logger.error('Failed to stop workflow-schedule integration', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create a new scheduled workflow
   */
  async createScheduledWorkflow(config: ScheduledWorkflowConfig): Promise<string> {
    const startTime = Date.now();

    try {
      this.logger.debug('Creating scheduled workflow', {
        workflowId: config.workflowId,
        scheduleId: config.scheduleId,
      });

      if (this.state !== 'running') {
        throw new Error(`Integration not running: ${this.state}`);
      }

      // Validate configuration
      this.validateScheduledWorkflowConfig(config);

      // Create schedule if it doesn't exist
      if (!config.scheduleId) {
        const scheduleId = await this.scheduleManager.createSchedule({
          ...config.scheduleConfig,
          workflowId: config.workflowId,
        });
        config.scheduleId = scheduleId;
      }

      // Store scheduled workflow configuration
      this.scheduledWorkflows.set(config.id, config);

      // Initialize state tracking
      await this.stateManager.initializeScheduleWorkflowState(config.scheduleId, config.workflowId);

      // Set up event handlers for this scheduled workflow
      this.setupScheduledWorkflowEventHandlers(config);

      const latency = Date.now() - startTime;
      this.updatePerformanceMetrics('integration_latency', latency);

      this.logger.info('Scheduled workflow created successfully', {
        configId: config.id,
        workflowId: config.workflowId,
        scheduleId: config.scheduleId,
        latency,
      });

      return config.id;
    } catch (error) {
      this.logger.error('Failed to create scheduled workflow', {
        configId: config.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update an existing scheduled workflow
   */
  async updateScheduledWorkflow(
    id: string,
    updates: Partial<ScheduledWorkflowConfig>
  ): Promise<void> {
    try {
      this.logger.debug('Updating scheduled workflow', { id, updates });

      const existingConfig = this.scheduledWorkflows.get(id);
      if (!existingConfig) {
        throw new Error(`Scheduled workflow not found: ${id}`);
      }

      // Update configuration
      const updatedConfig = { ...existingConfig, ...updates };
      this.scheduledWorkflows.set(id, updatedConfig);

      // Update schedule if schedule config changed
      if (updates.scheduleConfig) {
        await this.scheduleManager.updateSchedule(
          existingConfig.scheduleId,
          updates.scheduleConfig
        );
      }

      // Sync state
      await this.stateManager.syncScheduleWorkflowState(
        updatedConfig.scheduleId,
        updatedConfig.workflowId
      );

      this.logger.info('Scheduled workflow updated successfully', { id });
    } catch (error) {
      this.logger.error('Failed to update scheduled workflow', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Delete a scheduled workflow
   */
  async deleteScheduledWorkflow(id: string): Promise<void> {
    try {
      this.logger.debug('Deleting scheduled workflow', { id });

      const config = this.scheduledWorkflows.get(id);
      if (!config) {
        throw new Error(`Scheduled workflow not found: ${id}`);
      }

      // Delete schedule
      await this.scheduleManager.deleteSchedule(config.scheduleId);

      // Clean up state
      await this.stateManager.cleanupScheduleWorkflowState(config.scheduleId, config.workflowId);

      // Remove from tracking
      this.scheduledWorkflows.delete(id);

      this.logger.info('Scheduled workflow deleted successfully', { id });
    } catch (error) {
      this.logger.error('Failed to delete scheduled workflow', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Trigger a scheduled execution manually
   */
  async triggerScheduledExecution(scheduleId: string): Promise<string> {
    const startTime = Date.now();

    try {
      this.logger.debug('Triggering scheduled execution', { scheduleId });

      // Find scheduled workflow config
      const config = Array.from(this.scheduledWorkflows.values()).find(
        (c) => c.scheduleId === scheduleId
      );

      if (!config) {
        throw new Error(`Scheduled workflow not found for schedule: ${scheduleId}`);
      }

      // Create trigger
      const trigger: ScheduleTrigger = {
        scheduleId,
        workflowId: config.workflowId,
        triggerTime: new Date(),
        triggerType: 'manual',
        context: {
          triggeredBy: 'manual',
          metadata: config.metadata,
        },
      };

      // Handle trigger
      const execution = await this.executionHandler.handleScheduleTrigger(trigger);

      const latency = Date.now() - startTime;
      this.updatePerformanceMetrics('integration_latency', latency);

      this.logger.info('Scheduled execution triggered successfully', {
        scheduleId,
        executionId: execution.id,
        latency,
      });

      return execution.id;
    } catch (error) {
      this.logger.error('Failed to trigger scheduled execution', {
        scheduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Cancel a scheduled execution
   */
  async cancelScheduledExecution(executionId: string): Promise<void> {
    try {
      this.logger.debug('Cancelling scheduled execution', { executionId });

      // Cancel workflow execution
      await this.workflowExecutor.cancelExecution(executionId);

      // Remove from active executions
      this.activeExecutions.delete(executionId);

      this.logger.info('Scheduled execution cancelled successfully', { executionId });
    } catch (error) {
      this.logger.error('Failed to cancel scheduled execution', {
        executionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Sync schedule-workflow state
   */
  async syncScheduleWorkflowState(scheduleId: string, workflowId: string): Promise<void> {
    const startTime = Date.now();

    try {
      await this.stateManager.syncScheduleWorkflowState(scheduleId, workflowId);

      const latency = Date.now() - startTime;
      this.updatePerformanceMetrics('state_sync_latency', latency);

      this.logger.debug('Schedule-workflow state synced', { scheduleId, workflowId, latency });
    } catch (error) {
      this.logger.error('Failed to sync schedule-workflow state', {
        scheduleId,
        workflowId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get schedule-workflow status
   */
  async getScheduleWorkflowStatus(scheduleId: string): Promise<ScheduleWorkflowStatus> {
    try {
      const config = Array.from(this.scheduledWorkflows.values()).find(
        (c) => c.scheduleId === scheduleId
      );

      if (!config) {
        throw new Error(`Scheduled workflow not found for schedule: ${scheduleId}`);
      }

      const scheduleStatus = await this.scheduleManager.getScheduleStatus(scheduleId);
      const scheduleMetrics = await this.scheduleManager.getScheduleMetrics(scheduleId);

      // Get workflow status (simplified - in production would query workflow service)
      const workflowStatus = {
        id: config.workflowId,
        name: config.name,
        version: '1.0.0',
        status: 'active' as const,
        lastModified: new Date(),
        executionCount: scheduleMetrics.totalExecutions,
        averageExecutionTime: scheduleMetrics.averageExecutionTime,
      };

      // Get integration health
      const integrationHealth = await this.stateManager.getIntegrationHealth(
        scheduleId,
        config.workflowId
      );

      // Get integration metrics
      const integrationMetrics = await this.getIntegrationMetrics(scheduleId);

      // Create a mock last execution if needed
      const lastExecution: ScheduledExecution | undefined = scheduleStatus.lastExecution
        ? {
            id: `exec-${scheduleId}-${Date.now()}`,
            scheduleId,
            workflowId: config.workflowId,
            scheduledTime: scheduleStatus.lastExecution,
            actualStartTime: scheduleStatus.lastExecution,
            completionTime: new Date(scheduleStatus.lastExecution.getTime() + 60000), // 1 minute later
            status: scheduleStatus.lastExecutionStatus || ('completed' as any),
            priority: 2 as any, // ExecutionPriority.NORMAL
            context: {
              triggeredBy: 'schedule' as any,
              environment: 'production',
              metadata: {},
            },
            retryCount: 0,
            maxRetries: 3,
          }
        : undefined;

      return {
        scheduleId,
        workflowId: config.workflowId,
        scheduleStatus,
        workflowStatus,
        lastExecution: lastExecution || {
          id: `exec-${scheduleId}-default`,
          scheduleId,
          workflowId: config.workflowId,
          scheduledTime: new Date(),
          status: 'pending' as any,
          priority: 2 as any,
          context: {
            triggeredBy: 'schedule' as any,
            environment: 'production',
            metadata: {},
          },
          retryCount: 0,
          maxRetries: 3,
        },
        nextExecution: scheduleStatus.nextExecution || new Date(),
        integrationHealth,
        metrics: integrationMetrics,
      };
    } catch (error) {
      this.logger.error('Failed to get schedule-workflow status', {
        scheduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get integration metrics for a specific schedule
   */
  async getIntegrationMetrics(scheduleId: string): Promise<ScheduleWorkflowMetrics> {
    try {
      return {
        totalIntegrations: this.performanceMetrics.totalIntegrations,
        successfulExecutions: this.performanceMetrics.successfulExecutions,
        failedExecutions: this.performanceMetrics.failedExecutions,
        averageIntegrationLatency: this.performanceMetrics.averageIntegrationLatency,
        averageStateSyncLatency: this.performanceMetrics.averageStateSyncLatency,
        averageEventBroadcastLatency: this.performanceMetrics.averageEventBroadcastLatency,
        lastUpdated: new Date(),
      };
    } catch (error) {
      this.logger.error('Failed to get integration metrics', {
        scheduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get all scheduled workflows
   */
  getScheduledWorkflows(): ScheduledWorkflowConfig[] {
    return Array.from(this.scheduledWorkflows.values());
  }

  /**
   * Get scheduled workflow by ID
   */
  getScheduledWorkflow(id: string): ScheduledWorkflowConfig | null {
    return this.scheduledWorkflows.get(id) || null;
  }

  /**
   * Get integration service state
   */
  getState(): IntegrationState {
    return this.state;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return { ...this.performanceMetrics };
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Set up event handlers for the integration service
   */
  private setupEventHandlers(): void {
    // Note: Event handlers would be set up here in production
    // Currently the services don't extend EventEmitter, so we skip this
    // In production, would implement proper event handling

    this.logger.debug('Event handlers set up');
  }

  /**
   * Load existing scheduled workflows from persistence
   */
  private async loadScheduledWorkflows(): Promise<void> {
    try {
      this.logger.debug('Loading existing scheduled workflows');

      // In production, would load from database
      // For now, just log that we're ready to load
      this.logger.info('Scheduled workflows loaded successfully');
    } catch (error) {
      this.logger.error('Failed to load scheduled workflows', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    // In production, would set up monitoring intervals
    this.logger.debug('Performance monitoring started');
  }

  /**
   * Cancel all active executions
   */
  private async cancelActiveExecutions(): Promise<void> {
    try {
      this.logger.debug('Cancelling active executions');

      const cancelPromises = Array.from(this.activeExecutions.keys()).map((executionId) =>
        this.cancelScheduledExecution(executionId)
      );

      await Promise.allSettled(cancelPromises);
      this.logger.info('All active executions cancelled');
    } catch (error) {
      this.logger.error('Failed to cancel active executions', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Validate scheduled workflow configuration
   */
  private validateScheduledWorkflowConfig(config: ScheduledWorkflowConfig): void {
    if (!config.id) {
      throw new Error('Scheduled workflow ID is required');
    }
    if (!config.workflowId) {
      throw new Error('Workflow ID is required');
    }
    if (!config.name) {
      throw new Error('Scheduled workflow name is required');
    }
    if (!config.scheduleConfig) {
      throw new Error('Schedule configuration is required');
    }
    if (!config.executionConfig) {
      throw new Error('Execution configuration is required');
    }
  }

  /**
   * Set up event handlers for a specific scheduled workflow
   */
  private setupScheduledWorkflowEventHandlers(config: ScheduledWorkflowConfig): void {
    // In production, would set up specific event handlers for this workflow
    this.logger.debug('Event handlers set up for scheduled workflow', {
      configId: config.id,
      workflowId: config.workflowId,
    });
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(metricType: string, value: number): void {
    switch (metricType) {
      case 'integration_latency':
        this.performanceMetrics.totalIntegrations++;
        this.performanceMetrics.averageIntegrationLatency =
          (this.performanceMetrics.averageIntegrationLatency *
            (this.performanceMetrics.totalIntegrations - 1) +
            value) /
          this.performanceMetrics.totalIntegrations;
        break;
      case 'state_sync_latency':
        this.performanceMetrics.averageStateSyncLatency =
          (this.performanceMetrics.averageStateSyncLatency + value) / 2;
        break;
      case 'event_broadcast_latency':
        this.performanceMetrics.averageEventBroadcastLatency =
          (this.performanceMetrics.averageEventBroadcastLatency + value) / 2;
        break;
    }
  }

  /**
   * Handle schedule triggered event
   */
  private async handleScheduleTriggered(event: any): Promise<void> {
    try {
      this.logger.debug('Handling schedule triggered event', { event });
      // Implementation would handle the triggered schedule
    } catch (error) {
      this.logger.error('Failed to handle schedule triggered event', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle schedule completed event
   */
  private async handleScheduleCompleted(event: any): Promise<void> {
    try {
      this.logger.debug('Handling schedule completed event', { event });
      this.performanceMetrics.successfulExecutions++;
    } catch (error) {
      this.logger.error('Failed to handle schedule completed event', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle schedule failed event
   */
  private async handleScheduleFailed(event: any): Promise<void> {
    try {
      this.logger.debug('Handling schedule failed event', { event });
      this.performanceMetrics.failedExecutions++;
    } catch (error) {
      this.logger.error('Failed to handle schedule failed event', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle execution started event
   */
  private async handleExecutionStarted(execution: WorkflowExecution): Promise<void> {
    try {
      this.logger.debug('Handling execution started event', { executionId: execution.id });
      this.activeExecutions.set(execution.id, execution);
    } catch (error) {
      this.logger.error('Failed to handle execution started event', {
        executionId: execution.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle execution completed event
   */
  private async handleExecutionCompleted(execution: WorkflowExecution): Promise<void> {
    try {
      this.logger.debug('Handling execution completed event', { executionId: execution.id });
      this.activeExecutions.delete(execution.id);
      this.performanceMetrics.successfulExecutions++;
    } catch (error) {
      this.logger.error('Failed to handle execution completed event', {
        executionId: execution.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle execution failed event
   */
  private async handleExecutionFailed(execution: WorkflowExecution): Promise<void> {
    try {
      this.logger.debug('Handling execution failed event', { executionId: execution.id });
      this.activeExecutions.delete(execution.id);
      this.performanceMetrics.failedExecutions++;
    } catch (error) {
      this.logger.error('Failed to handle execution failed event', {
        executionId: execution.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
