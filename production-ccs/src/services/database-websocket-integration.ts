/**
 * Database-WebSocket Integration Service
 *
 * TASK-007.2.2 - WebSocket Real-time Integration
 *
 * This service bridges the existing WebSocket infrastructure with database operations
 * to enable real-time messaging with persistence, presence management, and cross-device
 * synchronization.
 *
 * Key Features:
 * - Real-time message broadcasting on database changes
 * - Enhanced presence management with database persistence
 * - Message delivery confirmations and read receipts
 * - Cross-device message synchronization
 * - Typing indicators with conversation context
 * - Conflict resolution for concurrent operations
 *
 * @fileoverview Database-WebSocket Integration Service
 * @version 1.0.0
 * @created 2025-06-23
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { ConversationService } from './conversation';
import { WebSocketServerManager, EnhancedWebSocketConnection } from './websocket-manager';
import { EventBroadcastingService } from './event-broadcaster';
import { PresenceManagerService } from './presence-manager';
import { TypingIndicatorsService } from './typing-indicators';
import { RealTimeEvent, EventType, EventPriority } from '../types';
import {
  Message,
  MessageChange,
  ChangeType,
  SyncStatus,
  CreateMessageRequest,
  UpdateMessageRequest,
} from '../types/conversation';
import { MobileMessage } from '../types/mobile';

/**
 * Real-time message event payload
 */
export interface RealTimeMessageEvent {
  messageId: string;
  conversationId: string;
  userId: string;
  deviceId: string;
  messageType: string;
  content: Record<string, any>;
  metadata: Record<string, any>;
  timestamp: Date;
  changeType: 'create' | 'update' | 'delete';
  parentMessageId?: string;
}

/**
 * Real-time presence event payload
 */
export interface RealTimePresenceEvent {
  userId: string;
  deviceId: string;
  conversationId: string;
  status: 'online' | 'offline' | 'away' | 'typing';
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Message delivery confirmation
 */
export interface MessageDeliveryConfirmation {
  messageId: string;
  userId: string;
  deviceId: string;
  status: 'delivered' | 'read' | 'failed';
  timestamp: Date;
  error?: string;
}

/**
 * Cross-device sync event
 */
export interface CrossDeviceSyncEvent {
  userId: string;
  conversationId: string;
  lastSyncTimestamp: Date;
  changes: MessageChange[];
  conflictResolution?: {
    strategy: 'last_write_wins' | 'merge' | 'manual';
    resolvedAt: Date;
    resolvedBy: string;
  };
}

/**
 * Database-WebSocket Integration Configuration
 */
export interface DatabaseWebSocketConfig {
  // Real-time messaging
  messaging: {
    enableRealTimeSync: boolean;
    syncBatchSize: number;
    syncInterval: number;
    conflictResolutionStrategy: 'last_write_wins' | 'merge' | 'manual';
    maxRetryAttempts: number;
  };

  // Presence management
  presence: {
    enableDatabasePersistence: boolean;
    presenceTimeout: number;
    heartbeatInterval: number;
    cleanupInterval: number;
  };

  // Performance optimization
  performance: {
    enableMessageBatching: boolean;
    batchSize: number;
    batchTimeout: number;
    enableCompression: boolean;
    compressionThreshold: number;
  };

  // Delivery tracking
  delivery: {
    enableDeliveryConfirmations: boolean;
    enableReadReceipts: boolean;
    deliveryTimeout: number;
    maxDeliveryAttempts: number;
  };
}

/**
 * Default configuration
 */
export const DEFAULT_DATABASE_WEBSOCKET_CONFIG: DatabaseWebSocketConfig = {
  messaging: {
    enableRealTimeSync: true,
    syncBatchSize: 50,
    syncInterval: 1000,
    conflictResolutionStrategy: 'last_write_wins',
    maxRetryAttempts: 3,
  },
  presence: {
    enableDatabasePersistence: true,
    presenceTimeout: 30000,
    heartbeatInterval: 10000,
    cleanupInterval: 60000,
  },
  performance: {
    enableMessageBatching: true,
    batchSize: 10,
    batchTimeout: 100,
    enableCompression: true,
    compressionThreshold: 1024,
  },
  delivery: {
    enableDeliveryConfirmations: true,
    enableReadReceipts: true,
    deliveryTimeout: 30000,
    maxDeliveryAttempts: 3,
  },
};

/**
 * Database-WebSocket Integration Service
 */
export class DatabaseWebSocketIntegrationService extends EventEmitter {
  private pool: Pool;
  private conversationService: ConversationService;
  private wsManager: WebSocketServerManager;
  private eventBroadcaster: EventBroadcastingService;
  private presenceManager: PresenceManagerService;
  private typingIndicators: TypingIndicatorsService;
  private config: DatabaseWebSocketConfig;
  private isRunning = false;

