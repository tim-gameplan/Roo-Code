/**
 * Real-Time Communication Test Suite
 *
 * Comprehensive tests for TASK-005.1.3 implementation including:
 * - Typing Indicators Service
 * - Session Coordinator Service
 * - Integration scenarios
 */

import { TypingIndicatorsService, TypingEvent } from '../services/typing-indicators';
import {
  SessionCoordinatorService,
  SessionOperation,
  SessionState,
} from '../services/session-coordinator';

describe('Real-Time Communication Services', () => {
  let typingService: TypingIndicatorsService;
  let sessionService: SessionCoordinatorService;

  beforeEach(() => {
    typingService = new TypingIndicatorsService();
    sessionService = new SessionCoordinatorService();
  });

  afterEach(() => {
    typingService.shutdown();
    sessionService.shutdown();
  });

  describe('TypingIndicatorsService', () => {
    const sessionId = 'test-session-1';
    const userId1 = 'user-1';
    const userId2 = 'user-2';
    const deviceId1 = 'device-1';
    const deviceId2 = 'device-2';

    beforeEach(() => {
      typingService.createSession(sessionId);
      typingService.joinSession(sessionId, userId1, deviceId1);
      typingService.joinSession(sessionId, userId2, deviceId2);
    });

    test('should create typing session successfully', () => {
      const newSessionId = 'new-session';
      typingService.createSession(newSessionId);

      const metrics = typingService.getMetrics();
      expect(metrics.activeTypingSessions).toBeGreaterThan(0);
    });

    test('should handle typing start event', async () => {
      const typingEvent: TypingEvent = {
        userId: userId1,
        deviceId: deviceId1,
        sessionId,
        isTyping: true,
        timestamp: Date.now(),
        cursorPosition: 10,
        selectionRange: { start: 5, end: 15 },
      };

      let eventEmitted = false;
      typingService.on('typingStarted', () => {
        eventEmitted = true;
      });

      await typingService.processTypingEvent(typingEvent);

      expect(eventEmitted).toBe(true);

      const activeTypers = typingService.getActiveTypers(sessionId);
      expect(activeTypers).toHaveLength(1);
      expect(activeTypers[0]?.userId).toBe(userId1);
      expect(activeTypers[0]?.isTyping).toBe(true);
    });

    test('should handle typing stop event with debouncing', async () => {
      // Start typing
      const startEvent: TypingEvent = {
        userId: userId1,
        deviceId: deviceId1,
        sessionId,
        isTyping: true,
        timestamp: Date.now(),
      };
      await typingService.processTypingEvent(startEvent);

      // Stop typing
      const stopEvent: TypingEvent = {
        userId: userId1,
        deviceId: deviceId1,
        sessionId,
        isTyping: false,
        timestamp: Date.now(),
      };

      let stopEventEmitted = false;
      typingService.on('typingStopped', () => {
        stopEventEmitted = true;
      });

      await typingService.processTypingEvent(stopEvent);

      // Should be debounced, so not immediately stopped
      const activeTypers = typingService.getActiveTypers(sessionId);
      expect(activeTypers).toHaveLength(1);

      // Wait for debounce period
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(stopEventEmitted).toBe(true);
    });

    test('should resolve typing conflicts with latest-wins strategy', async () => {
      // User 1 starts typing
      const event1: TypingEvent = {
        userId: userId1,
        deviceId: deviceId1,
        sessionId,
        isTyping: true,
        timestamp: Date.now(),
      };
      await typingService.processTypingEvent(event1);

      // User 2 starts typing (should resolve conflict)
      const event2: TypingEvent = {
        userId: userId1, // Same user, different device
        deviceId: deviceId2,
        sessionId,
        isTyping: true,
        timestamp: Date.now() + 100,
      };
      await typingService.processTypingEvent(event2);

      const activeTypers = typingService.getActiveTypers(sessionId);
      expect(activeTypers).toHaveLength(1);
      expect(activeTypers[0]?.deviceId).toBe(deviceId2); // Latest device wins
    });

    test('should track session metrics correctly', async () => {
      const event: TypingEvent = {
        userId: userId1,
        deviceId: deviceId1,
        sessionId,
        isTyping: true,
        timestamp: Date.now(),
      };

      await typingService.processTypingEvent(event);

      const metrics = typingService.getMetrics();
      expect(metrics.totalEvents).toBeGreaterThan(0);
      expect(metrics.averageLatency).toBeGreaterThan(0);
      expect(metrics.activeTypingSessions).toBeGreaterThan(0);
    });

    test('should handle session cleanup', () => {
      typingService.leaveSession(sessionId, userId1, deviceId1);
      typingService.leaveSession(sessionId, userId2, deviceId2);

      const metrics = typingService.getMetrics();
      expect(metrics.activeTypingSessions).toBe(0);
    });
  });

  describe('SessionCoordinatorService', () => {
    const sessionId = 'collab-session-1';
    const ownerId = 'owner-1';
    const userId = 'user-1';
    const deviceId = 'device-1';

    test('should create collaborative session successfully', async () => {
      const session = await sessionService.createSession(
        sessionId,
        ownerId,
        { content: 'Initial content' },
        { title: 'Test Session', isPrivate: false }
      );

      expect(session.sessionId).toBe(sessionId);
      expect(session.ownerId).toBe(ownerId);
      expect(session.version).toBe(1);
      expect(session.data['content']).toBe('Initial content');
      expect(session.metadata.title).toBe('Test Session');
    });

    test('should add and remove participants', async () => {
      await sessionService.createSession(sessionId, ownerId);
      await sessionService.addParticipant(sessionId, userId, deviceId, 'member');

      const participants = sessionService.getParticipants(sessionId);
      expect(participants).toHaveLength(2); // Owner + new participant

      const newParticipant = participants.find((p) => p.userId === userId);
      expect(newParticipant).toBeDefined();
      expect(newParticipant!.role).toBe('member');
      expect(newParticipant!.permissions.canRead).toBe(true);
      expect(newParticipant!.permissions.canWrite).toBe(true);
      expect(newParticipant!.permissions.canInvite).toBe(false);

      await sessionService.removeParticipant(sessionId, userId);
      const updatedParticipants = sessionService.getParticipants(sessionId);
      expect(updatedParticipants).toHaveLength(1); // Only owner remains
    });

    test('should apply operations and update session state', async () => {
      await sessionService.createSession(sessionId, ownerId, { text: 'Hello' });
      await sessionService.addParticipant(sessionId, userId, deviceId, 'member');

      const operation: SessionOperation = {
        id: 'op-1',
        sessionId,
        userId,
        deviceId,
        timestamp: Date.now(),
        type: 'update',
        path: 'text',
        operation: {
          op: 'replace',
          path: 'text',
          value: 'Hello World',
        },
      };

      await sessionService.applyOperation(operation);

      const session = sessionService.getSession(sessionId);
      expect(session!.data['text']).toBe('Hello World');
      expect(session!.version).toBe(2);

      const operations = sessionService.getOperations(sessionId);
      expect(operations).toHaveLength(1);
      expect(operations[0]?.id).toBe('op-1');
    });

    test('should detect and resolve conflicts automatically', async () => {
      await sessionService.createSession(sessionId, ownerId, { counter: 0 });
      await sessionService.addParticipant(sessionId, userId, deviceId, 'member');
      await sessionService.addParticipant(sessionId, 'user-2', 'device-2', 'member');

      // Create conflicting operations
      const op1: SessionOperation = {
        id: 'op-1',
        sessionId,
        userId,
        deviceId,
        timestamp: Date.now(),
        type: 'update',
        path: 'counter',
        operation: {
          op: 'replace',
          path: 'counter',
          value: 1,
        },
      };

      const op2: SessionOperation = {
        id: 'op-2',
        sessionId,
        userId: 'user-2',
        deviceId: 'device-2',
        timestamp: Date.now() + 100, // Slightly later
        type: 'update',
        path: 'counter',
        operation: {
          op: 'replace',
          path: 'counter',
          value: 2,
        },
      };

      await sessionService.applyOperation(op1);
      await sessionService.applyOperation(op2); // Should trigger conflict resolution

      const session = sessionService.getSession(sessionId);
      expect(session!.data['counter']).toBe(2); // Latest operation wins

      const conflicts = sessionService.getConflicts(sessionId);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]?.resolution).toBe('automatic');
    });

    test('should create and manage snapshots', async () => {
      await sessionService.createSession(sessionId, ownerId, { data: 'test' });

      // Wait a bit to ensure snapshot creation
      await new Promise((resolve) => setTimeout(resolve, 100));

      const snapshots = sessionService.getSnapshots(sessionId);
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]?.state.data['data']).toBe('test');
      expect(snapshots[0]?.checksum).toBeDefined();
    });

    test('should update participant roles and permissions', async () => {
      await sessionService.createSession(sessionId, ownerId);
      await sessionService.addParticipant(sessionId, userId, deviceId, 'member');

      await sessionService.updateParticipantRole(sessionId, userId, 'admin');

      const participants = sessionService.getParticipants(sessionId);
      const updatedParticipant = participants.find((p) => p.userId === userId);
      expect(updatedParticipant!.role).toBe('admin');
      expect(updatedParticipant!.permissions.canInvite).toBe(true);
      expect(updatedParticipant!.permissions.canKick).toBe(true);
    });

    test('should track session metrics', async () => {
      await sessionService.createSession(sessionId, ownerId);
      await sessionService.addParticipant(sessionId, userId, deviceId, 'member');

      const metrics = sessionService.getMetrics();
      expect(metrics.totalSessions).toBeGreaterThan(0);
      expect(metrics.activeSessions).toBeGreaterThan(0);
      expect(metrics.totalParticipants).toBeGreaterThan(0);
    });
  });

  describe('Integration Scenarios', () => {
    test('should coordinate typing indicators with session operations', async () => {
      const sessionId = 'integration-session';
      const userId = 'user-1';
      const deviceId = 'device-1';

      // Create session in both services
      await sessionService.createSession(sessionId, userId, { content: '' });
      typingService.createSession(sessionId);
      typingService.joinSession(sessionId, userId, deviceId);

      // Start typing
      const typingEvent: TypingEvent = {
        userId,
        deviceId,
        sessionId,
        isTyping: true,
        timestamp: Date.now(),
        cursorPosition: 0,
      };

      let typingStarted = false;
      typingService.on('typingStarted', () => {
        typingStarted = true;
      });

      await typingService.processTypingEvent(typingEvent);
      expect(typingStarted).toBe(true);

      // Apply operation (simulating user finished typing)
      const operation: SessionOperation = {
        id: 'op-1',
        sessionId,
        userId,
        deviceId,
        timestamp: Date.now(),
        type: 'update',
        path: 'content',
        operation: {
          op: 'replace',
          path: 'content',
          value: 'Hello World',
        },
      };

      await sessionService.applyOperation(operation);

      // Stop typing
      const stopTypingEvent: TypingEvent = {
        userId,
        deviceId,
        sessionId,
        isTyping: false,
        timestamp: Date.now(),
      };

      await typingService.processTypingEvent(stopTypingEvent);

      // Verify final state
      const session = sessionService.getSession(sessionId);
      expect(session!.data['content']).toBe('Hello World');

      const activeTypers = typingService.getActiveTypers(sessionId);
      expect(activeTypers).toHaveLength(1); // Still typing due to debounce
    });

    test('should handle multi-user collaborative editing scenario', async () => {
      const sessionId = 'multi-user-session';
      const user1 = 'user-1';
      const user2 = 'user-2';
      const device1 = 'device-1';
      const device2 = 'device-2';

      // Setup session
      await sessionService.createSession(sessionId, user1, { document: '' });
      await sessionService.addParticipant(sessionId, user2, device2, 'member');

      // Setup typing indicators
      typingService.createSession(sessionId);
      typingService.joinSession(sessionId, user1, device1);
      typingService.joinSession(sessionId, user2, device2);

      // User 1 starts typing
      await typingService.processTypingEvent({
        userId: user1,
        deviceId: device1,
        sessionId,
        isTyping: true,
        timestamp: Date.now(),
        cursorPosition: 0,
      });

      // User 2 also starts typing
      await typingService.processTypingEvent({
        userId: user2,
        deviceId: device2,
        sessionId,
        isTyping: true,
        timestamp: Date.now(),
        cursorPosition: 10,
      });

      // Both users should be typing
      const activeTypers = typingService.getActiveTypers(sessionId);
      expect(activeTypers).toHaveLength(2);

      // User 1 makes an edit
      await sessionService.applyOperation({
        id: 'op-1',
        sessionId,
        userId: user1,
        deviceId: device1,
        timestamp: Date.now(),
        type: 'update',
        path: 'document',
        operation: {
          op: 'replace',
          path: 'document',
          value: 'User 1 content',
        },
      });

      // User 2 makes a conflicting edit
      await sessionService.applyOperation({
        id: 'op-2',
        sessionId,
        userId: user2,
        deviceId: device2,
        timestamp: Date.now() + 50,
        type: 'update',
        path: 'document',
        operation: {
          op: 'replace',
          path: 'document',
          value: 'User 2 content',
        },
      });

      // Verify conflict resolution
      const session = sessionService.getSession(sessionId);
      expect(session!.data['document']).toBe('User 2 content'); // Latest wins

      // Both users stop typing after operations
      await typingService.processTypingEvent({
        userId: user1,
        deviceId: device1,
        sessionId,
        isTyping: false,
        timestamp: Date.now(),
      });

      await typingService.processTypingEvent({
        userId: user2,
        deviceId: device2,
        sessionId,
        isTyping: false,
        timestamp: Date.now(),
      });

      // Verify final state
      const operations = sessionService.getOperations(sessionId);
      expect(operations).toHaveLength(2);

      const conflicts = sessionService.getConflicts(sessionId);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]?.resolution).toBe('automatic');
    });

    test('should handle real-time presence with typing indicators', async () => {
      const sessionId = 'presence-session';
      const users = ['user-1', 'user-2', 'user-3'];
      const devices = ['device-1', 'device-2', 'device-3'];

      // Setup session
      await sessionService.createSession(sessionId, users[0]!, { content: 'Shared document' });
      for (let i = 1; i < users.length; i++) {
        await sessionService.addParticipant(sessionId, users[i]!, devices[i]!, 'member');
      }

      // Setup typing indicators
      typingService.createSession(sessionId);
      for (let i = 0; i < users.length; i++) {
        typingService.joinSession(sessionId, users[i]!, devices[i]!);
      }

      // Simulate multiple users typing at different times
      const typingEvents: Promise<void>[] = [];
      for (let i = 0; i < users.length; i++) {
        const event = typingService.processTypingEvent({
          userId: users[i]!,
          deviceId: devices[i]!,
          sessionId,
          isTyping: true,
          timestamp: Date.now() + i * 100,
          cursorPosition: i * 10,
        });
        typingEvents.push(event);
      }

      await Promise.all(typingEvents);

      // All users should be typing
      const activeTypers = typingService.getActiveTypers(sessionId);
      expect(activeTypers).toHaveLength(3);

      // Verify each user's typing state
      for (let i = 0; i < users.length; i++) {
        const typer = activeTypers.find((t) => t.userId === users[i]);
        expect(typer).toBeDefined();
        expect(typer!.isTyping).toBe(true);
        expect(typer!.cursorPosition).toBe(i * 10);
      }

      // Users stop typing one by one
      for (let i = 0; i < users.length; i++) {
        await typingService.processTypingEvent({
          userId: users[i]!,
          deviceId: devices[i]!,
          sessionId,
          isTyping: false,
          timestamp: Date.now() + 1000 + i * 100,
        });
      }

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // No users should be typing
      const finalActiveTypers = typingService.getActiveTypers(sessionId);
      expect(finalActiveTypers.filter((t) => t.isTyping)).toHaveLength(0);
    });

    test('should handle session persistence and recovery', async () => {
      const sessionId = 'persistence-session';
      const userId = 'user-1';
      const deviceId = 'device-1';

      // Create session and make some changes
      await sessionService.createSession(sessionId, userId, { data: 'initial' });

      await sessionService.applyOperation({
        id: 'op-1',
        sessionId,
        userId,
        deviceId,
        timestamp: Date.now(),
        type: 'update',
        path: 'data',
        operation: {
          op: 'replace',
          path: 'data',
          value: 'updated',
        },
      });

      // Get snapshots
      const snapshots = sessionService.getSnapshots(sessionId);
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]!.state.data['data']).toBe('updated');

      // Verify operations history
      const operations = sessionService.getOperations(sessionId);
      expect(operations).toHaveLength(1);
      expect(operations[0]?.operation.value).toBe('updated');

      // Verify session metrics
      const metrics = sessionService.getMetrics();
      expect(metrics.operationsProcessed).toBeGreaterThan(0);
      expect(metrics.snapshotsSaved).toBeGreaterThan(0);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle high-frequency typing events efficiently', async () => {
      const sessionId = 'performance-session';
      const userId = 'user-1';
      const deviceId = 'device-1';

      typingService.createSession(sessionId);
      typingService.joinSession(sessionId, userId, deviceId);

      const startTime = Date.now();
      const eventCount = 100;

      // Send many typing events rapidly
      const events: Promise<void>[] = [];
      for (let i = 0; i < eventCount; i++) {
        events.push(
          typingService.processTypingEvent({
            userId,
            deviceId,
            sessionId,
            isTyping: i % 2 === 0, // Alternate between typing and not typing
            timestamp: Date.now() + i,
            cursorPosition: i,
          })
        );
      }

      await Promise.all(events);

      const processingTime = Date.now() - startTime;
      expect(processingTime).toBeLessThan(1000); // Should process 100 events in under 1 second

      const metrics = typingService.getMetrics();
      expect(metrics.totalEvents).toBeGreaterThanOrEqual(eventCount);
      expect(metrics.averageLatency).toBeLessThan(50); // Average latency under 50ms
    });

    test('should handle multiple concurrent sessions', async () => {
      const sessionCount = 10;
      const usersPerSession = 5;

      const sessions: Promise<SessionState>[] = [];
      for (let i = 0; i < sessionCount; i++) {
        const sessionId = `session-${i}`;
        const ownerId = `owner-${i}`;

        sessions.push(sessionService.createSession(sessionId, ownerId, { data: `Session ${i}` }));
        typingService.createSession(sessionId);
      }

      await Promise.all(sessions);

      // Add participants to each session
      const participantPromises: Promise<void>[] = [];
      for (let i = 0; i < sessionCount; i++) {
        const sessionId = `session-${i}`;

        for (let j = 1; j < usersPerSession; j++) {
          const userId = `user-${i}-${j}`;
          const deviceId = `device-${i}-${j}`;

          participantPromises.push(
            sessionService.addParticipant(sessionId, userId, deviceId, 'member')
          );
          typingService.joinSession(sessionId, userId, deviceId);
        }
      }

      await Promise.all(participantPromises);

      // Verify all sessions are active
      const activeSessions = sessionService.getActiveSessions();
      expect(activeSessions).toHaveLength(sessionCount);

      const metrics = sessionService.getMetrics();
      expect(metrics.activeSessions).toBe(sessionCount);
      expect(metrics.totalParticipants).toBe(sessionCount * usersPerSession);

      const typingMetrics = typingService.getMetrics();
      expect(typingMetrics.activeTypingSessions).toBe(sessionCount);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle invalid session operations gracefully', async () => {
      const sessionId = 'error-session';
      const userId = 'user-1';
      const deviceId = 'device-1';

      await sessionService.createSession(sessionId, userId);

      // Try to apply operation with invalid path
      const invalidOperation: SessionOperation = {
        id: 'invalid-op',
        sessionId,
        userId,
        deviceId,
        timestamp: Date.now(),
        type: 'update',
        path: 'invalid.path.that.does.not.exist',
        operation: {
          op: 'replace',
          path: 'invalid.path.that.does.not.exist',
          value: 'test',
        },
      };

      await expect(sessionService.applyOperation(invalidOperation)).rejects.toThrow();

      // Session should still be valid
      const session = sessionService.getSession(sessionId);
      expect(session).toBeDefined();
    });

    test('should handle typing events for non-existent sessions', async () => {
      const invalidEvent: TypingEvent = {
        userId: 'user-1',
        deviceId: 'device-1',
        sessionId: 'non-existent-session',
        isTyping: true,
        timestamp: Date.now(),
      };

      // Should not throw error, but should handle gracefully
      await expect(typingService.processTypingEvent(invalidEvent)).resolves.not.toThrow();

      const metrics = typingService.getMetrics();
      expect(metrics.totalEvents).toBe(1); // Event should still be counted
    });

    test('should handle participant permission violations', async () => {
      const sessionId = 'permission-session';
      const ownerId = 'owner';
      const viewerId = 'viewer';
      const deviceId = 'device-1';

      await sessionService.createSession(sessionId, ownerId);
      await sessionService.addParticipant(sessionId, viewerId, deviceId, 'viewer');

      // Viewer should not be able to write
      const operation: SessionOperation = {
        id: 'unauthorized-op',
        sessionId,
        userId: viewerId,
        deviceId,
        timestamp: Date.now(),
        type: 'update',
        path: 'data',
        operation: {
          op: 'replace',
          path: 'data',
          value: 'unauthorized change',
        },
      };

      await expect(sessionService.applyOperation(operation)).rejects.toThrow(
        'Insufficient permissions'
      );
    });
  });
});
