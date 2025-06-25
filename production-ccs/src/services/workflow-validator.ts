/**
 * Comprehensive workflow validation service for Phase 4 Advanced Orchestration
 * Implements schema validation, dependency checking, and optimization suggestions
 */

import {
  WorkflowDefinition,
  WorkflowStep,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationSuggestion,
  ConditionalLogic,
  ParallelGroup,
  WORKFLOW_CONSTANTS,
  VALIDATION_PATTERNS,
  WorkflowStepType,
  ActionType,
  ConditionalOperator,
  ErrorStrategy,
  BackoffStrategy,
} from '../types/workflow';

export class WorkflowValidator {
  private errors: ValidationError[] = [];
  private warnings: ValidationWarning[] = [];
  private suggestions: ValidationSuggestion[] = [];

  /**
   * Validates a complete workflow definition
   */
  validateDefinition(workflow: WorkflowDefinition): ValidationResult {
    this.resetValidation();

    // Basic structure validation
    this.validateBasicStructure(workflow);

    // Workflow metadata validation
    this.validateMetadata(workflow);

    // Steps validation
    this.validateSteps(workflow.steps);

    // Dependencies validation
    this.validateDependencies(workflow.steps);

    // Parallel groups validation
    if (workflow.parallelGroups) {
      this.validateParallelGroups(workflow.parallelGroups, workflow.steps);
    }

    // Conditions validation
    if (workflow.conditions) {
      this.validateConditions(workflow.conditions, workflow.steps);
    }

    // Variables validation
    if (workflow.variables) {
      this.validateVariables(workflow.variables);
    }

    // Triggers validation
    if (workflow.triggers) {
      this.validateTriggers(workflow.triggers);
    }

    // Error handling validation
    this.validateErrorHandling(workflow.errorHandling, workflow.steps);

    // Retry policy validation
    this.validateRetryPolicy(workflow.retryPolicy);

    // Performance and optimization suggestions
    this.generateOptimizationSuggestions(workflow);

    return {
      isValid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      suggestions: this.suggestions,
    };
  }

  /**
   * Validates a single workflow step
   */
  validateStep(step: WorkflowStep): ValidationResult {
    this.resetValidation();

    this.validateStepStructure(step);
    this.validateStepAction(step.action);
    this.validateStepRetryPolicy(step.retryPolicy);

    if (step.conditions) {
      this.validateConditions(step.conditions, [step]);
    }

    return {
      isValid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      suggestions: this.suggestions,
    };
  }

  /**
   * Validates workflow dependencies for circular references
   */
  validateDependencies(steps: WorkflowStep[]): void {
    const stepMap = new Map(steps.map((step) => [step.id, step]));
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const detectCycle = (stepId: string, path: string[]): boolean => {
      if (recursionStack.has(stepId)) {
        this.addError(
          'CIRCULAR_DEPENDENCY',
          `Circular dependency detected: ${path.join(' -> ')} -> ${stepId}`,
          `steps.${stepId}.dependencies`
        );
        return true;
      }

      if (visited.has(stepId)) {
        return false;
      }

      const step = stepMap.get(stepId);
      if (!step) {
        this.addError(
          'INVALID_DEPENDENCY',
          `Step "${stepId}" references non-existent dependency`,
          `steps.${stepId}.dependencies`
        );
        return false;
      }

      visited.add(stepId);
      recursionStack.add(stepId);

      for (const depId of step.dependencies) {
        if (detectCycle(depId, [...path, stepId])) {
          return true;
        }
      }

      recursionStack.delete(stepId);
      return false;
    };

    for (const step of steps) {
      if (!visited.has(step.id)) {
        detectCycle(step.id, []);
      }
    }

    // Validate dependency references
    for (const step of steps) {
      for (const depId of step.dependencies) {
        if (!stepMap.has(depId)) {
          this.addError(
            'INVALID_DEPENDENCY_REFERENCE',
            `Step "${step.id}" references non-existent step "${depId}"`,
            `steps.${step.id}.dependencies`
          );
        }
      }
    }
  }

