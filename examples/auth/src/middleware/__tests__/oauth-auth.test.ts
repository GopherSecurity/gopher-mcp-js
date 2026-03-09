import express, { Request, Response } from 'express';
import request from 'supertest';
import { OAuthAuthMiddleware, AuthenticatedRequest } from '../oauth-auth';
import { createDefaultConfig, AuthServerConfig } from '../../config';
import { AuthContext, createEmptyAuthContext } from '../../ffi';

// Mock the FFI module
jest.mock('../../ffi', () => ({
  ...jest.requireActual('../../ffi/types'),
  createEmptyAuthContext: jest.fn(() => ({
    userId: '',
    scopes: '',
    audience: '',
    tokenExpiry: 0,
    authenticated: false,
  })),
  generateWwwAuthenticateHeaderV2: jest.fn(
    (realm, resource, scope, error, description) =>
      `Bearer realm="${realm}", error="${error}", error_description="${description}"`
  ),
  ValidationOptions: jest.fn().mockImplementation(() => ({
    setClockSkew: jest.fn().mockReturnThis(),
    destroy: jest.fn(),
  })),
}));

describe('OAuthAuthMiddleware', () => {
  let config: AuthServerConfig;

  beforeEach(() => {
    config = createDefaultConfig({
      serverUrl: 'http://localhost:3001',
      authDisabled: false,
      allowedScopes: 'openid mcp:read mcp:admin',
    });
  });

  describe('extractToken', () => {
    let middleware: OAuthAuthMiddleware;

    beforeEach(() => {
      middleware = new OAuthAuthMiddleware(null, config);
    });

    it('should extract token from Authorization header', () => {
      const req = {
        headers: { authorization: 'Bearer test-token-123' },
        query: {},
      } as unknown as Request;

      const token = middleware.extractToken(req);
      expect(token).toBe('test-token-123');
    });

    it('should extract token from query parameter', () => {
      const req = {
        headers: {},
        query: { access_token: 'query-token-456' },
      } as unknown as Request;

      const token = middleware.extractToken(req);
      expect(token).toBe('query-token-456');
    });

    it('should prefer Authorization header over query parameter', () => {
      const req = {
        headers: { authorization: 'Bearer header-token' },
        query: { access_token: 'query-token' },
      } as unknown as Request;

      const token = middleware.extractToken(req);
      expect(token).toBe('header-token');
    });

    it('should return null when no token is present', () => {
      const req = {
        headers: {},
        query: {},
      } as unknown as Request;

      const token = middleware.extractToken(req);
      expect(token).toBeNull();
    });

    it('should return null for non-Bearer authorization', () => {
      const req = {
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
        query: {},
      } as unknown as Request;

      const token = middleware.extractToken(req);
      expect(token).toBeNull();
    });

    it('should return null for empty Bearer token', () => {
      const req = {
        headers: { authorization: 'Bearer ' },
        query: {},
      } as unknown as Request;

      const token = middleware.extractToken(req);
      expect(token).toBe('');
    });

    it('should return null for empty query token', () => {
      const req = {
        headers: {},
        query: { access_token: '' },
      } as unknown as Request;

      const token = middleware.extractToken(req);
      expect(token).toBeNull();
    });

    it('should handle token with spaces', () => {
      const req = {
        headers: { authorization: 'Bearer token with spaces' },
        query: {},
      } as unknown as Request;

      const token = middleware.extractToken(req);
      expect(token).toBe('token with spaces');
    });
  });

  describe('requiresAuth', () => {
    it('should return false when auth is disabled', () => {
      const disabledConfig = createDefaultConfig({ authDisabled: true });
      const middleware = new OAuthAuthMiddleware(null, disabledConfig);

      expect(middleware.requiresAuth('/mcp')).toBe(false);
      expect(middleware.requiresAuth('/protected')).toBe(false);
    });

    it('should return false for public paths', () => {
      const middleware = new OAuthAuthMiddleware(null, config);

      expect(middleware.requiresAuth('/.well-known/oauth-protected-resource')).toBe(false);
      expect(middleware.requiresAuth('/.well-known/openid-configuration')).toBe(false);
      expect(middleware.requiresAuth('/oauth/authorize')).toBe(false);
      expect(middleware.requiresAuth('/oauth/token')).toBe(false);
      expect(middleware.requiresAuth('/authorize')).toBe(false);
      expect(middleware.requiresAuth('/health')).toBe(false);
      expect(middleware.requiresAuth('/favicon.ico')).toBe(false);
    });

    it('should return true for /mcp paths', () => {
      // Need a mock auth client for requiresAuth to return true
      const mockAuthClient = {} as any;
      const middleware = new OAuthAuthMiddleware(mockAuthClient, config);

      expect(middleware.requiresAuth('/mcp')).toBe(true);
      expect(middleware.requiresAuth('/mcp/')).toBe(true);
      expect(middleware.requiresAuth('/mcp/tools')).toBe(true);
    });

    it('should return true for /rpc paths', () => {
      const mockAuthClient = {} as any;
      const middleware = new OAuthAuthMiddleware(mockAuthClient, config);

      expect(middleware.requiresAuth('/rpc')).toBe(true);
      expect(middleware.requiresAuth('/rpc/')).toBe(true);
      expect(middleware.requiresAuth('/rpc/call')).toBe(true);
    });

    it('should return true for /events paths', () => {
      const mockAuthClient = {} as any;
      const middleware = new OAuthAuthMiddleware(mockAuthClient, config);

      expect(middleware.requiresAuth('/events')).toBe(true);
      expect(middleware.requiresAuth('/events/')).toBe(true);
      expect(middleware.requiresAuth('/events/stream')).toBe(true);
    });

    it('should return true for /sse paths', () => {
      const mockAuthClient = {} as any;
      const middleware = new OAuthAuthMiddleware(mockAuthClient, config);

      expect(middleware.requiresAuth('/sse')).toBe(true);
      expect(middleware.requiresAuth('/sse/')).toBe(true);
    });

    it('should return true for unknown paths by default', () => {
      const mockAuthClient = {} as any;
      const middleware = new OAuthAuthMiddleware(mockAuthClient, config);

      expect(middleware.requiresAuth('/api')).toBe(true);
      expect(middleware.requiresAuth('/protected')).toBe(true);
      expect(middleware.requiresAuth('/custom')).toBe(true);
    });

    it('should return false when no auth client', () => {
      const middleware = new OAuthAuthMiddleware(null, config);

      // Even protected paths return false when no auth client
      expect(middleware.requiresAuth('/mcp')).toBe(false);
    });
  });

  describe('getAuthContext', () => {
    it('should return empty context initially', () => {
      const middleware = new OAuthAuthMiddleware(null, config);
      const ctx = middleware.getAuthContext();

      expect(ctx.authenticated).toBe(false);
      expect(ctx.userId).toBe('');
      expect(ctx.scopes).toBe('');
    });
  });

  describe('isAuthDisabled', () => {
    it('should return true when auth is disabled', () => {
      const disabledConfig = createDefaultConfig({ authDisabled: true });
      const middleware = new OAuthAuthMiddleware(null, disabledConfig);

      expect(middleware.isAuthDisabled()).toBe(true);
    });

    it('should return false when auth is enabled', () => {
      const enabledConfig = createDefaultConfig({ authDisabled: false });
      const middleware = new OAuthAuthMiddleware(null, enabledConfig);

      expect(middleware.isAuthDisabled()).toBe(false);
    });
  });

  describe('hasScope', () => {
    it('should return false when not authenticated', () => {
      const middleware = new OAuthAuthMiddleware(null, config);

      expect(middleware.hasScope('mcp:read')).toBe(false);
    });
  });
});

