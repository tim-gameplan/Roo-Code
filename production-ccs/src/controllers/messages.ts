/**
 * Message Controllers
 *
 * REST API controllers for message management endpoints.
 * Provides HTTP handlers that wrap the ConversationService message methods.
 *
 * @fileoverview Message API controllers
 * @version 1.0.0
 * @created 2025-06-23
 */

import { Response } from 'express';
import { ConversationService } from '../services/conversation';
import { databaseService } from '../services/database';
import {
  CreateMessageRequest,
  UpdateMessageRequest,
  GetMessagesRequest,
  DeleteMessageRequest,
} from '../types/conversation';
import { AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

export class MessageController {
  private conversationService: ConversationService;

  constructor() {
    this.conversationService = new ConversationService(databaseService['pool']);
  }

  /**
   * Create a new message in a conversation
   * POST /api/v1/conversations/:conversationId/messages
   */
  createMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'User authentication required',
          code: 'UNAUTHORIZED',
        });
        return;
      }

      const conversationId = req.params['conversationId'];
      if (!conversationId) {
        res.status(400).json({
          success: false,
          error: 'Conversation ID is required',
          code: 'MISSING_CONVERSATION_ID',
        });
        return;
      }

      const deviceId = req.headers['x-device-id'] as string;
      const createRequest: CreateMessageRequest = {
        conversation_id: conversationId,
        message_type: req.body.message_type || 'user_message',
        content: req.body.content,
        metadata: req.body.metadata,
        parent_message_id: req.body.parent_message_id,
        device_id: deviceId,
      };

      const result = await this.conversationService.createMessage(userId, createRequest, deviceId);

      if (result.success) {
        logger.info('Message created via API', {
          messageId: result.message.id,
          conversationId,
          userId,
          deviceId,
        });

        res.status(201).json({
          success: true,
          data: {
            message: result.message,
          },
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || 'Failed to create message',
          code: 'CREATION_FAILED',
        });
      }
    } catch (error) {
      logger.error('Error in createMessage controller', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  };

  /**
   * Update an existing message
   * PUT /api/v1/messages/:id
   */
  updateMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'User authentication required',
          code: 'UNAUTHORIZED',
        });
        return;
      }

      const messageId = req.params['id'];
      if (!messageId) {
        res.status(400).json({
          success: false,
          error: 'Message ID is required',
          code: 'MISSING_ID',
        });
        return;
      }

      const deviceId = req.headers['x-device-id'] as string;
      const updateRequest: UpdateMessageRequest = {
        message_id: messageId,
        content: req.body.content,
        metadata: req.body.metadata,
        device_id: deviceId,
      };

      const result = await this.conversationService.updateMessage(userId, updateRequest, deviceId);

      if (result.success) {
        logger.info('Message updated via API', {
          messageId,
          userId,
          deviceId,
        });

        res.status(200).json({
          success: true,
          data: {
            message: result.message,
            change: result.change,
          },
        });
      } else {
        const statusCode = result.error?.includes('Permission denied')
          ? 403
          : result.error?.includes('not found')
            ? 404
            : 400;

        res.status(statusCode).json({
          success: false,
          error: result.error || 'Failed to update message',
          code:
            statusCode === 403
              ? 'PERMISSION_DENIED'
              : statusCode === 404
                ? 'NOT_FOUND'
                : 'UPDATE_FAILED',
        });
      }
    } catch (error) {
      logger.error('Error in updateMessage controller', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  };

  /**
   * Get messages for a conversation
   * GET /api/v1/conversations/:conversationId/messages
   */
  getMessages = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'User authentication required',
          code: 'UNAUTHORIZED',
        });
        return;
      }

      const conversationId = req.params['conversationId'];
      if (!conversationId) {
        res.status(400).json({
          success: false,
          error: 'Conversation ID is required',
          code: 'MISSING_CONVERSATION_ID',
        });
        return;
      }

      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string) : 50;
      const offset = req.query['offset'] ? parseInt(req.query['offset'] as string) : 0;

      const messageTypes = req.query['message_types']
        ? ((req.query['message_types'] as string).split(',') as any[])
        : undefined;
      const since = req.query['since'] ? new Date(req.query['since'] as string) : undefined;
      const until = req.query['until'] ? new Date(req.query['until'] as string) : undefined;

      const getRequest: GetMessagesRequest = {
        conversation_id: conversationId,
        limit,
        offset,
        include_threads: req.query['include_threads'] === 'true',
        ...(messageTypes && { message_types: messageTypes }),
        ...(since && { since }),
        ...(until && { until }),
        search_query: req.query['search'] as string,
      };

      const result = await this.conversationService.getMessages(getRequest);

      if (result.success) {
        res.status(200).json({
          success: true,
          data: {
            messages: result.messages,
            pagination: {
              total_count: result.total_count,
              has_more: result.has_more,
              limit: getRequest.limit || 50,
              offset: getRequest.offset || 0,
            },
          },
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || 'Failed to get messages',
          code: 'FETCH_FAILED',
        });
      }
    } catch (error) {
      logger.error('Error in getMessages controller', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  };

  /**
   * Get a specific message by ID
   * GET /api/v1/messages/:id
   */
  getMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'User authentication required',
          code: 'UNAUTHORIZED',
        });
        return;
      }

      const messageId = req.params['id'];
      if (!messageId) {
        res.status(400).json({
          success: false,
          error: 'Message ID is required',
          code: 'MISSING_ID',
        });
        return;
      }

      // We'll need to get the conversation ID first, then search for the message
      // For now, we'll return a placeholder implementation
      res.status(501).json({
        success: false,
        error: 'Get single message endpoint not yet implemented',
        code: 'NOT_IMPLEMENTED',
      });
    } catch (error) {
      logger.error('Error in getMessage controller', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  };

  /**
   * Delete a message
   * DELETE /api/v1/messages/:id
   */
  deleteMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'User authentication required',
          code: 'UNAUTHORIZED',
        });
        return;
      }

      const messageId = req.params['id'];
      if (!messageId) {
        res.status(400).json({
          success: false,
          error: 'Message ID is required',
          code: 'MISSING_ID',
        });
        return;
      }

      const deviceId = req.headers['x-device-id'] as string;
      const softDelete = req.query['soft'] === 'true';

      const deleteRequest: DeleteMessageRequest = {
        message_id: messageId,
        device_id: deviceId,
        soft_delete: softDelete,
      };

      const result = await this.conversationService.deleteMessage(userId, deleteRequest, deviceId);

      if (result.success) {
        logger.info('Message deleted via API', {
          messageId,
          userId,
          deviceId,
          softDelete,
        });

        res.status(200).json({
          success: true,
          data: {
            message: softDelete ? 'Message archived successfully' : 'Message deleted successfully',
            change: result.change,
          },
        });
      } else {
        const statusCode = result.error?.includes('Permission denied')
          ? 403
          : result.error?.includes('not found')
            ? 404
            : 400;

        res.status(statusCode).json({
          success: false,
          error: result.error || 'Failed to delete message',
          code:
            statusCode === 403
              ? 'PERMISSION_DENIED'
              : statusCode === 404
                ? 'NOT_FOUND'
                : 'DELETE_FAILED',
        });
      }
    } catch (error) {
      logger.error('Error in deleteMessage controller', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  };

  /**
   * Get message thread (replies to a message)
   * GET /api/v1/messages/:id/thread
   */
  getMessageThread = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'User authentication required',
          code: 'UNAUTHORIZED',
        });
        return;
      }

      const messageId = req.params['id'];
      if (!messageId) {
        res.status(400).json({
          success: false,
          error: 'Message ID is required',
          code: 'MISSING_ID',
        });
        return;
      }

      // This would require additional logic to find the conversation and get threaded messages
      // For now, we'll return a placeholder implementation
      res.status(501).json({
        success: false,
        error: 'Message thread endpoint not yet implemented',
        code: 'NOT_IMPLEMENTED',
      });
    } catch (error) {
      logger.error('Error in getMessageThread controller', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  };

  /**
   * Search messages across conversations
   * GET /api/v1/messages/search
   */
  searchMessages = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'User authentication required',
          code: 'UNAUTHORIZED',
        });
        return;
      }

      const query = req.query['q'] as string;
      if (!query) {
        res.status(400).json({
          success: false,
          error: 'Search query is required',
          code: 'MISSING_QUERY',
        });
        return;
      }

      // This would require implementing a search service
      // For now, we'll return a placeholder implementation
      res.status(501).json({
        success: false,
        error: 'Message search endpoint not yet implemented',
        code: 'NOT_IMPLEMENTED',
      });
    } catch (error) {
      logger.error('Error in searchMessages controller', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  };
}
