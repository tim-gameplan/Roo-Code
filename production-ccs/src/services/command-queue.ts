/**
 * Command Queue Management Service
 *
 * Core service for distributed command processing, priority-based queue management,
 * and cross-device command coordination. Provides enterprise-grade queue operations
 * with comprehensive lifecycle management and performance monitoring.
 *
 * @fileoverview Command Queue Service Implementation
 * @version 1.0.0
 * @since 2025-06-24
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  Command,
  CommandQueue,
  CommandStatus,
  CommandPriority,
  CommandType,
  CommandConfig,
  QueueConfig,
  QueueStatus,
  QueueStats,
  ExecutionMode,
  RoutingStrategy,
  PerformanceMetrics,
  ICommandQueueService,
  CommandQueueSystemConfig,
} from '../types/command-queue';
import { logger } from '../utils/logger';

/**
 * Default command configuration
 */
const DEFAULT_COMMAND_CONFIG: CommandConfig = {
  executionMode: ExecutionMode.ASYNCHRONOUS,
  routingStrategy: RoutingStrategy.OPTIMAL,
  timeout: 30000, // 30 seconds
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  exponentialBackoff: true,
  cancellable: true,
  persistent: true,
  notifyOnCompletion: true,
};

/**
 * Default queue configuration
 */
const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxSize: 10000,
  processingMode: 'priority',
  persistent: true,
  timeout: 300000, // 5 minutes
  maxConcurrency: 10,
  priority: CommandPriority.MEDIUM,
  autoCleanup: {
    enabled: true,
    maxAge: 86400000, // 24 hours
    maxCompletedCommands: 1000,
  },
};

/**
 * Default system configuration
 */
const DEFAULT_SYSTEM_CONFIG: CommandQueueSystemConfig = {
  queue: {
    defaultMaxSize: 10000,
    defaultTimeout: 300000,
    defaultMaxConcurrency: 10,
    defaultProcessingMode: 'priority',
    autoCleanupEnabled: true,
    autoCleanupInterval: 3600000, // 1 hour
  },
  routing: {
    defaultStrategy: RoutingStrategy.OPTIMAL,
    maxRoutingTime: 5000,
    loadBalanceThreshold: 0.8,
    failoverEnabled: true,
    routingCacheTimeout: 60000,
  },
  execution: {
    defaultTimeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
    exponentialBackoffEnabled: true,
    maxConcurrentExecutions: 100,
    resourceMonitoringEnabled: true,
  },
  coordination: {
    defaultStrategy: 'parallel' as any,
    syncTimeout: 10000,
    conflictResolutionEnabled: true,
    automaticConflictResolution: true,
  },
  performance: {
    metricsEnabled: true,
    metricsInterval: 60000,
    performanceThresholds: {
      queueProcessing: 50,
      routing: 100,
      execution: 500,
      coordination: 200,
    },
  },
  integration: {
    deviceRelayEnabled: true,
    websocketEnabled: true,
    databaseEnabled: true,
    authenticationEnabled: true,
  },
};

/**
 * Priority queue implementation for commands
 */
class PriorityQueue<T> {
  private items: Array<{ item: T; priority: number }> = [];

  /**
   * Add item to queue with priority
   */
  enqueue(item: T, priority: number): void {
    const queueElement = { item, priority };
    let added = false;

    for (let i = 0; i < this.items.length; i++) {
      const currentItem = this.items[i];
      if (currentItem && queueElement.priority > currentItem.priority) {
        this.items.splice(i, 0, queueElement);
        added = true;
        break;
      }
    }

    if (!added) {
      this.items.push(queueElement);
    }
  }

  /**
   * Remove and return highest priority item
   */
  dequeue(): T | null {
    if (this.isEmpty()) {
      return null;
    }
    const item = this.items.shift();
    return item ? item.item : null;
  }

  /**
   * Peek at highest priority item without removing
   */
  peek(): T | null {
    if (this.isEmpty()) {
      return null;
    }
    const item = this.items[0];
    return item ? item.item : null;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.items.length === 0;
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.items.length;
  }

  /**
   * Clear all items
   */
  clear(): void {
    this.items = [];
  }

  /**
   * Get all items (for inspection)
   */
  getItems(): T[] {
    return this.items.map((item) => item.item);
  }

