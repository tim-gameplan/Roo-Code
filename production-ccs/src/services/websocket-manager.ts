/**
 * Enhanced WebSocket Manager for TASK-005.1.2
 *
 * This module implements the enhanced WebSocket protocol with connection state management,
 * auto-reconnection, message compression, and batching capabilities.
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '@/utils/logger';
import { messageValidationService } from '@/services/validation';
import {
  MobileMessage,
  BatchMessage,
  MessageAck,
  ConnectionState,
  ConnectionManager,
  DeviceInfo,
  NetworkMonitor,
  ConnectionConfig,
  QueuedMessage,
  MessageQueue,
  PerformanceMetrics,
  MobileProtocolConfig,
  DEFAULT_MOBILE_CONFIG,
  MobileProtocolError,
  NetworkError,
  QueueOverflowError,
  CompressionType,
  MessagePriority,
  BackoffStrategy,
} from '@/types/mobile';
import { CompressionService } from './compression';
import { MessageBatcher } from './message-batcher';
import { MessageQueue as MessageQueueService } from './message-queue';

/**
 * WebSocket connection wrapper with enhanced mobile protocol support
 */
export class EnhancedWebSocketConnection extends EventEmitter {
  private ws: WebSocket;
  private connectionId: string;
  private deviceInfo: DeviceInfo;
  private state: ConnectionState = 'connecting';
  private config: MobileProtocolConfig;
  private compressionService: CompressionService;
  private messageBatcher: MessageBatcher;
  private messageQueue: MessageQueueService;
  private heartbeatInterval?: NodeJS.Timeout;
  private heartbeatTimeout?: NodeJS.Timeout;
  private lastHeartbeat: number = 0;
  private missedHeartbeats: number = 0;
  private metrics: PerformanceMetrics;
  private networkMonitor: NetworkMonitor;
  private sessionStartTime: number;

  constructor(
    ws: WebSocket,
    connectionId: string,
    deviceInfo: DeviceInfo,
    config: MobileProtocolConfig = DEFAULT_MOBILE_CONFIG
  ) {
    super();
    this.ws = ws;
    this.connectionId = connectionId;
    this.deviceInfo = deviceInfo;
    this.config = config;
    this.sessionStartTime = Date.now();

    // Initialize services
    this.compressionService = new CompressionService(config.compression);
    this.messageBatcher = new MessageBatcher(config.batching, this.sendBatch.bind(this));
    this.messageQueue = new MessageQueueService(
      {
        ...config.queue,
        retryAttempts: config.queue.retryPolicy?.maxAttempts || 3,
        retryDelay: config.queue.retryPolicy?.backoffMultiplier || 1000,
        ttl: config.queue.maxAge || 300000,
      },
      deviceInfo.deviceId
    );

    // Initialize metrics
    this.metrics = this.initializeMetrics();
    this.networkMonitor = this.initializeNetworkMonitor();

    this.setupWebSocketHandlers();
    this.startHeartbeat();
    this.setState('connected');

    logger.info('Enhanced WebSocket connection established', {
      connectionId: this.connectionId,
      deviceId: this.deviceInfo.deviceId,
      deviceType: this.deviceInfo.deviceType,
      platform: this.deviceInfo.platform,
    });
  }

  /**
   * Initialize performance metrics
   */
  private initializeMetrics(): PerformanceMetrics {
    return {
      messageLatency: {
        average: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      },
      throughput: {
        messagesPerSecond: 0,
        bytesPerSecond: 0,
      },
      compression: {
        ratio: 0,
        savings: 0,
      },
      battery: {
        usagePerHour: 0,
        efficiency: 0,
      },
      network: {
        requestCount: 0,
        dataUsage: 0,
        efficiency: 0,
      },
    };
  }

