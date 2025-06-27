/**
 * File Management API Routes
 *
 * TASK-007.2.3 - File Upload/Download APIs
 *
 * RESTful API endpoints for file management operations including:
 * - Chunked file uploads with real-time progress
 * - File downloads with range support
 * - File search and metadata management
 * - File sharing and permissions
 *
 * @fileoverview File Management API Routes
 * @version 1.0.0
 * @created 2025-06-23
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { Pool } from 'pg';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { FileManagementService } from '../services/file-management';
import { EventBroadcastingService } from '../services/event-broadcaster';
import { AuthMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { ValidationMiddleware } from '../middleware/validation';
import { RateLimitMiddleware } from '../middleware/rate-limit';
import {
  FileUploadRequest,
  FileSearchQuery,
  FileError,
  FileNotFoundError,
  FilePermissionError,
  FileSizeError,
  FileTypeError,
} from '../types/file';

/**
 * File upload validation schema
 */
const fileUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  size: z.number().min(1),
  conversationId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  isPublic: z.boolean().optional(),
  description: z.string().max(1000).optional(),
  tags: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
});

/**
 * File search validation schema
 */
const fileSearchSchema = z.object({
  query: z.string().max(255).optional(),
  mimeTypes: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  conversationId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  uploadedBy: z.string().uuid().optional(),
  uploadedAfter: z.string().datetime().optional(),
  uploadedBefore: z.string().datetime().optional(),
  minSize: z.number().min(0).optional(),
  maxSize: z.number().min(0).optional(),
  isPublic: z.boolean().optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
  sortBy: z.enum(['uploadedAt', 'filename', 'size', 'downloadCount']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

/**
 * Create file management routes
 */
export function createFileRoutes(
  pool: Pool,
  fileService: FileManagementService,
  eventBroadcaster: EventBroadcastingService
): Router {
  const router = Router();
  const authMiddleware = new AuthMiddleware();

  // Configure multer for chunk uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB chunk limit
    },
  });

  /**
   * Start file upload session
   * POST /api/files/upload/start
   */
  router.post(
    '/upload/start',
    authMiddleware.authenticate,
    RateLimitMiddleware.upload,
    ValidationMiddleware.validateBody(fileUploadSchema),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user?.id;
        if (!userId) {
          res.status(401).json({ error: 'User not authenticated' });
          return;
        }

        const deviceId = req.headers['x-device-id'] as string;
        const uploadRequest: Partial<FileUploadRequest> = {
          file: Buffer.alloc(0), // Will be uploaded in chunks
          filename: req.body.filename,
          mimeType: req.body.mimeType,
          size: req.body.size,
          conversationId: req.body.conversationId,
          workspaceId: req.body.workspaceId,
          isPublic: req.body.isPublic,
          description: req.body.description,
          tags: req.body.tags,
        };

        if (req.body.expiresAt) {
          uploadRequest.expiresAt = new Date(req.body.expiresAt);
        }

        const result = await fileService.startFileUpload(
          userId,
          uploadRequest as FileUploadRequest,
          deviceId
        );

        res.status(201).json({
          success: true,
          data: result,
        });

        logger.info('File upload session started', {
          sessionId: result.sessionId,
          filename: uploadRequest.filename,
          size: uploadRequest.size,
          userId,
          deviceId,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Upload file chunk
   * POST /api/files/upload/:sessionId/chunk
   */
  router.post(
    '/upload/:sessionId/chunk',
    authMiddleware.authenticate,
    upload.single('chunk'),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user?.id;
        if (!userId) {
          res.status(401).json({ error: 'User not authenticated' });
          return;
        }

        const { sessionId } = req.params;

        if (!sessionId) {
          res.status(400).json({ error: 'Session ID is required' });
          return;
        }

        const chunkNumber = parseInt(req.body.chunkNumber);
        const chunkData = req.file?.buffer;

        if (!chunkData) {
          res.status(400).json({ error: 'No chunk data provided' });
          return;
        }

        if (isNaN(chunkNumber)) {
          res.status(400).json({ error: 'Invalid chunk number' });
          return;
        }

        const progress = await fileService.uploadFileChunk(
          sessionId,
          chunkNumber,
          chunkData,
          userId
        );

        res.json({
          success: true,
          data: progress,
        });

        logger.debug('File chunk uploaded', {
          sessionId,
          chunkNumber,
          chunkSize: chunkData.length,
          progress: progress.percentage,
          userId,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Download file
   * GET /api/files/:fileId/download
   */
  router.get(
    '/:fileId/download',
    authMiddleware.authenticate,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user?.id;
        if (!userId) {
          res.status(401).json({ error: 'User not authenticated' });
          return;
        }

        const { fileId } = req.params;

        if (!fileId) {
          res.status(400).json({ error: 'File ID is required' });
          return;
        }

        const rangeHeader = req.headers.range;

        // Parse range header if present
        let range: { start: number; end: number } | undefined;
        if (rangeHeader) {
          const matches = rangeHeader.match(/bytes=(\d+)-(\d*)/);
          if (matches && matches[1]) {
            const start = parseInt(matches[1]);
            const end = matches[2] ? parseInt(matches[2]) : undefined;
            range = { start, end: end || start + 1024 * 1024 }; // Default 1MB chunk
          }
        }

        const result = await fileService.downloadFile(fileId, userId, range);

        // Set response headers
        res.setHeader('Content-Type', result.metadata.mimeType);
        res.setHeader('Content-Length', result.contentLength);
        res.setHeader('ETag', result.etag);
        res.setHeader('Last-Modified', result.lastModified.toUTCString());
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(result.metadata.filename)}"`
        );

        if (result.contentRange) {
          res.setHeader('Content-Range', result.contentRange);
          res.status(206); // Partial Content
        }

        // Stream file to response (assuming it's a Node.js stream)
        (result.stream as any).pipe(res);

        logger.info('File download started', {
          fileId,
          filename: result.metadata.filename,
          size: result.metadata.size,
          userId,
          hasRange: !!range,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Get file metadata
   * GET /api/files/:fileId
   */
  router.get(
    '/:fileId',
    authMiddleware.authenticate,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user?.id;
        if (!userId) {
          res.status(401).json({ error: 'User not authenticated' });
          return;
        }

        const { fileId } = req.params;

        // This would need to be implemented in the file service
        // For now, we'll return a placeholder response
        res.json({
          success: true,
          data: {
            message: 'File metadata endpoint - to be implemented',
            fileId,
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Search files
   * GET /api/files/search
   */
  router.get(
    '/search',
    authMiddleware.authenticate,
    ValidationMiddleware.validateQuery(fileSearchSchema),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user?.id;
        if (!userId) {
          res.status(401).json({ error: 'User not authenticated' });
          return;
        }

        const query: any = {
          query: req.query['query'] as string,
          mimeTypes: req.query['mimeTypes'] as string[],
          tags: req.query['tags'] as string[],
          conversationId: req.query['conversationId'] as string,
          workspaceId: req.query['workspaceId'] as string,
          uploadedBy: req.query['uploadedBy'] as string,
          isPublic: req.query['isPublic'] === 'true',
          sortBy: req.query['sortBy'] as 'uploadedAt' | 'filename' | 'size' | 'downloadCount',
          sortOrder: req.query['sortOrder'] as 'asc' | 'desc',
        };

        // Handle optional date fields
        if (req.query['uploadedAfter']) {
          query.uploadedAfter = new Date(req.query['uploadedAfter'] as string);
        }
        if (req.query['uploadedBefore']) {
          query.uploadedBefore = new Date(req.query['uploadedBefore'] as string);
        }
        if (req.query['minSize']) {
          query.minSize = parseInt(req.query['minSize'] as string);
        }
        if (req.query['maxSize']) {
          query.maxSize = parseInt(req.query['maxSize'] as string);
        }
        if (req.query['limit']) {
          query.limit = parseInt(req.query['limit'] as string);
        }
        if (req.query['offset']) {
          query.offset = parseInt(req.query['offset'] as string);
        }

        const result = await fileService.searchFiles(query as FileSearchQuery, userId);

        res.json({
          success: true,
          data: result,
        });

        logger.info('File search performed', {
          query: query.query,
          resultsCount: result.files.length,
          total: result.total,
          userId,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Delete file
   * DELETE /api/files/:fileId
   */
  router.delete(
    '/:fileId',
    authMiddleware.authenticate,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user?.id;
        if (!userId) {
          res.status(401).json({ error: 'User not authenticated' });
          return;
        }

        const { fileId } = req.params;

        if (!fileId) {
          res.status(400).json({ error: 'File ID is required' });
          return;
        }

        await fileService.deleteFile(fileId, userId);

        res.json({
          success: true,
          message: 'File deleted successfully',
        });

        logger.info('File deleted', {
          fileId,
          userId,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Get file service metrics (admin only)
   * GET /api/files/admin/metrics
   */
  router.get(
    '/admin/metrics',
    authMiddleware.authenticate,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user?.id;
        const userRole = (req.user as any)?.role;

        if (!userId || userRole !== 'admin') {
          res.status(403).json({ error: 'Admin access required' });
          return;
        }

        const metrics = fileService.getMetrics();
        const status = fileService.getStatus();

        res.json({
          success: true,
          data: {
            metrics,
            status,
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Error handling middleware for file operations
   */
  router.use((error: Error, req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    logger.error('File API error', {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
      userId: req.user?.id,
    });

    if (error instanceof FileNotFoundError) {
      res.status(404).json({
        success: false,
        error: 'File not found',
        code: 'FILE_NOT_FOUND',
      });
      return;
    }

    if (error instanceof FilePermissionError) {
      res.status(403).json({
        success: false,
        error: 'Permission denied',
        code: 'FILE_PERMISSION_DENIED',
      });
      return;
    }

    if (error instanceof FileSizeError) {
      res.status(413).json({
        success: false,
        error: 'File size exceeds limit',
        code: 'FILE_SIZE_EXCEEDED',
      });
      return;
    }

    if (error instanceof FileTypeError) {
      res.status(415).json({
        success: false,
        error: 'File type not allowed',
        code: 'FILE_TYPE_NOT_ALLOWED',
      });
      return;
    }

    if (error instanceof FileError) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message,
        code: error.code,
        details: error.details,
      });
      return;
    }

    // Generic error
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  });

  return router;
}

export default createFileRoutes;
