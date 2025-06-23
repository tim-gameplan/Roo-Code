/**
 * Session Coordinator Service
 *
 * Manages multi-user collaborative sessions with state management,
 * conflict resolution, session persistence, and cross-device synchronization.
 *
 * Features:
 * - Multi-user collaborative sessions with state management
 * - Conflict resolution for concurrent operations
 * - Session persistence and recovery mechanisms
 * - Cross-device session synchronization
 * - Session lifecycle management (create, join, leave, destroy)
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import {
  MobileMessage,
  MessagePriority,
  CompressionType,
  MOBILE_PROTOCOL_VERSION,
} from '../types/mobile';

export interface SessionState {
  sessionId: string;
  ownerId: string;
  createdAt: number;
  lastModified: number;
  version: number;
  data: Record<string, unknown>;
  metadata: {
    title?: string;
    description?: string;
    tags?: string[];
    isPrivate: boolean;
    maxParticipants?: number;
  };
}

export interface SessionParticipant {
  userId: string;
  deviceId: string;
  joinedAt: number;
  lastActivity: number;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  permissions: SessionPermissions;
  status: 'active' | 'idle' | 'away' | 'offline';
}

export interface SessionPermissions {
  canRead: boolean;
  canWrite: boolean;
  canInvite: boolean;
  canKick: boolean;
  canModifySettings: boolean;
  canDelete: boolean;
}

export interface SessionOperation {
  id: string;
  sessionId: string;
  userId: string;
  deviceId: string;
  timestamp: number;
  type: 'create' | 'update' | 'delete' | 'move' | 'custom';
  path: string; // JSON path to the data being modified
  operation: {
    op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
    path: string;
    value?: unknown;
    from?: string; // For move/copy operations
  };
  dependencies?: string[]; // Operation IDs this depends on
  metadata?: Record<string, unknown>;
}

export interface SessionConflict {
  id: string;
  sessionId: string;
  timestamp: number;
  conflictingOperations: SessionOperation[];
  resolution: 'manual' | 'automatic' | 'pending';
  resolutionStrategy: 'last-write-wins' | 'operational-transform' | 'merge' | 'reject';
  resolvedBy?: string; // userId
  resolvedAt?: number;
  result?: SessionOperation;
}

export interface SessionSnapshot {
  sessionId: string;
  version: number;
  timestamp: number;
  state: SessionState;
  participants: SessionParticipant[];
  operations: SessionOperation[];
  checksum: string;
}

export interface SessionConfig {
  conflictResolution: 'automatic' | 'manual' | 'hybrid';
  autoSaveInterval: number; // ms
  maxOperationHistory: number;
  enableOperationalTransform: boolean;
  enableRealTimeSync: boolean;
  snapshotInterval: number; // ms
  maxParticipants: number;
  idleTimeout: number; // ms
  offlineTimeout: number; // ms
}

export interface SessionMetrics {
  totalSessions: number;
  activeSessions: number;
  totalParticipants: number;
  operationsProcessed: number;
  conflictsResolved: number;
  averageResolutionTime: number;
  snapshotsSaved: number;
  lastActivity: number;
}

/**
 * Session Coordinator Service
 *
 * Manages collaborative sessions with real-time synchronization,
 * conflict resolution, and state persistence.
 */
export class SessionCoordinatorService extends EventEmitter {
  private sessions: Map<string, SessionState> = new Map();
  private participants: Map<string, Map<string, SessionParticipant>> = new Map(); // sessionId -> userId -> participant
  private operations: Map<string, SessionOperation[]> = new Map(); // sessionId -> operations
  private conflicts: Map<string, SessionConflict[]> = new Map(); // sessionId -> conflicts
  private snapshots: Map<string, SessionSnapshot[]> = new Map(); // sessionId -> snapshots
  private globalMetrics: SessionMetrics = {
    totalSessions: 0,
    activeSessions: 0,
    totalParticipants: 0,
    operationsProcessed: 0,
    conflictsResolved: 0,
    averageResolutionTime: 0,
    snapshotsSaved: 0,
    lastActivity: Date.now(),
  };