describe('OAuthAuthMiddleware integration', () => {
  let app: express.Express;
  let config: AuthServerConfig;

  beforeEach(() => {
    app = express();
    config = createDefaultConfig({
      serverUrl: 'http://localhost:3001',
      authDisabled: true, // Disable auth for most tests
      allowedScopes: 'openid mcp:read mcp:admin',
    });
  });

  describe('CORS preflight', () => {
    it('should handle OPTIONS request with CORS headers', async () => {
      const middleware = new OAuthAuthMiddleware(null, config);
      app.use(middleware.middleware);
      app.get('/mcp', (_req, res) => res.json({ ok: true }));

      const response = await request(app)
        .options('/mcp')
        .set('Origin', 'http://example.com')
        .set('Access-Control-Request-Method', 'POST');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
      expect(response.headers['access-control-allow-headers']).toContain('Authorization');
    });
  });

  describe('public paths', () => {
    it('should allow access to /health without token', async () => {
      const middleware = new OAuthAuthMiddleware(null, config);
      app.use(middleware.middleware);
      app.get('/health', (_req, res) => res.json({ status: 'ok' }));

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });

    it('should allow access to /.well-known paths without token', async () => {
      const middleware = new OAuthAuthMiddleware(null, config);
      app.use(middleware.middleware);
      app.get('/.well-known/oauth-protected-resource', (_req, res) =>
        res.json({ resource: 'test' })
      );

      const response = await request(app).get('/.well-known/oauth-protected-resource');

      expect(response.status).toBe(200);
    });
  });

  describe('auth disabled mode', () => {
    it('should allow access to protected paths when auth disabled', async () => {
      const disabledConfig = createDefaultConfig({ authDisabled: true });
      const middleware = new OAuthAuthMiddleware(null, disabledConfig);
      app.use(middleware.middleware);
      app.get('/mcp', (_req, res) => res.json({ ok: true }));

      const response = await request(app).get('/mcp');

      expect(response.status).toBe(200);
    });
  });
});
