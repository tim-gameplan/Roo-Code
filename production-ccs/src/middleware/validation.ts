import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';
import { logger } from '../utils/logger';

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export class ValidationMiddleware {
  /**
   * Validate request body against Zod schema
   */
  static validateBody = (schema: ZodSchema) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        const validatedData = schema.parse(req.body);
        req.body = validatedData;
        next();
      } catch (error) {
        if (error instanceof ZodError) {
          const validationErrors: ValidationError[] = error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
          }));

          res.status(400).json({
            success: false,
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: validationErrors,
          });
          return;
        }

        logger.error('Validation middleware error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal validation error',
          code: 'VALIDATION_INTERNAL_ERROR',
        });
      }
    };
  };

  /**
   * Validate request query parameters against Zod schema
   */
  static validateQuery = (schema: ZodSchema) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        const validatedData = schema.parse(req.query);
        req.query = validatedData;
        next();
      } catch (error) {
        if (error instanceof ZodError) {
          const validationErrors: ValidationError[] = error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
          }));

          res.status(400).json({
            success: false,
            error: 'Query validation failed',
            code: 'QUERY_VALIDATION_ERROR',
            details: validationErrors,
          });
          return;
        }

        logger.error('Query validation middleware error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal validation error',
          code: 'VALIDATION_INTERNAL_ERROR',
        });
      }
    };
  };

  /**
   * Validate request parameters against Zod schema
   */
  static validateParams = (schema: ZodSchema) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        const validatedData = schema.parse(req.params);
        req.params = validatedData;
        next();
      } catch (error) {
        if (error instanceof ZodError) {
          const validationErrors: ValidationError[] = error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
          }));

          res.status(400).json({
            success: false,
            error: 'Parameter validation failed',
            code: 'PARAM_VALIDATION_ERROR',
            details: validationErrors,
          });
          return;
        }

        logger.error('Parameter validation middleware error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal validation error',
          code: 'VALIDATION_INTERNAL_ERROR',
        });
      }
    };
  };
}

// Common validation schemas
export const commonSchemas = {
  // UUID validation
  uuid: z.string().uuid('Invalid UUID format'),

  // Pagination
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).default('desc'),
  }),

  // Date range
  dateRange: z.object({
    start_date: z.string().datetime().optional(),
    end_date: z.string().datetime().optional(),
  }),

  // Search
  search: z.object({
    q: z.string().min(1).max(255).optional(),
    filters: z.record(z.string()).optional(),
  }),
};

// Authentication validation schemas
export const authSchemas = {
  register: z.object({
    email: z.string().email('Invalid email format'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must be less than 128 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
        'Password must contain uppercase, lowercase, number and special character'
      ),
    display_name: z.string().min(1).max(100).optional(),
    preferences: z.record(z.any()).optional(),
  }),

  login: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
    device_name: z.string().min(1).max(100),
    device_type: z.enum(['desktop', 'mobile', 'tablet', 'web']),
    device_fingerprint: z.string().optional(),
    platform: z.string().optional(),
    capabilities: z.record(z.any()).optional(),
  }),

  refreshToken: z.object({
    refresh_token: z.string().min(1, 'Refresh token is required'),
    device_id: z.string().uuid('Invalid device ID format'),
  }),

  changePassword: z.object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must be less than 128 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
        'Password must contain uppercase, lowercase, number and special character'
      ),
  }),

  updateProfile: z.object({
    display_name: z.string().min(1).max(100).optional(),
    preferences: z.record(z.any()).optional(),
  }),
};

// User validation schemas
export const userSchemas = {
  updatePreferences: z.object({
    preferences: z.array(
      z.object({
        key: z.string().min(1).max(100),
        value: z.any(),
        device_specific: z.boolean().optional(),
        device_id: z.string().uuid().optional(),
      })
    ),
  }),
};

// Conversation validation schemas
export const conversationSchemas = {
  create: z.object({
    title: z.string().min(1).max(255).optional(),
    metadata: z.record(z.any()).optional(),
  }),

  update: z.object({
    title: z.string().min(1).max(255).optional(),
    metadata: z.record(z.any()).optional(),
    status: z.enum(['active', 'archived', 'deleted']).optional(),
  }),

  addMessage: z.object({
    content: z.string().min(1),
    type: z.enum(['user', 'assistant', 'system']).default('user'),
    metadata: z.record(z.any()).optional(),
    parent_message_id: z.string().uuid().optional(),
  }),

  updateMessage: z.object({
    content: z.string().min(1).optional(),
    metadata: z.record(z.any()).optional(),
  }),
};

// File sync validation schemas
export const fileSyncSchemas = {
  createWorkspace: z.object({
    name: z.string().min(1).max(255),
    description: z.string().max(1000).optional(),
    settings: z.record(z.any()).optional(),
  }),

  updateWorkspace: z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(1000).optional(),
    settings: z.record(z.any()).optional(),
    status: z.enum(['active', 'archived', 'deleted']).optional(),
  }),

  syncFile: z.object({
    file_path: z.string().min(1),
    content: z.string(),
    file_hash: z.string().min(1),
    metadata: z.record(z.any()).optional(),
  }),

  resolveConflict: z.object({
    resolution_strategy: z.enum(['local', 'remote', 'merge']),
    merged_content: z.string().optional(),
  }),
};