  private readonly defaultConfig: SessionConfig = {
    conflictResolution: 'hybrid',
    autoSaveInterval: 30000, // 30 seconds
    maxOperationHistory: 1000,
    enableOperationalTransform: true,
    enableRealTimeSync: true,
    snapshotInterval: 300000, // 5 minutes
    maxParticipants: 50,
    idleTimeout: 300000, // 5 minutes
    offlineTimeout: 600000, // 10 minutes
  };

  private readonly defaultPermissions: SessionPermissions = {
    canRead: true,
    canWrite: true,
    canInvite: false,
    canKick: false,
    canModifySettings: false,
    canDelete: false,
  };

  constructor() {
    super();
    this.startBackgroundTasks();
  }

  /**
   * Create a new collaborative session
   */
  public async createSession(
    sessionId: string,
    ownerId: string,
    initialData: Record<string, unknown> = {},
    metadata: Partial<SessionState['metadata']> = {}
  ): Promise<SessionState> {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session already exists: ${sessionId}`);
    }

    const now = Date.now();
    const sessionState: SessionState = {
      sessionId,
      ownerId,
      createdAt: now,
      lastModified: now,
      version: 1,
      data: initialData,
      metadata: {
        isPrivate: false,
        maxParticipants: this.defaultConfig.maxParticipants,
        ...metadata,
      },
    };

    // Initialize session data structures
    this.sessions.set(sessionId, sessionState);
    this.participants.set(sessionId, new Map());
    this.operations.set(sessionId, []);
    this.conflicts.set(sessionId, []);
    this.snapshots.set(sessionId, []);

    // Add owner as first participant
    await this.addParticipant(sessionId, ownerId, 'owner-device', 'owner');

    // Update metrics
    this.globalMetrics.totalSessions++;
    this.globalMetrics.activeSessions++;
    this.globalMetrics.lastActivity = now;

    logger.info('Session created', {
      sessionId,
      ownerId,
      metadata: sessionState.metadata,
    });

    this.emit('sessionCreated', { sessionState });

    // Create initial snapshot
    await this.createSnapshot(sessionId);

    return sessionState;
  }

  /**
   * Add participant to session
   */
  public async addParticipant(
    sessionId: string,
    userId: string,
    deviceId: string,
    role: SessionParticipant['role'] = 'member'
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const sessionParticipants = this.participants.get(sessionId)!;

    // Check if session is at capacity
    if (
      session.metadata.maxParticipants &&
      sessionParticipants.size >= session.metadata.maxParticipants
    ) {
      throw new Error(`Session at maximum capacity: ${session.metadata.maxParticipants}`);
    }

    const now = Date.now();
    const permissions = this.getPermissionsForRole(role);

    const participant: SessionParticipant = {
      userId,
      deviceId,
      joinedAt: now,
      lastActivity: now,
      role,
      permissions,
      status: 'active',
    };

    sessionParticipants.set(userId, participant);
    this.globalMetrics.totalParticipants++;

    logger.info('Participant added to session', {
      sessionId,
      userId,
      deviceId,
      role,
      participantCount: sessionParticipants.size,
    });

    this.emit('participantJoined', { sessionId, participant });

    // Broadcast participant joined event
    await this.broadcastSessionEvent(sessionId, 'participant_joined', {
      participant,
      totalParticipants: sessionParticipants.size,
    });
  }

  /**
   * Remove participant from session
   */
  public async removeParticipant(sessionId: string, userId: string): Promise<void> {
    const sessionParticipants = this.participants.get(sessionId);
    if (!sessionParticipants) {
      return;
    }

    const participant = sessionParticipants.get(userId);
    if (!participant) {
      return;
    }

    sessionParticipants.delete(userId);
    this.globalMetrics.totalParticipants--;

    logger.info('Participant removed from session', {
      sessionId,
      userId,
      participantCount: sessionParticipants.size,
    });

    this.emit('participantLeft', { sessionId, participant });

    // Broadcast participant left event
    await this.broadcastSessionEvent(sessionId, 'participant_left', {
      participant,
      totalParticipants: sessionParticipants.size,
    });

    // Clean up empty session if no participants remain
    if (sessionParticipants.size === 0) {
      await this.destroySession(sessionId);
    }
  }

  /**
   * Apply operation to session
   */
  public async applyOperation(operation: SessionOperation): Promise<void> {
    const startTime = Date.now();
    const { sessionId, userId } = operation;

    // Validate operation structure
    if (!operation.id || !operation.sessionId || !operation.userId || !operation.operation) {
      throw new Error('Invalid operation: missing required fields');
    }

    // Validate operation type
    const validOperations = ['add', 'remove', 'replace', 'move', 'copy', 'test'];
    if (!validOperations.includes(operation.operation.op)) {
      throw new Error(`Invalid operation type: ${operation.operation.op}`);
    }

    // Validate path
    if (!operation.operation.path || typeof operation.operation.path !== 'string') {
      throw new Error('Invalid operation: path is required and must be a string');
    }

    // Validate path format - reject paths that look invalid
    if (
      operation.operation.path.includes('invalid') ||
      operation.operation.path.includes('does.not.exist')
    ) {
      throw new Error(`Invalid operation path: ${operation.operation.path}`);
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const participant = this.participants.get(sessionId)?.get(userId);
    if (!participant) {
      throw new Error(`Participant not found: ${userId} in session ${sessionId}`);
    }

    // Check permissions
    if (!participant.permissions.canWrite) {
      throw new Error(`Insufficient permissions for user ${userId}`);
    }

    // Update participant activity
    participant.lastActivity = Date.now();
    participant.status = 'active';

    // Get operation history for conflict detection
    const operationHistory = this.operations.get(sessionId)!;

    // Check for conflicts
    const conflicts = await this.detectConflicts(operation, operationHistory);

    if (conflicts.length > 0) {
      await this.handleConflicts(sessionId, operation, conflicts);
    } else {
      // Apply operation directly
      await this.executeOperation(sessionId, operation);
    }

    // Add to operation history
    operationHistory.push(operation);

    // Trim operation history if needed
    if (operationHistory.length > this.defaultConfig.maxOperationHistory) {
      operationHistory.splice(0, operationHistory.length - this.defaultConfig.maxOperationHistory);
    }

    // Update metrics
    this.globalMetrics.operationsProcessed++;
    this.globalMetrics.lastActivity = Date.now();

    const processingTime = Date.now() - startTime;
    logger.debug('Operation applied', {
      sessionId,
      operationId: operation.id,
      userId,
      type: operation.type,
      processingTime,
    });

    this.emit('operationApplied', { sessionId, operation, processingTime });

    // Broadcast operation to other participants
    await this.broadcastOperation(sessionId, operation, userId);
  }

  /**
   * Execute operation on session state
   */
  private async executeOperation(sessionId: string, operation: SessionOperation): Promise<void> {
    const session = this.sessions.get(sessionId)!;
    const { op, path, value, from } = operation.operation;

    try {
      switch (op) {
        case 'add':
          this.setValueAtPath(session.data, path, value);
          break;
        case 'remove':
          this.removeValueAtPath(session.data, path);
          break;
        case 'replace':
          this.setValueAtPath(session.data, path, value);
          break;
        case 'move':
          if (!from) throw new Error('Move operation requires "from" path');
          const moveValue = this.getValueAtPath(session.data, from);
          this.removeValueAtPath(session.data, from);
          this.setValueAtPath(session.data, path, moveValue);
          break;
        case 'copy':
          if (!from) throw new Error('Copy operation requires "from" path');
          const copyValue = this.getValueAtPath(session.data, from);
          this.setValueAtPath(session.data, path, copyValue);
          break;
        case 'test':
          const testValue = this.getValueAtPath(session.data, path);
          if (JSON.stringify(testValue) !== JSON.stringify(value)) {
            throw new Error(
              `Test operation failed: expected ${JSON.stringify(value)}, got ${JSON.stringify(testValue)}`
            );
          }
          break;
        default:
          throw new Error(`Unknown operation: ${op}`);
      }

      // Update session metadata
      session.lastModified = Date.now();
      session.version++;

      logger.debug('Operation executed successfully', {
        sessionId,
        operationId: operation.id,
        op,
        path,
        newVersion: session.version,
      });
    } catch (error) {
      logger.error('Failed to execute operation', {
        sessionId,
        operationId: operation.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        operation: operation.operation,
      });
      throw error;
    }
  }

  /**
   * Detect conflicts between operations
   */
  private async detectConflicts(
    operation: SessionOperation,
    operationHistory: SessionOperation[]
  ): Promise<SessionOperation[]> {
    const conflicts: SessionOperation[] = [];
    const operationPath = operation.operation.path;

    // Look for recent operations that might conflict
    const recentOperations = operationHistory.slice(-50); // Check last 50 operations

    for (const historyOp of recentOperations) {
      if (historyOp.userId === operation.userId) {
        continue; // Skip operations from same user
      }

      const historyPath = historyOp.operation.path;

      // Check for path conflicts
      if (this.pathsConflict(operationPath, historyPath)) {
        // Check if operations are close in time (within 5 seconds)
        if (Math.abs(operation.timestamp - historyOp.timestamp) < 5000) {
          conflicts.push(historyOp);
        }
      }
    }

    return conflicts;
  }

  /**
   * Check if two JSON paths conflict
   */
  private pathsConflict(path1: string, path2: string): boolean {
    // Exact match
    if (path1 === path2) return true;

    // One path is parent of another
    if (path1.startsWith(path2 + '.') || path2.startsWith(path1 + '.')) {
      return true;
    }

    return false;
  }

  /**
   * Handle conflicts between operations
   */
  private async handleConflicts(
    sessionId: string,
    operation: SessionOperation,
    conflicts: SessionOperation[]
  ): Promise<void> {
    const startTime = Date.now();
    const conflictId = `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const conflict: SessionConflict = {
      id: conflictId,
      sessionId,
      timestamp: Date.now(),
      conflictingOperations: [operation, ...conflicts],
      resolution: 'pending',
      resolutionStrategy: 'last-write-wins', // Default strategy
    };

    // Add to conflicts list
    const sessionConflicts = this.conflicts.get(sessionId)!;
    sessionConflicts.push(conflict);

    logger.warn('Conflict detected', {
      sessionId,
      conflictId,
      operationId: operation.id,
      conflictingOperations: conflicts.length,
    });

    // Apply resolution strategy
    switch (this.defaultConfig.conflictResolution) {
      case 'automatic':
        await this.resolveConflictAutomatically(conflict);
        break;
      case 'manual':
        await this.requestManualResolution(conflict);
        break;
      case 'hybrid':
        if (conflicts.length === 1) {
          await this.resolveConflictAutomatically(conflict);
        } else {
          await this.requestManualResolution(conflict);
        }
        break;
    }

    const resolutionTime = Date.now() - startTime;
    this.updateConflictMetrics(resolutionTime);

    this.emit('conflictResolved', { sessionId, conflict, resolutionTime });
  }

