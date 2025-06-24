/**
 * Presence Management Service
 *
 * Manages user and device presence tracking with multi-device support,
 * presence broadcasting, and automatic presence updates.
 *
 * Features:
 * - User presence tracking (online, away, busy, offline)
 * - Device presence with multi-device coordination
 * - Presence broadcasting to connected clients
 * - Automatic presence updates based on activity
 * - Presence persistence and recovery
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';
export type DeviceType = 'mobile' | 'desktop' | 'web' | 'tablet';

export interface DevicePresence {
  deviceId: string;
  userId: string;
  deviceType: DeviceType;
  status: PresenceStatus;
  lastActivity: number;
  lastSeen: number;
  metadata?: {
    platform?: string;
    version?: string;
    location?: string;
    capabilities?: string[];
  };
}

export interface UserPresence {
  userId: string;
  aggregatedStatus: PresenceStatus;
  devices: Map<string, DevicePresence>;
  lastActivity: number;
  statusMessage?: string;
  customStatus?: {
    emoji?: string;
    text?: string;
    expiresAt?: number;
  };
}

export interface PresenceConfig {
  awayTimeout: number; // Time in ms before marking as away
  offlineTimeout: number; // Time in ms before marking as offline
  heartbeatInterval: number; // Heartbeat interval in ms
  broadcastThrottle: number; // Minimum time between broadcasts in ms
  persistenceEnabled: boolean;
  autoAwayEnabled: boolean;
}

export interface PresenceSubscription {
  subscriberId: string;
  userIds: Set<string>;
  deviceIds: Set<string>;
  callback: (presence: UserPresence | DevicePresence) => void;
  filters?: {
    statusFilter?: PresenceStatus[];
    deviceTypeFilter?: DeviceType[];
  };
}

export interface PresenceMetrics {
  totalUsers: number;
  onlineUsers: number;
  totalDevices: number;
  onlineDevices: number;
  presenceUpdates: number;
  broadcastsSent: number;
  subscriptions: number;
}

/**
 * Presence Management Service
 *
 * Handles real-time presence tracking and broadcasting for users and devices.
 */
export class PresenceManagerService extends EventEmitter {
  private userPresences: Map<string, UserPresence> = new Map();
  private devicePresences: Map<string, DevicePresence> = new Map();
  private subscriptions: Map<string, PresenceSubscription> = new Map();
  private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map();
  private broadcastThrottles: Map<string, number> = new Map();
  private metrics: PresenceMetrics = {
    totalUsers: 0,
    onlineUsers: 0,
    totalDevices: 0,
    onlineDevices: 0,
    presenceUpdates: 0,
    broadcastsSent: 0,
    subscriptions: 0,
  };

  private readonly defaultConfig: PresenceConfig = {
    awayTimeout: 300000, // 5 minutes
    offlineTimeout: 900000, // 15 minutes
    heartbeatInterval: 30000, // 30 seconds
    broadcastThrottle: 1000, // 1 second
    persistenceEnabled: true,
    autoAwayEnabled: true,
  };

  private config: PresenceConfig;

  constructor(config?: Partial<PresenceConfig>) {
    super();
    this.config = { ...this.defaultConfig, ...config };
    this.startPresenceMonitoring();
  }

  /**
   * Update device presence
   */
  public updateDevicePresence(
    deviceId: string,
    userId: string,
    status: PresenceStatus,
    deviceType: DeviceType,
    metadata?: DevicePresence['metadata']
  ): void {
    const now = Date.now();
    const existingDevice = this.devicePresences.get(deviceId);

    const devicePresence: DevicePresence = {
      deviceId,
      userId,
      deviceType,
      status,
      lastActivity: now,
      lastSeen: now,
      metadata: { ...existingDevice?.metadata, ...metadata },
    };

    this.devicePresences.set(deviceId, devicePresence);
    this.updateUserPresence(userId);
    this.scheduleHeartbeat(deviceId);

    // Broadcast presence update
    this.broadcastPresenceUpdate(devicePresence);

    // Update metrics
    this.updateMetrics();

    logger.debug('Device presence updated', {
      deviceId,
      userId,
      status,
      deviceType,
    });

    this.emit('devicePresenceUpdated', devicePresence);
  }

