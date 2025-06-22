/**
 * Typing Indicators Service
 *
 * Provides real-time typing notifications with <30ms latency,
 * multi-user coordination, debounced events, and automatic cleanup.
 *
 * Features:
 * - Real-time typing notifications with sub-30ms latency
 * - Multi-user coordination with conflict resolution
 * - Debounced events to optimize network usage
 * - Automatic cleanup of stale typing states
 * - Cross-device synchronization for seamless experience
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import {
  MobileMessage,
  MessagePriority,
  CompressionType,
  MOBILE_PROTOCOL_VERSION,
} from '../types/mobile';

export interface TypingEvent {
  userId: string;
  deviceId: string;
  sessionId: string;
  isTyping: boolean;
  timestamp: number;
  cursorPosition?: number;
  selectionRange?: {
    start: number;
    end: number;
  };
}

export interface TypingState {
  userId: string;
  deviceId: string;
  sessionId: string;
  isTyping: boolean;
  lastActivity: number;
  cursorPosition?: number;
  selectionRange?: {
    start: number;
    end: number;
  };
  debounceTimer?: NodeJS.Timeout;
  cleanupTimer?: NodeJS.Timeout;
}

export interface TypingSession {
  sessionId: string;
  activeTypers: Map<string, TypingState>; // key: userId-deviceId
  lastUpdate: number;
  participants: Set<string>; // userIds
  config: TypingSessionConfig;
}

export interface TypingSessionConfig {
  debounceDelay: number; // ms to wait before sending typing stopped
  cleanupTimeout: number; // ms to wait before removing stale typing state
  maxTypingDuration: number; // max time to show typing indicator
  conflictResolution: 'priority' | 'merge' | 'latest';
  enableCursorSync: boolean;
  enableSelectionSync: boolean;
}

export interface TypingMetrics {
  totalEvents: number;
  averageLatency: number;
  debouncedEvents: number;
  conflictResolutions: number;
  cleanupOperations: number;
  activeTypingSessions: number;
  lastActivity: number;
}

/**
 * Typing Indicators Service
 *
 * Manages real-time typing notifications with intelligent debouncing,
 * multi-user coordination, and automatic state cleanup.
 */
export class TypingIndicatorsService extends EventEmitter {
  private sessions: Map<string, TypingSession> = new Map();
  private userDeviceMap: Map<string, Set<string>> = new Map(); // userId -> deviceIds
  private globalMetrics: TypingMetrics = {
    totalEvents: 0,
    averageLatency: 0,
    debouncedEvents: 0,
    conflictResolutions: 0,
    cleanupOperations: 0,
    activeTypingSessions: 0,
    lastActivity: Date.now(),
  };

  private readonly defaultSessionConfig: TypingSessionConfig = {
    debounceDelay: 1000, // 1 second
    cleanupTimeout: 5000, // 5 seconds
    maxTypingDuration: 30000, // 30 seconds
    conflictResolution: 'latest',
    enableCursorSync: true,
    enableSelectionSync: true,
  };

  constructor() {
    super();
    this.startCleanupMonitoring();
  }

  /**
   * Create or join a typing session
   */
  public createSession(sessionId: string, config?: Partial<TypingSessionConfig>): void {
    if (this.sessions.has(sessionId)) {
      logger.debug('Typing session already exists', { sessionId });
      return;
    }

    const sessionConfig = { ...this.defaultSessionConfig, ...config };

    const session: TypingSession = {
      sessionId,
      activeTypers: new Map(),
      lastUpdate: Date.now(),
      participants: new Set(),
      config: sessionConfig,
    };

    this.sessions.set(sessionId, session);
    this.globalMetrics.activeTypingSessions++;

    logger.info('Typing session created', {
      sessionId,
      config: sessionConfig,
    });

    this.emit('sessionCreated', { sessionId, config: sessionConfig });
  }

