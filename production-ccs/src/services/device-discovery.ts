/**
 * Device Discovery Service
 * Handles device discovery, pairing, and capability detection
 */

import { EventEmitter } from 'events';
import {
  DeviceDiscoveryRequest,
  DeviceDiscoveryResult,
  DiscoveredDevice,
  DiscoveryType,
  DeviceFilter,
  FilterType,
  FilterOperator,
  DeviceAvailability,
  DeviceDiscoveryError,
  DeviceRelayConfig,
} from '../types/device-relay';
import { DeviceInfo, DeviceCapabilities } from '../types/rccs';

/**
 * Device Discovery Service
 * Manages device discovery and pairing operations
 */
export class DeviceDiscoveryService extends EventEmitter {
  private discoveryCache: Map<string, DiscoveredDevice[]> = new Map();
  private activeDiscoveries: Map<string, DeviceDiscoveryRequest> = new Map();
  private isRunning = false;

  constructor(private config: DeviceRelayConfig) {
    super();
  }

  /**
   * Initialize the discovery service
   */
  async initialize(): Promise<void> {
    this.isRunning = true;
    this.emit('discovery:initialized');
  }

  /**
   * Shutdown the discovery service
   */
  async shutdown(): Promise<void> {
    this.isRunning = false;
    this.activeDiscoveries.clear();
    this.discoveryCache.clear();
    this.emit('discovery:shutdown');
  }

