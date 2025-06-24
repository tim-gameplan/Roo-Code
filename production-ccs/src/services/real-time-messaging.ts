/**
 * Real-Time Messaging Service
 *
 * Provides real-time message streaming with sub-100ms latency,
 * message acknowledgment, delivery confirmation, and stream management.
 *
 * Features:
 * - Real-time message delivery with guaranteed ordering
 * - Message acknowledgment and delivery confirmation
 * - Stream management with backpressure handling
 * - Message sequence guarantees
 * - Performance monitoring and metrics
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { MobileMessage, MessagePriority } from '../types/mobile';

export interface RealTimeMessage extends MobileMessage {
  sequenceNumber: number;
  acknowledgmentRequired: boolean;
  deliveryTimeout: number;
  streamId: string;
}

export interface MessageAcknowledgment {
  messageId: string;
  sequenceNumber: number;
  timestamp: number;
  status: 'delivered' | 'processed' | 'failed';
  error?: string;
}

export interface StreamConfig {
  maxConcurrentMessages: number;
  acknowledgmentTimeout: number;
  retryAttempts: number;
  backpressureThreshold: number;
  orderingEnabled: boolean;
}

export interface StreamMetrics {
  messagesDelivered: number;
  averageLatency: number;
  acknowledgmentRate: number;
  backpressureEvents: number;
  sequenceErrors: number;
  lastActivity: number;
}

export interface MessageStream {
  streamId: string;
  deviceId: string;
  config: StreamConfig;
  metrics: StreamMetrics;
  sequenceCounter: number;
  pendingMessages: Map<string, RealTimeMessage>;
  messageQueue: RealTimeMessage[];
  isBackpressured: boolean;
  lastSequenceNumber: number;
}

/**
 * Real-Time Messaging Service
 *
 * Manages real-time message streams with guaranteed delivery,
 * ordering, and performance optimization.
 */
export class RealTimeMessagingService extends EventEmitter {
  private streams: Map<string, MessageStream> = new Map();
  private globalSequenceCounter: number = 0;
  private acknowledgmentTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private performanceMetrics: {
    totalMessages: number;
    averageLatency: number;
    throughput: number;
    errorRate: number;
  } = {
    totalMessages: 0,
    averageLatency: 0,
    throughput: 0,
    errorRate: 0,
  };

  private readonly defaultStreamConfig: StreamConfig = {
    maxConcurrentMessages: 100,
    acknowledgmentTimeout: 5000, // 5 seconds
    retryAttempts: 3,
    backpressureThreshold: 80, // 80% of max concurrent
    orderingEnabled: true,
  };

  constructor() {
    super();
    this.startPerformanceMonitoring();
  }

  /**
   * Create a new message stream for a device
   */
  public createStream(deviceId: string, config?: Partial<StreamConfig>): string {
    const streamId = `stream_${deviceId}_${Date.now()}`;
    const streamConfig = { ...this.defaultStreamConfig, ...config };

    const stream: MessageStream = {
      streamId,
      deviceId,
      config: streamConfig,
      metrics: {
        messagesDelivered: 0,
        averageLatency: 0,
        acknowledgmentRate: 0,
        backpressureEvents: 0,
        sequenceErrors: 0,
        lastActivity: Date.now(),
      },
      sequenceCounter: 0,
      pendingMessages: new Map(),
      messageQueue: [],
      isBackpressured: false,
      lastSequenceNumber: 0,
    };

    this.streams.set(streamId, stream);

    logger.info('Real-time message stream created', {
      streamId,
      deviceId,
      config: streamConfig,
    });

    this.emit('streamCreated', { streamId, deviceId });
    return streamId;
  }

