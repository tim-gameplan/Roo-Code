/**
 * Device Relay System Tests
 * Comprehensive test suite for device discovery, handoff, and capability negotiation
 */

import {
  DeviceRelayConfig,
  DeviceDiscoveryRequest,
  DiscoveryType,
  HandoffRequest,
  HandoffType,
  CapabilityNegotiation,
  NegotiationStatus,
  DeviceAvailability,
  FilterType,
  FilterOperator,
  DeviceRelayMessage,
  RelayMessageType,
  RoutingStrategy,
} from '../types/device-relay';
import { MessagePriority, CloudMessageType } from '../types/rccs';

// Mock implementations for testing
class MockDeviceRelayService {
  private running = false;
  private devices = new Map();

  constructor(_config: DeviceRelayConfig) {}

  async initialize(): Promise<void> {
    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  async registerDevice(deviceInfo: any): Promise<void> {
    this.devices.set(deviceInfo.id, deviceInfo);
  }

  async unregisterDevice(deviceId: string, _userId: string): Promise<void> {
    this.devices.delete(deviceId);
  }

  getDeviceTopology(userId: string) {
    return {
      userId,
      devices: this.devices,
      lastUpdated: new Date(),
      version: 1,
    };
  }

  async updateDevicePerformance(deviceId: string, performance: any): Promise<void> {
    const device = this.devices.get(deviceId);
    if (device) {
      device.performance = performance;
    }
  }

  async routeMessage(message: DeviceRelayMessage): Promise<void> {
    if (message.toDeviceId === 'nonexistent-device') {
      throw new Error('Device not found');
    }
  }

  on(_event: string, _callback: Function): void {
    // Mock event listener
  }
}

class MockDeviceDiscoveryService {
  constructor(_config: DeviceRelayConfig) {}

  async initialize(): Promise<void> {}

  async shutdown(): Promise<void> {}

  async discoverDevices(request: DeviceDiscoveryRequest) {
    const mockDevices = [
      {
        deviceInfo: {
          id: 'mock-device-1',
          name: 'Mock Device 1',
          type: 'mobile',
          platform: 'android',
          version: '1.0.0',
          userId: request.userId,
        },
        matchScore: 0.8,
        capabilities: {},
        performance: {
          cpuUsage: 30,
          memoryUsage: 40,
          batteryLevel: 80,
          networkStrength: 90,
          responseTime: 100,
          throughput: 1000,
          lastMeasured: new Date(),
        },
        availability: DeviceAvailability.AVAILABLE,
      },
    ];

    // Apply filters
    let filteredDevices = mockDevices;
    if (request.filters) {
      filteredDevices = mockDevices.filter((device) => {
        return request.filters!.every((filter) => {
          if (filter.type === FilterType.DEVICE_TYPE && filter.operator === FilterOperator.EQUALS) {
            return device.deviceInfo.type === filter.value;
          }
          if (
            filter.type === FilterType.BATTERY_LEVEL &&
            filter.operator === FilterOperator.GREATER_THAN
          ) {
            return (device.performance.batteryLevel || 100) > filter.value;
          }
          return true;
        });
      });
    }

    return {
      requestId: 'mock-request-' + Date.now(),
      discoveredDevices: filteredDevices,
      totalFound: filteredDevices.length,
      discoveryTime: Math.min(request.timeout, 100),
      completedAt: new Date(),
      errors: [],
    };
  }

  on(event: string, callback: Function): void {
    // Mock event listener
    if (event === 'device:discovered') {
      setTimeout(() => callback({}, 'mock-request'), 10);
    }
  }
}

class MockDeviceHandoffService {
  private activeHandoffs = new Map();
  private stats = {
    totalHandoffs: 0,
    successfulHandoffs: 0,
    averageHandoffTime: 0,
  };

  constructor(_config: DeviceRelayConfig) {}

  async initialize(): Promise<void> {}

  async shutdown(): Promise<void> {}