  // Message delivery tracking
  private pendingDeliveries = new Map<string, MessageDeliveryConfirmation[]>();
  private deliveryTimeouts = new Map<string, NodeJS.Timeout>();

  // Sync state tracking
  private lastSyncTimestamps = new Map<string, Date>();
  private syncIntervals = new Map<string, NodeJS.Timeout>();

  // Performance metrics
  private metrics = {
    messagesProcessed: 0,
    deliveryConfirmations: 0,
    presenceUpdates: 0,
    syncOperations: 0,
    conflictsResolved: 0,
    averageLatency: 0,
    errorCount: 0,
  };

  constructor(
    pool: Pool,
    conversationService: ConversationService,
    wsManager: WebSocketServerManager,
    eventBroadcaster: EventBroadcastingService,
    presenceManager: PresenceManagerService,
    typingIndicators: TypingIndicatorsService,
    config: DatabaseWebSocketConfig = DEFAULT_DATABASE_WEBSOCKET_CONFIG
  ) {
    super();
    this.pool = pool;
    this.conversationService = conversationService;
    this.wsManager = wsManager;
    this.eventBroadcaster = eventBroadcaster;
    this.presenceManager = presenceManager;
    this.typingIndicators = typingIndicators;
    this.config = config;

    this.setupEventHandlers();
  }

  /**
   * Start the integration service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Database-WebSocket Integration Service is already running');
    }

    logger.info('Starting Database-WebSocket Integration Service', {
      config: this.config,
    });

    // Start event broadcaster if not already running
    await this.eventBroadcaster.start();

    // Setup database change listeners
    await this.setupDatabaseChangeListeners();

    // Start presence cleanup
    this.startPresenceCleanup();

    this.isRunning = true;
    this.emit('service_started');

    logger.info('Database-WebSocket Integration Service started successfully');
  }

  /**
   * Stop the integration service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping Database-WebSocket Integration Service');

    // Clear all intervals and timeouts
    for (const timeout of this.deliveryTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.deliveryTimeouts.clear();

    for (const interval of this.syncIntervals.values()) {
      clearInterval(interval);
    }
    this.syncIntervals.clear();

    // Stop event broadcaster
    await this.eventBroadcaster.stop();

    this.isRunning = false;
    this.emit('service_stopped');

    logger.info('Database-WebSocket Integration Service stopped');
  }

  /**
   * Handle real-time message creation
   */
  async handleMessageCreated(
    userId: string,
    request: CreateMessageRequest,
    deviceId?: string
  ): Promise<Message> {
    const startTime = Date.now();

    try {
      // Create message in database
      const result = await this.conversationService.createMessage(userId, request, deviceId);

      if (!result.success || !result.message) {
        throw new Error(result.error || 'Failed to create message');
      }

      const message = result.message;

      // Broadcast real-time event
      await this.broadcastMessageEvent(message, 'create', deviceId);

      // Track delivery if enabled
      if (this.config.delivery.enableDeliveryConfirmations) {
        await this.trackMessageDelivery(message, userId, deviceId);
      }

      // Update metrics
      this.metrics.messagesProcessed++;
      this.updateLatencyMetrics(Date.now() - startTime);

      logger.info('Real-time message created successfully', {
        messageId: message.id,
        conversationId: message.conversation_id,
        userId,
        deviceId,
      });

      return message;
    } catch (error) {
      this.metrics.errorCount++;
      logger.error('Failed to handle real-time message creation', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        request,
        deviceId,
      });
      throw error;
    }
  }

