/**
 * Message Validation Service for TASK-005.1.1
 *
 * This module implements message validation and sanitization for mobile-optimized
 * communication protocols, including schema validation and protocol versioning.
 */

import {
  ValidationRule,
  ValidationSchema,
  ValidationResult,
  ProtocolVersion,
  CompatibilityCheck,
  MOBILE_PROTOCOL_VERSION,
  ValidationError as MobileValidationError,
} from '@/types/mobile';
import { logger } from '@/utils/logger';

/**
 * Message validation service
 */
export class MessageValidationService {
  private schemas: Map<string, ValidationSchema> = new Map();
  private supportedVersions: ProtocolVersion[] = [];

  constructor() {
    this.initializeSchemas();
    this.initializeSupportedVersions();
  }

  /**
   * Initialize validation schemas for different message types
   */
  private initializeSchemas(): void {
    // Core mobile message schema
    this.registerSchema({
      messageType: 'mobile_message',
      version: '1.0.0',
      rules: [
        { field: 'id', type: 'string', required: true, minLength: 1, maxLength: 255 },
        { field: 'timestamp', type: 'number', required: true },
        {
          field: 'protocolVersion',
          type: 'string',
          required: true,
          pattern: '^\\d+\\.\\d+\\.\\d+$',
        },
        { field: 'type', type: 'string', required: true, minLength: 1, maxLength: 100 },
        { field: 'source', type: 'object', required: true },
        { field: 'source.deviceId', type: 'string', required: true, minLength: 1, maxLength: 255 },
        { field: 'source.userId', type: 'string', required: true, minLength: 1, maxLength: 255 },
        {
          field: 'source.deviceType',
          type: 'string',
          required: true,
          enum: ['mobile', 'desktop', 'web', 'tablet'],
        },
        { field: 'source.timestamp', type: 'number', required: true },
        { field: 'destination', type: 'object', required: true },
        {
          field: 'destination.target',
          type: 'string',
          required: true,
          enum: ['extension', 'device', 'broadcast', 'cloud'],
        },
        { field: 'optimization', type: 'object', required: true },
        {
          field: 'optimization.priority',
          type: 'string',
          required: true,
          enum: ['critical', 'high', 'normal', 'low'],
        },
      ],
    });

    // Device registration message schema
    this.registerSchema({
      messageType: 'device_registration',
      version: '1.0.0',
      rules: [
        { field: 'deviceInfo', type: 'object', required: true },
        {
          field: 'deviceInfo.deviceId',
          type: 'string',
          required: true,
          minLength: 1,
          maxLength: 255,
        },
        {
          field: 'deviceInfo.userId',
          type: 'string',
          required: true,
          minLength: 1,
          maxLength: 255,
        },
        {
          field: 'deviceInfo.deviceType',
          type: 'string',
          required: true,
          enum: ['mobile', 'desktop', 'web', 'tablet'],
        },
        {
          field: 'deviceInfo.platform',
          type: 'string',
          required: true,
          minLength: 1,
          maxLength: 50,
        },
        {
          field: 'deviceInfo.version',
          type: 'string',
          required: true,
          pattern: '^\\d+\\.\\d+\\.\\d+',
        },
        { field: 'deviceInfo.capabilities', type: 'object', required: true },
        { field: 'deviceInfo.capabilities.compression', type: 'array', required: true },
        { field: 'deviceInfo.capabilities.maxMessageSize', type: 'number', required: true },
        { field: 'deviceInfo.capabilities.supportsBatching', type: 'boolean', required: true },
        { field: 'deviceInfo.capabilities.supportsOfflineQueue', type: 'boolean', required: true },
        { field: 'deviceInfo.capabilities.batteryOptimized', type: 'boolean', required: true },
      ],
    });

    // Heartbeat message schema
    this.registerSchema({
      messageType: 'heartbeat',
      version: '1.0.0',
      rules: [
        { field: 'connectionId', type: 'string', required: true, minLength: 1, maxLength: 255 },
        { field: 'metrics', type: 'object', required: false },
        { field: 'networkInfo', type: 'object', required: false },
      ],
    });

    // Command message schema
    this.registerSchema({
      messageType: 'command',
      version: '1.0.0',
      rules: [
        { field: 'command', type: 'string', required: true, minLength: 1, maxLength: 100 },
        { field: 'args', type: 'array', required: false },
        { field: 'workingDirectory', type: 'string', required: false, maxLength: 1000 },
        { field: 'timeout', type: 'number', required: false },
      ],
    });

    // File operation message schema
    this.registerSchema({
      messageType: 'file_operation',
      version: '1.0.0',
      rules: [
        {
          field: 'operation',
          type: 'string',
          required: true,
          enum: ['read', 'write', 'delete', 'list', 'watch'],
        },
        { field: 'path', type: 'string', required: true, minLength: 1, maxLength: 1000 },
        { field: 'content', type: 'string', required: false },
        { field: 'encoding', type: 'string', required: false, enum: ['utf8', 'base64', 'binary'] },
      ],
    });

    logger.info('Message validation schemas initialized', {
      schemaCount: this.schemas.size,
      schemas: Array.from(this.schemas.keys()),
    });
  }

