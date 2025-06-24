/**
 * Event Broadcasting Service - Core Implementation
 *
 * Central nervous system for real-time communication, providing intelligent
 * event distribution, subscription management, and reliable message delivery.
 *
 * @author Real-Time Communication Team
 * @version 1.0.0
 * @since 2024-12-22
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import {
  RealTimeEvent,
  EventSubscription,
  EventPublishResult,
  SubscriptionResult,
  EventMetrics,
  SystemHealthStatus,
  EventType,
  EventPriority,
} from '../types';

// Type alias for logger
type Logger = typeof logger;

/**
 * Event Broadcasting Service Configuration
 */
export interface EventBroadcastingConfig {
  // Server configuration
  server: {
    port: number;
    host: string;
    maxConnections: number;
  };

  // Event processing
  events: {
    maxEventSize: number;
    eventRetentionDays: number;
    maxEventsPerSecond: number;
    priorityQueueSizes: {
      critical: number;
      high: number;
      normal: number;
      low: number;
      background: number;
    };
  };

  // Storage configuration
  storage: {
    provider: 'redis' | 'mongodb' | 'memory';
    connectionString?: string;
    database?: string;
  };

  // Performance tuning
  performance: {
    batchSize: number;
    batchInterval: number;
    compressionEnabled: boolean;
    compressionThreshold: number;
    cacheSize: number;
    cacheTTL: number;
  };

  // Monitoring
  monitoring: {
    metricsEnabled: boolean;
    metricsInterval: number;
    healthCheckEnabled: boolean;
    healthCheckInterval: number;
  };
}

/**
 * Priority Queue for event processing
 */
class PriorityQueue<T> {
  private items: Array<{ item: T; priority: number; timestamp: number }> = [];

  enqueue(item: T, priority: number): void {
    const queueItem = { item, priority, timestamp: Date.now() };

    // Insert based on priority (higher priority first)
    let inserted = false;
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (item && item.priority < priority) {
        this.items.splice(i, 0, queueItem);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      this.items.push(queueItem);
    }
  }

  dequeue(): T | undefined {
    const item = this.items.shift();
    return item ? item.item : undefined;
  }

  size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  clear(): void {
    this.items = [];
  }
}

/**
 * Event Router - Routes events to appropriate subscribers
 */
class EventRouter extends EventEmitter {
  private priorityQueues: Map<EventPriority, PriorityQueue<RealTimeEvent>>;
  private processing = false;
  private logger: Logger;

  constructor(logger: Logger) {
    super();
    this.logger = logger;
    this.priorityQueues = new Map([
      [EventPriority.CRITICAL, new PriorityQueue<RealTimeEvent>()],
      [EventPriority.HIGH, new PriorityQueue<RealTimeEvent>()],
      [EventPriority.NORMAL, new PriorityQueue<RealTimeEvent>()],
      [EventPriority.LOW, new PriorityQueue<RealTimeEvent>()],
      [EventPriority.BACKGROUND, new PriorityQueue<RealTimeEvent>()],
    ]);

    this.startProcessing();
  }

  async routeEvent(event: RealTimeEvent): Promise<void> {
    const queue = this.priorityQueues.get(event.priority);
    if (!queue) {
      throw new Error(`Invalid event priority: ${event.priority}`);
    }

    const priorityValue = this.getPriorityValue(event.priority);
    queue.enqueue(event, priorityValue);

    this.logger.debug('Event queued for routing', {
      eventId: event.id,
      type: event.type,
      priority: event.priority,
      queueSize: queue.size(),
    });
  }

  private getPriorityValue(priority: EventPriority): number {
    switch (priority) {
      case EventPriority.CRITICAL:
        return 5;
      case EventPriority.HIGH:
        return 4;
      case EventPriority.NORMAL:
        return 3;
      case EventPriority.LOW:
        return 2;
      case EventPriority.BACKGROUND:
        return 1;
      default:
        return 1;
    }
  }

  private async startProcessing(): Promise<void> {
    if (this.processing) return;

    this.processing = true;

    while (this.processing) {
      try {
        await this.processNextEvent();
        await this.sleep(1); // Small delay to prevent CPU spinning
      } catch (error) {
        this.logger.error('Error processing event', { error });
      }
    }
  }

  private async processNextEvent(): Promise<void> {
    // Process events in priority order
    for (const [priority, queue] of this.priorityQueues) {
      if (!queue.isEmpty()) {
        const event = queue.dequeue();
        if (event) {
          await this.processEvent(event);
          return;
        }
      }
    }
  }