  /**
   * Handle real-time message updates
   */
  async handleMessageUpdated(
    userId: string,
    request: UpdateMessageRequest,
    deviceId?: string
  ): Promise<Message> {
    const startTime = Date.now();

    try {
      // Update message in database
      const result = await this.conversationService.updateMessage(userId, request, deviceId);

      if (!result.success || !result.message) {
        throw new Error(result.error || 'Failed to update message');
      }

      const message = result.message;

      // Broadcast real-time event
      await this.broadcastMessageEvent(message, 'update', deviceId);

      // Update metrics
      this.metrics.messagesProcessed++;
      this.updateLatencyMetrics(Date.now() - startTime);

      logger.info('Real-time message updated successfully', {
        messageId: message.id,
        conversationId: message.conversation_id,
        userId,
        deviceId,
      });

      return message;
    } catch (error) {
      this.metrics.errorCount++;
      logger.error('Failed to handle real-time message update', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        request,
        deviceId,
      });
      throw error;
    }
  }

  /**
   * Handle presence updates with database persistence
   */
  async handlePresenceUpdate(
    userId: string,
    deviceId: string,
    status: 'online' | 'offline' | 'away' | 'busy',
    conversationId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      // Update presence in memory using the correct method signature
      this.presenceManager.updateDevicePresence(
        deviceId,
        userId,
        status,
        'mobile', // deviceType - defaulting to mobile
        metadata
      );

      // Persist to database if enabled
      if (this.config.presence.enableDatabasePersistence) {
        await this.persistPresenceToDatabase(userId, deviceId, status, conversationId, metadata);
      }

      // Broadcast presence event (convert status for the event interface)
      await this.broadcastPresenceEvent({
        userId,
        deviceId,
        conversationId: conversationId || '',
        status: status === 'busy' ? 'typing' : status,
        timestamp: new Date(),
        metadata: metadata || {},
      });

      this.metrics.presenceUpdates++;

      logger.debug('Presence updated successfully', {
        userId,
        deviceId,
        status,
        conversationId,
      });
    } catch (error) {
      this.metrics.errorCount++;
      logger.error('Failed to handle presence update', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        deviceId,
        status,
        conversationId,
      });
      throw error;
    }
  }

  /**
   * Handle typing indicators with conversation context
   */
  async handleTypingIndicator(
    userId: string,
    deviceId: string,
    conversationId: string,
    isTyping: boolean
  ): Promise<void> {
    try {
      // Update typing indicator using the correct method
      await this.typingIndicators.processTypingEvent({
        userId,
        deviceId,
        sessionId: conversationId,
        isTyping,
        timestamp: Date.now(),
      });

      // Broadcast typing event
      const event: RealTimeEvent = {
        id: this.generateEventId(),
        type: isTyping ? EventType.TYPING_STARTED : EventType.TYPING_STOPPED,
        timestamp: Date.now(),
        version: '1.0.0',
        source: { userId, deviceId },
        payload: {
          conversationId,
          isTyping,
        },
        metadata: {
          source: 'database_websocket_integration',
        },
        priority: EventPriority.HIGH,
        requiresAck: false,
        permissions: {
          canRead: true,
          readScopes: ['conversation'],
          canPublish: true,
          publishScopes: ['conversation'],
          canManageSubscriptions: false,
          canViewMetrics: false,
          canReplayEvents: false,
        },
      };

      await this.eventBroadcaster.publishEvent(event);

      logger.debug('Typing indicator handled successfully', {
        userId,
        deviceId,
        conversationId,
        isTyping,
      });
    } catch (error) {
      this.metrics.errorCount++;
      logger.error('Failed to handle typing indicator', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        deviceId,
        conversationId,
        isTyping,
      });
      throw error;
    }
  }

  /**
   * Handle cross-device synchronization
   */
  async handleCrossDeviceSync(
    userId: string,
    conversationId: string,
    deviceId: string,
    lastSyncTimestamp?: Date
  ): Promise<CrossDeviceSyncEvent> {
    try {
      const syncKey = `${userId}:${conversationId}`;
      const lastSync = lastSyncTimestamp || this.lastSyncTimestamps.get(syncKey) || new Date(0);

      // Get changes since last sync
      const changes = await this.getMessageChangesSince(conversationId, lastSync);

      // Apply conflict resolution if needed
      const resolvedChanges = await this.resolveConflicts(changes);

      // Update last sync timestamp
      const currentTime = new Date();
      this.lastSyncTimestamps.set(syncKey, currentTime);

      // Create sync event
      const syncEvent: CrossDeviceSyncEvent = {
        userId,
        conversationId,
        lastSyncTimestamp: currentTime,
        changes: resolvedChanges,
      };

      // Broadcast sync event to user's devices
      await this.broadcastSyncEvent(syncEvent, userId);

      this.metrics.syncOperations++;

      logger.info('Cross-device sync completed', {
        userId,
        conversationId,
        deviceId,
        changesCount: resolvedChanges.length,
      });

      return syncEvent;
    } catch (error) {
      this.metrics.errorCount++;
      logger.error('Failed to handle cross-device sync', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        conversationId,
        deviceId,
      });
      throw error;
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // WebSocket connection events
    this.wsManager.on('connection', (connection: EnhancedWebSocketConnection) => {
      this.handleWebSocketConnection(connection);
    });

    this.wsManager.on('disconnection', (connection: EnhancedWebSocketConnection) => {
      this.handleWebSocketDisconnection(connection);
    });

    // Message events
    this.wsManager.on(
      'message',
      (connection: EnhancedWebSocketConnection, message: MobileMessage) => {
        this.handleWebSocketMessage(connection, message);
      }
    );

    // Presence events
    this.presenceManager.on('userPresenceUpdated', (presence) => {
      this.handlePresenceChange(presence);
    });

    // Typing events
    this.typingIndicators.on('typingStarted', (event) => {
      this.handleTypingEvent(event, true);
    });

    this.typingIndicators.on('typingStopped', (event) => {
      this.handleTypingEvent(event, false);
    });
  }

  /**
   * Setup database change listeners
   */
  private async setupDatabaseChangeListeners(): Promise<void> {
    // Listen for message changes
    const client = await this.pool.connect();

    try {
      await client.query('LISTEN message_changes');
      await client.query('LISTEN conversation_changes');
      await client.query('LISTEN presence_changes');

      client.on('notification', (msg) => {
        this.handleDatabaseNotification(msg);
      });

      logger.info('Database change listeners setup successfully');
    } catch (error) {
      client.release();
      throw error;
    }
  }

  /**
   * Start presence cleanup
   */
  private startPresenceCleanup(): void {
    setInterval(() => {
      this.cleanupStalePresence();
    }, this.config.presence.cleanupInterval);
  }

  /**
   * Broadcast message event
   */
  private async broadcastMessageEvent(
    message: Message,
    changeType: 'create' | 'update' | 'delete',
    deviceId?: string
  ): Promise<void> {
    const event: RealTimeMessageEvent = {
      messageId: message.id,
      conversationId: message.conversation_id,
      userId: message.user_id,
      deviceId: deviceId || 'unknown',
      messageType: message.message_type,
      content: message.content,
      metadata: message.metadata,
      timestamp: message.created_at,
      changeType,
      ...(message.parent_message_id && { parentMessageId: message.parent_message_id }),
    };

    const realTimeEvent: RealTimeEvent = {
      id: this.generateEventId(),
      type: EventType.MESSAGE_CREATED,
      timestamp: Date.now(),
      version: '1.0.0',
      source: { userId: message.user_id, deviceId: deviceId || 'unknown' },
      payload: event,
      metadata: {
        source: 'database_websocket_integration',
        changeType,
      },
      priority: EventPriority.HIGH,
      requiresAck: true,
      permissions: {
        canRead: true,
        readScopes: ['conversation'],
        canPublish: true,
        publishScopes: ['conversation'],
        canManageSubscriptions: false,
        canViewMetrics: false,
        canReplayEvents: false,
      },
    };

    await this.eventBroadcaster.publishEvent(realTimeEvent);
  }

  /**
   * Track message delivery
   */
  private async trackMessageDelivery(
    message: Message,
    userId: string,
    deviceId?: string
  ): Promise<void> {
    const deliveryId = `${message.id}:${userId}:${deviceId || 'unknown'}`;

    const confirmation: MessageDeliveryConfirmation = {
      messageId: message.id,
      userId,
      deviceId: deviceId || 'unknown',
      status: 'delivered',
      timestamp: new Date(),
    };

    this.pendingDeliveries.set(deliveryId, [confirmation]);

    // Set timeout for delivery confirmation
    const timeout = setTimeout(() => {
      this.handleDeliveryTimeout(deliveryId);
    }, this.config.delivery.deliveryTimeout);

    this.deliveryTimeouts.set(deliveryId, timeout);
  }

  /**
   * Update latency metrics
   */
  private updateLatencyMetrics(latency: number): void {
    const currentAvg = this.metrics.averageLatency;
    const processed = this.metrics.messagesProcessed;

    this.metrics.averageLatency = (currentAvg * (processed - 1) + latency) / processed;
  }

  /**
   * Persist presence to database
   */
  private async persistPresenceToDatabase(
    userId: string,
    deviceId: string,
    status: string,
    conversationId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query(
        `INSERT INTO user_presence (user_id, device_id, status, conversation_id, metadata, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id, device_id) 
         DO UPDATE SET status = $3, conversation_id = $4, metadata = $5, updated_at = NOW()`,
        [userId, deviceId, status, conversationId, JSON.stringify(metadata || {})]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Broadcast presence event
   */
  private async broadcastPresenceEvent(event: RealTimePresenceEvent): Promise<void> {
    const realTimeEvent: RealTimeEvent = {
      id: this.generateEventId(),
      type: EventType.PRESENCE_UPDATED,
      timestamp: Date.now(),
      version: '1.0.0',
      source: { userId: event.userId, deviceId: event.deviceId },
      payload: event,
      metadata: {
        source: 'database_websocket_integration',
      },
      priority: EventPriority.MEDIUM,
      requiresAck: false,
      permissions: {
        canRead: true,
        readScopes: ['presence'],
        canPublish: true,
        publishScopes: ['presence'],
        canManageSubscriptions: false,
        canViewMetrics: false,
        canReplayEvents: false,
      },
    };

    await this.eventBroadcaster.publishEvent(realTimeEvent);
  }

  /**
   * Generate event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get message changes since timestamp
   */
  private async getMessageChangesSince(
    conversationId: string,
    since: Date
  ): Promise<MessageChange[]> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `SELECT m.*, 'update' as change_type 
         FROM messages m 
         WHERE m.conversation_id = $1 AND m.updated_at > $2
         ORDER BY m.updated_at ASC`,
        [conversationId, since]
      );

      return result.rows.map((row) => ({
        id: `change_${row.id}_${Date.now()}`,
        message_id: row.id,
        change_type: 'update' as ChangeType,
        change_data: {
          operation: 'update' as const,
          full_message: row,
        },
        device_id: row.device_id,
        user_id: row.user_id,
        timestamp: row.updated_at,
        sync_status: 'synced' as SyncStatus,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Resolve conflicts in message changes
   */
  private async resolveConflicts(changes: MessageChange[]): Promise<MessageChange[]> {
    // Simple last-write-wins strategy for now
    const conflictMap = new Map<string, MessageChange>();

    for (const change of changes) {
      const existing = conflictMap.get(change.message_id);
      if (!existing || change.timestamp > existing.timestamp) {
        conflictMap.set(change.message_id, change);
      }
    }

    this.metrics.conflictsResolved += changes.length - conflictMap.size;

    return Array.from(conflictMap.values());
  }

  /**
   * Broadcast sync event
   */
  private async broadcastSyncEvent(event: CrossDeviceSyncEvent, userId: string): Promise<void> {
    const realTimeEvent: RealTimeEvent = {
      id: this.generateEventId(),
      type: EventType.SYNC_COMPLETED,
      timestamp: Date.now(),
      version: '1.0.0',
      source: { userId, deviceId: 'unknown' },
      payload: event,
      metadata: {
        source: 'database_websocket_integration',
      },
      priority: EventPriority.MEDIUM,
      requiresAck: true,
      permissions: {
        canRead: true,
        readScopes: ['sync'],
        canPublish: true,
        publishScopes: ['sync'],
        canManageSubscriptions: false,
        canViewMetrics: false,
        canReplayEvents: false,
      },
    };

    await this.eventBroadcaster.publishEvent(realTimeEvent);
  }

  /**
   * Handle WebSocket connection
   */
  private handleWebSocketConnection(connection: EnhancedWebSocketConnection): void {
    const deviceInfo = connection.getDeviceInfo();
    const connectionManager = connection.getConnectionManager();

    logger.info('WebSocket connection established', {
      connectionId: connectionManager.connectionId,
      userId: deviceInfo.userId,
      deviceId: deviceInfo.deviceId,
    });

    // Update presence to online
    if (deviceInfo.userId && deviceInfo.deviceId) {
      this.handlePresenceUpdate(deviceInfo.userId, deviceInfo.deviceId, 'online').catch((error) => {
        logger.error('Failed to update presence on connection', { error });
      });
    }
  }

  /**
   * Handle WebSocket disconnection
   */
  private handleWebSocketDisconnection(connection: EnhancedWebSocketConnection): void {
    const deviceInfo = connection.getDeviceInfo();
    const connectionManager = connection.getConnectionManager();

    logger.info('WebSocket connection closed', {
      connectionId: connectionManager.connectionId,
      userId: deviceInfo.userId,
      deviceId: deviceInfo.deviceId,
    });

    // Update presence to offline
    if (deviceInfo.userId && deviceInfo.deviceId) {
      this.handlePresenceUpdate(deviceInfo.userId, deviceInfo.deviceId, 'offline').catch(
        (error) => {
          logger.error('Failed to update presence on disconnection', { error });
        }
      );
    }
  }

  /**
   * Handle WebSocket message
   */
  private handleWebSocketMessage(
    connection: EnhancedWebSocketConnection,
    message: MobileMessage
  ): void {
    const connectionManager = connection.getConnectionManager();

    logger.debug('WebSocket message received', {
      connectionId: connectionManager.connectionId,
      messageType: message.type,
      messageId: message.id,
    });

    // Handle different message types
    switch (message.type) {
      case 'typing_indicator':
        this.handleTypingMessage(connection, message);
        break;
      case 'presence_update':
        this.handlePresenceMessage(connection, message);
        break;
      case 'message_delivery_confirmation':
        this.handleDeliveryConfirmation(connection, message);
        break;
      default:
        logger.warn('Unknown message type received', {
          type: message.type,
          messageId: message.id,
        });
    }
  }

  /**
   * Handle typing message
   */
  private handleTypingMessage(
    connection: EnhancedWebSocketConnection,
    message: MobileMessage
  ): void {
    const deviceInfo = connection.getDeviceInfo();

    if (!deviceInfo.userId || !deviceInfo.deviceId) {
      return;
    }

    const payload = message.payload as any;
    this.handleTypingIndicator(
      deviceInfo.userId,
      deviceInfo.deviceId,
      payload.conversationId,
      payload.isTyping
    ).catch((error) => {
      logger.error('Failed to handle typing message', { error });
    });
  }

  /**
   * Handle presence message
   */
  private handlePresenceMessage(
    connection: EnhancedWebSocketConnection,
    message: MobileMessage
  ): void {
    const deviceInfo = connection.getDeviceInfo();

    if (!deviceInfo.userId || !deviceInfo.deviceId) {
      return;
    }

    const payload = message.payload as any;
    this.handlePresenceUpdate(
      deviceInfo.userId,
      deviceInfo.deviceId,
      payload.status,
      payload.conversationId,
      payload.metadata
    ).catch((error) => {
      logger.error('Failed to handle presence message', { error });
    });
  }

  /**
   * Handle delivery confirmation
   */
  private handleDeliveryConfirmation(
    connection: EnhancedWebSocketConnection,
    message: MobileMessage
  ): void {
    const deviceInfo = connection.getDeviceInfo();
    const payload = message.payload as any;
    const deliveryId = `${payload.messageId}:${deviceInfo.userId}:${deviceInfo.deviceId}`;

    // Clear timeout
    const timeout = this.deliveryTimeouts.get(deliveryId);
    if (timeout) {
      clearTimeout(timeout);
      this.deliveryTimeouts.delete(deliveryId);
    }

    // Update delivery status
    const confirmations = this.pendingDeliveries.get(deliveryId);
    if (confirmations && confirmations[0]) {
      confirmations[0].status = payload.status;
      confirmations[0].timestamp = new Date();
      this.metrics.deliveryConfirmations++;
    }

    logger.debug('Delivery confirmation received', {
      messageId: payload.messageId,
      status: payload.status,
      userId: deviceInfo.userId,
      deviceId: deviceInfo.deviceId,
    });
  }

  /**
   * Handle delivery timeout
   */
  private handleDeliveryTimeout(deliveryId: string): void {
    const confirmations = this.pendingDeliveries.get(deliveryId);
    if (confirmations && confirmations[0]) {
      confirmations[0].status = 'failed';
      confirmations[0].error = 'Delivery timeout';
      this.metrics.errorCount++;
    }

    this.deliveryTimeouts.delete(deliveryId);

    logger.warn('Message delivery timeout', { deliveryId });
  }

  /**
   * Handle database notification
   */
  private handleDatabaseNotification(notification: any): void {
    try {
      const payload = JSON.parse(notification.payload);

      switch (notification.channel) {
        case 'message_changes':
          this.handleMessageChangeNotification(payload);
          break;
        case 'conversation_changes':
          this.handleConversationChangeNotification(payload);
          break;
        case 'presence_changes':
          this.handlePresenceChangeNotification(payload);
          break;
        default:
          logger.warn('Unknown database notification channel', {
            channel: notification.channel,
          });
      }
    } catch (error) {
      logger.error('Failed to handle database notification', {
        error: error instanceof Error ? error.message : String(error),
        notification,
      });
    }
  }

  /**
   * Handle message change notification
   */
  private handleMessageChangeNotification(payload: any): void {
    logger.debug('Message change notification received', { payload });
    // Implementation for message change handling
  }

  /**
   * Handle conversation change notification
   */
  private handleConversationChangeNotification(payload: any): void {
    logger.debug('Conversation change notification received', { payload });
    // Implementation for conversation change handling
  }

  /**
   * Handle presence change notification
   */
  private handlePresenceChangeNotification(payload: any): void {
    logger.debug('Presence change notification received', { payload });
    // Implementation for presence change handling
  }

  /**
   * Handle presence change event
   */
  private handlePresenceChange(presence: any): void {
    logger.debug('Presence change event received', { presence });
    // Implementation for presence change event handling
  }

  /**
   * Handle typing event
   */
  private handleTypingEvent(event: any, isTyping: boolean): void {
    logger.debug('Typing event received', { event, isTyping });
    // Implementation for typing event handling
  }

  /**
   * Cleanup stale presence
   */
  private cleanupStalePresence(): void {
    logger.debug('Cleaning up stale presence data');
    // Implementation for stale presence cleanup
  }

  /**
   * Get service metrics
   */
  public getMetrics() {
    return {
      ...this.metrics,
      isRunning: this.isRunning,
      pendingDeliveries: this.pendingDeliveries.size,
      syncTimestamps: this.lastSyncTimestamps.size,
    };
  }

  /**
   * Get service status
   */
  public getStatus() {
    return {
      isRunning: this.isRunning,
      services: {
        eventBroadcaster: !!this.eventBroadcaster,
        presenceManager: !!this.presenceManager,
        typingIndicators: !!this.typingIndicators,
      },
      metrics: this.getMetrics(),
    };
  }
}