  /**
   * Remove specific item
   */
  remove(predicate: (item: T) => boolean): boolean {
    const index = this.items.findIndex((queueItem) => predicate(queueItem.item));
    if (index !== -1) {
      this.items.splice(index, 1);
      return true;
    }
    return false;
  }
}

/**
 * Command Queue Service Implementation
 *
 * Provides comprehensive command queue management with priority-based processing,
 * lifecycle tracking, performance monitoring, and enterprise-grade reliability.
 */
export class CommandQueueService extends EventEmitter implements ICommandQueueService {
  private queues: Map<string, CommandQueue> = new Map();
  private commands: Map<string, Command> = new Map();
  private queueData: Map<string, PriorityQueue<Command>> = new Map();
  private executingCommands: Map<string, Command> = new Map();
  private config: CommandQueueSystemConfig;
  private metrics: PerformanceMetrics;
  private cleanupInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;
  private isInitialized = false;

  constructor(config?: Partial<CommandQueueSystemConfig>) {
    super();
    this.config = { ...DEFAULT_SYSTEM_CONFIG, ...config };
    this.metrics = this.initializeMetrics();
    this.setupEventHandlers();
  }

  /**
   * Initialize the command queue service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      logger.info('Initializing Command Queue Service...');

      // Start cleanup interval
      if (this.config.queue.autoCleanupEnabled) {
        this.startCleanupInterval();
      }

      // Start metrics collection
      if (this.config.performance.metricsEnabled) {
        this.startMetricsCollection();
      }

      this.isInitialized = true;
      logger.info('Command Queue Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Command Queue Service:', error);
      throw error;
    }
  }

  /**
   * Shutdown the command queue service
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      logger.info('Shutting down Command Queue Service...');

      // Stop intervals
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
      }

      // Cancel all executing commands
      for (const command of this.executingCommands.values()) {
        await this.cancelCommand(command.id);
      }

      // Clear all data
      this.queues.clear();
      this.commands.clear();
      this.queueData.clear();
      this.executingCommands.clear();

      this.isInitialized = false;
      logger.info('Command Queue Service shut down successfully');
    } catch (error) {
      logger.error('Error during Command Queue Service shutdown:', error);
      throw error;
    }
  }

  // ============================================================================
  // QUEUE MANAGEMENT
  // ============================================================================

  /**
   * Create a new command queue
   */
  async createQueue(
    config: Partial<QueueConfig> & { name?: string; userId?: string }
  ): Promise<CommandQueue> {
    const queueId = uuidv4();
    const queueConfig = { ...DEFAULT_QUEUE_CONFIG, ...config };

    const queue: CommandQueue = {
      id: queueId,
      name: config.name || `Queue-${queueId.substring(0, 8)}`,
      userId: config.userId || 'system',
      config: queueConfig,
      stats: this.initializeQueueStats(),
      status: QueueStatus.ACTIVE,
      timestamps: {
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    this.queues.set(queueId, queue);
    this.queueData.set(queueId, new PriorityQueue<Command>());

    this.emit('queue:created', queue);
    logger.info(`Created queue: ${queue.name} (${queueId})`);

    return queue;
  }

  /**
   * Delete a command queue
   */
  async deleteQueue(queueId: string): Promise<void> {
    const queue = this.queues.get(queueId);
    if (!queue) {
      throw new Error(`Queue not found: ${queueId}`);
    }

    // Stop the queue first
    await this.stopQueue(queueId);

    // Remove all data
    this.queues.delete(queueId);
    this.queueData.delete(queueId);

    logger.info(`Deleted queue: ${queue.name} (${queueId})`);
  }

  /**
   * Get a command queue by ID
   */
  async getQueue(queueId: string): Promise<CommandQueue | null> {
    return this.queues.get(queueId) || null;
  }

  /**
   * List all queues for a user
   */
  async listQueues(userId: string): Promise<CommandQueue[]> {
    return Array.from(this.queues.values()).filter((queue) => queue.userId === userId);
  }

  // ============================================================================
  // COMMAND MANAGEMENT
  // ============================================================================

  /**
   * Enqueue a command for processing
   */
  async enqueueCommand(command: Command): Promise<string> {
    // Validate command
    this.validateCommand(command);

    // Set default configuration if not provided
    command.config = { ...DEFAULT_COMMAND_CONFIG, ...command.config };

    // Update timestamps
    command.timestamps.queuedAt = new Date();
    command.timestamps.updatedAt = new Date();
    command.status = CommandStatus.QUEUED;

    // Store command
    this.commands.set(command.id, command);

    // Update metrics
    this.metrics.queue.totalCommands++;
    this.metrics.queue.queuedCommands++;

    // Find or create appropriate queue
    const queueId = await this.findOrCreateQueue(command);
    const queueData = this.queueData.get(queueId);

    if (!queueData) {
      throw new Error(`Queue data not found: ${queueId}`);
    }

    // Add to priority queue
    queueData.enqueue(command, command.priority);

    // Update queue stats
    await this.updateQueueStats(queueId);

    this.emit('command:queued', command);
    logger.debug(`Enqueued command: ${command.id} (${command.type})`);

    // Start processing if queue is active (but not if it's paused)
    const queue = this.queues.get(queueId);
    if (queue && queue.status === QueueStatus.ACTIVE) {
      setImmediate(() => this.processQueue(queueId));
    }

    return command.id;
  }

  /**
   * Dequeue the next command from a queue
   */
  async dequeueCommand(queueId: string): Promise<Command | null> {
    const queueData = this.queueData.get(queueId);
    if (!queueData) {
      throw new Error(`Queue not found: ${queueId}`);
    }

    const command = queueData.dequeue();
    if (command) {
      command.status = CommandStatus.ROUTING;
      command.timestamps.updatedAt = new Date();
      this.commands.set(command.id, command);
      await this.updateQueueStats(queueId);
    }

    return command;
  }

  /**
   * Get a command by ID
   */
  async getCommand(commandId: string): Promise<Command | null> {
    return this.commands.get(commandId) || null;
  }

  /**
   * Update a command
   */
  async updateCommand(commandId: string, updates: Partial<Command>): Promise<void> {
    const command = this.commands.get(commandId);
    if (!command) {
      throw new Error(`Command not found: ${commandId}`);
    }

    // Apply updates
    Object.assign(command, updates);
    command.timestamps.updatedAt = new Date();

    this.commands.set(commandId, command);
    logger.debug(`Updated command: ${commandId}`);
  }

  /**
   * Cancel a command
   */
  async cancelCommand(commandId: string): Promise<void> {
    const command = this.commands.get(commandId);
    if (!command) {
      throw new Error(`Command not found: ${commandId}`);
    }

    if (!command.config.cancellable) {
      throw new Error(`Command is not cancellable: ${commandId}`);
    }

    // Update command status
    command.status = CommandStatus.CANCELLED;
    command.timestamps.updatedAt = new Date();

    // Remove from executing commands if present
    this.executingCommands.delete(commandId);

    // Remove from queue if still queued
    for (const [queueId, queueData] of this.queueData.entries()) {
      if (queueData.remove((cmd) => cmd.id === commandId)) {
        await this.updateQueueStats(queueId);
        break;
      }
    }

    this.emit('command:cancelled', command);
    logger.info(`Cancelled command: ${commandId}`);
  }

  // ============================================================================
  // QUEUE OPERATIONS
  // ============================================================================

  /**
   * Start a queue
   */
  async startQueue(queueId: string): Promise<void> {
    const queue = this.queues.get(queueId);
    if (!queue) {
      throw new Error(`Queue not found: ${queueId}`);
    }

    queue.status = QueueStatus.ACTIVE;
    queue.timestamps.updatedAt = new Date();

    this.emit('queue:started', queue);
    logger.info(`Started queue: ${queue.name} (${queueId})`);

    // Start processing
    setImmediate(() => this.processQueue(queueId));
  }

  /**
   * Pause a queue
   */
  async pauseQueue(queueId: string): Promise<void> {
    const queue = this.queues.get(queueId);
    if (!queue) {
      throw new Error(`Queue not found: ${queueId}`);
    }

    queue.status = QueueStatus.PAUSED;
    queue.timestamps.updatedAt = new Date();

    this.emit('queue:paused', queue);
    logger.info(`Paused queue: ${queue.name} (${queueId})`);
  }

  /**
   * Stop a queue
   */
  async stopQueue(queueId: string): Promise<void> {
    const queue = this.queues.get(queueId);
    if (!queue) {
      throw new Error(`Queue not found: ${queueId}`);
    }

    queue.status = QueueStatus.STOPPED;
    queue.timestamps.updatedAt = new Date();

    this.emit('queue:stopped', queue);
    logger.info(`Stopped queue: ${queue.name} (${queueId})`);
  }

  /**
   * Clear all commands from a queue
   */
  async clearQueue(queueId: string): Promise<void> {
    const queueData = this.queueData.get(queueId);
    if (!queueData) {
      throw new Error(`Queue not found: ${queueId}`);
    }

    queueData.clear();
    await this.updateQueueStats(queueId);

    logger.info(`Cleared queue: ${queueId}`);
  }

  // ============================================================================
  // STATUS AND MONITORING
  // ============================================================================

  /**
   * Get queue status
   */
  async getQueueStatus(queueId: string): Promise<QueueStatus> {
    const queue = this.queues.get(queueId);
    if (!queue) {
      throw new Error(`Queue not found: ${queueId}`);
    }
    return queue.status;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueId: string): Promise<QueueStats> {
    const queue = this.queues.get(queueId);
    if (!queue) {
      throw new Error(`Queue not found: ${queueId}`);
    }
    return queue.stats;
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    return this.metrics;
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Initialize performance metrics
   */
  private initializeMetrics(): PerformanceMetrics {
    return {
      queue: {
        totalCommands: 0,
        queuedCommands: 0,
        executingCommands: 0,
        completedCommands: 0,
        failedCommands: 0,
        averageQueueTime: 0,
        throughput: 0,
      },
      routing: {
        averageRoutingTime: 0,
        routingSuccessRate: 0,
        loadBalanceEfficiency: 0,
      },
      execution: {
        averageExecutionTime: 0,
        executionSuccessRate: 0,
        resourceUtilization: {
          cpu: 0,
          memory: 0,
          storage: 0,
          bandwidth: 0,
          battery: 0,
        },
      },
      coordination: {
        averageCoordinationTime: 0,
        syncSuccessRate: 0,
        conflictRate: 0,
        resolutionSuccessRate: 0,
      },
      system: {
        memoryUsage: 0,
        cpuUsage: 0,
        networkLatency: 0,
        errorRate: 0,
      },
      timestamp: new Date(),
    };
  }

  /**
   * Initialize queue statistics
   */
  private initializeQueueStats(): QueueStats {
    return {
      totalProcessed: 0,
      queued: 0,
      executing: 0,
      completed: 0,
      failed: 0,
      averageProcessingTime: 0,
      throughput: 0,
      successRate: 0,
    };
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.on('command:completed', () => {
      this.metrics.queue.completedCommands++;
      this.updateMetrics();
    });

    this.on('command:failed', () => {
      this.metrics.queue.failedCommands++;
      this.updateMetrics();
    });

    this.on('command:executing', (command) => {
      this.metrics.queue.executingCommands++;
      this.executingCommands.set(command.id, command);
      this.updateMetrics();
    });
  }

  /**
   * Validate command before processing
   */
  private validateCommand(command: Command): void {
    if (!command.id) {
      throw new Error('Command ID is required');
    }
    if (!command.type) {
      throw new Error('Command type is required');
    }
    if (!command.userId) {
      throw new Error('User ID is required');
    }
    if (!command.sourceDeviceId) {
      throw new Error('Source device ID is required');
    }
    if (!command.targetDeviceIds || command.targetDeviceIds.length === 0) {
      throw new Error('Target device IDs are required');
    }
  }

  /**
   * Find or create appropriate queue for command
   */
  private async findOrCreateQueue(command: Command): Promise<string> {
    // Look for existing queue for this user
    const userQueues = await this.listQueues(command.userId);

    if (userQueues.length > 0 && userQueues[0]) {
      // Use the first queue (active or paused)
      return userQueues[0].id;
    }

    // Create new queue for user
    const queue = await this.createQueue({
      name: `User-${command.userId}-Queue`,
      userId: command.userId,
      priority: command.priority,
    } as any);

    return queue.id;
  }

  /**
   * Update queue statistics
   */
  private async updateQueueStats(queueId: string): Promise<void> {
    const queue = this.queues.get(queueId);
    const queueData = this.queueData.get(queueId);

    if (!queue || !queueData) {
      return;
    }

    // Update basic counts
    queue.stats.queued = queueData.size();
    queue.stats.executing = Array.from(this.executingCommands.values()).filter(
      (cmd) => cmd.userId === queue.userId
    ).length;

    // Update timestamp
    queue.timestamps.updatedAt = new Date();
    queue.timestamps.lastProcessedAt = new Date();
  }

  /**
   * Process commands in a queue
   */
  private async processQueue(queueId: string): Promise<void> {
    const queue = this.queues.get(queueId);
    const queueData = this.queueData.get(queueId);

    if (!queue || !queueData || queue.status !== QueueStatus.ACTIVE) {
      return;
    }

    // Check concurrency limits
    const executingCount = Array.from(this.executingCommands.values()).filter(
      (cmd) => cmd.userId === queue.userId
    ).length;

    if (executingCount >= queue.config.maxConcurrency) {
      return;
    }

    // Get next command
    const command = queueData.dequeue();
    if (!command) {
      return;
    }

    try {
      // Update command status
      command.status = CommandStatus.ROUTING;
      command.timestamps.routingStartedAt = new Date();
      command.timestamps.updatedAt = new Date();

      this.emit('command:routing', command);

      // Simulate routing (in real implementation, this would call routing service)
      await this.simulateRouting(command);

      // Update command status to executing
      command.status = CommandStatus.EXECUTING;
      command.timestamps.executionStartedAt = new Date();
      command.timestamps.updatedAt = new Date();

      this.emit('command:executing', command);

      // Simulate execution (in real implementation, this would call execution service)
      await this.simulateExecution(command);

      // Update command status to completed
      command.status = CommandStatus.COMPLETED;
      command.timestamps.completedAt = new Date();
      command.timestamps.updatedAt = new Date();

      this.executingCommands.delete(command.id);
      this.emit('command:completed', command, {
        commandId: command.id,
        status: CommandStatus.COMPLETED,
        data: { success: true },
        metrics: {
          duration: Date.now() - (command.timestamps.executionStartedAt?.getTime() || 0),
          resourceUsage: command.metadata.resourceRequirements || {},
          performance: {
            throughput: 1,
            latency: 100,
            errorRate: 0,
          },
          custom: {},
        },
        executedBy: command.targetDeviceIds[0] || 'unknown',
        timestamps: {
          startedAt: command.timestamps.executionStartedAt!,
          completedAt: command.timestamps.completedAt!,
          duration: Date.now() - (command.timestamps.executionStartedAt?.getTime() || 0),
        },
      });
    } catch (error) {
      // Handle command failure
      command.status = CommandStatus.FAILED;
      command.timestamps.updatedAt = new Date();

      this.executingCommands.delete(command.id);
      this.emit('command:failed', command, {
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: { error },
        timestamp: new Date(),
      });
    }

    // Update queue stats
    await this.updateQueueStats(queueId);

    // Continue processing if there are more commands
    if (!queueData.isEmpty() && queue.status === QueueStatus.ACTIVE) {
      setImmediate(() => this.processQueue(queueId));
    }
  }

  /**
   * Simulate command routing (placeholder)
   */
  private async simulateRouting(_command: Command): Promise<void> {
    // Simulate routing delay
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  /**
   * Simulate command execution (placeholder)
   */
  private async simulateExecution(command: Command): Promise<void> {
    // Simulate execution delay based on command type
    const delay = command.type === CommandType.FILE_SYNC ? 100 : 50;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.config.queue.autoCleanupInterval);
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.updateMetrics();
      this.emit('performance:metrics', this.metrics);
    }, this.config.performance.metricsInterval);
  }

  /**
   * Perform cleanup of old commands and queues
   */
  private performCleanup(): void {
    const now = Date.now();
    const maxAge = this.config.queue.autoCleanupInterval;

    // Clean up old completed commands
    for (const [commandId, command] of this.commands.entries()) {
      if (command.status === CommandStatus.COMPLETED || command.status === CommandStatus.FAILED) {
        const age = now - command.timestamps.updatedAt.getTime();
        if (age > maxAge) {
          this.commands.delete(commandId);
        }
      }
    }

    logger.debug('Performed cleanup of old commands');
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(): void {
    // Update queue metrics
    this.metrics.queue.totalCommands = this.commands.size;
    this.metrics.queue.queuedCommands = Array.from(this.commands.values()).filter(
      (cmd) => cmd.status === CommandStatus.QUEUED
    ).length;
    this.metrics.queue.executingCommands = this.executingCommands.size;

    // Update timestamp
    this.metrics.timestamp = new Date();
  }
}

/**
 * Create and export a singleton instance
 */
export const commandQueueService = new CommandQueueService();
