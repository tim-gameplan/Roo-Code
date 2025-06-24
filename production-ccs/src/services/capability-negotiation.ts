/**
 * Capability Negotiation Service
 * Handles device capability negotiation and compatibility assessment
 */

import { EventEmitter } from 'events';
import {
  CapabilityNegotiation,
  NegotiationResult,
  CapabilityRequirement,
  CapabilityMatch,
  CapabilityScore,
  NegotiationStatus,
  DeviceRelayConfig,
} from '../types/device-relay';
import { DeviceCapabilities } from '../types/rccs';

/**
 * Capability Negotiation Service
 * Manages capability negotiation between devices
 */
export class CapabilityNegotiationService extends EventEmitter {
  private activeNegotiations: Map<string, CapabilityNegotiation> = new Map();
  private negotiationHistory: Map<string, NegotiationResult[]> = new Map();
  private isRunning = false;

  constructor(private config: DeviceRelayConfig) {
    super();
  }

  /**
   * Initialize the capability negotiation service
   */
  async initialize(): Promise<void> {
    this.isRunning = true;
    this.emit('capability:initialized');
  }

  /**
   * Shutdown the capability negotiation service
   */
  async shutdown(): Promise<void> {
    this.isRunning = false;
    this.activeNegotiations.clear();
    this.emit('capability:shutdown');
  }

  /**
   * Negotiate capabilities between devices
   */
  async negotiate(negotiation: CapabilityNegotiation): Promise<NegotiationResult> {
    if (!this.isRunning) {
      throw new Error('Capability negotiation service not running');
    }

    const startTime = Date.now();

    try {
      this.activeNegotiations.set(negotiation.id, negotiation);
      this.emit('negotiation:started', negotiation);

      // Analyze capability requirements
      const requirements = this.analyzeRequirements(negotiation);

      // Assess device capabilities
      const sourceCapabilities = await this.assessDeviceCapabilities(negotiation.sourceDeviceId);
      const targetCapabilities = await this.assessDeviceCapabilities(negotiation.targetDeviceId);

      // Calculate compatibility scores
      const compatibilityScore = this.calculateCompatibilityScore(
        sourceCapabilities,
        targetCapabilities,
        requirements
      );

      // Determine negotiation result
      const matches = this.findCapabilityMatches(
        sourceCapabilities,
        targetCapabilities,
        requirements
      );

      const result: NegotiationResult = {
        negotiationId: negotiation.id,
        status:
          compatibilityScore.overall >= 0.7 ? NegotiationStatus.SUCCESS : NegotiationStatus.FAILED,
        compatibilityScore,
        matches,
        recommendations: this.generateRecommendations(compatibilityScore, matches),
        negotiationTime: Date.now() - startTime,
        completedAt: new Date(),
      };

      // Store in history
      this.addToHistory(negotiation.userId, result);

      this.emit('negotiation:completed', result);
      return result;
    } catch (error) {
      const result: NegotiationResult = {
        negotiationId: negotiation.id,
        status: NegotiationStatus.ERROR,
        compatibilityScore: {
          overall: 0,
          fileSync: 0,
          communication: 0,
          performance: 0,
          security: 0,
        },
        matches: [],
        recommendations: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        negotiationTime: Date.now() - startTime,
        completedAt: new Date(),
      };

      this.addToHistory(negotiation.userId, result);
      this.emit('negotiation:failed', negotiation, error);

      throw error;
    } finally {
      this.activeNegotiations.delete(negotiation.id);
    }
  }

  /**
   * Get active negotiations
   */
  getActiveNegotiations(): CapabilityNegotiation[] {
    return Array.from(this.activeNegotiations.values());
  }

  /**
   * Get negotiation history for a user
   */
  getNegotiationHistory(userId: string): NegotiationResult[] {
    return this.negotiationHistory.get(userId) || [];
  }

  // Private methods

  private analyzeRequirements(negotiation: CapabilityNegotiation): CapabilityRequirement[] {
    const requirements: CapabilityRequirement[] = [];

    // Analyze based on negotiation type and context
    if (negotiation.context.requiresFileSync) {
      requirements.push({
        capability: 'fileSync',
        required: true,
        minVersion: '1.0.0',
        priority: 'high',
      });
    }

    if (negotiation.context.requiresRealTimeComm) {
      requirements.push({
        capability: 'realTimeComm',
        required: true,
        minVersion: '1.0.0',
        priority: 'high',
      });
    }

    if (negotiation.context.requiresVideoStreaming) {
      requirements.push({
        capability: 'videoStreaming',
        required: false,
        minVersion: '1.0.0',
        priority: 'medium',
      });
    }

    if (negotiation.context.requiresVoiceCommands) {
      requirements.push({
        capability: 'voiceCommands',
        required: false,
        minVersion: '1.0.0',
        priority: 'low',
      });
    }

    return requirements;
  }