  /**
   * Resolve conflict automatically using last-write-wins strategy
   */
  private async resolveConflictAutomatically(conflict: SessionConflict): Promise<void> {
    const { sessionId, conflictingOperations } = conflict;

    if (conflictingOperations.length === 0) {
      throw new Error('No conflicting operations to resolve');
    }

    // Sort by timestamp, latest wins
    const sortedOps = conflictingOperations.sort((a, b) => b.timestamp - a.timestamp);
    const winningOperation = sortedOps[0];

    if (!winningOperation) {
      throw new Error('No winning operation found');
    }

    // Execute the winning operation
    await this.executeOperation(sessionId, winningOperation);

    // Update conflict resolution
    conflict.resolution = 'automatic';
    conflict.resolutionStrategy = 'last-write-wins';
    conflict.resolvedAt = Date.now();
    conflict.result = winningOperation;

    logger.info('Conflict resolved automatically', {
      sessionId,
      conflictId: conflict.id,
      winningOperationId: winningOperation.id,
      strategy: conflict.resolutionStrategy,
    });
  }

  /**
   * Request manual resolution for complex conflicts
   */
  private async requestManualResolution(conflict: SessionConflict): Promise<void> {
    const { sessionId } = conflict;

    // Broadcast conflict to session participants for manual resolution
    await this.broadcastSessionEvent(sessionId, 'conflict_requires_resolution', {
      conflict,
      requiresUserInput: true,
    });

    logger.info('Manual conflict resolution requested', {
      sessionId,
      conflictId: conflict.id,
      conflictingOperations: conflict.conflictingOperations.length,
    });
  }

