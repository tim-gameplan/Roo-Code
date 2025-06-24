/**
 * Multi-Step Workflow Execution Engine for Phase 4 Advanced Orchestration
 * Orchestrates workflow execution with dependency resolution and state management
 */

import { EventEmitter } from 'events';
import {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowExecution,
  StepExecution,
  ExecutionContext,
  ExecutionStatus,
  StepExecutionStatus,
  ExecutionError,
  ExecutionLog,
  ParallelGroup,
  WORKFLOW_CONSTANTS,
  DEFAULT_VALUES,
} from '../types/workflow';
import { validateWorkflow } from './workflow-validator';
import { logger } from '../utils/logger';

// Step executor interface
interface StepExecutor {
  execute(step: WorkflowStep, context: ExecutionContext): Promise<any>;
}

// Parallel execution group
interface ParallelExecutionGroup {
  isParallel: boolean;
  steps: WorkflowStep[];
}

export class WorkflowExecutor extends EventEmitter {
  private executions: Map<string, WorkflowExecution> = new Map();
  private stepExecutors: Map<string, StepExecutor> = new Map();
  private executionTimers: Map<string, NodeJS.Timeout> = new Map();
  private workflowDefinitions: Map<string, WorkflowDefinition> = new Map();

  constructor() {
    super();
    this.initializeStepExecutors();
  }

  /**
   * Registers a workflow definition for execution
   */
  registerWorkflow(workflow: WorkflowDefinition): void {
    this.workflowDefinitions.set(workflow.id, workflow);
  }

  /**
   * Starts execution of a workflow
   */
  async executeWorkflow(
    workflow: WorkflowDefinition,
    context: Partial<ExecutionContext> = {}
  ): Promise<WorkflowExecution> {
    // Validate workflow before execution
    const validation = validateWorkflow(workflow);
    if (!validation.isValid) {
      throw new Error(
        `Workflow validation failed: ${validation.errors.map((e) => e.message).join(', ')}`
      );
    }

    // Register workflow if not already registered
    this.registerWorkflow(workflow);

    // Create execution instance
    const execution = this.createWorkflowExecution(workflow, context);
    this.executions.set(execution.id, execution);

    // Set up timeout
    this.setupExecutionTimeout(execution);

    // Emit start event
    this.emitWorkflowEvent('workflow.started', execution);

    try {
      // Start execution
      await this.processWorkflowExecution(execution);
      return execution;
    } catch (error) {
      execution.status = 'failed';
      execution.completedAt = new Date();

      this.emitWorkflowEvent('workflow.failed', execution, { error });
      throw error;
    }
  }

  /**
   * Gets the current status of a workflow execution
   */
  getExecutionStatus(executionId: string): WorkflowExecution | null {
    return this.executions.get(executionId) || null;
  }

  /**
   * Cancels a running workflow execution
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'running') {
      return false;
    }

    execution.status = 'cancelled';
    execution.completedAt = new Date();
    execution.duration = execution.completedAt.getTime() - execution.startedAt.getTime();

    // Cancel running steps
    for (const stepExecution of execution.steps) {
      if (stepExecution.status === 'running') {
        stepExecution.status = 'cancelled';
        stepExecution.completedAt = new Date();
        stepExecution.duration =
          stepExecution.completedAt.getTime() - stepExecution.startedAt.getTime();
      }
    }

    // Clear timeout
    const timer = this.executionTimers.get(executionId);
    if (timer) {
      clearTimeout(timer);
      this.executionTimers.delete(executionId);
    }

    this.emitWorkflowEvent('workflow.cancelled', execution);
    return true;
  }

  /**
   * Pauses a running workflow execution
   */
  async pauseExecution(executionId: string): Promise<boolean> {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'running') {
      return false;
    }

