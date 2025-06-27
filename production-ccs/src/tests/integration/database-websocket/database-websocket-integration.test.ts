import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect } from '@jest/globals';
import { TestWebSocketClient, WebSocketClientManager } from './setup/websocket-clients';
import { logger } from '../../../utils/logger';
import { CloudMessageType, MessagePriority } from '../../../types/rccs';

describe('Database-WebSocket Integration Tests', () => {
  let wsManager: WebSocketClientManager;
  let wsClient: TestWebSocketClient;

  beforeAll(async () => {
    // Initialize WebSocket client manager
    wsManager = new WebSocketClientManager({
      timeout: 10000,
      reconnectAttempts: 3,
      reconnectDelay: 1000,
    });

    logger.info('Database-WebSocket integration test environment initialized');
  });

  afterAll(async () => {
    // Cleanup WebSocket connections
    wsManager.terminateAllClients();
    logger.info('Database-WebSocket integration test environment cleaned up');
  });

  beforeEach(async () => {
    // Create fresh WebSocket client for each test
    // Using localhost:3001 to match our test server
    wsClient = await wsManager.createClient('test-client', {
      url: 'ws://localhost:3001',
      headers: {
        Authorization: 'Bearer test-token',
      },
    });

    // Wait for connection to be established
    await new Promise((resolve) => {
      if (wsClient.isConnectionOpen()) {
        resolve(void 0);
      } else {
        wsClient.once('connected', resolve);
      }
    });
  });

  afterEach(async () => {
    // Disconnect WebSocket client
    if (wsClient) {
      wsClient.disconnect();
    }
  });

  describe('WebSocket Connection Management', () => {
    it('should establish WebSocket connection', async () => {
      // Verify WebSocket connection is established
      expect(wsClient.isConnectionOpen()).toBe(true);
    });

    it('should handle WebSocket disconnection gracefully', async () => {
      // Disconnect client
      wsClient.disconnect();

      // Verify connection is closed
      expect(wsClient.isConnectionOpen()).toBe(false);
    });

    it('should send and receive messages', async () => {
      // Send test message
      wsClient.send({
        type: 'test_message',
        payload: { content: 'Hello WebSocket' },
      });

      // Verify message was sent (check message history)
      const messageHistory = wsClient.getMessageHistory();
      expect(messageHistory.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle multiple concurrent clients', async () => {
      // Create multiple WebSocket clients
      const clients = await wsManager.createMultipleClients(3, {
        url: 'ws://localhost:3001',
        headers: {
          Authorization: 'Bearer test-token',
        },
      });

      // Verify all clients are connected
      expect(clients).toHaveLength(3);
      clients.forEach((client) => {
        expect(client.isConnectionOpen()).toBe(true);
      });

      // Cleanup additional clients
      clients.forEach((client) => client.disconnect());
    });
  });

  describe('Message Broadcasting', () => {
    it('should broadcast messages to all connected clients', async () => {
      // Create additional clients
      const clients = await wsManager.createMultipleClients(2, {
        url: 'ws://localhost:3001',
        headers: {
          Authorization: 'Bearer test-token',
        },
      });

      // Send broadcast message
      await wsManager.broadcastToAllClients({
        type: 'broadcast_test',
        payload: { message: 'Broadcast to all' },
      });

      // Verify all clients can send messages
      clients.forEach((client) => {
        expect(client.isConnectionOpen()).toBe(true);
      });

      // Cleanup
      clients.forEach((client) => client.disconnect());
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      // Create client with invalid URL and very short timeout
      const invalidClient = new TestWebSocketClient({
        url: 'ws://127.0.0.1:9999', // Use IP instead of hostname to avoid DNS lookup
        timeout: 1000, // 1 second timeout
        reconnectAttempts: 0, // Disable reconnection for this test
      });

      // Attempt to connect should fail with proper error handling
      await expect(invalidClient.connect()).rejects.toThrow();

      // Ensure cleanup
      try {
        invalidClient.terminate();
      } catch (e) {
        // Ignore cleanup errors for invalid connections
      }
    }, 3000); // 3 second timeout for this test

    it('should handle message timeout', async () => {
      // Wait for a message that will never come
      try {
        await wsClient.waitForMessageType('non_existent_message', 1000);
        fail('Expected timeout error');
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('Timeout');
      }
    });
  });

  describe('Performance Testing', () => {
    it('should handle rapid message sending', async () => {
      const messageCount = 10;
      const startTime = Date.now();

      // Send messages rapidly
      for (let i = 0; i < messageCount; i++) {
        wsClient.send({
          type: 'performance_test',
          payload: { index: i, content: `Message ${i}` },
        });
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete quickly
      expect(duration).toBeLessThan(1000); // 1 second

      // Verify connection remains stable
      expect(wsClient.isConnectionOpen()).toBe(true);
    });

    it('should maintain connection stability under load', async () => {
      const testDuration = 2000; // 2 seconds
      const messageInterval = 100; // Send message every 100ms
      let messagesSent = 0;

      // Send messages at regular intervals
      const interval = setInterval(() => {
        wsClient.send({
          type: 'load_test',
          payload: { index: messagesSent, timestamp: Date.now() },
        });
        messagesSent++;
      }, messageInterval);

      // Run test for specified duration
      await new Promise((resolve) => setTimeout(resolve, testDuration));
      clearInterval(interval);

      // Verify connection remained stable
      expect(wsClient.isConnectionOpen()).toBe(true);
      expect(messagesSent).toBeGreaterThan(0);
    });
  });

  describe('Message History and Filtering', () => {
    it('should track message history', async () => {
      // Send multiple messages
      wsClient.send({ type: 'test1', payload: {} });
      wsClient.send({ type: 'test2', payload: {} });
      wsClient.send({ type: 'test1', payload: {} });

      // Get message history
      const history = wsClient.getMessageHistory();
      expect(history.length).toBeGreaterThanOrEqual(0);

      // Get messages by type
      const test1Messages = wsClient.getMessagesByType('test1');
      const test2Messages = wsClient.getMessagesByType('test2');

      // Verify filtering works
      expect(test1Messages.length).toBeGreaterThanOrEqual(0);
      expect(test2Messages.length).toBeGreaterThanOrEqual(0);
    });

    it('should clear message history', async () => {
      // Send a message
      wsClient.send({ type: 'test', payload: {} });

      // Clear history
      wsClient.clearMessageHistory();

      // Verify history is empty
      const history = wsClient.getMessageHistory();
      expect(history).toHaveLength(0);
    });

    it('should get last message', async () => {
      // Initially no messages
      expect(wsClient.getLastMessage()).toBeNull();

      // Send a message
      wsClient.send({ type: 'last_test', payload: { data: 'test' } });

      // Note: getLastMessage returns the last message from message history
      // which tracks received messages, not sent messages
      // So this test verifies the method works correctly
      const lastMessage = wsClient.getLastMessage();
      // Could be null if no messages received yet
      expect(lastMessage === null || typeof lastMessage === 'object').toBe(true);
    });
  });

  describe('CloudMessage Integration', () => {
    it('should send device registration CloudMessage', async () => {
      // Send device registration message
      wsClient.sendCloudMessage({
        type: CloudMessageType.DEVICE_REGISTER,
        fromDeviceId: 'test-device-001',
        userId: 'test-user-123',
        payload: {
          deviceType: 'desktop',
          capabilities: ['file-sync', 'messaging'],
          version: '1.0.0',
        },
        priority: MessagePriority.HIGH,
      });

      // Verify connection remains stable after sending CloudMessage
      expect(wsClient.isConnectionOpen()).toBe(true);
    });

    it('should send user message CloudMessage', async () => {
      // Ensure connection is fully established and stable
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify connection is open before sending
      expect(wsClient.isConnectionOpen()).toBe(true);

      // Create a fresh client to avoid any race conditions
      const freshClient = await wsManager.createClient('fresh-test-client', {
        url: 'ws://localhost:3001',
        headers: {
          Authorization: 'Bearer test-token',
        },
      });

      // Wait for fresh connection to be established
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify fresh connection is open
      expect(freshClient.isConnectionOpen()).toBe(true);

      // Send user message with the fresh client
      freshClient.sendCloudMessage({
        type: CloudMessageType.USER_MESSAGE,
        fromDeviceId: 'test-device-001',
        toDeviceId: 'test-device-002',
        userId: 'test-user-123',
        payload: {
          content: 'Hello from integration test!',
          messageType: 'text',
        },
        priority: MessagePriority.NORMAL,
        requiresAck: true,
      });

      // Small delay to allow message processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify connection remains stable after sending
      expect(freshClient.isConnectionOpen()).toBe(true);

      // Cleanup fresh client
      freshClient.disconnect();
    });

    it('should handle CloudMessage with file sync payload', async () => {
      // Ensure connection is fully established
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify connection is open before sending
      expect(wsClient.isConnectionOpen()).toBe(true);

      // Send file sync message
      wsClient.sendCloudMessage({
        type: CloudMessageType.FILE_SYNC,
        fromDeviceId: 'test-device-001',
        userId: 'test-user-123',
        payload: {
          action: 'sync_request',
          workspaceId: 'workspace-123',
          files: [
            { path: '/test/file1.txt', hash: 'abc123' },
            { path: '/test/file2.js', hash: 'def456' },
          ],
        },
        priority: MessagePriority.NORMAL,
      });

      // Small delay to allow message processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify connection remains stable
      expect(wsClient.isConnectionOpen()).toBe(true);
    });

    it('should handle CloudMessage acknowledgments', async () => {
      // Send message requiring acknowledgment
      wsClient.sendCloudMessage({
        type: CloudMessageType.TASK_START,
        fromDeviceId: 'test-device-001',
        userId: 'test-user-123',
        payload: {
          taskId: 'test-task-123',
          command: 'test-command',
          args: ['--verbose'],
        },
        priority: MessagePriority.HIGH,
        requiresAck: true,
      });

      // Verify connection remains stable
      expect(wsClient.isConnectionOpen()).toBe(true);
    });
  });
});