  /**
   * Validates parallel groups configuration
   */
  private validateParallelGroups(parallelGroups: ParallelGroup[], steps: WorkflowStep[]): void {
    const stepIds = new Set(steps.map((s) => s.id));
    const groupIds = new Set<string>();

    for (const group of parallelGroups) {
      // Check for duplicate group IDs
      if (groupIds.has(group.id)) {
        this.addError(
          'DUPLICATE_PARALLEL_GROUP_ID',
          `Duplicate parallel group ID: ${group.id}`,
          `parallelGroups.${group.id}`
        );
      }
      groupIds.add(group.id);

      // Validate group structure
      if (!VALIDATION_PATTERNS.STEP_ID.test(group.id)) {
        this.addError(
          'INVALID_PARALLEL_GROUP_ID',
          `Invalid parallel group ID format: ${group.id}`,
          `parallelGroups.${group.id}.id`
        );
      }

      if (group.stepIds.length === 0) {
        this.addError(
          'EMPTY_PARALLEL_GROUP',
          `Parallel group "${group.id}" contains no steps`,
          `parallelGroups.${group.id}.stepIds`
        );
      }

      if (group.stepIds.length > WORKFLOW_CONSTANTS.MAX_PARALLEL_BRANCHES) {
        this.addError(
          'TOO_MANY_PARALLEL_STEPS',
          `Parallel group "${group.id}" exceeds maximum parallel branches (${WORKFLOW_CONSTANTS.MAX_PARALLEL_BRANCHES})`,
          `parallelGroups.${group.id}.stepIds`
        );
      }

      // Validate step references
      for (const stepId of group.stepIds) {
        if (!stepIds.has(stepId)) {
          this.addError(
            'INVALID_PARALLEL_STEP_REFERENCE',
            `Parallel group "${group.id}" references non-existent step "${stepId}"`,
            `parallelGroups.${group.id}.stepIds`
          );
        }
      }

      // Validate concurrency settings
      if (group.maxConcurrency && group.maxConcurrency > group.stepIds.length) {
        this.addWarning(
          'UNNECESSARY_CONCURRENCY_LIMIT',
          `Parallel group "${group.id}" has maxConcurrency (${group.maxConcurrency}) greater than step count (${group.stepIds.length})`,
          `parallelGroups.${group.id}.maxConcurrency`,
          'Consider removing or reducing maxConcurrency'
        );
      }
    }
  }

  /**
   * Validates conditional logic expressions
   */
  private validateConditions(conditions: ConditionalLogic[], steps: WorkflowStep[]): void {
    const stepIds = new Set(steps.map((s) => s.id));

    for (const condition of conditions) {
      // Validate condition structure
      if (!condition.expression || condition.expression.trim().length === 0) {
        this.addError(
          'EMPTY_CONDITION_EXPRESSION',
          `Condition "${condition.id}" has empty expression`,
          `conditions.${condition.id}.expression`
        );
      }

      // Validate operator
      const validOperators: ConditionalOperator[] = [
        'equals',
        'not_equals',
        'greater_than',
        'less_than',
        'greater_equal',
        'less_equal',
        'contains',
        'starts_with',
        'ends_with',
        'regex_match',
        'in',
        'not_in',
        'and',
        'or',
        'not',
      ];

      if (!validOperators.includes(condition.operator)) {
        this.addError(
          'INVALID_CONDITION_OPERATOR',
          `Invalid condition operator: ${condition.operator}`,
          `conditions.${condition.id}.operator`
        );
      }

      // Validate next step reference
      if (condition.nextStepId && !stepIds.has(condition.nextStepId)) {
        this.addError(
          'INVALID_CONDITION_NEXT_STEP',
          `Condition "${condition.id}" references non-existent next step "${condition.nextStepId}"`,
          `conditions.${condition.id}.nextStepId`
        );
      }

      // Validate variable references
      for (const variable of condition.variables) {
        if (!VALIDATION_PATTERNS.VARIABLE_NAME.test(variable)) {
          this.addError(
            'INVALID_VARIABLE_NAME',
            `Invalid variable name in condition "${condition.id}": ${variable}`,
            `conditions.${condition.id}.variables`
          );
        }
      }
    }
  }

