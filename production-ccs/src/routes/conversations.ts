/**
 * Conversation Routes
 *
 * Express routes for conversation management endpoints.
 * Provides RESTful API routes with authentication and validation middleware.
 *
 * @fileoverview Conversation API routes
 * @version 1.0.0
 * @created 2025-06-23
 */

import { Router } from 'express';
import { ConversationController } from '../controllers/conversations';
import { AuthMiddleware } from '../middleware/auth';
import { RateLimitMiddleware } from '../middleware/rate-limit';
import { ValidationMiddleware } from '../middleware/validation';
import { z } from 'zod';

const router = Router();
const conversationController = new ConversationController();
const authMiddleware = new AuthMiddleware();

// Validation schemas
const createConversationSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(255).optional(),
    workspace_path: z.string().optional(),
    metadata: z.record(z.any()).optional(),
  }),
});

const updateConversationSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    title: z.string().min(1).max(255).optional(),
    workspace_path: z.string().optional(),
    metadata: z.record(z.any()).optional(),
  }),
});

const getConversationsSchema = z.object({
  query: z.object({
    limit: z.string().regex(/^\d+$/).optional(),
    offset: z.string().regex(/^\d+$/).optional(),
    workspace_path: z.string().optional(),
    include_archived: z.enum(['true', 'false']).optional(),
    sort_by: z.enum(['created_at', 'updated_at', 'title']).optional(),
    sort_order: z.enum(['asc', 'desc']).optional(),
    search: z.string().optional(),
  }),
});

const conversationIdSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

// Apply rate limiting to all conversation routes
router.use(RateLimitMiddleware.general);

/**
 * @route   POST /api/v1/conversations
 * @desc    Create a new conversation
 * @access  Private (JWT required)
 */
router.post(
  '/',
  authMiddleware.authenticate,
  ValidationMiddleware.validateBody(createConversationSchema.shape.body),
  conversationController.createConversation
);

/**
 * @route   GET /api/v1/conversations
 * @desc    Get conversations for the authenticated user
 * @access  Private (JWT required)
 */
router.get(
  '/',
  authMiddleware.authenticate,
  ValidationMiddleware.validateQuery(getConversationsSchema.shape.query),
  conversationController.getConversations
);

/**
 * @route   GET /api/v1/conversations/:id
 * @desc    Get a specific conversation by ID
 * @access  Private (JWT required)
 */
router.get(
  '/:id',
  authMiddleware.authenticate,
  ValidationMiddleware.validateParams(conversationIdSchema.shape.params),
  conversationController.getConversation
);

/**
 * @route   PUT /api/v1/conversations/:id
 * @desc    Update an existing conversation
 * @access  Private (JWT required)
 */
router.put(
  '/:id',
  authMiddleware.authenticate,
  ValidationMiddleware.validateParams(updateConversationSchema.shape.params),
  ValidationMiddleware.validateBody(updateConversationSchema.shape.body),
  conversationController.updateConversation
);

/**
 * @route   DELETE /api/v1/conversations/:id
 * @desc    Archive a conversation (soft delete)
 * @access  Private (JWT required)
 */
router.delete(
  '/:id',
  authMiddleware.authenticate,
  ValidationMiddleware.validateParams(conversationIdSchema.shape.params),
  conversationController.archiveConversation
);

/**
 * @route   POST /api/v1/conversations/:id/restore
 * @desc    Restore an archived conversation
 * @access  Private (JWT required)
 */
router.post(
  '/:id/restore',
  authMiddleware.authenticate,
  ValidationMiddleware.validateParams(conversationIdSchema.shape.params),
  conversationController.restoreConversation
);

export default router;
