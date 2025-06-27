/**
 * Device Registry Service
 *
 * Manages device registration, discovery, and metadata for the RCCS system.
 * Provides centralized device management and capability tracking.
 */

import { logger } from '../utils/logger';
import { DeviceInfo, DeviceType } from '../types/mobile';
import { EventEmitter } from 'events';

/**
 * Device registration data
 */
export interface DeviceRegistration {
  deviceId: string;
  deviceInfo: DeviceInfo;
  registeredAt: Date;
  lastSeen: Date;
  status: 'active' | 'inactive' | 'offline';
  capabilities: DeviceInfo['capabilities'];
  metadata: Record<string, any>;
}

/**
 * Device registry configuration
 */
export interface DeviceRegistryConfig {
  maxDevices: number;
  inactiveTimeout: number;
  cleanupInterval: number;
  persistToDisk: boolean;
  storageLocation?: string;
}

/**
 * Device registry events
 */
export interface DeviceRegistryEvents {
  deviceRegistered: (registration: DeviceRegistration) => void;
  deviceUpdated: (registration: DeviceRegistration) => void;
  deviceRemoved: (deviceId: string) => void;
  deviceStatusChanged: (deviceId: string, status: DeviceRegistration['status']) => void;
}

/**
 * Device Registry Service implementation
 */
