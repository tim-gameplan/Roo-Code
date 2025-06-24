/**
 * Workflow Persistence Service - TASK-008.1.3
 * Implements database persistence layer for workflow definitions, executions, and state management
 * Provides comprehensive CRUD operations and state recovery mechanisms
 */

import { Pool } from 'pg';
import {
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowState,
  WorkflowResult,
  ExecutionContext,
  ExecutionMetrics,
  WorkflowDefinitionInput,
  ExecutionStatus,
  StepExecutionStatus,
} from '../types/workflow';
import { logger } from '../utils/logger';

export interface WorkflowPersistenceConfig {
  connectionPool: Pool;
  enableMetrics: boolean;
  enableCheckpoints: boolean;
  maxRetries: number;
  retryDelay: number;
}

export interface WorkflowQueryOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  filters?: Record<string, any>;
}

export interface ExecutionQueryOptions extends WorkflowQueryOptions {
  status?: ExecutionStatus[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  workflowId?: string;
  triggeredBy?: string;
}

export class WorkflowPersistenceService {
  private pool: Pool;
  private config: WorkflowPersistenceConfig;

  constructor(config: WorkflowPersistenceConfig) {
    this.pool = config.connectionPool;
    this.config = config;
  }

  // ==================== Workflow Definition Management ====================

