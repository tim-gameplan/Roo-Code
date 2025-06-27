/**
 * Health Monitor Service
 *
 * Monitors system health, performance metrics, and service availability.
 * Provides health checks, alerts, and diagnostic information for the RCCS system.
 */

import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

/**
 * Health status levels
 */
export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

/**
 * Service health check result
 */
export interface HealthCheckResult {
  serviceName: string;
  status: HealthStatus;
  timestamp: Date;
  responseTime: number;
  message?: string;
  details?: Record<string, any>;
  error?: Error;
}

/**
 * System health metrics
 */
export interface SystemMetrics {
  cpu: {
    usage: number; // Percentage
    load: number[];
  };
  memory: {
    used: number; // Bytes
    total: number; // Bytes
    percentage: number;
  };
  disk: {
    used: number; // Bytes
    total: number; // Bytes
    percentage: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    connectionsActive: number;
  };
  uptime: number; // Seconds
}

/**
 * Health monitor configuration
 */
export interface HealthMonitorConfig {
  checkInterval: number; // Milliseconds
  timeout: number; // Milliseconds for individual checks
  retryAttempts: number;
  retryDelay: number; // Milliseconds
  alertThresholds: {
    cpu: number; // Percentage
    memory: number; // Percentage
    disk: number; // Percentage
    responseTime: number; // Milliseconds
  };
  enableMetrics: boolean;
  enableAlerts: boolean;
}

/**
 * Health check function type
 */
export type HealthCheckFunction = () => Promise<
  Omit<HealthCheckResult, 'timestamp' | 'responseTime'>
>;

/**
 * Health monitor events
 */
export interface HealthMonitorEvents {
  healthChanged: (serviceName: string, status: HealthStatus, result: HealthCheckResult) => void;
  alertTriggered: (alert: HealthAlert) => void;
  metricsUpdated: (metrics: SystemMetrics) => void;
}

/**
 * Health alert
 */
export interface HealthAlert {
  id: string;
  type: 'service' | 'system' | 'performance';
  severity: 'warning' | 'critical';
  serviceName?: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
  details?: Record<string, any>;
}

/**
 * Health Monitor Service implementation
 */
export class HealthMonitor extends EventEmitter {
  private config: HealthMonitorConfig;
  private healthChecks: Map<string, HealthCheckFunction> = new Map();
  private lastResults: Map<string, HealthCheckResult> = new Map();
  private alerts: Map<string, HealthAlert> = new Map();
  private monitorTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;
  private isRunning = false;

  constructor(config: HealthMonitorConfig) {
    super();
    this.config = config;

    logger.info('Health Monitor initialized', {
      checkInterval: config.checkInterval,
      enableMetrics: config.enableMetrics,
      enableAlerts: config.enableAlerts,
    });
  }

  /**
   * Register a health check for a service
   */
  public registerHealthCheck(serviceName: string, checkFunction: HealthCheckFunction): void {
    this.healthChecks.set(serviceName, checkFunction);
    logger.debug('Health check registered', { serviceName });
  }

  /**
   * Unregister a health check
   */
  public unregisterHealthCheck(serviceName: string): boolean {
    const removed = this.healthChecks.delete(serviceName);
    this.lastResults.delete(serviceName);

    if (removed) {
      logger.debug('Health check unregistered', { serviceName });
    }

    return removed;
  }

  /**
   * Start health monitoring
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn('Health Monitor is already running');
      return;
    }

    this.isRunning = true;

    // Start health checks
    this.monitorTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.config.checkInterval);

    // Start metrics collection if enabled
    if (this.config.enableMetrics) {
      this.metricsTimer = setInterval(() => {
        this.collectSystemMetrics();
      }, this.config.checkInterval);
    }

    // Perform initial health check
    this.performHealthChecks();

    logger.info('Health Monitor started');
  }

  /**
   * Stop health monitoring
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = undefined as any;
    }

    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = undefined as any;
    }

    logger.info('Health Monitor stopped');
  }

  /**
   * Get current health status for all services
   */
  public getHealthStatus(): Map<string, HealthCheckResult> {
    return new Map(this.lastResults);
  }

  /**
   * Get health status for a specific service
   */
  public getServiceHealth(serviceName: string): HealthCheckResult | undefined {
    return this.lastResults.get(serviceName);
  }

  /**
   * Get overall system health status
   */
  public getOverallHealth(): HealthStatus {
    if (this.lastResults.size === 0) {
      return 'unknown';
    }

    const statuses = Array.from(this.lastResults.values()).map((result) => result.status);

    if (statuses.some((status) => status === 'critical')) {
      return 'critical';
    }

    if (statuses.some((status) => status === 'warning')) {
      return 'warning';
    }

    if (statuses.some((status) => status === 'unknown')) {
      return 'unknown';
    }

    return 'healthy';
  }

