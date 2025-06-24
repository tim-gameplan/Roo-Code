/**
 * RCCS WebSocket Server - Core Implementation for TASK-007.3.1
 *
 * This is the main WebSocket server for the Roo Cloud Coordination Service (RCCS)
 * that handles cross-device communication and coordination.
 */

import WebSocket, { WebSocketServer } from 'ws';
import { EventEmitter } from 'events';
import { IncomingMessage } from 'http';
import { logger } from '@/utils/logger';
import {
  DeviceInfo,
  Session,
  CloudMessage,
  ConnectionInfo,
  RCCSConfig,
  HealthMetrics,
  MessageRouteResult,
  RCCSEvents,
  AuthenticationError,
  DeviceNotFoundError,
  SessionExpiredError,
  MessageDeliveryError,
  CloudMessageType,
  MessagePriority,
} from '@/types/rccs';
import { MessageRouter } from './message-router';
import { SessionManager } from './session-manager';
import { DeviceRegistry } from './device-registry';
import { HealthMonitor } from './health-monitor';

/**
 * Main RCCS WebSocket Server class
 * Handles 1000+ concurrent connections and routes messages between devices
 */
export class RCCSWebSocketServer extends EventEmitter {
  private wss: WebSocketServer;
  private connections: Map<string, ConnectionInfo> = new Map();
  private messageRouter: MessageRouter;
  private sessionManager: SessionManager;
  private deviceRegistry: DeviceRegistry;
  private healthMonitor: HealthMonitor;
  private config: RCCSConfig;
  private isRunning: boolean = false;
  private startTime: Date = new Date();

  constructor(config: RCCSConfig) {
    super();
    this.config = config;

    // Initialize core services
    this.messageRouter = new MessageRouter(this);
    this.sessionManager = new SessionManager(config);
    this.deviceRegistry = new DeviceRegistry(config);
    this.healthMonitor = new HealthMonitor(this, config);

    // Create WebSocket server
    this.wss = new WebSocketServer({
      port: config.port,
      maxPayload: 16 * 1024 * 1024, // 16MB max payload
      perMessageDeflate: true,
      clientTracking: true,
    });

    this.setupServerHandlers();

    logger.info('RCCS WebSocket Server initialized', {
      port: config.port,
      maxConnections: config.maxConnections,
    });
  }

  /**
   * Setup WebSocket server event handlers
   */
  private setupServerHandlers(): void {
    this.wss.on('connection', this.handleConnection.bind(this));
    this.wss.on('error', this.handleServerError.bind(this));
    this.wss.on('listening', this.handleServerListening.bind(this));
    this.wss.on('close', this.handleServerClose.bind(this));
  }

  /**
   * Handle new WebSocket connections
   */
  private async handleConnection(ws: WebSocket, request: IncomingMessage): Promise<void> {
    const connectionId = this.generateConnectionId();

    try {
      // Check connection limits
      if (this.connections.size >= this.config.maxConnections) {
        logger.warn('Connection limit reached, rejecting new connection', {
          currentConnections: this.connections.size,
          maxConnections: this.config.maxConnections,
        });
        ws.close(1013, 'Server overloaded');
        return;
      }

      // Extract initial device info from connection request
      const deviceInfo = await this.extractDeviceInfoFromRequest(request);

      // Create connection info
      const connectionInfo: ConnectionInfo = {
        id: connectionId,
        deviceId: deviceInfo.id,
        userId: deviceInfo.userId,
        sessionId: '', // Will be set after authentication
        connectedAt: new Date(),
        lastPing: new Date(),
        isAuthenticated: false,
        socket: ws,
      };

      // Store connection
      this.connections.set(connectionId, connectionInfo);

      // Setup connection handlers
      this.setupConnectionHandlers(ws, connectionInfo);

      // Start authentication process
      await this.initiateAuthentication(connectionInfo, deviceInfo);

      logger.info('New WebSocket connection established', {
        connectionId,
        deviceId: deviceInfo.id,
        userId: deviceInfo.userId,
        totalConnections: this.connections.size,
      });

      this.emit('device:connected', deviceInfo, connectionInfo);
    } catch (error) {
      logger.error('Error handling new connection', {
        connectionId,
        error: error instanceof Error ? error.message : String(error),
      });

      this.connections.delete(connectionId);
      ws.close(1011, 'Authentication failed');
    }
  }