export class DeviceRegistry extends EventEmitter {
  private config: DeviceRegistryConfig;
  private devices: Map<string, DeviceRegistration> = new Map();
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: DeviceRegistryConfig) {
    super();
    this.config = config;
    this.startCleanupTimer();

    logger.info('Device Registry initialized', {
      maxDevices: config.maxDevices,
      inactiveTimeout: config.inactiveTimeout,
    });
  }

  /**
   * Register a new device
   */
  public async registerDevice(deviceInfo: DeviceInfo): Promise<DeviceRegistration> {
    const existingDevice = this.devices.get(deviceInfo.deviceId);

    if (existingDevice) {
      // Update existing device
      existingDevice.lastSeen = new Date();
      existingDevice.status = 'active';
      existingDevice.deviceInfo = deviceInfo;

      this.emit('deviceUpdated', existingDevice);
      logger.debug('Device updated in registry', { deviceId: deviceInfo.deviceId });

      return existingDevice;
    }

    // Check device limit
    if (this.devices.size >= this.config.maxDevices) {
      throw new Error(`Maximum device limit reached: ${this.config.maxDevices}`);
    }

    // Create new registration
    const registration: DeviceRegistration = {
      deviceId: deviceInfo.deviceId,
      deviceInfo,
      registeredAt: new Date(),
      lastSeen: new Date(),
      status: 'active',
      capabilities: deviceInfo.capabilities,
      metadata: {},
    };

    this.devices.set(deviceInfo.deviceId, registration);
    this.emit('deviceRegistered', registration);

    logger.info('Device registered', {
      deviceId: deviceInfo.deviceId,
      deviceType: deviceInfo.deviceType,
      totalDevices: this.devices.size,
    });

    return registration;
  }

  /**
   * Update device last seen timestamp
   */
  public updateDeviceActivity(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.lastSeen = new Date();
      if (device.status !== 'active') {
        device.status = 'active';
        this.emit('deviceStatusChanged', deviceId, 'active');
      }
    }
  }

  /**
   * Get device registration by ID
   */
  public getDevice(deviceId: string): DeviceRegistration | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * Get all registered devices
   */
  public getAllDevices(): DeviceRegistration[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get devices by type
   */
  public getDevicesByType(deviceType: DeviceType): DeviceRegistration[] {
    return Array.from(this.devices.values()).filter(
      (device) => device.deviceInfo.deviceType === deviceType
    );
  }

  /**
   * Get active devices
   */
  public getActiveDevices(): DeviceRegistration[] {
    return Array.from(this.devices.values()).filter((device) => device.status === 'active');
  }

  /**
   * Remove device from registry
   */
  public removeDevice(deviceId: string): boolean {
    const device = this.devices.get(deviceId);
    if (device) {
      this.devices.delete(deviceId);
      this.emit('deviceRemoved', deviceId);

      logger.info('Device removed from registry', {
        deviceId,
        totalDevices: this.devices.size,
      });

      return true;
    }
    return false;
  }

  /**
   * Update device metadata
   */
  public updateDeviceMetadata(deviceId: string, metadata: Record<string, any>): boolean {
    const device = this.devices.get(deviceId);
    if (device) {
      device.metadata = { ...device.metadata, ...metadata };
      this.emit('deviceUpdated', device);
      return true;
    }
    return false;
  }

  /**
   * Check if device exists
   */
  public hasDevice(deviceId: string): boolean {
    return this.devices.has(deviceId);
  }

  /**
   * Get registry statistics
   */
  public getStats() {
    const devices = Array.from(this.devices.values());
    const now = Date.now();

    return {
      totalDevices: devices.length,
      activeDevices: devices.filter((d) => d.status === 'active').length,
      inactiveDevices: devices.filter((d) => d.status === 'inactive').length,
      offlineDevices: devices.filter((d) => d.status === 'offline').length,
      deviceTypes: devices.reduce(
        (acc, device) => {
          acc[device.deviceInfo.deviceType] = (acc[device.deviceInfo.deviceType] || 0) + 1;
          return acc;
        },
        {} as Record<DeviceType, number>
      ),
      averageAge:
        devices.length > 0
          ? devices.reduce((sum, d) => sum + (now - d.registeredAt.getTime()), 0) / devices.length
          : 0,
    };
  }

  /**
   * Start cleanup timer for inactive devices
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupInactiveDevices();
    }, this.config.cleanupInterval);
  }

  /**
   * Clean up inactive devices
   */
  private cleanupInactiveDevices(): void {
    const now = Date.now();
    const devicesToRemove: string[] = [];

    for (const [deviceId, device] of this.devices) {
      const timeSinceLastSeen = now - device.lastSeen.getTime();

      if (timeSinceLastSeen > this.config.inactiveTimeout) {
        if (device.status === 'active') {
          device.status = 'inactive';
          this.emit('deviceStatusChanged', deviceId, 'inactive');
        } else if (
          device.status === 'inactive' &&
          timeSinceLastSeen > this.config.inactiveTimeout * 2
        ) {
          device.status = 'offline';
          this.emit('deviceStatusChanged', deviceId, 'offline');
        } else if (
          device.status === 'offline' &&
          timeSinceLastSeen > this.config.inactiveTimeout * 4
        ) {
          devicesToRemove.push(deviceId);
        }
      }
    }

    // Remove offline devices that have been offline too long
    for (const deviceId of devicesToRemove) {
      this.removeDevice(deviceId);
    }

    if (devicesToRemove.length > 0) {
      logger.debug('Cleaned up inactive devices', {
        removedCount: devicesToRemove.length,
        totalDevices: this.devices.size,
      });
    }
  }

  /**
   * Validate device registration
   */
  public async validateDeviceRegistration(deviceInfo: DeviceInfo): Promise<boolean> {
    try {
      // Basic validation checks
      if (!deviceInfo.deviceId || !deviceInfo.deviceType || !deviceInfo.userId) {
        return false;
      }

      // Check if device ID is valid format
      if (typeof deviceInfo.deviceId !== 'string' || deviceInfo.deviceId.length < 3) {
        return false;
      }

      // Check if user ID is valid
      if (typeof deviceInfo.userId !== 'string' || deviceInfo.userId.length < 1) {
        return false;
      }

      // Additional validation logic can be added here
      return true;
    } catch (error) {
      logger.error('Device registration validation failed', {
        deviceId: deviceInfo.deviceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Update device status
   */
  public updateDeviceStatus(deviceId: string, status: DeviceRegistration['status']): boolean {
    const device = this.devices.get(deviceId);
    if (device) {
      const oldStatus = device.status;
      device.status = status;
      device.lastSeen = new Date();

      if (oldStatus !== status) {
        this.emit('deviceStatusChanged', deviceId, status);
        logger.debug('Device status updated', {
          deviceId,
          oldStatus,
          newStatus: status,
        });
      }

      return true;
    }
    return false;
  }

  /**
   * Destroy the registry and clean up resources
   */
  public async destroy(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined as any;
    }

    this.devices.clear();
    this.removeAllListeners();

    logger.info('Device Registry destroyed');
  }
}

/**
 * Default device registry configuration
 */
export const defaultDeviceRegistryConfig: DeviceRegistryConfig = {
  maxDevices: 1000,
  inactiveTimeout: 5 * 60 * 1000, // 5 minutes
  cleanupInterval: 60 * 1000, // 1 minute
  persistToDisk: false,
};