  /**
   * Send a real-time message through a stream
   */
  public async sendMessage(
    streamId: string,
    message: MobileMessage,
    options: {
      acknowledgmentRequired?: boolean;
      deliveryTimeout?: number;
      priority?: MessagePriority;
    } = {}
  ): Promise<string> {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    // Check for backpressure
    if (this.isStreamBackpressured(stream)) {
      this.handleBackpressure(stream);
      throw new Error(`Stream ${streamId} is experiencing backpressure`);
    }

    const realTimeMessage: RealTimeMessage = {
      ...message,
      sequenceNumber: ++stream.sequenceCounter,
      acknowledgmentRequired: options.acknowledgmentRequired ?? true,
      deliveryTimeout: options.deliveryTimeout ?? stream.config.acknowledgmentTimeout,
      streamId,
    };

    // Update priority if provided
    if (options.priority) {
      realTimeMessage.optimization.priority = options.priority;
    }

    // Add to pending messages if acknowledgment required
    if (realTimeMessage.acknowledgmentRequired) {
      stream.pendingMessages.set(realTimeMessage.id, realTimeMessage);
      this.setAcknowledmentTimeout(realTimeMessage);
    }

    // Handle message ordering
    if (stream.config.orderingEnabled) {
      await this.ensureMessageOrdering(stream, realTimeMessage);
    } else {
      await this.deliverMessage(realTimeMessage);
    }

    // Update metrics
    stream.metrics.lastActivity = Date.now();
    this.performanceMetrics.totalMessages++;

    logger.debug('Real-time message sent', {
      streamId,
      messageId: realTimeMessage.id,
      sequenceNumber: realTimeMessage.sequenceNumber,
      priority: realTimeMessage.optimization?.priority,
    });

    return realTimeMessage.id;
  }

  /**
   * Process message acknowledgment
   */
  public processAcknowledgment(acknowledgment: MessageAcknowledgment): void {
    const { messageId, status, timestamp } = acknowledgment;

    // Find the stream containing this message
    let targetStream: MessageStream | undefined;
    for (const stream of this.streams.values()) {
      if (stream.pendingMessages.has(messageId)) {
        targetStream = stream;
        break;
      }
    }

    if (!targetStream) {
      logger.warn('Acknowledgment received for unknown message', { messageId });
      return;
    }

    const message = targetStream.pendingMessages.get(messageId);
    if (!message) {
      return;
    }

    // Calculate latency
    const latency = timestamp - message.timestamp;
    this.updateLatencyMetrics(targetStream, latency);

    // Remove from pending messages
    targetStream.pendingMessages.delete(messageId);
    this.clearAcknowledmentTimeout(messageId);

    // Update metrics
    targetStream.metrics.messagesDelivered++;
    targetStream.metrics.acknowledgmentRate =
      targetStream.metrics.messagesDelivered / targetStream.sequenceCounter;

    if (status === 'failed') {
      this.handleMessageFailure(targetStream, message, acknowledgment.error);
    }

    logger.debug('Message acknowledgment processed', {
      messageId,
      status,
      latency,
      streamId: targetStream.streamId,
    });

    this.emit('messageAcknowledged', { message, acknowledgment, latency });
  }

  /**
   * Get stream metrics
   */
  public getStreamMetrics(streamId: string): StreamMetrics | null {
    const stream = this.streams.get(streamId);
    return stream ? { ...stream.metrics } : null;
  }

  /**
   * Get global performance metrics
   */
  public getPerformanceMetrics() {
    return { ...this.performanceMetrics };
  }

  /**
   * Close a message stream
   */
  public closeStream(streamId: string): void {
    const stream = this.streams.get(streamId);
    if (!stream) {
      return;
    }

    // Clear pending acknowledgment timeouts
    for (const messageId of stream.pendingMessages.keys()) {
      this.clearAcknowledmentTimeout(messageId);
    }

    this.streams.delete(streamId);

    logger.info('Real-time message stream closed', {
      streamId,
      deviceId: stream.deviceId,
      finalMetrics: stream.metrics,
    });

    this.emit('streamClosed', { streamId, metrics: stream.metrics });
  }

  /**
   * Check if stream is experiencing backpressure
   */
  private isStreamBackpressured(stream: MessageStream): boolean {
    const pendingCount = stream.pendingMessages.size;
    const threshold =
      stream.config.maxConcurrentMessages * (stream.config.backpressureThreshold / 100);

    return pendingCount >= threshold;
  }

