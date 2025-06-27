/**
 * Device Relay Service
 * Main coordination service for multi-device communication, discovery, and handoff
 */

import { EventEmitter } from 'events';
import {
  DeviceTopology,
  DeviceNode,
  DeviceRole,
  DevicePerformance,
  DeviceRelayConfig,
  DeviceRelayMetrics,
  DeviceRelayEvents,
  DeviceRelayError,
  HandoffRequest,
  HandoffResult,
  DeviceDiscoveryRequest,
  DeviceDiscoveryResult,
  CapabilityNegotiation,
  NegotiationResult,
  DeviceRelayMessage,
  RelayMessageType,
  RoutingStrategy,
  ConnectionQuality,
} from '../types/device-relay';
import {
  DeviceInfo,
  Session,
  CloudMessage,
  CloudMessageType,
  MessagePriority,
  RCCSEvents,
} from '../types/rccs';
import { DeviceDiscoveryService } from './device-discovery';
import { DeviceHandoffService } from './device-handoff';
import { CapabilityNegotiationService } from './capability-negotiation';

/**
 * Device Relay Service
 * Coordinates multi-device communication and manages device topology
 */
export class DeviceRelayService extends EventEmitter {
  private topologies: Map<string, DeviceTopology> = new Map();
  private deviceNodes: Map<string, DeviceNode> = new Map();
  private activeHandoffs: Map<string, HandoffRequest> = new Map();
  private performanceCache: Map<string, DevicePerformance> = new Map();
  private metrics: DeviceRelayMetrics = {
    totalDevices: 0,
    activeDevices: 0,
    discoveryRequests: 0,
    successfulDiscoveries: 0,
    handoffRequests: 0,
    successfulHandoffs: 0,
    averageHandoffTime: 0,
    capabilityNegotiations: 0,
    routedMessages: 0,
    failedRoutes: 0,
    averageLatency: 0,
    lastUpdated: new Date(),
  };
  private isRunning = false;
  private monitoringInterval?: NodeJS.Timeout;

  constructor(
    private config: DeviceRelayConfig,
    private discoveryService: DeviceDiscoveryService,
    private handoffService: DeviceHandoffService,
    private capabilityService: CapabilityNegotiationService
  ) {
    super();
    this.initializeMetrics();
    this.setupEventHandlers();
  }

  /**
   * Initialize the device relay service
   */
  async initialize(): Promise<void> {
    try {
      await this.discoveryService.initialize();
      await this.handoffService.initialize();
      await this.capabilityService.initialize();

      this.startPerformanceMonitoring();
      this.isRunning = true;

      this.emit('relay:initialized');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new DeviceRelayError(
        `Failed to initialize device relay service: ${errorMessage}`,
        'INITIALIZATION_FAILED'
      );
    }
  }

  /**
   * Shutdown the device relay service
   */
  async shutdown(): Promise<void> {
    this.isRunning = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    await Promise.all([
      this.discoveryService.shutdown(),
      this.handoffService.shutdown(),
      this.capabilityService.shutdown(),
    ]);

    this.emit('relay:shutdown');
  }

  /**
   * Register a device in the relay system
   */
  async registerDevice(deviceInfo: DeviceInfo, session: Session): Promise<void> {
    try {
      const userId = deviceInfo.userId;
      let topology = this.topologies.get(userId);

      if (!topology) {
        topology = this.createDeviceTopology(userId);
        this.topologies.set(userId, topology);
      }

      const deviceNode = this.createDeviceNode(deviceInfo, session);
      this.deviceNodes.set(deviceInfo.id, deviceNode);
      topology.devices.set(deviceInfo.id, deviceNode);

      // Assign role based on device type and current topology
      await this.assignDeviceRole(deviceNode, topology);

      // Update topology version and timestamp
      topology.version++;
      topology.lastUpdated = new Date();

      // Broadcast topology update
      await this.broadcastTopologyUpdate(topology);

      this.metrics.totalDevices++;
      this.metrics.activeDevices++;
      this.updateMetrics();

      this.emit('device:registered', deviceInfo, deviceNode);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new DeviceRelayError(
        `Failed to register device ${deviceInfo.id}: ${errorMessage}`,
        'DEVICE_REGISTRATION_FAILED',
        deviceInfo.id
      );
    }
  }

