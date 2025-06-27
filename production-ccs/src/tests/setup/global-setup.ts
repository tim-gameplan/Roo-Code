/**
 * Global Test Setup
 *
 * This file handles global test environment setup including:
 * - Starting the WebSocket test server
 * - Initializing database connections
 * - Setting up test fixtures
 */

import { startTestServer, stopTestServer } from '../integration/test-server';
import { logger } from '../../utils/logger';

export default async function globalSetup(): Promise<void> {
  try {
    logger.info('Starting global test setup...');

    // Start the WebSocket test server
    await startTestServer(3001);

    // Wait a moment for server to be fully ready
    await new Promise((resolve) => setTimeout(resolve, 1000));

    logger.info('Global test setup completed successfully');
  } catch (error) {
    logger.error('Failed to setup global test environment', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
