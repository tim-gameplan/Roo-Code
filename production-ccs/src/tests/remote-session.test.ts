import request from 'supertest';
import { ExpressApp } from '../app';
import { logger } from '../utils/logger';

describe('Remote Session Controller', () => {
  let app: ExpressApp;
  let server: any;

  beforeAll(async () => {
    // Suppress logs during testing
    jest.spyOn(logger, 'info').mockImplementation(() => logger);
    jest.spyOn(logger, 'error').mockImplementation(() => logger);
    jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    app = new ExpressApp();
    await app.initialize();
    server = app.getApp();
  });

  afterAll(async () => {
    await app.shutdown();
    jest.restoreAllMocks();
  });

  describe('GET /remote/:sessionId', () => {
    it('should serve remote UI HTML for a valid session', async () => {
      const sessionId = 'test-session-123';

      const response = await request(server).get(`/remote/${sessionId}`).expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Roo-Code Remote UI');
      expect(response.text).toContain(`Session: ${sessionId}`);
      expect(response.text).toContain('Connect to VSCode Extension');
    });

    it('should handle missing session ID', async () => {
      const response = await request(server).get('/remote/').expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Route not found');
    });

    it('should include session-specific content in HTML', async () => {
      const sessionId = 'unique-session-456';

      const response = await request(server).get(`/remote/${sessionId}`).expect(200);

      expect(response.text).toContain(`sessionId = '${sessionId}'`);
      expect(response.text).toContain(`Session: ${sessionId}`);
    });
  });

  describe('GET /remote/:sessionId/status', () => {
    it('should return 404 for non-existent session', async () => {
      const sessionId = 'non-existent-session';

      const response = await request(server).get(`/remote/${sessionId}/status`).expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('SESSION_NOT_FOUND');
      expect(response.body.error.message).toContain(sessionId);
    });

    it('should return session status after creating session via UI request', async () => {
      const sessionId = 'status-test-session';

      // First, create session by requesting UI
      await request(server).get(`/remote/${sessionId}`).expect(200);

      // Then check status
      const response = await request(server).get(`/remote/${sessionId}/status`).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sessionId).toBe(sessionId);
      expect(response.body.data.status).toBe('active');
      expect(response.body.data.connectedDevices).toBe(0);
      expect(response.body.data.createdAt).toBeDefined();
      expect(response.body.data.lastActivity).toBeDefined();
    });
  });

  describe('POST /remote/:sessionId/connect', () => {
    it('should connect to a new session', async () => {
      const sessionId = 'connect-test-session';
      const deviceInfo = {
        deviceId: 'test-device-123',
        deviceType: 'browser' as const,
        userAgent: 'Test Browser',
        capabilities: ['websocket', 'http'],
      };

      const response = await request(server)
        .post(`/remote/${sessionId}/connect`)
        .send({ deviceInfo })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sessionId).toBe(sessionId);
      expect(response.body.data.status).toBe('connected');
      expect(response.body.data.websocketUrl).toContain(sessionId);
    });

    it('should increment connected devices count', async () => {
      const sessionId = 'multi-device-session';
      const deviceInfo1 = {
        deviceId: 'device-1',
        deviceType: 'mobile' as const,
        userAgent: 'Mobile Browser',
        capabilities: ['websocket'],
      };
      const deviceInfo2 = {
        deviceId: 'device-2',
        deviceType: 'tablet' as const,
        userAgent: 'Tablet Browser',
        capabilities: ['websocket', 'http'],
      };

      // Connect first device
      await request(server)
        .post(`/remote/${sessionId}/connect`)
        .send({ deviceInfo: deviceInfo1 })
        .expect(200);

      // Connect second device
      await request(server)
        .post(`/remote/${sessionId}/connect`)
        .send({ deviceInfo: deviceInfo2 })
        .expect(200);

      // Check session status
      const statusResponse = await request(server).get(`/remote/${sessionId}/status`).expect(200);

      expect(statusResponse.body.data.connectedDevices).toBe(2);
      expect(statusResponse.body.data.status).toBe('active');
    });

    it('should handle missing session ID', async () => {
      const response = await request(server)
        .post('/remote//connect')
        .send({ deviceInfo: {} })
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /remote/:sessionId/disconnect', () => {
    it('should disconnect from existing session', async () => {
      const sessionId = 'disconnect-test-session';

      // First connect
      await request(server)
        .post(`/remote/${sessionId}/connect`)
        .send({
          deviceInfo: {
            deviceId: 'test-device',
            deviceType: 'browser',
            userAgent: 'Test',
            capabilities: ['websocket'],
          },
        })
        .expect(200);

      // Then disconnect
      const response = await request(server).post(`/remote/${sessionId}/disconnect`).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sessionId).toBe(sessionId);
      expect(response.body.data.status).toBe('disconnected');
    });

    it('should set session to inactive when no devices connected', async () => {
      const sessionId = 'inactive-session-test';

      // Connect device
      await request(server)
        .post(`/remote/${sessionId}/connect`)
        .send({
          deviceInfo: {
            deviceId: 'test-device',
            deviceType: 'browser',
            userAgent: 'Test',
            capabilities: ['websocket'],
          },
        })
        .expect(200);

      // Disconnect device
      await request(server).post(`/remote/${sessionId}/disconnect`).expect(200);

      // Check session status
      const statusResponse = await request(server).get(`/remote/${sessionId}/status`).expect(200);

      expect(statusResponse.body.data.connectedDevices).toBe(0);
      expect(statusResponse.body.data.status).toBe('inactive');
    });

    it('should return 404 for non-existent session', async () => {
      const response = await request(server).post('/remote/non-existent/disconnect').expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('SESSION_NOT_FOUND');
    });
  });

  describe('Session Management', () => {
    it('should maintain session state across multiple operations', async () => {
      const sessionId = 'state-management-test';

      // 1. Create session via UI request
      await request(server).get(`/remote/${sessionId}`).expect(200);

      // 2. Check initial status
      let statusResponse = await request(server).get(`/remote/${sessionId}/status`).expect(200);

      expect(statusResponse.body.data.status).toBe('active');
      expect(statusResponse.body.data.connectedDevices).toBe(0);

      // 3. Connect device
      await request(server)
        .post(`/remote/${sessionId}/connect`)
        .send({
          deviceInfo: {
            deviceId: 'state-test-device',
            deviceType: 'desktop',
            userAgent: 'Desktop Browser',
            capabilities: ['websocket', 'http'],
          },
        })
        .expect(200);

      // 4. Check updated status
      statusResponse = await request(server).get(`/remote/${sessionId}/status`).expect(200);

      expect(statusResponse.body.data.status).toBe('active');
      expect(statusResponse.body.data.connectedDevices).toBe(1);

      // 5. Disconnect device
      await request(server).post(`/remote/${sessionId}/disconnect`).expect(200);

      // 6. Check final status
      statusResponse = await request(server).get(`/remote/${sessionId}/status`).expect(200);

      expect(statusResponse.body.data.status).toBe('inactive');
      expect(statusResponse.body.data.connectedDevices).toBe(0);
    });

    it('should handle concurrent connections properly', async () => {
      const sessionId = 'concurrent-test-session';

      // Connect multiple devices concurrently
      const connectPromises = Array.from({ length: 3 }, (_, i) =>
        request(server)
          .post(`/remote/${sessionId}/connect`)
          .send({
            deviceInfo: {
              deviceId: `concurrent-device-${i}`,
              deviceType: 'browser',
              userAgent: `Browser ${i}`,
              capabilities: ['websocket'],
            },
          })
      );

      const responses = await Promise.all(connectPromises);

      // All connections should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Check final device count
      const statusResponse = await request(server).get(`/remote/${sessionId}/status`).expect(200);

      expect(statusResponse.body.data.connectedDevices).toBe(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed device info gracefully', async () => {
      const sessionId = 'error-test-session';

      const response = await request(server)
        .post(`/remote/${sessionId}/connect`)
        .send({ invalidData: 'test' })
        .expect(200); // Should still work, just with undefined deviceInfo

      expect(response.body.success).toBe(true);
    });

    it('should include request ID in all responses', async () => {
      const sessionId = 'request-id-test';

      const response = await request(server).get(`/remote/${sessionId}/status`).expect(404);

      expect(response.body.requestId).toBeDefined();
      expect(typeof response.body.requestId).toBe('string');
    });

    it('should include timestamp in all responses', async () => {
      const sessionId = 'timestamp-test';

      const response = await request(server).get(`/remote/${sessionId}/status`).expect(404);

      expect(response.body.timestamp).toBeDefined();
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });
  });
});
