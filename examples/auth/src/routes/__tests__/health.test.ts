import express from 'express';
import request from 'supertest';
import { registerHealthEndpoint, HealthResponse } from '../health';

describe('Health Endpoint', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
  });

  describe('GET /health', () => {
    it('should return 200 status code', async () => {
      registerHealthEndpoint(app);

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
    });

    it('should return JSON content type', async () => {
      registerHealthEndpoint(app);

      const response = await request(app).get('/health');

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should return status: "ok"', async () => {
      registerHealthEndpoint(app);

      const response = await request(app).get('/health');
      const body = response.body as HealthResponse;

      expect(body.status).toBe('ok');
    });

    it('should return a valid ISO timestamp', async () => {
      registerHealthEndpoint(app);

      const response = await request(app).get('/health');
      const body = response.body as HealthResponse;

      expect(body.timestamp).toBeDefined();
      expect(() => new Date(body.timestamp)).not.toThrow();

      const timestamp = new Date(body.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
    });

    it('should return uptime in seconds', async () => {
      registerHealthEndpoint(app);

      const response = await request(app).get('/health');
      const body = response.body as HealthResponse;

      expect(body.uptime).toBeDefined();
      expect(typeof body.uptime).toBe('number');
      expect(body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should include version when provided', async () => {
      registerHealthEndpoint(app, '1.0.0');

      const response = await request(app).get('/health');
      const body = response.body as HealthResponse;

      expect(body.version).toBe('1.0.0');
    });

    it('should not include version when not provided', async () => {
      registerHealthEndpoint(app);

      const response = await request(app).get('/health');
      const body = response.body as HealthResponse;

      expect(body.version).toBeUndefined();
    });

    it('should handle multiple requests', async () => {
      registerHealthEndpoint(app);

      const responses = await Promise.all([
        request(app).get('/health'),
        request(app).get('/health'),
        request(app).get('/health'),
      ]);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ok');
      });
    });
  });

  describe('Other HTTP methods', () => {
    it('should return 404 for POST /health', async () => {
      registerHealthEndpoint(app);

      const response = await request(app).post('/health');

      expect(response.status).toBe(404);
    });

    it('should return 404 for PUT /health', async () => {
      registerHealthEndpoint(app);

      const response = await request(app).put('/health');

      expect(response.status).toBe(404);
    });

    it('should return 404 for DELETE /health', async () => {
      registerHealthEndpoint(app);

      const response = await request(app).delete('/health');

      expect(response.status).toBe(404);
    });
  });
});
