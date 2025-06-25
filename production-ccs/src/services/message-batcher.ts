/**
 * Message Batcher Service for TASK-005.1.2
 *
 * This module implements message batching capabilities for mobile-optimized
 * communication protocols, allowing multiple messages to be sent together
 * for improved efficiency.
 */

import { logger } from '@/utils/logger';
import { MobileMessage, BatchMessage, MessagePriority, CompressionType } from '@/types/mobile';

/**
 * Batching configuration
 */
export interface BatchingConfig {
  enabled: boolean;
  maxSize: number;
  maxWait: number;
  priorityThreshold: MessagePriority;
}

/**
 * Batch send callback type
 */
export type BatchSendCallback = (batch: BatchMessage) => Promise<void>;

/**
 * Message batcher for efficient transmission
 */
export class MessageBatcher {
  private config: BatchingConfig;
  private sendCallback: BatchSendCallback;
  private pendingMessages: MobileMessage[] = [];
  private batchTimer?: NodeJS.Timeout;
  private batchCounter: number = 0;

  constructor(config: BatchingConfig, sendCallback: BatchSendCallback) {
    this.config = config;
    this.sendCallback = sendCallback;

    logger.debug('Message batcher initialized', {
      enabled: config.enabled,
      maxSize: config.maxSize,
      maxWait: config.maxWait,
      priorityThreshold: config.priorityThreshold,
    });
  }

  /**
   * Add message to batch
   */
  public async addMessage(message: MobileMessage): Promise<void> {
    if (!this.config.enabled) {
      // If batching is disabled, send immediately
      await this.sendSingleMessageBatch(message);
      return;
    }

    // Add message to pending batch
    this.pendingMessages.push(message);

    logger.debug('Message added to batch', {
      messageId: message.id,
      batchSize: this.pendingMessages.length,
      maxSize: this.config.maxSize,
    });

    // Check if batch should be sent immediately
    if (this.shouldSendBatch()) {
      await this.sendPendingBatch();
    } else if (!this.batchTimer) {
      // Start timer for batch timeout
      this.startBatchTimer();
    }
  }

  /**
   * Check if batch should be sent
   */
  private shouldSendBatch(): boolean {
    // Send if batch is full
    if (this.pendingMessages.length >= this.config.maxSize) {
      return true;
    }

    // Send if any message has high priority
    const hasHighPriorityMessage = this.pendingMessages.some((msg) =>
      this.isPriorityAboveThreshold(msg.optimization.priority)
    );

    return hasHighPriorityMessage;
  }

  /**
   * Check if message priority is above batching threshold
   */
  private isPriorityAboveThreshold(priority: MessagePriority): boolean {
    const priorityOrder: MessagePriority[] = ['low', 'normal', 'high', 'critical'];
    const messagePriorityIndex = priorityOrder.indexOf(priority);
    const thresholdIndex = priorityOrder.indexOf(this.config.priorityThreshold);
    return messagePriorityIndex > thresholdIndex;
  }

  /**
   * Start batch timer
   */
  private startBatchTimer(): void {
    this.batchTimer = setTimeout(async () => {
      if (this.pendingMessages.length > 0) {
        await this.sendPendingBatch();
      }
    }, this.config.maxWait);
  }

