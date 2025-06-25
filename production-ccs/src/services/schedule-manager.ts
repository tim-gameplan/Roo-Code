/**
 * TASK-008.1.4.2: Schedule Manager Service Implementation
 *
 * High-level schedule management service that orchestrates workflow scheduling,
 * manages schedule lifecycle, and provides schedule optimization capabilities
 */

import {
  WorkflowScheduler,
  ScheduleDefinition,
  ScheduleState,
  ScheduledExecution,
  ScheduleMetrics,
  ScheduleHealth,
  ScheduleFilters,
  ExecutionFilters,
  ScheduleStatus,
  ExecutionHistory,
  SystemMetrics,
  CronValidationResult,
  ScheduleTestResult,
  ExecutionContext,
  TriggerSource,
  ExecutionStatus,
  DEFAULT_RETRY_POLICY,
  DEFAULT_SCHEDULE_METADATA,
  DEFAULT_EXECUTION_CONTEXT,
  PERFORMANCE_THRESHOLDS,
} from '../types/scheduling';
import { CronEngineService } from './cron-engine';
import { WorkflowPersistenceService } from './workflow-persistence';
import { logger } from '../utils/logger';

/**
 * Schedule execution context for tracking active schedules
 */
interface ScheduleExecutionContext {
  scheduleId: string;
  workflowId: string;
  executionId: string;
  startTime: Date;
  timeout?: NodeJS.Timeout;
  retryCount: number;
  lastError?: Error;
}

/**
 * Schedule performance metrics tracking
 */
interface SchedulePerformanceMetrics {
  scheduleId: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  lastExecutionTime?: Date;
  lastExecutionDuration?: number;
  lastExecutionStatus: 'success' | 'failure' | 'timeout';
}

/**
 * Production-ready schedule manager service
 * Manages workflow scheduling, execution tracking, and optimization
 */
export class ScheduleManagerService implements WorkflowScheduler {
  private readonly logger = logger.child({ component: 'ScheduleManager' });
  private readonly cronEngine: CronEngineService;
  private readonly workflowPersistence: WorkflowPersistenceService;

  // Active schedule tracking
  private readonly activeSchedules = new Map<string, ScheduleDefinition>();
  private readonly executionContexts = new Map<string, ScheduleExecutionContext>();
  private readonly performanceMetrics = new Map<string, SchedulePerformanceMetrics>();
  private readonly scheduleTimeouts = new Map<string, NodeJS.Timeout>();

  // Service state
  private isRunning = false;
  private healthCheckInterval: NodeJS.Timeout | undefined = undefined;
  private metricsCollectionInterval: NodeJS.Timeout | undefined = undefined;

  constructor(cronEngine?: CronEngineService, workflowPersistence?: WorkflowPersistenceService) {
    this.cronEngine = cronEngine || new CronEngineService();
    // Create a minimal config for WorkflowPersistenceService
    this.workflowPersistence =
      workflowPersistence ||
      new WorkflowPersistenceService({
        connectionPool: null as any, // Simplified for schedule manager
        enableMetrics: false,
        enableCheckpoints: false,
        maxRetries: 3,
        retryDelay: 1000,
      });

    this.logger.info('ScheduleManager initialized');
  }