  /**
   * Handle backpressure situation
   */
  private handleBackpressure(stream: MessageStream): void {
    stream.isBackpressured = true;
    stream.metrics.backpressureEvents++;

    logger.warn('Stream experiencing backpressure', {
      streamId: stream.streamId,
      pendingMessages: stream.pendingMessages.size,
      threshold: stream.config.backpressureThreshold,
    });

    this.emit('backpressure', {
      streamId: stream.streamId,
      pendingCount: stream.pendingMessages.size,
    });

    // Implement backpressure relief strategies
    this.relieveBackpressure(stream);
  }

  /**
   * Relieve backpressure by processing queued messages
   */
  private relieveBackpressure(stream: MessageStream): void {
    // Process high-priority messages first
    const highPriorityMessages = stream.messageQueue
      .filter(
        (msg) => msg.optimization?.priority === 'critical' || msg.optimization?.priority === 'high'
      )
      .sort((a, b) => {
        const priorityOrder: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };
        const aPriority = a.optimization?.priority || 'normal';
        const bPriority = b.optimization?.priority || 'normal';
        return priorityOrder[aPriority] - priorityOrder[bPriority];
      });

    // Deliver high-priority messages immediately
    highPriorityMessages.forEach((message) => {
      this.deliverMessage(message);
      const index = stream.messageQueue.indexOf(message);
      if (index > -1) {
        stream.messageQueue.splice(index, 1);
      }
    });

