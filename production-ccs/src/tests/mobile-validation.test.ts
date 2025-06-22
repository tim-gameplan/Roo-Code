/**
 * Test Suite for Mobile Message Validation - TASK-005.1.1
 *
 * This test suite validates the mobile-optimized message format,
 * validation schemas, and protocol versioning functionality.
 */

import {
  MobileMessage,
  DeviceInfo,
  MessageSource,
  MessageDestination,
  MobileOptimization,
  MOBILE_PROTOCOL_VERSION,
  DEFAULT_MOBILE_CONFIG,
  ValidationError as MobileValidationError,
  CompressionError,
  NetworkError,
  QueueOverflowError,
} from '../types/mobile';
import { MessageValidationService } from '../services/validation';

describe('Mobile Message Validation', () => {
  let validationService: MessageValidationService;

  beforeEach(() => {
    validationService = new MessageValidationService();
  });

  describe('MobileMessage Interface', () => {
    it('should create a valid mobile message', () => {
      const deviceInfo: DeviceInfo = {
        deviceId: 'device-123',
        userId: 'user-456',
        deviceType: 'mobile',
        platform: 'ios',
        version: '1.0.0',
        capabilities: {
          compression: ['gzip', 'brotli'],
          maxMessageSize: 1024000,
          supportsBatching: true,
          supportsOfflineQueue: true,
          batteryOptimized: true,
        },
      };

      const source: MessageSource = {
        deviceId: deviceInfo.deviceId,
        userId: deviceInfo.userId,
        deviceType: deviceInfo.deviceType,
        timestamp: Date.now(),
      };

      const destination: MessageDestination = {
        target: 'extension',
        deviceId: 'target-device-789',
      };

      const optimization: MobileOptimization = {
        priority: 'high',
        ttl: 30000,
        compression: 'gzip',
        requiresAck: true,
        offlineCapable: true,
      };

      const message: MobileMessage = {
        id: 'msg-123',
        timestamp: Date.now(),
        protocolVersion: MOBILE_PROTOCOL_VERSION,
        source,
        destination,
        type: 'command',
        payload: {
          command: 'file_read',
          path: '/home/user/document.txt',
        },
        optimization,
      };

      expect(message.id).toBe('msg-123');
      expect(message.protocolVersion).toBe(MOBILE_PROTOCOL_VERSION);
      expect(message.source.deviceType).toBe('mobile');
      expect(message.destination.target).toBe('extension');
      expect(message.optimization.priority).toBe('high');
    });
  });

  describe('Message Validation Service', () => {
    describe('validateMessage', () => {
      it('should validate a correct mobile message', () => {
        const validMessage = {
          id: 'msg-123',
          timestamp: Date.now(),
          protocolVersion: '1.0.0',
          type: 'command',
          source: {
            deviceId: 'device-123',
            userId: 'user-456',
            deviceType: 'mobile',
            timestamp: Date.now(),
          },
          destination: {
            target: 'extension',
          },
          optimization: {
            priority: 'high',
          },
          payload: {
            command: 'test',
          },
        };

        const result = validationService.validateMessage(validMessage);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject message with missing required fields', () => {
        const invalidMessage = {
          timestamp: Date.now(),
          // Missing id, protocolVersion, type, source, destination, optimization
        };

        const result = validationService.validateMessage(invalidMessage);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.some((e) => e.field === 'id')).toBe(true);
      });

      it('should reject message with invalid device type', () => {
        const invalidMessage = {
          id: 'msg-123',
          timestamp: Date.now(),
          protocolVersion: '1.0.0',
          type: 'command',
          source: {
            deviceId: 'device-123',
            userId: 'user-456',
            deviceType: 'invalid-type', // Invalid device type
            timestamp: Date.now(),
          },
          destination: {
            target: 'extension',
          },
          optimization: {
            priority: 'high',
          },
        };

        const result = validationService.validateMessage(invalidMessage);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.field === 'source.deviceType')).toBe(true);
      });

      it('should reject message with invalid priority', () => {
        const invalidMessage = {
          id: 'msg-123',
          timestamp: Date.now(),
          protocolVersion: '1.0.0',
          type: 'command',
          source: {
            deviceId: 'device-123',
            userId: 'user-456',
            deviceType: 'mobile',
            timestamp: Date.now(),
          },
          destination: {
            target: 'extension',
          },
          optimization: {
            priority: 'invalid-priority', // Invalid priority
          },
        };

        const result = validationService.validateMessage(invalidMessage);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.field === 'optimization.priority')).toBe(true);
      });

      it('should validate device registration message', () => {
        const deviceRegistration = {
          id: 'reg-123',
          timestamp: Date.now(),
          protocolVersion: '1.0.0',
          type: 'device_registration',
          deviceInfo: {
            deviceId: 'device-123',
            userId: 'user-456',
            deviceType: 'mobile',
            platform: 'ios',
            version: '1.0.0',
            capabilities: {
              compression: ['gzip'],
              maxMessageSize: 1024000,
              supportsBatching: true,
              supportsOfflineQueue: true,
              batteryOptimized: true,
            },
          },
        };

        const result = validationService.validateMessage(deviceRegistration, 'device_registration');
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should validate heartbeat message', () => {
        const heartbeat = {
          id: 'hb-123',
          timestamp: Date.now(),
          protocolVersion: '1.0.0',
          type: 'heartbeat',
          connectionId: 'conn-123',
          metrics: {
            messagesReceived: 10,
            messagesSent: 5,
          },
        };

        const result = validationService.validateMessage(heartbeat, 'heartbeat');
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should validate file operation message', () => {
        const fileOperation = {
          id: 'file-123',
          timestamp: Date.now(),
          protocolVersion: '1.0.0',
          type: 'file_operation',
          operation: 'read',
          path: '/home/user/document.txt',
          encoding: 'utf8',
        };

        const result = validationService.validateMessage(fileOperation, 'file_operation');
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe('sanitizeMessage', () => {
      it('should add missing required fields', () => {
        const incompleteMessage = {
          type: 'test',
          payload: { data: 'test' },
        };

        const sanitized = validationService.sanitizeMessage(incompleteMessage);

        expect(sanitized['id']).toBeDefined();
        expect(sanitized['timestamp']).toBeDefined();
        expect(sanitized['protocolVersion']).toBe(MOBILE_PROTOCOL_VERSION);
        expect(sanitized['type']).toBe('test');
      });

      it('should trim and limit string fields', () => {
        const messageWithLongStrings = {
          id: '  msg-123  ',
          type: '  command  ',
          longField: 'a'.repeat(20000), // Very long string
        };

        const sanitized = validationService.sanitizeMessage(messageWithLongStrings);

        expect(sanitized['id']).toBe('msg-123');
        expect(sanitized['type']).toBe('command');
        expect((sanitized['longField'] as string).length).toBe(10000);
      });
    });

    describe('checkCompatibility', () => {
      it('should accept compatible client version', () => {
        const result = validationService.checkCompatibility('1.0.0');
        expect(result.compatible).toBe(true);
        expect(result.requiredUpgrades).toHaveLength(0);
      });

      it('should reject client version below minimum', () => {
        const result = validationService.checkCompatibility('0.9.0');
        expect(result.compatible).toBe(false);
        expect(result.requiredUpgrades.length).toBeGreaterThan(0);
      });

      it('should warn about client version above maximum tested', () => {
        const result = validationService.checkCompatibility('2.0.0');
        expect(result.warnings.length).toBeGreaterThan(0);
      });
    });

    describe('validateMessageOrThrow', () => {
      it('should not throw for valid message', () => {
        const validMessage = {
          id: 'msg-123',
          timestamp: Date.now(),
          protocolVersion: '1.0.0',
          type: 'command',
          source: {
            deviceId: 'device-123',
            userId: 'user-456',
            deviceType: 'mobile',
            timestamp: Date.now(),
          },
          destination: {
            target: 'extension',
          },
          optimization: {
            priority: 'high',
          },
        };

        expect(() => {
          validationService.validateMessageOrThrow(validMessage);
        }).not.toThrow();
      });

      it('should throw MobileValidationError for invalid message', () => {
        const invalidMessage = {
          // Missing required fields
        };

        expect(() => {
          validationService.validateMessageOrThrow(invalidMessage);
        }).toThrow(MobileValidationError);
      });
    });
  });

  describe('Error Classes', () => {
    describe('MobileValidationError', () => {
      it('should create validation error with details', () => {
        const errors = [{ field: 'id', message: 'ID is required', value: undefined }];
        const error = new MobileValidationError('Validation failed', errors);

        expect(error.name).toBe('MobileProtocolError');
        expect(error.code).toBe('VALIDATION_ERROR');
        expect(error.retryable).toBe(false);
        expect(error.validationErrors).toEqual(errors);
      });
    });

    describe('CompressionError', () => {
      it('should create compression error', () => {
        const error = new CompressionError('Failed to compress', 'gzip');

        expect(error.name).toBe('MobileProtocolError');
        expect(error.code).toBe('COMPRESSION_ERROR');
        expect(error.retryable).toBe(false);
        expect(error.message).toContain('gzip');
      });
    });

    describe('NetworkError', () => {
      it('should create network error', () => {
        const error = new NetworkError('Connection failed', 'cellular', true);

        expect(error.name).toBe('MobileProtocolError');
        expect(error.code).toBe('NETWORK_ERROR');
        expect(error.retryable).toBe(true);
        expect(error.networkType).toBe('cellular');
      });
    });

    describe('QueueOverflowError', () => {
      it('should create queue overflow error', () => {
        const error = new QueueOverflowError(1000, 500);

        expect(error.name).toBe('MobileProtocolError');
        expect(error.code).toBe('QUEUE_OVERFLOW');
        expect(error.retryable).toBe(false);
        expect(error.queueSize).toBe(1000);
        expect(error.maxSize).toBe(500);
      });
    });
  });

  describe('Default Configuration', () => {
    it('should have valid default mobile configuration', () => {
      expect(DEFAULT_MOBILE_CONFIG.version).toBe(MOBILE_PROTOCOL_VERSION);
      expect(DEFAULT_MOBILE_CONFIG.compression.enabled).toBe(true);
      expect(DEFAULT_MOBILE_CONFIG.batching.enabled).toBe(true);
      expect(DEFAULT_MOBILE_CONFIG.queue.maxSize).toBeGreaterThan(0);
      expect(DEFAULT_MOBILE_CONFIG.heartbeat.interval).toBeGreaterThan(0);
      expect(DEFAULT_MOBILE_CONFIG.performance.metricsEnabled).toBe(true);
    });

    it('should have reasonable compression settings', () => {
      const compression = DEFAULT_MOBILE_CONFIG.compression;
      expect(compression.algorithms).toContain('gzip');
      expect(compression.threshold).toBeGreaterThan(0);
      expect(compression.level).toBeGreaterThanOrEqual(1);
      expect(compression.level).toBeLessThanOrEqual(9);
    });

    it('should have reasonable batching settings', () => {
      const batching = DEFAULT_MOBILE_CONFIG.batching;
      expect(batching.maxSize).toBeGreaterThan(0);
      expect(batching.maxWait).toBeGreaterThan(0);
      expect(['critical', 'high', 'normal', 'low']).toContain(batching.priorityThreshold);
    });

    it('should have reasonable queue settings', () => {
      const queue = DEFAULT_MOBILE_CONFIG.queue;
      expect(queue.maxSize).toBeGreaterThan(0);
      expect(queue.maxAge).toBeGreaterThan(0);
      expect(queue.retryPolicy.maxAttempts).toBeGreaterThan(0);
      expect(queue.retryPolicy.backoffMultiplier).toBeGreaterThan(1);
    });
  });

  describe('Protocol Versioning', () => {
    it('should support current protocol version', () => {
      const versions = validationService.getSupportedVersions();
      expect(versions.some((v) => v.version === MOBILE_PROTOCOL_VERSION)).toBe(true);
    });

    it('should have required features in current version', () => {
      const versions = validationService.getSupportedVersions();
      const currentVersion = versions.find((v) => v.version === MOBILE_PROTOCOL_VERSION);

      expect(currentVersion).toBeDefined();
      expect(currentVersion!.supportedFeatures).toContain('message_compression');
      expect(currentVersion!.supportedFeatures).toContain('message_batching');
      expect(currentVersion!.supportedFeatures).toContain('offline_queue');
      expect(currentVersion!.supportedFeatures).toContain('auto_reconnection');
      expect(currentVersion!.supportedFeatures).toContain('device_identification');
      expect(currentVersion!.supportedFeatures).toContain('priority_handling');
      expect(currentVersion!.supportedFeatures).toContain('heartbeat_protocol');
    });
  });
});