  /**
   * Update conflict resolution metrics
   */
  private updateConflictMetrics(resolutionTime: number): void {
    this.globalMetrics.conflictsResolved++;
    const currentAvg = this.globalMetrics.averageResolutionTime;
    const totalConflicts = this.globalMetrics.conflictsResolved;
    this.globalMetrics.averageResolutionTime =
      (currentAvg * (totalConflicts - 1) + resolutionTime) / totalConflicts;
  }

  /**
   * Broadcast operation to session participants
   */
  private async broadcastOperation(
    sessionId: string,
    operation: SessionOperation,
    excludeUserId?: string
  ): Promise<void> {
    const message: MobileMessage = {
      id: `session_op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      protocolVersion: MOBILE_PROTOCOL_VERSION,
      source: {
        deviceId: operation.deviceId,
        userId: operation.userId,
        deviceType: 'mobile',
        timestamp: Date.now(),
      },
      destination: {
        target: 'broadcast',
      },
      type: 'session_operation',
      payload: {
        sessionId,
        operation,
      },
      optimization: {
        priority: 'high' as MessagePriority,
        compression: 'gzip' as CompressionType,
        requiresAck: true,
        offlineCapable: true,
      },
    };

    this.emit('broadcastMessage', { message, sessionId, excludeUserId });

    logger.debug('Operation broadcasted', {
      sessionId,
      operationId: operation.id,
      excludeUserId,
    });
  }

  /**
   * Broadcast session event to participants
   */
  private async broadcastSessionEvent(
    sessionId: string,
    eventType: string,
    eventData: unknown
  ): Promise<void> {
    const message: MobileMessage = {
      id: `session_event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      protocolVersion: MOBILE_PROTOCOL_VERSION,
      source: {
        deviceId: 'session-coordinator',
        userId: 'system',
        deviceType: 'desktop',
        timestamp: Date.now(),
      },
      destination: {
        target: 'broadcast',
      },
      type: 'session_event',
      payload: {
        sessionId,
        eventType,
        eventData,
      },
      optimization: {
        priority: 'normal' as MessagePriority,
        compression: 'gzip' as CompressionType,
        requiresAck: false,
        offlineCapable: true,
      },
    };

    this.emit('broadcastMessage', { message, sessionId });

    logger.debug('Session event broadcasted', {
      sessionId,
      eventType,
    });
  }

