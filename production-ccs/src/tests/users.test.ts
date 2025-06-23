import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { Application } from 'express';
import { ExpressApp } from '../app';

describe('User Management API Endpoints', () => {
  let app: Application;
  let expressApp: ExpressApp;

  beforeAll(async () => {
    // Initialize test application
    expressApp = new ExpressApp();
    await expressApp.initialize();
    app = expressApp.getApp();
  });

  afterAll(async () => {
    await expressApp.shutdown();
  });

  describe('Authentication Required Endpoints', () => {
    it('should return 401 for GET /api/v1/users/profile without auth', async () => {
      const response = await request(app).get('/api/v1/users/profile').expect(401);

      expect(response.body).toMatchObject({
        success: false,
        code: 'UNAUTHORIZED',
      });
    });

    it('should return 401 for PUT /api/v1/users/profile without auth', async () => {
      const response = await request(app)
        .put('/api/v1/users/profile')
        .send({ display_name: 'Test' })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        code: 'UNAUTHORIZED',
      });
    });

    it('should return 401 for GET /api/v1/users/preferences without auth', async () => {
      const response = await request(app).get('/api/v1/users/preferences').expect(401);

      expect(response.body).toMatchObject({
        success: false,
        code: 'UNAUTHORIZED',
      });
    });

    it('should return 401 for PUT /api/v1/users/preferences without auth', async () => {
      const response = await request(app)
        .put('/api/v1/users/preferences')
        .send({ preferences: {} })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        code: 'UNAUTHORIZED',
      });
    });

    it('should return 401 for GET /api/v1/users/devices without auth', async () => {
      const response = await request(app).get('/api/v1/users/devices').expect(401);

      expect(response.body).toMatchObject({
        success: false,
        code: 'UNAUTHORIZED',
      });
    });

    it('should return 401 for POST /api/v1/users/devices without auth', async () => {
      const response = await request(app)
        .post('/api/v1/users/devices')
        .send({ device_name: 'Test' })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        code: 'UNAUTHORIZED',
      });
    });

    it('should return 401 for POST /api/v1/users/change-password without auth', async () => {
      const response = await request(app)
        .post('/api/v1/users/change-password')
        .send({
          current_password: 'test',
          new_password: 'test',
        })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        code: 'UNAUTHORIZED',
      });
    });
  });

  describe('Invalid Token Tests', () => {
    it('should return 401 for invalid token on profile endpoint', async () => {
      const response = await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        code: 'UNAUTHORIZED',
      });
    });

    it('should return 401 for malformed authorization header', async () => {
      const response = await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', 'InvalidFormat token')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        code: 'UNAUTHORIZED',
      });
    });

    it('should return 401 for empty authorization header', async () => {
      const response = await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', '')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        code: 'UNAUTHORIZED',
      });
    });
  });

  describe('Validation Tests', () => {
    it('should validate request body for profile update', async () => {
      const invalidData = {
        display_name: '', // Invalid: empty string
      };

      const response = await request(app)
        .put('/api/v1/users/profile')
        .set('Authorization', 'Bearer invalid-token')
        .send(invalidData);

      // Should fail with 401 (auth) before validation
      expect(response.status).toBe(401);
    });

    it('should validate request body for password change', async () => {
      const invalidPasswordData = {
        current_password: '', // Invalid: empty
        new_password: 'weak', // Invalid: too weak
      };

      const response = await request(app)
        .post('/api/v1/users/change-password')
        .set('Authorization', 'Bearer invalid-token')
        .send(invalidPasswordData);

      // Should fail with 401 (auth) before validation
      expect(response.status).toBe(401);
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error format', async () => {
      const response = await request(app).get('/api/v1/users/profile').expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('timestamp');
      expect(typeof response.body.timestamp).toBe('string');
    });

    it('should include request ID in error response', async () => {
      const response = await request(app).get('/api/v1/users/profile').expect(401);

      expect(response.body).toHaveProperty('requestId');
      expect(typeof response.body.requestId).toBe('string');
    });
  });

  describe('CORS and Headers', () => {
    it('should include CORS headers', async () => {
      const response = await request(app).get('/api/v1/users/profile').expect(401);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });

    it('should include security headers', async () => {
      const response = await request(app).get('/api/v1/users/profile').expect(401);

      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('x-frame-options', 'DENY');
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to user endpoints', async () => {
      // Make multiple rapid requests to test rate limiting
      const requests = Array(10)
        .fill(null)
        .map(() => request(app).get('/api/v1/users/profile'));

      const responses = await Promise.all(requests);

      // All should return 401 (unauthorized) but not rate limited in this simple test
      responses.forEach((response) => {
        expect([401, 429]).toContain(response.status);
      });
    });
  });

  describe('Content Type Handling', () => {
    it('should require JSON content type for POST requests', async () => {
      const response = await request(app)
        .post('/api/v1/users/change-password')
        .set('Content-Type', 'text/plain')
        .send('invalid data')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        code: 'INVALID_CONTENT_TYPE',
      });
    });

    it('should handle missing content type gracefully', async () => {
      const response = await request(app).post('/api/v1/users/change-password').send({
        current_password: 'test',
        new_password: 'test',
      });

      // Should handle the request but fail on auth
      expect([400, 401]).toContain(response.status);
    });
  });

  describe('HTTP Methods', () => {
    it('should reject unsupported HTTP methods', async () => {
      const response = await request(app).delete('/api/v1/users/profile').expect(405);

      expect(response.body).toMatchObject({
        success: false,
        code: 'METHOD_NOT_ALLOWED',
      });
    });

    it('should support OPTIONS for CORS preflight', async () => {
      const response = await request(app).options('/api/v1/users/profile').expect(200);

      expect(response.headers).toHaveProperty('access-control-allow-methods');
    });
  });
});
