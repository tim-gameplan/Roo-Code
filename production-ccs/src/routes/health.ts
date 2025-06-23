import { Router } from 'express';
import { HealthController } from '../controllers/health';

const router = Router();
const healthController = new HealthController();

/**
 * @route GET /health
 * @desc Basic health check endpoint
 * @access Public
 * @returns {HealthStatus} Basic health status
 */
router.get('/', healthController.basicHealthCheck);

/**
 * @route GET /health/detailed
 * @desc Detailed health check with comprehensive metrics
 * @access Public
 * @returns {DetailedHealthStatus} Detailed health status with metrics
 */
router.get('/detailed', healthController.detailedHealthCheck);

/**
 * @route GET /health/metrics
 * @desc System metrics endpoint for monitoring
 * @access Public
 * @returns {MetricsStatus} System performance metrics
 */
router.get('/metrics', healthController.metricsCheck);

export { router as healthRoutes, healthController };