    execution.status = 'paused';
    this.emitWorkflowEvent('workflow.paused', execution);
    return true;
  }

  /**
   * Resumes a paused workflow execution
   */
  async resumeExecution(executionId: string): Promise<boolean> {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'paused') {
      return false;
    }

    execution.status = 'running';
    this.emitWorkflowEvent('workflow.resumed', execution);

    // Continue processing
    await this.processWorkflowExecution(execution);
    return true;
  }

  /**
   * Gets all active executions
   */
  getActiveExecutions(): WorkflowExecution[] {
    return Array.from(this.executions.values()).filter(
      (execution) => execution.status === 'running' || execution.status === 'paused'
    );
  }

  /**
   * Cleans up completed executions older than specified time
   */
  cleanupExecutions(olderThanMs: number = 24 * 60 * 60 * 1000): number {
    const cutoffTime = new Date(Date.now() - olderThanMs);
    let cleaned = 0;

    for (const [id, execution] of this.executions.entries()) {
      if (
        execution.status !== 'running' &&
        execution.status !== 'paused' &&
        execution.completedAt &&
        execution.completedAt < cutoffTime
      ) {
        this.executions.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Creates a new workflow execution instance
   */
  private createWorkflowExecution(
    workflow: WorkflowDefinition,
    context: Partial<ExecutionContext>
  ): WorkflowExecution {
    const executionId = this.generateExecutionId();
    const correlationId = context.correlationId || this.generateCorrelationId();

    const execution: WorkflowExecution = {
      id: executionId,
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      status: 'running',
      startedAt: new Date(),
      triggeredBy: context.userId || 'system',
      triggerType: 'manual',
      context: {
        variables: { ...workflow.variables, ...context.variables },
        environment: context.environment || 'development',
        userId: context.userId || 'system',
        sessionId: context.sessionId || executionId,
        deviceContext: context.deviceContext || {
          deviceId: 'unknown',
          deviceType: 'unknown',
          capabilities: [],
          metadata: {},
        },
        parentExecutionId: context.parentExecutionId || '',
        correlationId,
      },
      steps: [],
      metadata: {
        source: 'workflow-executor',
        correlationId,
        parentWorkflowId: context.parentExecutionId || '',
        tags: workflow.metadata.tags,
        priority: workflow.metadata.priority,
        environment: workflow.metadata.environment,
      },
    };

    // Initialize step executions
    execution.steps = workflow.steps.map((step) => ({
      id: this.generateStepExecutionId(),
      stepId: step.id,
      executionId: executionId,
      status: 'pending',
      startedAt: new Date(), // Will be updated when step actually starts
      retryCount: 0,
      logs: [],
    }));

    return execution;
  }

  /**
   * Main workflow execution processing loop
   */
  private async processWorkflowExecution(execution: WorkflowExecution): Promise<void> {
    const workflow = this.getWorkflowDefinition(execution.workflowId);
    if (!workflow) {
      throw new Error(`Workflow definition not found: ${execution.workflowId}`);
    }

    while (execution.status === 'running') {
      const readySteps = this.getReadySteps(workflow, execution);

      if (readySteps.length === 0) {
        // Check if workflow is complete
        if (this.isWorkflowComplete(execution)) {
          execution.status = 'completed';
          execution.completedAt = new Date();
          execution.duration = execution.completedAt.getTime() - execution.startedAt.getTime();

          this.emitWorkflowEvent('workflow.completed', execution);
          break;
        }

        // Check if workflow is stuck
        if (this.hasRunnableSteps(execution)) {
          await this.delay(100); // Brief pause before checking again
          continue;
        } else {
          // No more steps can run - workflow failed
          execution.status = 'failed';
          execution.completedAt = new Date();
          execution.duration = execution.completedAt.getTime() - execution.startedAt.getTime();

          this.emitWorkflowEvent('workflow.failed', execution, {
            error: new Error('Workflow execution stuck - no runnable steps remaining'),
          });
          break;
        }
      }

      // Execute ready steps
      await this.executeReadySteps(workflow, execution, readySteps);
    }
  }

  /**
   * Gets steps that are ready to execute
   */
  private getReadySteps(
    workflow: WorkflowDefinition,
    execution: WorkflowExecution
  ): WorkflowStep[] {
    return workflow.steps.filter((step) => {
      const stepExecution = execution.steps.find((s) => s.stepId === step.id);
      if (!stepExecution || stepExecution.status !== 'pending') {
        return false;
      }

      // Check if all dependencies are completed
      return step.dependencies.every((depId) => {
        const depExecution = execution.steps.find((s) => s.stepId === depId);
        return depExecution && depExecution.status === 'completed';
      });
    });
  }

  /**
   * Executes ready steps (handles parallel execution)
   */
  private async executeReadySteps(
    workflow: WorkflowDefinition,
    execution: WorkflowExecution,
    readySteps: WorkflowStep[]
  ): Promise<void> {
    // Group steps by parallel groups
    const parallelGroups = this.groupStepsByParallelGroups(workflow, readySteps);

    for (const group of parallelGroups) {
      if (group.isParallel) {
        // Execute parallel steps concurrently
        await this.executeParallelSteps(workflow, execution, group.steps);
      } else {
        // Execute sequential steps one by one
        for (const step of group.steps) {
          if (execution.status !== 'running') break;
          await this.executeStep(workflow, execution, step);
        }
      }
    }
  }

  /**
   * Executes parallel steps concurrently
   */
  private async executeParallelSteps(
    workflow: WorkflowDefinition,
    execution: WorkflowExecution,
    steps: WorkflowStep[]
  ): Promise<void> {
    const promises = steps.map((step) => this.executeStep(workflow, execution, step));
    await Promise.allSettled(promises);
  }

  /**
   * Executes a single workflow step
   */
  private async executeStep(
    workflow: WorkflowDefinition,
    execution: WorkflowExecution,
    step: WorkflowStep
  ): Promise<void> {
    const stepExecution = execution.steps.find((s) => s.stepId === step.id);
    if (!stepExecution) {
      throw new Error(`Step execution not found: ${step.id}`);
    }

    // Skip if step is disabled
    if (!step.enabled) {
      stepExecution.status = 'skipped';
      stepExecution.startedAt = new Date();
      stepExecution.completedAt = new Date();
      stepExecution.duration = 0;

      this.emitStepEvent('step.skipped', execution, stepExecution, step);
      return;
    }

    stepExecution.status = 'running';
    stepExecution.startedAt = new Date();

    this.emitStepEvent('step.started', execution, stepExecution, step);

    try {
      // Execute step with timeout
      const result = await this.executeStepWithTimeout(workflow, execution, step);

      stepExecution.status = 'completed';
      stepExecution.completedAt = new Date();
      stepExecution.duration =
        stepExecution.completedAt.getTime() - stepExecution.startedAt.getTime();
      stepExecution.output = result;

      this.emitStepEvent('step.completed', execution, stepExecution, step);
    } catch (error) {
      const executionError: ExecutionError = {
        code: 'STEP_EXECUTION_ERROR',
        message: error instanceof Error ? error.message : String(error),
        stepId: step.id,
        timestamp: new Date(),
        recoverable: stepExecution.retryCount < step.retryPolicy.maxAttempts,
        stack: error instanceof Error ? error.stack || '' : '',
      };

      stepExecution.error = executionError;

      // Handle retry logic
      if (stepExecution.retryCount < step.retryPolicy.maxAttempts) {
        stepExecution.retryCount++;
        stepExecution.status = 'retrying';

        this.emitStepEvent('step.retry', execution, stepExecution, step, { error });

        // Wait before retry
        await this.delay(this.calculateRetryDelay(step.retryPolicy, stepExecution.retryCount));

        // Retry the step
        await this.executeStep(workflow, execution, step);
      } else {
        stepExecution.status = 'failed';
        stepExecution.completedAt = new Date();
        stepExecution.duration =
          stepExecution.completedAt.getTime() - stepExecution.startedAt.getTime();

        this.emitStepEvent('step.failed', execution, stepExecution, step, { error });

        // Handle error strategy
        await this.handleStepFailure(workflow, execution, step, error);
      }
    }
  }

  /**
   * Executes a step with timeout protection
   */
  private async executeStepWithTimeout(
    workflow: WorkflowDefinition,
    execution: WorkflowExecution,
    step: WorkflowStep
  ): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Step execution timeout after ${step.timeout}ms`));
      }, step.timeout);

      try {
        const executor = this.stepExecutors.get(step.type);
        if (!executor) {
          throw new Error(`No executor found for step type: ${step.type}`);
        }

        const result = await executor.execute(step, execution.context);
        clearTimeout(timeout);
        resolve(result);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Handles step failure based on error handling strategy
   */
  private async handleStepFailure(
    workflow: WorkflowDefinition,
    execution: WorkflowExecution,
    step: WorkflowStep,
    error: any
  ): Promise<void> {
    const errorHandling = workflow.errorHandling;

    switch (errorHandling.strategy) {
      case 'fail_fast':
        execution.status = 'failed';
        execution.completedAt = new Date();
        execution.duration = execution.completedAt.getTime() - execution.startedAt.getTime();
        break;

      case 'continue':
        // Continue with other steps
        logger.warn(`Step ${step.id} failed but continuing execution`, { error });
        break;

      case 'rollback':
        // Execute rollback steps
        if (errorHandling.rollbackSteps) {
          await this.executeRollbackSteps(workflow, execution, errorHandling.rollbackSteps);
        }
        execution.status = 'failed';
        execution.completedAt = new Date();
        execution.duration = execution.completedAt.getTime() - execution.startedAt.getTime();
        break;

      case 'escalate':
        // Escalate to manual intervention
        execution.status = 'paused';
        this.emitWorkflowEvent('workflow.escalated', execution, { error, step });
        break;

      default:
        execution.status = 'failed';
        execution.completedAt = new Date();
        execution.duration = execution.completedAt.getTime() - execution.startedAt.getTime();
        break;
    }
  }

  /**
   * Helper methods
   */
  private generateExecutionId(): string {
    return `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateCorrelationId(): string {
    return `corr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateStepExecutionId(): string {
    return `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getWorkflowDefinition(workflowId: string): WorkflowDefinition | undefined {
    return this.workflowDefinitions.get(workflowId);
  }

  private isWorkflowComplete(execution: WorkflowExecution): boolean {
    return execution.steps.every(
      (step) => step.status === 'completed' || step.status === 'skipped' || step.status === 'failed'
    );
  }

  private hasRunnableSteps(execution: WorkflowExecution): boolean {
    return execution.steps.some(
      (step) => step.status === 'pending' || step.status === 'running' || step.status === 'retrying'
    );
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private calculateRetryDelay(retryPolicy: any, retryCount: number): number {
    const { backoffStrategy, initialDelay, maxDelay, multiplier } = retryPolicy;

    switch (backoffStrategy) {
      case 'fixed':
        return initialDelay;
      case 'linear':
        return Math.min(initialDelay * retryCount, maxDelay);
      case 'exponential':
        return Math.min(initialDelay * Math.pow(multiplier, retryCount - 1), maxDelay);
      case 'random':
        return Math.min(initialDelay + Math.random() * initialDelay * retryCount, maxDelay);
      default:
        return initialDelay;
    }
  }

  private groupStepsByParallelGroups(
    workflow: WorkflowDefinition,
    steps: WorkflowStep[]
  ): ParallelExecutionGroup[] {
    const groups: ParallelExecutionGroup[] = [];
    const processedSteps = new Set<string>();

    for (const step of steps) {
      if (processedSteps.has(step.id)) continue;

      // Check if step belongs to a parallel group
      const parallelGroup = workflow.parallelGroups?.find((group) =>
        group.stepIds.includes(step.id)
      );

      if (parallelGroup) {
        // Find all steps in this parallel group that are ready
        const groupSteps = steps.filter(
          (s) => parallelGroup.stepIds.includes(s.id) && !processedSteps.has(s.id)
        );

        if (groupSteps.length > 0) {
          groups.push({
            isParallel: true,
            steps: groupSteps,
          });

          groupSteps.forEach((s) => processedSteps.add(s.id));
        }
      } else {
        // Sequential step
        groups.push({
          isParallel: false,
          steps: [step],
        });

        processedSteps.add(step.id);
      }
    }

    return groups;
  }

  private setupExecutionTimeout(execution: WorkflowExecution): void {
    const workflow = this.getWorkflowDefinition(execution.workflowId);
    if (!workflow) return;

    const timeout = setTimeout(() => {
      if (execution.status === 'running') {
        execution.status = 'timeout';
        execution.completedAt = new Date();
        execution.duration = execution.completedAt.getTime() - execution.startedAt.getTime();

        this.emitWorkflowEvent('workflow.timeout', execution);
      }
    }, workflow.timeout);

    this.executionTimers.set(execution.id, timeout);
  }

  private async executeRollbackSteps(
    workflow: WorkflowDefinition,
    execution: WorkflowExecution,
    rollbackStepIds: string[]
  ): Promise<void> {
    logger.info(`Executing rollback steps for workflow ${workflow.id}`, { rollbackStepIds });

    for (const stepId of rollbackStepIds) {
      const step = workflow.steps.find((s) => s.id === stepId);
      if (step) {
        try {
          await this.executeStep(workflow, execution, step);
        } catch (error) {
          logger.error(`Rollback step ${stepId} failed`, { error });
        }
      }
    }
  }

  private initializeStepExecutors(): void {
    // Initialize default step executors
    this.stepExecutors.set('command', {
      execute: async (step: WorkflowStep, context: ExecutionContext) => {
        const { command } = step.action;
        if (!command) throw new Error('Command action not defined');

        logger.info(`Executing command: ${command.command}`, {
          stepId: step.id,
          deviceId: command.deviceId,
        });

        // Simulate command execution
        return { success: true, output: 'Command executed successfully' };
      },
    });

    this.stepExecutors.set('webhook', {
      execute: async (step: WorkflowStep, context: ExecutionContext) => {
        const { webhook } = step.action;
        if (!webhook) throw new Error('Webhook action not defined');

        logger.info(`Calling webhook: ${webhook.method} ${webhook.url}`, { stepId: step.id });

        // Simulate webhook call
        return { success: true, statusCode: 200, response: 'Webhook called successfully' };
      },
    });

    this.stepExecutors.set('wait', {
      execute: async (step: WorkflowStep, context: ExecutionContext) => {
        const { wait } = step.action;
        if (!wait) throw new Error('Wait action not defined');

        const delayMs = this.convertToMilliseconds(wait.duration, wait.unit);
        logger.info(`Waiting for ${delayMs}ms`, { stepId: step.id });

        await this.delay(delayMs);
        return { success: true, waited: delayMs };
      },
    });

    this.stepExecutors.set('condition', {
      execute: async (step: WorkflowStep, context: ExecutionContext) => {
        const { condition } = step.action;
        if (!condition) throw new Error('Condition action not defined');

        // Evaluate condition expression
        const result = this.evaluateCondition(condition.expression, context.variables);
        logger.info(`Condition evaluated to: ${result}`, { stepId: step.id });

        return {
          success: true,
          result,
          nextStep: result ? condition.trueStepId : condition.falseStepId,
        };
      },
    });
  }

  private convertToMilliseconds(duration: number, unit: string): number {
    switch (unit) {
      case 'seconds':
        return duration * 1000;
      case 'minutes':
        return duration * 60 * 1000;
      case 'hours':
        return duration * 60 * 60 * 1000;
      default:
        return duration;
    }
  }

  private evaluateCondition(expression: string, variables: Record<string, any>): boolean {
    // Simple condition evaluation - in production, use a proper expression evaluator
    try {
      // Replace variables in expression
      let evaluatedExpression = expression;
      for (const [key, value] of Object.entries(variables)) {
        evaluatedExpression = evaluatedExpression.replace(
          new RegExp(`\\b${key}\\b`, 'g'),
          JSON.stringify(value)
        );
      }

      // Evaluate the expression (WARNING: eval is dangerous in production)
      return Boolean(eval(evaluatedExpression));
    } catch (error) {
      logger.error('Failed to evaluate condition', { expression, error });
      return false;
    }
  }

  private emitWorkflowEvent(eventType: string, execution: WorkflowExecution, data?: any): void {
    const event = {
      type: eventType,
      executionId: execution.id,
      workflowId: execution.workflowId,
      timestamp: new Date(),
      data,
    };

    this.emit(eventType, event);
    logger.info(`Workflow event: ${eventType}`, event);
  }

  private emitStepEvent(
    eventType: string,
    execution: WorkflowExecution,
    stepExecution: StepExecution,
    step: WorkflowStep,
    data?: any
  ): void {
    const event = {
      type: eventType,
      executionId: execution.id,
      workflowId: execution.workflowId,
      stepId: step.id,
      stepExecutionId: stepExecution.id,
      timestamp: new Date(),
      data,
    };

    this.emit(eventType, event);
    logger.info(`Step event: ${eventType}`, event);
  }
}