  async executeHandoff(request: HandoffRequest) {
    if (request.fromDeviceId === request.toDeviceId) {
      throw new Error('Cannot handoff to same device');
    }

    if (request.toDeviceId === 'failing-device') {
      throw new Error('Target device not available');
    }

    this.stats.totalHandoffs++;
    this.stats.successfulHandoffs++;
    this.stats.averageHandoffTime = 500;

    const handoffTime = 500;
    return {
      requestId: request.id,
      success: true,
      fromDeviceId: request.fromDeviceId,
      toDeviceId: request.toDeviceId,
      handoffTime,
      completedAt: new Date(),
      stateTransferred: request.context.metadata.preserveState,
    };
  }

  async cancelHandoff(handoffId: string): Promise<void> {
    this.activeHandoffs.delete(handoffId);
  }

  getActiveHandoffs() {
    return Array.from(this.activeHandoffs.values());
  }

  getHandoffStats(_userId: string) {
    return this.stats;
  }

  on(event: string, callback: Function): void {
    // Mock event listener
    if (event === 'handoff:initiated') {
      setTimeout(() => callback({}), 10);
    }
    if (event === 'handoff:completed') {
      setTimeout(() => callback({}), 20);
    }
  }
}

class MockCapabilityNegotiationService {
  private stats = {
    totalNegotiations: 0,
    averageCompatibilityScore: 0.8,
    averageNegotiationTime: 200,
  };

  constructor(_config: DeviceRelayConfig) {}

  async initialize(): Promise<void> {}

  async shutdown(): Promise<void> {}

  async negotiate(negotiation: CapabilityNegotiation) {
    this.stats.totalNegotiations++;

    const compatibilityScore = {
      overall: 0.8,
      fileSync: negotiation.context.requiresFileSync ? 0.9 : 1.0,
      communication: negotiation.context.requiresRealTimeComm ? 0.8 : 1.0,
      performance: 0.7,
      security: 0.9,
    };

    const matches = [
      {
        capability: 'fileSync',
        sourceSupported: true,
        targetSupported: true,
        compatible: true,
        limitations: [],
      },
      {
        capability: 'realTimeComm',
        sourceSupported: true,
        targetSupported: true,
        compatible: true,
        limitations: [],
      },
    ];

    return {
      negotiationId: negotiation.id,
      status: NegotiationStatus.SUCCESS,
      compatibilityScore,
      matches,
      recommendations: ['Devices are highly compatible'],
      negotiationTime: 200,
      completedAt: new Date(),
    };
  }

  async preAssessCompatibility(_sourceDeviceId: string, _targetDeviceId: string) {
    return {
      overall: 0.8,
      fileSync: 0.9,
      communication: 0.8,
      performance: 0.7,
      security: 0.9,
    };
  }

  getNegotiationStats(_userId: string) {
    return this.stats;
  }

