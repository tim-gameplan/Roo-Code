/**
 * Conversation Service Tests
 *
 * Comprehensive test suite for conversation and message management functionality.
 * Tests conversation lifecycle, message operations, change tracking, and synchronization.
 *
 * @fileoverview Test suite for conversation service
 * @version 1.0.0
 * @created 2025-06-23
 */

import { Pool } from 'pg';
import { ConversationService } from '../services/conversation';
import {
  CreateConversationRequest,
  CreateMessageRequest,
  UpdateConversationRequest,
  UpdateMessageRequest,
  GetConversationsRequest,
  GetMessagesRequest,
  DeleteMessageRequest,
  MessageType,
} from '../types/conversation';

// Mock the logger
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ConversationService', () => {
  let conversationService: ConversationService;
  let mockPool: jest.Mocked<Pool>;
  let mockClient: any;

  beforeEach(() => {
    // Create mock client
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    // Create mock pool
    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      end: jest.fn(),
      query: jest.fn(),
    } as any;

    conversationService = new ConversationService(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createConversation', () => {
    const userId = 'user-123';
    const deviceId = 'device-456';
    const conversationId = 'conv-789';

    beforeEach(() => {
      // Mock UUID generation
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: conversationId }] }) // generateUUID
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          // INSERT conversation
          rows: [
            {
              id: conversationId,
              user_id: userId,
              title: 'Test Conversation',
              workspace_path: '/test/workspace',
              metadata: { created_by_device: deviceId },
              created_at: new Date(),
              updated_at: new Date(),
              last_activity: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // INSERT participant
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
    });

    it('should create a conversation successfully', async () => {
      const request: CreateConversationRequest = {
        title: 'Test Conversation',
        workspace_path: '/test/workspace',
        metadata: { priority: 'high' },
      };

      const result = await conversationService.createConversation(userId, request, deviceId);

      expect(result.success).toBe(true);
      expect(result.conversation.id).toBe(conversationId);
      expect(result.conversation.title).toBe('Test Conversation');
      expect(result.conversation.user_id).toBe(userId);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should handle database errors gracefully', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('Database error'));

      const request: CreateConversationRequest = {
        title: 'Test Conversation',
      };

      const result = await conversationService.createConversation(userId, request);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should create conversation without optional fields', async () => {
      const request: CreateConversationRequest = {};

      const result = await conversationService.createConversation(userId, request);

      expect(result.success).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO conversations'),
        expect.arrayContaining([conversationId, userId, null, null])
      );
    });
  });

  describe('updateConversation', () => {
    const userId = 'user-123';
    const conversationId = 'conv-789';

    beforeEach(() => {
      // Mock permission check
      mockClient.query.mockResolvedValueOnce({
        // checkConversationPermission
        rows: [{ permissions: { can_change_settings: true } }],
      });
    });

    it('should update conversation title successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ permissions: { can_change_settings: true } }] })
        .mockResolvedValueOnce({
          // UPDATE query
          rows: [
            {
              id: conversationId,
              user_id: userId,
              title: 'Updated Title',
              workspace_path: '/test/workspace',
              metadata: {},
              created_at: new Date(),
              updated_at: new Date(),
              last_activity: new Date(),
            },
          ],
        });

      const request: UpdateConversationRequest = {
        conversation_id: conversationId,
        title: 'Updated Title',
      };

      const result = await conversationService.updateConversation(userId, request);

      expect(result.success).toBe(true);
      expect(result.conversation.title).toBe('Updated Title');
    });

    it('should deny update without permission', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // No permissions

      const request: UpdateConversationRequest = {
        conversation_id: conversationId,
        title: 'Updated Title',
      };

      const result = await conversationService.updateConversation(userId, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    it('should merge metadata correctly', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ permissions: { can_change_settings: true } }] })
        .mockResolvedValueOnce({ rows: [{ metadata: { existing: 'value' } }] }) // Current metadata
        .mockResolvedValueOnce({
          // UPDATE query
          rows: [
            {
              id: conversationId,
              user_id: userId,
              title: 'Test',
              workspace_path: '/test',
              metadata: { existing: 'value', new: 'field' },
              created_at: new Date(),
              updated_at: new Date(),
              last_activity: new Date(),
            },
          ],
        });

      const request: UpdateConversationRequest = {
        conversation_id: conversationId,
        metadata: { priority: 'high' },
      };

      const result = await conversationService.updateConversation(userId, request);

      expect(result.success).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE conversations'),
        expect.arrayContaining([JSON.stringify({ existing: 'value', new: 'field' })])
      );
    });
  });

  describe('getConversations', () => {
    const userId = 'user-123';

    it('should retrieve conversations with pagination', async () => {
      const mockConversations = [
        {
          id: 'conv-1',
          user_id: userId,
          title: 'Conversation 1',
          workspace_path: '/workspace1',
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
          last_activity: new Date(),
          message_count: '5',
          last_message_at: new Date(),
          device_count: '2',
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: mockConversations }) // Main query
        .mockResolvedValueOnce({ rows: [{ total: '10' }] }); // Count query

      const request: GetConversationsRequest = {
        user_id: userId,
        limit: 20,
        offset: 0,
      };

      const result = await conversationService.getConversations(request);

      expect(result.success).toBe(true);
      expect(result.conversations).toHaveLength(1);
      expect(result.total_count).toBe(10);
      expect(result.has_more).toBe(false);
      expect(result.conversations[0]?.message_count).toBe(5);
    });

    it('should filter by workspace path', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const request: GetConversationsRequest = {
        user_id: userId,
        workspace_path: '/specific/workspace',
      };

      await conversationService.getConversations(request);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('c.workspace_path = $2'),
        expect.arrayContaining([userId, '/specific/workspace'])
      );
    });

    it('should exclude archived conversations by default', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const request: GetConversationsRequest = {
        user_id: userId,
      };

      await conversationService.getConversations(request);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("(c.metadata->>'archived')::boolean IS NOT TRUE"),
        expect.any(Array)
      );
    });

    it('should include archived conversations when requested', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const request: GetConversationsRequest = {
        user_id: userId,
        include_archived: true,
      };

      await conversationService.getConversations(request);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.not.stringContaining('archived'),
        expect.any(Array)
      );
    });
  });

  describe('createMessage', () => {
    const userId = 'user-123';
    const conversationId = 'conv-789';
    const messageId = 'msg-456';
    const deviceId = 'device-123';

    beforeEach(() => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: messageId }] }) // generateUUID
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ permissions: { can_write: true } }] }) // Permission check
        .mockResolvedValueOnce({
          // INSERT message
          rows: [
            {
              id: messageId,
              conversation_id: conversationId,
              user_id: userId,
              device_id: deviceId,
              message_type: 'user_message',
              content: { text: 'Hello world' },
              metadata: { source: 'api' },
              parent_message_id: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'change-123' }] }) // generateUUID for change
        .mockResolvedValueOnce({
          // INSERT message_change
          rows: [
            {
              id: 'change-123',
              message_id: messageId,
              change_type: 'create',
              change_data: {},
              device_id: deviceId,
              user_id: userId,
              timestamp: new Date(),
              sync_status: 'pending',
              conflict_id: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
    });

    it('should create a message successfully', async () => {
      const request: CreateMessageRequest = {
        conversation_id: conversationId,
        message_type: 'user_message' as MessageType,
        content: { text: 'Hello world' },
      };

      const result = await conversationService.createMessage(userId, request, deviceId);

      expect(result.success).toBe(true);
      expect(result.message.id).toBe(messageId);
      expect(result.message.content.text).toBe('Hello world');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should deny message creation without permission', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: messageId }] })
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // No permissions

      const request: CreateMessageRequest = {
        conversation_id: conversationId,
        message_type: 'user_message' as MessageType,
        content: { text: 'Hello world' },
      };

      const result = await conversationService.createMessage(userId, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should create threaded message with parent', async () => {
      const parentMessageId = 'parent-msg-123';

      const request: CreateMessageRequest = {
        conversation_id: conversationId,
        message_type: 'user_message' as MessageType,
        content: { text: 'Reply message' },
        parent_message_id: parentMessageId,
      };

      const result = await conversationService.createMessage(userId, request, deviceId);

      expect(result.success).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO messages'),
        expect.arrayContaining([
          messageId,
          conversationId,
          userId,
          deviceId,
          'user_message',
          JSON.stringify({ text: 'Reply message' }),
          expect.any(String),
          parentMessageId,
          expect.any(Date),
          expect.any(Date),
        ])
      );
    });
  });

  describe('updateMessage', () => {
    const userId = 'user-123';
    const messageId = 'msg-456';
    const conversationId = 'conv-789';

    beforeEach(() => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          // Get current message
          rows: [
            {
              id: messageId,
              conversation_id: conversationId,
              user_id: userId,
              device_id: 'device-123',
              message_type: 'user_message',
              content: { text: 'Original text' },
              metadata: { edited: false },
              parent_message_id: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ permissions: { can_edit_messages: true } }] }) // Permission check
        .mockResolvedValueOnce({
          // UPDATE message
          rows: [
            {
              id: messageId,
              conversation_id: conversationId,
              user_id: userId,
              device_id: 'device-123',
              message_type: 'user_message',
              content: { text: 'Updated text' },
              metadata: { edited: true },
              parent_message_id: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'change-456' }] }) // generateUUID for change
        .mockResolvedValueOnce({
          // INSERT message_change
          rows: [
            {
              id: 'change-456',
              message_id: messageId,
              change_type: 'update',
              change_data: {},
              device_id: 'device-123',
              user_id: userId,
              timestamp: new Date(),
              sync_status: 'pending',
              conflict_id: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
    });

    it('should update message content successfully', async () => {
      const request: UpdateMessageRequest = {
        message_id: messageId,
        content: { text: 'Updated text' },
        metadata: { edited: true },
      };

      const result = await conversationService.updateMessage(userId, request);

      expect(result.success).toBe(true);
      expect(result.message.content.text).toBe('Updated text');
      expect(result.message.metadata.edited).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should deny update without permission', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          // Get current message
          rows: [
            {
              id: messageId,
              conversation_id: conversationId,
              user_id: 'different-user',
              device_id: 'device-123',
              message_type: 'user_message',
              content: { text: 'Original text' },
              metadata: { edited: false },
              parent_message_id: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // No permissions

      const request: UpdateMessageRequest = {
        message_id: messageId,
        content: { text: 'Updated text' },
      };

      const result = await conversationService.updateMessage(userId, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('getMessages', () => {
    const conversationId = 'conv-789';

    it('should retrieve messages with pagination', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          conversation_id: conversationId,
          user_id: 'user-123',
          device_id: 'device-123',
          message_type: 'user_message',
          content: { text: 'Hello' },
          metadata: {},
          parent_message_id: null,
          created_at: new Date(),
          updated_at: new Date(),
          thread_level: 0,
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: mockMessages }) // Main query
        .mockResolvedValueOnce({ rows: [{ total: '5' }] }); // Count query

      const request: GetMessagesRequest = {
        conversation_id: conversationId,
        limit: 20,
        offset: 0,
      };

      const result = await conversationService.getMessages(request);

      expect(result.success).toBe(true);
      expect(result.messages).toHaveLength(1);
      expect(result.total_count).toBe(5);
      expect(result.has_more).toBe(false);
      expect(result.messages[0]?.content.text).toBe('Hello');
    });

    it('should filter by message types', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const request: GetMessagesRequest = {
        conversation_id: conversationId,
        message_types: ['user_message', 'assistant_message'],
      };

      await conversationService.getMessages(request);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('m.message_type = ANY($2)'),
        expect.arrayContaining([conversationId, ['user_message', 'assistant_message']])
      );
    });

    it('should include threaded messages when requested', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const request: GetMessagesRequest = {
        conversation_id: conversationId,
        include_threads: true,
      };

      await conversationService.getMessages(request);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('WITH RECURSIVE message_tree'),
        expect.any(Array)
      );
    });
  });

  describe('deleteMessage', () => {
    const userId = 'user-123';
    const messageId = 'msg-456';
    const conversationId = 'conv-789';

    beforeEach(() => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          // Get current message
          rows: [
            {
              id: messageId,
              conversation_id: conversationId,
              user_id: userId,
              device_id: 'device-123',
              message_type: 'user_message',
              content: { text: 'Message to delete' },
              metadata: {},
              parent_message_id: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ permissions: { can_delete_messages: true } }] }); // Permission check
    });

    it('should soft delete message successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // UPDATE message
        .mockResolvedValueOnce({ rows: [{ id: 'change-789' }] }) // generateUUID for change
        .mockResolvedValueOnce({
          // INSERT message_change
          rows: [
            {
              id: 'change-789',
              message_id: messageId,
              change_type: 'update',
              change_data: {},
              device_id: 'device-123',
              user_id: userId,
              timestamp: new Date(),
              sync_status: 'pending',
              conflict_id: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const request: DeleteMessageRequest = {
        message_id: messageId,
        soft_delete: true,
      };

      const result = await conversationService.deleteMessage(userId, request);

      expect(result.success).toBe(true);
      expect(result.change).toBeDefined();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE messages SET metadata'),
        expect.any(Array)
      );
    });

    it('should hard delete message successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // DELETE message
        .mockResolvedValueOnce({ rows: [{ id: 'change-789' }] }) // generateUUID for change
        .mockResolvedValueOnce({
          // INSERT message_change
          rows: [
            {
              id: 'change-789',
              message_id: messageId,
              change_type: 'delete',
              change_data: {},
              device_id: 'device-123',
              user_id: userId,
              timestamp: new Date(),
              sync_status: 'pending',
              conflict_id: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const request: DeleteMessageRequest = {
        message_id: messageId,
        soft_delete: false,
      };

      const result = await conversationService.deleteMessage(userId, request);

      expect(result.success).toBe(true);
      expect(result.change).toBeDefined();
      expect(mockClient.query).toHaveBeenCalledWith('DELETE FROM messages WHERE id = $1', [
        messageId,
      ]);
    });

    it('should deny deletion without permission', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          // Get current message
          rows: [
            {
              id: messageId,
              conversation_id: conversationId,
              user_id: 'different-user',
              device_id: 'device-123',
              message_type: 'user_message',
              content: { text: 'Message to delete' },
              metadata: {},
              parent_message_id: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // No permissions

      const request: DeleteMessageRequest = {
        message_id: messageId,
      };

      const result = await conversationService.deleteMessage(userId, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });
});