  /**
   * Validates workflow variables
   */
  private validateVariables(variables: Record<string, any>): void {
    for (const [name, variable] of Object.entries(variables)) {
      if (!VALIDATION_PATTERNS.VARIABLE_NAME.test(name)) {
        this.addError(
          'INVALID_VARIABLE_NAME',
          `Invalid variable name: ${name}`,
          `variables.${name}`
        );
      }

      // Validate variable structure if it's a WorkflowVariable object
      if (typeof variable === 'object' && variable !== null) {
        if (variable.required && variable.defaultValue === undefined) {
          this.addWarning(
            'REQUIRED_VARIABLE_NO_DEFAULT',
            `Required variable "${name}" has no default value`,
            `variables.${name}.defaultValue`,
            'Consider providing a default value or making the variable optional'
          );
        }

        if (variable.validation) {
          this.validateVariableValidation(name, variable.validation);
        }
      }
    }
  }

  /**
   * Validates workflow triggers
   */
  private validateTriggers(triggers: any[]): void {
    for (const trigger of triggers) {
      if (trigger.type === 'schedule' && trigger.schedule) {
        if (!VALIDATION_PATTERNS.CRON_EXPRESSION.test(trigger.schedule.cron)) {
          this.addError(
            'INVALID_CRON_EXPRESSION',
            `Invalid cron expression in trigger "${trigger.id}": ${trigger.schedule.cron}`,
            `triggers.${trigger.id}.schedule.cron`
          );
        }
      }

      if (trigger.type === 'webhook' && trigger.webhook) {
        if (!VALIDATION_PATTERNS.URL.test(trigger.webhook.url)) {
          this.addError(
            'INVALID_WEBHOOK_URL',
            `Invalid webhook URL in trigger "${trigger.id}": ${trigger.webhook.url}`,
            `triggers.${trigger.id}.webhook.url`
          );
        }
      }
    }
  }

  /**
   * Validates basic workflow structure
   */
  private validateBasicStructure(workflow: WorkflowDefinition): void {
    // Required fields
    if (!workflow.id || !VALIDATION_PATTERNS.WORKFLOW_ID.test(workflow.id)) {
      this.addError(
        'INVALID_WORKFLOW_ID',
        'Workflow ID is required and must contain only alphanumeric characters, hyphens, and underscores',
        'id'
      );
    }

    if (!workflow.name || workflow.name.trim().length === 0) {
      this.addError('MISSING_WORKFLOW_NAME', 'Workflow name is required', 'name');
    } else if (workflow.name.length > WORKFLOW_CONSTANTS.MAX_WORKFLOW_NAME_LENGTH) {
      this.addError(
        'WORKFLOW_NAME_TOO_LONG',
        `Workflow name exceeds maximum length (${WORKFLOW_CONSTANTS.MAX_WORKFLOW_NAME_LENGTH})`,
        'name'
      );
    }

    if (!workflow.version || !/^\d+\.\d+\.\d+$/.test(workflow.version)) {
      this.addError(
        'INVALID_VERSION_FORMAT',
        'Version must follow semantic versioning format (e.g., 1.0.0)',
        'version'
      );
    }

    if (
      workflow.description &&
      workflow.description.length > WORKFLOW_CONSTANTS.MAX_DESCRIPTION_LENGTH
    ) {
      this.addError(
        'DESCRIPTION_TOO_LONG',
        `Description exceeds maximum length (${WORKFLOW_CONSTANTS.MAX_DESCRIPTION_LENGTH})`,
        'description'
      );
    }

    // Steps validation
    if (!workflow.steps || workflow.steps.length === 0) {
      this.addError('NO_STEPS_DEFINED', 'Workflow must contain at least one step', 'steps');
    } else if (workflow.steps.length > WORKFLOW_CONSTANTS.MAX_STEPS) {
      this.addError(
        'TOO_MANY_STEPS',
        `Workflow exceeds maximum number of steps (${WORKFLOW_CONSTANTS.MAX_STEPS})`,
        'steps'
      );
    }

    // Timeout validation
    if (workflow.timeout < WORKFLOW_CONSTANTS.MIN_STEP_TIMEOUT) {
      this.addError(
        'TIMEOUT_TOO_SHORT',
        `Workflow timeout must be at least ${WORKFLOW_CONSTANTS.MIN_STEP_TIMEOUT}ms`,
        'timeout'
      );
    } else if (workflow.timeout > WORKFLOW_CONSTANTS.MAX_EXECUTION_TIME) {
      this.addError(
        'TIMEOUT_TOO_LONG',
        `Workflow timeout exceeds maximum execution time (${WORKFLOW_CONSTANTS.MAX_EXECUTION_TIME}ms)`,
        'timeout'
      );
    }
  }

