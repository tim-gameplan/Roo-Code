/**
 * Workflow template service for Phase 4 Advanced Orchestration
 * Provides pre-built workflow templates and template management functionality
 */

import {
  WorkflowDefinition,
  WorkflowTemplate,
  TemplateParameter,
  TemplateExample,
  ValidationResult,
  DEFAULT_VALUES,
  WORKFLOW_CONSTANTS,
} from '../types/workflow';
import { validateWorkflow } from './workflow-validator';

export class WorkflowTemplateService {
  private templates: Map<string, WorkflowTemplate> = new Map();

  constructor() {
    this.initializeBuiltInTemplates();
  }

  /**
   * Gets all available workflow templates
   */
  getAllTemplates(): WorkflowTemplate[] {
    return Array.from(this.templates.values()).sort((a, b) => b.popularity - a.popularity);
  }

  /**
   * Gets templates by category
   */
  getTemplatesByCategory(category: string): WorkflowTemplate[] {
    return this.getAllTemplates().filter((template) => template.category === category);
  }

  /**
   * Gets a specific template by ID
   */
  getTemplate(id: string): WorkflowTemplate | null {
    return this.templates.get(id) || null;
  }

  /**
   * Searches templates by name, description, or tags
   */
  searchTemplates(query: string): WorkflowTemplate[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllTemplates().filter(
      (template) =>
        template.name.toLowerCase().includes(lowerQuery) ||
        template.description.toLowerCase().includes(lowerQuery) ||
        template.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Creates a workflow from a template with provided parameters
   */
  createWorkflowFromTemplate(
    templateId: string,
    parameters: Record<string, any>,
    workflowOverrides?: Partial<WorkflowDefinition>
  ): { workflow: WorkflowDefinition; validation: ValidationResult } {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template with ID "${templateId}" not found`);
    }

    // Validate required parameters
    this.validateTemplateParameters(template, parameters);

    // Generate workflow from template
    const workflow = this.generateWorkflowFromTemplate(template, parameters, workflowOverrides);

    // Validate the generated workflow
    const validation = validateWorkflow(workflow);

    return { workflow, validation };
  }

  /**
   * Registers a new custom template
   */
  registerTemplate(
    template: Omit<WorkflowTemplate, 'id' | 'createdAt' | 'updatedAt' | 'popularity'>
  ): string {
    const id = this.generateTemplateId(template.name);
    const fullTemplate: WorkflowTemplate = {
      ...template,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
      popularity: 0,
    };

    this.templates.set(id, fullTemplate);
    return id;
  }

  /**
   * Updates an existing template
   */
  updateTemplate(id: string, updates: Partial<WorkflowTemplate>): boolean {
    const template = this.templates.get(id);
    if (!template) {
      return false;
    }

    const updatedTemplate = {
      ...template,
      ...updates,
      id, // Preserve original ID
      createdAt: template.createdAt, // Preserve creation date
      updatedAt: new Date(),
    };

    this.templates.set(id, updatedTemplate);
    return true;
  }

  /**
   * Deletes a template
   */
  deleteTemplate(id: string): boolean {
    return this.templates.delete(id);
  }

  /**
   * Increments template popularity (usage counter)
   */
  incrementTemplateUsage(id: string): void {
    const template = this.templates.get(id);
    if (template) {
      template.popularity++;
      template.updatedAt = new Date();
    }
  }

  /**
   * Gets template categories
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    this.templates.forEach((template) => categories.add(template.category));
    return Array.from(categories).sort();
  }

  /**
   * Validates template parameters against template requirements
   */
  private validateTemplateParameters(
    template: WorkflowTemplate,
    parameters: Record<string, any>
  ): void {
    const errors: string[] = [];

    for (const param of template.parameters) {
      const value = parameters[param.name];

      // Check required parameters
      if (param.required && (value === undefined || value === null)) {
        errors.push(`Required parameter "${param.name}" is missing`);
        continue;
      }

      // Skip validation for optional missing parameters
      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      if (!this.validateParameterType(value, param.type)) {
        errors.push(`Parameter "${param.name}" must be of type ${param.type}`);
      }

      // Custom validation
      if (param.validation) {
        const validationError = this.validateParameterValue(value, param.validation);
        if (validationError) {
          errors.push(`Parameter "${param.name}": ${validationError}`);
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Template parameter validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * Validates parameter type
   */
  private validateParameterType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      case 'date':
        return value instanceof Date || !isNaN(Date.parse(value));
      default:
        return true;
    }
  }

  /**
   * Validates parameter value against validation rules
   */
  private validateParameterValue(value: any, validation: any): string | null {
    if (validation.pattern && typeof value === 'string') {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value)) {
        return `does not match pattern ${validation.pattern}`;
      }
    }

    if (validation.minLength !== undefined && typeof value === 'string') {
      if (value.length < validation.minLength) {
        return `must be at least ${validation.minLength} characters long`;
      }
    }

    if (validation.maxLength !== undefined && typeof value === 'string') {
      if (value.length > validation.maxLength) {
        return `must be no more than ${validation.maxLength} characters long`;
      }
    }

    if (validation.min !== undefined && typeof value === 'number') {
      if (value < validation.min) {
        return `must be at least ${validation.min}`;
      }
    }

    if (validation.max !== undefined && typeof value === 'number') {
      if (value > validation.max) {
        return `must be no more than ${validation.max}`;
      }
    }

    if (validation.enum && !validation.enum.includes(value)) {
      return `must be one of: ${validation.enum.join(', ')}`;
    }

    return null;
  }

  /**
   * Generates a workflow from template and parameters
   */
  private generateWorkflowFromTemplate(
    template: WorkflowTemplate,
    parameters: Record<string, any>,
    overrides?: Partial<WorkflowDefinition>
  ): WorkflowDefinition {
    // Start with template definition
    const baseWorkflow = { ...template.definition };

    // Apply parameter substitutions
    const processedWorkflow = this.substituteTemplateVariables(baseWorkflow, parameters);

    // Apply default values
    const workflowWithDefaults = this.applyDefaultValues(processedWorkflow);

    // Apply user overrides
    const finalWorkflow = {
      ...workflowWithDefaults,
      ...overrides,
      id: overrides?.id || this.generateWorkflowId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: overrides?.createdBy || 'template-service',
    } as WorkflowDefinition;

    return finalWorkflow;
  }

  /**
   * Substitutes template variables with parameter values
   */
  private substituteTemplateVariables(obj: any, parameters: Record<string, any>): any {
    if (typeof obj === 'string') {
      return this.replaceTemplateVariables(obj, parameters);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.substituteTemplateVariables(item, parameters));
    }

    if (typeof obj === 'object' && obj !== null) {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.substituteTemplateVariables(value, parameters);
      }
      return result;
    }

    return obj;
  }

  /**
   * Replaces template variables in strings
   */
  private replaceTemplateVariables(str: string, parameters: Record<string, any>): string {
    return str.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return parameters[varName] !== undefined ? String(parameters[varName]) : match;
    });
  }

  /**
   * Applies default values to workflow
   */
  private applyDefaultValues(workflow: Partial<WorkflowDefinition>): Partial<WorkflowDefinition> {
    return {
      timeout: DEFAULT_VALUES.WORKFLOW.timeout,
      retryPolicy: { ...DEFAULT_VALUES.WORKFLOW.retryPolicy },
      errorHandling: { ...DEFAULT_VALUES.WORKFLOW.errorHandling },
      metadata: {
        ...DEFAULT_VALUES.WORKFLOW.metadata,
        owner: 'template-service',
        tags: [],
      },
      status: 'draft',
      ...workflow,
    };
  }

  /**
   * Generates a unique template ID
   */
  private generateTemplateId(name: string): string {
    const baseId = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    let id = baseId;
    let counter = 1;

    while (this.templates.has(id)) {
      id = `${baseId}-${counter}`;
      counter++;
    }

    return id;
  }

  /**
   * Generates a unique workflow ID
   */
  private generateWorkflowId(): string {
    return `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Initializes built-in workflow templates
   */
  private initializeBuiltInTemplates(): void {
    // Simple Command Execution Template
    this.templates.set('simple-command', {
      id: 'simple-command',
      name: 'Simple Command Execution',
      description: 'Execute a single command on a target device',
      category: 'Basic',
      version: '1.0.0',
      definition: {
        name: '{{workflowName}}',
        version: '1.0.0',
        description: '{{description}}',
        steps: [
          {
            id: 'execute-command',
            name: 'Execute Command',
            type: 'command',
            action: {
              type: 'command',
              command: {
                deviceId: '{{deviceId}}',
                command: '{{command}}',
                parameters: {},
              },
            },
            dependencies: [],
            timeout: 30000,
            retryPolicy: DEFAULT_VALUES.STEP.retryPolicy,
            enabled: true,
          },
        ],
        errorHandling: DEFAULT_VALUES.WORKFLOW.errorHandling,
        timeout: DEFAULT_VALUES.WORKFLOW.timeout,
        retryPolicy: DEFAULT_VALUES.WORKFLOW.retryPolicy,
        metadata: {
          ...DEFAULT_VALUES.WORKFLOW.metadata,
          owner: 'system',
          category: 'command-execution',
          tags: [],
        },
      },
      parameters: [
        {
          name: 'workflowName',
          type: 'string',
          required: true,
          description: 'Name for the workflow',
          examples: ['Deploy Application', 'Restart Service'],
        },
        {
          name: 'description',
          type: 'string',
          required: false,
          defaultValue: 'Execute a command on target device',
          description: 'Description of what the workflow does',
        },
        {
          name: 'deviceId',
          type: 'string',
          required: true,
          description: 'Target device ID',
          examples: ['device-001', 'server-prod-01'],
        },
        {
          name: 'command',
          type: 'string',
          required: true,
          description: 'Command to execute',
          examples: ['npm start', 'systemctl restart nginx', 'docker-compose up -d'],
        },
      ],
      examples: [
        {
          name: 'Restart Web Server',
          description: 'Restart nginx web server',
          parameters: {
            workflowName: 'Restart Nginx',
            description: 'Restart nginx web server on production',
            deviceId: 'web-server-01',
            command: 'systemctl restart nginx',
          },
        },
      ],
      documentation:
        'This template creates a simple workflow that executes a single command on a specified device.',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'system',
      tags: ['command', 'basic', 'single-step'],
      popularity: 100,
    });
  }
}

/**
 * Factory function to create a new workflow template service instance
 */
export function createWorkflowTemplateService(): WorkflowTemplateService {
  return new WorkflowTemplateService();
}

/**
 * Global template service instance
 */
export const workflowTemplateService = new WorkflowTemplateService();
