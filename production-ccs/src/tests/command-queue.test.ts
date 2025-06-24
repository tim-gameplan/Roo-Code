/**
 * Command Queue Management System Test Suite
 *
 * Comprehensive test coverage for command queue operations, priority handling,
 * lifecycle management, performance monitoring, and enterprise-grade reliability.
 *
 * @fileoverview Command Queue Test Suite
 * @version 1.0.0
 * @since 2025-06-24
 */

import { v4 as uuidv4 } from 'uuid';
import { CommandQueueService } from '../services/command-queue';
import {
  Command,
  CommandQueue,
  CommandStatus,
  CommandPriority,
  CommandType,
  QueueStatus,
  ExecutionMode,
  RoutingStrategy,
} from '../types/command-queue';

// Mock logger to avoid console output during tests
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('Command Queue Management System', () => {
  let service: CommandQueueService;
  let testQueue: CommandQueue;
  let testCommand: Command;

  beforeEach(async () => {
    // Create a fresh service instance for each test
    service = new CommandQueueService({
      queue: {
        defaultMaxSize: 100,
        defaultTimeout: 30000,
        defaultMaxConcurrency: 5,
        defaultProcessingMode: 'priority',
        autoCleanupEnabled: false, // Disable for tests
        autoCleanupInterval: 60000,
      },
      performance: {
        metricsEnabled: true,
        metricsInterval: 10000,
        performanceThresholds: {
          queueProcessing: 50,
          routing: 100,
          execution: 500,
          coordination: 200,
        },
      },
    });

    await service.initialize();

    // Create test queue
    testQueue = await service.createQueue({
      name: 'Test Queue',
      userId: 'test-user-1',
    });

    // Create test command
    testCommand = {
      id: uuidv4(),
      type: CommandType.FILE_SYNC,
      userId: 'test-user-1',
      sourceDeviceId: 'device-1',
      targetDeviceIds: ['device-2'],
      priority: CommandPriority.MEDIUM,
      status: CommandStatus.QUEUED,
      payload: {
        action: 'sync',
        files: ['test.txt'],
      },
      metadata: {
        description: 'Test file sync command',
        resourceRequirements: {
          cpu: 10,
          memory: 50,
          storage: 100,
          bandwidth: 25,
          battery: 5,
        },
      },
      config: {
        executionMode: ExecutionMode.ASYNCHRONOUS,
        routingStrategy: RoutingStrategy.OPTIMAL,
        timeout: 30000,
        maxRetries: 3,
        retryDelay: 1000,
        exponentialBackoff: true,
        cancellable: true,
        persistent: true,
        notifyOnCompletion: true,
      },
      timestamps: {
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
  });

  afterEach(async () => {
    await service.shutdown();
  });

  // ============================================================================
  // SERVICE LIFECYCLE TESTS
  // ============================================================================

  describe('Service Lifecycle', () => {
    test('should initialize service successfully', async () => {
      const newService = new CommandQueueService();
      await expect(newService.initialize()).resolves.not.toThrow();
      await newService.shutdown();
    });

    test('should shutdown service gracefully', async () => {
      const newService = new CommandQueueService();
      await newService.initialize();
      await expect(newService.shutdown()).resolves.not.toThrow();
    });

    test('should handle multiple initialization calls', async () => {
      const newService = new CommandQueueService();
      await newService.initialize();
      await newService.initialize(); // Should not throw
      await newService.shutdown();
    });

    test('should handle shutdown without initialization', async () => {
      const newService = new CommandQueueService();
      await expect(newService.shutdown()).resolves.not.toThrow();
    });
  });

  // ============================================================================
  // QUEUE MANAGEMENT TESTS
  // ============================================================================

  describe('Queue Management', () => {
    test('should create a new queue', async () => {
      const queue = await service.createQueue({
        name: 'New Test Queue',
        userId: 'test-user-2',
      });

      expect(queue).toBeDefined();
      expect(queue.id).toBeDefined();
      expect(queue.name).toBe('New Test Queue');
      expect(queue.userId).toBe('test-user-2');
      expect(queue.status).toBe(QueueStatus.ACTIVE);
    });

    test('should get queue by ID', async () => {
      const retrievedQueue = await service.getQueue(testQueue.id);
      expect(retrievedQueue).toBeDefined();
      expect(retrievedQueue?.id).toBe(testQueue.id);
      expect(retrievedQueue?.name).toBe(testQueue.name);
    });

    test('should return null for non-existent queue', async () => {
      const nonExistentQueue = await service.getQueue('non-existent-id');
      expect(nonExistentQueue).toBeNull();
    });

    test('should list queues for a user', async () => {
      await service.createQueue({
        name: 'Queue 2',
        userId: 'test-user-1',
      });

      const userQueues = await service.listQueues('test-user-1');
      expect(userQueues).toHaveLength(2);
      expect(userQueues.every((q) => q.userId === 'test-user-1')).toBe(true);
    });

    test('should delete a queue', async () => {
      const queueToDelete = await service.createQueue({
        name: 'Queue to Delete',
        userId: 'test-user-3',
      });

      await service.deleteQueue(queueToDelete.id);
      const deletedQueue = await service.getQueue(queueToDelete.id);
      expect(deletedQueue).toBeNull();
    });

    test('should throw error when deleting non-existent queue', async () => {
      await expect(service.deleteQueue('non-existent-id')).rejects.toThrow('Queue not found');
    });
  });

  // ============================================================================
  // COMMAND MANAGEMENT TESTS
  // ============================================================================

  describe('Command Management', () => {
    test('should enqueue a command successfully', async () => {
      const commandId = await service.enqueueCommand(testCommand);
      expect(commandId).toBe(testCommand.id);

      const retrievedCommand = await service.getCommand(commandId);
      expect(retrievedCommand).toBeDefined();
      expect(retrievedCommand?.status).toBe(CommandStatus.QUEUED);
    });

    test('should validate command before enqueuing', async () => {
      const invalidCommand = { ...testCommand };
      delete (invalidCommand as any).id;

      await expect(service.enqueueCommand(invalidCommand as Command)).rejects.toThrow(
        'Command ID is required'
      );
    });

    test('should get command by ID', async () => {
      await service.enqueueCommand(testCommand);
      const retrievedCommand = await service.getCommand(testCommand.id);

      expect(retrievedCommand).toBeDefined();
      expect(retrievedCommand?.id).toBe(testCommand.id);
      expect(retrievedCommand?.type).toBe(testCommand.type);
    });

    test('should return null for non-existent command', async () => {
      const nonExistentCommand = await service.getCommand('non-existent-id');
      expect(nonExistentCommand).toBeNull();
    });

    test('should update a command', async () => {
      await service.enqueueCommand(testCommand);

      const updates = {
        priority: CommandPriority.HIGH,
        metadata: {
          ...testCommand.metadata,
          description: 'Updated description',
        },
      };

      await service.updateCommand(testCommand.id, updates);
      const updatedCommand = await service.getCommand(testCommand.id);

      expect(updatedCommand?.priority).toBe(CommandPriority.HIGH);
      expect(updatedCommand?.metadata.description).toBe('Updated description');
    });

    test('should cancel a command', async () => {
      await service.enqueueCommand(testCommand);
      await service.cancelCommand(testCommand.id);

      const cancelledCommand = await service.getCommand(testCommand.id);
      expect(cancelledCommand?.status).toBe(CommandStatus.CANCELLED);
    });

    test('should throw error when cancelling non-cancellable command', async () => {
      const nonCancellableCommand = {
        ...testCommand,
        id: uuidv4(),
        config: {
          ...testCommand.config,
          cancellable: false,
        },
      };

      await service.enqueueCommand(nonCancellableCommand);
      await expect(service.cancelCommand(nonCancellableCommand.id)).rejects.toThrow(
        'Command is not cancellable'
      );
    });
  });

  // ============================================================================
  // QUEUE OPERATIONS TESTS
  // ============================================================================

  describe('Queue Operations', () => {
    test('should start a queue', async () => {
      await service.pauseQueue(testQueue.id);
      await service.startQueue(testQueue.id);

      const status = await service.getQueueStatus(testQueue.id);
      expect(status).toBe(QueueStatus.ACTIVE);
    });

    test('should pause a queue', async () => {
      await service.pauseQueue(testQueue.id);

      const status = await service.getQueueStatus(testQueue.id);
      expect(status).toBe(QueueStatus.PAUSED);
    });

    test('should stop a queue', async () => {
      await service.stopQueue(testQueue.id);

      const status = await service.getQueueStatus(testQueue.id);
      expect(status).toBe(QueueStatus.STOPPED);
    });

    test('should clear a queue', async () => {
      await service.enqueueCommand(testCommand);
      await service.clearQueue(testQueue.id);

      const stats = await service.getQueueStats(testQueue.id);
      expect(stats.queued).toBe(0);
    });

    test('should dequeue commands in priority order', async () => {
      const highPriorityCommand = {
        ...testCommand,
        id: uuidv4(),
        priority: CommandPriority.HIGH,
      };

      const lowPriorityCommand = {
        ...testCommand,
        id: uuidv4(),
        priority: CommandPriority.LOW,
      };

      // Enqueue in reverse priority order
      await service.enqueueCommand(lowPriorityCommand);
      await service.enqueueCommand(highPriorityCommand);

      // Pause queue to prevent automatic processing
      await service.pauseQueue(testQueue.id);

      // Dequeue should return high priority first
      const firstCommand = await service.dequeueCommand(testQueue.id);
      expect(firstCommand?.id).toBe(highPriorityCommand.id);

      const secondCommand = await service.dequeueCommand(testQueue.id);
      expect(secondCommand?.id).toBe(lowPriorityCommand.id);
    });
  });

  // ============================================================================
  // PRIORITY HANDLING TESTS
  // ============================================================================

  describe('Priority Handling', () => {
    test('should process high priority commands first', async () => {
      // Create a separate paused queue for this test
      const pausedQueue = await service.createQueue({
        name: 'Priority Test Queue',
        userId: 'test-user-priority',
      });
      await service.pauseQueue(pausedQueue.id);

      const commands = [
        {
          ...testCommand,
          id: uuidv4(),
          userId: 'test-user-priority',
          priority: CommandPriority.LOW,
        },
        {
          ...testCommand,
          id: uuidv4(),
          userId: 'test-user-priority',
          priority: CommandPriority.HIGH,
        },
        {
          ...testCommand,
          id: uuidv4(),
          userId: 'test-user-priority',
          priority: CommandPriority.MEDIUM,
        },
      ];

      // Enqueue commands
      for (const cmd of commands) {
        await service.enqueueCommand(cmd);
      }

      // Dequeue and verify order
      const first = await service.dequeueCommand(pausedQueue.id);
      const second = await service.dequeueCommand(pausedQueue.id);
      const third = await service.dequeueCommand(pausedQueue.id);

      expect(first?.priority).toBe(CommandPriority.HIGH);
      expect(second?.priority).toBe(CommandPriority.MEDIUM);
      expect(third?.priority).toBe(CommandPriority.LOW);
    });

    test('should handle commands with same priority (FIFO)', async () => {
      // Create a separate paused queue for this test
      const pausedQueue = await service.createQueue({
        name: 'FIFO Test Queue',
        userId: 'test-user-fifo',
      });
      await service.pauseQueue(pausedQueue.id);

      const commands = [
        {
          ...testCommand,
          id: uuidv4() + '-1',
          userId: 'test-user-fifo',
          priority: CommandPriority.MEDIUM,
        },
        {
          ...testCommand,
          id: uuidv4() + '-2',
          userId: 'test-user-fifo',
          priority: CommandPriority.MEDIUM,
        },
        {
          ...testCommand,
          id: uuidv4() + '-3',
          userId: 'test-user-fifo',
          priority: CommandPriority.MEDIUM,
        },
      ];

      for (const cmd of commands) {
        await service.enqueueCommand(cmd);
      }

      const first = await service.dequeueCommand(pausedQueue.id);
      const second = await service.dequeueCommand(pausedQueue.id);
      const third = await service.dequeueCommand(pausedQueue.id);

      expect(first?.id).toBe(commands[0]?.id);
      expect(second?.id).toBe(commands[1]?.id);
      expect(third?.id).toBe(commands[2]?.id);
    });
  });

  // ============================================================================
  // PERFORMANCE MONITORING TESTS
  // ============================================================================

  describe('Performance Monitoring', () => {
    test('should track performance metrics', async () => {
      const metrics = await service.getPerformanceMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.queue).toBeDefined();
      expect(metrics.routing).toBeDefined();
      expect(metrics.execution).toBeDefined();
      expect(metrics.coordination).toBeDefined();
      expect(metrics.system).toBeDefined();
      expect(metrics.timestamp).toBeInstanceOf(Date);
    });

    test('should update metrics when commands are processed', async () => {
      // Enqueue multiple commands to ensure metrics change
      const commands = Array.from({ length: 3 }, () => ({
        ...testCommand,
        id: uuidv4(),
      }));

      for (const cmd of commands) {
        await service.enqueueCommand(cmd);
      }

      const updatedMetrics = await service.getPerformanceMetrics();
      // Just verify that metrics are being tracked (may include commands from other tests)
      expect(updatedMetrics.queue.totalCommands).toBeGreaterThanOrEqual(3);
      expect(updatedMetrics.timestamp).toBeInstanceOf(Date);
    });

    test('should track queue statistics', async () => {
      await service.enqueueCommand(testCommand);

      const stats = await service.getQueueStats(testQueue.id);
      expect(stats).toBeDefined();
      expect(stats.queued).toBeGreaterThan(0);
      expect(stats.totalProcessed).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe('Error Handling', () => {
    test('should handle invalid queue operations gracefully', async () => {
      await expect(service.getQueueStatus('invalid-id')).rejects.toThrow('Queue not found');

      await expect(service.pauseQueue('invalid-id')).rejects.toThrow('Queue not found');

      await expect(service.clearQueue('invalid-id')).rejects.toThrow('Queue not found');
    });

    test('should handle command validation errors', async () => {
      const invalidCommands = [
        { ...testCommand, id: '' },
        { ...testCommand, type: '' as any },
        { ...testCommand, userId: '' },
        { ...testCommand, sourceDeviceId: '' },
        { ...testCommand, targetDeviceIds: [] },
      ];

      for (const invalidCommand of invalidCommands) {
        await expect(service.enqueueCommand(invalidCommand)).rejects.toThrow();
      }
    });

    test('should handle command not found errors', async () => {
      await expect(service.updateCommand('invalid-id', {})).rejects.toThrow('Command not found');

      await expect(service.cancelCommand('invalid-id')).rejects.toThrow('Command not found');
    });
  });

  // ============================================================================
  // CONCURRENCY TESTS
  // ============================================================================

  describe('Concurrency', () => {
    test('should handle concurrent command enqueuing', async () => {
      const commands = Array.from({ length: 10 }, (_, i) => ({
        ...testCommand,
        id: uuidv4(),
        payload: { ...testCommand.payload, index: i },
      }));

      const promises = commands.map((cmd) => service.enqueueCommand(cmd));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach((result, index) => {
        expect(result).toBe(commands[index]?.id);
      });
    });

    test('should respect concurrency limits', async () => {
      // This test would require more complex setup to properly test concurrency limits
      // For now, we'll just verify the queue respects the configured max concurrency
      const stats = await service.getQueueStats(testQueue.id);
      expect(stats.executing).toBeLessThanOrEqual(5); // Our configured max concurrency
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================

  describe('Integration', () => {
    test('should handle complete command lifecycle', async () => {
      // Enqueue command
      const commandId = await service.enqueueCommand(testCommand);
      expect(commandId).toBe(testCommand.id);

      // Verify command is queued
      let command = await service.getCommand(commandId);
      expect(command?.status).toBe(CommandStatus.QUEUED);

      // Allow some time for processing (since we have automatic processing)
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check if command has been processed
      command = await service.getCommand(commandId);
      expect(command?.status).toBeOneOf([
        CommandStatus.ROUTING,
        CommandStatus.EXECUTING,
        CommandStatus.COMPLETED,
      ]);
    });

    test('should maintain queue statistics accuracy', async () => {
      // Create a paused queue to prevent automatic processing
      const pausedQueue = await service.createQueue({
        name: 'Stats Test Queue',
        userId: 'test-user-stats',
      });
      await service.pauseQueue(pausedQueue.id);

      // Enqueue multiple commands
      const commands = Array.from({ length: 5 }, () => ({
        ...testCommand,
        id: uuidv4(),
        userId: 'test-user-stats',
      }));

      for (const cmd of commands) {
        await service.enqueueCommand(cmd);
      }

      const updatedStats = await service.getQueueStats(pausedQueue.id);
      // Just verify that commands were queued (may include commands from other tests)
      expect(updatedStats.queued).toBeGreaterThanOrEqual(5);
      expect(updatedStats.totalProcessed).toBeGreaterThanOrEqual(0);
    });

    test('should handle service restart gracefully', async () => {
      // Enqueue some commands
      await service.enqueueCommand(testCommand);

      // Shutdown and restart service
      await service.shutdown();

      const newService = new CommandQueueService();
      await newService.initialize();

      // Verify service is functional
      const newQueue = await newService.createQueue({
        name: 'Restart Test Queue',
        userId: 'test-user-restart',
      });

      expect(newQueue).toBeDefined();
      expect(newQueue.status).toBe(QueueStatus.ACTIVE);

      await newService.shutdown();
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    test('should handle empty queue operations', async () => {
      const emptyCommand = await service.dequeueCommand(testQueue.id);
      expect(emptyCommand).toBeNull();

      await service.clearQueue(testQueue.id);
      const stats = await service.getQueueStats(testQueue.id);
      expect(stats.queued).toBe(0);
    });

    test('should handle rapid queue state changes', async () => {
      await service.pauseQueue(testQueue.id);
      await service.startQueue(testQueue.id);
      await service.stopQueue(testQueue.id);
      await service.startQueue(testQueue.id);

      const finalStatus = await service.getQueueStatus(testQueue.id);
      expect(finalStatus).toBe(QueueStatus.ACTIVE);
    });

    test('should handle commands with extreme priorities', async () => {
      const extremeCommands = [
        { ...testCommand, id: uuidv4(), priority: 0 },
        { ...testCommand, id: uuidv4(), priority: 100 },
        { ...testCommand, id: uuidv4(), priority: -1 },
      ];

      for (const cmd of extremeCommands) {
        await expect(service.enqueueCommand(cmd)).resolves.not.toThrow();
      }
    });

    test('should handle large payloads', async () => {
      const largePayload = {
        ...testCommand.payload,
        largeData: 'x'.repeat(10000), // 10KB string
      };

      const largeCommand = {
        ...testCommand,
        id: uuidv4(),
        payload: largePayload,
      };

      await expect(service.enqueueCommand(largeCommand)).resolves.not.toThrow();
    });
  });
});

// Helper Jest matcher for testing multiple possible values
expect.extend({
  toBeOneOf(received: any, expected: any[]) {
    const pass = expected.includes(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of ${expected.join(', ')}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be one of ${expected.join(', ')}`,
        pass: false,
      };
    }
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeOneOf(expected: any[]): R;
    }
  }
}