  /**
   * Validates workflow metadata
   */
  private validateMetadata(workflow: WorkflowDefinition): void {
    const metadata = workflow.metadata;

    if (!metadata.owner || metadata.owner.trim().length === 0) {
      this.addError('MISSING_OWNER', 'Workflow metadata must specify an owner', 'metadata.owner');
    }

    if (!metadata.category || metadata.category.trim().length === 0) {
      this.addWarning(
        'MISSING_CATEGORY',
        'Workflow metadata should specify a category',
        'metadata.category',
        'Consider adding a category for better organization'
      );
    }

    if (metadata.tags && metadata.tags.length === 0) {
      this.addSuggestion(
        'best-practice',
        'Consider adding tags to improve workflow discoverability',
        'metadata.tags',
        true
      );
    }
  }

  /**
   * Validates workflow steps
   */
  private validateSteps(steps: WorkflowStep[]): void {
    const stepIds = new Set<string>();

    for (const step of steps) {
      // Check for duplicate step IDs
      if (stepIds.has(step.id)) {
        this.addError('DUPLICATE_STEP_ID', `Duplicate step ID: ${step.id}`, `steps.${step.id}`);
      }
      stepIds.add(step.id);

      this.validateStepStructure(step);
      this.validateStepAction(step.action);
      this.validateStepRetryPolicy(step.retryPolicy);
    }
  }

  /**
   * Validates individual step structure
   */
  private validateStepStructure(step: WorkflowStep): void {
    // Step ID validation
    if (!step.id || !VALIDATION_PATTERNS.STEP_ID.test(step.id)) {
      this.addError('INVALID_STEP_ID', `Invalid step ID format: ${step.id}`, `steps.${step.id}.id`);
    }

    // Step name validation
    if (!step.name || step.name.trim().length === 0) {
      this.addError(
        'MISSING_STEP_NAME',
        `Step "${step.id}" must have a name`,
        `steps.${step.id}.name`
      );
    }

    // Step type validation
    const validStepTypes: WorkflowStepType[] = [
      'command',
      'condition',
      'parallel',
      'wait',
      'webhook',
      'script',
      'notification',
      'loop',
      'switch',
    ];

    if (!validStepTypes.includes(step.type)) {
      this.addError(
        'INVALID_STEP_TYPE',
        `Invalid step type: ${step.type}`,
        `steps.${step.id}.type`
      );
    }

    // Timeout validation
    if (step.timeout < WORKFLOW_CONSTANTS.MIN_STEP_TIMEOUT) {
      this.addError(
        'STEP_TIMEOUT_TOO_SHORT',
        `Step "${step.id}" timeout must be at least ${WORKFLOW_CONSTANTS.MIN_STEP_TIMEOUT}ms`,
        `steps.${step.id}.timeout`
      );
    } else if (step.timeout > WORKFLOW_CONSTANTS.MAX_STEP_TIMEOUT) {
      this.addError(
        'STEP_TIMEOUT_TOO_LONG',
        `Step "${step.id}" timeout exceeds maximum (${WORKFLOW_CONSTANTS.MAX_STEP_TIMEOUT}ms)`,
        `steps.${step.id}.timeout`
      );
    }
  }

  /**
   * Validates step action configuration
   */
  private validateStepAction(action: any): void {
    const validActionTypes: ActionType[] = [
      'command',
      'webhook',
      'condition',
      'wait',
      'parallel',
      'script',
      'notification',
    ];

    if (!validActionTypes.includes(action.type)) {
      this.addError('INVALID_ACTION_TYPE', `Invalid action type: ${action.type}`, 'action.type');
    }

    // Validate specific action types
    switch (action.type) {
      case 'webhook':
        if (action.webhook && !VALIDATION_PATTERNS.URL.test(action.webhook.url)) {
          this.addError(
            'INVALID_WEBHOOK_URL',
            `Invalid webhook URL: ${action.webhook.url}`,
            'action.webhook.url'
          );
        }
        break;
      case 'command':
        if (action.command && !action.command.command) {
          this.addError(
            'MISSING_COMMAND',
            'Command action must specify a command',
            'action.command.command'
          );
        }
        break;
      case 'condition':
        if (action.condition && !action.condition.expression) {
          this.addError(
            'MISSING_CONDITION_EXPRESSION',
            'Condition action must specify an expression',
            'action.condition.expression'
          );
        }
        break;
    }
  }