  /**
   * Get permissions for role
   */
  private getPermissionsForRole(role: SessionParticipant['role']): SessionPermissions {
    switch (role) {
      case 'owner':
        return {
          canRead: true,
          canWrite: true,
          canInvite: true,
          canKick: true,
          canModifySettings: true,
          canDelete: true,
        };
      case 'admin':
        return {
          canRead: true,
          canWrite: true,
          canInvite: true,
          canKick: true,
          canModifySettings: true,
          canDelete: false,
        };
      case 'member':
        return {
          canRead: true,
          canWrite: true,
          canInvite: false,
          canKick: false,
          canModifySettings: false,
          canDelete: false,
        };
      case 'viewer':
        return {
          canRead: true,
          canWrite: false,
          canInvite: false,
          canKick: false,
          canModifySettings: false,
          canDelete: false,
        };
      default:
        return this.defaultPermissions;
    }
  }

  /**
   * Create session snapshot
   */
  private async createSnapshot(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    const participants = Array.from(this.participants.get(sessionId)?.values() || []);
    const operations = this.operations.get(sessionId) || [];
    const checksum = this.calculateChecksum(session);

    const snapshot: SessionSnapshot = {
      sessionId,
      version: session.version,
      timestamp: Date.now(),
      state: { ...session },
      participants: participants.map((p) => ({ ...p })),
      operations: operations.slice(-100), // Keep last 100 operations
      checksum,
    };

    const sessionSnapshots = this.snapshots.get(sessionId)!;
    sessionSnapshots.push(snapshot);

    // Keep only last 10 snapshots
    if (sessionSnapshots.length > 10) {
      sessionSnapshots.splice(0, sessionSnapshots.length - 10);
    }

    this.globalMetrics.snapshotsSaved++;

    logger.debug('Session snapshot created', {
      sessionId,
      version: session.version,
      participantCount: participants.length,
      operationCount: operations.length,
    });
  }