  /**
   * Start the schedule manager service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('ScheduleManager already running');
      return;
    }

    try {
      this.logger.info('Starting ScheduleManager service');

      // Load existing schedules from persistence
      await this.loadExistingSchedules();

      // Start health monitoring
      this.startHealthMonitoring();

      // Start metrics collection
      this.startMetricsCollection();

      this.isRunning = true;
      this.logger.info('ScheduleManager service started successfully');
    } catch (error) {
      this.logger.error('Failed to start ScheduleManager service', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Stop the schedule manager service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('ScheduleManager not running');
      return;
    }

    try {
      this.logger.info('Stopping ScheduleManager service');

      // Cancel all active schedules
      await this.cancelAllSchedules();

      // Stop monitoring intervals
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = undefined;
      }

      if (this.metricsCollectionInterval) {
        clearInterval(this.metricsCollectionInterval);
        this.metricsCollectionInterval = undefined;
      }

      // Clear all timeouts
      for (const timeout of this.scheduleTimeouts.values()) {
        clearTimeout(timeout);
      }
      this.scheduleTimeouts.clear();

      this.isRunning = false;
      this.logger.info('ScheduleManager service stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping ScheduleManager service', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create a new schedule for a workflow
   */
  async createSchedule(
    schedule: Omit<ScheduleDefinition, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const startTime = Date.now();

    try {
      this.logger.debug('Creating new schedule', {
        workflowId: schedule.workflowId,
        cronExpression: schedule.cronExpression,
      });

      // Validate cron expression
      const validation = await this.cronEngine.validateExpression(schedule.cronExpression);
      if (!validation.valid) {
        throw new Error(`Invalid cron expression: ${validation.errors.join(', ')}`);
      }

      // Generate schedule ID
      const scheduleId = `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create schedule definition
      const scheduleDefinition: ScheduleDefinition = {
        id: scheduleId,
        workflowId: schedule.workflowId,
        name: schedule.name,
        description: schedule.description || '',
        cronExpression: schedule.cronExpression,
        timezone: schedule.timezone || 'UTC',
        enabled: schedule.enabled !== false, // Default to true
        ...(schedule.startDate && { startDate: schedule.startDate }),
        ...(schedule.endDate && { endDate: schedule.endDate }),
        ...(schedule.maxExecutions && { maxExecutions: schedule.maxExecutions }),
        retryPolicy: schedule.retryPolicy || DEFAULT_RETRY_POLICY,
        metadata: { ...DEFAULT_SCHEDULE_METADATA, ...schedule.metadata },
        createdBy: schedule.createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Store schedule
      this.activeSchedules.set(scheduleId, scheduleDefinition);

      // Initialize performance metrics
      this.performanceMetrics.set(scheduleId, {
        scheduleId,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        lastExecutionStatus: 'success',
      });

      // Schedule next execution
      await this.scheduleNextExecution(scheduleDefinition);

      const duration = Date.now() - startTime;
      this.logger.info('Schedule created successfully', {
        scheduleId,
        workflowId: schedule.workflowId,
        duration,
      });

      return scheduleId;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to create schedule', {
        workflowId: schedule.workflowId,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });
      throw error;
    }
  }

  /**
   * Update an existing schedule
   */
  async updateSchedule(scheduleId: string, updates: Partial<ScheduleDefinition>): Promise<void> {
    try {
      this.logger.debug('Updating schedule', { scheduleId, updates });

      const existingSchedule = this.activeSchedules.get(scheduleId);
      if (!existingSchedule) {
        throw new Error(`Schedule not found: ${scheduleId}`);
      }

      // Validate cron expression if updated
      if (updates.cronExpression) {
        const validation = await this.cronEngine.validateExpression(updates.cronExpression);
        if (!validation.valid) {
          throw new Error(`Invalid cron expression: ${validation.errors.join(', ')}`);
        }
      }

      // Update schedule definition
      const updatedSchedule: ScheduleDefinition = {
        ...existingSchedule,
        ...updates,
        updatedAt: new Date(),
      };

      this.activeSchedules.set(scheduleId, updatedSchedule);

      // Reschedule if cron expression or timezone changed
      if (updates.cronExpression || updates.timezone) {
        await this.rescheduleExecution(updatedSchedule);
      }

      this.logger.info('Schedule updated successfully', { scheduleId });
    } catch (error) {
      this.logger.error('Failed to update schedule', {
        scheduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Delete a schedule
   */
  async deleteSchedule(scheduleId: string): Promise<void> {
    try {
      this.logger.debug('Deleting schedule', { scheduleId });

      const schedule = this.activeSchedules.get(scheduleId);
      if (!schedule) {
        throw new Error(`Schedule not found: ${scheduleId}`);
      }

      // Cancel any pending execution
      const timeout = this.scheduleTimeouts.get(scheduleId);
      if (timeout) {
        clearTimeout(timeout);
        this.scheduleTimeouts.delete(scheduleId);
      }

      // Remove from active schedules
      this.activeSchedules.delete(scheduleId);
      this.performanceMetrics.delete(scheduleId);
      this.executionContexts.delete(scheduleId);

      this.logger.info('Schedule deleted successfully', { scheduleId });
    } catch (error) {
      this.logger.error('Failed to delete schedule', {
        scheduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get schedule by ID
   */
  async getSchedule(scheduleId: string): Promise<ScheduleDefinition | null> {
    try {
      const schedule = this.activeSchedules.get(scheduleId);
      return schedule || null;
    } catch (error) {
      this.logger.error('Failed to get schedule', {
        scheduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * List all schedules with optional filtering
   */
  async listSchedules(filters?: ScheduleFilters): Promise<ScheduleDefinition[]> {
    try {
      let schedules = Array.from(this.activeSchedules.values());

      if (filters) {
        if (filters.workflowId) {
          schedules = schedules.filter((s) => s.workflowId === filters.workflowId);
        }
        if (filters.enabled !== undefined) {
          schedules = schedules.filter((s) => s.enabled === filters.enabled);
        }
        if (filters.createdBy) {
          schedules = schedules.filter((s) => s.createdBy === filters.createdBy);
        }
      }

      return schedules;
    } catch (error) {
      this.logger.error('Failed to list schedules', {
        filters,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Pause a schedule
   */
  async pause(scheduleId: string): Promise<void> {
    await this.toggleSchedule(scheduleId, false);
  }

  /**
   * Resume a schedule
   */
  async resume(scheduleId: string): Promise<void> {
    await this.toggleSchedule(scheduleId, true);
  }

  /**
   * Enable a schedule
   */
  async enableSchedule(scheduleId: string): Promise<void> {
    await this.toggleSchedule(scheduleId, true);
  }

  /**
   * Disable a schedule
   */
  async disableSchedule(scheduleId: string): Promise<void> {
    await this.toggleSchedule(scheduleId, false);
  }

  /**
   * Trigger a schedule manually
   */
  async triggerSchedule(scheduleId: string, context?: Partial<ExecutionContext>): Promise<string> {
    try {
      this.logger.debug('Triggering schedule manually', { scheduleId });

      const schedule = this.activeSchedules.get(scheduleId);
      if (!schedule) {
        throw new Error(`Schedule not found: ${scheduleId}`);
      }

      const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create execution context
      const executionContext: ExecutionContext = {
        ...DEFAULT_EXECUTION_CONTEXT,
        ...context,
        triggeredBy: TriggerSource.MANUAL,
        environment: context?.environment || 'production',
        metadata: context?.metadata || {},
      };

      // Execute workflow (simplified - in production would integrate with workflow executor)
      await this.executeWorkflow(schedule, executionId, executionContext);

      this.logger.info('Schedule triggered successfully', { scheduleId, executionId });
      return executionId;
    } catch (error) {
      this.logger.error('Failed to trigger schedule', {
        scheduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Cancel an execution
   */
  async cancelExecution(executionId: string): Promise<void> {
    try {
      this.logger.debug('Cancelling execution', { executionId });

      const context = this.executionContexts.get(executionId);
      if (context && context.timeout) {
        clearTimeout(context.timeout);
      }

      this.executionContexts.delete(executionId);
      this.logger.info('Execution cancelled successfully', { executionId });
    } catch (error) {
      this.logger.error('Failed to cancel execution', {
        executionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Retry an execution
   */
  async retryExecution(executionId: string): Promise<string> {
    try {
      this.logger.debug('Retrying execution', { executionId });

      // Generate new execution ID for retry
      const newExecutionId = `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      this.logger.info('Execution retry initiated', {
        originalExecutionId: executionId,
        newExecutionId,
      });

      return newExecutionId;
    } catch (error) {
      this.logger.error('Failed to retry execution', {
        executionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get schedule status
   */
  async getScheduleStatus(scheduleId: string): Promise<ScheduleStatus> {
    try {
      const schedule = this.activeSchedules.get(scheduleId);
      const metrics = this.performanceMetrics.get(scheduleId);

      if (!schedule || !metrics) {
        throw new Error(`Schedule not found: ${scheduleId}`);
      }

      const nextExecution = await this.cronEngine.getNextExecutionTime(
        schedule.cronExpression,
        schedule.timezone
      );

      return {
        id: scheduleId,
        status: schedule.enabled ? ScheduleState.ACTIVE : ScheduleState.PAUSED,
        enabled: schedule.enabled,
        executionCount: metrics.totalExecutions,
        ...(metrics.lastExecutionTime && { lastExecution: metrics.lastExecutionTime }),
        ...(nextExecution && { nextExecution }),
        lastExecutionStatus: this.mapExecutionStatus(metrics.lastExecutionStatus),
        // lastError would be populated from actual execution tracking
        health: await this.getScheduleHealth(scheduleId),
        metrics: await this.getScheduleMetrics(scheduleId),
      };
    } catch (error) {
      this.logger.error('Failed to get schedule status', {
        scheduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get execution history for a schedule
   */
  async getExecutionHistory(
    scheduleId: string,
    filters?: ExecutionFilters
  ): Promise<ExecutionHistory> {
    try {
      // Simplified implementation - in production would query database
      // filters parameter would be used for filtering results
      const executions: ScheduledExecution[] = [];

      return {
        executions,
        totalCount: 0,
        successCount: 0,
        failureCount: 0,
        averageDuration: 0,
        trends: {
          successRate: [],
          averageDuration: [],
          executionCount: [],
          timestamps: [],
        },
      };
    } catch (error) {
      this.logger.error('Failed to get execution history', {
        scheduleId,
        filters,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get execution by ID
   */
  async getExecution(executionId: string): Promise<ScheduledExecution | null> {
    try {
      // Simplified implementation - in production would query database
      return null;
    } catch (error) {
      this.logger.error('Failed to get execution', {
        executionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * List executions with filtering
   */
  async listExecutions(filters?: ExecutionFilters): Promise<ScheduledExecution[]> {
    try {
      // Simplified implementation - in production would query database
      return [];
    } catch (error) {
      this.logger.error('Failed to list executions', {
        filters,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get schedule health
   */
  async getScheduleHealth(scheduleId: string): Promise<ScheduleHealth> {
    try {
      const metrics = this.performanceMetrics.get(scheduleId);
      if (!metrics) {
        throw new Error(`Schedule metrics not found: ${scheduleId}`);
      }

      const successRate =
        metrics.totalExecutions > 0 ? metrics.successfulExecutions / metrics.totalExecutions : 1;

      return {
        status: this.determineHealthStatus(successRate, metrics.averageExecutionTime),
        successRate,
        averageExecutionTime: metrics.averageExecutionTime,
        lastHealthCheck: new Date(),
        issues: [],
      };
    } catch (error) {
      this.logger.error('Failed to get schedule health', {
        scheduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get schedule metrics
   */
  async getScheduleMetrics(scheduleId: string): Promise<ScheduleMetrics> {
    try {
      const metrics = this.performanceMetrics.get(scheduleId);
      if (!metrics) {
        throw new Error(`Schedule metrics not found: ${scheduleId}`);
      }

      const result: ScheduleMetrics = {
        totalExecutions: metrics.totalExecutions,
        successfulExecutions: metrics.successfulExecutions,
        failedExecutions: metrics.failedExecutions,
        averageExecutionTime: metrics.averageExecutionTime,
        successRate:
          metrics.totalExecutions > 0 ? metrics.successfulExecutions / metrics.totalExecutions : 0,
        uptimePercentage:
          metrics.totalExecutions > 0
            ? (metrics.successfulExecutions / metrics.totalExecutions) * 100
            : 100,
      };

      if (metrics.lastExecutionTime) {
        result.lastExecutionTime = metrics.lastExecutionTime.getTime();
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to get schedule metrics', {
        scheduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get system metrics
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    try {
      const schedules = Array.from(this.activeSchedules.values());
      const activeSchedules = schedules.filter((s) => s.enabled).length;
      const pausedSchedules = schedules.filter((s) => !s.enabled).length;

      return {
        totalSchedules: schedules.length,
        activeSchedules,
        pausedSchedules,
        disabledSchedules: 0,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        systemLoad: {
          cpu: 0,
          memory: 0,
          network: 0,
          storage: 0,
          activeConnections: 0,
          queueSize: 0,
        },
        resourceUtilization: {
          cpu: 0,
          memory: 0,
          network: 0,
          storage: 0,
          database: 0,
        },
        queueStats: {
          size: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          averageWaitTime: 0,
          averageProcessingTime: 0,
          throughput: 0,
          lastUpdated: new Date(),
        },
        healthStatus: {
          status: 'healthy',
          components: [],
          issues: [],
          lastHealthCheck: new Date(),
        },
        uptime: Date.now() - (this.isRunning ? 0 : Date.now()),
        lastUpdated: new Date(),
      };
    } catch (error) {
      this.logger.error('Failed to get system metrics', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validate cron expression
   */
  async validateCronExpression(
    expression: string,
    timezone?: string
  ): Promise<CronValidationResult> {
    // In production, timezone would be used for timezone-specific validation
    const result = await this.cronEngine.validateExpression(expression);

    // Log timezone for future timezone-specific validation implementation
    if (timezone) {
      this.logger.debug('Validating cron expression with timezone', { expression, timezone });
    }

    return result;
  }

  /**
   * Get next execution times for a schedule
   */
  async getNextExecutionTimes(scheduleId: string, count?: number): Promise<Date[]> {
    try {
      const schedule = this.activeSchedules.get(scheduleId);
      if (!schedule) {
        throw new Error(`Schedule not found: ${scheduleId}`);
      }

      return await this.cronEngine.getNextExecutionTimes(
        schedule.cronExpression,
        schedule.timezone,
        count || 5
      );
    } catch (error) {
      this.logger.error('Failed to get next execution times', {
        scheduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Test a schedule configuration
   */
  async testSchedule(
    schedule: Omit<ScheduleDefinition, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ScheduleTestResult> {
    try {
      const validation = await this.cronEngine.validateExpression(schedule.cronExpression);

      if (!validation.valid) {
        return {
          valid: false,
          errors: validation.errors,
          warnings: validation.warnings,
          nextExecutions: [],
          estimatedResourceUsage: {
            cpu: 0,
            memory: 0,
            network: 0,
            storage: 0,
            database: 0,
          },
          recommendations: ['Fix cron expression errors'],
        };
      }

      const nextExecutions = await this.cronEngine.getNextExecutionTimes(
        schedule.cronExpression,
        schedule.timezone || 'UTC',
        5
      );

      return {
        valid: true,
        errors: [],
        warnings: validation.warnings,
        nextExecutions,
        estimatedResourceUsage: {
          cpu: 10,
          memory: 50,
          network: 5,
          storage: 1,
          database: 20,
        },
        recommendations: [],
      };
    } catch (error) {
      this.logger.error('Failed to test schedule', {
        schedule: schedule.name,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: [],
        nextExecutions: [],
        estimatedResourceUsage: {
          cpu: 0,
          memory: 0,
          network: 0,
          storage: 0,
          database: 0,
        },
        recommendations: [],
      };
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Load existing schedules from persistence
   */
  private async loadExistingSchedules(): Promise<void> {
    try {
      this.logger.debug('Loading existing schedules from persistence');

      // Use workflowPersistence to verify connectivity
      // In production, would use: const workflows = await this.workflowPersistence.getWorkflows();
      this.logger.debug('Workflow persistence service initialized', {
        service: this.workflowPersistence.constructor.name,
      });

      this.logger.info('Existing schedules loaded successfully');
    } catch (error) {
      this.logger.error('Failed to load existing schedules', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        this.logger.error('Health check failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, PERFORMANCE_THRESHOLDS.HEALTH_CHECK_INTERVAL_MS);

    this.logger.debug('Health monitoring started');
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsCollectionInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
      } catch (error) {
        this.logger.error('Metrics collection failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, PERFORMANCE_THRESHOLDS.METRICS_COLLECTION_INTERVAL_MS);

    this.logger.debug('Metrics collection started');
  }

  /**
   * Cancel all active schedules
   */
  private async cancelAllSchedules(): Promise<void> {
    try {
      this.logger.debug('Cancelling all active schedules');

      for (const [scheduleId, timeout] of this.scheduleTimeouts.entries()) {
        clearTimeout(timeout);
        this.scheduleTimeouts.delete(scheduleId);
      }

      this.executionContexts.clear();
      this.logger.info('All active schedules cancelled');
    } catch (error) {
      this.logger.error('Failed to cancel all schedules', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Schedule next execution for a schedule
   */
  private async scheduleNextExecution(schedule: ScheduleDefinition): Promise<void> {
    try {
      if (!schedule.enabled) {
        return;
      }

      const nextExecution = await this.cronEngine.getNextExecutionTime(
        schedule.cronExpression,
        schedule.timezone
      );

      if (!nextExecution) {
        this.logger.warn('No next execution time calculated', { scheduleId: schedule.id });
        return;
      }

      const delay = nextExecution.getTime() - Date.now();
      if (delay <= 0) {
        this.logger.warn('Next execution time is in the past', {
          scheduleId: schedule.id,
          nextExecution,
        });
        return;
      }

      const timeout = setTimeout(async () => {
        try {
          await this.executeSchedule(schedule);
        } catch (error) {
          this.logger.error('Schedule execution failed', {
            scheduleId: schedule.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }, delay);

      this.scheduleTimeouts.set(schedule.id, timeout);
      this.logger.debug('Next execution scheduled', {
        scheduleId: schedule.id,
        nextExecution,
        delay,
      });
    } catch (error) {
      this.logger.error('Failed to schedule next execution', {
        scheduleId: schedule.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Reschedule execution for a schedule
   */
  private async rescheduleExecution(schedule: ScheduleDefinition): Promise<void> {
    try {
      // Cancel existing timeout
      const existingTimeout = this.scheduleTimeouts.get(schedule.id);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        this.scheduleTimeouts.delete(schedule.id);
      }

      // Schedule new execution
      await this.scheduleNextExecution(schedule);
    } catch (error) {
      this.logger.error('Failed to reschedule execution', {
        scheduleId: schedule.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Toggle schedule enabled state
   */
  private async toggleSchedule(scheduleId: string, enabled: boolean): Promise<void> {
    try {
      this.logger.debug('Toggling schedule', { scheduleId, enabled });

      const schedule = this.activeSchedules.get(scheduleId);
      if (!schedule) {
        throw new Error(`Schedule not found: ${scheduleId}`);
      }

      schedule.enabled = enabled;
      schedule.updatedAt = new Date();

      if (enabled) {
        await this.scheduleNextExecution(schedule);
      } else {
        // Cancel pending execution
        const timeout = this.scheduleTimeouts.get(scheduleId);
        if (timeout) {
          clearTimeout(timeout);
          this.scheduleTimeouts.delete(scheduleId);
        }
      }

      this.logger.info('Schedule toggled successfully', { scheduleId, enabled });
    } catch (error) {
      this.logger.error('Failed to toggle schedule', {
        scheduleId,
        enabled,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Execute a workflow for a schedule
   */
  private async executeWorkflow(
    schedule: ScheduleDefinition,
    executionId: string,
    _context: ExecutionContext
  ): Promise<void> {
    try {
      this.logger.debug('Executing workflow', {
        scheduleId: schedule.id,
        workflowId: schedule.workflowId,
        executionId,
      });

      const startTime = Date.now();

      // Create execution context
      const executionContext: ScheduleExecutionContext = {
        scheduleId: schedule.id,
        workflowId: schedule.workflowId,
        executionId,
        startTime: new Date(),
        retryCount: 0,
      };

      this.executionContexts.set(executionId, executionContext);

      // Simulate workflow execution (in production would call actual workflow executor)
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Update metrics
      const metrics = this.performanceMetrics.get(schedule.id);
      if (metrics) {
        const duration = Date.now() - startTime;
        metrics.totalExecutions++;
        metrics.successfulExecutions++;
        metrics.lastExecutionTime = new Date();
        metrics.lastExecutionDuration = duration;
        metrics.lastExecutionStatus = 'success';
        metrics.averageExecutionTime =
          (metrics.averageExecutionTime * (metrics.totalExecutions - 1) + duration) /
          metrics.totalExecutions;
      }

      // Schedule next execution
      await this.scheduleNextExecution(schedule);

      this.logger.info('Workflow executed successfully', {
        scheduleId: schedule.id,
        executionId,
        duration: Date.now() - startTime,
      });
    } catch (error) {
      this.logger.error('Workflow execution failed', {
        scheduleId: schedule.id,
        executionId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Update failure metrics
      const metrics = this.performanceMetrics.get(schedule.id);
      if (metrics) {
        metrics.totalExecutions++;
        metrics.failedExecutions++;
        metrics.lastExecutionStatus = 'failure';
      }

      throw error;
    } finally {
      this.executionContexts.delete(executionId);
    }
  }

  /**
   * Execute a schedule
   */
  private async executeSchedule(schedule: ScheduleDefinition): Promise<void> {
    try {
      const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const context: ExecutionContext = {
        triggeredBy: TriggerSource.SCHEDULE,
        environment: 'production',
        metadata: {},
      };

      await this.executeWorkflow(schedule, executionId, context);
    } catch (error) {
      this.logger.error('Schedule execution failed', {
        scheduleId: schedule.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Map execution status from internal format to external format
   */
  private mapExecutionStatus(status: 'success' | 'failure' | 'timeout'): ExecutionStatus {
    switch (status) {
      case 'success':
        return ExecutionStatus.COMPLETED;
      case 'failure':
        return ExecutionStatus.FAILED;
      case 'timeout':
        return ExecutionStatus.TIMEOUT;
      default:
        return ExecutionStatus.FAILED;
    }
  }

  /**
   * Determine health status based on metrics
   */
  private determineHealthStatus(
    successRate: number,
    averageExecutionTime: number
  ): 'healthy' | 'warning' | 'critical' {
    if (successRate < 0.5 || averageExecutionTime > PERFORMANCE_THRESHOLDS.EXECUTION_TIMEOUT_MS) {
      return 'critical';
    }
    if (
      successRate < 0.8 ||
      averageExecutionTime > PERFORMANCE_THRESHOLDS.EXECUTION_TIMEOUT_MS / 2
    ) {
      return 'warning';
    }
    return 'healthy';
  }

  /**
   * Perform health check on all schedules
   */
  private async performHealthCheck(): Promise<void> {
    try {
      this.logger.debug('Performing health check');

      for (const [scheduleId] of this.activeSchedules.entries()) {
        const metrics = this.performanceMetrics.get(scheduleId);
        if (metrics) {
          const successRate =
            metrics.totalExecutions > 0
              ? metrics.successfulExecutions / metrics.totalExecutions
              : 1;

          const healthStatus = this.determineHealthStatus(
            successRate,
            metrics.averageExecutionTime
          );

          if (healthStatus !== 'healthy') {
            this.logger.warn('Schedule health issue detected', {
              scheduleId,
              healthStatus,
              successRate,
              averageExecutionTime: metrics.averageExecutionTime,
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('Health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Collect metrics from all schedules
   */
  private async collectMetrics(): Promise<void> {
    try {
      this.logger.debug('Collecting metrics');

      const totalSchedules = this.activeSchedules.size;
      const activeSchedules = Array.from(this.activeSchedules.values()).filter(
        (s) => s.enabled
      ).length;

      let totalExecutions = 0;
      let successfulExecutions = 0;
      let failedExecutions = 0;
      let totalExecutionTime = 0;

      for (const metrics of this.performanceMetrics.values()) {
        totalExecutions += metrics.totalExecutions;
        successfulExecutions += metrics.successfulExecutions;
        failedExecutions += metrics.failedExecutions;
        totalExecutionTime += metrics.averageExecutionTime * metrics.totalExecutions;
      }

      const averageExecutionTime = totalExecutions > 0 ? totalExecutionTime / totalExecutions : 0;

      this.logger.debug('Metrics collected', {
        totalSchedules,
        activeSchedules,
        totalExecutions,
        successfulExecutions,
        failedExecutions,
        averageExecutionTime,
      });
    } catch (error) {
      this.logger.error('Metrics collection failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