  /**
   * Validates step retry policy
   */
  private validateStepRetryPolicy(retryPolicy: any): void {
    if (retryPolicy.maxAttempts > WORKFLOW_CONSTANTS.MAX_RETRY_ATTEMPTS) {
      this.addError(
        'TOO_MANY_RETRY_ATTEMPTS',
        `Retry policy exceeds maximum attempts (${WORKFLOW_CONSTANTS.MAX_RETRY_ATTEMPTS})`,
        'retryPolicy.maxAttempts'
      );
    }

    if (retryPolicy.initialDelay < 0) {
      this.addError(
        'INVALID_RETRY_DELAY',
        'Retry initial delay must be non-negative',
        'retryPolicy.initialDelay'
      );
    }

    if (retryPolicy.maxDelay > WORKFLOW_CONSTANTS.MAX_RETRY_DELAY) {
      this.addError(
        'RETRY_DELAY_TOO_LONG',
        `Retry max delay exceeds maximum (${WORKFLOW_CONSTANTS.MAX_RETRY_DELAY}ms)`,
        'retryPolicy.maxDelay'
      );
    }
  }

  /**
   * Validates error handling configuration
   */
  private validateErrorHandling(errorHandling: any, steps: WorkflowStep[]): void {
    const validStrategies: ErrorStrategy[] = [
      'fail_fast',
      'continue',
      'retry',
      'rollback',
      'escalate',
    ];

    if (!validStrategies.includes(errorHandling.strategy)) {
      this.addError(
        'INVALID_ERROR_STRATEGY',
        `Invalid error handling strategy: ${errorHandling.strategy}`,
        'errorHandling.strategy'
      );
    }

    // Validate escalation steps
    if (errorHandling.escalationSteps) {
      const stepIds = new Set(steps.map((s) => s.id));
      for (const stepId of errorHandling.escalationSteps) {
        if (!stepIds.has(stepId)) {
          this.addError(
            'INVALID_ESCALATION_STEP',
            `Error handling references non-existent escalation step: ${stepId}`,
            'errorHandling.escalationSteps'
          );
        }
      }
    }

    // Validate rollback steps
    if (errorHandling.rollbackSteps) {
      const stepIds = new Set(steps.map((s) => s.id));
      for (const stepId of errorHandling.rollbackSteps) {
        if (!stepIds.has(stepId)) {
          this.addError(
            'INVALID_ROLLBACK_STEP',
            `Error handling references non-existent rollback step: ${stepId}`,
            'errorHandling.rollbackSteps'
          );
        }
      }
    }
  }

  /**
   * Validates retry policy configuration
   */
  private validateRetryPolicy(retryPolicy: any): void {
    const validBackoffStrategies: BackoffStrategy[] = ['fixed', 'linear', 'exponential', 'random'];

    if (!validBackoffStrategies.includes(retryPolicy.backoffStrategy)) {
      this.addError(
        'INVALID_BACKOFF_STRATEGY',
        `Invalid backoff strategy: ${retryPolicy.backoffStrategy}`,
        'retryPolicy.backoffStrategy'
      );
    }

    if (retryPolicy.maxAttempts > WORKFLOW_CONSTANTS.MAX_RETRY_ATTEMPTS) {
      this.addError(
        'TOO_MANY_RETRY_ATTEMPTS',
        `Retry policy exceeds maximum attempts (${WORKFLOW_CONSTANTS.MAX_RETRY_ATTEMPTS})`,
        'retryPolicy.maxAttempts'
      );
    }
  }

  /**
   * Validates variable validation rules
   */
  private validateVariableValidation(variableName: string, validation: any): void {
    if (validation.pattern && validation.pattern.trim().length === 0) {
      this.addWarning(
        'EMPTY_VALIDATION_PATTERN',
        `Variable "${variableName}" has empty validation pattern`,
        `variables.${variableName}.validation.pattern`,
        'Consider removing empty pattern or providing a valid regex'
      );
    }

    if (validation.minLength !== undefined && validation.maxLength !== undefined) {
      if (validation.minLength > validation.maxLength) {
        this.addError(
          'INVALID_LENGTH_RANGE',
          `Variable "${variableName}" has minLength greater than maxLength`,
          `variables.${variableName}.validation`
        );
      }
    }

    if (validation.min !== undefined && validation.max !== undefined) {
      if (validation.min > validation.max) {
        this.addError(
          'INVALID_VALUE_RANGE',
          `Variable "${variableName}" has min value greater than max value`,
          `variables.${variableName}.validation`
        );
      }
    }
  }

