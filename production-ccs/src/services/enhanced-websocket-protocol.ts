/**
 * Enhanced WebSocket Protocol for TASK-005.1.2
 *
 * This module implements the enhanced WebSocket protocol with transport layer
 * optimizations, connection state management, auto-reconnection, message
 * compression, and batching capabilities.
 */

import { WebSocket } from 'ws';
import { logger } from '@/utils/logger';
import {
  MobileMessage,
  BatchMessage,
  MessageAck,
  ConnectionState,
  ConnectionManager,
  ConnectionConfig,
  NetworkMonitor,
  DeviceInfo,
  MessagePriority,
  CompressionType,
  BackoffStrategy,
  NetworkType,
  MobileProtocolError,
  NetworkError,
} from '@/types/mobile';
import { WebSocketService } from './websocket-manager';
import { CompressionService } from './compression';
import { MessageBatcher, BatchingConfig } from './message-batcher';
import { MessageQueue, QueueConfig } from './message-queue';

/**
 * Enhanced protocol configuration
 */
export interface EnhancedProtocolConfig {
  websocket: {
    url: string;
    protocols?: string[];
    headers?: Record<string, string>;
    timeout: number;
    pingInterval: number;
    pongTimeout: number;
  };
  connection: ConnectionConfig;
  batching: BatchingConfig;
  queue: QueueConfig;
  compression: {
    enabled: boolean;
    algorithms: CompressionType[];
    threshold: number;
    level: number;
  };
  heartbeat: {
    interval: number;
    timeout: number;
    maxMissed: number;
  };
  retry: {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
    backoffStrategy: BackoffStrategy;
    jitter: boolean;
  };
}

/**
 * Protocol event handlers
 */
export interface ProtocolEventHandlers {
  onMessage?: (message: MobileMessage) => Promise<void>;
  onBatch?: (batch: BatchMessage) => Promise<void>;
  onConnectionStateChange?: (state: ConnectionState, manager: ConnectionManager) => void;
  onError?: (error: Error) => void;
  onReconnect?: (attempt: number, delay: number) => void;
  onNetworkChange?: (monitor: NetworkMonitor) => void;
}

/**
 * Enhanced WebSocket Protocol implementation
 */
export class EnhancedWebSocketProtocol {
  private config: EnhancedProtocolConfig;
  private deviceInfo: DeviceInfo;
  private handlers: ProtocolEventHandlers;

  private wsManager: WebSocketService;
  private compression: CompressionService;
  private batcher: MessageBatcher;
  private queue: MessageQueue;

  private connectionManager: ConnectionManager;
  private heartbeatTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private networkMonitor: NetworkMonitor;