  private async assessDeviceCapabilities(deviceId: string): Promise<DeviceCapabilities> {
    // In a real implementation, this would query the device or database
    // For now, return mock capabilities
    return {
      supportsFileSync: true,
      supportsVoiceCommands: Math.random() > 0.5,
      supportsVideoStreaming: Math.random() > 0.3,
      supportsNotifications: true,
      maxFileSize: Math.floor(Math.random() * 1000) * 1024 * 1024, // Random size up to 1GB
      supportedFormats: ['jpg', 'png', 'pdf', 'txt', 'mp4'],
    };
  }

  private calculateCompatibilityScore(
    sourceCapabilities: DeviceCapabilities,
    targetCapabilities: DeviceCapabilities,
    requirements: CapabilityRequirement[]
  ): CapabilityScore {
    let fileSyncScore = 0;
    let communicationScore = 0;
    let performanceScore = 0;
    let securityScore = 0;

    // File sync compatibility
    if (sourceCapabilities.supportsFileSync && targetCapabilities.supportsFileSync) {
      fileSyncScore += 0.5;

      // Check file size compatibility
      const minFileSize = Math.min(sourceCapabilities.maxFileSize, targetCapabilities.maxFileSize);
      if (minFileSize >= 10 * 1024 * 1024) {
        // At least 10MB
        fileSyncScore += 0.3;
      }

      // Check format compatibility
      const commonFormats = sourceCapabilities.supportedFormats.filter((format) =>
        targetCapabilities.supportedFormats.includes(format)
      );
      if (commonFormats.length >= 3) {
        fileSyncScore += 0.2;
      }
    }

    // Communication compatibility
    if (sourceCapabilities.supportsNotifications && targetCapabilities.supportsNotifications) {
      communicationScore += 0.4;
    }

    if (sourceCapabilities.supportsVoiceCommands && targetCapabilities.supportsVoiceCommands) {
      communicationScore += 0.3;
    }

    if (sourceCapabilities.supportsVideoStreaming && targetCapabilities.supportsVideoStreaming) {
      communicationScore += 0.3;
    }

    // Performance score (simulated)
    performanceScore = 0.8 + Math.random() * 0.2; // 80-100%

    // Security score (simulated)
    securityScore = 0.9 + Math.random() * 0.1; // 90-100%

    // Calculate overall score with weights
    const overall =
      fileSyncScore * 0.3 + communicationScore * 0.3 + performanceScore * 0.2 + securityScore * 0.2;

    return {
      overall: Math.min(1, overall),
      fileSync: Math.min(1, fileSyncScore),
      communication: Math.min(1, communicationScore),
      performance: Math.min(1, performanceScore),
      security: Math.min(1, securityScore),
    };
  }

  private findCapabilityMatches(
    sourceCapabilities: DeviceCapabilities,
    targetCapabilities: DeviceCapabilities,
    requirements: CapabilityRequirement[]
  ): CapabilityMatch[] {
    const matches: CapabilityMatch[] = [];

    // File sync match
    if (sourceCapabilities.supportsFileSync && targetCapabilities.supportsFileSync) {
      matches.push({
        capability: 'fileSync',
        sourceSupported: true,
        targetSupported: true,
        compatible: true,
        limitations: this.getFileSyncLimitations(sourceCapabilities, targetCapabilities),
      });
    }

    // Voice commands match
    if (sourceCapabilities.supportsVoiceCommands || targetCapabilities.supportsVoiceCommands) {
      matches.push({
        capability: 'voiceCommands',
        sourceSupported: sourceCapabilities.supportsVoiceCommands,
        targetSupported: targetCapabilities.supportsVoiceCommands,
        compatible:
          sourceCapabilities.supportsVoiceCommands && targetCapabilities.supportsVoiceCommands,
        limitations: [],
      });
    }

    // Video streaming match
    if (sourceCapabilities.supportsVideoStreaming || targetCapabilities.supportsVideoStreaming) {
      matches.push({
        capability: 'videoStreaming',
        sourceSupported: sourceCapabilities.supportsVideoStreaming,
        targetSupported: targetCapabilities.supportsVideoStreaming,
        compatible:
          sourceCapabilities.supportsVideoStreaming && targetCapabilities.supportsVideoStreaming,
        limitations: [],
      });
    }

    // Notifications match
    matches.push({
      capability: 'notifications',
      sourceSupported: sourceCapabilities.supportsNotifications,
      targetSupported: targetCapabilities.supportsNotifications,
      compatible:
        sourceCapabilities.supportsNotifications && targetCapabilities.supportsNotifications,
      limitations: [],
    });

    return matches;
  }