  /**
   * Get active alerts
   */
  public getActiveAlerts(): HealthAlert[] {
    return Array.from(this.alerts.values()).filter((alert) => !alert.resolved);
  }

  /**
   * Resolve an alert
   */
  public resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      logger.info('Health alert resolved', { alertId, type: alert.type });
      return true;
    }
    return false;
  }

  /**
   * Perform health checks for all registered services
   */
  private async performHealthChecks(): Promise<void> {
    const promises = Array.from(this.healthChecks.entries()).map(([serviceName, checkFunction]) =>
      this.performSingleHealthCheck(serviceName, checkFunction)
    );

    await Promise.allSettled(promises);
  }

  /**
   * Perform a single health check with retry logic
   */
  private async performSingleHealthCheck(
    serviceName: string,
    checkFunction: HealthCheckFunction
  ): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const startTime = Date.now();

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Health check timeout')), this.config.timeout);
        });

        const checkResult = await Promise.race([checkFunction(), timeoutPromise]);

        const responseTime = Date.now() - startTime;

        const result: HealthCheckResult = {
          ...checkResult,
          timestamp: new Date(),
          responseTime,
        };

        this.processHealthCheckResult(serviceName, result);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.config.retryAttempts) {
          await new Promise((resolve) => setTimeout(resolve, this.config.retryDelay));
        }
      }
    }

    // All attempts failed
    const result: HealthCheckResult = {
      serviceName,
      status: 'critical',
      timestamp: new Date(),
      responseTime: this.config.timeout,
      message: `Health check failed after ${this.config.retryAttempts} attempts`,
      ...(lastError && { error: lastError }),
    };

    this.processHealthCheckResult(serviceName, result);
  }

  /**
   * Process health check result and trigger events/alerts
   */
  private processHealthCheckResult(serviceName: string, result: HealthCheckResult): void {
    const previousResult = this.lastResults.get(serviceName);
    this.lastResults.set(serviceName, result);

    // Check if status changed
    if (!previousResult || previousResult.status !== result.status) {
      this.emit('healthChanged', serviceName, result.status, result);

      logger.info('Service health status changed', {
        serviceName,
        previousStatus: previousResult?.status || 'unknown',
        newStatus: result.status,
        responseTime: result.responseTime,
      });
    }

    // Check for performance alerts
    if (this.config.enableAlerts) {
      this.checkPerformanceAlerts(serviceName, result);
    }
  }

  /**
   * Check for performance-related alerts
   */
  private checkPerformanceAlerts(serviceName: string, result: HealthCheckResult): void {
    // Response time alert
    if (result.responseTime > this.config.alertThresholds.responseTime) {
      this.createAlert({
        type: 'performance',
        severity:
          result.responseTime > this.config.alertThresholds.responseTime * 2
            ? 'critical'
            : 'warning',
        serviceName,
        message: `High response time: ${result.responseTime}ms`,
        details: {
          responseTime: result.responseTime,
          threshold: this.config.alertThresholds.responseTime,
        },
      });
    }

    // Service status alert
    if (result.status === 'critical' || result.status === 'warning') {
      this.createAlert({
        type: 'service',
        severity: result.status === 'critical' ? 'critical' : 'warning',
        serviceName,
        message: result.message || `Service health is ${result.status}`,
        ...(result.details && { details: result.details }),
      });
    }
  }

  /**
   * Collect system metrics
   */
  private async collectSystemMetrics(): Promise<void> {
    try {
      const metrics: SystemMetrics = {
        cpu: {
          usage: await this.getCpuUsage(),
          load: await this.getLoadAverage(),
        },
        memory: await this.getMemoryUsage(),
        disk: await this.getDiskUsage(),
        network: await this.getNetworkStats(),
        uptime: process.uptime(),
      };

      this.emit('metricsUpdated', metrics);
      this.checkSystemAlerts(metrics);
    } catch (error) {
      logger.error('Failed to collect system metrics', { error });
    }
  }

  /**
   * Get CPU usage percentage
   */
  private async getCpuUsage(): Promise<number> {
    // Simplified CPU usage calculation
    // In a real implementation, you might use a library like 'os-utils' or 'systeminformation'
    return Math.random() * 100; // Placeholder
  }

  /**
   * Get load average
   */
  private async getLoadAverage(): Promise<number[]> {
    const os = await import('os');
    return os.loadavg();
  }

  /**
   * Get memory usage
   */
  private async getMemoryUsage(): Promise<SystemMetrics['memory']> {
    const os = await import('os');
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;

    return {
      used,
      total,
      percentage: (used / total) * 100,
    };
  }

  /**
   * Get disk usage
   */
  private async getDiskUsage(): Promise<SystemMetrics['disk']> {
    // Simplified disk usage - in reality, you'd use fs.statvfs or similar
    return {
      used: 50 * 1024 * 1024 * 1024, // 50GB
      total: 100 * 1024 * 1024 * 1024, // 100GB
      percentage: 50,
    };
  }

  /**
   * Get network statistics
   */
  private async getNetworkStats(): Promise<SystemMetrics['network']> {
    // Simplified network stats - in reality, you'd read from /proc/net/dev or similar
    return {
      bytesIn: Math.floor(Math.random() * 1000000),
      bytesOut: Math.floor(Math.random() * 1000000),
      connectionsActive: Math.floor(Math.random() * 100),
    };
  }

  /**
   * Check system metrics for alerts
   */
  private checkSystemAlerts(metrics: SystemMetrics): void {
    if (!this.config.enableAlerts) {
      return;
    }

    // CPU alert
    if (metrics.cpu.usage > this.config.alertThresholds.cpu) {
      this.createAlert({
        type: 'system',
        severity:
          metrics.cpu.usage > this.config.alertThresholds.cpu * 1.5 ? 'critical' : 'warning',
        message: `High CPU usage: ${metrics.cpu.usage.toFixed(1)}%`,
        details: { cpuUsage: metrics.cpu.usage, threshold: this.config.alertThresholds.cpu },
      });
    }

    // Memory alert
    if (metrics.memory.percentage > this.config.alertThresholds.memory) {
      this.createAlert({
        type: 'system',
        severity:
          metrics.memory.percentage > this.config.alertThresholds.memory * 1.2
            ? 'critical'
            : 'warning',
        message: `High memory usage: ${metrics.memory.percentage.toFixed(1)}%`,
        details: {
          memoryUsage: metrics.memory.percentage,
          threshold: this.config.alertThresholds.memory,
        },
      });
    }

    // Disk alert
    if (metrics.disk.percentage > this.config.alertThresholds.disk) {
      this.createAlert({
        type: 'system',
        severity:
          metrics.disk.percentage > this.config.alertThresholds.disk * 1.1 ? 'critical' : 'warning',
        message: `High disk usage: ${metrics.disk.percentage.toFixed(1)}%`,
        details: {
          diskUsage: metrics.disk.percentage,
          threshold: this.config.alertThresholds.disk,
        },
      });
    }
  }

  /**
   * Create a new alert
   */
  private createAlert(alertData: Omit<HealthAlert, 'id' | 'timestamp' | 'resolved'>): void {
    const alert: HealthAlert = {
      ...alertData,
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      resolved: false,
    };

    this.alerts.set(alert.id, alert);
    this.emit('alertTriggered', alert);

    logger.warn('Health alert triggered', {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
    });
  }

  /**
   * Record message latency for performance monitoring
   */
  public recordMessageLatency(latency: number): void {
    // In a real implementation, this would store latency metrics
    // For now, we'll just log high latency messages
    if (latency > this.config.alertThresholds.responseTime) {
      logger.warn('High message latency detected', { latency });
    }
  }

  /**
   * Increment message count for throughput monitoring
   */
  public incrementMessageCount(): void {
    // In a real implementation, this would increment a counter
    // For now, we'll just track that a message was processed
    logger.debug('Message processed');
  }

  /**
   * Get health metrics
   */
  public getMetrics(): any {
    return {
      healthChecks: this.lastResults.size,
      activeAlerts: this.getActiveAlerts().length,
      uptime: Date.now() - Date.now(), // Simplified uptime
      lastCheckTime: new Date(),
      overallStatus: this.getOverallHealth(),
    };
  }

  /**
   * Destroy the health monitor and clean up resources
   */
  public async destroy(): Promise<void> {
    this.stop();
    this.healthChecks.clear();
    this.lastResults.clear();
    this.alerts.clear();
    this.removeAllListeners();

    logger.info('Health Monitor destroyed');
  }
}

/**
 * Default health monitor configuration
 */
export const defaultHealthMonitorConfig: HealthMonitorConfig = {
  checkInterval: 30000, // 30 seconds
  timeout: 5000, // 5 seconds
  retryAttempts: 3,
  retryDelay: 1000, // 1 second
  alertThresholds: {
    cpu: 80, // 80%
    memory: 85, // 85%
    disk: 90, // 90%
    responseTime: 5000, // 5 seconds
  },
  enableMetrics: true,
  enableAlerts: true,
};