  /**
   * Clear batch timer
   */
  private clearBatchTimer(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined as any;
    }
  }

  /**
   * Send pending batch
   */
  private async sendPendingBatch(): Promise<void> {
    if (this.pendingMessages.length === 0) {
      return;
    }

    this.clearBatchTimer();

    const messages = [...this.pendingMessages];
    this.pendingMessages = [];

    try {
      const batch = this.createBatch(messages);
      await this.sendCallback(batch);

      logger.debug('Batch sent successfully', {
        batchId: batch.id,
        messageCount: messages.length,
        totalSize: batch.metadata.totalSize,
      });
    } catch (error) {
      logger.error('Failed to send batch', {
        messageCount: messages.length,
        error: error instanceof Error ? error.message : String(error),
      });

      // Re-queue messages for retry (simplified approach)
      this.pendingMessages.unshift(...messages);
      throw error;
    }
  }

  /**
   * Send single message as batch
   */
  private async sendSingleMessageBatch(message: MobileMessage): Promise<void> {
    const batch = this.createBatch([message]);
    await this.sendCallback(batch);

    logger.debug('Single message batch sent', {
      batchId: batch.id,
      messageId: message.id,
    });
  }

  /**
   * Create batch from messages
   */
  private createBatch(messages: MobileMessage[]): BatchMessage {
    const batchId = this.generateBatchId();
    const timestamp = Date.now();

    // Calculate total size
    const totalSize = messages.reduce((size, msg) => {
      return size + Buffer.byteLength(JSON.stringify(msg), 'utf8');
    }, 0);

    // Determine batch priority (highest priority of all messages)
    const batchPriority = this.getBatchPriority(messages);

    // Determine compression type
    const compressionType = this.selectCompressionType(messages, totalSize);

    // Calculate TTL (shortest TTL of all messages)
    const batchTTL = this.getBatchTTL(messages);

    const batch: BatchMessage = {
      id: batchId,
      timestamp,
      ...(compressionType && { compression: compressionType }),
      messages,
      metadata: {
        totalSize,
        messageCount: messages.length,
        priority: batchPriority,
        ...(batchTTL !== undefined && { ttl: batchTTL }),
      },
    };

    return batch;
  }

  /**
   * Generate unique batch ID
   */
  private generateBatchId(): string {
    this.batchCounter++;
    return `batch_${Date.now()}_${this.batchCounter}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Get batch priority (highest priority of all messages)
   */
  private getBatchPriority(messages: MobileMessage[]): MessagePriority {
    const priorityOrder: MessagePriority[] = ['low', 'normal', 'high', 'critical'];

    let highestPriority: MessagePriority = 'low';
    let highestIndex = 0;

    for (const message of messages) {
      const priorityIndex = priorityOrder.indexOf(message.optimization.priority);
      if (priorityIndex > highestIndex) {
        highestIndex = priorityIndex;
        highestPriority = message.optimization.priority;
      }
    }

    return highestPriority;
  }

  /**
   * Select compression type for batch
   */
  private selectCompressionType(
    messages: MobileMessage[],
    totalSize: number
  ): CompressionType | undefined {
    // Don't compress small batches
    if (totalSize < 1024) {
      return undefined;
    }

    // Check if all messages support compression
    const allSupportCompression = messages.every(
      (msg) => msg.optimization.compression && msg.optimization.compression !== 'none'
    );

    if (!allSupportCompression) {
      return undefined;
    }

    // Use gzip as default for batches
    return 'gzip';
  }

  /**
   * Get batch TTL (shortest TTL of all messages)
   */
  private getBatchTTL(messages: MobileMessage[]): number | undefined {
    let shortestTTL: number | undefined;

    for (const message of messages) {
      const messageTTL = message.optimization.ttl;
      if (messageTTL !== undefined) {
        if (shortestTTL === undefined || messageTTL < shortestTTL) {
          shortestTTL = messageTTL;
        }
      }
    }

    return shortestTTL;
  }

  /**
   * Force send any pending messages
   */
  public async flush(): Promise<void> {
    if (this.pendingMessages.length > 0) {
      await this.sendPendingBatch();
    }
  }

  /**
   * Get pending message count
   */
  public getPendingCount(): number {
    return this.pendingMessages.length;
  }

  /**
   * Get batching statistics
   */
  public getStats(): {
    enabled: boolean;
    pendingMessages: number;
    maxSize: number;
    maxWait: number;
    priorityThreshold: MessagePriority;
    batchCounter: number;
  } {
    return {
      enabled: this.config.enabled,
      pendingMessages: this.pendingMessages.length,
      maxSize: this.config.maxSize,
      maxWait: this.config.maxWait,
      priorityThreshold: this.config.priorityThreshold,
      batchCounter: this.batchCounter,
    };
  }

  /**
   * Update batching configuration
   */
  public updateConfig(config: Partial<BatchingConfig>): void {
    Object.assign(this.config, config);

    logger.debug('Batching configuration updated', this.config);

    // If batching was disabled, flush pending messages
    if (!this.config.enabled && this.pendingMessages.length > 0) {
      this.flush().catch((error) => {
        logger.error('Failed to flush messages after disabling batching', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  /**
   * Clear all pending messages
   */
  public clear(): void {
    this.clearBatchTimer();
    this.pendingMessages = [];
    logger.debug('Message batcher cleared');
  }

  /**
   * Destroy the batcher
   */
  public destroy(): void {
    this.clearBatchTimer();
    this.pendingMessages = [];
    logger.debug('Message batcher destroyed');
  }
}