  private getFileSyncLimitations(
    sourceCapabilities: DeviceCapabilities,
    targetCapabilities: DeviceCapabilities
  ): string[] {
    const limitations: string[] = [];

    // File size limitations
    const maxFileSize = Math.min(sourceCapabilities.maxFileSize, targetCapabilities.maxFileSize);
    if (maxFileSize < 100 * 1024 * 1024) {
      // Less than 100MB
      limitations.push(`Maximum file size limited to ${Math.round(maxFileSize / (1024 * 1024))}MB`);
    }

    // Format limitations
    const commonFormats = sourceCapabilities.supportedFormats.filter((format) =>
      targetCapabilities.supportedFormats.includes(format)
    );

    const unsupportedFormats = [
      ...sourceCapabilities.supportedFormats.filter((f) => !commonFormats.includes(f)),
      ...targetCapabilities.supportedFormats.filter((f) => !commonFormats.includes(f)),
    ];

    if (unsupportedFormats.length > 0) {
      limitations.push(`Unsupported formats: ${[...new Set(unsupportedFormats)].join(', ')}`);
    }

    return limitations;
  }

  private generateRecommendations(score: CapabilityScore, matches: CapabilityMatch[]): string[] {
    const recommendations: string[] = [];

    if (score.overall < 0.7) {
      recommendations.push('Overall compatibility is below recommended threshold');
    }

    if (score.fileSync < 0.8) {
      recommendations.push('Consider upgrading file sync capabilities for better performance');
    }

    if (score.communication < 0.6) {
      recommendations.push('Limited communication features available between devices');
    }

    if (score.performance < 0.7) {
      recommendations.push('Performance may be impacted during device coordination');
    }

    // Check for missing critical capabilities
    const incompatibleMatches = matches.filter((m) => !m.compatible);
    if (incompatibleMatches.length > 0) {
      recommendations.push(
        `Incompatible capabilities: ${incompatibleMatches.map((m) => m.capability).join(', ')}`
      );
    }

    // Suggest improvements
    if (matches.some((m) => m.capability === 'fileSync' && m.limitations.length > 0)) {
      recommendations.push(
        'File sync has limitations - consider device upgrades for full compatibility'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Devices are fully compatible for seamless coordination');
    }

    return recommendations;
  }

  private addToHistory(userId: string, result: NegotiationResult): void {
    let history = this.negotiationHistory.get(userId);
    if (!history) {
      history = [];
      this.negotiationHistory.set(userId, history);
    }

    history.push(result);

    // Keep only the last 100 negotiation results per user
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }

  /**
   * Get negotiation statistics for a user
   */
  getNegotiationStats(userId: string): {
    totalNegotiations: number;
    successfulNegotiations: number;
    failedNegotiations: number;
    averageCompatibilityScore: number;
    averageNegotiationTime: number;
  } {
    const history = this.getNegotiationHistory(userId);

    if (history.length === 0) {
      return {
        totalNegotiations: 0,
        successfulNegotiations: 0,
        failedNegotiations: 0,
        averageCompatibilityScore: 0,
        averageNegotiationTime: 0,
      };
    }

    const successful = history.filter((n) => n.status === NegotiationStatus.SUCCESS);
    const failed = history.filter((n) => n.status === NegotiationStatus.FAILED);
    const totalScore = history.reduce((sum, n) => sum + n.compatibilityScore.overall, 0);
    const totalTime = history.reduce((sum, n) => sum + n.negotiationTime, 0);

    return {
      totalNegotiations: history.length,
      successfulNegotiations: successful.length,
      failedNegotiations: failed.length,
      averageCompatibilityScore: totalScore / history.length,
      averageNegotiationTime: totalTime / history.length,
    };
  }

  /**
   * Pre-assess compatibility between two devices
   */
  async preAssessCompatibility(
    sourceDeviceId: string,
    targetDeviceId: string
  ): Promise<CapabilityScore> {
    const sourceCapabilities = await this.assessDeviceCapabilities(sourceDeviceId);
    const targetCapabilities = await this.assessDeviceCapabilities(targetDeviceId);

    // Use basic requirements for pre-assessment
    const basicRequirements: CapabilityRequirement[] = [
      {
        capability: 'fileSync',
        required: true,
        minVersion: '1.0.0',
        priority: 'high',
      },
    ];

    return this.calculateCompatibilityScore(
      sourceCapabilities,
      targetCapabilities,
      basicRequirements
    );
  }
}
