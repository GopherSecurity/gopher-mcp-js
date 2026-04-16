/**
 * Integration test verifying GopherAuth module works as a drop-in
 * replacement for gopher-auth-sdk-nodejs.
 *
 * Tests the reusable auth module API surface, error classes,
 * scope helpers, and Express middleware/routes integration.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  GopherAuth,
  TokenValidationError,
  InsufficientScopesError,
  ConfigurationError,
  TokenExchangeError,
  hasScope,
  hasAllScopes,
  hasAnyScope,
} from '../src/auth';
import type { GopherAuthContext } from '../src/ffi/auth/types';

let nativeAvailable = false;

try {
  const loader = require('../src/ffi/auth/loader');
  nativeAvailable = loader.loadLibrary();
} catch {
  nativeAvailable = false;
}

const describeIfNative = nativeAvailable ? describe : describe.skip;

function createTempConfig(content: string): string {
  const tmpFile = path.join(
    os.tmpdir(),
    `gopher_int_test_${Date.now()}_${Math.random().toString(36).slice(2)}.config`
  );
  fs.writeFileSync(tmpFile, content);
  return tmpFile;
}

describe('GopherAuth Integration', () => {
  describe('Initialization', () => {
    describeIfNative('from config file', () => {
      it('should initialize and provide metadata', () => {
        const tmpFile = createTempConfig(
          'client_id = int-test-client\n' +
          'client_secret = int-test-secret\n' +
          'auth_server_url = http://kc:8080/realms/integration\n' +
          'server_url = http://localhost:4000\n' +
          'allowed_scopes = openid mcp:read mcp:admin\n'
        );
        try {
          const auth = new GopherAuth({ configPath: tmpFile });
          auth.initialize();

          // Verify metadata
          const meta = auth.getProtectedResourceMetadata();
          expect(meta.resource).toBe('http://localhost:4000/mcp');

          // Verify token endpoint
          const endpoint = auth.getTokenEndpoint();
          expect(endpoint).toContain('protocol/openid-connect/token');

          // Verify WWW-Authenticate header
          const header = auth.getWWWAuthenticateHeader({
            error: 'invalid_token',
            errorDescription: 'Token expired',
          });
          expect(header).toContain('Bearer');

          auth.shutdown();
        } finally {
          fs.unlinkSync(tmpFile);
        }
      });
    });

    describeIfNative('from inline config', () => {
      it('should initialize with config object', () => {
        const auth = new GopherAuth({
          config: {
            authServerUrl: 'http://kc:8080/realms/test',
            clientId: 'inline-client',
            clientSecret: 'inline-secret',
            serverUrl: 'http://localhost:5000',
          },
        });
        auth.initialize();
        expect(auth.getTokenEndpoint()).toContain('token');
        auth.shutdown();
      });
    });

    it('should initialize with authDisabled', () => {
      const auth = new GopherAuth({ authDisabled: true });
      auth.initialize();
      expect(auth.isDisabled).toBe(true);
      auth.shutdown();
    });

    it('should throw ConfigurationError without config', () => {
      const auth = new GopherAuth({});
      expect(() => auth.initialize()).toThrow(ConfigurationError);
    });

    describeIfNative('shutdown', () => {
      it('should cleanup all handles', () => {
        const auth = new GopherAuth({
          config: {
            authServerUrl: 'http://kc:8080/realms/test',
            clientId: 'cid',
            clientSecret: 'cs',
          },
        });
        auth.initialize();
        auth.shutdown();
        // Double shutdown should be safe
        auth.shutdown();
      });
    });
  });

  describe('Error classes', () => {
    it('TokenValidationError has errorCode', () => {
      const err = new TokenValidationError('expired', -1001);
      expect(err).toBeInstanceOf(Error);
      expect(err.errorCode).toBe(-1001);
      expect(err.name).toBe('TokenValidationError');
    });

    it('InsufficientScopesError has required and actual scopes', () => {
      const err = new InsufficientScopesError(
        ['mcp:read', 'mcp:admin'],
        ['openid', 'mcp:read']
      );
      expect(err).toBeInstanceOf(Error);
      expect(err.requiredScopes).toEqual(['mcp:read', 'mcp:admin']);
      expect(err.actualScopes).toEqual(['openid', 'mcp:read']);
    });

    it('ConfigurationError is an Error', () => {
      const err = new ConfigurationError('bad config');
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('ConfigurationError');
    });

    it('TokenExchangeError has errorCode and description', () => {
      const err = new TokenExchangeError('failed', 'invalid_grant', 'expired');
      expect(err.errorCode).toBe('invalid_grant');
      expect(err.errorDescription).toBe('expired');
    });
  });

  describeIfNative('Scope helpers', () => {
    const ctx: GopherAuthContext = {
      userId: 'user-1',
      scopes: 'openid mcp:read mcp:admin',
      audience: 'api',
      tokenExpiry: 0,
      authenticated: true,
    };

    it('hasScope returns true for present scope', () => {
      expect(hasScope(ctx, 'mcp:read')).toBe(true);
    });

    it('hasScope returns false for missing scope', () => {
      expect(hasScope(ctx, 'mcp:write')).toBe(false);
    });

    it('hasScope returns false for undefined context', () => {
      expect(hasScope(undefined, 'mcp:read')).toBe(false);
    });

    it('hasAllScopes returns true when all present', () => {
      expect(hasAllScopes(ctx, ['mcp:read', 'mcp:admin'])).toBe(true);
    });

    it('hasAllScopes returns false when one missing', () => {
      expect(hasAllScopes(ctx, ['mcp:read', 'mcp:write'])).toBe(false);
    });

    it('hasAnyScope returns true when one present', () => {
      expect(hasAnyScope(ctx, ['mcp:write', 'mcp:read'])).toBe(true);
    });

    it('hasAnyScope returns false when none present', () => {
      expect(hasAnyScope(ctx, ['mcp:write', 'mcp:delete'])).toBe(false);
    });

    it('concurrent contexts are independent', () => {
      const ctx1: GopherAuthContext = {
        userId: 'alice',
        scopes: 'admin',
        audience: '',
        tokenExpiry: 0,
        authenticated: true,
      };
      const ctx2: GopherAuthContext = {
        userId: 'bob',
        scopes: 'read',
        audience: '',
        tokenExpiry: 0,
        authenticated: true,
      };
      // Contexts don't leak into each other
      expect(hasScope(ctx1, 'admin')).toBe(true);
      expect(hasScope(ctx1, 'read')).toBe(false);
      expect(hasScope(ctx2, 'read')).toBe(true);
      expect(hasScope(ctx2, 'admin')).toBe(false);
    });
  });

  describeIfNative('Express middleware (unit)', () => {
    it('should create middleware function', () => {
      const auth = new GopherAuth({
        config: {
          authServerUrl: 'http://kc:8080/realms/test',
          clientId: 'cid',
          clientSecret: 'cs',
        },
      });
      auth.initialize();
      const mw = auth.expressMiddleware();
      expect(typeof mw).toBe('function');
      auth.shutdown();
    });

    it('should skip auth when disabled', () => {
      const auth = new GopherAuth({ authDisabled: true });
      auth.initialize();
      const mw = auth.expressMiddleware();

      let nextCalled = false;
      const req = { method: 'POST', path: '/mcp', headers: {} };
      const res = {};
      mw(req, res, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
      auth.shutdown();
    });
  });
});
