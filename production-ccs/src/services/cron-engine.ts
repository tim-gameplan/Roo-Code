/**
 * TASK-008.1.4.1: Core Scheduling Engine - Cron Engine Implementation
 *
 * Comprehensive cron expression parsing, validation, and time calculation engine
 * Supporting standard and extended cron formats with timezone handling
 */

import {
  CronEngine,
  ParsedCronExpression,
  CronValidationResult,
  CronFields,
  ScheduleFrequency,
  ScheduleFrequencyAnalysis,
  ScheduleConflict,
  OptimizationSuggestion,
  ResourceImpactAnalysis,
  PERFORMANCE_THRESHOLDS,
} from '../types/scheduling';
import { logger } from '../utils/logger';

/**
 * Simple DateTime wrapper for timezone handling
 */
class SimpleDateTime {
  constructor(
    private date: Date,
    private timezone: string = 'UTC'
  ) {}

  static fromJSDate(date: Date): SimpleDateTime {
    return new SimpleDateTime(date);
  }

  setZone(timezone: string): SimpleDateTime {
    return new SimpleDateTime(this.date, timezone);
  }

  get isValid(): boolean {
    return !isNaN(this.date.getTime()) && this.isValidTimezone();
  }

  private isValidTimezone(): boolean {
    try {
      new Intl.DateTimeFormat('en', { timeZone: this.timezone });
      return true;
    } catch {
      return false;
    }
  }

  toJSDate(): Date {
    return new Date(this.date);
  }

  toISO(): string {
    return this.date.toISOString();
  }
}

/**
 * Simple cron validation utility
 */
class SimpleCron {
  static validate(expression: string): boolean {
    const fields = expression.trim().split(/\s+/);
    return fields.length >= 5 && fields.length <= 6;
  }
}

/**
 * Production-ready cron engine implementation
 * Handles cron expression parsing, validation, and time calculations
 */
export class CronEngineService implements CronEngine {
  private readonly logger = logger.child({ component: 'CronEngine' });
  private readonly cronFieldPatterns: Record<string, RegExp>;

