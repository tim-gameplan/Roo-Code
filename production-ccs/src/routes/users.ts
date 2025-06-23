import { Router } from 'express';
import { UsersController } from '../controllers/users';
import { DatabaseService } from '../services/database';
import { AuthMiddleware } from '../middleware/auth';
import { ValidationMiddleware, authSchemas } from '../middleware/validation';

/**
 * Initialize the users routes with database service
 */
export function initializeUsersRoutes(dbService: DatabaseService): Router {
  const usersRouter = Router();
  const usersController = new UsersController(dbService);
  const authMiddleware = new AuthMiddleware();

  // Apply authentication middleware to all user routes
  usersRouter.use(authMiddleware.authenticate);

  /**
   * @route GET /api/users/profile
   * @desc Get user profile
   * @access Private
   */
  usersRouter.get('/profile', usersController.getProfile);

  /**
   * @route PUT /api/users/profile
   * @desc Update user profile
   * @access Private
   */
  usersRouter.put(
    '/profile',
    ValidationMiddleware.validateBody(authSchemas.updateProfile),
    usersController.updateProfile
  );

  /**
   * @route GET /api/users/preferences
   * @desc Get user preferences
   * @access Private
   */
  usersRouter.get('/preferences', usersController.getPreferences);

  /**
   * @route PUT /api/users/preferences
   * @desc Update user preferences
   * @access Private
   */
  usersRouter.put(
    '/preferences',
    ValidationMiddleware.validateBody(authSchemas.updateProfile),
    usersController.updatePreferences
  );

  /**
   * @route GET /api/users/devices
   * @desc List user devices
   * @access Private
   */
  usersRouter.get('/devices', usersController.getDevices);

  /**
   * @route POST /api/users/devices
   * @desc Register new device
   * @access Private
   */
  usersRouter.post('/devices', usersController.registerDevice);

  /**
   * @route PUT /api/users/devices/:id
   * @desc Update device info
   * @access Private
   */
  usersRouter.put('/devices/:id', usersController.updateDevice);

  /**
   * @route DELETE /api/users/devices/:id
   * @desc Remove device
   * @access Private
   */
  usersRouter.delete('/devices/:id', usersController.removeDevice);

  /**
   * @route POST /api/users/change-password
   * @desc Change user password
   * @access Private
   */
  usersRouter.post(
    '/change-password',
    ValidationMiddleware.validateBody(authSchemas.changePassword),
    usersController.changePassword
  );

  return usersRouter;
}