  /**
   * Update user presence aggregated from all devices
   */
  private updateUserPresence(userId: string): void {
    const userDevices = Array.from(this.devicePresences.values()).filter(
      (device) => device.userId === userId
    );

    if (userDevices.length === 0) {
      this.userPresences.delete(userId);
      return;
    }

    // Determine aggregated status based on device statuses
    const aggregatedStatus = this.calculateAggregatedStatus(userDevices);
    const lastActivity = Math.max(...userDevices.map((d) => d.lastActivity));

    const existingUser = this.userPresences.get(userId);
    const userPresence: UserPresence = {
      userId,
      aggregatedStatus,
      devices: new Map(userDevices.map((d) => [d.deviceId, d])),
      lastActivity,
      statusMessage: existingUser?.statusMessage,
      customStatus: existingUser?.customStatus,
    };

    this.userPresences.set(userId, userPresence);

    // Broadcast user presence update
    this.broadcastPresenceUpdate(userPresence);

    logger.debug('User presence updated', {
      userId,
      aggregatedStatus,
      deviceCount: userDevices.length,
    });

    this.emit('userPresenceUpdated', userPresence);
  }

  /**
   * Calculate aggregated presence status from device statuses
   */
  private calculateAggregatedStatus(devices: DevicePresence[]): PresenceStatus {
    const statuses = devices.map((d) => d.status);

    // Priority order: online > busy > away > offline
    if (statuses.includes('online')) return 'online';
    if (statuses.includes('busy')) return 'busy';
    if (statuses.includes('away')) return 'away';
    return 'offline';
  }

  /**
   * Set custom status for a user
   */
  public setCustomStatus(
    userId: string,
    statusMessage?: string,
    customStatus?: UserPresence['customStatus']
  ): void {
    const userPresence = this.userPresences.get(userId);
    if (!userPresence) {
      logger.warn('Cannot set custom status for unknown user', { userId });
      return;
    }

    userPresence.statusMessage = statusMessage;
    userPresence.customStatus = customStatus;

    this.userPresences.set(userId, userPresence);
    this.broadcastPresenceUpdate(userPresence);

    logger.debug('Custom status updated', {
      userId,
      statusMessage,
      customStatus,
    });

    this.emit('customStatusUpdated', { userId, statusMessage, customStatus });
  }

  /**
   * Subscribe to presence updates
   */
  public subscribe(
    subscriberId: string,
    userIds: string[] = [],
    deviceIds: string[] = [],
    callback: PresenceSubscription['callback'],
    filters?: PresenceSubscription['filters']
  ): void {
    const subscription: PresenceSubscription = {
      subscriberId,
      userIds: new Set(userIds),
      deviceIds: new Set(deviceIds),
      callback,
      filters,
    };

    this.subscriptions.set(subscriberId, subscription);
    this.metrics.subscriptions = this.subscriptions.size;

    // Send initial presence data
    this.sendInitialPresenceData(subscription);

    logger.debug('Presence subscription created', {
      subscriberId,
      userCount: userIds.length,
      deviceCount: deviceIds.length,
    });

    this.emit('subscriptionCreated', { subscriberId, userIds, deviceIds });
  }

  /**
   * Unsubscribe from presence updates
   */
  public unsubscribe(subscriberId: string): void {
    const subscription = this.subscriptions.get(subscriberId);
    if (!subscription) {
      return;
    }

    this.subscriptions.delete(subscriberId);
    this.metrics.subscriptions = this.subscriptions.size;

    logger.debug('Presence subscription removed', { subscriberId });
    this.emit('subscriptionRemoved', { subscriberId });
  }