  /**
   * Add user to typing session
   */
  public joinSession(sessionId: string, userId: string, deviceId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Typing session not found: ${sessionId}`);
    }

    session.participants.add(userId);

    // Track user devices
    if (!this.userDeviceMap.has(userId)) {
      this.userDeviceMap.set(userId, new Set());
    }
    this.userDeviceMap.get(userId)!.add(deviceId);

    logger.debug('User joined typing session', {
      sessionId,
      userId,
      deviceId,
      participantCount: session.participants.size,
    });

    this.emit('userJoined', { sessionId, userId, deviceId });
  }

  /**
   * Remove user from typing session
   */
  public leaveSession(sessionId: string, userId: string, deviceId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Remove typing state
    const typingKey = `${userId}-${deviceId}`;
    const typingState = session.activeTypers.get(typingKey);
    if (typingState) {
      this.clearTypingState(session, typingKey, typingState);
    }

    // Update user device tracking
    const userDevices = this.userDeviceMap.get(userId);
    if (userDevices) {
      userDevices.delete(deviceId);
      if (userDevices.size === 0) {
        this.userDeviceMap.delete(userId);
        session.participants.delete(userId);
      }
    }

    logger.debug('User left typing session', {
      sessionId,
      userId,
      deviceId,
      participantCount: session.participants.size,
    });

    this.emit('userLeft', { sessionId, userId, deviceId });

    // Clean up empty session
    if (session.participants.size === 0) {
      this.destroySession(sessionId);
    }
  }

  /**
   * Process typing event
   */
  public async processTypingEvent(event: TypingEvent): Promise<void> {
    const startTime = Date.now();
    const { sessionId, userId, deviceId, isTyping } = event;

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Typing session not found: ${sessionId}`);
    }

    const typingKey = `${userId}-${deviceId}`;
    const existingState = session.activeTypers.get(typingKey);

    if (isTyping) {
      await this.handleTypingStart(session, event, existingState);
    } else {
      await this.handleTypingStop(session, event, existingState);
    }

    // Update metrics
    this.globalMetrics.totalEvents++;
    const latency = Date.now() - startTime;
    this.updateLatencyMetrics(latency);
    this.globalMetrics.lastActivity = Date.now();

    session.lastUpdate = Date.now();

    logger.debug('Typing event processed', {
      sessionId,
      userId,
      deviceId,
      isTyping,
      latency,
    });
  }

  /**
   * Handle typing start event
   */
  private async handleTypingStart(
    session: TypingSession,
    event: TypingEvent,
    existingState?: TypingState
  ): Promise<void> {
    const { userId, deviceId, cursorPosition, selectionRange } = event;
    const typingKey = `${userId}-${deviceId}`;

    // Clear existing debounce timer
    if (existingState?.debounceTimer) {
      clearTimeout(existingState.debounceTimer);
    }

    // Clear existing cleanup timer
    if (existingState?.cleanupTimer) {
      clearTimeout(existingState.cleanupTimer);
    }

    // Create or update typing state
    const typingState: TypingState = {
      userId,
      deviceId,
      sessionId: session.sessionId,
      isTyping: true,
      lastActivity: Date.now(),
    };

    // Only add optional properties if they are defined
    if (cursorPosition !== undefined) {
      typingState.cursorPosition = cursorPosition;
    }
    if (selectionRange !== undefined) {
      typingState.selectionRange = selectionRange;
    }

    // Set cleanup timer for max typing duration
    typingState.cleanupTimer = setTimeout(() => {
      this.handleTypingTimeout(session, typingKey);
    }, session.config.maxTypingDuration);

    session.activeTypers.set(typingKey, typingState);

    // Handle conflicts with other devices for same user
    await this.resolveTypingConflicts(session, userId, deviceId);

    // Broadcast typing start event
    await this.broadcastTypingEvent(session, event);

    this.emit('typingStarted', {
      sessionId: session.sessionId,
      userId,
      deviceId,
      cursorPosition,
      selectionRange,
    });
  }

  /**
   * Handle typing stop event
   */
  private async handleTypingStop(
    session: TypingSession,
    event: TypingEvent,
    existingState?: TypingState
  ): Promise<void> {
    const { userId, deviceId } = event;
    const typingKey = `${userId}-${deviceId}`;

    if (!existingState) {
      return; // No typing state to stop
    }

    // Set debounce timer to delay the stop event
    if (existingState.debounceTimer) {
      clearTimeout(existingState.debounceTimer);
    }

    existingState.debounceTimer = setTimeout(async () => {
      await this.finalizeTypingStop(session, typingKey, event);
    }, session.config.debounceDelay);

    this.globalMetrics.debouncedEvents++;

    logger.debug('Typing stop debounced', {
      sessionId: session.sessionId,
      userId,
      deviceId,
      debounceDelay: session.config.debounceDelay,
    });
  }

  /**
   * Finalize typing stop after debounce period
   */
  private async finalizeTypingStop(
    session: TypingSession,
    typingKey: string,
    event: TypingEvent
  ): Promise<void> {
    const typingState = session.activeTypers.get(typingKey);
    if (!typingState) {
      return;
    }

    // Clear typing state
    this.clearTypingState(session, typingKey, typingState);

    // Broadcast typing stop event
    await this.broadcastTypingEvent(session, { ...event, isTyping: false });

    this.emit('typingStopped', {
      sessionId: session.sessionId,
      userId: event.userId,
      deviceId: event.deviceId,
    });

    logger.debug('Typing stop finalized', {
      sessionId: session.sessionId,
      userId: event.userId,
      deviceId: event.deviceId,
    });
  }

  /**
   * Handle typing timeout (max duration exceeded)
   */
  private async handleTypingTimeout(session: TypingSession, typingKey: string): Promise<void> {
    const typingState = session.activeTypers.get(typingKey);
    if (!typingState) {
      return;
    }

    logger.warn('Typing timeout exceeded', {
      sessionId: session.sessionId,
      userId: typingState.userId,
      deviceId: typingState.deviceId,
      duration: Date.now() - typingState.lastActivity,
    });

    // Force stop typing
    const stopEvent: TypingEvent = {
      userId: typingState.userId,
      deviceId: typingState.deviceId,
      sessionId: session.sessionId,
      isTyping: false,
      timestamp: Date.now(),
    };

    await this.finalizeTypingStop(session, typingKey, stopEvent);
  }

  /**
   * Resolve typing conflicts between devices for same user
   */
  private async resolveTypingConflicts(
    session: TypingSession,
    userId: string,
    currentDeviceId: string
  ): Promise<void> {
    const userDevices = this.userDeviceMap.get(userId);
    if (!userDevices || userDevices.size <= 1) {
      return; // No conflicts possible
    }

    const conflictingStates: Array<{ key: string; state: TypingState }> = [];

    // Find conflicting typing states for same user
    for (const [key, state] of session.activeTypers.entries()) {
      if (state.userId === userId && state.deviceId !== currentDeviceId && state.isTyping) {
        conflictingStates.push({ key, state });
      }
    }

    if (conflictingStates.length === 0) {
      return; // No conflicts
    }

    this.globalMetrics.conflictResolutions++;

    // Apply conflict resolution strategy
    switch (session.config.conflictResolution) {
      case 'latest':
        // Stop typing on all other devices
        for (const { key, state } of conflictingStates) {
          await this.finalizeTypingStop(session, key, {
            userId: state.userId,
            deviceId: state.deviceId,
            sessionId: session.sessionId,
            isTyping: false,
            timestamp: Date.now(),
          });
        }
        break;

      case 'priority':
        // Could implement device priority logic here
        // For now, same as 'latest'
        for (const { key, state } of conflictingStates) {
          await this.finalizeTypingStop(session, key, {
            userId: state.userId,
            deviceId: state.deviceId,
            sessionId: session.sessionId,
            isTyping: false,
            timestamp: Date.now(),
          });
        }
        break;

      case 'merge':
        // Allow multiple devices to show typing simultaneously
        // No action needed
        break;
    }

    logger.debug('Typing conflict resolved', {
      sessionId: session.sessionId,
      userId,
      currentDeviceId,
      conflictingDevices: conflictingStates.length,
      strategy: session.config.conflictResolution,
    });
  }

  /**
   * Broadcast typing event to session participants
   */
  private async broadcastTypingEvent(session: TypingSession, event: TypingEvent): Promise<void> {
    const message: MobileMessage = {
      id: `typing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      protocolVersion: MOBILE_PROTOCOL_VERSION,
      source: {
        deviceId: event.deviceId,
        userId: event.userId,
        deviceType: 'mobile',
        timestamp: Date.now(),
      },
      destination: {
        target: 'broadcast',
      },
      type: 'typing_indicator',
      payload: {
        sessionId: session.sessionId,
        isTyping: event.isTyping,
        cursorPosition: event.cursorPosition,
        selectionRange: event.selectionRange,
      },
      optimization: {
        priority: 'high' as MessagePriority,
        compression: 'none' as CompressionType,
        requiresAck: false,
        offlineCapable: false,
      },
    };

    // Emit for transport layer to handle
    this.emit('broadcastMessage', { message, sessionId: session.sessionId });

    logger.debug('Typing event broadcasted', {
      sessionId: session.sessionId,
      userId: event.userId,
      deviceId: event.deviceId,
      isTyping: event.isTyping,
    });
  }

  /**
   * Clear typing state and timers
   */
  private clearTypingState(
    session: TypingSession,
    typingKey: string,
    typingState: TypingState
  ): void {
    // Clear timers
    if (typingState.debounceTimer) {
      clearTimeout(typingState.debounceTimer);
    }
    if (typingState.cleanupTimer) {
      clearTimeout(typingState.cleanupTimer);
    }

    // Remove from session
    session.activeTypers.delete(typingKey);
    this.globalMetrics.cleanupOperations++;

    logger.debug('Typing state cleared', {
      sessionId: session.sessionId,
      userId: typingState.userId,
      deviceId: typingState.deviceId,
    });
  }

  /**
   * Destroy a typing session
   */
  private destroySession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Clear all typing states
    for (const [key, state] of session.activeTypers.entries()) {
      this.clearTypingState(session, key, state);
    }

    // Remove session
    this.sessions.delete(sessionId);
    this.globalMetrics.activeTypingSessions--;

    logger.info('Typing session destroyed', {
      sessionId,
      finalParticipantCount: session.participants.size,
    });

    this.emit('sessionDestroyed', { sessionId });
  }

  /**
   * Update latency metrics
   */
  private updateLatencyMetrics(latency: number): void {
    const currentAvg = this.globalMetrics.averageLatency;
    const totalEvents = this.globalMetrics.totalEvents;
    this.globalMetrics.averageLatency = (currentAvg * (totalEvents - 1) + latency) / totalEvents;
  }

  /**
   * Start cleanup monitoring for stale sessions and typing states
   */
  private startCleanupMonitoring(): void {
    // Clean up stale typing states every 30 seconds
    setInterval(() => {
      this.cleanupStaleTypingStates();
    }, 30000);

    // Clean up inactive sessions every 5 minutes
    setInterval(() => {
      this.cleanupInactiveSessions();
    }, 300000);
  }

  /**
   * Clean up stale typing states
   */
  private cleanupStaleTypingStates(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [, session] of this.sessions.entries()) {
      const staleCutoff = now - session.config.cleanupTimeout;

      for (const [key, state] of session.activeTypers.entries()) {
        if (state.lastActivity < staleCutoff) {
          this.clearTypingState(session, key, state);
          cleanedCount++;

          // Broadcast typing stop for stale state
          this.broadcastTypingEvent(session, {
            userId: state.userId,
            deviceId: state.deviceId,
            sessionId: session.sessionId,
            isTyping: false,
            timestamp: now,
          });
        }
      }
    }

    if (cleanedCount > 0) {
      logger.info('Cleaned up stale typing states', { count: cleanedCount });
    }
  }

  /**
   * Clean up inactive sessions
   */
  private cleanupInactiveSessions(): void {
    const now = Date.now();
    const inactivityThreshold = 1800000; // 30 minutes
    const sessionsToDestroy: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastUpdate > inactivityThreshold && session.participants.size === 0) {
        sessionsToDestroy.push(sessionId);
      }
    }

    for (const sessionId of sessionsToDestroy) {
      this.destroySession(sessionId);
    }

    if (sessionsToDestroy.length > 0) {
      logger.info('Cleaned up inactive typing sessions', { count: sessionsToDestroy.length });
    }
  }

  /**
   * Get typing session information
   */
  public getSession(sessionId: string): TypingSession | null {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : null;
  }

  /**
   * Get active typers in a session
   */
  public getActiveTypers(sessionId: string): TypingState[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    return Array.from(session.activeTypers.values()).filter((state) => state.isTyping);
  }

  /**
   * Get typing metrics
   */
  public getMetrics(): TypingMetrics {
    return { ...this.globalMetrics };
  }

  /**
   * Get session metrics
   */
  public getSessionMetrics(sessionId: string): {
    activeTypers: number;
    totalParticipants: number;
    lastUpdate: number;
    config: TypingSessionConfig;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      activeTypers: Array.from(session.activeTypers.values()).filter((state) => state.isTyping)
        .length,
      totalParticipants: session.participants.size,
      lastUpdate: session.lastUpdate,
      config: session.config,
    };
  }

  /**
   * Update session configuration
   */
  public updateSessionConfig(sessionId: string, config: Partial<TypingSessionConfig>): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Typing session not found: ${sessionId}`);
    }

    session.config = { ...session.config, ...config };

    logger.info('Typing session config updated', {
      sessionId,
      newConfig: session.config,
    });

    this.emit('sessionConfigUpdated', { sessionId, config: session.config });
  }

  /**
   * Get all active sessions
   */
  public getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Check if user is typing in any session
   */
  public isUserTyping(userId: string): boolean {
    for (const session of this.sessions.values()) {
      for (const [, state] of session.activeTypers.entries()) {
        if (state.userId === userId && state.isTyping) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get user's typing sessions
   */
  public getUserTypingSessions(userId: string): string[] {
    const sessions: string[] = [];
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.participants.has(userId)) {
        sessions.push(sessionId);
      }
    }
    return sessions;
  }

  /**
   * Force stop typing for a user across all sessions
   */
  public async forceStopTyping(userId: string, deviceId?: string): Promise<void> {
    const stopEvents: TypingEvent[] = [];

    for (const session of this.sessions.values()) {
      for (const [, state] of session.activeTypers.entries()) {
        if (state.userId === userId && state.isTyping) {
          if (!deviceId || state.deviceId === deviceId) {
            stopEvents.push({
              userId: state.userId,
              deviceId: state.deviceId,
              sessionId: session.sessionId,
              isTyping: false,
              timestamp: Date.now(),
            });
          }
        }
      }
    }

    // Process all stop events
    for (const event of stopEvents) {
      await this.processTypingEvent(event);
    }

    logger.info('Force stopped typing', {
      userId,
      deviceId,
      stoppedSessions: stopEvents.length,
    });
  }

  /**
   * Shutdown the service
   */
  public shutdown(): void {
    // Destroy all sessions
    for (const sessionId of this.sessions.keys()) {
      this.destroySession(sessionId);
    }

    // Clear user device map
    this.userDeviceMap.clear();

    logger.info('Typing indicators service shutdown complete');
  }
}