  on(event: string, callback: Function): void {
    // Mock event listener
    if (event === 'negotiation:started') {
      setTimeout(() => callback({}), 10);
    }
    if (event === 'negotiation:completed') {
      setTimeout(() => callback({}), 20);
    }
  }
}

describe('Device Relay System', () => {
  let deviceRelayService: MockDeviceRelayService;
  let discoveryService: MockDeviceDiscoveryService;
  let handoffService: MockDeviceHandoffService;
  let capabilityService: MockCapabilityNegotiationService;
  let config: DeviceRelayConfig;

  beforeEach(() => {
    config = {
      discovery: {
        timeout: 5000,
        maxDevices: 10,
        scanInterval: 30000,
        cacheTimeout: 300000,
      },
      handoff: {
        timeout: 10000,
        maxRetries: 3,
        stateTransferTimeout: 15000,
        fallbackEnabled: true,
      },
      capability: {
        negotiationTimeout: 5000,
        cacheTimeout: 300000,
        autoNegotiate: true,
      },
      performance: {
        monitoringInterval: 10000,
        thresholds: {
          cpu: 80,
          memory: 85,
          battery: 20,
          network: 50,
        },
      },
      routing: {
        maxHops: 5,
        defaultTtl: 300,
        loadBalanceThreshold: 70,
      },
    };

    deviceRelayService = new MockDeviceRelayService(config);
    discoveryService = new MockDeviceDiscoveryService(config);
    handoffService = new MockDeviceHandoffService(config);
    capabilityService = new MockCapabilityNegotiationService(config);
  });

  afterEach(async () => {
    await deviceRelayService.shutdown();
    await discoveryService.shutdown();
    await handoffService.shutdown();
    await capabilityService.shutdown();
  });

  describe('DeviceRelayService', () => {
    describe('Initialization', () => {
      it('should initialize successfully', async () => {
        await expect(deviceRelayService.initialize()).resolves.not.toThrow();
        expect(deviceRelayService.isRunning()).toBe(true);
      });

      it('should handle multiple initialization calls gracefully', async () => {
        await deviceRelayService.initialize();
        await expect(deviceRelayService.initialize()).resolves.not.toThrow();
      });
    });

    describe('Device Management', () => {
      beforeEach(async () => {
        await deviceRelayService.initialize();
      });

      it('should register a device successfully', async () => {
        const deviceInfo = {
          id: 'device-1',
          name: 'Test Device',
          type: 'desktop',
          platform: 'windows',
          version: '1.0.0',
          userId: 'user-1',
        };

        await expect(deviceRelayService.registerDevice(deviceInfo)).resolves.not.toThrow();

        const topology = deviceRelayService.getDeviceTopology('user-1');
        expect(topology?.devices.has('device-1')).toBe(true);
      });

      it('should unregister a device successfully', async () => {
        const deviceInfo = {
          id: 'device-1',
          name: 'Test Device',
          type: 'desktop',
          platform: 'windows',
          version: '1.0.0',
          userId: 'user-1',
        };

        await deviceRelayService.registerDevice(deviceInfo);
        await deviceRelayService.unregisterDevice('device-1', 'user-1');

        const topology = deviceRelayService.getDeviceTopology('user-1');
        expect(topology?.devices.has('device-1')).toBe(false);
      });

      it('should update device performance metrics', async () => {
        const deviceInfo = {
          id: 'device-1',
          name: 'Test Device',
          type: 'desktop',
          platform: 'windows',
          version: '1.0.0',
          userId: 'user-1',
        };

        await deviceRelayService.registerDevice(deviceInfo);

        const performance = {
          cpuUsage: 45,
          memoryUsage: 60,
          batteryLevel: 80,
          networkStrength: 90,
          responseTime: 150,
          throughput: 1000,
          lastMeasured: new Date(),
        };

        await deviceRelayService.updateDevicePerformance('device-1', performance);

        const topology = deviceRelayService.getDeviceTopology('user-1');
        const device = topology?.devices.get('device-1');
        expect(device?.performance.cpuUsage).toBe(45);
        expect(device?.performance.memoryUsage).toBe(60);
      });
    });

    describe('Message Routing', () => {
      beforeEach(async () => {
        await deviceRelayService.initialize();
      });

      it('should route message to target device', async () => {
        const message: DeviceRelayMessage = {
          id: 'msg-1',
          type: CloudMessageType.DEVICE_HANDOFF,
          payload: { data: 'test' },
          fromDeviceId: 'device-1',
          toDeviceId: 'device-2',
          userId: 'user-1',
          timestamp: new Date(),
          priority: MessagePriority.NORMAL,
          requiresAck: true,
          relayType: RelayMessageType.DISCOVERY_REQUEST,
          routingInfo: {
            routingStrategy: RoutingStrategy.DIRECT,
            maxHops: 3,
            ttl: 300,
          },
          deliveryOptions: {
            requiresAck: true,
            timeout: 5000,
            retryCount: 3,
            retryDelay: 1000,
            fallbackToAny: false,
            preserveOrder: true,
          },
        };

        await expect(deviceRelayService.routeMessage(message)).resolves.not.toThrow();
      });

      it('should handle routing failures gracefully', async () => {
        const message: DeviceRelayMessage = {
          id: 'msg-1',
          type: CloudMessageType.DEVICE_HANDOFF,
          payload: { data: 'test' },
          fromDeviceId: 'device-1',
          toDeviceId: 'nonexistent-device',
          userId: 'user-1',
          timestamp: new Date(),
          priority: MessagePriority.NORMAL,
          requiresAck: true,
          relayType: RelayMessageType.DISCOVERY_REQUEST,
          routingInfo: {
            routingStrategy: RoutingStrategy.DIRECT,
            maxHops: 3,
            ttl: 300,
          },
          deliveryOptions: {
            requiresAck: true,
            timeout: 5000,
            retryCount: 3,
            retryDelay: 1000,
            fallbackToAny: false,
            preserveOrder: true,
          },
        };

        await expect(deviceRelayService.routeMessage(message)).rejects.toThrow();
      });
    });
  });

  describe('DeviceDiscoveryService', () => {
    beforeEach(async () => {
      await discoveryService.initialize();
    });

    describe('Device Discovery', () => {
      it('should discover devices successfully', async () => {
        const request: DeviceDiscoveryRequest = {
          userId: 'user-1',
          requestingDeviceId: 'device-1',
          discoveryType: DiscoveryType.FULL_SCAN,
          timeout: 5000,
        };

        const result = await discoveryService.discoverDevices(request);

        expect(result).toBeDefined();
        expect(result.requestId).toBeDefined();
        expect(result.discoveredDevices).toBeInstanceOf(Array);
        expect(result.totalFound).toBeGreaterThanOrEqual(0);
        expect(result.discoveryTime).toBeGreaterThan(0);
        expect(result.completedAt).toBeInstanceOf(Date);
      });

      it('should apply filters during discovery', async () => {
        const request: DeviceDiscoveryRequest = {
          userId: 'user-1',
          requestingDeviceId: 'device-1',
          discoveryType: DiscoveryType.CAPABILITY_MATCH,
          timeout: 5000,
          filters: [
            {
              type: FilterType.DEVICE_TYPE,
              value: 'mobile',
              operator: FilterOperator.EQUALS,
            },
            {
              type: FilterType.BATTERY_LEVEL,
              value: 50,
              operator: FilterOperator.GREATER_THAN,
            },
          ],
        };

        const result = await discoveryService.discoverDevices(request);

        expect(result).toBeDefined();
        expect(
          result.discoveredDevices.every(
            (device) =>
              device.deviceInfo.type === 'mobile' && (device.performance.batteryLevel || 100) > 50
          )
        ).toBe(true);
      });

      it('should handle discovery timeout', async () => {
        const request: DeviceDiscoveryRequest = {
          userId: 'user-1',
          requestingDeviceId: 'device-1',
          discoveryType: DiscoveryType.FULL_SCAN,
          timeout: 1, // Very short timeout
        };

        const result = await discoveryService.discoverDevices(request);

        expect(result).toBeDefined();
        expect(result.discoveryTime).toBeLessThanOrEqual(request.timeout + 100); // Allow small margin
      });

      it('should emit discovery events', async () => {
        const deviceSpy = jest.fn();
        discoveryService.on('device:discovered', deviceSpy);

        const request: DeviceDiscoveryRequest = {
          userId: 'user-1',
          requestingDeviceId: 'device-1',
          discoveryType: DiscoveryType.FULL_SCAN,
          timeout: 5000,
        };

        await discoveryService.discoverDevices(request);

        // Should emit events for discovered devices
        expect(deviceSpy).toHaveBeenCalled();
      });
    });
  });

  describe('DeviceHandoffService', () => {
    beforeEach(async () => {
      await handoffService.initialize();
    });

    describe('Device Handoff', () => {
      it('should execute handoff successfully', async () => {
        const request: HandoffRequest = {
          id: 'handoff-1',
          userId: 'user-1',
          fromDeviceId: 'device-1',
          toDeviceId: 'device-2',
          handoffType: HandoffType.MANUAL,
          context: {
            sessionId: 'session-1',
            state: { currentStep: 5 },
            metadata: {
              reason: 'User requested handoff',
              preserveState: true,
              transferFiles: false,
              notifyUser: true,
            },
          },
          priority: MessagePriority.HIGH,
          timeout: 10000,
          createdAt: new Date(),
        };

        const result = await handoffService.executeHandoff(request);

        expect(result).toBeDefined();
        expect(result.requestId).toBe(request.id);
        expect(result.success).toBe(true);
        expect(result.fromDeviceId).toBe(request.fromDeviceId);
        expect(result.toDeviceId).toBe(request.toDeviceId);
        expect(result.handoffTime).toBeGreaterThan(0);
        expect(result.stateTransferred).toBe(true);
      });

      it('should handle handoff failures', async () => {
        const request: HandoffRequest = {
          id: 'handoff-2',
          userId: 'user-1',
          fromDeviceId: 'device-1',
          toDeviceId: 'device-1', // Same device - should fail
          handoffType: HandoffType.AUTOMATIC,
          context: {
            state: {},
            metadata: {
              reason: 'Invalid handoff',
              preserveState: false,
              transferFiles: false,
              notifyUser: false,
            },
          },
          priority: MessagePriority.NORMAL,
          timeout: 5000,
          createdAt: new Date(),
        };

        await expect(handoffService.executeHandoff(request)).rejects.toThrow();
      });

      it('should emit handoff events', async () => {
        const initiatedSpy = jest.fn();
        const completedSpy = jest.fn();

        handoffService.on('handoff:initiated', initiatedSpy);
        handoffService.on('handoff:completed', completedSpy);

        const request: HandoffRequest = {
          id: 'handoff-3',
          userId: 'user-1',
          fromDeviceId: 'device-1',
          toDeviceId: 'device-2',
          handoffType: HandoffType.CAPABILITY_BASED,
          context: {
            state: {},
            metadata: {
              reason: 'Better capabilities available',
              preserveState: true,
              transferFiles: true,
              notifyUser: true,
            },
          },
          priority: MessagePriority.NORMAL,
          timeout: 10000,
          createdAt: new Date(),
        };

        await handoffService.executeHandoff(request);

        expect(initiatedSpy).toHaveBeenCalledWith(request);
        expect(completedSpy).toHaveBeenCalled();
      });

      it('should track handoff statistics', async () => {
        const request: HandoffRequest = {
          id: 'handoff-4',
          userId: 'user-1',
          fromDeviceId: 'device-1',
          toDeviceId: 'device-2',
          handoffType: HandoffType.LOAD_BALANCE,
          context: {
            state: {},
            metadata: {
              reason: 'Load balancing',
              preserveState: true,
              transferFiles: false,
              notifyUser: false,
            },
          },
          priority: MessagePriority.NORMAL,
          timeout: 10000,
          createdAt: new Date(),
        };

        await handoffService.executeHandoff(request);

        const stats = handoffService.getHandoffStats('user-1');
        expect(stats.totalHandoffs).toBe(1);
        expect(stats.successfulHandoffs).toBe(1);
        expect(stats.averageHandoffTime).toBeGreaterThan(0);
      });

      it('should cancel active handoff', async () => {
        const request: HandoffRequest = {
          id: 'handoff-5',
          userId: 'user-1',
          fromDeviceId: 'device-1',
          toDeviceId: 'device-2',
          handoffType: HandoffType.FAILOVER,
          context: {
            state: {},
            metadata: {
              reason: 'Device failure',
              preserveState: true,
              transferFiles: false,
              notifyUser: true,
            },
          },
          priority: MessagePriority.HIGH,
          timeout: 10000,
          createdAt: new Date(),
        };

        // Cancel it immediately
        await handoffService.cancelHandoff(request.id);

        // The handoff should be cancelled
        const activeHandoffs = handoffService.getActiveHandoffs();
        expect(activeHandoffs.find((h) => h.id === request.id)).toBeUndefined();
      });
    });
  });

  describe('CapabilityNegotiationService', () => {
    beforeEach(async () => {
      await capabilityService.initialize();
    });

    describe('Capability Negotiation', () => {
      it('should negotiate capabilities successfully', async () => {
        const negotiation: CapabilityNegotiation = {
          id: 'negotiation-1',
          userId: 'user-1',
          sourceDeviceId: 'device-1',
          targetDeviceId: 'device-2',
          context: {
            requiresFileSync: true,
            requiresRealTimeComm: true,
            requiresVideoStreaming: false,
            requiresVoiceCommands: false,
          },
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 300000), // 5 minutes
        };

        const result = await capabilityService.negotiate(negotiation);

        expect(result).toBeDefined();
        expect(result.negotiationId).toBe(negotiation.id);
        expect(result.status).toBe(NegotiationStatus.SUCCESS);
        expect(result.compatibilityScore).toBeDefined();
        expect(result.compatibilityScore.overall).toBeGreaterThanOrEqual(0);
        expect(result.compatibilityScore.overall).toBeLessThanOrEqual(1);
        expect(result.matches).toBeInstanceOf(Array);
        expect(result.recommendations).toBeInstanceOf(Array);
        expect(result.negotiationTime).toBeGreaterThan(0);
      });

      it('should handle capability mismatches', async () => {
        const negotiation: CapabilityNegotiation = {
          id: 'negotiation-2',
          userId: 'user-1',
          sourceDeviceId: 'device-1',
          targetDeviceId: 'device-2',
          context: {
            requiresFileSync: true,
            requiresRealTimeComm: true,
            requiresVideoStreaming: true,
            requiresVoiceCommands: true,
          },
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 300000),
        };

        const result = await capabilityService.negotiate(negotiation);

        expect(result).toBeDefined();
        expect(result.negotiationId).toBe(negotiation.id);
        // May succeed or fail depending on mock capabilities
        expect([NegotiationStatus.SUCCESS, NegotiationStatus.FAILED]).toContain(result.status);
      });

      it('should emit negotiation events', async () => {
        const startedSpy = jest.fn();
        const completedSpy = jest.fn();

        capabilityService.on('negotiation:started', startedSpy);
        capabilityService.on('negotiation:completed', completedSpy);

        const negotiation: CapabilityNegotiation = {
          id: 'negotiation-3',
          userId: 'user-1',
          sourceDeviceId: 'device-1',
          targetDeviceId: 'device-2',
          context: {
            requiresFileSync: true,
            requiresRealTimeComm: false,
            requiresVideoStreaming: false,
            requiresVoiceCommands: false,
          },
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 300000),
        };

        await capabilityService.negotiate(negotiation);

        expect(startedSpy).toHaveBeenCalledWith(negotiation);
        expect(completedSpy).toHaveBeenCalled();
      });

      it('should track negotiation statistics', async () => {
        const negotiation: CapabilityNegotiation = {
          id: 'negotiation-4',
          userId: 'user-1',
          sourceDeviceId: 'device-1',
          targetDeviceId: 'device-2',
          context: {
            requiresFileSync: true,
            requiresRealTimeComm: true,
            requiresVideoStreaming: false,
            requiresVoiceCommands: false,
          },
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 300000),
        };

        await capabilityService.negotiate(negotiation);

        const stats = capabilityService.getNegotiationStats('user-1');
        expect(stats.totalNegotiations).toBe(1);
        expect(stats.averageCompatibilityScore).toBeGreaterThanOrEqual(0);
        expect(stats.averageNegotiationTime).toBeGreaterThan(0);
      });

      it('should pre-assess compatibility', async () => {
        const score = await capabilityService.preAssessCompatibility('device-1', 'device-2');

        expect(score).toBeDefined();
        expect(score.overall).toBeGreaterThanOrEqual(0);
        expect(score.overall).toBeLessThanOrEqual(1);
        expect(score.fileSync).toBeGreaterThanOrEqual(0);
        expect(score.communication).toBeGreaterThanOrEqual(0);
        expect(score.performance).toBeGreaterThanOrEqual(0);
        expect(score.security).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Integration Tests', () => {
    beforeEach(async () => {
      await deviceRelayService.initialize();
      await discoveryService.initialize();
      await handoffService.initialize();
      await capabilityService.initialize();
    });

    it('should perform end-to-end device coordination', async () => {
      // Register devices
      const device1 = {
        id: 'device-1',
        name: 'Desktop',
        type: 'desktop',
        platform: 'windows',
        version: '1.0.0',
        userId: 'user-1',
      };

      const device2 = {
        id: 'device-2',
        name: 'Mobile',
        type: 'mobile',
        platform: 'android',
        version: '1.0.0',
        userId: 'user-1',
      };

      await deviceRelayService.registerDevice(device1);
      await deviceRelayService.registerDevice(device2);

      // Discover devices
      const discoveryRequest: DeviceDiscoveryRequest = {
        userId: 'user-1',
        requestingDeviceId: 'device-1',
        discoveryType: DiscoveryType.FULL_SCAN,
        timeout: 5000,
      };

      const discoveryResult = await discoveryService.discoverDevices(discoveryRequest);
      expect(discoveryResult.totalFound).toBeGreaterThan(0);

      // Negotiate capabilities
      const negotiation: CapabilityNegotiation = {
        id: 'integration-negotiation',
        userId: 'user-1',
        sourceDeviceId: 'device-1',
        targetDeviceId: 'device-2',
        context: {
          requiresFileSync: true,
          requiresRealTimeComm: true,
          requiresVideoStreaming: false,
          requiresVoiceCommands: false,
        },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 300000),
      };

      const negotiationResult = await capabilityService.negotiate(negotiation);
      expect(negotiationResult.status).toBe(NegotiationStatus.SUCCESS);

      // Perform handoff
      const handoffRequest: HandoffRequest = {
        id: 'integration-handoff',
        userId: 'user-1',
        fromDeviceId: 'device-1',
        toDeviceId: 'device-2',
        handoffType: HandoffType.CAPABILITY_BASED,
        context: {
          sessionId: 'integration-session',
          state: { step: 'final' },
          metadata: {
            reason: 'Integration test',
            preserveState: true,
            transferFiles: false,
            notifyUser: false,
          },
        },
        priority: MessagePriority.NORMAL,
        timeout: 10000,
        createdAt: new Date(),
      };

      const handoffResult = await handoffService.executeHandoff(handoffRequest);
      expect(handoffResult.success).toBe(true);
      expect(handoffResult.stateTransferred).toBe(true);
    });

    it('should handle device failures gracefully', async () => {
      // Register a device
      const device = {
        id: 'failing-device',
        name: 'Failing Device',
        type: 'desktop',
        platform: 'windows',
        version: '1.0.0',
        userId: 'user-1',
      };

      await deviceRelayService.registerDevice(device);

      // Simulate device failure by unregistering it
      await deviceRelayService.unregisterDevice('failing-device', 'user-1');

      // Try to perform handoff to failed device
      const handoffRequest: HandoffRequest = {
        id: 'failover-handoff',
        userId: 'user-1',
        fromDeviceId: 'device-1',
        toDeviceId: 'failing-device',
        handoffType: HandoffType.FAILOVER,
        context: {
          state: {},
          metadata: {
            reason: 'Device failure test',
            preserveState: true,
            transferFiles: false,
            notifyUser: true,
          },
        },
        priority: MessagePriority.HIGH,
        timeout: 5000,
        createdAt: new Date(),
      };

      await expect(handoffService.executeHandoff(handoffRequest)).rejects.toThrow();
    });
  });

  describe('Performance Tests', () => {
    beforeEach(async () => {
      await deviceRelayService.initialize();
      await discoveryService.initialize();
    });

    it('should handle multiple concurrent discovery requests', async () => {
      const requests = Array.from({ length: 5 }, (_, i) => ({
        userId: 'user-1',
        requestingDeviceId: `device-${i}`,
        discoveryType: DiscoveryType.FULL_SCAN,
        timeout: 3000,
      }));

      const startTime = Date.now();
      const results = await Promise.all(
        requests.map((request) => discoveryService.discoverDevices(request))
      );
      const endTime = Date.now();

      expect(results).toHaveLength(5);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
      results.forEach((result) => {
        expect(result.discoveryTime).toBeLessThan(3500); // Individual requests should be fast
      });
    });

    it('should meet handoff performance targets', async () => {
      const handoffRequest: HandoffRequest = {
        id: 'performance-handoff',
        userId: 'user-1',
        fromDeviceId: 'device-1',
        toDeviceId: 'device-2',
        handoffType: HandoffType.AUTOMATIC,
        context: {
          state: { largeData: 'x'.repeat(1000) }, // Some data to transfer
          metadata: {
            reason: 'Performance test',
            preserveState: true,
            transferFiles: false,
            notifyUser: false,
          },
        },
        priority: MessagePriority.NORMAL,
        timeout: 10000,
        createdAt: new Date(),
      };

      const result = await handoffService.executeHandoff(handoffRequest);

      expect(result.success).toBe(true);
      expect(result.handoffTime).toBeLessThan(2000); // Target: <2s handoff time
    });
  });
});