  /**
   * Discover devices based on request criteria
   */
  async discoverDevices(request: DeviceDiscoveryRequest): Promise<DeviceDiscoveryResult> {
    if (!this.isRunning) {
      throw new DeviceDiscoveryError('Discovery service not running');
    }

    const startTime = Date.now();
    const requestId = `discovery-${request.userId}-${startTime}`;

    try {
      this.activeDiscoveries.set(requestId, request);

      // Check cache first
      const cachedResults = this.getCachedResults(request);
      if (cachedResults.length > 0) {
        return {
          requestId,
          discoveredDevices: cachedResults,
          totalFound: cachedResults.length,
          discoveryTime: Date.now() - startTime,
          completedAt: new Date(),
        };
      }

      // Perform discovery based on type
      const discoveredDevices = await this.performDiscovery(request);

      // Apply filters
      const filteredDevices = this.applyFilters(discoveredDevices, request.filters);

      // Cache results
      this.cacheResults(request, filteredDevices);

      const result: DeviceDiscoveryResult = {
        requestId,
        discoveredDevices: filteredDevices,
        totalFound: filteredDevices.length,
        discoveryTime: Date.now() - startTime,
        completedAt: new Date(),
      };

      this.emit('discovery:completed', result);
      return result;
    } catch (error) {
      const errorResult: DeviceDiscoveryResult = {
        requestId,
        discoveredDevices: [],
        totalFound: 0,
        discoveryTime: Date.now() - startTime,
        completedAt: new Date(),
        errors: [
          {
            deviceId: request.requestingDeviceId,
            error: error instanceof Error ? error.message : 'Unknown error',
            code: 'DISCOVERY_FAILED',
            timestamp: new Date(),
          },
        ],
      };

      this.emit('discovery:failed', errorResult);
      throw new DeviceDiscoveryError(
        `Discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      this.activeDiscoveries.delete(requestId);
    }
  }

  /**
   * Get active discovery requests
   */
  getActiveDiscoveries(): DeviceDiscoveryRequest[] {
    return Array.from(this.activeDiscoveries.values());
  }

  /**
   * Clear discovery cache
   */
  clearCache(): void {
    this.discoveryCache.clear();
  }

  // Private methods

  private getCachedResults(request: DeviceDiscoveryRequest): DiscoveredDevice[] {
    const cacheKey = this.generateCacheKey(request);
    const cached = this.discoveryCache.get(cacheKey);

    if (!cached) {
      return [];
    }

    // Check if cache is still valid
    if (cached.length > 0 && cached[0]) {
      const cacheAge = Date.now() - cached[0].deviceInfo.lastSeen.getTime();
      if (cacheAge > this.config.discovery.cacheTimeout) {
        this.discoveryCache.delete(cacheKey);
        return [];
      }
    }

    return cached;
  }

  private async performDiscovery(request: DeviceDiscoveryRequest): Promise<DiscoveredDevice[]> {
    switch (request.discoveryType) {
      case DiscoveryType.FULL_SCAN:
        return this.performFullScan(request);

      case DiscoveryType.CAPABILITY_MATCH:
        return this.performCapabilityMatch(request);

      case DiscoveryType.PROXIMITY_BASED:
        return this.performProximityDiscovery(request);

      case DiscoveryType.PERFORMANCE_BASED:
        return this.performPerformanceDiscovery(request);

      default:
        return this.performFullScan(request);
    }
  }

  private async performFullScan(request: DeviceDiscoveryRequest): Promise<DiscoveredDevice[]> {
    // Simulate device discovery
    // In a real implementation, this would scan the network, query databases, etc.

    const mockDevices: DiscoveredDevice[] = [
      {
        deviceInfo: {
          id: `device-${Date.now()}-1`,
          userId: request.userId,
          type: 'mobile',
          platform: 'iOS',
          version: '1.0.0',
          capabilities: {
            supportsFileSync: true,
            supportsVoiceCommands: true,
            supportsVideoStreaming: false,
            supportsNotifications: true,
            maxFileSize: 100 * 1024 * 1024, // 100MB
            supportedFormats: ['jpg', 'png', 'pdf', 'txt'],
          },
          lastSeen: new Date(),
          status: 'online',
        },
        matchScore: 0.9,
        capabilities: {
          supportsFileSync: true,
          supportsVoiceCommands: true,
          supportsVideoStreaming: false,
          supportsNotifications: true,
          maxFileSize: 100 * 1024 * 1024,
          supportedFormats: ['jpg', 'png', 'pdf', 'txt'],
        },
        performance: {
          cpuUsage: 25,
          memoryUsage: 40,
          batteryLevel: 85,
          networkStrength: 0.9,
          responseTime: 150,
          throughput: 1000,
          lastMeasured: new Date(),
        },
        availability: DeviceAvailability.AVAILABLE,
      },
      {
        deviceInfo: {
          id: `device-${Date.now()}-2`,
          userId: request.userId,
          type: 'desktop',
          platform: 'Windows',
          version: '1.0.0',
          capabilities: {
            supportsFileSync: true,
            supportsVoiceCommands: false,
            supportsVideoStreaming: true,
            supportsNotifications: true,
            maxFileSize: 1024 * 1024 * 1024, // 1GB
            supportedFormats: ['jpg', 'png', 'pdf', 'txt', 'mp4', 'avi'],
          },
          lastSeen: new Date(),
          status: 'online',
        },
        matchScore: 0.95,
        capabilities: {
          supportsFileSync: true,
          supportsVoiceCommands: false,
          supportsVideoStreaming: true,
          supportsNotifications: true,
          maxFileSize: 1024 * 1024 * 1024,
          supportedFormats: ['jpg', 'png', 'pdf', 'txt', 'mp4', 'avi'],
        },
        performance: {
          cpuUsage: 15,
          memoryUsage: 30,
          networkStrength: 1.0,
          responseTime: 50,
          throughput: 5000,
          lastMeasured: new Date(),
        },
        availability: DeviceAvailability.AVAILABLE,
      },
    ];

    // Simulate discovery delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    return mockDevices;
  }

  private async performCapabilityMatch(
    request: DeviceDiscoveryRequest
  ): Promise<DiscoveredDevice[]> {
    const allDevices = await this.performFullScan(request);

    // Filter devices based on capability requirements
    // This would typically involve more sophisticated matching logic
    return allDevices.filter((device) => {
      // Example: prioritize devices with file sync capability
      return device.capabilities.supportsFileSync;
    });
  }

  private async performProximityDiscovery(
    request: DeviceDiscoveryRequest
  ): Promise<DiscoveredDevice[]> {
    const allDevices = await this.performFullScan(request);

    // Add proximity information (simulated)
    return allDevices
      .map((device) => ({
        ...device,
        distance: Math.random() * 100, // Simulated distance in meters
        matchScore: device.matchScore * (1 - Math.random() * 0.3), // Adjust score based on proximity
      }))
      .sort((a, b) => (a.distance || 0) - (b.distance || 0));
  }

  private async performPerformanceDiscovery(
    request: DeviceDiscoveryRequest
  ): Promise<DiscoveredDevice[]> {
    const allDevices = await this.performFullScan(request);

    // Sort by performance score
    return allDevices.sort((a, b) => {
      const scoreA = this.calculatePerformanceScore(a.performance);
      const scoreB = this.calculatePerformanceScore(b.performance);
      return scoreB - scoreA;
    });
  }

  private calculatePerformanceScore(performance: any): number {
    let score = 100;
    score -= performance.cpuUsage * 0.4;
    score -= performance.memoryUsage * 0.3;
    score *= performance.networkStrength;
    score -= Math.min(50, performance.responseTime / 100);
    return Math.max(0, score);
  }

  private applyFilters(devices: DiscoveredDevice[], filters?: DeviceFilter[]): DiscoveredDevice[] {
    if (!filters || filters.length === 0) {
      return devices;
    }

    return devices.filter((device) => {
      return filters.every((filter) => this.matchesFilter(device, filter));
    });
  }

  private matchesFilter(device: DiscoveredDevice, filter: DeviceFilter): boolean {
    let value: any;

    switch (filter.type) {
      case FilterType.DEVICE_TYPE:
        value = device.deviceInfo.type;
        break;
      case FilterType.PLATFORM:
        value = device.deviceInfo.platform;
        break;
      case FilterType.CAPABILITY:
        // Handle capability filtering
        return this.matchesCapabilityFilter(device, filter);
      case FilterType.PERFORMANCE:
        // Handle performance filtering
        return this.matchesPerformanceFilter(device, filter);
      case FilterType.BATTERY_LEVEL:
        value = device.performance.batteryLevel;
        break;
      default:
        return true;
    }

    return this.compareValues(value, filter.value, filter.operator);
  }

  private matchesCapabilityFilter(device: DiscoveredDevice, filter: DeviceFilter): boolean {
    const capabilities = device.capabilities;
    const requiredCapability = filter.value;

    switch (requiredCapability) {
      case 'fileSync':
        return capabilities.supportsFileSync;
      case 'voiceCommands':
        return capabilities.supportsVoiceCommands;
      case 'videoStreaming':
        return capabilities.supportsVideoStreaming;
      case 'notifications':
        return capabilities.supportsNotifications;
      default:
        return true;
    }
  }

  private matchesPerformanceFilter(device: DiscoveredDevice, filter: DeviceFilter): boolean {
    const performance = device.performance;
    const threshold = filter.value;

    // Example: filter by CPU usage threshold
    if (filter.operator === FilterOperator.LESS_THAN) {
      return performance.cpuUsage < threshold;
    }

    return true;
  }

  private compareValues(value: any, filterValue: any, operator: FilterOperator): boolean {
    switch (operator) {
      case FilterOperator.EQUALS:
        return value === filterValue;
      case FilterOperator.NOT_EQUALS:
        return value !== filterValue;
      case FilterOperator.GREATER_THAN:
        return value > filterValue;
      case FilterOperator.LESS_THAN:
        return value < filterValue;
      case FilterOperator.CONTAINS:
        return String(value).includes(String(filterValue));
      case FilterOperator.IN:
        return Array.isArray(filterValue) && filterValue.includes(value);
      default:
        return true;
    }
  }

  private cacheResults(request: DeviceDiscoveryRequest, devices: DiscoveredDevice[]): void {
    const cacheKey = this.generateCacheKey(request);
    this.discoveryCache.set(cacheKey, devices);

    // Clean up old cache entries
    setTimeout(() => {
      this.discoveryCache.delete(cacheKey);
    }, this.config.discovery.cacheTimeout);
  }

  private generateCacheKey(request: DeviceDiscoveryRequest): string {
    return `${request.userId}-${request.discoveryType}-${JSON.stringify(request.filters || [])}`;
  }
}