  /**
   * Initialize supported protocol versions
   */
  private initializeSupportedVersions(): void {
    this.supportedVersions = [
      {
        version: '1.0.0',
        supportedFeatures: [
          'message_compression',
          'message_batching',
          'offline_queue',
          'auto_reconnection',
          'device_identification',
          'priority_handling',
          'heartbeat_protocol',
        ],
        deprecatedFeatures: [],
        minimumClientVersion: '1.0.0',
        maximumClientVersion: '1.9.9',
      },
    ];

    logger.info('Protocol versions initialized', {
      versions: this.supportedVersions.map((v) => v.version),
      currentVersion: MOBILE_PROTOCOL_VERSION,
    });
  }

  /**
   * Register a new validation schema
   */
  public registerSchema(schema: ValidationSchema): void {
    const key = `${schema.messageType}_${schema.version}`;
    this.schemas.set(key, schema);
    logger.debug('Validation schema registered', {
      messageType: schema.messageType,
      version: schema.version,
    });
  }

  /**
   * Validate a mobile message against its schema
   */
  public validateMessage(message: unknown, messageType?: string): ValidationResult {
    try {
      // Basic type check
      if (!message || typeof message !== 'object') {
        return {
          valid: false,
          errors: [{ field: 'message', message: 'Message must be a non-null object' }],
          warnings: [],
        };
      }

      const msg = message as Record<string, unknown>;

      // Determine message type
      const type = messageType || (msg['type'] as string) || 'mobile_message';
      const version = (msg['protocolVersion'] as string) || MOBILE_PROTOCOL_VERSION;

      // Get validation schema
      const schema = this.getSchema(type, version);
      if (!schema) {
        return {
          valid: false,
          errors: [
            { field: 'schema', message: `No validation schema found for ${type} v${version}` },
          ],
          warnings: [],
        };
      }

      // Validate against schema
      return this.validateAgainstSchema(msg, schema);
    } catch (error) {
      logger.error('Message validation error', { error, message });
      return {
        valid: false,
        errors: [{ field: 'validation', message: 'Validation failed due to internal error' }],
        warnings: [],
      };
    }
  }

