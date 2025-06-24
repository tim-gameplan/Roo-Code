/**
 * Message Routes
 *
 * Express routes for message management endpoints.
 * Provides RESTful API routes with authentication and validation middleware.
 *
 * @fileoverview Message API routes
 * @version 1.0.0
 * @created 2025-06-23
 */

import { Router } from 'express';
import { MessageController } from '../controllers/messages';
import { AuthMiddleware } from '../middleware/auth';
import { RateLimitMiddleware } from '../middleware/rate-limit';
import { ValidationMiddleware } from '../middleware/validation';
import { z } from 'zod';

const router = Router();
const messageController = new MessageController();
const authMiddleware = new AuthMiddleware();

// Validation schemas
const createMessageSchema = z.object({
  params: z.object({
    conversationId: z.string().uuid(),
  }),
  body: z.object({
    content: z.string().min(1),
    message_type: z.enum(['user_message', 'assistant_message', 'system_message']).optional(),
    metadata: z.record(z.any()).optional(),
    parent_message_id: z.string().uuid().optional(),
  }),
});

const updateMessageSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    content: z.string().min(1).optional(),
    metadata: z.record(z.any()).optional(),
  }),
});

const getMessagesSchema = z.object({
  params: z.object({
    conversationId: z.string().uuid(),
  }),
  query: z.object({
    limit: z.string().regex(/^\d+$/).optional(),
    offset: z.string().regex(/^\d+$/).optional(),
    include_threads: z.enum(['true', 'false']).optional(),
    message_types: z.string().optional(), // comma-separated list
    since: z.string().datetime().optional(),
    until: z.string().datetime().optional(),
    search: z.string().optional(),
  }),
});

const messageIdSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

const deleteMessageSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    soft: z.enum(['true', 'false']).optional(),
  }),
});

const searchMessagesSchema = z.object({
  query: z.object({
    q: z.string().min(1),
    limit: z.string().regex(/^\d+$/).optional(),
    offset: z.string().regex(/^\d+$/).optional(),
    conversation_id: z.string().uuid().optional(),
  }),
});

// Apply rate limiting to all message routes
router.use(RateLimitMiddleware.general);

/**
 * @route   POST /api/v1/conversations/:conversationId/messages
 * @desc    Create a new message in a conversation
 * @access  Private (JWT required)
 */
router.post(
  '/conversations/:conversationId/messages',
  RateLimitMiddleware.write,
  authMiddleware.authenticate,
  ValidationMiddleware.validateParams(createMessageSchema.shape.params),
  ValidationMiddleware.validateBody(createMessageSchema.shape.body),
  messageController.createMessage
);

/**
 * @route   GET /api/v1/conversations/:conversationId/messages
 * @desc    Get messages for a conversation
 * @access  Private (JWT required)
 */
router.get(
  '/conversations/:conversationId/messages',
  authMiddleware.authenticate,
  ValidationMiddleware.validateParams(getMessagesSchema.shape.params),
  ValidationMiddleware.validateQuery(getMessagesSchema.shape.query),
  messageController.getMessages
);

/**
 * @route   GET /api/v1/messages/:id
 * @desc    Get a specific message by ID
 * @access  Private (JWT required)
 */
router.get(
  '/messages/:id',
  authMiddleware.authenticate,
  ValidationMiddleware.validateParams(messageIdSchema.shape.params),
  messageController.getMessage
);

/**
 * @route   PUT /api/v1/messages/:id
 * @desc    Update an existing message
 * @access  Private (JWT required)
 */
router.put(
  '/messages/:id',
  RateLimitMiddleware.write,
  authMiddleware.authenticate,
  ValidationMiddleware.validateParams(updateMessageSchema.shape.params),
  ValidationMiddleware.validateBody(updateMessageSchema.shape.body),
  messageController.updateMessage
);

/**
 * @route   DELETE /api/v1/messages/:id
 * @desc    Delete a message (soft or hard delete)
 * @access  Private (JWT required)
 */
router.delete(
  '/messages/:id',
  RateLimitMiddleware.write,
  authMiddleware.authenticate,
  ValidationMiddleware.validateParams(deleteMessageSchema.shape.params),
  ValidationMiddleware.validateQuery(deleteMessageSchema.shape.query),
  messageController.deleteMessage
);

/**
 * @route   GET /api/v1/messages/:id/thread
 * @desc    Get message thread (replies to a message)
 * @access  Private (JWT required)
 */
router.get(
  '/messages/:id/thread',
  authMiddleware.authenticate,
  ValidationMiddleware.validateParams(messageIdSchema.shape.params),
  messageController.getMessageThread
);

/**
 * @route   GET /api/v1/messages/search
 * @desc    Search messages across conversations
 * @access  Private (JWT required)
 */
router.get(
  '/messages/search',
  RateLimitMiddleware.search,
  authMiddleware.authenticate,
  ValidationMiddleware.validateQuery(searchMessagesSchema.shape.query),
  messageController.searchMessages
);

export default router;
