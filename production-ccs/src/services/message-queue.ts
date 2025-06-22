/**
 * Message Queue Service for TASK-005.1.2
 *
 * This module implements message queuing capabilities for mobile-optimized
 * communication protocols, providing offline support and reliable message delivery.
 */

import { logger } from '@/utils/logger';
import { MobileMessage, MessagePriority, QueuedMessage, QueueOverflowError } from '@/types/mobile';

/**
 * Queue configuration
 */
export interface QueueConfig {
  maxSize: number;
  persistToDisk: boolean;
  retryAttempts: number;
  retryDelay: number;
  ttl: number;
}

/**
 * Queue statistics
 */
export interface QueueStats {
  size: number;
  maxSize: number;
  totalEnqueued: number;
  totalDequeued: number;
  totalExpired: number;
  totalFailed: number;
  oldestMessageAge: number;
}

/**
 * Message queue for offline support and reliable delivery
 */
export class MessageQueue {
  private config: QueueConfig;
  private deviceId: string;
  private queue: QueuedMessage[] = [];
  private totalEnqueued: number = 0;
  private totalDequeued: number = 0;
  private totalExpired: number = 0;
  private totalFailed: number = 0;
  private cleanupTimer?: NodeJS.Timeout | undefined;

  constructor(config: QueueConfig, deviceId: string) {
    this.config = config;
    this.deviceId = deviceId;

    // Start cleanup timer for expired messages
    this.startCleanupTimer();

    logger.debug('Message queue initialized', {
      deviceId,
      maxSize: config.maxSize,
      persistToDisk: config.persistToDisk,
      retryAttempts: config.retryAttempts,
      ttl: config.ttl,
    });
  }

  /**
   * Add message to queue
   */
  public async enqueue(message: MobileMessage): Promise<void> {
    // Check queue size limit
    if (this.queue.length >= this.config.maxSize) {
      // Remove oldest low-priority message if possible
      if (!this.removeOldestLowPriorityMessage()) {
        throw new QueueOverflowError(this.queue.length, this.config.maxSize);
      }
    }

    const queuedMessage: QueuedMessage = {
      message,
      queuedAt: Date.now(),
      attempts: 0,
      nextRetry: Date.now() + this.config.ttl,
      priority: message.optimization.priority,
    };

    // Insert message based on priority
    this.insertByPriority(queuedMessage);
    this.totalEnqueued++;

    logger.debug('Message enqueued', {
      deviceId: this.deviceId,
      messageId: message.id,
      priority: message.optimization.priority,
      queueSize: this.queue.length,
    });

    // Persist to disk if configured
    if (this.config.persistToDisk) {
      await this.persistQueue();
    }
  }

  /**
   * Remove and return next message from queue
   */
  public async dequeue(): Promise<MobileMessage | null> {
    // Clean up expired messages first
    this.cleanupExpiredMessages();

    if (this.queue.length === 0) {
      return null;
    }

    // Get highest priority message
    const queuedMessage = this.queue.shift()!;
    this.totalDequeued++;

    logger.debug('Message dequeued', {
      deviceId: this.deviceId,
      messageId: queuedMessage.message.id,
      priority: queuedMessage.message.optimization.priority,
      queueSize: this.queue.length,
      waitTime: Date.now() - queuedMessage.queuedAt,
    });

    // Persist to disk if configured
    if (this.config.persistToDisk) {
      await this.persistQueue();
    }

    return queuedMessage.message;
  }

  /**
   * Peek at next message without removing it
   */
  public peek(): MobileMessage | null {
    this.cleanupExpiredMessages();

    if (this.queue.length === 0) {
      return null;
    }

    return this.queue[0]!.message;
  }

  /**
   * Get all messages in queue (for inspection)
   */
  public getAll(): MobileMessage[] {
    this.cleanupExpiredMessages();
    return this.queue.map((qm) => qm.message);
  }

  /**
   * Remove specific message from queue
   */
  public async remove(messageId: string): Promise<boolean> {
    const index = this.queue.findIndex((qm) => qm.message.id === messageId);

    if (index === -1) {
      return false;
    }

    this.queue.splice(index, 1);

    logger.debug('Message removed from queue', {
      deviceId: this.deviceId,
      messageId,
      queueSize: this.queue.length,
    });

    // Persist to disk if configured
    if (this.config.persistToDisk) {
      await this.persistQueue();
    }

    return true;
  }

  /**
   * Clear all messages from queue
   */
  public async clear(): Promise<void> {
    const clearedCount = this.queue.length;
    this.queue = [];

    logger.debug('Queue cleared', {
      deviceId: this.deviceId,
      clearedCount,
    });

    // Persist to disk if configured
    if (this.config.persistToDisk) {
      await this.persistQueue();
    }
  }

  /**
   * Get queue size
   */
  public size(): number {
    this.cleanupExpiredMessages();
    return this.queue.length;
  }

  /**
   * Check if queue is empty
   */
  public isEmpty(): boolean {
    return this.size() === 0;
  }