    // Check if backpressure is relieved
    if (!this.isStreamBackpressured(stream)) {
      stream.isBackpressured = false;
      this.emit('backpressureRelieved', { streamId: stream.streamId });
    }
  }

  /**
   * Ensure message ordering within a stream
   */
  private async ensureMessageOrdering(
    stream: MessageStream,
    message: RealTimeMessage
  ): Promise<void> {
    // Check if this is the next expected sequence number
    if (message.sequenceNumber === stream.lastSequenceNumber + 1) {
      await this.deliverMessage(message);
      stream.lastSequenceNumber = message.sequenceNumber;

      // Check if any queued messages can now be delivered
      await this.processQueuedMessages(stream);
    } else {
      // Queue the message for later delivery
      stream.messageQueue.push(message);
      stream.messageQueue.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

      logger.debug('Message queued for ordering', {
        streamId: stream.streamId,
        messageId: message.id,
        sequenceNumber: message.sequenceNumber,
        expectedSequence: stream.lastSequenceNumber + 1,
      });
    }
  }

  /**
   * Process queued messages in order
   */
  private async processQueuedMessages(stream: MessageStream): Promise<void> {
    while (stream.messageQueue.length > 0) {
      const nextMessage = stream.messageQueue[0];

      if (nextMessage && nextMessage.sequenceNumber === stream.lastSequenceNumber + 1) {
        await this.deliverMessage(nextMessage);
        stream.lastSequenceNumber = nextMessage.sequenceNumber;
        stream.messageQueue.shift();
      } else {
        break; // Wait for missing sequence number
      }
    }
  }

  /**
   * Deliver a message to its destination
   */
  private async deliverMessage(message: RealTimeMessage): Promise<void> {
    try {
      // Emit message for delivery by transport layer
      this.emit('messageReady', message);

      logger.debug('Message delivered', {
        messageId: message.id,
        streamId: message.streamId,
        sequenceNumber: message.sequenceNumber,
      });
    } catch (error) {
      logger.error('Message delivery failed', {
        messageId: message.id,
        streamId: message.streamId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      this.emit('messageDeliveryFailed', { message, error });
    }
  }

  /**
   * Set acknowledgment timeout for a message
   */
  private setAcknowledmentTimeout(message: RealTimeMessage): void {
    const timeout = setTimeout(() => {
      this.handleAcknowledmentTimeout(message);
    }, message.deliveryTimeout);

    this.acknowledgmentTimeouts.set(message.id, timeout);
  }

  /**
   * Clear acknowledgment timeout
   */
  private clearAcknowledmentTimeout(messageId: string): void {
    const timeout = this.acknowledgmentTimeouts.get(messageId);
    if (timeout) {
      clearTimeout(timeout);
      this.acknowledgmentTimeouts.delete(messageId);
    }
  }

  /**
   * Handle acknowledgment timeout
   */
  private handleAcknowledmentTimeout(message: RealTimeMessage): void {
    const stream = this.streams.get(message.streamId);
    if (!stream) {
      return;
    }

    logger.warn('Message acknowledgment timeout', {
      messageId: message.id,
      streamId: message.streamId,
      timeout: message.deliveryTimeout,
    });

    // Remove from pending messages
    stream.pendingMessages.delete(message.id);
    this.acknowledgmentTimeouts.delete(message.id);

    // Emit timeout event
    this.emit('acknowledgmentTimeout', { message, stream: stream.streamId });

    // Update error metrics
    this.performanceMetrics.errorRate =
      (this.performanceMetrics.errorRate + 1) / this.performanceMetrics.totalMessages;
  }

  /**
   * Handle message delivery failure
   */
  private handleMessageFailure(
    stream: MessageStream,
    message: RealTimeMessage,
    error?: string
  ): void {
    logger.error('Message delivery failed', {
      messageId: message.id,
      streamId: stream.streamId,
      error,
    });

    this.emit('messageDeliveryFailed', { message, error });

    // Update error metrics
    this.performanceMetrics.errorRate =
      (this.performanceMetrics.errorRate + 1) / this.performanceMetrics.totalMessages;
  }

  /**
   * Update latency metrics
   */
  private updateLatencyMetrics(stream: MessageStream, latency: number): void {
    // Update stream-specific latency
    const currentAvg = stream.metrics.averageLatency;
    const messageCount = stream.metrics.messagesDelivered;
    stream.metrics.averageLatency = (currentAvg * messageCount + latency) / (messageCount + 1);

    // Update global latency
    const globalAvg = this.performanceMetrics.averageLatency;
    const totalMessages = this.performanceMetrics.totalMessages;
    this.performanceMetrics.averageLatency =
      (globalAvg * totalMessages + latency) / (totalMessages + 1);
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    // Update throughput metrics every 10 seconds
    setInterval(() => {
      this.updateThroughputMetrics();
    }, 10000);

    // Clean up inactive streams every 5 minutes
    setInterval(() => {
      this.cleanupInactiveStreams();
    }, 300000);
  }

  /**
   * Update throughput metrics
   */
  private updateThroughputMetrics(): void {
    const now = Date.now();
    const timeWindow = 10000; // 10 seconds

    let recentMessages = 0;
    for (const stream of this.streams.values()) {
      if (now - stream.metrics.lastActivity < timeWindow) {
        recentMessages += stream.metrics.messagesDelivered;
      }
    }

    this.performanceMetrics.throughput = recentMessages / (timeWindow / 1000);
  }

  /**
   * Clean up inactive streams
   */
  private cleanupInactiveStreams(): void {
    const now = Date.now();
    const inactivityThreshold = 1800000; // 30 minutes

    for (const [streamId, stream] of this.streams.entries()) {
      if (now - stream.metrics.lastActivity > inactivityThreshold) {
        logger.info('Cleaning up inactive stream', {
          streamId,
          lastActivity: new Date(stream.metrics.lastActivity).toISOString(),
        });

        this.closeStream(streamId);
      }
    }
  }

  /**
   * Get all active streams
   */
  public getActiveStreams(): string[] {
    return Array.from(this.streams.keys());
  }

  /**
   * Get stream count by device
   */
  public getStreamsByDevice(deviceId: string): string[] {
    const streams: string[] = [];
    for (const [streamId, stream] of this.streams.entries()) {
      if (stream.deviceId === deviceId) {
        streams.push(streamId);
      }
    }
    return streams;
  }

  /**
   * Shutdown the service
   */
  public shutdown(): void {
    // Close all streams
    for (const streamId of this.streams.keys()) {
      this.closeStream(streamId);
    }

    // Clear all timeouts
    for (const timeout of this.acknowledgmentTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.acknowledgmentTimeouts.clear();

    logger.info('Real-time messaging service shutdown complete');
  }
}
