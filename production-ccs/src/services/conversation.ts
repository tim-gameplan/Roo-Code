/**
 * Conversation Service
 *
 * Comprehensive service for managing conversations, messages, and cross-device synchronization.
 * Handles conversation lifecycle, message storage, change tracking, and conflict resolution.
 *
 * @fileoverview Core conversation management service
 * @version 1.0.0
 * @created 2025-06-23
 */

import { Pool, PoolClient } from 'pg';
import {
  Conversation,
  ConversationSummary,
  Message,
  MessageWithThread,
  MessageChange,
  ChangeData,
  CreateConversationRequest,
  CreateConversationResponse,
  UpdateConversationRequest,
  UpdateConversationResponse,
  GetConversationsRequest,
  GetConversationsResponse,
  CreateMessageRequest,
  CreateMessageResponse,
  UpdateMessageRequest,
  UpdateMessageResponse,
  GetMessagesRequest,
  GetMessagesResponse,
  DeleteMessageRequest,
  DeleteMessageResponse,
  ChangeType,
} from '../types/conversation';
import { logger } from '../utils/logger';

export class ConversationService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  // =====================================================
  // CONVERSATION MANAGEMENT
  // =====================================================

  async createConversation(
    userId: string,
    request: CreateConversationRequest,
    deviceId?: string
  ): Promise<CreateConversationResponse> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const conversationId = await this.generateUUID(client);
      const now = new Date();

      const metadata = {
        ...request.metadata,
        created_by_device: deviceId,
      };

      // Insert conversation
      const conversationResult = await client.query(
        `
        INSERT INTO conversations (id, user_id, title, workspace_path, metadata, created_at, updated_at, last_activity)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `,
        [
          conversationId,
          userId,
          request.title || null,
          request.workspace_path || null,
          JSON.stringify(metadata),
          now,
          now,
          now,
        ]
      );

      // Add user as owner participant
      await client.query(
        `
        INSERT INTO conversation_participants (conversation_id, user_id, role, permissions, joined_at)
        VALUES ($1, $2, 'owner', $3, $4)
      `,
        [
          conversationId,
          userId,
          JSON.stringify({
            can_read: true,
            can_write: true,
            can_edit_messages: true,
            can_delete_messages: true,
            can_manage_participants: true,
            can_change_settings: true,
          }),
          now,
        ]
      );

      await client.query('COMMIT');

      const conversation = this.mapRowToConversation(conversationResult.rows[0]);

      logger.info('Conversation created successfully', {
        conversationId,
        userId,
        deviceId,
        title: request.title,
      });

      return {
        conversation,
        success: true,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create conversation', { error, userId, request });

      return {
        conversation: {} as Conversation,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      client.release();
    }
  }

  async updateConversation(
    userId: string,
    request: UpdateConversationRequest,
    deviceId?: string
  ): Promise<UpdateConversationResponse> {
    const client = await this.pool.connect();

    try {
      // Check permissions
      const hasPermission = await this.checkConversationPermission(
        client,
        request.conversation_id,
        userId,
        'can_change_settings'
      );

      if (!hasPermission) {
        throw new ConversationError('Permission denied', {
          code: 'PERMISSION_DENIED',
          conversation_id: request.conversation_id,
          user_id: userId,
        });
      }

      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      if (request.title !== undefined) {
        updateFields.push(`title = $${paramIndex++}`);
        updateValues.push(request.title);
      }

      if (request.workspace_path !== undefined) {
        updateFields.push(`workspace_path = $${paramIndex++}`);
        updateValues.push(request.workspace_path);
      }

      if (request.metadata !== undefined) {
        // Get current metadata and merge
        const currentResult = await client.query(
          'SELECT metadata FROM conversations WHERE id = $1',
          [request.conversation_id]
        );

        const currentMetadata = currentResult.rows[0]?.metadata || {};
        const mergedMetadata = { ...currentMetadata, ...request.metadata };

        updateFields.push(`metadata = $${paramIndex++}`);
        updateValues.push(JSON.stringify(mergedMetadata));
      }

      if (updateFields.length === 0) {
        throw new ConversationError('No fields to update', {
          code: 'INVALID_CONVERSATION_DATA',
        });
      }

      updateFields.push(`updated_at = $${paramIndex++}`);
      updateValues.push(new Date());

      updateValues.push(request.conversation_id);

      const result = await client.query(
        `
        UPDATE conversations 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `,
        updateValues
      );

      if (result.rows.length === 0) {
        throw new ConversationError('Conversation not found', {
          code: 'CONVERSATION_NOT_FOUND',
          conversation_id: request.conversation_id,
        });
      }

      const conversation = this.mapRowToConversation(result.rows[0]);

      logger.info('Conversation updated successfully', {
        conversationId: request.conversation_id,
        userId,
        deviceId,
        updatedFields: updateFields,
      });

      return {
        conversation,
        success: true,
      };
    } catch (error) {
      logger.error('Failed to update conversation', { error, userId, request });

      return {
        conversation: {} as Conversation,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      client.release();
    }
  }

  async getConversations(request: GetConversationsRequest): Promise<GetConversationsResponse> {
    const client = await this.pool.connect();

    try {
      const limit = Math.min(request.limit || 50, 100);
      const offset = request.offset || 0;

      let whereConditions = ['c.user_id = $1'];
      let queryParams: any[] = [request.user_id];
      let paramIndex = 2;

      if (request.workspace_path) {
        whereConditions.push(`c.workspace_path = $${paramIndex++}`);
        queryParams.push(request.workspace_path);
      }

      if (!request.include_archived) {
        whereConditions.push(`(c.metadata->>'archived')::boolean IS NOT TRUE`);
      }

      if (request.search_query) {
        whereConditions.push(`(
          c.title ILIKE $${paramIndex} OR 
          c.workspace_path ILIKE $${paramIndex} OR
          c.metadata::text ILIKE $${paramIndex}
        )`);
        queryParams.push(`%${request.search_query}%`);
        paramIndex++;
      }

      const sortBy = request.sort_by || 'last_activity';
      const sortOrder = request.sort_order || 'desc';

      const query = `
        SELECT 
          c.id,
          c.user_id,
          c.title,
          c.workspace_path,
          c.metadata,
          c.created_at,
          c.updated_at,
          c.last_activity,
          COUNT(m.id) as message_count,
          MAX(m.created_at) as last_message_at,
          COUNT(DISTINCT m.device_id) as device_count
        FROM conversations c
        LEFT JOIN messages m ON c.id = m.conversation_id
        WHERE ${whereConditions.join(' AND ')}
        GROUP BY c.id, c.user_id, c.title, c.workspace_path, c.metadata, c.created_at, c.updated_at, c.last_activity
        ORDER BY c.${sortBy} ${sortOrder.toUpperCase()}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(limit, offset);

      const result = await client.query(query, queryParams);

      // Get total count
      const countQuery = `
        SELECT COUNT(DISTINCT c.id) as total
        FROM conversations c
        WHERE ${whereConditions.slice(0, -2).join(' AND ')}
      `;

      const countResult = await client.query(countQuery, queryParams.slice(0, -2));
      const totalCount = parseInt(countResult.rows[0].total);

      const conversations: ConversationSummary[] = result.rows.map((row) => {
        const summary: ConversationSummary = {
          id: row.id,
          user_id: row.user_id,
          title: row.title,
          workspace_path: row.workspace_path,
          metadata: row.metadata,
          created_at: new Date(row.created_at),
          updated_at: new Date(row.updated_at),
          last_activity: new Date(row.last_activity),
          message_count: parseInt(row.message_count),
          device_count: parseInt(row.device_count),
        };

        if (row.last_message_at) {
          summary.last_message_at = new Date(row.last_message_at);
        }

        return summary;
      });

      return {
        conversations,
        total_count: totalCount,
        has_more: offset + limit < totalCount,
        success: true,
      };
    } catch (error) {
      logger.error('Failed to get conversations', { error, request });

      return {
        conversations: [],
        total_count: 0,
        has_more: false,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      client.release();
    }
  }

  // =====================================================
  // MESSAGE MANAGEMENT
  // =====================================================

  async createMessage(
    userId: string,
    request: CreateMessageRequest,
    deviceId?: string
  ): Promise<CreateMessageResponse> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Check conversation permissions
      const hasPermission = await this.checkConversationPermission(
        client,
        request.conversation_id,
        userId,
        'can_write'
      );

      if (!hasPermission) {
        throw new MessageError('Permission denied', {
          code: 'INVALID_MESSAGE_DATA',
          conversation_id: request.conversation_id,
        });
      }

      const messageId = await this.generateUUID(client);
      const now = new Date();

      const metadata = {
        ...request.metadata,
        source: deviceId ? 'api' : 'web',
        created_by_device: deviceId,
      };

      // Insert message
      const messageResult = await client.query(
        `
        INSERT INTO messages (
          id, conversation_id, user_id, device_id, message_type, 
          content, metadata, parent_message_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `,
        [
          messageId,
          request.conversation_id,
          userId,
          deviceId || null,
          request.message_type,
          JSON.stringify(request.content),
          JSON.stringify(metadata),
          request.parent_message_id || null,
          now,
          now,
        ]
      );

      // Create change tracking record
      await this.createMessageChange(
        client,
        messageId,
        'create',
        { full_message: this.mapRowToMessage(messageResult.rows[0]) },
        userId,
        deviceId
      );

      await client.query('COMMIT');

      const message = this.mapRowToMessage(messageResult.rows[0]);

      logger.info('Message created successfully', {
        messageId,
        conversationId: request.conversation_id,
        userId,
        deviceId,
        messageType: request.message_type,
      });

      return {
        message,
        success: true,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create message', { error, userId, request });

      return {
        message: {} as Message,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      client.release();
    }
  }

  async updateMessage(
    userId: string,
    request: UpdateMessageRequest,
    deviceId?: string
  ): Promise<UpdateMessageResponse> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get current message
      const currentResult = await client.query('SELECT * FROM messages WHERE id = $1', [
        request.message_id,
      ]);

      if (currentResult.rows.length === 0) {
        throw new MessageError('Message not found', {
          code: 'MESSAGE_NOT_FOUND',
          message_id: request.message_id,
        });
      }

      const currentMessage = this.mapRowToMessage(currentResult.rows[0]);

      // Check permissions
      const hasPermission = await this.checkConversationPermission(
        client,
        currentMessage.conversation_id,
        userId,
        'can_edit_messages'
      );

      if (!hasPermission && currentMessage.user_id !== userId) {
        throw new MessageError('Permission denied', {
          code: 'INVALID_MESSAGE_DATA',
          message_id: request.message_id,
        });
      }

      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      if (request.content) {
        const mergedContent = { ...currentMessage.content, ...request.content };
        updateFields.push(`content = $${paramIndex++}`);
        updateValues.push(JSON.stringify(mergedContent));
      }

      if (request.metadata) {
        const mergedMetadata = { ...currentMessage.metadata, ...request.metadata };
        updateFields.push(`metadata = $${paramIndex++}`);
        updateValues.push(JSON.stringify(mergedMetadata));
      }

      if (updateFields.length === 0) {
        throw new MessageError('No fields to update', {
          code: 'INVALID_MESSAGE_DATA',
        });
      }

      updateFields.push(`updated_at = $${paramIndex++}`);
      updateValues.push(new Date());

      updateValues.push(request.message_id);

      const result = await client.query(
        `
        UPDATE messages 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `,
        updateValues
      );

      const updatedMessage = this.mapRowToMessage(result.rows[0]);

      // Create change tracking record
      const change = await this.createMessageChange(
        client,
        request.message_id,
        'update',
        {
          field: 'content_metadata',
          old_value: { content: currentMessage.content, metadata: currentMessage.metadata },
          new_value: { content: updatedMessage.content, metadata: updatedMessage.metadata },
        },
        userId,
        deviceId
      );

      await client.query('COMMIT');

      logger.info('Message updated successfully', {
        messageId: request.message_id,
        userId,
        deviceId,
        updatedFields: updateFields,
      });

      return {
        message: updatedMessage,
        change,
        success: true,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to update message', { error, userId, request });

      return {
        message: {} as Message,
        change: {} as MessageChange,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      client.release();
    }
  }

  async getMessages(request: GetMessagesRequest): Promise<GetMessagesResponse> {
    const client = await this.pool.connect();

    try {
      const limit = Math.min(request.limit || 50, 100);
      const offset = request.offset || 0;

      let whereConditions = ['m.conversation_id = $1'];
      let queryParams: any[] = [request.conversation_id];
      let paramIndex = 2;

      if (request.message_types && request.message_types.length > 0) {
        whereConditions.push(`m.message_type = ANY($${paramIndex++})`);
        queryParams.push(request.message_types);
      }

      if (request.since) {
        whereConditions.push(`m.created_at >= $${paramIndex++}`);
        queryParams.push(request.since);
      }

      if (request.until) {
        whereConditions.push(`m.created_at <= $${paramIndex++}`);
        queryParams.push(request.until);
      }

      if (request.search_query) {
        whereConditions.push(`(
          m.content::text ILIKE $${paramIndex} OR 
          m.metadata::text ILIKE $${paramIndex}
        )`);
        queryParams.push(`%${request.search_query}%`);
        paramIndex++;
      }

      let query: string;

      if (request.include_threads) {
        // Use recursive CTE for threaded messages
        query = `
          WITH RECURSIVE message_tree AS (
            SELECT 
              m.id, m.conversation_id, m.user_id, m.device_id, m.message_type,
              m.content, m.metadata, m.parent_message_id, m.created_at, m.updated_at,
              0 as thread_level
            FROM messages m
            WHERE ${whereConditions.join(' AND ')} AND m.parent_message_id IS NULL
            
            UNION ALL
            
            SELECT 
              m.id, m.conversation_id, m.user_id, m.device_id, m.message_type,
              m.content, m.metadata, m.parent_message_id, m.created_at, m.updated_at,
              mt.thread_level + 1
            FROM messages m
            INNER JOIN message_tree mt ON m.parent_message_id = mt.id
          )
          SELECT * FROM message_tree
          ORDER BY created_at ASC
          LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
      } else {
        query = `
          SELECT 
            m.id, m.conversation_id, m.user_id, m.device_id, m.message_type,
            m.content, m.metadata, m.parent_message_id, m.created_at, m.updated_at,
            0 as thread_level
          FROM messages m
          WHERE ${whereConditions.join(' AND ')}
          ORDER BY m.created_at ASC
          LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
      }

      queryParams.push(limit, offset);

      const result = await client.query(query, queryParams);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM messages m
        WHERE ${whereConditions.join(' AND ')}
      `;

      const countResult = await client.query(countQuery, queryParams.slice(0, -2));
      const totalCount = parseInt(countResult.rows[0].total);

      const messages: MessageWithThread[] = result.rows.map((row) => ({
        id: row.id,
        conversation_id: row.conversation_id,
        user_id: row.user_id,
        device_id: row.device_id,
        message_type: row.message_type,
        content: row.content,
        metadata: row.metadata,
        parent_message_id: row.parent_message_id,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
        thread_level: row.thread_level,
      }));

      return {
        messages,
        total_count: totalCount,
        has_more: offset + limit < totalCount,
        success: true,
      };
    } catch (error) {
      logger.error('Failed to get messages', { error, request });

      return {
        messages: [],
        total_count: 0,
        has_more: false,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      client.release();
    }
  }

  async deleteMessage(
    userId: string,
    request: DeleteMessageRequest,
    deviceId?: string
  ): Promise<DeleteMessageResponse> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get current message
      const currentResult = await client.query('SELECT * FROM messages WHERE id = $1', [
        request.message_id,
      ]);

      if (currentResult.rows.length === 0) {
        throw new MessageError('Message not found', {
          code: 'MESSAGE_NOT_FOUND',
          message_id: request.message_id,
        });
      }

      const currentMessage = this.mapRowToMessage(currentResult.rows[0]);

      // Check permissions
      const hasPermission = await this.checkConversationPermission(
        client,
        currentMessage.conversation_id,
        userId,
        'can_delete_messages'
      );

      if (!hasPermission && currentMessage.user_id !== userId) {
        throw new MessageError('Permission denied', {
          code: 'INVALID_MESSAGE_DATA',
          message_id: request.message_id,
        });
      }

      let change: MessageChange;

      if (request.soft_delete) {
        // Soft delete - mark as deleted in metadata
        const updatedMetadata = {
          ...currentMessage.metadata,
          deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: userId,
        };

        await client.query('UPDATE messages SET metadata = $1, updated_at = $2 WHERE id = $3', [
          JSON.stringify(updatedMetadata),
          new Date(),
          request.message_id,
        ]);

        change = await this.createMessageChange(
          client,
          request.message_id,
          'update',
          {
            field: 'metadata',
            old_value: currentMessage.metadata,
            new_value: updatedMetadata,
          },
          userId,
          deviceId
        );
      } else {
        // Hard delete
        await client.query('DELETE FROM messages WHERE id = $1', [request.message_id]);

        change = await this.createMessageChange(
          client,
          request.message_id,
          'delete',
          { full_message: currentMessage },
          userId,
          deviceId
        );
      }

      await client.query('COMMIT');

      logger.info('Message deleted successfully', {
        messageId: request.message_id,
        userId,
        deviceId,
        softDelete: request.soft_delete,
      });

      return {
        success: true,
        change,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to delete message', { error, userId, request });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      client.release();
    }
  }

  // =====================================================
  // UTILITY METHODS
  // =====================================================

  private async generateUUID(client?: PoolClient): Promise<string> {
    if (client) {
      const result = await client.query('SELECT gen_random_uuid() as id');
      return result.rows[0].id;
    }

    const poolClient = await this.pool.connect();
    try {
      const result = await poolClient.query('SELECT gen_random_uuid() as id');
      return result.rows[0].id;
    } finally {
      poolClient.release();
    }
  }

  private mapRowToConversation(row: any): Conversation {
    return {
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      workspace_path: row.workspace_path,
      metadata: row.metadata || {},
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      last_activity: new Date(row.last_activity),
    };
  }

  private mapRowToMessage(row: any): Message {
    return {
      id: row.id,
      conversation_id: row.conversation_id,
      user_id: row.user_id,
      device_id: row.device_id,
      message_type: row.message_type,
      content: row.content || {},
      metadata: row.metadata || {},
      parent_message_id: row.parent_message_id,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  private async checkConversationPermission(
    client: PoolClient,
    conversationId: string,
    userId: string,
    permission: string
  ): Promise<boolean> {
    const result = await client.query(
      `
      SELECT permissions FROM conversation_participants 
      WHERE conversation_id = $1 AND user_id = $2
    `,
      [conversationId, userId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    const permissions = result.rows[0].permissions;
    return permissions[permission] === true;
  }

  private async createMessageChange(
    client: PoolClient,
    messageId: string,
    changeType: ChangeType,
    changeData: ChangeData,
    userId: string,
    deviceId?: string
  ): Promise<MessageChange> {
    const changeId = await this.generateUUID(client);
    const now = new Date();

    const result = await client.query(
      `
      INSERT INTO message_changes (
        id, message_id, change_type, change_data, device_id, user_id, timestamp, sync_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING *
    `,
      [changeId, messageId, changeType, JSON.stringify(changeData), deviceId || null, userId, now]
    );

    return {
      id: result.rows[0].id,
      message_id: result.rows[0].message_id,
      change_type: result.rows[0].change_type,
      change_data: result.rows[0].change_data,
      device_id: result.rows[0].device_id,
      user_id: result.rows[0].user_id,
      timestamp: new Date(result.rows[0].timestamp),
      sync_status: result.rows[0].sync_status,
      conflict_id: result.rows[0].conflict_id,
    };
  }
}

// =====================================================
// CUSTOM ERROR CLASSES
// =====================================================

class ConversationError extends Error {
  public code: string;
  public conversation_id?: string;
  public user_id?: string;
  public details?: Record<string, any>;

  constructor(
    message: string,
    options: {
      code:
        | 'CONVERSATION_NOT_FOUND'
        | 'INVALID_CONVERSATION_DATA'
        | 'PERMISSION_DENIED'
        | 'SYNC_CONFLICT';
      conversation_id?: string;
      user_id?: string;
      details?: Record<string, any>;
    }
  ) {
    super(message);
    this.name = 'ConversationError';
    this.code = options.code;
    if (options.conversation_id !== undefined) {
      this.conversation_id = options.conversation_id;
    }
    if (options.user_id !== undefined) {
      this.user_id = options.user_id;
    }
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

class MessageError extends Error {
  public code: string;
  public message_id?: string;
  public conversation_id?: string;
  public details?: Record<string, any>;

  constructor(
    message: string,
    options: {
      code:
        | 'MESSAGE_NOT_FOUND'
        | 'INVALID_MESSAGE_DATA'
        | 'THREAD_DEPTH_EXCEEDED'
        | 'CONTENT_TOO_LARGE';
      message_id?: string;
      conversation_id?: string;
      details?: Record<string, any>;
    }
  ) {
    super(message);
    this.name = 'MessageError';
    this.code = options.code;
    if (options.message_id !== undefined) {
      this.message_id = options.message_id;
    }
    if (options.conversation_id !== undefined) {
      this.conversation_id = options.conversation_id;
    }
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

// Export error classes for use in API endpoints
export { ConversationError, MessageError };