  private isDestroyed: boolean = false;
  private pendingAcks: Map<
    string,
    {
      resolve: (ack: MessageAck) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  > = new Map();

  constructor(
    config: EnhancedProtocolConfig,
    deviceInfo: DeviceInfo,
    handlers: ProtocolEventHandlers = {}
  ) {
    this.config = config;
    this.deviceInfo = deviceInfo;
    this.handlers = handlers;

    // Initialize network monitor
    this.networkMonitor = {
      connectionType: 'unknown',
      isOnline: true,
      quality: 'good',
    };

    // Initialize connection manager
    this.connectionManager = {
      state: 'disconnected',
      deviceInfo,
      reconnect: config.connection,
      networkMonitor: this.networkMonitor,
      connectionId: this.generateConnectionId(),
      sessionStartTime: Date.now(),
      metrics: {
        messagesReceived: 0,
        messagesSent: 0,
        reconnectCount: 0,
        totalUptime: 0,
        averageLatency: 0,
      },
    };

    // Initialize services
    this.wsManager = new WebSocketService(config.websocket.url);

    this.compression = new CompressionService();

    this.batcher = new MessageBatcher(config.batching, this.sendBatchToNetwork.bind(this));

    this.queue = new MessageQueue(config.queue, deviceInfo.deviceId);

    this.setupEventHandlers();

    logger.debug('Enhanced WebSocket protocol initialized', {
      deviceId: deviceInfo.deviceId,
      connectionId: this.connectionManager.connectionId,
    });
  }

  /**
   * Connect to the WebSocket server
   */
  public async connect(): Promise<void> {
    if (this.isDestroyed) {
      throw new Error('Protocol has been destroyed');
    }

    try {
      this.updateConnectionState('connecting');

      await this.wsManager.connect();

      this.updateConnectionState('connected');
      this.startHeartbeat();
      this.processQueuedMessages();

      logger.info('Enhanced WebSocket protocol connected', {
        deviceId: this.deviceInfo.deviceId,
        connectionId: this.connectionManager.connectionId,
      });
    } catch (error) {
      this.updateConnectionState('disconnected');
      const networkError = new NetworkError(
        `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
        this.networkMonitor.connectionType
      );
      this.handleError(networkError);
      throw networkError;
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  public async disconnect(): Promise<void> {
    this.updateConnectionState('disconnected');
    this.stopHeartbeat();
    this.stopReconnectTimer();

    await this.wsManager.disconnect();
    await this.batcher.flush();

    logger.info('Enhanced WebSocket protocol disconnected', {
      deviceId: this.deviceInfo.deviceId,
      connectionId: this.connectionManager.connectionId,
    });
  }

  /**
   * Send a message through the protocol
   */
  public async sendMessage(message: MobileMessage): Promise<MessageAck | void> {
    if (this.isDestroyed) {
      throw new Error('Protocol has been destroyed');
    }

    // Add to queue if not connected
    if (this.connectionManager.state !== 'connected') {
      await this.queue.enqueue(message);
      logger.debug('Message queued for later delivery', {
        messageId: message.id,
        deviceId: this.deviceInfo.deviceId,
      });
      return;
    }

    // Add to batcher for efficient transmission
    await this.batcher.addMessage(message);

    // Return promise for acknowledgment if required
    if (message.optimization.requiresAck) {
      return this.waitForAck(message.id);
    }
  }

  /**
   * Get connection status
   */
  public getConnectionManager(): ConnectionManager {
    return { ...this.connectionManager };
  }

  /**
   * Get queue statistics
   */
  public getQueueStats() {
    return this.queue.getStats();
  }

  /**
   * Get batching statistics
   */
  public getBatchingStats() {
    return this.batcher.getStats();
  }

  /**
   * Update protocol configuration
   */
  public updateConfig(config: Partial<EnhancedProtocolConfig>): void {
    Object.assign(this.config, config);

    if (config.batching) {
      this.batcher.updateConfig(config.batching);
    }

    if (config.queue) {
      this.queue.updateConfig(config.queue);
    }

    logger.debug('Protocol configuration updated', {
      deviceId: this.deviceInfo.deviceId,
    });
  }

  /**
   * Destroy the protocol and clean up resources
   */
  public async destroy(): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;

    await this.disconnect();
    await this.batcher.flush();

    this.batcher.destroy();
    await this.queue.destroy();

    // Clear pending acknowledgments
    for (const [messageId, pending] of this.pendingAcks) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Protocol destroyed'));
    }
    this.pendingAcks.clear();

    logger.info('Enhanced WebSocket protocol destroyed', {
      deviceId: this.deviceInfo.deviceId,
      connectionId: this.connectionManager.connectionId,
    });
  }

  /**
   * Setup event handlers for WebSocket manager
   */
  private setupEventHandlers(): void {
    this.wsManager.on('message', this.handleIncomingMessage.bind(this));
    this.wsManager.on('close', this.handleConnectionClose.bind(this));
    this.wsManager.on('error', this.handleError.bind(this));
    this.wsManager.on('ping', this.handlePing.bind(this));
    this.wsManager.on('pong', this.handlePong.bind(this));
  }

  /**
   * Handle incoming WebSocket message
   */
  private async handleIncomingMessage(data: Buffer | string): Promise<void> {
    try {
      let messageData: string;

      if (Buffer.isBuffer(data)) {
        messageData = data.toString('utf8');
      } else {
        messageData = data;
      }

      const parsed = JSON.parse(messageData);

      // Handle batch messages
      if (parsed.messages && Array.isArray(parsed.messages)) {
        await this.handleBatchMessage(parsed as BatchMessage);
      } else if (parsed.messageId && parsed.status) {
        // Handle acknowledgments
        this.handleAcknowledgment(parsed as MessageAck);
      } else {
        // Handle individual messages
        await this.handleSingleMessage(parsed as MobileMessage);
      }

      this.connectionManager.metrics.messagesReceived++;
    } catch (error) {
      logger.error('Failed to handle incoming message', {
        error: error instanceof Error ? error.message : String(error),
        deviceId: this.deviceInfo.deviceId,
      });
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Handle batch message
   */
  private async handleBatchMessage(batch: BatchMessage): Promise<void> {
    logger.debug('Received batch message', {
      batchId: batch.id,
      messageCount: batch.metadata.messageCount,
      deviceId: this.deviceInfo.deviceId,
    });

    // Decompress if needed
    let messages = batch.messages;
    if (batch.compression) {
      try {
        const compressedData = JSON.stringify(batch.messages);
        const decompressed = await this.compression.decompress(
          Buffer.from(compressedData),
          batch.compression
        );
        messages = JSON.parse(decompressed.toString());
      } catch (error) {
        logger.error('Failed to decompress batch', {
          batchId: batch.id,
          compression: batch.compression,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }
    }

    // Process individual messages
    for (const message of messages) {
      await this.handleSingleMessage(message);
    }

    // Call batch handler if provided
    if (this.handlers.onBatch) {
      await this.handlers.onBatch({ ...batch, messages });
    }
  }

  /**
   * Handle single message
   */
  private async handleSingleMessage(message: MobileMessage): Promise<void> {
    logger.debug('Received message', {
      messageId: message.id,
      type: message.type,
      priority: message.optimization.priority,
      deviceId: this.deviceInfo.deviceId,
    });

    // Send acknowledgment if required
    if (message.optimization.requiresAck) {
      const ack: MessageAck = {
        messageId: message.id,
        status: 'received',
        timestamp: Date.now(),
      };
      await this.sendAcknowledgment(ack);
    }

    // Call message handler if provided
    if (this.handlers.onMessage) {
      try {
        await this.handlers.onMessage(message);

        // Send processed acknowledgment if required
        if (message.optimization.requiresAck) {
          const ack: MessageAck = {
            messageId: message.id,
            status: 'processed',
            timestamp: Date.now(),
          };
          await this.sendAcknowledgment(ack);
        }
      } catch (error) {
        // Send failed acknowledgment if required
        if (message.optimization.requiresAck) {
          const ack: MessageAck = {
            messageId: message.id,
            status: 'failed',
            timestamp: Date.now(),
            error: {
              code: 'PROCESSING_ERROR',
              message: error instanceof Error ? error.message : String(error),
            },
          };
          await this.sendAcknowledgment(ack);
        }
        throw error;
      }
    }
  }

  /**
   * Handle acknowledgment
   */
  private handleAcknowledgment(ack: MessageAck): void {
    const pending = this.pendingAcks.get(ack.messageId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingAcks.delete(ack.messageId);
      pending.resolve(ack);
    }
  }

  /**
   * Send acknowledgment
   */
  private async sendAcknowledgment(ack: MessageAck): Promise<void> {
    try {
      const data = JSON.stringify(ack);
      await this.wsManager.send(data);
    } catch (error) {
      logger.error('Failed to send acknowledgment', {
        messageId: ack.messageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Wait for message acknowledgment
   */
  private waitForAck(messageId: string): Promise<MessageAck> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingAcks.delete(messageId);
        reject(new Error(`Acknowledgment timeout for message ${messageId}`));
      }, 30000); // 30 second timeout

      this.pendingAcks.set(messageId, { resolve, reject, timeout });
    });
  }

  /**
   * Send batch to network
   */
  private async sendBatchToNetwork(batch: BatchMessage): Promise<void> {
    try {
      let data = JSON.stringify(batch);

      // Compress if configured and beneficial
      if (this.config.compression.enabled && data.length >= this.config.compression.threshold) {
        const compressed = await this.compression.compress(
          Buffer.from(data),
          this.config.compression.algorithms[0] || 'gzip',
          this.config.compression.level
        );

        if (compressed.length < data.length * 0.9) {
          // Only use if 10%+ savings
          batch.compression = this.config.compression.algorithms[0] || 'gzip';
          data = JSON.stringify(batch);
        }
      }

      await this.wsManager.send(data);
      this.connectionManager.metrics.messagesSent += batch.metadata.messageCount;

      logger.debug('Batch sent successfully', {
        batchId: batch.id,
        messageCount: batch.metadata.messageCount,
        compressed: !!batch.compression,
        deviceId: this.deviceInfo.deviceId,
      });
    } catch (error) {
      logger.error('Failed to send batch', {
        batchId: batch.id,
        error: error instanceof Error ? error.message : String(error),
        deviceId: this.deviceInfo.deviceId,
      });
      throw error;
    }
  }

  /**
   * Process queued messages when connection is restored
   */
  private async processQueuedMessages(): Promise<void> {
    logger.debug('Processing queued messages', {
      queueSize: this.queue.size(),
      deviceId: this.deviceInfo.deviceId,
    });

    while (!this.queue.isEmpty() && this.connectionManager.state === 'connected') {
      const message = await this.queue.dequeue();
      if (message) {
        await this.batcher.addMessage(message);
      }
    }
  }

  /**
   * Update connection state and notify handlers
   */
  private updateConnectionState(state: ConnectionState): void {
    const previousState = this.connectionManager.state;
    this.connectionManager.state = state;

    if (state === 'connected') {
      this.connectionManager.sessionStartTime = Date.now();
    }

    logger.debug('Connection state changed', {
      from: previousState,
      to: state,
      deviceId: this.deviceInfo.deviceId,
    });

    if (this.handlers.onConnectionStateChange) {
      this.handlers.onConnectionStateChange(state, this.connectionManager);
    }
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.wsManager.ping();
      } catch (error) {
        logger.error('Heartbeat failed', {
          error: error instanceof Error ? error.message : String(error),
          deviceId: this.deviceInfo.deviceId,
        });
        this.handleConnectionLoss();
      }
    }, this.config.heartbeat.interval);
  }

  /**
   * Stop heartbeat mechanism
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * Handle connection close
   */
  private handleConnectionClose(code: number, reason: string): void {
    logger.info('WebSocket connection closed', {
      code,
      reason,
      deviceId: this.deviceInfo.deviceId,
    });

    this.updateConnectionState('disconnected');
    this.stopHeartbeat();

    // Attempt reconnection if not intentionally closed
    if (code !== 1000 && !this.isDestroyed) {
      this.attemptReconnection();
    }
  }

  /**
   * Handle connection loss and attempt reconnection
   */
  private handleConnectionLoss(): void {
    if (this.connectionManager.state === 'connected') {
      this.updateConnectionState('disconnected');
      this.stopHeartbeat();
      this.attemptReconnection();
    }
  }

  /**
   * Attempt reconnection with backoff strategy
   */
  private attemptReconnection(): void {
    if (this.isDestroyed || this.connectionManager.state === 'reconnecting') {
      return;
    }

    this.updateConnectionState('reconnecting');
    this.connectionManager.metrics.reconnectCount++;

    const attempt = this.connectionManager.metrics.reconnectCount;
    const delay = this.calculateBackoffDelay(attempt);

    logger.info('Attempting reconnection', {
      attempt,
      delay,
      deviceId: this.deviceInfo.deviceId,
    });

    if (this.handlers.onReconnect) {
      this.handlers.onReconnect(attempt, delay);
    }

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        logger.error('Reconnection failed', {
          attempt,
          error: error instanceof Error ? error.message : String(error),
          deviceId: this.deviceInfo.deviceId,
        });

        if (attempt < this.config.retry.maxAttempts) {
          this.attemptReconnection();
        } else {
          this.updateConnectionState('disconnected');
          this.handleError(
            new NetworkError(
              'Maximum reconnection attempts exceeded',
              this.networkMonitor.connectionType,
              false
            )
          );
        }
      }
    }, delay);
  }

  /**
   * Calculate backoff delay for reconnection
   */
  private calculateBackoffDelay(attempt: number): number {
    let delay: number;

    switch (this.config.retry.backoffStrategy) {
      case 'exponential':
        delay = Math.min(
          this.config.retry.baseDelay * Math.pow(2, attempt - 1),
          this.config.retry.maxDelay
        );
        break;
      case 'linear':
        delay = Math.min(this.config.retry.baseDelay * attempt, this.config.retry.maxDelay);
        break;
      case 'fixed':
      default:
        delay = this.config.retry.baseDelay;
        break;
    }

    // Add jitter if configured
    if (this.config.retry.jitter) {
      delay += Math.random() * 1000; // Add up to 1 second of jitter
    }

    return delay;
  }

  /**
   * Stop reconnection timer
   */
  private stopReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  /**
   * Handle ping from server
   */
  private handlePing(): void {
    // WebSocket manager handles pong automatically
    logger.debug('Received ping from server', {
      deviceId: this.deviceInfo.deviceId,
    });
  }

  /**
   * Handle pong from server
   */
  private handlePong(): void {
    logger.debug('Received pong from server', {
      deviceId: this.deviceInfo.deviceId,
    });
  }

  /**
   * Handle errors
   */
  private handleError(error: Error): void {
    logger.error('Protocol error', {
      error: error.message,
      stack: error.stack,
      deviceId: this.deviceInfo.deviceId,
    });

    if (this.handlers.onError) {
      this.handlers.onError(error);
    }
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