  /**
   * Send initial presence data to a new subscriber
   */
  private sendInitialPresenceData(subscription: PresenceSubscription): void {
    // Send user presences
    for (const [userId, userPresence] of this.userPresences.entries()) {
      if (subscription.userIds.size === 0 || subscription.userIds.has(userId)) {
        if (this.matchesFilters(userPresence, subscription.filters)) {
          subscription.callback(userPresence);
        }
      }
    }

    // Send device presences
    for (const [deviceId, devicePresence] of this.devicePresences.entries()) {
      if (subscription.deviceIds.size === 0 || subscription.deviceIds.has(deviceId)) {
        if (this.matchesFilters(devicePresence, subscription.filters)) {
          subscription.callback(devicePresence);
        }
      }
    }
  }

  /**
   * Check if presence matches subscription filters
   */
  private matchesFilters(
    presence: UserPresence | DevicePresence,
    filters?: PresenceSubscription['filters']
  ): boolean {
    if (!filters) return true;

    const status = 'aggregatedStatus' in presence ? presence.aggregatedStatus : presence.status;

    if (filters.statusFilter && !filters.statusFilter.includes(status)) {
      return false;
    }

    if (filters.deviceTypeFilter && 'deviceType' in presence) {
      if (!filters.deviceTypeFilter.includes(presence.deviceType)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Broadcast presence update to subscribers
   */
  private broadcastPresenceUpdate(presence: UserPresence | DevicePresence): void {
    const now = Date.now();
    const presenceId = 'userId' in presence ? presence.userId : presence.deviceId;

    // Check broadcast throttle
    const lastBroadcast = this.broadcastThrottles.get(presenceId) || 0;
    if (now - lastBroadcast < this.config.broadcastThrottle) {
      return;
    }

    this.broadcastThrottles.set(presenceId, now);

    for (const subscription of this.subscriptions.values()) {
      const shouldNotify = this.shouldNotifySubscriber(presence, subscription);

      if (shouldNotify && this.matchesFilters(presence, subscription.filters)) {
        try {
          subscription.callback(presence);
        } catch (error) {
          logger.error('Error in presence subscription callback', {
            subscriberId: subscription.subscriberId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    this.metrics.broadcastsSent++;
    this.emit('presenceBroadcast', presence);
  }

  /**
   * Check if subscriber should be notified of presence update
   */
  private shouldNotifySubscriber(
    presence: UserPresence | DevicePresence,
    subscription: PresenceSubscription
  ): boolean {
    if ('aggregatedStatus' in presence) {
      // User presence
      return subscription.userIds.size === 0 || subscription.userIds.has(presence.userId);
    } else {
      // Device presence
      return (
        subscription.deviceIds.size === 0 ||
        subscription.deviceIds.has(presence.deviceId) ||
        subscription.userIds.has(presence.userId)
      );
    }
  }

  /**
   * Handle device heartbeat
   */
  public heartbeat(deviceId: string): void {
    const device = this.devicePresences.get(deviceId);
    if (!device) {
      logger.warn('Heartbeat received for unknown device', { deviceId });
      return;
    }

    const now = Date.now();
    device.lastActivity = now;
    device.lastSeen = now;

    // Update status to online if it was away/offline
    if (device.status === 'away' || device.status === 'offline') {
      device.status = 'online';
      this.updateUserPresence(device.userId);
    }

    this.scheduleHeartbeat(deviceId);

    logger.debug('Device heartbeat received', { deviceId });
    this.emit('deviceHeartbeat', { deviceId, timestamp: now });
  }

  /**
   * Schedule next heartbeat timeout for a device
   */
  private scheduleHeartbeat(deviceId: string): void {
    // Clear existing timer
    const existingTimer = this.heartbeatTimers.get(deviceId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new timer
    const timer = setTimeout(() => {
      this.handleMissedHeartbeat(deviceId);
    }, this.config.heartbeatInterval * 2); // Allow 2x interval before timeout

    this.heartbeatTimers.set(deviceId, timer);
  }

  /**
   * Handle missed heartbeat
   */
  private handleMissedHeartbeat(deviceId: string): void {
    const device = this.devicePresences.get(deviceId);
    if (!device) {
      return;
    }

    const now = Date.now();
    const timeSinceActivity = now - device.lastActivity;

    if (timeSinceActivity >= this.config.offlineTimeout) {
      device.status = 'offline';
    } else if (timeSinceActivity >= this.config.awayTimeout && this.config.autoAwayEnabled) {
      device.status = 'away';
    }

    this.updateUserPresence(device.userId);

    logger.debug('Device heartbeat missed', {
      deviceId,
      newStatus: device.status,
      timeSinceActivity,
    });

    this.emit('deviceHeartbeatMissed', { deviceId, status: device.status });
  }

  /**
   * Remove device presence
   */
  public removeDevice(deviceId: string): void {
    const device = this.devicePresences.get(deviceId);
    if (!device) {
      return;
    }

    const userId = device.userId;

    // Clear heartbeat timer
    const timer = this.heartbeatTimers.get(deviceId);
    if (timer) {
      clearTimeout(timer);
      this.heartbeatTimers.delete(deviceId);
    }

    // Remove device
    this.devicePresences.delete(deviceId);
    this.broadcastThrottles.delete(deviceId);

    // Update user presence
    this.updateUserPresence(userId);
    this.updateMetrics();

    logger.debug('Device presence removed', { deviceId, userId });
    this.emit('deviceRemoved', { deviceId, userId });
  }

  /**
   * Get user presence
   */
  public getUserPresence(userId: string): UserPresence | null {
    return this.userPresences.get(userId) || null;
  }

  /**
   * Get device presence
   */
  public getDevicePresence(deviceId: string): DevicePresence | null {
    return this.devicePresences.get(deviceId) || null;
  }

  /**
   * Get all user presences
   */
  public getAllUserPresences(): UserPresence[] {
    return Array.from(this.userPresences.values());
  }

  /**
   * Get all device presences
   */
  public getAllDevicePresences(): DevicePresence[] {
    return Array.from(this.devicePresences.values());
  }

  /**
   * Get presence metrics
   */
  public getMetrics(): PresenceMetrics {
    return { ...this.metrics };
  }

  /**
   * Update metrics
   */
  private updateMetrics(): void {
    this.metrics.totalUsers = this.userPresences.size;
    this.metrics.totalDevices = this.devicePresences.size;

    this.metrics.onlineUsers = Array.from(this.userPresences.values()).filter(
      (user) => user.aggregatedStatus === 'online'
    ).length;

    this.metrics.onlineDevices = Array.from(this.devicePresences.values()).filter(
      (device) => device.status === 'online'
    ).length;

    this.metrics.presenceUpdates++;
  }

  /**
   * Start presence monitoring
   */
  private startPresenceMonitoring(): void {
    // Clean up expired custom statuses every minute
    setInterval(() => {
      this.cleanupExpiredCustomStatuses();
    }, 60000);

    // Update metrics every 30 seconds
    setInterval(() => {
      this.updateMetrics();
    }, 30000);
  }

  /**
   * Clean up expired custom statuses
   */
  private cleanupExpiredCustomStatuses(): void {
    const now = Date.now();

    for (const [userId, userPresence] of this.userPresences.entries()) {
      if (userPresence.customStatus?.expiresAt && userPresence.customStatus.expiresAt <= now) {
        userPresence.customStatus = undefined;
        this.broadcastPresenceUpdate(userPresence);

        logger.debug('Custom status expired', { userId });
        this.emit('customStatusExpired', { userId });
      }
    }
  }

  /**
   * Shutdown the service
   */
  public shutdown(): void {
    // Clear all heartbeat timers
    for (const timer of this.heartbeatTimers.values()) {
      clearTimeout(timer);
    }
    this.heartbeatTimers.clear();

    // Clear all data
    this.userPresences.clear();
    this.devicePresences.clear();
    this.subscriptions.clear();
    this.broadcastThrottles.clear();

    logger.info('Presence manager service shutdown complete');
  }
}