  /**
   * Validate a message against a specific schema
   */
  private validateAgainstSchema(
    message: Record<string, unknown>,
    schema: ValidationSchema
  ): ValidationResult {
    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationResult['warnings'] = [];

    for (const rule of schema.rules) {
      const result = this.validateField(message, rule);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate a single field against a rule
   */
  private validateField(message: Record<string, unknown>, rule: ValidationRule): ValidationResult {
    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationResult['warnings'] = [];

    const value = this.getNestedValue(message, rule.field);

    // Check required fields
    if (rule.required && (value === undefined || value === null)) {
      errors.push({
        field: rule.field,
        message: `Field '${rule.field}' is required`,
        value,
      });
      return { valid: false, errors, warnings };
    }

    // Skip validation if field is optional and not present
    if (!rule.required && (value === undefined || value === null)) {
      return { valid: true, errors, warnings };
    }

    // Type validation
    if (!this.validateType(value, rule.type)) {
      errors.push({
        field: rule.field,
        message: `Field '${rule.field}' must be of type ${rule.type}`,
        value,
      });
      return { valid: false, errors, warnings };
    }

    // String-specific validations
    if (rule.type === 'string' && typeof value === 'string') {
      if (rule.minLength !== undefined && value.length < rule.minLength) {
        errors.push({
          field: rule.field,
          message: `Field '${rule.field}' must be at least ${rule.minLength} characters long`,
          value,
        });
      }

      if (rule.maxLength !== undefined && value.length > rule.maxLength) {
        errors.push({
          field: rule.field,
          message: `Field '${rule.field}' must be at most ${rule.maxLength} characters long`,
          value,
        });
      }

      if (rule.pattern && !new RegExp(rule.pattern).test(value)) {
        errors.push({
          field: rule.field,
          message: `Field '${rule.field}' does not match required pattern`,
          value,
        });
      }
    }

    // Enum validation
    if (rule.enum && !rule.enum.includes(value)) {
      errors.push({
        field: rule.field,
        message: `Field '${rule.field}' must be one of: ${rule.enum.join(', ')}`,
        value,
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current: unknown, key: string) => {
      return current && typeof current === 'object'
        ? (current as Record<string, unknown>)[key]
        : undefined;
    }, obj as unknown);
  }

  /**
   * Validate value type
   */
  private validateType(value: unknown, expectedType: ValidationRule['type']): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return value !== null && typeof value === 'object' && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      default:
        return false;
    }
  }

  /**
   * Get validation schema for message type and version
   */
  private getSchema(messageType: string, version: string): ValidationSchema | undefined {
    const key = `${messageType}_${version}`;
    return this.schemas.get(key);
  }

  /**
   * Check protocol version compatibility
   */
  public checkCompatibility(clientVersion: string): CompatibilityCheck {
    const serverVersion = MOBILE_PROTOCOL_VERSION;
    const warnings: string[] = [];
    const requiredUpgrades: string[] = [];

    // Find matching protocol version
    const protocolVersion = this.supportedVersions.find((v) => v.version === serverVersion);
    if (!protocolVersion) {
      return {
        clientVersion,
        serverVersion,
        compatible: false,
        warnings: ['Server protocol version not found'],
        requiredUpgrades: ['Update server to supported version'],
      };
    }

    // Check if client version is supported
    const clientVersionParts = this.parseVersion(clientVersion);
    const minVersionParts = this.parseVersion(protocolVersion.minimumClientVersion);
    const maxVersionParts = protocolVersion.maximumClientVersion
      ? this.parseVersion(protocolVersion.maximumClientVersion)
      : null;

    const isAboveMin = this.compareVersions(clientVersionParts, minVersionParts) >= 0;
    const isBelowMax =
      !maxVersionParts || this.compareVersions(clientVersionParts, maxVersionParts) <= 0;

    const compatible = isAboveMin && isBelowMax;

    if (!isAboveMin) {
      requiredUpgrades.push(
        `Client version ${clientVersion} is below minimum required ${protocolVersion.minimumClientVersion}`
      );
    }

    if (!isBelowMax && maxVersionParts) {
      warnings.push(
        `Client version ${clientVersion} is above maximum tested ${protocolVersion.maximumClientVersion}`
      );
    }

    // Check for deprecated features
    if (protocolVersion.deprecatedFeatures.length > 0) {
      warnings.push(`Deprecated features in use: ${protocolVersion.deprecatedFeatures.join(', ')}`);
    }

    return {
      clientVersion,
      serverVersion,
      compatible,
      warnings,
      requiredUpgrades,
    };
  }

  /**
   * Parse version string into numeric parts
   */
  private parseVersion(version: string): number[] {
    return version.split('.').map((part) => parseInt(part, 10) || 0);
  }

  /**
   * Compare two version arrays
   */
  private compareVersions(a: number[], b: number[]): number {
    const maxLength = Math.max(a.length, b.length);

    for (let i = 0; i < maxLength; i++) {
      const aPart = a[i] || 0;
      const bPart = b[i] || 0;

      if (aPart > bPart) return 1;
      if (aPart < bPart) return -1;
    }

    return 0;
  }

  /**
   * Sanitize and normalize a mobile message
   */
  public sanitizeMessage(message: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...message };

    // Ensure required fields have default values
    if (!sanitized['id']) {
      sanitized['id'] = this.generateMessageId();
    }

    if (!sanitized['timestamp']) {
      sanitized['timestamp'] = Date.now();
    }

    if (!sanitized['protocolVersion']) {
      sanitized['protocolVersion'] = MOBILE_PROTOCOL_VERSION;
    }

    // Sanitize string fields
    Object.keys(sanitized).forEach((key) => {
      const value = sanitized[key];
      if (typeof value === 'string') {
        // Trim whitespace and limit length
        sanitized[key] = value.trim().substring(0, 10000);
      }
    });

    return sanitized;
  }

  /**
   * Generate a unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate and throw error if message is invalid
   */
  public validateMessageOrThrow(message: unknown, messageType?: string): void {
    const result = this.validateMessage(message, messageType);
    if (!result.valid) {
      throw new MobileValidationError(
        `Message validation failed: ${result.errors.map((e) => e.message).join(', ')}`,
        result.errors
      );
    }
  }

  /**
   * Get all registered schemas
   */
  public getRegisteredSchemas(): ValidationSchema[] {
    return Array.from(this.schemas.values());
  }

  /**
   * Get supported protocol versions
   */
  public getSupportedVersions(): ProtocolVersion[] {
    return [...this.supportedVersions];
  }
}

/**
 * Global validation service instance
 */
export const messageValidationService = new MessageValidationService();
