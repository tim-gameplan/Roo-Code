/**
 * Conversation Controllers
 *
 * REST API controllers for conversation management endpoints.
 * Provides HTTP handlers that wrap the ConversationService business logic.
 *
 * @fileoverview Conversation API controllers
 * @version 1.0.0
 * @created 2025-06-23
 */

import { Response } from 'express';
import { ConversationService } from '../services/conversation';
import { databaseService } from '../services/database';
import {
  CreateConversationRequest,
  UpdateConversationRequest,
  GetConversationsRequest,
} from '../types/conversation';
import { AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

export class ConversationController {
  private conversationService: ConversationService;

  constructor() {
    // Create a new Pool instance for the ConversationService
    // We'll use the databaseService's query method instead
    this.conversationService = new ConversationService(databaseService['pool']);
  }

  /**
   * Create a new conversation
   * POST /api/v1/conversations
   */
  createConversation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

      const deviceId = req.headers['x-device-id'] as string;
      const createRequest: CreateConversationRequest = {
        title: req.body.title,
        workspace_path: req.body.workspace_path,
        metadata: req.body.metadata,
      };

      const result = await this.conversationService.createConversation(
        userId,
        createRequest,
        deviceId
      );

      if (result.success) {
        logger.info('Conversation created via API', {
          conversationId: result.conversation.id,
          userId,
          deviceId,
        });

        res.status(201).json({
          success: true,
          data: {
            conversation: result.conversation,
          },
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || 'Failed to create conversation',
          code: 'CREATION_FAILED',
        });
      }
    } catch (error) {
      logger.error('Error in createConversation controller', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  };

  /**
   * Update an existing conversation
   * PUT /api/v1/conversations/:id
   */
  updateConversation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

      const conversationId = req.params['id'];
      if (!conversationId) {
        res.status(400).json({
          success: false,
          error: 'Conversation ID is required',
          code: 'MISSING_ID',
        });
        return;
      }

      const deviceId = req.headers['x-device-id'] as string;

      const updateRequest: UpdateConversationRequest = {
        conversation_id: conversationId,
        title: req.body.title,
        workspace_path: req.body.workspace_path,
        metadata: req.body.metadata,
      };

      const result = await this.conversationService.updateConversation(
        userId,
        updateRequest,
        deviceId
      );

      if (result.success) {
        logger.info('Conversation updated via API', {
          conversationId,
          userId,
          deviceId,
        });

        res.status(200).json({
          success: true,
          data: {
            conversation: result.conversation,
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
          error: result.error || 'Failed to update conversation',
          code:
            statusCode === 403
              ? 'PERMISSION_DENIED'
              : statusCode === 404
                ? 'NOT_FOUND'
                : 'UPDATE_FAILED',
        });
      }
    } catch (error) {
      logger.error('Error in updateConversation controller', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  };

  /**
   * Get conversations for the authenticated user
   * GET /api/v1/conversations
   */
  getConversations = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string) : 50;
      const offset = req.query['offset'] ? parseInt(req.query['offset'] as string) : 0;

      const getRequest: GetConversationsRequest = {
        user_id: userId,
        limit,
        offset,
        workspace_path: req.query['workspace_path'] as string,
        include_archived: req.query['include_archived'] === 'true',
        sort_by: req.query['sort_by'] as any,
        sort_order: req.query['sort_order'] as any,
        search_query: req.query['search'] as string,
      };

      const result = await this.conversationService.getConversations(getRequest);

      if (result.success) {
        res.status(200).json({
          success: true,
          data: {
            conversations: result.conversations,
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
          error: result.error || 'Failed to get conversations',
          code: 'FETCH_FAILED',
        });
      }
    } catch (error) {
      logger.error('Error in getConversations controller', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  };

  /**
   * Get a specific conversation by ID
   * GET /api/v1/conversations/:id
   */
  getConversation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

      const conversationId = req.params['id'];

      // Get single conversation by filtering the getConversations result
      const result = await this.conversationService.getConversations({
        user_id: userId,
        limit: 1,
        offset: 0,
      });

      if (result.success) {
        const conversation = result.conversations.find((c) => c.id === conversationId);

        if (conversation) {
          res.status(200).json({
            success: true,
            data: {
              conversation,
            },
          });
        } else {
          res.status(404).json({
            success: false,
            error: 'Conversation not found',
            code: 'NOT_FOUND',
          });
        }
      } else {
        res.status(400).json({
          success: false,
          error: result.error || 'Failed to get conversation',
          code: 'FETCH_FAILED',
        });
      }
    } catch (error) {
      logger.error('Error in getConversation controller', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  };

  /**
   * Archive a conversation (soft delete)
   * DELETE /api/v1/conversations/:id
   */
  archiveConversation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

      const conversationId = req.params['id'];
      if (!conversationId) {
        res.status(400).json({
          success: false,
          error: 'Conversation ID is required',
          code: 'MISSING_ID',
        });
        return;
      }

      const deviceId = req.headers['x-device-id'] as string;

      // Archive by updating metadata
      const updateRequest: UpdateConversationRequest = {
        conversation_id: conversationId,
        metadata: {
          archived: true,
          custom_fields: {
            archived_at: new Date().toISOString(),
            archived_by: userId,
          },
        },
      };

      const result = await this.conversationService.updateConversation(
        userId,
        updateRequest,
        deviceId
      );

      if (result.success) {
        logger.info('Conversation archived via API', {
          conversationId,
          userId,
          deviceId,
        });

        res.status(200).json({
          success: true,
          data: {
            conversation: result.conversation,
            message: 'Conversation archived successfully',
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
          error: result.error || 'Failed to archive conversation',
          code:
            statusCode === 403
              ? 'PERMISSION_DENIED'
              : statusCode === 404
                ? 'NOT_FOUND'
                : 'ARCHIVE_FAILED',
        });
      }
    } catch (error) {
      logger.error('Error in archiveConversation controller', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  };

  /**
   * Restore an archived conversation
   * POST /api/v1/conversations/:id/restore
   */
  restoreConversation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

      const conversationId = req.params['id'];
      if (!conversationId) {
        res.status(400).json({
          success: false,
          error: 'Conversation ID is required',
          code: 'MISSING_ID',
        });
        return;
      }

      const deviceId = req.headers['x-device-id'] as string;

      // Restore by updating metadata
      const updateRequest: UpdateConversationRequest = {
        conversation_id: conversationId,
        metadata: {
          archived: false,
          custom_fields: {
            restored_at: new Date().toISOString(),
            restored_by: userId,
          },
        },
      };

      const result = await this.conversationService.updateConversation(
        userId,
        updateRequest,
        deviceId
      );

      if (result.success) {
        logger.info('Conversation restored via API', {
          conversationId,
          userId,
          deviceId,
        });

        res.status(200).json({
          success: true,
          data: {
            conversation: result.conversation,
            message: 'Conversation restored successfully',
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
          error: result.error || 'Failed to restore conversation',
          code:
            statusCode === 403
              ? 'PERMISSION_DENIED'
              : statusCode === 404
                ? 'NOT_FOUND'
                : 'RESTORE_FAILED',
        });
      }
    } catch (error) {
      logger.error('Error in restoreConversation controller', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  };
}
