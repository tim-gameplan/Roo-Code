/**
 * Enhanced WebSocket Protocol Tests for TASK-005.1.2
 *
 * This module tests the enhanced WebSocket protocol implementation
 * including transport layer optimizations, connection state management,
 * auto-reconnection, message compression, and batching capabilities.
 */

import {
  EnhancedWebSocketProtocol,
  EnhancedProtocolConfig,
} from '../services/enhanced-websocket-protocol';
import {
  MobileMessage,
  DeviceInfo,
  MessagePriority,
  CompressionType,
  BackoffStrategy,
} from '../types/mobile';

// Mock dependencies
jest.mock('../services/compression');
jest.mock('../services/message-batcher');
jest.mock('../services/message-queue');
jest.mock('../utils/logger');

describe('EnhancedWebSocketProtocol', () => {
  let protocol: EnhancedWebSocketProtocol;
  let mockConfig: EnhancedProtocolConfig;
  let mockDeviceInfo: DeviceInfo;

  beforeEach(() => {
    mockConfig = {
      websocket: {
        url: 'ws://localhost:8080',
        timeout: 5000,
        pingInterval: 30000,
        pongTimeout: 5000,
      },
      connection: {
        maxAttempts: 3,
        backoffStrategy: 'exponential' as BackoffStrategy,
        baseDelay: 1000,
        maxDelay: 30000,
        jitter: false,
        timeout: 5000,
      },
      batching: {
        enabled: true,
        maxSize: 5,
        maxWait: 100,
        priorityThreshold: 'normal' as MessagePriority,
      },
      queue: {
        maxSize: 1000,
        persistToDisk: false,
        retryAttempts: 3,
        retryDelay: 1000,
        ttl: 300000,
      },
      compression: {
        enabled: true,
        algorithms: ['gzip'] as CompressionType[],
        threshold: 1024,
        level: 6,
      },
      heartbeat: {
        interval: 30000,
        timeout: 5000,
        maxMissed: 3,
      },
      retry: {
        maxAttempts: 5,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffStrategy: 'exponential' as BackoffStrategy,
        jitter: true,
      },
    };

    mockDeviceInfo = {
      deviceId: 'test-device-123',
      userId: 'test-user-123',
      deviceType: 'mobile',
      platform: 'test',
      version: '1.0.0',
      capabilities: {
        compression: ['gzip'] as CompressionType[],
        maxMessageSize: 1024 * 1024,
        supportsBatching: true,
        supportsOfflineQueue: true,
        batteryOptimized: true,
      },
    };
  });

  afterEach(async () => {
    if (protocol) {
      await protocol.destroy();
    }
  });

  describe('Initialization', () => {
    test('should initialize with correct configuration', () => {
      protocol = new EnhancedWebSocketProtocol(mockConfig, mockDeviceInfo);

      expect(protocol).toBeDefined();
      expect(protocol.getConnectionManager().deviceInfo).toEqual(mockDeviceInfo);
      expect(protocol.getConnectionManager().state).toBe('disconnected');
    });

    test('should generate unique connection ID', () => {
      const protocol1 = new EnhancedWebSocketProtocol(mockConfig, mockDeviceInfo);
      const protocol2 = new EnhancedWebSocketProtocol(mockConfig, mockDeviceInfo);

      const id1 = protocol1.getConnectionManager().connectionId;
      const id2 = protocol2.getConnectionManager().connectionId;

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^conn_\d+_[a-z0-9]+$/);

      protocol1.destroy();
      protocol2.destroy();
    });
  });

  describe('Connection Management', () => {
    beforeEach(() => {
      protocol = new EnhancedWebSocketProtocol(mockConfig, mockDeviceInfo);
    });

    test('should handle connection state changes', async () => {
      const stateChanges: string[] = [];

      protocol = new EnhancedWebSocketProtocol(mockConfig, mockDeviceInfo, {
        onConnectionStateChange: (state) => {
          stateChanges.push(state);
        },
      });

      // Mock successful connection
      const mockConnect = jest.fn().mockResolvedValue(undefined);
      (protocol as any).wsManager.connect = mockConnect;

      await protocol.connect();

      expect(stateChanges).toContain('connecting');
      expect(stateChanges).toContain('connected');
    });

    test('should handle connection errors', async () => {
      const errors: Error[] = [];

      protocol = new EnhancedWebSocketProtocol(mockConfig, mockDeviceInfo, {
        onError: (error) => {
          errors.push(error);
        },
      });

      // Mock connection failure
      const mockConnect = jest.fn().mockRejectedValue(new Error('Connection failed'));
      (protocol as any).wsManager.connect = mockConnect;

      await expect(protocol.connect()).rejects.toThrow('Connection failed');
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Message Handling', () => {
    beforeEach(() => {
      protocol = new EnhancedWebSocketProtocol(mockConfig, mockDeviceInfo);
    });

    test('should queue messages when disconnected', async () => {
      const testMessage: MobileMessage = {
        id: 'test-msg-1',
        timestamp: Date.now(),
        protocolVersion: '1.0.0',
        source: {
          deviceId: 'test-device',
          userId: 'test-user',
          deviceType: 'mobile',
          timestamp: Date.now(),
        },
        destination: {
          target: 'extension',
        },
        type: 'user_input',
        payload: { text: 'Hello' },
        optimization: {
          priority: 'normal',
          requiresAck: false,
          offlineCapable: true,
        },
      };

      // Ensure disconnected state
      expect(protocol.getConnectionManager().state).toBe('disconnected');

      await protocol.sendMessage(testMessage);

      const queueStats = protocol.getQueueStats();
      expect(queueStats.size).toBe(1);
    });

    test('should handle message priorities correctly', async () => {
      const messages: MobileMessage[] = [
        {
          id: 'low-priority',
          timestamp: Date.now(),
          protocolVersion: '1.0.0',
          source: {
            deviceId: 'test-device',
            userId: 'test-user',
            deviceType: 'mobile',
            timestamp: Date.now(),
          },
          destination: {
            target: 'extension',
          },
          type: 'user_input',
          payload: { text: 'Low priority' },
          optimization: {
            priority: 'low',
            requiresAck: false,
            offlineCapable: true,
          },
        },
        {
          id: 'critical-priority',
          timestamp: Date.now(),
          protocolVersion: '1.0.0',
          source: {
            deviceId: 'test-device',
            userId: 'test-user',
            deviceType: 'mobile',
            timestamp: Date.now(),
          },
          destination: {
            target: 'extension',
          },
          type: 'user_input',
          payload: { text: 'Critical priority' },
          optimization: {
            priority: 'critical',
            requiresAck: true,
            offlineCapable: false,
          },
        },
      ];

      for (const message of messages) {
        await protocol.sendMessage(message);
      }

      const queueStats = protocol.getQueueStats();
      expect(queueStats.size).toBe(2);
    });
  });

  describe('Batching and Compression', () => {
    beforeEach(() => {
      protocol = new EnhancedWebSocketProtocol(mockConfig, mockDeviceInfo);
    });

    test('should batch messages efficiently', async () => {
      const messages: MobileMessage[] = [];

      for (let i = 0; i < 5; i++) {
        messages.push({
          id: `batch-msg-${i}`,
          timestamp: Date.now(),
          protocolVersion: '1.0.0',
          source: {
            deviceId: 'test-device',
            userId: 'test-user',
            deviceType: 'mobile',
            timestamp: Date.now(),
          },
          destination: {
            target: 'extension',
          },
          type: 'user_input',
          payload: { text: `Message ${i}` },
          optimization: {
            priority: 'normal',
            requiresAck: false,
            offlineCapable: true,
          },
        });
      }

      // Mock connected state
      (protocol as any).connectionManager.state = 'connected';

      for (const message of messages) {
        await protocol.sendMessage(message);
      }

      const batchStats = protocol.getBatchingStats();
      expect(batchStats.pendingMessages).toBeDefined();
    });

    test('should handle compression configuration', () => {
      const compressionConfig = {
        ...mockConfig,
        compression: {
          enabled: true,
          algorithms: ['gzip', 'brotli'] as CompressionType[],
          threshold: 512,
          level: 9,
        },
      };

      protocol = new EnhancedWebSocketProtocol(compressionConfig, mockDeviceInfo);

      expect(protocol).toBeDefined();
    });
  });

  describe('Reconnection Logic', () => {
    beforeEach(() => {
      protocol = new EnhancedWebSocketProtocol(mockConfig, mockDeviceInfo);
    });

    test('should calculate backoff delays correctly', () => {
      const calculateBackoffDelay = (protocol as any).calculateBackoffDelay.bind(protocol);

      // Test exponential backoff
      const delay1 = calculateBackoffDelay(1);
      const delay2 = calculateBackoffDelay(2);
      const delay3 = calculateBackoffDelay(3);

      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
      expect(delay3).toBeLessThanOrEqual(mockConfig.retry.maxDelay);
    });

    test('should handle reconnection attempts', async () => {
      const reconnectAttempts: number[] = [];

      protocol = new EnhancedWebSocketProtocol(mockConfig, mockDeviceInfo, {
        onReconnect: (attempt) => {
          reconnectAttempts.push(attempt);
        },
      });

      // Simulate connection loss and reconnection attempts
      const attemptReconnection = (protocol as any).attemptReconnection.bind(protocol);

      // Mock the connection manager state
      (protocol as any).connectionManager.state = 'disconnected';
      (protocol as any).connectionManager.metrics.reconnectCount = 0;

      attemptReconnection();

      expect((protocol as any).connectionManager.metrics.reconnectCount).toBe(1);
    });
  });

  describe('Configuration Updates', () => {
    beforeEach(() => {
      protocol = new EnhancedWebSocketProtocol(mockConfig, mockDeviceInfo);
    });

    test('should update configuration dynamically', () => {
      const newConfig = {
        compression: {
          enabled: false,
          algorithms: ['brotli'] as CompressionType[],
          threshold: 2048,
          level: 3,
        },
      };

      protocol.updateConfig(newConfig);

      // Verify configuration was updated
      expect((protocol as any).config.compression.enabled).toBe(false);
      expect((protocol as any).config.compression.threshold).toBe(2048);
    });
  });

  describe('Resource Cleanup', () => {
    beforeEach(() => {
      protocol = new EnhancedWebSocketProtocol(mockConfig, mockDeviceInfo);
    });

    test('should clean up resources on destroy', async () => {
      // Mock some active state
      (protocol as any).isDestroyed = false;
      (protocol as any).pendingAcks.set('test-msg', {
        resolve: jest.fn(),
        reject: jest.fn(),
        timeout: setTimeout(() => {}, 1000),
      });

      await protocol.destroy();

      expect((protocol as any).isDestroyed).toBe(true);
      expect((protocol as any).pendingAcks.size).toBe(0);
    });

    test('should handle multiple destroy calls gracefully', async () => {
      await protocol.destroy();
      await protocol.destroy(); // Should not throw

      expect((protocol as any).isDestroyed).toBe(true);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      protocol = new EnhancedWebSocketProtocol(mockConfig, mockDeviceInfo);
    });

    test('should handle malformed messages gracefully', async () => {
      const errors: Error[] = [];

      protocol = new EnhancedWebSocketProtocol(mockConfig, mockDeviceInfo, {
        onError: (error) => {
          errors.push(error);
        },
      });

      const handleIncomingMessage = (protocol as any).handleIncomingMessage.bind(protocol);

      // Test with invalid JSON
      await handleIncomingMessage('invalid json');

      expect(errors.length).toBeGreaterThan(0);
    });

    test('should handle network errors during send', async () => {
      const errors: Error[] = [];

      protocol = new EnhancedWebSocketProtocol(mockConfig, mockDeviceInfo, {
        onError: (error) => {
          errors.push(error);
        },
      });

      // Mock send failure
      const mockSend = jest.fn().mockRejectedValue(new Error('Network error'));
      (protocol as any).wsManager.send = mockSend;

      const sendBatchToNetwork = (protocol as any).sendBatchToNetwork.bind(protocol);

      const mockBatch = {
        id: 'test-batch',
        messages: [],
        metadata: { messageCount: 0, totalSize: 0, priority: 'normal' as MessagePriority },
      };

      await expect(sendBatchToNetwork(mockBatch)).rejects.toThrow('Network error');
    });
  });

  describe('Statistics and Monitoring', () => {
    beforeEach(() => {
      protocol = new EnhancedWebSocketProtocol(mockConfig, mockDeviceInfo);
    });

    test('should track connection metrics', () => {
      const connectionManager = protocol.getConnectionManager();

      expect(connectionManager.metrics).toBeDefined();
      expect(connectionManager.metrics.messagesReceived).toBe(0);
      expect(connectionManager.metrics.messagesSent).toBe(0);
      expect(connectionManager.metrics.reconnectCount).toBe(0);
    });

    test('should provide queue statistics', () => {
      const queueStats = protocol.getQueueStats();

      expect(queueStats).toBeDefined();
      expect(queueStats.size).toBe(0);
    });

    test('should provide batching statistics', () => {
      const batchStats = protocol.getBatchingStats();

      expect(batchStats).toBeDefined();
      expect(batchStats.pendingMessages).toBeDefined();
    });
  });
});
