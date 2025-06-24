/**
 * Workflow Persistence Service Tests - TASK-008.1.3
 * Comprehensive test suite for database persistence layer
 */

import { Pool } from 'pg';
import {
  WorkflowPersistenceService,
  WorkflowPersistenceConfig,
} from '../services/workflow-persistence';
import {
  WorkflowDefinitionInput,
  WorkflowState,
  ExecutionContext,
  ExecutionMetrics,
  ExecutionStatus,
  StepExecutionStatus,
  WorkflowStatus,
  WorkflowResult,
} from '../types/workflow';

// Mock pg module
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    totalCount: 10,
    idleCount: 5,
    waitingCount: 0,
  })),
}));

describe('WorkflowPersistenceService', () => {
  let service: WorkflowPersistenceService;
  let mockPool: jest.Mocked<Pool>;
  let mockClient: any;
  let config: WorkflowPersistenceConfig;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock client
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    // Create mock pool
    mockPool = new Pool() as jest.Mocked<Pool>;
    mockPool.connect = jest.fn().mockResolvedValue(mockClient);

    // Create config
    config = {
      connectionPool: mockPool,
      enableMetrics: true,
      enableCheckpoints: true,
      maxRetries: 3,
      retryDelay: 1000,
    };

    // Create service instance
    service = new WorkflowPersistenceService(config);
  });

  describe('Workflow Definition Management', () => {
    const mockWorkflow: WorkflowDefinitionInput = {
      name: 'test-workflow',
      version: '1.0.0',
      description: 'Test workflow for unit tests',
      steps: [
        {
          id: 'step1',
          name: 'Test Step',
          type: 'command',
          action: {
            type: 'command',
            command: {
              command: 'test-command',
              parameters: {},
            },
          },
          dependencies: [],
          timeout: 60000,
          retryPolicy: {
            maxAttempts: 3,
            backoffStrategy: 'exponential',
            initialDelay: 1000,
            maxDelay: 10000,
            multiplier: 2,
          },
          enabled: true,
        },
      ],
      triggers: [],
      status: 'active' as WorkflowStatus,
      createdBy: 'test-user',
      errorHandling: {
        strategy: 'fail_fast',
        maxRetries: 3,
        retryDelay: 1000,
        notificationOnError: true,
        continueOnError: false,
      },
      timeout: 300000,
      retryPolicy: {
        maxAttempts: 3,
        backoffStrategy: 'exponential',
        initialDelay: 1000,
        maxDelay: 30000,
        multiplier: 2,
      },
      metadata: {
        tags: ['test'],
        category: 'testing',
        priority: 'normal',
        owner: 'test-user',
        environment: 'development',
        estimatedDuration: 60000,
      },
    };

    describe('saveWorkflow', () => {
      it('should save workflow definition successfully', async () => {
        const mockWorkflowId = 'workflow-123';
        mockClient.query.mockResolvedValueOnce({
          rows: [{ id: mockWorkflowId }],
        });

        const result = await service.saveWorkflow(mockWorkflow);

        expect(result).toBe(mockWorkflowId);
        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO workflows'),
          expect.arrayContaining([
            mockWorkflow.name,
            mockWorkflow.version,
            mockWorkflow.description,
            JSON.stringify(mockWorkflow),
            mockWorkflow.status,
            mockWorkflow.createdBy,
            mockWorkflow.metadata.tags,
            mockWorkflow.metadata.category,
            mockWorkflow.metadata.priority,
            mockWorkflow.metadata.environment,
            mockWorkflow.metadata.estimatedDuration,
          ])
        );
        expect(mockClient.release).toHaveBeenCalled();
      });

      it('should handle database errors', async () => {
        const error = new Error('Database connection failed');
        mockClient.query.mockRejectedValueOnce(error);

        await expect(service.saveWorkflow(mockWorkflow)).rejects.toThrow(
          'Failed to save workflow: Database connection failed'
        );
        expect(mockClient.release).toHaveBeenCalled();
      });
    });

    describe('loadWorkflow', () => {
      it('should load workflow definition by ID', async () => {
        const mockRow = {
          id: 'workflow-123',
          name: 'test-workflow',
          version: '1.0.0',
          definition: JSON.stringify(mockWorkflow),
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockClient.query.mockResolvedValueOnce({
          rows: [mockRow],
        });

        const result = await service.loadWorkflow('workflow-123');

        expect(result).toBeDefined();
        expect(result?.id).toBe('workflow-123');
        expect(result?.name).toBe('test-workflow');
        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('SELECT * FROM workflows WHERE id = $1'),
          ['workflow-123']
        );
      });

      it('should return null for non-existent workflow', async () => {
        mockClient.query.mockResolvedValueOnce({
          rows: [],
        });

        const result = await service.loadWorkflow('non-existent');

        expect(result).toBeNull();
      });
    });

    describe('updateWorkflow', () => {
      it('should update workflow definition', async () => {
        const updates = {
          description: 'Updated description',
          status: 'inactive' as WorkflowStatus,
        };

        mockClient.query.mockResolvedValueOnce({ rows: [] });

        await service.updateWorkflow('workflow-123', updates);

        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE workflows'),
          expect.arrayContaining(['Updated description', 'inactive', 'workflow-123'])
        );
      });

      it('should handle empty updates', async () => {
        await service.updateWorkflow('workflow-123', {});

        expect(mockClient.query).not.toHaveBeenCalled();
      });
    });

    describe('listWorkflows', () => {
      it('should list workflows with pagination', async () => {
        const mockRows = [
          {
            id: 'workflow-1',
            definition: JSON.stringify(mockWorkflow),
            created_at: new Date(),
            updated_at: new Date(),
          },
        ];

        mockClient.query
          .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // Count query
          .mockResolvedValueOnce({ rows: mockRows }); // Data query

        const result = await service.listWorkflows({
          limit: 10,
          offset: 0,
        });

        expect(result.total).toBe(1);
        expect(result.workflows).toHaveLength(1);
        expect(result.workflows[0]?.id).toBe('workflow-1');
      });

      it('should apply filters', async () => {
        mockClient.query
          .mockResolvedValueOnce({ rows: [{ count: '0' }] })
          .mockResolvedValueOnce({ rows: [] });

        await service.listWorkflows({
          filters: {
            status: 'active',
            category: 'testing',
          },
        });

        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('WHERE status = $1 AND category = $2'),
          expect.arrayContaining(['active', 'testing'])
        );
      });
    });
  });

  describe('Workflow Execution Management', () => {
    const mockContext: ExecutionContext = {
      correlationId: 'corr-123',
      environment: 'development',
      variables: { key: 'value' },
      userId: 'test-user',
    };

    describe('createExecution', () => {
      it('should create workflow execution', async () => {
        const mockExecutionId = 'execution-123';

        mockClient.query
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({ rows: [{ version: '1.0.0' }] }) // Get workflow version
          .mockResolvedValueOnce({ rows: [{ id: mockExecutionId }] }) // Create execution
          .mockResolvedValueOnce(undefined) // Create state
          .mockResolvedValueOnce(undefined); // COMMIT

        const result = await service.createExecution(
          'workflow-123',
          mockContext,
          'test-user',
          'manual'
        );

        expect(result).toBe(mockExecutionId);
        expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      });

      it('should rollback on error', async () => {
        const error = new Error('Execution creation failed');

        mockClient.query
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockRejectedValueOnce(error); // Fail on workflow query

        await expect(
          service.createExecution('workflow-123', mockContext, 'test-user')
        ).rejects.toThrow('Failed to create execution');

        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      });
    });

    describe('updateExecution', () => {
      it('should update execution status and result', async () => {
        const mockResult: WorkflowResult = {
          status: 'completed',
          metrics: {
            totalDuration: 5000,
            stepCount: 3,
            successfulSteps: 2,
            failedSteps: 1,
            skippedSteps: 0,
            parallelExecutions: 1,
            resourceUsage: {
              cpuTime: 1000,
              memoryPeak: 512,
              networkBytes: 1024,
              storageBytes: 2048,
              executionTime: 5000,
            },
            performanceMetrics: {
              averageStepDuration: 1666,
              parallelEfficiency: 0.8,
              queueWaitTime: 100,
              resourceUtilization: 0.7,
              throughput: 0.6,
            },
          },
          summary: {
            totalSteps: 3,
            successfulSteps: 2,
            failedSteps: 1,
            skippedSteps: 0,
            parallelGroups: 0,
            retryAttempts: 0,
            errorRate: 0.33,
            performance: 'good',
          },
        };

        const updates = {
          status: 'completed' as ExecutionStatus,
          result: mockResult,
          completedAt: new Date(),
          duration: 5000,
        };

        mockClient.query.mockResolvedValueOnce(undefined);

        await service.updateExecution('execution-123', updates);

        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE workflow_executions'),
          expect.arrayContaining([
            'completed',
            JSON.stringify(updates.result),
            updates.completedAt,
            updates.duration,
            'execution-123',
          ])
        );
      });
    });

    describe('loadExecution', () => {
      it('should load execution with state', async () => {
        const mockRow = {
          id: 'execution-123',
          workflow_id: 'workflow-123',
          workflow_version: '1.0.0',
          status: 'running',
          context: JSON.stringify(mockContext),
          triggered_by: 'test-user',
          trigger_type: 'manual',
          metadata: JSON.stringify({}),
          current_step: 'step1',
          completed_steps: [],
          failed_steps: [],
          skipped_steps: [],
        };

        mockClient.query.mockResolvedValueOnce({
          rows: [mockRow],
        });

        const result = await service.loadExecution('execution-123');

        expect(result).toBeDefined();
        expect(result?.id).toBe('execution-123');
        expect(result?.status).toBe('running');
      });
    });

    describe('listExecutions', () => {
      it('should list executions with filters', async () => {
        mockClient.query
          .mockResolvedValueOnce({ rows: [{ count: '1' }] })
          .mockResolvedValueOnce({ rows: [] });

        await service.listExecutions({
          status: ['running', 'completed'],
          workflowId: 'workflow-123',
          triggeredBy: 'test-user',
        });

        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining(
            'WHERE status = ANY($1) AND workflow_id = $2 AND triggered_by = $3'
          ),
          expect.arrayContaining([['running', 'completed'], 'workflow-123', 'test-user'])
        );
      });
    });
  });

  describe('Workflow State Management', () => {
    const mockState: WorkflowState = {
      executionId: 'execution-123',
      workflowId: 'workflow-123',
      currentStep: 'step1',
      completedSteps: [],
      failedSteps: [],
      skippedSteps: [],
      variables: { key: 'value' },
      parallelGroups: {},
      lastUpdated: new Date(),
      checkpoints: [],
    };

    describe('saveState', () => {
      it('should save workflow state', async () => {
        mockClient.query.mockResolvedValueOnce(undefined);

        await service.saveState('execution-123', mockState);

        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE workflow_states'),
          expect.arrayContaining([
            mockState.currentStep,
            mockState.completedSteps,
            mockState.failedSteps,
            mockState.skippedSteps,
            JSON.stringify(mockState.variables),
            JSON.stringify(mockState.parallelGroups),
            JSON.stringify(mockState.checkpoints),
            'execution-123',
          ])
        );
      });
    });

    describe('loadState', () => {
      it('should load workflow state', async () => {
        const mockRow = {
          execution_id: 'execution-123',
          workflow_id: 'workflow-123',
          current_step: 'step1',
          completed_steps: [],
          failed_steps: [],
          skipped_steps: [],
          variables: JSON.stringify({ key: 'value' }),
          parallel_groups: JSON.stringify({}),
          checkpoints: JSON.stringify([]),
          last_updated: new Date(),
        };

        mockClient.query.mockResolvedValueOnce({
          rows: [mockRow],
        });

        const result = await service.loadState('execution-123');

        expect(result).toBeDefined();
        expect(result?.executionId).toBe('execution-123');
        expect(result?.currentStep).toBe('step1');
      });
    });

    describe('createCheckpoint', () => {
      it('should create state checkpoint when enabled', async () => {
        mockClient.query.mockResolvedValueOnce(undefined);

        await service.createCheckpoint(
          'execution-123',
          'step1',
          { stepData: 'test' },
          { key: 'value' }
        );

        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO workflow_state_checkpoints'),
          expect.arrayContaining([
            'execution-123',
            'step1',
            JSON.stringify({ stepData: 'test' }),
            JSON.stringify({ key: 'value' }),
          ])
        );
      });

      it('should skip checkpoint creation when disabled', async () => {
        const disabledConfig = { ...config, enableCheckpoints: false };
        const disabledService = new WorkflowPersistenceService(disabledConfig);

        await disabledService.createCheckpoint('execution-123', 'step1', {}, {});

        expect(mockClient.query).not.toHaveBeenCalled();
      });
    });
  });

  describe('Step Execution Management', () => {
    describe('createStepExecution', () => {
      it('should create step execution record', async () => {
        const mockStepExecutionId = 'step-exec-123';
        mockClient.query.mockResolvedValueOnce({
          rows: [{ id: mockStepExecutionId }],
        });

        const result = await service.createStepExecution(
          'execution-123',
          'step1',
          'Test Step',
          'action'
        );

        expect(result).toBe(mockStepExecutionId);
        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO workflow_step_executions'),
          ['execution-123', 'step1', 'Test Step', 'action']
        );
      });
    });

    describe('updateStepExecution', () => {
      it('should update step execution', async () => {
        const updates = {
          status: 'completed' as StepExecutionStatus,
          output: { result: 'success' },
          duration: 1000,
        };

        mockClient.query.mockResolvedValueOnce(undefined);

        await service.updateStepExecution('step-exec-123', updates);

        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE workflow_step_executions'),
          expect.arrayContaining([
            'completed',
            JSON.stringify(updates.output),
            updates.duration,
            'step-exec-123',
          ])
        );
      });
    });
  });

  describe('Logging', () => {
    describe('addLog', () => {
      it('should add execution log entry', async () => {
        mockClient.query.mockResolvedValueOnce(undefined);

        await service.addLog(
          'execution-123',
          'info',
          'Test log message',
          { key: 'value' },
          'step-exec-123'
        );

        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO workflow_execution_logs'),
          [
            'execution-123',
            'step-exec-123',
            'info',
            'Test log message',
            JSON.stringify({ key: 'value' }),
          ]
        );
      });

      it('should handle logging errors gracefully', async () => {
        const error = new Error('Logging failed');
        mockClient.query.mockRejectedValueOnce(error);

        // Should not throw
        await expect(
          service.addLog('execution-123', 'error', 'Test error')
        ).resolves.toBeUndefined();
      });
    });
  });

  describe('Metrics', () => {
    describe('saveMetrics', () => {
      it('should save execution metrics when enabled', async () => {
        const mockMetrics: ExecutionMetrics = {
          totalDuration: 5000,
          stepCount: 3,
          successfulSteps: 2,
          failedSteps: 1,
          skippedSteps: 0,
          parallelExecutions: 1,
          resourceUsage: {
            cpuTime: 1000,
            memoryPeak: 512,
            networkBytes: 1024,
            storageBytes: 2048,
            executionTime: 5000,
          },
          performanceMetrics: {
            averageStepDuration: 1666,
            parallelEfficiency: 0.8,
            queueWaitTime: 100,
            resourceUtilization: 0.7,
            throughput: 0.6,
          },
        };

        mockClient.query.mockResolvedValueOnce(undefined);

        await service.saveMetrics('execution-123', 'workflow-123', mockMetrics);

        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO workflow_metrics'),
          expect.arrayContaining([
            'execution-123',
            'workflow-123',
            mockMetrics.totalDuration,
            mockMetrics.stepCount,
            mockMetrics.successfulSteps,
            mockMetrics.failedSteps,
            mockMetrics.skippedSteps,
            mockMetrics.parallelExecutions,
          ])
        );
      });

      it('should skip metrics when disabled', async () => {
        const disabledConfig = { ...config, enableMetrics: false };
        const disabledService = new WorkflowPersistenceService(disabledConfig);

        const mockMetrics: ExecutionMetrics = {
          totalDuration: 5000,
          stepCount: 3,
          successfulSteps: 2,
          failedSteps: 1,
          skippedSteps: 0,
          parallelExecutions: 1,
          resourceUsage: {
            cpuTime: 1000,
            memoryPeak: 512,
            networkBytes: 1024,
            storageBytes: 2048,
            executionTime: 5000,
          },
          performanceMetrics: {
            averageStepDuration: 1666,
            parallelEfficiency: 0.8,
            queueWaitTime: 100,
            resourceUtilization: 0.7,
            throughput: 0.6,
          },
        };

        await disabledService.saveMetrics('execution-123', 'workflow-123', mockMetrics);

        expect(mockClient.query).not.toHaveBeenCalled();
      });
    });
  });

  describe('Recovery Methods', () => {
    describe('recoverExecution', () => {
      it('should recover execution from checkpoints', async () => {
        const mockState = {
          execution_id: 'execution-123',
          workflow_id: 'workflow-123',
          current_step: 'step1',
          completed_steps: [],
          failed_steps: [],
          skipped_steps: [],
          variables: JSON.stringify({ key: 'value' }),
          parallel_groups: JSON.stringify({}),
          checkpoints: JSON.stringify([]),
          last_updated: new Date(),
        };

        const mockCheckpoints = [
          {
            id: 'checkpoint-1',
            step_id: 'step1',
            timestamp: new Date(),
            checkpoint_data: JSON.stringify({ stepData: 'test' }),
            variables: JSON.stringify({ key: 'value' }),
          },
        ];

        mockClient.query
          .mockResolvedValueOnce({ rows: [mockState] }) // Load state
          .mockResolvedValueOnce({ rows: mockCheckpoints }); // Load checkpoints

        const result = await service.recoverExecution('execution-123');

        expect(result).toBeDefined();
        expect(result?.executionId).toBe('execution-123');
        expect(result?.checkpoints).toHaveLength(1);
      });

      it('should return null for non-existent execution', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [] });

        const result = await service.recoverExecution('non-existent');

        expect(result).toBeNull();
      });
    });
  });

  describe('Cleanup Methods', () => {
    describe('cleanupOldExecutions', () => {
      it('should clean up old executions', async () => {
        mockClient.query.mockResolvedValueOnce({ rowCount: 5 });

        const result = await service.cleanupOldExecutions(30);

        expect(result).toBe(5);
        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM workflow_executions'),
          expect.any(Array)
        );
      });
    });
  });

  describe('Health Check', () => {
    describe('healthCheck', () => {
      it('should return healthy status', async () => {
        const mockTables = [
          { table_name: 'workflows' },
          { table_name: 'workflow_executions' },
          { table_name: 'workflow_states' },
        ];

        mockClient.query
          .mockResolvedValueOnce(undefined) // Health check query
          .mockResolvedValueOnce({ rows: mockTables }); // Table check

        const result = await service.healthCheck();

        expect(result.healthy).toBe(true);
        expect(result.details.tables).toEqual([
          'workflows',
          'workflow_executions',
          'workflow_states',
        ]);
        expect(result.details.connectionPool).toBeDefined();
      });

      it('should return unhealthy status on error', async () => {
        const error = new Error('Connection failed');
        (mockPool.connect as jest.Mock).mockRejectedValue(error);

        const result = await service.healthCheck();

        expect(result.healthy).toBe(false);
        expect(result.details.error).toBe('Connection failed');
      });
    });
  });
});