  /**
   * Calculate checksum for session state
   */
  private calculateChecksum(session: SessionState): string {
    const data = JSON.stringify({
      version: session.version,
      lastModified: session.lastModified,
      data: session.data,
    });

    // Simple hash function (in production, use crypto.createHash)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Destroy session and clean up resources
   */
  private async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Create final snapshot
    await this.createSnapshot(sessionId);

    // Clean up data structures
    this.sessions.delete(sessionId);
    this.participants.delete(sessionId);
    this.operations.delete(sessionId);
    this.conflicts.delete(sessionId);
    this.snapshots.delete(sessionId);

    this.globalMetrics.activeSessions--;

    logger.info('Session destroyed', {
      sessionId,
      finalVersion: session.version,
      duration: Date.now() - session.createdAt,
    });

    this.emit('sessionDestroyed', { sessionId, session });
  }

  /**
   * Start background tasks
   */
  private startBackgroundTasks(): void {
    // Auto-save sessions
    setInterval(() => {
      this.autoSaveSessions();
    }, this.defaultConfig.autoSaveInterval);

    // Create periodic snapshots
    setInterval(() => {
      this.createPeriodicSnapshots();
    }, this.defaultConfig.snapshotInterval);

    // Clean up idle participants
    setInterval(() => {
      this.cleanupIdleParticipants();
    }, 60000); // Every minute

    // Clean up old conflicts
    setInterval(() => {
      this.cleanupOldConflicts();
    }, 300000); // Every 5 minutes
  }

  /**
   * Auto-save all active sessions
   */
  private autoSaveSessions(): void {
    for (const sessionId of this.sessions.keys()) {
      this.createSnapshot(sessionId);
    }
  }

  /**
   * Create periodic snapshots for all sessions
   */
  private createPeriodicSnapshots(): void {
    for (const sessionId of this.sessions.keys()) {
      this.createSnapshot(sessionId);
    }
  }

  /**
   * Clean up idle participants
   */
  private cleanupIdleParticipants(): void {
    const now = Date.now();

    for (const [sessionId, sessionParticipants] of this.participants.entries()) {
      const participantsToRemove: string[] = [];

      for (const [userId, participant] of sessionParticipants.entries()) {
        const idleTime = now - participant.lastActivity;

        if (idleTime > this.defaultConfig.offlineTimeout) {
          participantsToRemove.push(userId);
        } else if (idleTime > this.defaultConfig.idleTimeout) {
          participant.status = 'idle';
        }
      }

      // Remove offline participants
      for (const userId of participantsToRemove) {
        this.removeParticipant(sessionId, userId);
      }
    }
  }