  /**
   * Setup event handlers for a specific connection
   */
  private setupConnectionHandlers(ws: WebSocket, connectionInfo: ConnectionInfo): void {
    ws.on('message', (data) => this.handleMessage(connectionInfo, data));
    ws.on('close', (code, reason) => this.handleConnectionClose(connectionInfo, code, reason));
    ws.on('error', (error) => this.handleConnectionError(connectionInfo, error));
    ws.on('pong', () => this.handlePong(connectionInfo));

    // Start heartbeat for this connection
    this.startConnectionHeartbeat(connectionInfo);
  }

  /**
   * Handle incoming messages from connections
   */
  private async handleMessage(connectionInfo: ConnectionInfo, data: WebSocket.Data): Promise<void> {
    try {
      const startTime = Date.now();

      // Parse message
      const messageStr = data.toString();
      const message: CloudMessage = JSON.parse(messageStr);

      // Validate message structure
      if (!this.isValidCloudMessage(message)) {
        logger.warn('Invalid message format received', {
          connectionId: connectionInfo.id,
          deviceId: connectionInfo.deviceId,
        });
        return;
      }

      // Update connection activity
      connectionInfo.lastPing = new Date();

      // Handle authentication messages
      if (message.type === CloudMessageType.DEVICE_REGISTER && !connectionInfo.isAuthenticated) {
        await this.handleDeviceRegistration(connectionInfo, message);
        return;
      }

      // Require authentication for all other messages
      if (!connectionInfo.isAuthenticated) {
        throw new AuthenticationError('Connection not authenticated');
      }

      // Route message
      const routeResult = await this.messageRouter.routeMessage(connectionInfo.id, message);

      // Send acknowledgment if required
      if (message.requiresAck) {
        await this.sendAcknowledgment(connectionInfo, message.id, routeResult);
      }

      // Update metrics
      const latency = Date.now() - startTime;
      this.healthMonitor.recordMessageLatency(latency);
      this.healthMonitor.incrementMessageCount();

      this.emit('message:received', message, connectionInfo);
    } catch (error) {
      logger.error('Error handling message', {
        connectionId: connectionInfo.id,
        deviceId: connectionInfo.deviceId,
        error: error instanceof Error ? error.message : String(error),
      });

      this.emit('error', error, { connectionInfo });
    }
  }