  /**
   * Unregister a device from the relay system
   */
  async unregisterDevice(deviceId: string): Promise<void> {
    try {
      const deviceNode = this.deviceNodes.get(deviceId);
      if (!deviceNode) {
        return; // Device not registered
      }

      const userId = deviceNode.deviceInfo.userId;
      const topology = this.topologies.get(userId);

      if (topology) {
        topology.devices.delete(deviceId);
        topology.version++;
        topology.lastUpdated = new Date();

        // Reassign primary device if necessary
        if (topology.primaryDevice === deviceId) {
          await this.reassignPrimaryDevice(topology);
        }

        // Broadcast topology update
        await this.broadcastTopologyUpdate(topology);
      }

      this.deviceNodes.delete(deviceId);
      this.performanceCache.delete(deviceId);

      this.metrics.activeDevices = Math.max(0, this.metrics.activeDevices - 1);
      this.updateMetrics();

      this.emit('device:unregistered', deviceId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new DeviceRelayError(
        `Failed to unregister device ${deviceId}: ${errorMessage}`,
        'DEVICE_UNREGISTRATION_FAILED',
        deviceId
      );
    }
  }

  /**
   * Discover devices for a user
   */
  async discoverDevices(request: DeviceDiscoveryRequest): Promise<DeviceDiscoveryResult> {
    try {
      this.metrics.discoveryRequests++;

      const result = await this.discoveryService.discoverDevices(request);

      if (result.discoveredDevices.length > 0) {
        this.metrics.successfulDiscoveries++;
      }

      this.updateMetrics();
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new DeviceRelayError(
        `Device discovery failed: ${errorMessage}`,
        'DISCOVERY_FAILED',
        request.requestingDeviceId
      );
    }
  }

  /**
   * Initiate device handoff
   */
  async initiateHandoff(request: HandoffRequest): Promise<HandoffResult> {
    try {
      this.metrics.handoffRequests++;
      this.activeHandoffs.set(request.id, request);

      const startTime = Date.now();
      const result = await this.handoffService.executeHandoff(request);
      const handoffTime = Date.now() - startTime;

      if (result.success) {
        this.metrics.successfulHandoffs++;
        this.metrics.averageHandoffTime = (this.metrics.averageHandoffTime + handoffTime) / 2;
      }

      this.activeHandoffs.delete(request.id);
      this.updateMetrics();

      this.emit('handoff:completed', result);
      return result;
    } catch (error) {
      this.activeHandoffs.delete(request.id);
      this.emit('handoff:failed', request, error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new DeviceRelayError(
        `Handoff failed: ${errorMessage}`,
        'HANDOFF_FAILED',
        request.fromDeviceId
      );
    }
  }

  /**
   * Negotiate device capabilities
   */
  async negotiateCapabilities(negotiation: CapabilityNegotiation): Promise<NegotiationResult> {
    try {
      this.metrics.capabilityNegotiations++;

      const result = await this.capabilityService.negotiate(negotiation);

      this.updateMetrics();
      this.emit('capability:negotiated', result);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new DeviceRelayError(
        `Capability negotiation failed: ${errorMessage}`,
        'CAPABILITY_NEGOTIATION_FAILED'
      );
    }
  }

  /**
   * Route a message through the device relay system
   */
  async routeMessage(message: DeviceRelayMessage): Promise<void> {
    try {
      const startTime = Date.now();

      // Determine optimal routing path
      const routingPath = await this.calculateRoutingPath(message);

      // Execute message routing
      await this.executeMessageRouting(message, routingPath);

      const latency = Date.now() - startTime;
      this.metrics.routedMessages++;
      this.metrics.averageLatency = (this.metrics.averageLatency + latency) / 2;
      this.updateMetrics();

      this.emit('relay:message:routed', message, routingPath);
    } catch (error) {
      this.metrics.failedRoutes++;
      this.updateMetrics();

      this.emit('relay:message:failed', message, error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new DeviceRelayError(`Message routing failed: ${errorMessage}`, 'ROUTING_FAILED');
    }
  }

  /**
   * Update device performance metrics
   */
  async updateDevicePerformance(deviceId: string, performance: DevicePerformance): Promise<void> {
    try {
      this.performanceCache.set(deviceId, performance);

      const deviceNode = this.deviceNodes.get(deviceId);
      if (deviceNode) {
        deviceNode.performance = performance;
        deviceNode.lastActivity = new Date();

        // Update connection quality based on performance
        await this.updateConnectionQuality(deviceNode);

        // Check if device role should be reassigned
        const topology = this.topologies.get(deviceNode.deviceInfo.userId);
        if (topology) {
          await this.evaluateRoleReassignment(deviceNode, topology);
        }
      }

      this.emit('performance:updated', deviceId, performance);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new DeviceRelayError(
        `Failed to update device performance: ${errorMessage}`,
        'PERFORMANCE_UPDATE_FAILED',
        deviceId
      );
    }
  }

  /**
   * Get device topology for a user
   */
  getDeviceTopology(userId: string): DeviceTopology | undefined {
    return this.topologies.get(userId);
  }

  /**
   * Get device node information
   */
  getDeviceNode(deviceId: string): DeviceNode | undefined {
    return this.deviceNodes.get(deviceId);
  }

  /**
   * Get current metrics
   */
  getMetrics(): DeviceRelayMetrics {
    return { ...this.metrics };
  }

  /**
   * Get active handoffs
   */
  getActiveHandoffs(): HandoffRequest[] {
    return Array.from(this.activeHandoffs.values());
  }

  // Private methods

  private initializeMetrics(): void {
    this.metrics = {
      totalDevices: 0,
      activeDevices: 0,
      discoveryRequests: 0,
      successfulDiscoveries: 0,
      handoffRequests: 0,
      successfulHandoffs: 0,
      averageHandoffTime: 0,
      capabilityNegotiations: 0,
      routedMessages: 0,
      failedRoutes: 0,
      averageLatency: 0,
      lastUpdated: new Date(),
    };
  }

  private setupEventHandlers(): void {
    // Discovery service events
    this.discoveryService.on('device:discovered', (device, requestId) => {
      this.emit('device:discovered', device, requestId);
    });

    // Handoff service events
    this.handoffService.on('handoff:initiated', (request) => {
      this.emit('handoff:initiated', request);
    });

    // Capability service events
    this.capabilityService.on('capability:negotiated', (result) => {
      this.emit('capability:negotiated', result);
    });
  }

  private createDeviceTopology(userId: string): DeviceTopology {
    return {
      userId,
      devices: new Map(),
      lastUpdated: new Date(),
      version: 1,
    };
  }

  private createDeviceNode(deviceInfo: DeviceInfo, session: Session): DeviceNode {
    return {
      deviceInfo,
      connections: [
        {
          connectionId: session.connectionId,
          quality: ConnectionQuality.GOOD,
          latency: 0,
          bandwidth: 0,
          reliability: 1.0,
          lastPing: new Date(),
          isActive: true,
        },
      ],
      priority: this.calculateDevicePriority(deviceInfo),
      role: DeviceRole.SECONDARY,
      capabilities: deviceInfo.capabilities,
      performance: {
        cpuUsage: 0,
        memoryUsage: 0,
        networkStrength: 1.0,
        responseTime: 0,
        throughput: 0,
        lastMeasured: new Date(),
      },
      lastActivity: new Date(),
      isReachable: true,
    };
  }

  private calculateDevicePriority(deviceInfo: DeviceInfo): number {
    let priority = 0;

    // Base priority by device type
    switch (deviceInfo.type) {
      case 'desktop':
        priority += 100;
        break;
      case 'mobile':
        priority += 50;
        break;
      case 'extension':
        priority += 75;
        break;
    }

    // Capability bonuses
    if (deviceInfo.capabilities.supportsFileSync) priority += 10;
    if (deviceInfo.capabilities.supportsVoiceCommands) priority += 5;
    if (deviceInfo.capabilities.supportsVideoStreaming) priority += 15;
    if (deviceInfo.capabilities.supportsNotifications) priority += 5;

    return priority;
  }

  private async assignDeviceRole(deviceNode: DeviceNode, topology: DeviceTopology): Promise<void> {
    // If this is the first device, make it primary
    if (topology.devices.size === 1) {
      deviceNode.role = DeviceRole.PRIMARY;
      topology.primaryDevice = deviceNode.deviceInfo.id;
      return;
    }

    // Assign role based on priority and current topology
    const currentPrimary = topology.primaryDevice
      ? topology.devices.get(topology.primaryDevice)
      : null;

    if (!currentPrimary || deviceNode.priority > currentPrimary.priority) {
      // Demote current primary to secondary
      if (currentPrimary) {
        currentPrimary.role = DeviceRole.SECONDARY;
      }

      // Promote this device to primary
      deviceNode.role = DeviceRole.PRIMARY;
      topology.primaryDevice = deviceNode.deviceInfo.id;
    } else {
      deviceNode.role = DeviceRole.SECONDARY;
    }
  }

  private async reassignPrimaryDevice(topology: DeviceTopology): Promise<void> {
    let bestDevice: DeviceNode | null = null;
    let highestPriority = -1;

    for (const device of topology.devices.values()) {
      if (device.isReachable && device.priority > highestPriority) {
        bestDevice = device;
        highestPriority = device.priority;
      }
    }

    if (bestDevice) {
      bestDevice.role = DeviceRole.PRIMARY;
      topology.primaryDevice = bestDevice.deviceInfo.id;
    } else {
      delete topology.primaryDevice;
    }
  }

  private async broadcastTopologyUpdate(topology: DeviceTopology): Promise<void> {
    // Broadcast to all devices in the topology
    for (const deviceNode of topology.devices.values()) {
      if (deviceNode.isReachable) {
        try {
          const message: DeviceRelayMessage = {
            id: `topology-${topology.userId}-${deviceNode.deviceInfo.id}-${Date.now()}`,
            type: CloudMessageType.DEVICE_STATUS,
            fromDeviceId: 'system',
            toDeviceId: deviceNode.deviceInfo.id,
            userId: topology.userId,
            payload: {
              topology: {
                userId: topology.userId,
                devices: Array.from(topology.devices.entries()).map(([id, node]) => ({
                  id,
                  deviceInfo: node.deviceInfo,
                  role: node.role,
                  priority: node.priority,
                  isReachable: node.isReachable,
                  lastActivity: node.lastActivity,
                })),
                primaryDevice: topology.primaryDevice,
                version: topology.version,
                lastUpdated: topology.lastUpdated,
              },
            },
            timestamp: new Date(),
            priority: MessagePriority.NORMAL,
            requiresAck: false,
            relayType: RelayMessageType.TOPOLOGY_UPDATE,
            routingInfo: {
              routingStrategy: RoutingStrategy.DIRECT,
              maxHops: 1,
              ttl: 30000,
            },
            deliveryOptions: {
              requiresAck: false,
              timeout: 5000,
              retryCount: 2,
              retryDelay: 1000,
              fallbackToAny: false,
              preserveOrder: false,
            },
          };

          await this.routeMessage(message);
        } catch (error) {
          // Log error but continue with other devices
          console.error(
            `Failed to broadcast topology update to device ${deviceNode.deviceInfo.id}:`,
            error
          );
        }
      }
    }
  }

  private async updateConnectionQuality(deviceNode: DeviceNode): Promise<void> {
    const performance = deviceNode.performance;

    // Calculate connection quality based on performance metrics
    let qualityScore = 100;

    // CPU usage impact (0-100%)
    qualityScore -= performance.cpuUsage * 0.3;

    // Memory usage impact (0-100%)
    qualityScore -= performance.memoryUsage * 0.2;

    // Network strength impact (0-1)
    qualityScore *= performance.networkStrength;

    // Response time impact (higher is worse)
    if (performance.responseTime > 1000) {
      qualityScore -= Math.min(50, (performance.responseTime - 1000) / 100);
    }

    // Update connection quality
    for (const connection of deviceNode.connections) {
      if (qualityScore >= 80) {
        connection.quality = ConnectionQuality.EXCELLENT;
      } else if (qualityScore >= 60) {
        connection.quality = ConnectionQuality.GOOD;
      } else if (qualityScore >= 40) {
        connection.quality = ConnectionQuality.FAIR;
      } else if (qualityScore >= 20) {
        connection.quality = ConnectionQuality.POOR;
      } else {
        connection.quality = ConnectionQuality.UNSTABLE;
      }

      connection.reliability = Math.max(0, Math.min(1, qualityScore / 100));
      connection.lastPing = new Date();
    }
  }

  private async evaluateRoleReassignment(
    deviceNode: DeviceNode,
    topology: DeviceTopology
  ): Promise<void> {
    // Check if device performance has changed significantly
    const currentPrimary = topology.primaryDevice
      ? topology.devices.get(topology.primaryDevice)
      : null;

    if (!currentPrimary || currentPrimary.deviceInfo.id === deviceNode.deviceInfo.id) {
      return; // No reassignment needed
    }

    // Calculate performance score
    const deviceScore = this.calculatePerformanceScore(deviceNode);
    const primaryScore = this.calculatePerformanceScore(currentPrimary);

    // Reassign if this device significantly outperforms the current primary
    if (deviceScore > primaryScore * 1.2) {
      // 20% better performance threshold
      // Demote current primary
      currentPrimary.role = DeviceRole.SECONDARY;

      // Promote this device
      deviceNode.role = DeviceRole.PRIMARY;
      topology.primaryDevice = deviceNode.deviceInfo.id;

      // Update topology
      topology.version++;
      topology.lastUpdated = new Date();

      // Broadcast the change
      await this.broadcastTopologyUpdate(topology);

      this.emit('topology:updated', topology);
    }
  }

  private calculatePerformanceScore(deviceNode: DeviceNode): number {
    const perf = deviceNode.performance;
    let score = 100;

    // Lower CPU and memory usage is better
    score -= perf.cpuUsage * 0.4;
    score -= perf.memoryUsage * 0.3;

    // Higher network strength is better
    score *= perf.networkStrength;

    // Lower response time is better
    score -= Math.min(50, perf.responseTime / 100);

    // Higher throughput is better (normalized)
    score += Math.min(20, perf.throughput / 1000);

    // Battery level consideration for mobile devices
    if (perf.batteryLevel !== undefined) {
      if (perf.batteryLevel < 20) {
        score *= 0.5; // Heavily penalize low battery
      } else if (perf.batteryLevel < 50) {
        score *= 0.8; // Moderately penalize medium battery
      }
    }

    return Math.max(0, score);
  }

  private async calculateRoutingPath(message: DeviceRelayMessage): Promise<string[]> {
    const strategy = message.routingInfo.routingStrategy;
    const fromDevice = this.deviceNodes.get(message.fromDeviceId);
    const toDevice = message.toDeviceId ? this.deviceNodes.get(message.toDeviceId) : null;

    if (!fromDevice) {
      throw new DeviceRelayError(
        `Source device not found: ${message.fromDeviceId}`,
        'DEVICE_NOT_FOUND',
        message.fromDeviceId
      );
    }

    // Direct routing
    if (strategy === RoutingStrategy.DIRECT && toDevice && message.toDeviceId) {
      return [message.fromDeviceId, message.toDeviceId];
    }

    // Get user topology for intelligent routing
    const topology = this.topologies.get(message.userId);
    if (!topology) {
      throw new DeviceRelayError(
        `No topology found for user: ${message.userId}`,
        'TOPOLOGY_NOT_FOUND'
      );
    }

    switch (strategy) {
      case RoutingStrategy.BEST_PERFORMANCE:
        return this.calculateBestPerformancePath(message, topology);

      case RoutingStrategy.SHORTEST_PATH:
        return this.calculateShortestPath(message, topology);

      case RoutingStrategy.LOAD_BALANCED:
        return this.calculateLoadBalancedPath(message, topology);

      case RoutingStrategy.REDUNDANT:
        return this.calculateRedundantPath(message, topology);

      default:
        const fallbackDevice = message.toDeviceId || topology.primaryDevice;
        if (fallbackDevice) {
          return [message.fromDeviceId, fallbackDevice];
        }
        return [message.fromDeviceId];
    }
  }

  private calculateBestPerformancePath(
    message: DeviceRelayMessage,
    topology: DeviceTopology
  ): string[] {
    const devices = Array.from(topology.devices.values())
      .filter((device) => device.isReachable)
      .sort((a, b) => this.calculatePerformanceScore(b) - this.calculatePerformanceScore(a));

    if (message.toDeviceId) {
      return [message.fromDeviceId, message.toDeviceId];
    }

    // Route to best performing device
    const bestDevice = devices[0];
    return bestDevice ? [message.fromDeviceId, bestDevice.deviceInfo.id] : [message.fromDeviceId];
  }

  private calculateShortestPath(message: DeviceRelayMessage, topology: DeviceTopology): string[] {
    // For now, implement direct routing (can be enhanced with graph algorithms)
    if (message.toDeviceId) {
      return [message.fromDeviceId, message.toDeviceId];
    }

    const primaryDevice = topology.primaryDevice;
    if (primaryDevice) {
      return [message.fromDeviceId, primaryDevice];
    }
    return [message.fromDeviceId];
  }

  private calculateLoadBalancedPath(
    message: DeviceRelayMessage,
    topology: DeviceTopology
  ): string[] {
    // Simple load balancing - route to least busy device
    const devices = Array.from(topology.devices.values())
      .filter((device) => device.isReachable && device.deviceInfo.id !== message.fromDeviceId)
      .sort((a, b) => a.performance.cpuUsage - b.performance.cpuUsage);

    if (message.toDeviceId) {
      return [message.fromDeviceId, message.toDeviceId];
    }

    const leastBusyDevice = devices[0];
    return leastBusyDevice
      ? [message.fromDeviceId, leastBusyDevice.deviceInfo.id]
      : [message.fromDeviceId];
  }

  private calculateRedundantPath(message: DeviceRelayMessage, topology: DeviceTopology): string[] {
    // For redundant routing, we would typically return multiple paths
    // For now, return primary path with fallback
    const primaryPath = this.calculateBestPerformancePath(message, topology);

    if (message.routingInfo.fallbackDevices && message.routingInfo.fallbackDevices.length > 0) {
      return [...primaryPath, ...message.routingInfo.fallbackDevices];
    }

    return primaryPath;
  }

  private async executeMessageRouting(
    message: DeviceRelayMessage,
    routingPath: string[]
  ): Promise<void> {
    if (routingPath.length < 2) {
      throw new DeviceRelayError(
        'Invalid routing path - must have at least source and destination',
        'INVALID_ROUTING_PATH'
      );
    }

    const targetDeviceId = routingPath[routingPath.length - 1];
    if (!targetDeviceId) {
      throw new DeviceRelayError(
        'Invalid routing path - no target device specified',
        'INVALID_ROUTING_PATH'
      );
    }
    const targetDevice = this.deviceNodes.get(targetDeviceId);

    if (!targetDevice || !targetDevice.isReachable) {
      throw new DeviceRelayError(
        `Target device unreachable: ${targetDeviceId}`,
        'DEVICE_UNREACHABLE',
        targetDeviceId
      );
    }

    // For now, simulate message delivery
    // In a real implementation, this would integrate with the WebSocket manager
    // to actually send the message through the established connections

    // Update message routing info
    message.routingInfo.preferredPath = routingPath;
    message.timestamp = new Date();

    // Simulate delivery delay based on connection quality
    const connection = targetDevice.connections[0];
    if (connection) {
      const delay = this.calculateDeliveryDelay(connection.quality);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  private calculateDeliveryDelay(quality: ConnectionQuality): number {
    switch (quality) {
      case ConnectionQuality.EXCELLENT:
        return 10;
      case ConnectionQuality.GOOD:
        return 50;
      case ConnectionQuality.FAIR:
        return 100;
      case ConnectionQuality.POOR:
        return 250;
      case ConnectionQuality.UNSTABLE:
        return 500;
      default:
        return 100;
    }
  }

  private startPerformanceMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.updateMetrics();

      // Check device health and update reachability
      for (const [deviceId, deviceNode] of this.deviceNodes) {
        const timeSinceLastActivity = Date.now() - deviceNode.lastActivity.getTime();
        const isStale = timeSinceLastActivity > this.config.performance.monitoringInterval * 3;

        if (isStale && deviceNode.isReachable) {
          deviceNode.isReachable = false;
          this.emit('device:lost', deviceId, 'Activity timeout');
        }
      }
    }, this.config.performance.monitoringInterval);
  }

  private updateMetrics(): void {
    this.metrics.lastUpdated = new Date();
    this.metrics.activeDevices = Array.from(this.deviceNodes.values()).filter(
      (device) => device.isReachable
    ).length;
  }
}
