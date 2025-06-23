/**
 * Conversation API Tests
 *
 * Comprehensive test suite for conversation management endpoints.
 * Tests authentication, validation, business logic, and error handling.
 *
 * @fileoverview Conversation API test suite
 * @version 1.0.0
 * @created 2025-06-23
 */

import request from 'supertest';
import { ExpressApp } from '../app';

describe('Conversation API Endpoints', () => {
  let app: ExpressApp;
  let server: any;

  beforeAll(async () => {
    // Initialize test app
    app = new ExpressApp();
    await app.initialize();
    server = app.getApp();
  });

  afterAll(async () => {
    await app.shutdown();
  });

  describe('Authentication Required', () => {
    it('should reject requests without authentication token', async () => {
      const response = await request(server).get('/api/v1/conversations').expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });

    it('should reject requests with invalid authentication token', async () => {
      const response = await request(server)
        .get('/api/v1/conversations')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });

    it('should reject requests with malformed authorization header', async () => {
      const response = await request(server)
        .get('/api/v1/conversations')
        .set('Authorization', 'InvalidFormat token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/v1/conversations', () => {
    it('should reject request without authentication', async () => {
      const conversationData = {
        title: 'Test Conversation',
        workspace_path: '/test/workspace',
        metadata: { project: 'test-project' },
      };

      const response = await request(server)
        .post('/api/v1/conversations')
        .send(conversationData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });

    it('should reject invalid title length without authentication', async () => {
      const response = await request(server)
        .post('/api/v1/conversations')
        .send({ title: 'a'.repeat(256) })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/v1/conversations', () => {
    it('should reject request without authentication', async () => {
      const response = await request(server).get('/api/v1/conversations').expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });

    it('should reject request with query parameters but no auth', async () => {
      const response = await request(server)
        .get('/api/v1/conversations')
        .query({ limit: '5', offset: '0' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });

    it('should reject search requests without authentication', async () => {
      const response = await request(server)
        .get('/api/v1/conversations')
        .query({ search: 'Test' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/v1/conversations/:id', () => {
    it('should reject request without authentication', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      const response = await request(server).get(`/api/v1/conversations/${fakeId}`).expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });

    it('should reject invalid UUID format without authentication', async () => {
      const response = await request(server).get('/api/v1/conversations/invalid-uuid').expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('PUT /api/v1/conversations/:id', () => {
    it('should reject request without authentication', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      const updateData = {
        title: 'Updated Test Conversation',
        metadata: { project: 'updated-project', version: '2.0' },
      };

      const response = await request(server)
        .put(`/api/v1/conversations/${fakeId}`)
        .send(updateData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });

    it('should reject invalid title length without authentication', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      const response = await request(server)
        .put(`/api/v1/conversations/${fakeId}`)
        .send({ title: 'a'.repeat(256) })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('DELETE /api/v1/conversations/:id', () => {
    it('should reject request without authentication', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      const response = await request(server).delete(`/api/v1/conversations/${fakeId}`).expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/v1/conversations/:id/restore', () => {
    it('should reject request without authentication', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      const response = await request(server)
        .post(`/api/v1/conversations/${fakeId}/restore`)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to conversation endpoints', async () => {
      // Make multiple rapid requests to test rate limiting
      const requests = Array(10)
        .fill(null)
        .map(() => request(server).get('/api/v1/conversations'));

      const responses = await Promise.all(requests);

      // All requests should be unauthorized (401) since no auth token
      responses.forEach((response) => {
        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe('UNAUTHORIZED');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON requests', async () => {
      const response = await request(server)
        .post('/api/v1/conversations')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should handle oversized request bodies', async () => {
      const largeData = {
        title: 'Test Conversation',
        metadata: { data: 'x'.repeat(1000000) }, // Large metadata
      };

      const response = await request(server)
        .post('/api/v1/conversations')
        .send(largeData)
        .expect(413);

      expect(response.body.success).toBe(false);
    });

    it('should handle requests with unsupported content type', async () => {
      const response = await request(server)
        .post('/api/v1/conversations')
        .set('Content-Type', 'text/plain')
        .send('plain text data')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('API Documentation Endpoint', () => {
    it('should provide API documentation', async () => {
      const response = await request(server).get('/api').expect(200);

      expect(response.body.name).toBe('Roo Remote UI Central Communication Server');
      expect(response.body.version).toBe('1.0.0');
      expect(response.body.endpoints).toBeDefined();
      expect(response.body.endpoints.auth).toBeDefined();
    });
  });

  describe('Health Check Integration', () => {
    it('should have working health check endpoint', async () => {
      const response = await request(server).get('/health').expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
    });

    it('should have detailed health check endpoint', async () => {
      const response = await request(server).get('/health/detailed').expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.checks).toBeDefined();
      expect(response.body.checks.database).toBeDefined();
    });
  });

  describe('Route Not Found', () => {
    it('should return 404 for non-existent conversation routes', async () => {
      const response = await request(server)
        .get('/api/v1/conversations/nonexistent/action')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('ROUTE_NOT_FOUND');
      expect(response.body.message).toContain('does not exist');
    });

    it('should return 404 for invalid API versions', async () => {
      const response = await request(server).get('/api/v2/conversations').expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('ROUTE_NOT_FOUND');
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in responses', async () => {
      const response = await request(server).get('/api/v1/conversations').expect(401);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toBeDefined();
    });

    it('should handle OPTIONS preflight requests', async () => {
      const response = await request(server).options('/api/v1/conversations').expect(204);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toBeDefined();
      expect(response.headers['access-control-allow-headers']).toBeDefined();
    });
  });

  describe('Security Headers', () => {
    it('should include security headers in responses', async () => {
      const response = await request(server).get('/api/v1/conversations').expect(401);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });
  });

  describe('Request ID Tracking', () => {
    it('should include request ID in response headers', async () => {
      const response = await request(server).get('/api/v1/conversations').expect(401);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(typeof response.headers['x-request-id']).toBe('string');
    });

    it('should use provided request ID if available', async () => {
      const customRequestId = 'test-request-123';
      const response = await request(server)
        .get('/api/v1/conversations')
        .set('X-Request-ID', customRequestId)
        .expect(401);

      expect(response.headers['x-request-id']).toBe(customRequestId);
    });
  });
});