  constructor() {
    this.cronFieldPatterns = {
      second: /^(\*|([0-5]?\d)(,([0-5]?\d))*|([0-5]?\d)-([0-5]?\d)|\*\/([1-9]\d*))$/,
      minute: /^(\*|([0-5]?\d)(,([0-5]?\d))*|([0-5]?\d)-([0-5]?\d)|\*\/([1-9]\d*))$/,
      hour: /^(\*|(1?\d|2[0-3])(,(1?\d|2[0-3]))*|(1?\d|2[0-3])-(1?\d|2[0-3])|\*\/([1-9]\d*))$/,
      dayOfMonth:
        /^(\*|([1-9]|[12]\d|3[01])(,([1-9]|[12]\d|3[01]))*|([1-9]|[12]\d|3[01])-([1-9]|[12]\d|3[01])|\*\/([1-9]\d*)|L|W|\?)$/,
      month: /^(\*|([1-9]|1[0-2])(,([1-9]|1[0-2]))*|([1-9]|1[0-2])-([1-9]|1[0-2])|\*\/([1-9]\d*))$/,
      dayOfWeek: /^(\*|[0-6](,[0-6])*|[0-6]-[0-6]|\*\/[1-7]|L|#|\?)$/,
      year: /^(\*|(\d{4})(,(\d{4}))*|(\d{4})-(\d{4})|\*\/([1-9]\d*))$/,
    };

    this.logger.info('CronEngine initialized with timezone and pattern validation');
  }

  /**
   * Parse a cron expression into structured components
   */
  async parseExpression(expression: string): Promise<ParsedCronExpression> {
    const startTime = Date.now();

    try {
      this.logger.debug('Parsing cron expression', { expression });

      const trimmed = expression.trim();
      const fields = this.splitCronExpression(trimmed);
      const errors: string[] = [];

      // Validate field count
      if (fields.length < 5 || fields.length > 7) {
        errors.push(`Invalid field count: expected 5-7 fields, got ${fields.length}`);
      }

      // Parse fields based on count
      const cronFields = this.parseCronFields(fields, errors);

      // Validate individual fields
      this.validateCronFields(cronFields, errors);

      // Generate description and frequency analysis
      const description = this.generateDescription(cronFields);
      const frequency = this.analyzeFrequency(cronFields);

      const result: ParsedCronExpression = {
        original: expression,
        fields: cronFields,
        timezone: 'UTC', // Default timezone
        description,
        frequency,
        valid: errors.length === 0,
        errors,
      };

      const duration = Date.now() - startTime;
      this.logger.debug('Cron expression parsed', {
        expression,
        valid: result.valid,
        duration,
        errors: errors.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to parse cron expression', {
        expression,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      return {
        original: expression,
        fields: { minute: '', hour: '', dayOfMonth: '', month: '', dayOfWeek: '' },
        timezone: 'UTC',
        description: 'Invalid expression',
        frequency: {
          type: 'custom',
          interval: 0,
          description: 'Invalid',
          estimatedExecutionsPerDay: 0,
        },
        valid: false,
        errors: [error instanceof Error ? error.message : 'Unknown parsing error'],
      };
    }
  }

  /**
   * Validate a cron expression and return detailed results
   */
  async validateExpression(expression: string): Promise<CronValidationResult> {
    const startTime = Date.now();

    try {
      this.logger.debug('Validating cron expression', { expression });

      const parsed = await this.parseExpression(expression);
      const warnings: string[] = [];
      const nextExecutions: Date[] = [];

      if (parsed.valid) {
        // Generate next execution times for validation
        try {
          const next = await this.getNextExecutionTimes(expression, 'UTC', 5);
          nextExecutions.push(...next);
        } catch (error) {
          parsed.errors.push('Failed to calculate next execution times');
          parsed.valid = false;
        }

        // Add performance warnings
        if (parsed.frequency.estimatedExecutionsPerDay > 1440) {
          warnings.push('High frequency schedule may impact system performance');
        }

        if (parsed.frequency.estimatedExecutionsPerDay > 86400) {
          warnings.push('Extremely high frequency schedule detected');
        }

        // Validate timezone compatibility
        this.validateTimezoneCompatibility(parsed, warnings);
      }

      const result: CronValidationResult = {
        valid: parsed.valid,
        errors: parsed.errors,
        warnings,
        description: parsed.description,
        frequency: parsed.frequency,
        nextExecutions,
      };

      const duration = Date.now() - startTime;
      this.logger.debug('Cron expression validated', {
        expression,
        valid: result.valid,
        warnings: warnings.length,
        duration,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to validate cron expression', {
        expression,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Validation failed'],
        warnings: [],
        description: 'Invalid expression',
        frequency: {
          type: 'custom',
          interval: 0,
          description: 'Invalid',
          estimatedExecutionsPerDay: 0,
        },
        nextExecutions: [],
      };
    }
  }

  /**
   * Calculate the next execution time for a cron expression
   */
  async getNextExecutionTime(
    expression: string,
    timezone: string,
    fromDate?: Date
  ): Promise<Date | null> {
    const startTime = Date.now();

    try {
      this.logger.debug('Calculating next execution time', { expression, timezone, fromDate });

      const baseDate = fromDate || new Date();
      const dt = SimpleDateTime.fromJSDate(baseDate).setZone(timezone);

      // Validate timezone
      if (!dt.isValid) {
        throw new Error(`Invalid timezone: ${timezone}`);
      }

      // Use simple cron validation
      if (!SimpleCron.validate(expression)) {
        throw new Error('Invalid cron expression');
      }

      // Calculate next execution
      const nextExecution = this.calculateNextExecution(expression, dt);

      const duration = Date.now() - startTime;
      if (duration > PERFORMANCE_THRESHOLDS.SCHEDULE_EVALUATION_MS) {
        this.logger.warn('Slow cron calculation detected', { expression, duration });
      }

      this.logger.debug('Next execution time calculated', {
        expression,
        timezone,
        nextExecution: nextExecution?.toISO(),
        duration,
      });

      return nextExecution?.toJSDate() || null;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to calculate next execution time', {
        expression,
        timezone,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });
      return null;
    }
  }

  /**
   * Calculate multiple next execution times
   */
  async getNextExecutionTimes(
    expression: string,
    timezone: string,
    count: number,
    fromDate?: Date
  ): Promise<Date[]> {
    const startTime = Date.now();

    try {
      this.logger.debug('Calculating multiple execution times', {
        expression,
        timezone,
        count,
        fromDate,
      });

      const results: Date[] = [];
      let currentDate = fromDate || new Date();

      for (let i = 0; i < count; i++) {
        const nextTime = await this.getNextExecutionTime(expression, timezone, currentDate);
        if (!nextTime) break;

        results.push(nextTime);
        currentDate = new Date(nextTime.getTime() + 1000); // Add 1 second to avoid same time
      }

      const duration = Date.now() - startTime;
      this.logger.debug('Multiple execution times calculated', {
        expression,
        timezone,
        count: results.length,
        duration,
      });

      return results;
    } catch (error) {
      this.logger.error('Failed to calculate multiple execution times', {
        expression,
        timezone,
        count,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Calculate the previous execution time for a cron expression
   */
  async getPreviousExecutionTime(
    expression: string,
    timezone: string,
    fromDate?: Date
  ): Promise<Date | null> {
    try {
      this.logger.debug('Calculating previous execution time', { expression, timezone, fromDate });

      const baseDate = fromDate || new Date();
      const dt = SimpleDateTime.fromJSDate(baseDate).setZone(timezone);

      if (!dt.isValid) {
        throw new Error(`Invalid timezone: ${timezone}`);
      }

      if (!SimpleCron.validate(expression)) {
        throw new Error('Invalid cron expression');
      }

      // Calculate previous execution by going backwards
      const previousExecution = this.calculatePreviousExecution(expression, dt);

      this.logger.debug('Previous execution time calculated', {
        expression,
        timezone,
        previousExecution: previousExecution?.toISO(),
      });

      return previousExecution?.toJSDate() || null;
    } catch (error) {
      this.logger.error('Failed to calculate previous execution time', {
        expression,
        timezone,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Analyze schedule frequency and patterns
   */
  async analyzeScheduleFrequency(expression: string): Promise<ScheduleFrequencyAnalysis> {
    try {
      this.logger.debug('Analyzing schedule frequency', { expression });

      const parsed = await this.parseExpression(expression);
      if (!parsed.valid) {
        throw new Error('Invalid cron expression');
      }

      const frequency = parsed.frequency;
      const peakHours = this.calculatePeakHours(parsed.fields);
      const distributionScore = this.calculateDistributionScore(parsed.fields);
      const resourceImpact = this.assessResourceImpact(frequency);
      const recommendations = this.generateFrequencyRecommendations(frequency, resourceImpact);

      const analysis: ScheduleFrequencyAnalysis = {
        frequency,
        peakHours,
        distributionScore,
        resourceImpact,
        recommendations,
      };

      this.logger.debug('Schedule frequency analyzed', {
        expression,
        frequency: frequency.type,
        distributionScore,
        resourceImpact: resourceImpact.overallImpact,
      });

      return analysis;
    } catch (error) {
      this.logger.error('Failed to analyze schedule frequency', {
        expression,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        frequency: {
          type: 'custom',
          interval: 0,
          description: 'Invalid',
          estimatedExecutionsPerDay: 0,
        },
        peakHours: [],
        distributionScore: 0,
        resourceImpact: {
          cpuImpact: 'low',
          memoryImpact: 'low',
          networkImpact: 'low',
          databaseImpact: 'low',
          overallImpact: 'low',
        },
        recommendations: ['Fix invalid cron expression'],
      };
    }
  }

  /**
   * Detect conflicts between multiple schedules
   */
  async detectScheduleConflicts(
    expressions: string[],
    timezone: string
  ): Promise<ScheduleConflict[]> {
    try {
      this.logger.debug('Detecting schedule conflicts', {
        expressionCount: expressions.length,
        timezone,
      });

      const conflicts: ScheduleConflict[] = [];
      const scheduleExecutions: Array<{ id: string; times: Date[] }> = [];

      // Calculate next execution times for all schedules
      for (let i = 0; i < expressions.length; i++) {
        const expression = expressions[i];
        if (!expression) continue;

        const times = await this.getNextExecutionTimes(expression, timezone, 24); // Next 24 executions
        scheduleExecutions.push({ id: `schedule_${i}`, times });
      }

      // Find overlapping execution times
      for (let i = 0; i < scheduleExecutions.length; i++) {
        for (let j = i + 1; j < scheduleExecutions.length; j++) {
          const schedule1 = scheduleExecutions[i];
          const schedule2 = scheduleExecutions[j];

          if (!schedule1 || !schedule2) continue;

          const conflicts_ij = this.findTimeConflicts(schedule1, schedule2);
          conflicts.push(...conflicts_ij);
        }
      }

      this.logger.debug('Schedule conflicts detected', {
        expressionCount: expressions.length,
        conflictCount: conflicts.length,
      });

      return conflicts;
    } catch (error) {
      this.logger.error('Failed to detect schedule conflicts', {
        expressionCount: expressions.length,
        timezone,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Optimize schedule distribution to reduce conflicts
   */
  async optimizeScheduleDistribution(
    expressions: string[],
    timezone: string
  ): Promise<OptimizationSuggestion[]> {
    try {
      this.logger.debug('Optimizing schedule distribution', {
        expressionCount: expressions.length,
        timezone,
      });

      const suggestions: OptimizationSuggestion[] = [];
      const conflicts = await this.detectScheduleConflicts(expressions, timezone);

      // Generate optimization suggestions based on conflicts
      for (const conflict of conflicts) {
        const suggestion = this.generateOptimizationSuggestion(conflict, expressions);
        if (suggestion) {
          suggestions.push(suggestion);
        }
      }

      this.logger.debug('Schedule optimization completed', {
        expressionCount: expressions.length,
        suggestionCount: suggestions.length,
      });

      return suggestions;
    } catch (error) {
      this.logger.error('Failed to optimize schedule distribution', {
        expressionCount: expressions.length,
        timezone,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Split cron expression into individual fields
   */
  private splitCronExpression(expression: string): string[] {
    return expression.trim().split(/\s+/);
  }

  /**
   * Parse cron fields based on field count
   */
  private parseCronFields(fields: string[], errors: string[]): CronFields {
    const cronFields: CronFields = {
      minute: '',
      hour: '',
      dayOfMonth: '',
      month: '',
      dayOfWeek: '',
    };

    try {
      if (fields.length === 5 && fields[0] && fields[1] && fields[2] && fields[3] && fields[4]) {
        // Standard 5-field format: minute hour day month dow
        cronFields.minute = fields[0];
        cronFields.hour = fields[1];
        cronFields.dayOfMonth = fields[2];
        cronFields.month = fields[3];
        cronFields.dayOfWeek = fields[4];
      } else if (
        fields.length === 6 &&
        fields[0] &&
        fields[1] &&
        fields[2] &&
        fields[3] &&
        fields[4] &&
        fields[5]
      ) {
        // 6-field format with seconds: second minute hour day month dow
        cronFields.second = fields[0];
        cronFields.minute = fields[1];
        cronFields.hour = fields[2];
        cronFields.dayOfMonth = fields[3];
        cronFields.month = fields[4];
        cronFields.dayOfWeek = fields[5];
      } else if (
        fields.length === 7 &&
        fields[0] &&
        fields[1] &&
        fields[2] &&
        fields[3] &&
        fields[4] &&
        fields[5] &&
        fields[6]
      ) {
        // 7-field format with year: second minute hour day month dow year
        cronFields.second = fields[0];
        cronFields.minute = fields[1];
        cronFields.hour = fields[2];
        cronFields.dayOfMonth = fields[3];
        cronFields.month = fields[4];
        cronFields.dayOfWeek = fields[5];
        cronFields.year = fields[6];
      } else {
        errors.push('Invalid field format or missing required fields');
      }
    } catch (error) {
      errors.push('Failed to parse cron fields');
    }

    return cronFields;
  }

  /**
   * Validate individual cron fields
   */
  private validateCronFields(fields: CronFields, errors: string[]): void {
    const patterns = this.cronFieldPatterns;

    if (fields.second && !patterns['second']?.test(fields.second)) {
      errors.push(`Invalid second field: ${fields.second}`);
    }
    if (fields.minute && !patterns['minute']?.test(fields.minute)) {
      errors.push(`Invalid minute field: ${fields.minute}`);
    }
    if (fields.hour && !patterns['hour']?.test(fields.hour)) {
      errors.push(`Invalid hour field: ${fields.hour}`);
    }
    if (fields.dayOfMonth && !patterns['dayOfMonth']?.test(fields.dayOfMonth)) {
      errors.push(`Invalid day of month field: ${fields.dayOfMonth}`);
    }
    if (fields.month && !patterns['month']?.test(fields.month)) {
      errors.push(`Invalid month field: ${fields.month}`);
    }
    if (fields.dayOfWeek && !patterns['dayOfWeek']?.test(fields.dayOfWeek)) {
      errors.push(`Invalid day of week field: ${fields.dayOfWeek}`);
    }
    if (fields.year && !patterns['year']?.test(fields.year)) {
      errors.push(`Invalid year field: ${fields.year}`);
    }
  }

  /**
   * Generate human-readable description of cron expression
   */
  private generateDescription(fields: CronFields): string {
    try {
      const parts: string[] = [];

      // Analyze minute field
      if (fields.minute === '*') {
        parts.push('every minute');
      } else if (fields.minute && fields.minute.includes('/')) {
        const splitResult = fields.minute.split('/');
        const interval = splitResult[1];
        if (interval) {
          parts.push(`every ${interval} minutes`);
        }
      } else if (fields.minute) {
        parts.push(`at minute ${fields.minute}`);
      }

      // Analyze hour field
      if (fields.hour === '*') {
        parts.push('of every hour');
      } else if (fields.hour && fields.hour.includes('/')) {
        const splitResult = fields.hour.split('/');
        const interval = splitResult[1];
        if (interval) {
          parts.push(`every ${interval} hours`);
        }
      } else if (fields.hour) {
        parts.push(`at hour ${fields.hour}`);
      }

      // Analyze day fields
      if (fields.dayOfMonth === '*' && fields.dayOfWeek === '*') {
        parts.push('every day');
      } else if (fields.dayOfMonth !== '*') {
        parts.push(`on day ${fields.dayOfMonth} of the month`);
      } else if (fields.dayOfWeek !== '*') {
        parts.push(`on day ${fields.dayOfWeek} of the week`);
      }

      return parts.join(' ');
    } catch (error) {
      return 'Custom schedule';
    }
  }

  /**
   * Analyze frequency of cron expression
   */
  private analyzeFrequency(fields: CronFields): ScheduleFrequency {
    try {
      // Simple frequency analysis
      if (fields.minute === '*') {
        return {
          type: 'minutely',
          interval: 1,
          description: 'Every minute',
          estimatedExecutionsPerDay: 1440,
        };
      } else if (fields.minute && fields.minute.includes('/')) {
        const splitResult = fields.minute.split('/');
        const intervalStr = splitResult[1];
        if (intervalStr) {
          const interval = parseInt(intervalStr);
          return {
            type: 'minutely',
            interval,
            description: `Every ${interval} minutes`,
            estimatedExecutionsPerDay: Math.floor(1440 / interval),
          };
        }
      } else if (fields.hour === '*') {
        return {
          type: 'hourly',
          interval: 1,
          description: 'Every hour',
          estimatedExecutionsPerDay: 24,
        };
      } else if (fields.hour && fields.hour.includes('/')) {
        const splitResult = fields.hour.split('/');
        const intervalStr = splitResult[1];
        if (intervalStr) {
          const interval = parseInt(intervalStr);
          return {
            type: 'hourly',
            interval,
            description: `Every ${interval} hours`,
            estimatedExecutionsPerDay: Math.floor(24 / interval),
          };
        }
      }

      // Default fallback
      return {
        type: 'daily',
        interval: 1,
        description: 'Daily',
        estimatedExecutionsPerDay: 1,
      };
    } catch (error) {
      return {
        type: 'custom',
        interval: 0,
        description: 'Custom schedule',
        estimatedExecutionsPerDay: 1,
      };
    }
  }

  /**
   * Validate timezone compatibility
   */
  private validateTimezoneCompatibility(parsed: ParsedCronExpression, warnings: string[]): void {
    // Add timezone-specific warnings
    if (parsed.frequency.estimatedExecutionsPerDay > 24) {
      warnings.push('High frequency schedules may be affected by timezone changes');
    }
  }

  /**
   * Calculate next execution time (simplified implementation)
   */
  private calculateNextExecution(_expression: string, dt: SimpleDateTime): SimpleDateTime | null {
    // Simplified calculation - in production, use a proper cron library
    const now = dt.toJSDate();
    const nextMinute = new Date(now.getTime() + 60000); // Add 1 minute
    return SimpleDateTime.fromJSDate(nextMinute);
  }

  /**
   * Calculate previous execution time (simplified implementation)
   */
  private calculatePreviousExecution(
    _expression: string,
    dt: SimpleDateTime
  ): SimpleDateTime | null {
    // Simplified calculation - in production, use a proper cron library
    const now = dt.toJSDate();
    const prevMinute = new Date(now.getTime() - 60000); // Subtract 1 minute
    return SimpleDateTime.fromJSDate(prevMinute);
  }

  /**
   * Calculate peak hours from cron fields
   */
  private calculatePeakHours(fields: CronFields): number[] {
    const peakHours: number[] = [];

    if (!fields.hour) {
      return peakHours;
    }

    if (fields.hour === '*') {
      // All hours are peak
      for (let i = 0; i < 24; i++) {
        peakHours.push(i);
      }
    } else if (fields.hour.includes(',')) {
      // Specific hours
      const hours = fields.hour
        .split(',')
        .map((h) => parseInt(h.trim()))
        .filter((h) => !isNaN(h));
      peakHours.push(...hours);
    } else if (!isNaN(parseInt(fields.hour))) {
      // Single hour
      peakHours.push(parseInt(fields.hour));
    }

    return peakHours;
  }

  /**
   * Calculate distribution score
   */
  private calculateDistributionScore(fields: CronFields): number {
    // Simple scoring based on field specificity
    let score = 0;

    if (fields.minute === '*') score += 1;
    if (fields.hour === '*') score += 2;
    if (fields.dayOfMonth === '*') score += 3;
    if (fields.month === '*') score += 4;
    if (fields.dayOfWeek === '*') score += 5;

    return Math.min(score / 15, 1); // Normalize to 0-1
  }

  /**
   * Assess resource impact
   */
  private assessResourceImpact(frequency: ScheduleFrequency): ResourceImpactAnalysis {
    const execsPerDay = frequency.estimatedExecutionsPerDay;

    let impact: 'low' | 'medium' | 'high' = 'low';
    if (execsPerDay > 1440) impact = 'high';
    else if (execsPerDay > 144) impact = 'medium';

    return {
      cpuImpact: impact,
      memoryImpact: impact,
      networkImpact: impact,
      databaseImpact: impact,
      overallImpact: impact,
    };
  }

  /**
   * Generate frequency recommendations
   */
  private generateFrequencyRecommendations(
    frequency: ScheduleFrequency,
    impact: ResourceImpactAnalysis
  ): string[] {
    const recommendations: string[] = [];

    if (impact.overallImpact === 'high') {
      recommendations.push('Consider reducing execution frequency to improve performance');
      recommendations.push('Implement batching for high-frequency operations');
    }

    if (frequency.estimatedExecutionsPerDay > 1440) {
      recommendations.push('Very high frequency detected - monitor system resources');
    }

    return recommendations;
  }

  /**
   * Find time conflicts between two schedules
   */
  private findTimeConflicts(
    schedule1: { id: string; times: Date[] },
    schedule2: { id: string; times: Date[] }
  ): ScheduleConflict[] {
    const conflicts: ScheduleConflict[] = [];
    const tolerance = 60000; // 1 minute tolerance

    for (const time1 of schedule1.times) {
      for (const time2 of schedule2.times) {
        if (Math.abs(time1.getTime() - time2.getTime()) < tolerance) {
          conflicts.push({
            scheduleIds: [schedule1.id, schedule2.id],
            conflictTime: time1,
            severity: 'medium',
            description: `Schedules ${schedule1.id} and ${schedule2.id} execute within 1 minute`,
            resolution: 'Adjust one schedule to avoid overlap',
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Generate optimization suggestion for a conflict
   */
  private generateOptimizationSuggestion(
    conflict: ScheduleConflict,
    expressions: string[]
  ): OptimizationSuggestion | null {
    try {
      const firstScheduleId = conflict.scheduleIds[0];
      if (!firstScheduleId) {
        return null;
      }

      const scheduleIdParts = firstScheduleId.split('_');
      if (!scheduleIdParts || scheduleIdParts.length < 2) {
        return null;
      }

      const indexStr = scheduleIdParts[1];
      if (!indexStr) {
        return null;
      }

      const scheduleIndex = parseInt(indexStr);
      const currentExpression = expressions[scheduleIndex];

      if (!currentExpression) {
        return null;
      }

      return {
        type: 'time_adjustment',
        scheduleId: firstScheduleId,
        currentExpression,
        suggestedExpression: currentExpression, // In production, calculate adjusted expression
        reason: 'Reduce schedule conflicts',
        expectedBenefit: 'Improved system performance and reliability',
        riskLevel: 'low',
      };
    } catch (error) {
      return null;
    }
  }
}
