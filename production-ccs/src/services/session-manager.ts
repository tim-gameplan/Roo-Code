/**
 * Session Manager for RCCS - Manages device sessions and authentication
 * Part of TASK-007.3.1 RCCS Core Implementation
 */

import { logger } from '../utils/logger';
import { DeviceInfo, Session, RCCSConfig, SessionExpiredError } from '../types/rccs';

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private deviceSessions: Map<string, string> = new Map(); // deviceId -> sessionId
  private config: RCCSConfig;
  private cleanupInterval: NodeJS.Timeout | undefined;

  constructor(config: RCCSConfig) {
    this.config = config;
    this.startCleanupTimer();
  }

  /**
   * Create a new session for a device
   */
  public async createSession(deviceInfo: DeviceInfo): Promise<Session> {
    // Check if device already has an active session
    const existingSessionId = this.deviceSessions.get(deviceInfo.id);
    if (existingSessionId) {
      const existingSession = this.sessions.get(existingSessionId);
      if (existingSession && this.isSessionValid(existingSession)) {
        // Update existing session
        existingSession.lastActivity = new Date();
        existingSession.deviceInfo = deviceInfo;

        logger.debug('Updated existing session', {
          sessionId: existingSession.id,
          deviceId: deviceInfo.id,
        });

        return existingSession;
      } else {
        // Clean up expired session
        this.removeSession(existingSessionId);
      }
    }

    // Create new session
    const session: Session = {
      id: this.generateSessionId(),
      deviceId: deviceInfo.id,
      deviceInfo,
      userId: deviceInfo.userId,
      connectionId: deviceInfo.connectionId || '', // Will be updated when connection is established
      createdAt: new Date(),
      lastActivity: new Date(),
      expiresAt: new Date(Date.now() + this.config.sessionTimeout),
      isActive: true,
      metadata: {
        userAgent: 'RCCS-Client',
        ipAddress: '0.0.0.0', // Will be updated from connection
        platform: deviceInfo.platform,
      },
    };

    // Store session
    this.sessions.set(session.id, session);
    this.deviceSessions.set(deviceInfo.id, session.id);

    logger.info('Created new session', {
      sessionId: session.id,
      deviceId: deviceInfo.id,
      userId: deviceInfo.userId,
      expiresAt: session.expiresAt,
    });

    return session;
  }

  /**
   * Get session by ID
   */
  public getSession(sessionId: string): Session | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    if (!this.isSessionValid(session)) {
      this.removeSession(sessionId);
      return undefined;
    }

    return session;
  }

  /**
   * Get session by device ID
   */
  public getSessionByDeviceId(deviceId: string): Session | undefined {
    const sessionId = this.deviceSessions.get(deviceId);
    if (!sessionId) {
      return undefined;
    }

    return this.getSession(sessionId);
  }

  /**
   * Update session activity
   */
  public updateSessionActivity(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    if (!this.isSessionValid(session)) {
      this.removeSession(sessionId);
      return false;
    }

    session.lastActivity = new Date();
    session.expiresAt = new Date(Date.now() + this.config.sessionTimeout);

    logger.debug('Updated session activity', {
      sessionId,
      deviceId: session.deviceInfo.id,
      newExpiresAt: session.expiresAt,
    });

    return true;
  }

  /**
   * Mark session as inactive (but don't remove it immediately)
   */
  public markSessionInactive(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isActive = false;

      logger.debug('Marked session as inactive', {
        sessionId,
        deviceId: session.deviceInfo.id,
      });
    }
  }

  /**
   * Remove session completely
   */
  public removeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.deviceSessions.delete(session.deviceInfo.id);
      this.sessions.delete(sessionId);

      logger.info('Removed session', {
        sessionId,
        deviceId: session.deviceInfo.id,
        userId: session.userId,
      });
    }
  }

  /**
   * Validate session token/ID
   */
  public validateSession(sessionId: string): boolean {
    const session = this.getSession(sessionId);
    return session !== undefined && session.isActive;
  }

  /**
   * Get all active sessions for a user
   */
  public getUserSessions(userId: string): Session[] {
    const userSessions: Session[] = [];

    for (const session of this.sessions.values()) {
      if (session.userId === userId && this.isSessionValid(session)) {
        userSessions.push(session);
      }
    }

    return userSessions;
  }

  /**
   * Get all active sessions
   */
  public getActiveSessions(): Session[] {
    const activeSessions: Session[] = [];

    for (const session of this.sessions.values()) {
      if (this.isSessionValid(session)) {
        activeSessions.push(session);
      }
    }

    return activeSessions;
  }

  /**
   * Clean up expired sessions
   */
  public cleanupExpiredSessions(): number {
    const now = new Date();
    let cleanedCount = 0;
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.expiresAt || !session.isActive) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      this.removeSession(sessionId);
      cleanedCount++;
    }

    if (cleanedCount > 0) {
      logger.info('Cleaned up expired sessions', {
        cleanedCount,
        remainingSessions: this.sessions.size,
      });
    }

    return cleanedCount;
  }

  /**
   * Get session statistics
   */
  public getSessionStats(): {
    totalSessions: number;
    activeSessions: number;
    userCounts: Record<string, number>;
    deviceTypeCounts: Record<string, number>;
  } {
    const userCounts: Record<string, number> = {};
    const deviceTypeCounts: Record<string, number> = {};
    let activeSessions = 0;

    for (const session of this.sessions.values()) {
      if (this.isSessionValid(session)) {
        activeSessions++;

        userCounts[session.userId] = (userCounts[session.userId] || 0) + 1;
        deviceTypeCounts[session.deviceInfo.type] =
          (deviceTypeCounts[session.deviceInfo.type] || 0) + 1;
      }
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions,
      userCounts,
      deviceTypeCounts,
    };
  }

  /**
   * Check if session is valid (not expired and active)
   */
  private isSessionValid(session: Session): boolean {
    const now = new Date();
    return session.isActive && now <= session.expiresAt;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
  }

  /**
   * Start cleanup timer for expired sessions
   */
  private startCleanupTimer(): void {
    // Clean up expired sessions every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupExpiredSessions();
      },
      5 * 60 * 1000
    );

    logger.debug('Started session cleanup timer');
  }

  /**
   * Stop cleanup timer
   */
  public stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cleanupInterval = undefined;

    logger.debug('Stopped session manager');
  }

  /**
   * Extend session expiration
   */
  public extendSession(
    sessionId: string,
    additionalTime: number = this.config.sessionTimeout
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !this.isSessionValid(session)) {
      return false;
    }

    session.expiresAt = new Date(Date.now() + additionalTime);
    session.lastActivity = new Date();

    logger.debug('Extended session', {
      sessionId,
      deviceId: session.deviceInfo.id,
      newExpiresAt: session.expiresAt,
    });

    return true;
  }

  /**
   * Revoke all sessions for a user
   */
  public revokeUserSessions(userId: string): number {
    let revokedCount = 0;
    const sessionsToRevoke: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        sessionsToRevoke.push(sessionId);
      }
    }

    for (const sessionId of sessionsToRevoke) {
      this.removeSession(sessionId);
      revokedCount++;
    }

    logger.info('Revoked user sessions', {
      userId,
      revokedCount,
    });

    return revokedCount;
  }

  /**
   * Update session metadata
   */
  public updateSessionMetadata(sessionId: string, metadata: Partial<Session['metadata']>): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !this.isSessionValid(session)) {
      return false;
    }

    Object.assign(session.metadata, metadata);
    session.lastActivity = new Date();

    logger.debug('Updated session metadata', {
      sessionId,
      deviceId: session.deviceInfo.id,
      metadata,
    });

    return true;
  }
}