  /**
   * Handle device registration and authentication
   */
  private async handleDeviceRegistration(
    connectionInfo: ConnectionInfo,
    message: CloudMessage
  ): Promise<void> {
    try {
      const deviceInfo = message.payload as DeviceInfo;

      // Validate device registration
      const isValid = await this.deviceRegistry.validateDeviceRegistration(deviceInfo);
      if (!isValid) {
        throw new AuthenticationError('Invalid device registration');
      }

      // Create or update session
      const session = await this.sessionManager.createSession(deviceInfo);

      // Update connection info
      connectionInfo.sessionId = session.id;
      connectionInfo.isAuthenticated = true;
      connectionInfo.deviceId = deviceInfo.id;
      connectionInfo.userId = deviceInfo.userId;

      // Register device
      await this.deviceRegistry.registerDevice(deviceInfo);

      // Send registration success response
      const response: CloudMessage = {
        id: this.generateMessageId(),
        type: CloudMessageType.ACK,
        fromDeviceId: 'server',
        toDeviceId: deviceInfo.id,
        userId: deviceInfo.userId,
        payload: {
          status: 'success',
          sessionId: session.id,
          serverTime: new Date().toISOString(),
        },
        timestamp: new Date(),
        priority: MessagePriority.HIGH,
        requiresAck: false,
      };

      await this.sendMessage(connectionInfo, response);

      logger.info('Device registered successfully', {
        connectionId: connectionInfo.id,
        deviceId: deviceInfo.id,
        userId: deviceInfo.userId,
        sessionId: session.id,
      });

      this.emit('device:registered', deviceInfo);
    } catch (error) {
      logger.error('Device registration failed', {
        connectionId: connectionInfo.id,
        error: error instanceof Error ? error.message : String(error),
      });

      // Send registration failure response
      const errorResponse: CloudMessage = {
        id: this.generateMessageId(),
        type: CloudMessageType.ERROR,
        fromDeviceId: 'server',
        toDeviceId: connectionInfo.deviceId,
        userId: connectionInfo.userId,
        payload: {
          error: 'Registration failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date(),
        priority: MessagePriority.HIGH,
        requiresAck: false,
      };

      await this.sendMessage(connectionInfo, errorResponse);
      connectionInfo.socket.close(1008, 'Registration failed');
    }
  }

  /**
   * Handle connection close
   */
  private handleConnectionClose(
    connectionInfo: ConnectionInfo,
    code: number,
    reason: Buffer
  ): void {
    logger.info('WebSocket connection closed', {
      connectionId: connectionInfo.id,
      deviceId: connectionInfo.deviceId,
      code,
      reason: reason.toString(),
    });

    // Clean up connection
    this.connections.delete(connectionInfo.id);

    // Update device status
    if (connectionInfo.isAuthenticated) {
      this.deviceRegistry.updateDeviceStatus(connectionInfo.deviceId, 'offline');
      this.emit('device:disconnected', connectionInfo.deviceId, reason.toString());
    }

    // Clean up session if needed
    if (connectionInfo.sessionId) {
      this.sessionManager.markSessionInactive(connectionInfo.sessionId);
    }
  }

  /**
   * Handle connection errors
   */
  private handleConnectionError(connectionInfo: ConnectionInfo, error: Error): void {
    logger.error('WebSocket connection error', {
      connectionId: connectionInfo.id,
      deviceId: connectionInfo.deviceId,
      error: error.message,
    });

    this.emit('error', error, { connectionInfo });
  }

  /**
   * Handle pong responses
   */
  private handlePong(connectionInfo: ConnectionInfo): void {
    connectionInfo.lastPing = new Date();
  }

  /**
   * Start heartbeat for a connection
   */
  private startConnectionHeartbeat(connectionInfo: ConnectionInfo): void {
    const heartbeatInterval = setInterval(() => {
      if (connectionInfo.socket.readyState === WebSocket.OPEN) {
        const timeSinceLastPing = Date.now() - connectionInfo.lastPing.getTime();

        if (timeSinceLastPing > this.config.sessionTimeout) {
          logger.warn('Connection heartbeat timeout', {
            connectionId: connectionInfo.id,
            deviceId: connectionInfo.deviceId,
            timeSinceLastPing,
          });

          connectionInfo.socket.close(1001, 'Heartbeat timeout');
          clearInterval(heartbeatInterval);
        } else {
          connectionInfo.socket.ping();
        }
      } else {
        clearInterval(heartbeatInterval);
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Send message to a specific connection
   */
  public async sendMessage(connectionInfo: ConnectionInfo, message: CloudMessage): Promise<void> {
    try {
      if (connectionInfo.socket.readyState !== WebSocket.OPEN) {
        throw new MessageDeliveryError(message.id, 'Connection not open');
      }

      const messageStr = JSON.stringify(message);
      connectionInfo.socket.send(messageStr);

      logger.debug('Message sent to device', {
        connectionId: connectionInfo.id,
        deviceId: connectionInfo.deviceId,
        messageId: message.id,
        messageType: message.type,
      });
    } catch (error) {
      logger.error('Failed to send message', {
        connectionId: connectionInfo.id,
        deviceId: connectionInfo.deviceId,
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new MessageDeliveryError(
        message.id,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Send acknowledgment for a message
   */
  private async sendAcknowledgment(
    connectionInfo: ConnectionInfo,
    originalMessageId: string,
    routeResult: MessageRouteResult
  ): Promise<void> {
    const ackMessage: CloudMessage = {
      id: this.generateMessageId(),
      type: CloudMessageType.ACK,
      fromDeviceId: 'server',
      toDeviceId: connectionInfo.deviceId,
      userId: connectionInfo.userId,
      payload: {
        originalMessageId,
        status: routeResult.success ? 'delivered' : 'failed',
        error: routeResult.error,
        deliveredAt: routeResult.deliveredAt,
      },
      timestamp: new Date(),
      priority: MessagePriority.HIGH,
      requiresAck: false,
    };

    await this.sendMessage(connectionInfo, ackMessage);
  }

  /**
   * Extract device info from connection request
   */
  private async extractDeviceInfoFromRequest(request: IncomingMessage): Promise<DeviceInfo> {
    // Extract from headers or query parameters
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const deviceId = url.searchParams.get('deviceId') || this.generateDeviceId();
    const userId = url.searchParams.get('userId') || 'anonymous';
    const deviceType = (url.searchParams.get('deviceType') as DeviceInfo['type']) || 'mobile';
    const platform = url.searchParams.get('platform') || 'unknown';
    const version = url.searchParams.get('version') || '1.0.0';

    return {
      id: deviceId,
      userId,
      type: deviceType,
      platform,
      version,
      capabilities: {
        supportsFileSync: true,
        supportsVoiceCommands: false,
        supportsVideoStreaming: false,
        supportsNotifications: true,
        maxFileSize: 10 * 1024 * 1024, // 10MB
        supportedFormats: ['json', 'text'],
      },
      lastSeen: new Date(),
      status: 'online',
    };
  }

  /**
   * Initiate authentication process
   */
  private async initiateAuthentication(
    connectionInfo: ConnectionInfo,
    deviceInfo: DeviceInfo
  ): Promise<void> {
    // Send authentication challenge
    const authChallenge: CloudMessage = {
      id: this.generateMessageId(),
      type: CloudMessageType.DEVICE_REGISTER,
      fromDeviceId: 'server',
      toDeviceId: deviceInfo.id,
      userId: deviceInfo.userId,
      payload: {
        challenge: 'Please register your device',
        serverTime: new Date().toISOString(),
      },
      timestamp: new Date(),
      priority: MessagePriority.HIGH,
      requiresAck: false,
    };

    await this.sendMessage(connectionInfo, authChallenge);
  }

  /**
   * Handle server error events
   */
  private handleServerError(error: Error): void {
    logger.error('WebSocket server error', { error: error.message });
    this.emit('error', error);
  }

  /**
   * Handle server listening event
   */
  private handleServerListening(): void {
    this.isRunning = true;
    logger.info('RCCS WebSocket Server listening', { port: this.config.port });
  }

  /**
   * Handle server close event
   */
  private handleServerClose(): void {
    this.isRunning = false;
    logger.info('RCCS WebSocket Server closed');
  }

  /**
   * Validate CloudMessage structure
   */
  private isValidCloudMessage(message: any): message is CloudMessage {
    return (
      (message &&
        typeof message.id === 'string' &&
        typeof message.type === 'string' &&
        typeof message.fromDeviceId === 'string' &&
        typeof message.userId === 'string' &&
        message.payload !== undefined &&
        message.timestamp instanceof Date) ||
      (typeof message.timestamp === 'string' &&
        typeof message.priority === 'number' &&
        typeof message.requiresAck === 'boolean')
    );
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique device ID
   */
  private generateDeviceId(): string {
    return `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public API methods

  /**
   * Start the RCCS server
   */
  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss.once('listening', () => {
        this.isRunning = true;
        logger.info('RCCS WebSocket Server started successfully', { port: this.config.port });
        resolve();
      });

      this.wss.once('error', (error) => {
        logger.error('Failed to start RCCS WebSocket Server', { error: error.message });
        reject(error);
      });
    });
  }

  /**
   * Stop the RCCS server
   */
  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      // Close all connections
      for (const connectionInfo of this.connections.values()) {
        connectionInfo.socket.close(1001, 'Server shutting down');
      }
      this.connections.clear();

      // Close server
      this.wss.close(() => {
        this.isRunning = false;
        logger.info('RCCS WebSocket Server stopped');
        resolve();
      });
    });
  }

  /**
   * Get connection by device ID
   */
  public getConnectionByDeviceId(deviceId: string): ConnectionInfo | undefined {
    for (const connection of this.connections.values()) {
      if (connection.deviceId === deviceId) {
        return connection;
      }
    }
    return undefined;
  }

  /**
   * Get all active connections
   */
  public getActiveConnections(): ConnectionInfo[] {
    return Array.from(this.connections.values()).filter((conn) => conn.isAuthenticated);
  }

  /**
   * Send message to specific device
   */
  public async sendMessageToDevice(
    deviceId: string,
    message: CloudMessage
  ): Promise<MessageRouteResult> {
    const connection = this.getConnectionByDeviceId(deviceId);
    if (!connection) {
      return {
        success: false,
        messageId: message.id,
        error: 'Device not connected',
      };
    }

    try {
      await this.sendMessage(connection, message);
      return {
        success: true,
        messageId: message.id,
        deliveredAt: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        messageId: message.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Broadcast message to all connected devices
   */
  public async broadcastMessage(message: CloudMessage): Promise<MessageRouteResult[]> {
    const results: MessageRouteResult[] = [];
    const connections = this.getActiveConnections();

    for (const connection of connections) {
      try {
        await this.sendMessage(connection, message);
        results.push({
          success: true,
          messageId: message.id,
          deliveredAt: new Date(),
        });
      } catch (error) {
        results.push({
          success: false,
          messageId: message.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Get server health metrics
   */
  public getHealthMetrics(): HealthMetrics {
    return this.healthMonitor.getMetrics();
  }

  /**
   * Get server status
   */
  public getServerStatus(): {
    isRunning: boolean;
    uptime: number;
    activeConnections: number;
    totalConnections: number;
    port: number;
  } {
    return {
      isRunning: this.isRunning,
      uptime: Date.now() - this.startTime.getTime(),
      activeConnections: this.getActiveConnections().length,
      totalConnections: this.connections.size,
      port: this.config.port,
    };
  }
}