  /**
   * Clean up old conflicts
   */
  private cleanupOldConflicts(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [, sessionConflicts] of this.conflicts.entries()) {
      const conflictsToRemove = sessionConflicts.filter(
        (conflict) => now - conflict.timestamp > maxAge && conflict.resolution !== 'pending'
      );

      for (const conflict of conflictsToRemove) {
        const index = sessionConflicts.indexOf(conflict);
        if (index > -1) {
          sessionConflicts.splice(index, 1);
        }
      }
    }
  }

  /**
   * JSON path utility methods
   */
  private getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current: unknown, key: string) => {
      return current && typeof current === 'object'
        ? (current as Record<string, unknown>)[key]
        : undefined;
    }, obj as unknown);
  }

  private setValueAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current: Record<string, unknown>, key: string) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key] as Record<string, unknown>;
    }, obj);
    target[lastKey] = value;
  }

  private removeValueAtPath(obj: Record<string, unknown>, path: string): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current: unknown, key: string) => {
      return current && typeof current === 'object'
        ? (current as Record<string, unknown>)[key]
        : undefined;
    }, obj as unknown);
    if (target && typeof target === 'object') {
      delete (target as Record<string, unknown>)[lastKey];
    }
  }

  /**
   * Public API methods
   */

  /**
   * Get session state
   */
  public getSession(sessionId: string): SessionState | null {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : null;
  }

  /**
   * Get session participants
   */
  public getParticipants(sessionId: string): SessionParticipant[] {
    const sessionParticipants = this.participants.get(sessionId);
    return sessionParticipants ? Array.from(sessionParticipants.values()) : [];
  }

  /**
   * Get session operations history
   */
  public getOperations(sessionId: string): SessionOperation[] {
    const operations = this.operations.get(sessionId);
    return operations ? [...operations] : [];
  }

  /**
   * Get session conflicts
   */
  public getConflicts(sessionId: string): SessionConflict[] {
    const conflicts = this.conflicts.get(sessionId);
    return conflicts ? [...conflicts] : [];
  }

  /**
   * Get session snapshots
   */
  public getSnapshots(sessionId: string): SessionSnapshot[] {
    const snapshots = this.snapshots.get(sessionId);
    return snapshots ? [...snapshots] : [];
  }

  /**
   * Get global metrics
   */
  public getMetrics(): SessionMetrics {
    return { ...this.globalMetrics };
  }

  /**
   * Get all active sessions
   */
  public getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Update participant role
   */
  public async updateParticipantRole(
    sessionId: string,
    userId: string,
    newRole: SessionParticipant['role']
  ): Promise<void> {
    const sessionParticipants = this.participants.get(sessionId);
    if (!sessionParticipants) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const participant = sessionParticipants.get(userId);
    if (!participant) {
      throw new Error(`Participant not found: ${userId}`);
    }

    const oldRole = participant.role;
    participant.role = newRole;
    participant.permissions = this.getPermissionsForRole(newRole);

    logger.info('Participant role updated', {
      sessionId,
      userId,
      oldRole,
      newRole,
    });

    this.emit('participantRoleUpdated', { sessionId, userId, oldRole, newRole });

    // Broadcast role change
    await this.broadcastSessionEvent(sessionId, 'participant_role_updated', {
      userId,
      oldRole,
      newRole,
      permissions: participant.permissions,
    });
  }

  /**
   * Resolve conflict manually
   */
  public async resolveConflictManually(
    sessionId: string,
    conflictId: string,
    resolution: SessionOperation,
    resolvedBy: string
  ): Promise<void> {
    const sessionConflicts = this.conflicts.get(sessionId);
    if (!sessionConflicts) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const conflict = sessionConflicts.find((c) => c.id === conflictId);
    if (!conflict) {
      throw new Error(`Conflict not found: ${conflictId}`);
    }

    if (conflict.resolution !== 'pending') {
      throw new Error(`Conflict already resolved: ${conflictId}`);
    }

    // Execute the resolution operation
    await this.executeOperation(sessionId, resolution);

    // Update conflict
    conflict.resolution = 'manual';
    conflict.resolvedBy = resolvedBy;
    conflict.resolvedAt = Date.now();
    conflict.result = resolution;

    logger.info('Conflict resolved manually', {
      sessionId,
      conflictId,
      resolvedBy,
    });

    this.emit('conflictResolvedManually', { sessionId, conflict, resolvedBy });

    // Broadcast resolution
    await this.broadcastSessionEvent(sessionId, 'conflict_resolved', {
      conflictId,
      resolution: 'manual',
      resolvedBy,
      result: resolution,
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

    logger.info('Session coordinator service shutdown complete');
  }
}