  /**
   * Generates optimization suggestions for the workflow
   */
  private generateOptimizationSuggestions(workflow: WorkflowDefinition): void {
    // Check for potential parallel execution opportunities
    const independentSteps = this.findIndependentSteps(workflow.steps);
    if (independentSteps.length > 1) {
      this.addSuggestion(
        'optimization',
        `Consider grouping ${independentSteps.length} independent steps into parallel execution`,
        'steps',
        true
      );
    }

    // Check for long sequential chains
    const longestChain = this.findLongestSequentialChain(workflow.steps);
    if (longestChain > 10) {
      this.addSuggestion(
        'optimization',
        `Long sequential chain detected (${longestChain} steps). Consider breaking into smaller workflows`,
        'steps',
        false
      );
    }

    // Check for timeout optimization
    const totalTimeout = workflow.steps.reduce((sum, step) => sum + step.timeout, 0);
    if (totalTimeout > workflow.timeout * 0.8) {
      this.addSuggestion(
        'optimization',
        'Step timeouts sum to more than 80% of workflow timeout. Consider optimizing timeouts',
        'timeout',
        true
      );
    }

    // Check for error handling best practices
    if (!workflow.errorHandling.notificationOnError) {
      this.addSuggestion(
        'best-practice',
        'Consider enabling error notifications for better monitoring',
        'errorHandling.notificationOnError',
        true
      );
    }
  }

  /**
   * Helper method to find independent steps that could run in parallel
   */
  private findIndependentSteps(steps: WorkflowStep[]): WorkflowStep[] {
    return steps.filter((step) => step.dependencies.length === 0);
  }

  /**
   * Helper method to find the longest sequential chain of dependencies
   */
  private findLongestSequentialChain(steps: WorkflowStep[]): number {
    const stepMap = new Map(steps.map((step) => [step.id, step]));
    const memo = new Map<string, number>();

    const getChainLength = (stepId: string): number => {
      if (memo.has(stepId)) {
        return memo.get(stepId)!;
      }

      const step = stepMap.get(stepId);
      if (!step || step.dependencies.length === 0) {
        memo.set(stepId, 1);
        return 1;
      }

      const maxDepLength = Math.max(...step.dependencies.map((depId) => getChainLength(depId)));
      const chainLength = maxDepLength + 1;
      memo.set(stepId, chainLength);
      return chainLength;
    };

    return Math.max(...steps.map((step) => getChainLength(step.id)));
  }

  /**
   * Resets validation state for new validation run
   */
  private resetValidation(): void {
    this.errors = [];
    this.warnings = [];
    this.suggestions = [];
  }

  /**
   * Adds a validation error
   */
  private addError(code: string, message: string, path: string, details?: any): void {
    this.errors.push({
      code,
      message,
      path,
      severity: 'error',
      details,
    });
  }

  /**
   * Adds a validation warning
   */
  private addWarning(code: string, message: string, path: string, suggestion?: string): void {
    const warning: ValidationWarning = {
      code,
      message,
      path,
    };

    if (suggestion) {
      warning.suggestion = suggestion;
    }

    this.warnings.push(warning);
  }

  /**
   * Adds a validation suggestion
   */
  private addSuggestion(
    type: 'optimization' | 'best-practice' | 'security',
    message: string,
    path: string,
    autoFixable: boolean
  ): void {
    this.suggestions.push({
      type,
      message,
      path,
      autoFixable,
    });
  }
}

/**
 * Factory function to create a new workflow validator instance
 */
export function createWorkflowValidator(): WorkflowValidator {
  return new WorkflowValidator();
}

/**
 * Convenience function to validate a workflow definition
 */
export function validateWorkflow(workflow: WorkflowDefinition): ValidationResult {
  const validator = createWorkflowValidator();
  return validator.validateDefinition(workflow);
}

/**
 * Convenience function to validate a workflow step
 */
export function validateWorkflowStep(step: WorkflowStep): ValidationResult {
  const validator = createWorkflowValidator();
  return validator.validateStep(step);
}