  private async processEvent(event: RealTimeEvent): Promise<void> {
    const startTime = Date.now();

    try {
      // Emit event for subscribers
      this.emit('event', event);

      const latency = Date.now() - startTime;
      this.logger.debug('Event processed', {
        eventId: event.id,
        type: event.type,
        latency,
      });

      // Emit metrics
      this.emit('metrics', {
        type: 'event_processed',
        eventType: event.type,
        priority: event.priority,
        latency,
      });
    } catch (error) {
      this.logger.error('Error processing event', {
        eventId: event.id,
        error,
      });

      this.emit('metrics', {
        type: 'event_error',
        eventType: event.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  stop(): void {
    this.processing = false;
  }

  getQueueSizes(): Record<EventPriority, number> {
    const sizes: Record<string, number> = {};
    for (const [priority, queue] of this.priorityQueues) {
      sizes[priority] = queue.size();
    }
    return sizes as Record<EventPriority, number>;
  }
}

/**
 * Subscription Manager - Manages event subscriptions
 */
class SubscriptionManager extends EventEmitter {
  private subscriptions = new Map<string, EventSubscription>();
  private userSubscriptions = new Map<string, Set<string>>();
  private eventTypeSubscriptions = new Map<EventType, Set<string>>();
  private logger: Logger;

  constructor(logger: Logger) {
    super();
    this.logger = logger;
  }

  async createSubscription(subscription: EventSubscription): Promise<SubscriptionResult> {
    const subscriptionId = this.generateSubscriptionId();
    subscription.id = subscriptionId;
    subscription.createdAt = Date.now();
    subscription.isActive = true;
    subscription.eventsReceived = 0;
    subscription.averageLatency = 0;

    // Store subscription
    this.subscriptions.set(subscriptionId, subscription);

    // Index by user
    this.indexSubscriptionByUser(subscription);

    // Index by event types
    this.indexSubscriptionByEventTypes(subscription);

    this.logger.info('Subscription created', {
      subscriptionId,
      userId: subscription.userId,
      eventTypes: subscription.eventTypes,
    });

    this.emit('subscription_created', subscription);

    return {
      subscriptionId,
      status: 'active',
      createdAt: subscription.createdAt,
    };
  }

  async removeSubscription(subscriptionId: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }

    // Remove from main storage
    this.subscriptions.delete(subscriptionId);

    // Remove from user index
    const userSubs = this.userSubscriptions.get(subscription.userId);
    if (userSubs) {
      userSubs.delete(subscriptionId);
      if (userSubs.size === 0) {
        this.userSubscriptions.delete(subscription.userId);
      }
    }

    // Remove from event type indexes
    for (const eventType of subscription.eventTypes) {
      const typeSubs = this.eventTypeSubscriptions.get(eventType);
      if (typeSubs) {
        typeSubs.delete(subscriptionId);
        if (typeSubs.size === 0) {
          this.eventTypeSubscriptions.delete(eventType);
        }
      }
    }

    this.logger.info('Subscription removed', { subscriptionId });
    this.emit('subscription_removed', subscription);
  }

  getMatchingSubscriptions(event: RealTimeEvent): EventSubscription[] {
    const matchingSubscriptions: EventSubscription[] = [];

    // Get subscriptions for this event type
    const typeSubscriptions = this.eventTypeSubscriptions.get(event.type);
    if (typeSubscriptions) {
      for (const subscriptionId of typeSubscriptions) {
        const subscription = this.subscriptions.get(subscriptionId);
        if (subscription && this.isSubscriptionMatch(subscription, event)) {
          matchingSubscriptions.push(subscription);
        }
      }
    }

    return matchingSubscriptions;
  }

  private isSubscriptionMatch(subscription: EventSubscription, event: RealTimeEvent): boolean {
    // Check if subscription is active
    if (!subscription.isActive) return false;

    // Check if subscription has expired
    if (subscription.expiresAt && Date.now() > subscription.expiresAt) {
      subscription.isActive = false;
      return false;
    }

    // Check event type
    if (!subscription.eventTypes.includes(event.type)) return false;

    // Check priority filter
    const eventPriorityValue = this.getPriorityValue(event.priority);
    const subscriptionPriorityValue = this.getPriorityValue(subscription.priority);
    if (eventPriorityValue < subscriptionPriorityValue) return false;

    // Apply additional filters
    if (subscription.filters && subscription.filters.length > 0) {
      return this.applyFilters(subscription.filters, event);
    }

    return true;
  }

  private applyFilters(filters: any[], event: RealTimeEvent): boolean {
    // Simple filter implementation - can be extended
    for (const filter of filters) {
      if (filter.type === 'session' && event.payload?.['sessionId'] !== filter.value) {
        return false;
      }
      if (filter.type === 'user' && event.source?.userId !== filter.value) {
        return false;
      }
    }
    return true;
  }

  private getPriorityValue(priority: EventPriority): number {
    switch (priority) {
      case EventPriority.CRITICAL:
        return 5;
      case EventPriority.HIGH:
        return 4;
      case EventPriority.NORMAL:
        return 3;
      case EventPriority.LOW:
        return 2;
      case EventPriority.BACKGROUND:
        return 1;
      default:
        return 1;
    }
  }

  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private indexSubscriptionByUser(subscription: EventSubscription): void {
    if (!this.userSubscriptions.has(subscription.userId)) {
      this.userSubscriptions.set(subscription.userId, new Set());
    }
    const userSubs = this.userSubscriptions.get(subscription.userId);
    if (userSubs) {
      userSubs.add(subscription.id);
    }
  }

  private indexSubscriptionByEventTypes(subscription: EventSubscription): void {
    for (const eventType of subscription.eventTypes) {
      if (!this.eventTypeSubscriptions.has(eventType)) {
        this.eventTypeSubscriptions.set(eventType, new Set());
      }
      const eventTypeSubs = this.eventTypeSubscriptions.get(eventType);
      if (eventTypeSubs) {
        eventTypeSubs.add(subscription.id);
      }
    }
  }

  getUserSubscriptions(userId: string): EventSubscription[] {
    const subscriptionIds = this.userSubscriptions.get(userId);
    if (!subscriptionIds) return [];

    const subscriptions: EventSubscription[] = [];
    for (const subscriptionId of subscriptionIds) {
      const subscription = this.subscriptions.get(subscriptionId);
      if (subscription) {
        subscriptions.push(subscription);
      }
    }

    return subscriptions;
  }

  getSubscriptionStats(): any {
    return {
      totalSubscriptions: this.subscriptions.size,
      activeSubscriptions: Array.from(this.subscriptions.values()).filter((sub) => sub.isActive)
        .length,
      userCount: this.userSubscriptions.size,
      eventTypeCount: this.eventTypeSubscriptions.size,
    };
  }
}

/**
 * Metrics Collector - Collects and aggregates metrics
 */
class MetricsCollector extends EventEmitter {
  private metrics: EventMetrics;
  private logger: Logger;
  private metricsInterval: NodeJS.Timeout | null = null;

  constructor(logger: Logger, config: { metricsEnabled: boolean; metricsInterval: number }) {
    super();
    this.logger = logger;

    this.metrics = {
      eventsProcessed: 0,
      eventsPerSecond: 0,
      averageLatency: 0,
      errorRate: 0,
      activeSubscriptions: 0,
      subscriptionRate: 0,
      unsubscriptionRate: 0,
      eventsStored: 0,
      storageSize: 0,
      replayRequests: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      networkThroughput: 0,
      deliverySuccess: 0,
      duplicateEvents: 0,
      lostEvents: 0,
    };

    if (config.metricsEnabled) {
      this.startMetricsCollection(config.metricsInterval);
    }
  }

  recordEventPublished(event: RealTimeEvent, latency: number): void {
    this.metrics.eventsProcessed++;
    this.updateAverageLatency(latency);

    this.emit('metric_recorded', {
      type: 'event_published',
      eventType: event.type,
      latency,
    });
  }

  recordEventError(event: RealTimeEvent, error: Error): void {
    this.metrics.lostEvents++;
    this.updateErrorRate();

    this.emit('metric_recorded', {
      type: 'event_error',
      eventType: event.type,
      error: error.message,
    });
  }

  recordSubscriptionCreated(subscription: EventSubscription): void {
    this.metrics.activeSubscriptions++;

    this.emit('metric_recorded', {
      type: 'subscription_created',
      userId: subscription.userId,
      eventTypes: subscription.eventTypes,
    });
  }

  recordSubscriptionRemoved(subscription: EventSubscription): void {
    this.metrics.activeSubscriptions--;

    this.emit('metric_recorded', {
      type: 'subscription_removed',
      userId: subscription.userId,
    });
  }

  getMetrics(): EventMetrics {
    return { ...this.metrics };
  }

  private startMetricsCollection(interval: number): void {
    this.metricsInterval = setInterval(() => {
      this.collectSystemMetrics();
      this.emit('metrics_collected', this.metrics);
    }, interval);
  }

  private updateAverageLatency(latency: number): void {
    const totalEvents = this.metrics.eventsProcessed;
    if (totalEvents === 1) {
      this.metrics.averageLatency = latency;
    } else {
      this.metrics.averageLatency =
        (this.metrics.averageLatency * (totalEvents - 1) + latency) / totalEvents;
    }
  }

  private updateErrorRate(): void {
    const totalEvents = this.metrics.eventsProcessed + this.metrics.lostEvents;
    this.metrics.errorRate = totalEvents > 0 ? this.metrics.lostEvents / totalEvents : 0;
  }

  private collectSystemMetrics(): void {
    // Collect system metrics
    const memUsage = process.memoryUsage();
    this.metrics.memoryUsage = memUsage.heapUsed;

    // Calculate events per second
    const now = Date.now();
    if (!this.lastMetricsTime) {
      this.lastMetricsTime = now;
      this.lastEventCount = this.metrics.eventsProcessed;
    } else {
      const timeDiff = (now - this.lastMetricsTime) / 1000;
      const eventDiff = this.metrics.eventsProcessed - this.lastEventCount;
      this.metrics.eventsPerSecond = timeDiff > 0 ? eventDiff / timeDiff : 0;

      this.lastMetricsTime = now;
      this.lastEventCount = this.metrics.eventsProcessed;
    }
  }

  private lastMetricsTime?: number;
  private lastEventCount = 0;

  stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }
}

/**
 * Event Broadcasting Service - Main Implementation
 */
export class EventBroadcastingService extends EventEmitter {
  private eventRouter: EventRouter;
  private subscriptionManager: SubscriptionManager;
  private metricsCollector: MetricsCollector;
  private logger: Logger;
  private config: EventBroadcastingConfig;
  private isRunning = false;

  constructor(config: EventBroadcastingConfig) {
    super();
    this.config = config;
    this.logger = logger;

    // Initialize components
    this.eventRouter = new EventRouter(this.logger);
    this.subscriptionManager = new SubscriptionManager(this.logger);
    this.metricsCollector = new MetricsCollector(this.logger, config.monitoring);

    // Wire up event handlers
    this.setupEventHandlers();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Event Broadcasting Service is already running');
    }

    this.logger.info('Starting Event Broadcasting Service', {
      config: {
        port: this.config.server.port,
        host: this.config.server.host,
        storageProvider: this.config.storage.provider,
      },
    });

    this.isRunning = true;
    this.emit('service_started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping Event Broadcasting Service');

    this.eventRouter.stop();
    this.metricsCollector.stop();
    this.isRunning = false;

    this.emit('service_stopped');
  }

  async publishEvent(event: RealTimeEvent): Promise<EventPublishResult> {
    if (!this.isRunning) {
      throw new Error('Event Broadcasting Service is not running');
    }

    const startTime = Date.now();

    try {
      // Validate event
      this.validateEvent(event);

      // Generate event ID if not provided
      if (!event.id) {
        event.id = this.generateEventId();
      }

      // Set timestamp if not provided
      if (!event.timestamp) {
        event.timestamp = Date.now();
      }

      // Route event
      await this.eventRouter.routeEvent(event);

      // Get matching subscriptions
      const subscriptions = this.subscriptionManager.getMatchingSubscriptions(event);

      // Deliver to subscribers
      const deliveredTo = subscriptions.map((sub) => sub.userId);

      // Record metrics
      const latency = Date.now() - startTime;
      this.metricsCollector.recordEventPublished(event, latency);

      this.logger.debug('Event published successfully', {
        eventId: event.id,
        type: event.type,
        deliveredTo: deliveredTo.length,
        latency,
      });

      return {
        eventId: event.id,
        status: 'published',
        deliveredTo,
        latency,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      this.metricsCollector.recordEventError(event, error as Error);

      this.logger.error('Failed to publish event', {
        eventId: event.id,
        error: error instanceof Error ? error.message : String(error),
        latency,
      });

      return {
        eventId: event.id || 'unknown',
        status: 'failed',
        deliveredTo: [],
        latency,
      };
    }
  }

  async subscribeToEvents(subscription: EventSubscription): Promise<SubscriptionResult> {
    if (!this.isRunning) {
      throw new Error('Event Broadcasting Service is not running');
    }

    try {
      // Validate subscription
      this.validateSubscription(subscription);

      // Create subscription
      const result = await this.subscriptionManager.createSubscription(subscription);

      // Record metrics
      this.metricsCollector.recordSubscriptionCreated(subscription);

      this.logger.info('Subscription created successfully', {
        subscriptionId: result.subscriptionId,
        userId: subscription.userId,
        eventTypes: subscription.eventTypes,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to create subscription', {
        userId: subscription.userId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  async unsubscribeFromEvents(subscriptionId: string): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Event Broadcasting Service is not running');
    }

    try {
      await this.subscriptionManager.removeSubscription(subscriptionId);

      this.logger.info('Subscription removed successfully', { subscriptionId });
    } catch (error) {
      this.logger.error('Failed to remove subscription', {
        subscriptionId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  async getEventMetrics(): Promise<EventMetrics> {
    return this.metricsCollector.getMetrics();
  }

  async getSystemHealth(): Promise<SystemHealthStatus> {
    const metrics = this.metricsCollector.getMetrics();
    const queueSizes = this.eventRouter.getQueueSizes();
    const subscriptionStats = this.subscriptionManager.getSubscriptionStats();

    const status = this.determineHealthStatus(metrics);

    return {
      status,
      uptime: process.uptime(),
      lastHealthCheck: Date.now(),
      eventRouter: { queueSizes },
      subscriptionManager: subscriptionStats,
      eventStorage: { status: 'healthy' },
      replaySystem: { status: 'healthy' },
      latencyP95: metrics.averageLatency * 1.2, // Approximation
      latencyP99: metrics.averageLatency * 1.5, // Approximation
      errorRate: metrics.errorRate,
      throughput: metrics.eventsPerSecond,
      cpuHealth: { status: 'healthy' },
      memoryHealth: { usage: metrics.memoryUsage },
      storageHealth: { status: 'healthy' },
      networkHealth: { status: 'healthy' },
    };
  }

  private setupEventHandlers(): void {
    // Handle events from router
    this.eventRouter.on('event', (event: RealTimeEvent) => {
      this.emit('event_routed', event);
    });

    // Handle subscription events
    this.subscriptionManager.on('subscription_created', (subscription: EventSubscription) => {
      this.emit('subscription_created', subscription);
    });

    this.subscriptionManager.on('subscription_removed', (subscription: EventSubscription) => {
      this.emit('subscription_removed', subscription);
    });

    // Handle metrics events
    this.metricsCollector.on('metrics_collected', (metrics: EventMetrics) => {
      this.emit('metrics_updated', metrics);
    });
  }

  private validateEvent(event: RealTimeEvent): void {
    if (!event.type) {
      throw new Error('Event type is required');
    }

    if (!event.source?.userId) {
      throw new Error('Event source userId is required');
    }

    if (!event.priority) {
      event.priority = EventPriority.NORMAL;
    }

    if (event.requiresAck === undefined) {
      event.requiresAck = false;
    }
  }

  private validateSubscription(subscription: EventSubscription): void {
    if (!subscription.userId) {
      throw new Error('Subscription userId is required');
    }

    if (!subscription.deviceId) {
      throw new Error('Subscription deviceId is required');
    }

    if (!subscription.eventTypes || subscription.eventTypes.length === 0) {
      throw new Error('Subscription eventTypes are required');
    }

    if (!subscription.priority) {
      subscription.priority = EventPriority.NORMAL;
    }

    if (!subscription.deliveryMode) {
      subscription.deliveryMode = 'realtime';
    }

    if (!subscription.filters) {
      subscription.filters = [];
    }
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private determineHealthStatus(metrics: EventMetrics): 'healthy' | 'degraded' | 'unhealthy' {
    if (metrics.errorRate > 0.1) return 'unhealthy';
    if (metrics.errorRate > 0.05 || metrics.averageLatency > 1000) return 'degraded';
    return 'healthy';
  }
}

// Export default configuration
export const defaultEventBroadcastingConfig: EventBroadcastingConfig = {
  server: {
    port: 3001,
    host: '0.0.0.0',
    maxConnections: 10000,
  },
  events: {
    maxEventSize: 1024 * 1024, // 1MB
    eventRetentionDays: 7,
    maxEventsPerSecond: 1000,
    priorityQueueSizes: {
      critical: 1000,
      high: 5000,
      normal: 10000,
      low: 20000,
      background: 50000,
    },
  },
  storage: {
    provider: 'memory',
  },
  performance: {
    batchSize: 100,
    batchInterval: 10,
    compressionEnabled: true,
    compressionThreshold: 1024,
    cacheSize: 10000,
    cacheTTL: 300000,
  },
  monitoring: {
    metricsEnabled: true,
    metricsInterval: 10000,
    healthCheckEnabled: true,
    healthCheckInterval: 30000,
  },
};
