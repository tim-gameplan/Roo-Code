/**
 * TASK-008.1.4.2: Schedule Manager Service Tests
 *
 * Comprehensive test suite for the ScheduleManagerService
 * Tests schedule lifecycle, execution management, and optimization features
 */

import { ScheduleManagerService } from '../services/schedule-manager';
import { CronEngineService } from '../services/cron-engine';
import { WorkflowPersistenceService } from '../services/workflow-persistence';
import { ScheduleState, SchedulePriority, DEFAULT_RETRY_POLICY } from '../types/scheduling';

// Mock dependencies
jest.mock('../services/cron-engine');
jest.mock('../services/workflow-persistence');
jest.mock('../utils/logger', () => ({
  logger: {
    child: () => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

describe('ScheduleManagerService', () => {
  let scheduleManager: ScheduleManagerService;
  let mockCronEngine: jest.Mocked<CronEngineService>;
  let mockWorkflowPersistence: jest.Mocked<WorkflowPersistenceService>;

  beforeEach(() => {
    // Create mocked dependencies
    mockCronEngine = {
      validateExpression: jest.fn(),
      getNextExecutionTime: jest.fn(),
      getNextExecutionTimes: jest.fn(),
      parseExpression: jest.fn(),
      getPreviousExecutionTime: jest.fn(),
      analyzeScheduleFrequency: jest.fn(),
      detectScheduleConflicts: jest.fn(),
      optimizeScheduleDistribution: jest.fn(),
    } as any;

    mockWorkflowPersistence = {
      // Add minimal mock methods as needed
    } as any;

    // Initialize service with mocked dependencies
    scheduleManager = new ScheduleManagerService(mockCronEngine, mockWorkflowPersistence);
  });

  afterEach(async () => {
    // Clean up after each test
    if (scheduleManager) {
      await scheduleManager.stop();
    }
    jest.clearAllMocks();
  });

  describe('Service Lifecycle', () => {
    test('should start service successfully', async () => {
      await expect(scheduleManager.start()).resolves.not.toThrow();
    });

    test('should stop service successfully', async () => {
      await scheduleManager.start();
      await expect(scheduleManager.stop()).resolves.not.toThrow();
    });

    test('should handle multiple start calls gracefully', async () => {
      await scheduleManager.start();
      await expect(scheduleManager.start()).resolves.not.toThrow();
    });

    test('should handle stop when not running', async () => {
      await expect(scheduleManager.stop()).resolves.not.toThrow();
    });
  });

  describe('Schedule Creation', () => {
    beforeEach(async () => {
      await scheduleManager.start();

      // Mock successful cron validation
      mockCronEngine.validateExpression.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: [],
        description: 'Every minute',
        frequency: {
          type: 'minutely',
          interval: 1,
          description: 'Every minute',
          estimatedExecutionsPerDay: 1440,
        },
        nextExecutions: [new Date(Date.now() + 60000)],
      });

      mockCronEngine.getNextExecutionTime.mockResolvedValue(new Date(Date.now() + 60000));
    });

    test('should create schedule with valid configuration', async () => {
      const scheduleConfig = {
        workflowId: 'workflow-123',
        name: 'Test Schedule',
        description: 'A test schedule',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        enabled: true,
        retryPolicy: DEFAULT_RETRY_POLICY,
        metadata: {
          tags: ['test'],
          priority: SchedulePriority.NORMAL,
        },
        createdBy: 'test-user',
      };

      const scheduleId = await scheduleManager.createSchedule(scheduleConfig);

      expect(scheduleId).toBeDefined();
      expect(scheduleId).toMatch(/^schedule_\d+_[a-z0-9]+$/);
      expect(mockCronEngine.validateExpression).toHaveBeenCalledWith('0 * * * *');
    });

    test('should reject schedule with invalid cron expression', async () => {
      mockCronEngine.validateExpression.mockResolvedValue({
        valid: false,
        errors: ['Invalid cron expression'],
        warnings: [],
        description: '',
        frequency: {
          type: 'custom',
          interval: 0,
          description: 'Invalid',
          estimatedExecutionsPerDay: 0,
        },
        nextExecutions: [],
      });

      const scheduleConfig = {
        workflowId: 'workflow-123',
        name: 'Invalid Schedule',
        cronExpression: 'invalid-cron',
        timezone: 'UTC',
        enabled: true,
        retryPolicy: DEFAULT_RETRY_POLICY,
        metadata: {
          tags: [],
          priority: SchedulePriority.NORMAL,
        },
        createdBy: 'test-user',
      };

      await expect(scheduleManager.createSchedule(scheduleConfig)).rejects.toThrow(
        'Invalid cron expression: Invalid cron expression'
      );
    });

    test('should create schedule with default values', async () => {
      const minimalConfig = {
        workflowId: 'workflow-123',
        name: 'Minimal Schedule',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        enabled: true,
        retryPolicy: DEFAULT_RETRY_POLICY,
        metadata: {
          tags: [],
          priority: SchedulePriority.NORMAL,
        },
        createdBy: 'test-user',
      };

      const scheduleId = await scheduleManager.createSchedule(minimalConfig);
      const schedule = await scheduleManager.getSchedule(scheduleId);

      expect(schedule).toBeDefined();
      expect(schedule!.timezone).toBe('UTC');
      expect(schedule!.enabled).toBe(true);
    });
  });

  describe('Schedule Management', () => {
    let scheduleId: string;

    beforeEach(async () => {
      await scheduleManager.start();

      mockCronEngine.validateExpression.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: [],
        description: 'Every hour',
        frequency: {
          type: 'hourly',
          interval: 1,
          description: 'Every hour',
          estimatedExecutionsPerDay: 24,
        },
        nextExecutions: [new Date(Date.now() + 3600000)],
      });

      mockCronEngine.getNextExecutionTime.mockResolvedValue(new Date(Date.now() + 3600000));

      scheduleId = await scheduleManager.createSchedule({
        workflowId: 'workflow-123',
        name: 'Test Schedule',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        enabled: true,
        retryPolicy: DEFAULT_RETRY_POLICY,
        metadata: {
          tags: ['test'],
          priority: SchedulePriority.NORMAL,
        },
        createdBy: 'test-user',
      });
    });

    test('should retrieve schedule by ID', async () => {
      const schedule = await scheduleManager.getSchedule(scheduleId);

      expect(schedule).toBeDefined();
      expect(schedule!.id).toBe(scheduleId);
      expect(schedule!.workflowId).toBe('workflow-123');
      expect(schedule!.name).toBe('Test Schedule');
    });

    test('should return null for non-existent schedule', async () => {
      const schedule = await scheduleManager.getSchedule('non-existent-id');
      expect(schedule).toBeNull();
    });

    test('should update schedule successfully', async () => {
      const updates = {
        name: 'Updated Schedule',
        description: 'Updated description',
        cronExpression: '0 0 * * *',
      };

      await scheduleManager.updateSchedule(scheduleId, updates);
      const updatedSchedule = await scheduleManager.getSchedule(scheduleId);

      expect(updatedSchedule!.name).toBe('Updated Schedule');
      expect(updatedSchedule!.description).toBe('Updated description');
      expect(updatedSchedule!.cronExpression).toBe('0 0 * * *');
    });

    test('should delete schedule successfully', async () => {
      await scheduleManager.deleteSchedule(scheduleId);
      const schedule = await scheduleManager.getSchedule(scheduleId);
      expect(schedule).toBeNull();
    });
  });

  describe('Schedule Control', () => {
    let scheduleId: string;

    beforeEach(async () => {
      await scheduleManager.start();

      mockCronEngine.validateExpression.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: [],
        description: 'Every hour',
        frequency: {
          type: 'hourly',
          interval: 1,
          description: 'Every hour',
          estimatedExecutionsPerDay: 24,
        },
        nextExecutions: [new Date(Date.now() + 3600000)],
      });

      mockCronEngine.getNextExecutionTime.mockResolvedValue(new Date(Date.now() + 3600000));

      scheduleId = await scheduleManager.createSchedule({
        workflowId: 'workflow-123',
        name: 'Control Test Schedule',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        enabled: true,
        retryPolicy: DEFAULT_RETRY_POLICY,
        metadata: {
          tags: ['control-test'],
          priority: SchedulePriority.NORMAL,
        },
        createdBy: 'test-user',
      });
    });

    test('should pause schedule', async () => {
      await scheduleManager.pause(scheduleId);
      const schedule = await scheduleManager.getSchedule(scheduleId);
      expect(schedule!.enabled).toBe(false);
    });

    test('should resume schedule', async () => {
      await scheduleManager.pause(scheduleId);
      await scheduleManager.resume(scheduleId);
      const schedule = await scheduleManager.getSchedule(scheduleId);
      expect(schedule!.enabled).toBe(true);
    });

    test('should enable schedule', async () => {
      await scheduleManager.disableSchedule(scheduleId);
      await scheduleManager.enableSchedule(scheduleId);
      const schedule = await scheduleManager.getSchedule(scheduleId);
      expect(schedule!.enabled).toBe(true);
    });

    test('should disable schedule', async () => {
      await scheduleManager.disableSchedule(scheduleId);
      const schedule = await scheduleManager.getSchedule(scheduleId);
      expect(schedule!.enabled).toBe(false);
    });
  });

  describe('Schedule Execution', () => {
    let scheduleId: string;

    beforeEach(async () => {
      await scheduleManager.start();

      mockCronEngine.validateExpression.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: [],
        description: 'Every minute',
        frequency: {
          type: 'minutely',
          interval: 1,
          description: 'Every minute',
          estimatedExecutionsPerDay: 1440,
        },
        nextExecutions: [new Date(Date.now() + 60000)],
      });

      mockCronEngine.getNextExecutionTime.mockResolvedValue(new Date(Date.now() + 60000));

      scheduleId = await scheduleManager.createSchedule({
        workflowId: 'workflow-123',
        name: 'Execution Test Schedule',
        cronExpression: '* * * * *',
        timezone: 'UTC',
        enabled: true,
        retryPolicy: DEFAULT_RETRY_POLICY,
        metadata: {
          tags: ['execution-test'],
          priority: SchedulePriority.NORMAL,
        },
        createdBy: 'test-user',
      });
    });

    test('should trigger schedule manually', async () => {
      const executionId = await scheduleManager.triggerSchedule(scheduleId);

      expect(executionId).toBeDefined();
      expect(executionId).toMatch(/^exec_\d+_[a-z0-9]+$/);
    });

    test('should trigger schedule with custom context', async () => {
      const context = {
        environment: 'staging',
        userId: 'user-123',
        metadata: { source: 'manual-trigger' },
      };

      const executionId = await scheduleManager.triggerSchedule(scheduleId, context);
      expect(executionId).toBeDefined();
    });

    test('should reject trigger for non-existent schedule', async () => {
      await expect(scheduleManager.triggerSchedule('non-existent')).rejects.toThrow(
        'Schedule not found: non-existent'
      );
    });

    test('should cancel execution', async () => {
      const executionId = await scheduleManager.triggerSchedule(scheduleId);
      await expect(scheduleManager.cancelExecution(executionId)).resolves.not.toThrow();
    });

    test('should retry execution', async () => {
      const executionId = await scheduleManager.triggerSchedule(scheduleId);
      const retryExecutionId = await scheduleManager.retryExecution(executionId);

      expect(retryExecutionId).toBeDefined();
      expect(retryExecutionId).toMatch(/^retry_\d+_[a-z0-9]+$/);
      expect(retryExecutionId).not.toBe(executionId);
    });
  });

  describe('Schedule Status and Metrics', () => {
    let scheduleId: string;

    beforeEach(async () => {
      await scheduleManager.start();

      mockCronEngine.validateExpression.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: [],
        description: 'Every hour',
        frequency: {
          type: 'hourly',
          interval: 1,
          description: 'Every hour',
          estimatedExecutionsPerDay: 24,
        },
        nextExecutions: [new Date(Date.now() + 3600000)],
      });

      const nextExecution = new Date(Date.now() + 3600000);
      mockCronEngine.getNextExecutionTime.mockResolvedValue(nextExecution);

      scheduleId = await scheduleManager.createSchedule({
        workflowId: 'workflow-123',
        name: 'Status Test Schedule',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        enabled: true,
        retryPolicy: DEFAULT_RETRY_POLICY,
        metadata: {
          tags: ['status-test'],
          priority: SchedulePriority.NORMAL,
        },
        createdBy: 'test-user',
      });
    });

    test('should get schedule status', async () => {
      const status = await scheduleManager.getScheduleStatus(scheduleId);

      expect(status).toBeDefined();
      expect(status.id).toBe(scheduleId);
      expect(status.status).toBe(ScheduleState.ACTIVE);
      expect(status.enabled).toBe(true);
    });

    test('should get schedule metrics', async () => {
      const metrics = await scheduleManager.getScheduleMetrics(scheduleId);

      expect(metrics).toBeDefined();
      expect(metrics.totalExecutions).toBe(0);
      expect(metrics.successfulExecutions).toBe(0);
      expect(metrics.failedExecutions).toBe(0);
    });

    test('should get system metrics', async () => {
      const systemMetrics = await scheduleManager.getSystemMetrics();

      expect(systemMetrics).toBeDefined();
      expect(systemMetrics.totalSchedules).toBeGreaterThanOrEqual(0);
      expect(systemMetrics.activeSchedules).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Schedule Validation and Testing', () => {
    beforeEach(async () => {
      await scheduleManager.start();
    });

    test('should validate cron expression', async () => {
      mockCronEngine.validateExpression.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: [],
        description: 'Every hour',
        frequency: {
          type: 'hourly',
          interval: 1,
          description: 'Every hour',
          estimatedExecutionsPerDay: 24,
        },
        nextExecutions: [new Date(Date.now() + 3600000)],
      });

      const result = await scheduleManager.validateCronExpression('0 * * * *');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should get next execution times', async () => {
      const scheduleId = 'test-schedule';
      const nextTimes = [
        new Date(Date.now() + 3600000),
        new Date(Date.now() + 7200000),
        new Date(Date.now() + 10800000),
      ];

      mockCronEngine.getNextExecutionTimes.mockResolvedValue(nextTimes);

      const result = await scheduleManager.getNextExecutionTimes(scheduleId, 3);
      expect(result).toHaveLength(0); // Returns empty array for non-existent schedule
    });

    test('should test schedule configuration', async () => {
      mockCronEngine.validateExpression.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: [],
        description: 'Every hour',
        frequency: {
          type: 'hourly',
          interval: 1,
          description: 'Every hour',
          estimatedExecutionsPerDay: 24,
        },
        nextExecutions: [new Date(Date.now() + 3600000)],
      });

      mockCronEngine.getNextExecutionTimes.mockResolvedValue([
        new Date(Date.now() + 3600000),
        new Date(Date.now() + 7200000),
      ]);

      const scheduleConfig = {
        workflowId: 'workflow-123',
        name: 'Test Schedule',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        enabled: true,
        retryPolicy: DEFAULT_RETRY_POLICY,
        metadata: {
          tags: ['test'],
          priority: SchedulePriority.NORMAL,
        },
        createdBy: 'test-user',
      };

      const result = await scheduleManager.testSchedule(scheduleConfig);
      expect(result.valid).toBe(true);
      expect(result.nextExecutions).toHaveLength(2);
    });
  });
});