  /**
   * Initialize network monitor
   */
  private initializeNetworkMonitor(): NetworkMonitor {
    return {
      connectionType: 'unknown',
      isOnline: true,
      quality: 'good',
    };
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    this.ws.on('message', this.handleMessage.bind(this));
    this.ws.on('close', this.handleClose.bind(this));
    this.ws.on('error', this.handleError.bind(this));
    this.ws.on('pong', this.handlePong.bind(this));
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleMessage(data: WebSocket.Data): Promise<void> {
    try {
      const startTime = Date.now();
      let message: MobileMessage;

      // Parse message data
      if (Buffer.isBuffer(data)) {
        const messageStr = data.toString('utf8');
        message = JSON.parse(messageStr);
      } else {
        message = JSON.parse(data.toString());
      }

      // Validate message
      const validationResult = messageValidationService.validateMessage(message);
      if (!validationResult.valid) {
        logger.warn('Invalid message received', {
          connectionId: this.connectionId,
          errors: validationResult.errors,
        });
        await this.sendAck(message.id, 'failed', {
          code: 'VALIDATION_ERROR',
          message: 'Message validation failed',
          details: { errors: validationResult.errors },
        });
        return;
      }

      // Handle different message types
      await this.processMessage(message);

      // Send acknowledgment if required
      if (message.optimization.requiresAck) {
        await this.sendAck(message.id, 'processed');
      }

      // Update metrics
      const latency = Date.now() - startTime;
      this.updateLatencyMetrics(latency);
      this.metrics.network.requestCount++;

      this.emit('message', message);
    } catch (error) {
      logger.error('Error handling WebSocket message', {
        connectionId: this.connectionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Process different types of messages
   */
  private async processMessage(message: MobileMessage): Promise<void> {
    switch (message.type) {
      case 'heartbeat':
        await this.handleHeartbeat(message);
        break;
      case 'device_registration':
        await this.handleDeviceRegistration(message);
        break;
      case 'command':
        await this.handleCommand(message);
        break;
      case 'file_operation':
        await this.handleFileOperation(message);
        break;
      default:
        logger.debug('Unknown message type received', {
          connectionId: this.connectionId,
          messageType: message.type,
        });
        this.emit('unknown_message', message);
    }
  }

  /**
   * Handle heartbeat messages
   */
  private async handleHeartbeat(message: MobileMessage): Promise<void> {
    this.lastHeartbeat = Date.now();
    this.missedHeartbeats = 0;

    // Update network monitor if provided
    if (message.payload && typeof message.payload === 'object') {
      const payload = message.payload as any;
      if (payload.networkInfo) {
        this.updateNetworkMonitor(payload.networkInfo);
      }
    }

    logger.debug('Heartbeat received', {
      connectionId: this.connectionId,
      deviceId: this.deviceInfo.deviceId,
    });
  }

  /**
   * Handle device registration updates
   */
  private async handleDeviceRegistration(message: MobileMessage): Promise<void> {
    if (message.payload && typeof message.payload === 'object') {
      const payload = message.payload as any;
      if (payload.deviceInfo) {
        // Update device info
        Object.assign(this.deviceInfo, payload.deviceInfo);
        logger.info('Device info updated', {
          connectionId: this.connectionId,
          deviceId: this.deviceInfo.deviceId,
        });
      }
    }
  }

  /**
   * Handle command messages
   */
  private async handleCommand(message: MobileMessage): Promise<void> {
    logger.info('Command received', {
      connectionId: this.connectionId,
      messageId: message.id,
      command: message.payload,
    });
    this.emit('command', message);
  }

  /**
   * Handle file operation messages
   */
  private async handleFileOperation(message: MobileMessage): Promise<void> {
    logger.info('File operation received', {
      connectionId: this.connectionId,
      messageId: message.id,
      operation: message.payload,
    });
    this.emit('file_operation', message);
  }

  /**
   * Handle WebSocket close event
   */
  private handleClose(code: number, reason: Buffer): void {
    this.setState('disconnected');
    this.stopHeartbeat();

    logger.info('WebSocket connection closed', {
      connectionId: this.connectionId,
      deviceId: this.deviceInfo.deviceId,
      code,
      reason: reason.toString(),
    });

    this.emit('close', code, reason);
  }

  /**
   * Handle WebSocket error event
   */
  private handleError(error: Error): void {
    logger.error('WebSocket error', {
      connectionId: this.connectionId,
      deviceId: this.deviceInfo.deviceId,
      error: error.message,
    });

    this.emit('error', error);
  }

  /**
   * Handle WebSocket pong event
   */
  private handlePong(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = undefined as any;
    }
  }

  /**
   * Send a message through the WebSocket connection
   */
  public async sendMessage(message: MobileMessage): Promise<void> {
    if (this.state !== 'connected') {
      // Queue message if not connected
      await this.messageQueue.enqueue(message);
      return;
    }

    try {
      // Validate message before sending
      messageValidationService.validateMessageOrThrow(message);

      // Check if message should be batched
      if (this.shouldBatchMessage(message)) {
        await this.messageBatcher.addMessage(message);
        return;
      }

      // Send message directly
      await this.sendMessageDirect(message);
    } catch (error) {
      logger.error('Error sending message', {
        connectionId: this.connectionId,
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Send message directly without batching
   */
  private async sendMessageDirect(message: MobileMessage): Promise<void> {
    let messageData = JSON.stringify(message);

    // Apply compression if needed
    if (this.shouldCompressMessage(messageData)) {
      const compressionType = this.selectCompressionType();
      const compressed = await this.compressionService.compress(messageData, compressionType);
      messageData = compressed;

      // Update compression metrics
      const originalSize = Buffer.byteLength(JSON.stringify(message), 'utf8');
      const compressedSize = Buffer.byteLength(compressed, 'utf8');
      this.updateCompressionMetrics(originalSize, compressedSize);
    }

    // Send message
    this.ws.send(messageData);

    // Update metrics
    this.metrics.network.dataUsage += Buffer.byteLength(messageData, 'utf8');

    logger.debug('Message sent', {
      connectionId: this.connectionId,
      messageId: message.id,
      size: Buffer.byteLength(messageData, 'utf8'),
    });
  }

  /**
   * Send a batch of messages
   */
  private async sendBatch(batch: BatchMessage): Promise<void> {
    try {
      let batchData = JSON.stringify(batch);

      // Apply compression to batch
      if (batch.compression) {
        batchData = await this.compressionService.compress(batchData, batch.compression);
      }

      this.ws.send(batchData);

      // Update metrics
      this.metrics.network.dataUsage += Buffer.byteLength(batchData, 'utf8');

      logger.debug('Message batch sent', {
        connectionId: this.connectionId,
        batchId: batch.id,
        messageCount: batch.messages.length,
        size: Buffer.byteLength(batchData, 'utf8'),
      });
    } catch (error) {
      logger.error('Error sending message batch', {
        connectionId: this.connectionId,
        batchId: batch.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Send message acknowledgment
   */
  private async sendAck(
    messageId: string,
    status: MessageAck['status'],
    error?: MessageAck['error']
  ): Promise<void> {
    const ack: MessageAck = {
      messageId,
      status,
      timestamp: Date.now(),
      ...(error && { error }),
    };

    const ackMessage: MobileMessage = {
      id: `ack_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      protocolVersion: this.config.version,
      source: {
        deviceId: 'server',
        userId: 'system',
        deviceType: 'desktop',
        timestamp: Date.now(),
      },
      destination: {
        target: 'device',
        deviceId: this.deviceInfo.deviceId,
      },
      type: 'acknowledgment',
      payload: ack,
      optimization: {
        priority: 'high',
        requiresAck: false,
      },
    };

    await this.sendMessageDirect(ackMessage);
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeat.interval);
  }

  /**
   * Stop heartbeat mechanism
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined as any;
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = undefined as any;
    }
  }

  /**
   * Send heartbeat ping
   */
  private sendHeartbeat(): void {
    if (this.state !== 'connected') {
      return;
    }

    // Check for missed heartbeats
    if (this.missedHeartbeats >= this.config.heartbeat.maxMissed) {
      logger.warn('Too many missed heartbeats, closing connection', {
        connectionId: this.connectionId,
        missedHeartbeats: this.missedHeartbeats,
      });
      this.close();
      return;
    }

    // Send ping
    this.ws.ping();
    this.missedHeartbeats++;

    // Set timeout for pong response
    this.heartbeatTimeout = setTimeout(() => {
      logger.warn('Heartbeat timeout', {
        connectionId: this.connectionId,
        missedHeartbeats: this.missedHeartbeats,
      });
    }, this.config.heartbeat.timeout);
  }

  /**
   * Determine if message should be batched
   */
  private shouldBatchMessage(message: MobileMessage): boolean {
    if (!this.config.batching.enabled) {
      return false;
    }

    // Don't batch high priority messages
    if (this.isPriorityAboveThreshold(message.optimization.priority)) {
      return false;
    }

    return true;
  }

  /**
   * Check if message priority is above batching threshold
   */
  private isPriorityAboveThreshold(priority: MessagePriority): boolean {
    const priorityOrder: MessagePriority[] = ['low', 'normal', 'high', 'critical'];
    const messagePriorityIndex = priorityOrder.indexOf(priority);
    const thresholdIndex = priorityOrder.indexOf(this.config.batching.priorityThreshold);
    return messagePriorityIndex > thresholdIndex;
  }

  /**
   * Determine if message should be compressed
   */
  private shouldCompressMessage(messageData: string): boolean {
    if (!this.config.compression.enabled) {
      return false;
    }

    const messageSize = Buffer.byteLength(messageData, 'utf8');
    return messageSize >= this.config.compression.threshold;
  }

  /**
   * Select appropriate compression type
   */
  private selectCompressionType(): CompressionType {
    const supportedTypes = this.deviceInfo.capabilities.compression;
    const configuredTypes = this.config.compression.algorithms;

    // Find first supported type that's also configured
    for (const type of configuredTypes) {
      if (supportedTypes.includes(type)) {
        return type;
      }
    }

    return 'gzip'; // Default fallback
  }

  /**
   * Update latency metrics
   */
  private updateLatencyMetrics(latency: number): void {
    // Simple moving average for now
    this.metrics.messageLatency.average = (this.metrics.messageLatency.average + latency) / 2;

    // Update percentiles (simplified)
    this.metrics.messageLatency.p50 = latency;
    this.metrics.messageLatency.p95 = latency;
    this.metrics.messageLatency.p99 = latency;
  }

  /**
   * Update compression metrics
   */
  private updateCompressionMetrics(originalSize: number, compressedSize: number): void {
    const savings = originalSize - compressedSize;
    const ratio = compressedSize / originalSize;

    this.metrics.compression.savings += savings;
    this.metrics.compression.ratio = ratio;
  }

  /**
   * Update network monitor
   */
  private updateNetworkMonitor(networkInfo: Partial<NetworkMonitor>): void {
    Object.assign(this.networkMonitor, networkInfo);
  }

  /**
   * Set connection state
   */
  private setState(state: ConnectionState): void {
    const previousState = this.state;
    this.state = state;

    logger.debug('Connection state changed', {
      connectionId: this.connectionId,
      previousState,
      newState: state,
    });

    this.emit('state_change', state, previousState);
  }

  /**
   * Close the WebSocket connection
   */
  public close(): void {
    this.setState('disconnected');
    this.stopHeartbeat();
    this.ws.close();
  }

  /**
   * Get connection ID
   */
  public getConnectionId(): string {
    return this.connectionId;
  }

  /**
   * Get connection state
   */
  public getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get device info
   */
  public getDeviceInfo(): DeviceInfo {
    return { ...this.deviceInfo };
  }

  /**
   * Get connection metrics
   */
  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get network monitor
   */
  public getNetworkMonitor(): NetworkMonitor {
    return { ...this.networkMonitor };
  }

  /**
   * Get connection manager info
   */
  public getConnectionManager(): ConnectionManager {
    return {
      state: this.state,
      deviceInfo: this.deviceInfo,
      reconnect: {
        maxAttempts: 5,
        backoffStrategy: 'exponential',
        baseDelay: 1000,
        maxDelay: 30000,
        jitter: true,
        timeout: 10000,
      },
      networkMonitor: this.networkMonitor,
      lastHeartbeat: this.lastHeartbeat,
      connectionId: this.connectionId,
      sessionStartTime: this.sessionStartTime,
      metrics: {
        messagesReceived: this.metrics.network.requestCount,
        messagesSent: 0, // TODO: Track sent messages
        reconnectCount: 0, // TODO: Track reconnections
        totalUptime: Date.now() - this.sessionStartTime,
        averageLatency: this.metrics.messageLatency.average,
      },
    };
  }
}

/**
 * WebSocket Server Manager for handling multiple connections
 */
export class WebSocketServerManager extends EventEmitter {
  private server: WebSocket.Server;
  private connections: Map<string, EnhancedWebSocketConnection> = new Map();
  private config: MobileProtocolConfig;

  constructor(server: WebSocket.Server, config: MobileProtocolConfig = DEFAULT_MOBILE_CONFIG) {
    super();
    this.server = server;
    this.config = config;

    this.setupServerHandlers();
    logger.info('WebSocket Server Manager initialized');
  }

  /**
   * Setup WebSocket server event handlers
   */
  private setupServerHandlers(): void {
    this.server.on('connection', this.handleConnection.bind(this));
    this.server.on('error', this.handleServerError.bind(this));
  }

  /**
   * Handle new WebSocket connections
   */
  private async handleConnection(ws: WebSocket, request: any): Promise<void> {
    try {
      const connectionId = this.generateConnectionId();

      // Extract device info from connection request
      const deviceInfo = await this.extractDeviceInfo(request);

      // Create enhanced connection
      const connection = new EnhancedWebSocketConnection(ws, connectionId, deviceInfo, this.config);

      // Store connection
      this.connections.set(connectionId, connection);

      // Setup connection event handlers
      this.setupConnectionHandlers(connection);

      logger.info('New WebSocket connection established', {
        connectionId,
        deviceId: deviceInfo.deviceId,
        totalConnections: this.connections.size,
      });

      this.emit('connection', connection);
    } catch (error) {
      logger.error('Error handling WebSocket connection', {
        error: error instanceof Error ? error.message : String(error),
      });
      ws.close();
    }
  }

  /**
   * Setup event handlers for a connection
   */
  private setupConnectionHandlers(connection: EnhancedWebSocketConnection): void {
    connection.on('close', () => {
      this.connections.delete(connection.getConnectionId());
      logger.info('WebSocket connection removed', {
        connectionId: connection.getConnectionId(),
        remainingConnections: this.connections.size,
      });
    });

    connection.on('error', (error) => {
      logger.error('WebSocket connection error', {
        connectionId: connection.getConnectionId(),
        error: error.message,
      });
    });

    // Forward connection events
    connection.on('message', (message) => this.emit('message', connection, message));
    connection.on('command', (message) => this.emit('command', connection, message));
    connection.on('file_operation', (message) => this.emit('file_operation', connection, message));
  }

  /**
   * Handle server errors
   */
  private handleServerError(error: Error): void {
    logger.error('WebSocket server error', { error: error.message });
    this.emit('error', error);
  }

  /**
   * Extract device info from connection request
   */
  private async extractDeviceInfo(request: any): Promise<DeviceInfo> {
    // TODO: Extract from headers, query params, or initial handshake
    // For now, return a default device info
    return {
      deviceId: `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: 'anonymous',
      deviceType: 'mobile',
      platform: 'unknown',
      version: '1.0.0',
      capabilities: {
        compression: ['gzip'],
        maxMessageSize: 1024 * 1024, // 1MB
        supportsBatching: true,
        supportsOfflineQueue: true,
        batteryOptimized: true,
      },
    };
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get connection by ID
   */
  public getConnection(connectionId: string): EnhancedWebSocketConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get connection by device ID
   */
  public getConnectionByDeviceId(deviceId: string): EnhancedWebSocketConnection | undefined {
    for (const connection of this.connections.values()) {
      if (connection.getDeviceInfo().deviceId === deviceId) {
        return connection;
      }
    }
    return undefined;
  }

  /**
   * Get all connections
   */
  public getConnections(): EnhancedWebSocketConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Broadcast message to all connections
   */
  public async broadcast(message: MobileMessage): Promise<void> {
    const promises = Array.from(this.connections.values()).map((connection) =>
      connection.sendMessage(message).catch((error) => {
        logger.error('Error broadcasting message', {
          connectionId: connection.getConnectionId(),
          error: error instanceof Error ? error.message : String(error),
        });
      })
    );

    await Promise.allSettled(promises);
  }

  /**
   * Close all connections
   */
  public closeAll(): void {
    for (const connection of this.connections.values()) {
      connection.close();
    }
    this.connections.clear();
  }

  /**
   * Get server statistics
   */
  public getStats(): {
    totalConnections: number;
    connectionsByType: Record<string, number>;
    connectionsByPlatform: Record<string, number>;
  } {
    const connectionsByType: Record<string, number> = {};
    const connectionsByPlatform: Record<string, number> = {};

    for (const connection of this.connections.values()) {
      const deviceInfo = connection.getDeviceInfo();

      connectionsByType[deviceInfo.deviceType] =
        (connectionsByType[deviceInfo.deviceType] || 0) + 1;

      connectionsByPlatform[deviceInfo.platform] =
        (connectionsByPlatform[deviceInfo.platform] || 0) + 1;
    }

    return {
      totalConnections: this.connections.size,
      connectionsByType,
      connectionsByPlatform,
    };
  }
}
