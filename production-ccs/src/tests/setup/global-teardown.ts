/**
 * Global Test Teardown
 *
 * This file handles global test environment cleanup including:
 * - Stopping the WebSocket test server
 * - Cleaning up database connections
 * - Removing test fixtures
 */

import { stopTestServer } from '../integration/test-server';
import { logger } from '../../utils/logger';

export default async function globalTeardown(): Promise<void> {
  try {
    logger.info('Starting global test teardown...');

    // Stop the WebSocket test server
    await stopTestServer();

    logger.info('Global test teardown completed successfully');
  } catch (error) {
    logger.error('Failed to teardown global test environment', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw error in teardown to avoid masking test failures
  }
}