  /**
   * Check if queue is full
   */
  public isFull(): boolean {
    return this.queue.length >= this.config.maxSize;
  }

  /**
   * Get queue statistics
   */
  public getStats(): QueueStats {
    this.cleanupExpiredMessages();

    const oldestMessageAge =
      this.queue.length > 0 ? Date.now() - Math.min(...this.queue.map((qm) => qm.queuedAt)) : 0;

    return {
      size: this.queue.length,
      maxSize: this.config.maxSize,
      totalEnqueued: this.totalEnqueued,
      totalDequeued: this.totalDequeued,
      totalExpired: this.totalExpired,
      totalFailed: this.totalFailed,
      oldestMessageAge,
    };
  }

  /**
   * Insert message by priority (highest priority first)
   */
  private insertByPriority(queuedMessage: QueuedMessage): void {
    const priority = queuedMessage.message.optimization.priority;
    const priorityOrder: MessagePriority[] = ['critical', 'high', 'normal', 'low'];
    const messagePriorityIndex = priorityOrder.indexOf(priority);

    // Find insertion point
    let insertIndex = 0;
    for (let i = 0; i < this.queue.length; i++) {
      const existingPriority = this.queue[i]!.message.optimization.priority;
      const existingPriorityIndex = priorityOrder.indexOf(existingPriority);

      if (messagePriorityIndex <= existingPriorityIndex) {
        insertIndex = i;
        break;
      }
      insertIndex = i + 1;
    }

    this.queue.splice(insertIndex, 0, queuedMessage);
  }

  /**
   * Remove oldest low-priority message to make space
   */
  private removeOldestLowPriorityMessage(): boolean {
    // Find oldest low or normal priority message
    let oldestIndex = -1;
    let oldestTime = Date.now();

    for (let i = this.queue.length - 1; i >= 0; i--) {
      const queuedMessage = this.queue[i]!;
      const priority = queuedMessage.message.optimization.priority;

      if ((priority === 'low' || priority === 'normal') && queuedMessage.queuedAt < oldestTime) {
        oldestIndex = i;
        oldestTime = queuedMessage.queuedAt;
      }
    }

    if (oldestIndex !== -1) {
      const removed = this.queue.splice(oldestIndex, 1)[0]!;
      logger.debug('Removed oldest low-priority message to make space', {
        deviceId: this.deviceId,
        removedMessageId: removed.message.id,
        priority: removed.message.optimization.priority,
      });
      return true;
    }

    return false;
  }

  /**
   * Clean up expired messages
   */
  private cleanupExpiredMessages(): void {
    const now = Date.now();
    const initialSize = this.queue.length;

    this.queue = this.queue.filter((queuedMessage) => {
      if (queuedMessage.nextRetry && queuedMessage.nextRetry <= now) {
        this.totalExpired++;
        logger.debug('Message expired and removed from queue', {
          deviceId: this.deviceId,
          messageId: queuedMessage.message.id,
          age: now - queuedMessage.queuedAt,
        });
        return false;
      }
      return true;
    });

    const expiredCount = initialSize - this.queue.length;
    if (expiredCount > 0) {
      logger.debug('Cleaned up expired messages', {
        deviceId: this.deviceId,
        expiredCount,
        remainingSize: this.queue.length,
      });
    }
  }

  /**
   * Start cleanup timer for expired messages
   */
  private startCleanupTimer(): void {
    // Clean up every 30 seconds
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredMessages();
    }, 30000);
  }

  /**
   * Stop cleanup timer
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Persist queue to disk (placeholder implementation)
   */
  private async persistQueue(): Promise<void> {
    // TODO: Implement actual disk persistence
    // This would typically write to a file or database
    logger.debug('Queue persistence requested', {
      deviceId: this.deviceId,
      queueSize: this.queue.length,
    });
  }

  /**
   * Load queue from disk (placeholder implementation)
   */
  private async loadQueue(): Promise<void> {
    // TODO: Implement actual disk loading
    // This would typically read from a file or database
    logger.debug('Queue loading requested', {
      deviceId: this.deviceId,
    });
  }

  /**
   * Update queue configuration
   */
  public updateConfig(config: Partial<QueueConfig>): void {
    Object.assign(this.config, config);

    logger.debug('Queue configuration updated', {
      deviceId: this.deviceId,
      config: this.config,
    });

    // If max size was reduced, trim queue if necessary
    if (this.queue.length > this.config.maxSize) {
      const trimCount = this.queue.length - this.config.maxSize;
      // Remove from the end (lowest priority messages)
      this.queue.splice(-trimCount, trimCount);

      logger.debug('Queue trimmed due to size reduction', {
        deviceId: this.deviceId,
        trimCount,
        newSize: this.queue.length,
      });
    }
  }

  /**
   * Destroy the queue
   */
  public async destroy(): Promise<void> {
    this.stopCleanupTimer();

    if (this.config.persistToDisk) {
      await this.persistQueue();
    }

    this.queue = [];

    logger.debug('Message queue destroyed', {
      deviceId: this.deviceId,
    });
  }
}
