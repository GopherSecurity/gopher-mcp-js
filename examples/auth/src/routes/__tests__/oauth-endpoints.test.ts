import express from 'express';
import request from 'supertest';
import { registerOAuthEndpoints } from '../oauth-endpoints';
import { createDefaultConfig, AuthServerConfig } from '../../config';

describe('OAuth Discovery Endpoints', () => {
  let app: express.Express;
  let config: AuthServerConfig;

  beforeEach(() => {
    app = express();
    config = createDefaultConfig({
      serverUrl: 'http://localhost:3001',
      authServerUrl: 'https://keycloak.example.com/realms/mcp',
      issuer: 'https://keycloak.example.com/realms/mcp',
      jwksUri: 'https://keycloak.example.com/realms/mcp/protocol/openid-connect/certs',
      allowedScopes: 'openid profile email mcp:read mcp:admin',
      oauthAuthorizeUrl: 'https://keycloak.example.com/realms/mcp/protocol/openid-connect/auth',
      oauthTokenUrl: 'https://keycloak.example.com/realms/mcp/protocol/openid-connect/token',
    });
    registerOAuthEndpoints(app, config);
  });

  describe('GET /.well-known/oauth-protected-resource', () => {
    it('should return 200 status code', async () => {
      const response = await request(app).get('/.well-known/oauth-protected-resource');
      expect(response.status).toBe(200);
    });

    it('should return JSON content type', async () => {
      const response = await request(app).get('/.well-known/oauth-protected-resource');
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should return resource field with /mcp path', async () => {
      const response = await request(app).get('/.well-known/oauth-protected-resource');
      expect(response.body.resource).toBe('http://localhost:3001/mcp');
    });

    it('should return authorization_servers array with server URL', async () => {
      // RFC 9728: In stateless mode, authorization_servers points to server_url
      // so clients can discover the auth server via /.well-known/oauth-authorization-server
      const response = await request(app).get('/.well-known/oauth-protected-resource');
      expect(response.body.authorization_servers).toEqual([
        'http://localhost:3001',
      ]);
    });

    it('should return scopes_supported array', async () => {
      const response = await request(app).get('/.well-known/oauth-protected-resource');
      expect(response.body.scopes_supported).toContain('openid');
      expect(response.body.scopes_supported).toContain('mcp:read');
      expect(response.body.scopes_supported).toContain('mcp:admin');
    });

    it('should return bearer_methods_supported', async () => {
      const response = await request(app).get('/.well-known/oauth-protected-resource');
      expect(response.body.bearer_methods_supported).toEqual(['header', 'query']);
    });

    it('should return resource_documentation URL', async () => {
      const response = await request(app).get('/.well-known/oauth-protected-resource');
      expect(response.body.resource_documentation).toBe('http://localhost:3001/docs');
    });
  });

  describe('GET /.well-known/oauth-authorization-server', () => {
    it('should return 200 status code', async () => {
      const response = await request(app).get('/.well-known/oauth-authorization-server');
      expect(response.status).toBe(200);
    });

    it('should return issuer', async () => {
      const response = await request(app).get('/.well-known/oauth-authorization-server');
      expect(response.body.issuer).toBe('https://keycloak.example.com/realms/mcp');
    });

    it('should return authorization_endpoint', async () => {
      const response = await request(app).get('/.well-known/oauth-authorization-server');
      expect(response.body.authorization_endpoint).toBe(
        'https://keycloak.example.com/realms/mcp/protocol/openid-connect/auth'
      );
    });

    it('should return token_endpoint', async () => {
      const response = await request(app).get('/.well-known/oauth-authorization-server');
      expect(response.body.token_endpoint).toBe(
        'https://keycloak.example.com/realms/mcp/protocol/openid-connect/token'
      );
    });

    it('should return jwks_uri', async () => {
      const response = await request(app).get('/.well-known/oauth-authorization-server');
      expect(response.body.jwks_uri).toBe(
        'https://keycloak.example.com/realms/mcp/protocol/openid-connect/certs'
      );
    });

    it('should return response_types_supported', async () => {
      const response = await request(app).get('/.well-known/oauth-authorization-server');
      expect(response.body.response_types_supported).toContain('code');
    });

    it('should return grant_types_supported', async () => {
      const response = await request(app).get('/.well-known/oauth-authorization-server');
      expect(response.body.grant_types_supported).toContain('authorization_code');
      expect(response.body.grant_types_supported).toContain('refresh_token');
    });

    it('should return code_challenge_methods_supported', async () => {
      const response = await request(app).get('/.well-known/oauth-authorization-server');
      expect(response.body.code_challenge_methods_supported).toContain('S256');
    });
  });

  describe('GET /.well-known/openid-configuration', () => {
    it('should return 200 status code', async () => {
      const response = await request(app).get('/.well-known/openid-configuration');
      expect(response.status).toBe(200);
    });

    it('should return issuer', async () => {
      const response = await request(app).get('/.well-known/openid-configuration');
      expect(response.body.issuer).toBe('https://keycloak.example.com/realms/mcp');
    });

    it('should return userinfo_endpoint', async () => {
      const response = await request(app).get('/.well-known/openid-configuration');
      expect(response.body.userinfo_endpoint).toBe(
        'https://keycloak.example.com/realms/mcp/protocol/openid-connect/userinfo'
      );
    });

    it('should include openid in scopes_supported', async () => {
      const response = await request(app).get('/.well-known/openid-configuration');
      expect(response.body.scopes_supported).toContain('openid');
      expect(response.body.scopes_supported).toContain('profile');
      expect(response.body.scopes_supported).toContain('email');
    });

    it('should return subject_types_supported', async () => {
      const response = await request(app).get('/.well-known/openid-configuration');
      expect(response.body.subject_types_supported).toContain('public');
    });

    it('should return id_token_signing_alg_values_supported', async () => {
      const response = await request(app).get('/.well-known/openid-configuration');
      expect(response.body.id_token_signing_alg_values_supported).toContain('RS256');
    });
  });

  describe('GET /oauth/authorize', () => {
    it('should redirect to authorization endpoint', async () => {
      const response = await request(app)
        .get('/oauth/authorize')
        .query({ client_id: 'test-client', response_type: 'code' });

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain(
        'https://keycloak.example.com/realms/mcp/protocol/openid-connect/auth'
      );
    });

    it('should forward query parameters', async () => {
      const response = await request(app)
        .get('/oauth/authorize')
        .query({
          client_id: 'test-client',
          response_type: 'code',
          redirect_uri: 'http://localhost:8080/callback',
          scope: 'openid profile',
          state: 'abc123',
        });

      expect(response.status).toBe(302);
      const location = response.headers.location;
      expect(location).toContain('client_id=test-client');
      expect(location).toContain('response_type=code');
      expect(location).toContain('redirect_uri=');
      expect(location).toContain('scope=openid');
      expect(location).toContain('state=abc123');
    });

    it('should handle PKCE parameters', async () => {
      const response = await request(app)
        .get('/oauth/authorize')
        .query({
          client_id: 'test-client',
          response_type: 'code',
          code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
          code_challenge_method: 'S256',
        });

      expect(response.status).toBe(302);
      const location = response.headers.location;
      expect(location).toContain('code_challenge=');
      expect(location).toContain('code_challenge_method=S256');
    });
  });

  describe('Edge cases', () => {
    it('should use serverUrl as fallback for authorization_servers', async () => {
      const noAuthConfig = createDefaultConfig({
        serverUrl: 'http://localhost:3001',
        authServerUrl: '',
      });
      const testApp = express();
      registerOAuthEndpoints(testApp, noAuthConfig);

      const response = await request(testApp).get('/.well-known/oauth-protected-resource');
      expect(response.body.authorization_servers).toEqual(['http://localhost:3001']);
    });

    it('should filter empty scopes', async () => {
      const emptyScopes = createDefaultConfig({
        serverUrl: 'http://localhost:3001',
        allowedScopes: '  openid   profile  ',
      });
      const testApp = express();
      registerOAuthEndpoints(testApp, emptyScopes);

      const response = await request(testApp).get('/.well-known/oauth-protected-resource');
      expect(response.body.scopes_supported).not.toContain('');
      expect(response.body.scopes_supported).toContain('openid');
      expect(response.body.scopes_supported).toContain('profile');
    });
  });
});