  /**
   * Save a new workflow definition to the database
   */
  async saveWorkflow(workflow: WorkflowDefinitionInput): Promise<string> {
    const client = await this.pool.connect();
    try {
      const query = `
        INSERT INTO workflows (
          name, version, description, definition, status, created_by,
          tags, category, priority, environment, estimated_duration
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `;

      const values = [
        workflow.name,
        workflow.version,
        workflow.description,
        JSON.stringify(workflow),
        workflow.status,
        workflow.createdBy,
        workflow.metadata.tags,
        workflow.metadata.category,
        workflow.metadata.priority,
        workflow.metadata.environment,
        workflow.metadata.estimatedDuration,
      ];

      const result = await client.query(query, values);
      const workflowId = result.rows[0].id;

      logger.info('Workflow definition saved', {
        workflowId,
        name: workflow.name,
        version: workflow.version,
      });

      return workflowId;
    } catch (error) {
      logger.error('Failed to save workflow definition', {
        error: (error as Error).message,
        workflow: workflow.name,
      });
      throw new Error(`Failed to save workflow: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Load a workflow definition by ID
   */
  async loadWorkflow(workflowId: string): Promise<WorkflowDefinition | null> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT * FROM workflows WHERE id = $1
      `;

      const result = await client.query(query, [workflowId]);
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return this.mapRowToWorkflowDefinition(row);
    } catch (error) {
      logger.error('Failed to load workflow definition', {
        error: (error as Error).message,
        workflowId,
      });
      throw new Error(`Failed to load workflow: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Load a workflow definition by name and version
   */
  async loadWorkflowByNameVersion(
    name: string,
    version: string
  ): Promise<WorkflowDefinition | null> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT * FROM workflows WHERE name = $1 AND version = $2
      `;

      const result = await client.query(query, [name, version]);
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return this.mapRowToWorkflowDefinition(row);
    } catch (error) {
      logger.error('Failed to load workflow by name/version', {
        error: (error as Error).message,
        name,
        version,
      });
      throw new Error(`Failed to load workflow: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Update an existing workflow definition
   */
  async updateWorkflow(
    workflowId: string,
    updates: Partial<WorkflowDefinitionInput>
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.name !== undefined) {
        setClauses.push(`name = $${paramIndex++}`);
        values.push(updates.name);
      }
      if (updates.description !== undefined) {
        setClauses.push(`description = $${paramIndex++}`);
        values.push(updates.description);
      }
      if (updates.status !== undefined) {
        setClauses.push(`status = $${paramIndex++}`);
        values.push(updates.status);
      }
      if (updates.metadata) {
        if (updates.metadata.tags !== undefined) {
          setClauses.push(`tags = $${paramIndex++}`);
          values.push(updates.metadata.tags);
        }
        if (updates.metadata.category !== undefined) {
          setClauses.push(`category = $${paramIndex++}`);
          values.push(updates.metadata.category);
        }
        if (updates.metadata.priority !== undefined) {
          setClauses.push(`priority = $${paramIndex++}`);
          values.push(updates.metadata.priority);
        }
        if (updates.metadata.environment !== undefined) {
          setClauses.push(`environment = $${paramIndex++}`);
          values.push(updates.metadata.environment);
        }
        if (updates.metadata.estimatedDuration !== undefined) {
          setClauses.push(`estimated_duration = $${paramIndex++}`);
          values.push(updates.metadata.estimatedDuration);
        }
      }

      if (setClauses.length === 0) {
        return; // No updates to apply
      }

      setClauses.push(`updated_at = NOW()`);
      values.push(workflowId);

      const query = `
        UPDATE workflows 
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex}
      `;

      await client.query(query, values);

      logger.info('Workflow definition updated', { workflowId, updates });
    } catch (error) {
      logger.error('Failed to update workflow definition', {
        error: (error as Error).message,
        workflowId,
      });
      throw new Error(`Failed to update workflow: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  /**
   * List workflows with optional filtering and pagination
   */
  async listWorkflows(options: WorkflowQueryOptions = {}): Promise<{
    workflows: WorkflowDefinition[];
    total: number;
  }> {
    const client = await this.pool.connect();
    try {
      const {
        limit = 50,
        offset = 0,
        sortBy = 'created_at',
        sortOrder = 'DESC',
        filters = {},
      } = options;

      // Build WHERE clause
      const whereClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (filters['status']) {
        whereClauses.push(`status = $${paramIndex++}`);
        values.push(filters['status']);
      }
      if (filters['category']) {
        whereClauses.push(`category = $${paramIndex++}`);
        values.push(filters['category']);
      }
      if (filters['createdBy']) {
        whereClauses.push(`created_by = $${paramIndex++}`);
        values.push(filters['createdBy']);
      }
      if (filters['tags'] && filters['tags'].length > 0) {
        whereClauses.push(`tags && $${paramIndex++}`);
        values.push(filters['tags']);
      }

      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      // Count query
      const countQuery = `SELECT COUNT(*) FROM workflows ${whereClause}`;
      const countResult = await client.query(countQuery, values);
      const total = parseInt(countResult.rows[0].count);

      // Data query
      const dataQuery = `
        SELECT * FROM workflows 
        ${whereClause}
        ORDER BY ${sortBy} ${sortOrder}
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      values.push(limit, offset);

      const dataResult = await client.query(dataQuery, values);
      const workflows = dataResult.rows.map((row) => this.mapRowToWorkflowDefinition(row));

      return { workflows, total };
    } catch (error) {
      logger.error('Failed to list workflows', { error: (error as Error).message, options });
      throw new Error(`Failed to list workflows: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  // ==================== Workflow Execution Management ====================

  /**
   * Create a new workflow execution record
   */
  async createExecution(
    workflowId: string,
    context: ExecutionContext,
    triggeredBy: string,
    triggerType: string = 'manual'
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get workflow version
      const workflowQuery = 'SELECT version FROM workflows WHERE id = $1';
      const workflowResult = await client.query(workflowQuery, [workflowId]);

      if (workflowResult.rows.length === 0) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      const workflowVersion = workflowResult.rows[0].version;

      // Create execution record
      const executionQuery = `
        INSERT INTO workflow_executions (
          workflow_id, workflow_version, status, context, triggered_by, 
          trigger_type, correlation_id, parent_execution_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `;

      const executionValues = [
        workflowId,
        workflowVersion,
        'pending',
        JSON.stringify(context),
        triggeredBy,
        triggerType,
        context.correlationId,
        context.parentExecutionId || null,
        JSON.stringify({
          source: 'workflow-engine',
          correlationId: context.correlationId,
          tags: [],
          priority: 'normal',
          environment: context.environment,
        }),
      ];

      const executionResult = await client.query(executionQuery, executionValues);
      const executionId = executionResult.rows[0].id;

      // Create initial workflow state
      const stateQuery = `
        INSERT INTO workflow_states (
          execution_id, workflow_id, variables, parallel_groups
        ) VALUES ($1, $2, $3, $4)
      `;

      await client.query(stateQuery, [
        executionId,
        workflowId,
        JSON.stringify(context.variables || {}),
        JSON.stringify({}),
      ]);

      await client.query('COMMIT');

      logger.info('Workflow execution created', {
        executionId,
        workflowId,
        triggeredBy,
        triggerType,
      });

      return executionId;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create workflow execution', {
        error: (error as Error).message,
        workflowId,
      });
      throw new Error(`Failed to create execution: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Update workflow execution status and result
   */
  async updateExecution(
    executionId: string,
    updates: {
      status?: ExecutionStatus;
      result?: WorkflowResult;
      startedAt?: Date;
      completedAt?: Date;
      duration?: number;
    }
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.status !== undefined) {
        setClauses.push(`status = $${paramIndex++}`);
        values.push(updates.status);
      }
      if (updates.result !== undefined) {
        setClauses.push(`result = $${paramIndex++}`);
        values.push(JSON.stringify(updates.result));
      }
      if (updates.startedAt !== undefined) {
        setClauses.push(`started_at = $${paramIndex++}`);
        values.push(updates.startedAt);
      }
      if (updates.completedAt !== undefined) {
        setClauses.push(`completed_at = $${paramIndex++}`);
        values.push(updates.completedAt);
      }
      if (updates.duration !== undefined) {
        setClauses.push(`duration = $${paramIndex++}`);
        values.push(updates.duration);
      }

      if (setClauses.length === 0) {
        return; // No updates to apply
      }

      values.push(executionId);

      const query = `
        UPDATE workflow_executions 
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex}
      `;

      await client.query(query, values);

      logger.debug('Workflow execution updated', { executionId, updates });
    } catch (error) {
      logger.error('Failed to update workflow execution', {
        error: (error as Error).message,
        executionId,
      });
      throw new Error(`Failed to update execution: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Load workflow execution by ID
   */
  async loadExecution(executionId: string): Promise<WorkflowExecution | null> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT we.*, ws.current_step, ws.completed_steps, ws.failed_steps, ws.skipped_steps
        FROM workflow_executions we
        LEFT JOIN workflow_states ws ON we.id = ws.execution_id
        WHERE we.id = $1
      `;

      const result = await client.query(query, [executionId]);
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return this.mapRowToWorkflowExecution(row);
    } catch (error) {
      logger.error('Failed to load workflow execution', {
        error: (error as Error).message,
        executionId,
      });
      throw new Error(`Failed to load execution: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  /**
   * List workflow executions with filtering and pagination
   */
  async listExecutions(options: ExecutionQueryOptions = {}): Promise<{
    executions: WorkflowExecution[];
    total: number;
  }> {
    const client = await this.pool.connect();
    try {
      const {
        limit = 50,
        offset = 0,
        sortBy = 'created_at',
        sortOrder = 'DESC',
        filters = {},
        status,
        dateRange,
        workflowId,
        triggeredBy,
      } = options;

      // Build WHERE clause
      const whereClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (status && status.length > 0) {
        whereClauses.push(`status = ANY($${paramIndex++})`);
        values.push(status);
      }
      if (workflowId) {
        whereClauses.push(`workflow_id = $${paramIndex++}`);
        values.push(workflowId);
      }
      if (triggeredBy) {
        whereClauses.push(`triggered_by = $${paramIndex++}`);
        values.push(triggeredBy);
      }
      if (dateRange) {
        whereClauses.push(`started_at >= $${paramIndex++} AND started_at <= $${paramIndex++}`);
        values.push(dateRange.start, dateRange.end);
      }
      if (filters['triggerType']) {
        whereClauses.push(`trigger_type = $${paramIndex++}`);
        values.push(filters['triggerType']);
      }

      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      // Count query
      const countQuery = `SELECT COUNT(*) FROM workflow_executions ${whereClause}`;
      const countResult = await client.query(countQuery, values);
      const total = parseInt(countResult.rows[0].count);

      // Data query
      const dataQuery = `
        SELECT we.*, ws.current_step, ws.completed_steps, ws.failed_steps, ws.skipped_steps
        FROM workflow_executions we
        LEFT JOIN workflow_states ws ON we.id = ws.execution_id
        ${whereClause}
        ORDER BY ${sortBy} ${sortOrder}
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      values.push(limit, offset);

      const dataResult = await client.query(dataQuery, values);
      const executions = dataResult.rows.map((row) => this.mapRowToWorkflowExecution(row));

      return { executions, total };
    } catch (error) {
      logger.error('Failed to list workflow executions', {
        error: (error as Error).message,
        options,
      });
      throw new Error(`Failed to list executions: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  // ==================== Workflow State Management ====================

  /**
   * Save workflow state
   */
  async saveState(executionId: string, state: WorkflowState): Promise<void> {
    const client = await this.pool.connect();
    try {
      const query = `
        UPDATE workflow_states 
        SET current_step = $1, completed_steps = $2, failed_steps = $3, 
            skipped_steps = $4, variables = $5, parallel_groups = $6,
            checkpoints = $7, last_updated = NOW()
        WHERE execution_id = $8
      `;

      const values = [
        state.currentStep,
        state.completedSteps,
        state.failedSteps,
        state.skippedSteps,
        JSON.stringify(state.variables),
        JSON.stringify(state.parallelGroups),
        JSON.stringify(state.checkpoints),
        executionId,
      ];

      await client.query(query, values);

      logger.debug('Workflow state saved', { executionId, currentStep: state.currentStep });
    } catch (error) {
      logger.error('Failed to save workflow state', {
        error: (error as Error).message,
        executionId,
      });
      throw new Error(`Failed to save state: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Load workflow state
   */
  async loadState(executionId: string): Promise<WorkflowState | null> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT * FROM workflow_states WHERE execution_id = $1
      `;

      const result = await client.query(query, [executionId]);
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return this.mapRowToWorkflowState(row);
    } catch (error) {
      logger.error('Failed to load workflow state', {
        error: (error as Error).message,
        executionId,
      });
      throw new Error(`Failed to load state: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Create state checkpoint
   */
  async createCheckpoint(
    executionId: string,
    stepId: string,
    checkpointData: any,
    variables: Record<string, any>
  ): Promise<void> {
    if (!this.config.enableCheckpoints) {
      return;
    }

    const client = await this.pool.connect();
    try {
      const query = `
        INSERT INTO workflow_state_checkpoints (execution_id, step_id, checkpoint_data, variables)
        VALUES ($1, $2, $3, $4)
      `;

      await client.query(query, [
        executionId,
        stepId,
        JSON.stringify(checkpointData),
        JSON.stringify(variables),
      ]);

      logger.debug('State checkpoint created', { executionId, stepId });
    } catch (error) {
      logger.error('Failed to create state checkpoint', {
        error: (error as Error).message,
        executionId,
        stepId,
      });
      throw new Error(`Failed to create checkpoint: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  // ==================== Step Execution Management ====================

  /**
   * Create step execution record
   */
  async createStepExecution(
    executionId: string,
    stepId: string,
    stepName: string,
    stepType: string
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      const query = `
        INSERT INTO workflow_step_executions (execution_id, step_id, step_name, step_type, status)
        VALUES ($1, $2, $3, $4, 'pending')
        RETURNING id
      `;

      const result = await client.query(query, [executionId, stepId, stepName, stepType]);
      return result.rows[0].id;
    } catch (error) {
      logger.error('Failed to create step execution', {
        error: (error as Error).message,
        executionId,
        stepId,
      });
      throw new Error(`Failed to create step execution: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Update step execution
   */
  async updateStepExecution(
    stepExecutionId: string,
    updates: {
      status?: StepExecutionStatus;
      input?: any;
      output?: any;
      errorMessage?: string;
      errorCode?: string;
      errorDetails?: any;
      retryCount?: number;
      startedAt?: Date;
      completedAt?: Date;
      duration?: number;
    }
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.status !== undefined) {
        setClauses.push(`status = $${paramIndex++}`);
        values.push(updates.status);
      }
      if (updates.input !== undefined) {
        setClauses.push(`input = $${paramIndex++}`);
        values.push(JSON.stringify(updates.input));
      }
      if (updates.output !== undefined) {
        setClauses.push(`output = $${paramIndex++}`);
        values.push(JSON.stringify(updates.output));
      }
      if (updates.errorMessage !== undefined) {
        setClauses.push(`error_message = $${paramIndex++}`);
        values.push(updates.errorMessage);
      }
      if (updates.errorCode !== undefined) {
        setClauses.push(`error_code = $${paramIndex++}`);
        values.push(updates.errorCode);
      }
      if (updates.errorDetails !== undefined) {
        setClauses.push(`error_details = $${paramIndex++}`);
        values.push(JSON.stringify(updates.errorDetails));
      }
      if (updates.retryCount !== undefined) {
        setClauses.push(`retry_count = $${paramIndex++}`);
        values.push(updates.retryCount);
      }
      if (updates.startedAt !== undefined) {
        setClauses.push(`started_at = $${paramIndex++}`);
        values.push(updates.startedAt);
      }
      if (updates.completedAt !== undefined) {
        setClauses.push(`completed_at = $${paramIndex++}`);
        values.push(updates.completedAt);
      }
      if (updates.duration !== undefined) {
        setClauses.push(`duration = $${paramIndex++}`);
        values.push(updates.duration);
      }

      if (setClauses.length === 0) {
        return;
      }

      values.push(stepExecutionId);

      const query = `
        UPDATE workflow_step_executions 
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex}
      `;

      await client.query(query, values);

      logger.debug('Step execution updated', { stepExecutionId, updates });
    } catch (error) {
      logger.error('Failed to update step execution', {
        error: (error as Error).message,
        stepExecutionId,
      });
      throw new Error(`Failed to update step execution: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  // ==================== Logging ====================

  /**
   * Add execution log entry
   */
  async addLog(
    executionId: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: any,
    stepExecutionId?: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      const query = `
        INSERT INTO workflow_execution_logs (execution_id, step_execution_id, level, message, data)
        VALUES ($1, $2, $3, $4, $5)
      `;

      await client.query(query, [
        executionId,
        stepExecutionId || null,
        level,
        message,
        data ? JSON.stringify(data) : null,
      ]);
    } catch (error) {
      logger.error('Failed to add execution log', { error: (error as Error).message, executionId });
      // Don't throw here to avoid cascading failures
    } finally {
      client.release();
    }
  }

  // ==================== Metrics ====================

  /**
   * Save execution metrics
   */
  async saveMetrics(
    executionId: string,
    workflowId: string,
    metrics: ExecutionMetrics
  ): Promise<void> {
    if (!this.config.enableMetrics) {
      return;
    }

    const client = await this.pool.connect();
    try {
      const query = `
        INSERT INTO workflow_metrics (
          execution_id, workflow_id, total_duration, step_count, successful_steps,
          failed_steps, skipped_steps, parallel_executions, retry_attempts,
          cpu_time, memory_peak, network_bytes, storage_bytes,
          average_step_duration, parallel_efficiency, queue_wait_time,
          resource_utilization, throughput, error_rate
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (execution_id) DO UPDATE SET
          total_duration = EXCLUDED.total_duration,
          step_count = EXCLUDED.step_count,
          successful_steps = EXCLUDED.successful_steps,
          failed_steps = EXCLUDED.failed_steps,
          skipped_steps = EXCLUDED.skipped_steps,
          parallel_executions = EXCLUDED.parallel_executions,
          retry_attempts = EXCLUDED.retry_attempts,
          cpu_time = EXCLUDED.cpu_time,
          memory_peak = EXCLUDED.memory_peak,
          network_bytes = EXCLUDED.network_bytes,
          storage_bytes = EXCLUDED.storage_bytes,
          average_step_duration = EXCLUDED.average_step_duration,
          parallel_efficiency = EXCLUDED.parallel_efficiency,
          queue_wait_time = EXCLUDED.queue_wait_time,
          resource_utilization = EXCLUDED.resource_utilization,
          throughput = EXCLUDED.throughput,
          error_rate = EXCLUDED.error_rate
      `;

      const values = [
        executionId,
        workflowId,
        metrics.totalDuration,
        metrics.stepCount,
        metrics.successfulSteps,
        metrics.failedSteps,
        metrics.skippedSteps,
        metrics.parallelExecutions,
        0, // retry_attempts - calculated separately
        metrics.resourceUsage.cpuTime,
        metrics.resourceUsage.memoryPeak,
        metrics.resourceUsage.networkBytes,
        metrics.resourceUsage.storageBytes,
        metrics.performanceMetrics.averageStepDuration,
        metrics.performanceMetrics.parallelEfficiency,
        metrics.performanceMetrics.queueWaitTime,
        metrics.performanceMetrics.resourceUtilization,
        metrics.performanceMetrics.throughput,
        0, // error_rate - calculated from step counts
      ];

      await client.query(query, values);

      logger.debug('Execution metrics saved', { executionId, workflowId });
    } catch (error) {
      logger.error('Failed to save execution metrics', {
        error: (error as Error).message,
        executionId,
      });
      throw new Error(`Failed to save metrics: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  // ==================== Helper Methods ====================

  /**
   * Map database row to WorkflowDefinition
   */
  private mapRowToWorkflowDefinition(row: any): WorkflowDefinition {
    const definition = JSON.parse(row.definition);
    return {
      ...definition,
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Map database row to WorkflowExecution
   */
  private mapRowToWorkflowExecution(row: any): WorkflowExecution {
    return {
      id: row.id,
      workflowId: row.workflow_id,
      workflowVersion: row.workflow_version,
      status: row.status as ExecutionStatus,
      context: JSON.parse(row.context || '{}'),
      result: row.result ? JSON.parse(row.result) : undefined,
      steps: [], // Loaded separately if needed
      startedAt: row.started_at,
      completedAt: row.completed_at,
      duration: row.duration,
      triggeredBy: row.triggered_by,
      triggerType: row.trigger_type,
      metadata: JSON.parse(row.metadata || '{}'),
    };
  }

  /**
   * Map database row to WorkflowState
   */
  private mapRowToWorkflowState(row: any): WorkflowState {
    return {
      executionId: row.execution_id,
      workflowId: row.workflow_id,
      currentStep: row.current_step,
      completedSteps: row.completed_steps || [],
      failedSteps: row.failed_steps || [],
      skippedSteps: row.skipped_steps || [],
      variables: JSON.parse(row.variables || '{}'),
      parallelGroups: JSON.parse(row.parallel_groups || '{}'),
      lastUpdated: row.last_updated,
      checkpoints: JSON.parse(row.checkpoints || '[]'),
    };
  }

  // ==================== Recovery Methods ====================

  /**
   * Recover workflow execution from last checkpoint
   */
  async recoverExecution(executionId: string): Promise<WorkflowState | null> {
    const client = await this.pool.connect();
    try {
      // Load the latest state
      const state = await this.loadState(executionId);
      if (!state) {
        return null;
      }

      // Load checkpoints for recovery
      const checkpointQuery = `
        SELECT * FROM workflow_state_checkpoints 
        WHERE execution_id = $1 
        ORDER BY timestamp DESC 
        LIMIT 10
      `;

      const checkpointResult = await client.query(checkpointQuery, [executionId]);
      const checkpoints = checkpointResult.rows.map((row) => ({
        id: row.id,
        stepId: row.step_id,
        timestamp: row.timestamp,
        state: JSON.parse(row.checkpoint_data),
        variables: JSON.parse(row.variables),
      }));

      state.checkpoints = checkpoints;

      logger.info('Workflow execution recovered', {
        executionId,
        currentStep: state.currentStep,
        checkpointCount: checkpoints.length,
      });

      return state;
    } catch (error) {
      logger.error('Failed to recover workflow execution', {
        error: (error as Error).message,
        executionId,
      });
      throw new Error(`Failed to recover execution: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  // ==================== Cleanup Methods ====================

  /**
   * Clean up old execution data
   */
  async cleanupOldExecutions(olderThanDays: number = 30): Promise<number> {
    const client = await this.pool.connect();
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const query = `
        DELETE FROM workflow_executions 
        WHERE created_at < $1 AND status IN ('completed', 'failed', 'cancelled')
      `;

      const result = await client.query(query, [cutoffDate]);
      const deletedCount = result.rowCount || 0;

      logger.info('Old workflow executions cleaned up', {
        deletedCount,
        olderThanDays,
      });

      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup old executions', {
        error: (error as Error).message,
        olderThanDays,
      });
      throw new Error(`Failed to cleanup executions: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  // ==================== Health Check Methods ====================

  /**
   * Check database connection health
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const client = await this.pool.connect();
      try {
        // Simple query to test connection
        await client.query('SELECT 1');

        // Check table existence
        const tableQuery = `
          SELECT table_name FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name LIKE 'workflow%'
        `;
        const tableResult = await client.query(tableQuery);
        const tables = tableResult.rows.map((row) => row.table_name);

        return {
          healthy: true,
          details: {
            connectionPool: {
              totalCount: this.pool.totalCount,
              idleCount: this.pool.idleCount,
              waitingCount: this.pool.waitingCount,
            },
            tables,
            timestamp: new Date().toISOString(),
          },
        };
      } finally {
        client.release();
      }
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: (error as Error).message,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }
}
