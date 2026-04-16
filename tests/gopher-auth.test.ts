/**
 * Tests for GopherAuth reusable auth module
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

let GopherAuth: typeof import('../src/auth/gopher-auth').GopherAuth;
let hasScope: typeof import('../src/auth/scope-helpers').hasScope;
let hasAllScopes: typeof import('../src/auth/scope-helpers').hasAllScopes;
let hasAnyScope: typeof import('../src/auth/scope-helpers').hasAnyScope;
let InsufficientScopesError: typeof import('../src/auth/errors').InsufficientScopesError;
let TokenValidationError: typeof import('../src/auth/errors').TokenValidationError;
let ConfigurationError: typeof import('../src/auth/errors').ConfigurationError;
let nativeAvailable = false;

try {
  const loader = require('../src/ffi/auth/loader');
  nativeAvailable = loader.loadLibrary();
  if (nativeAvailable) {
    GopherAuth = require('../src/auth/gopher-auth').GopherAuth;
    const helpers = require('../src/auth/scope-helpers');
    hasScope = helpers.hasScope;
    hasAllScopes = helpers.hasAllScopes;
    hasAnyScope = helpers.hasAnyScope;
    const errors = require('../src/auth/errors');
    InsufficientScopesError = errors.InsufficientScopesError;
    TokenValidationError = errors.TokenValidationError;
    ConfigurationError = errors.ConfigurationError;
  }
} catch {
  nativeAvailable = false;
}

const describeIfNative = nativeAvailable ? describe : describe.skip;

function createTempConfig(content: string): string {
  const tmpFile = path.join(
    os.tmpdir(),
    `gopher_auth_test_${Date.now()}_${Math.random().toString(36).slice(2)}.config`
  );
  fs.writeFileSync(tmpFile, content);
  return tmpFile;
}

describeIfNative('GopherAuth', () => {
  it('should initialize from config file', () => {
    const tmpFile = createTempConfig(
      'client_id = test-client\n' +
      'client_secret = test-secret\n' +
      'auth_server_url = http://kc:8080/realms/test\n'
    );
    try {
      const auth = new GopherAuth({ configPath: tmpFile });
      auth.initialize();
      expect(auth.isDisabled).toBe(false);
      auth.shutdown();
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('should initialize from inline config', () => {
    const auth = new GopherAuth({
      config: {
        authServerUrl: 'http://kc:8080/realms/test',
        clientId: 'test-client',
        clientSecret: 'test-secret',
      },
    });
    auth.initialize();
    expect(auth.isDisabled).toBe(false);
    auth.shutdown();
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

  it('should get protected resource metadata', () => {
    const auth = new GopherAuth({
      config: {
        authServerUrl: 'http://kc:8080/realms/test',
        clientId: 'cid',
        clientSecret: 'cs',
        serverUrl: 'http://localhost:3001',
        allowedScopes: 'openid mcp:read',
      },
    });
    auth.initialize();
    const meta = auth.getProtectedResourceMetadata();
    expect(meta.resource).toContain('/mcp');
    expect(meta.authorization_servers).toBeDefined();
    auth.shutdown();
  });

  it('should get token endpoint', () => {
    const auth = new GopherAuth({
      config: {
        authServerUrl: 'http://kc:8080/realms/test',
        clientId: 'cid',
        clientSecret: 'cs',
      },
    });
    auth.initialize();
    expect(auth.getTokenEndpoint()).toContain('protocol/openid-connect/token');
    auth.shutdown();
  });

  it('should shutdown and cleanup', () => {
    const auth = new GopherAuth({
      config: {
        authServerUrl: 'http://kc:8080/realms/test',
        clientId: 'cid',
        clientSecret: 'cs',
      },
    });
    auth.initialize();
    auth.shutdown();
    // Should not throw on double shutdown
    auth.shutdown();
  });
});

describe('Error classes', () => {
  it('InsufficientScopesError includes required and actual scopes', () => {
    const err = new InsufficientScopesError(
      ['mcp:read', 'mcp:admin'],
      ['openid']
    );
    expect(err.requiredScopes).toEqual(['mcp:read', 'mcp:admin']);
    expect(err.actualScopes).toEqual(['openid']);
    expect(err.name).toBe('InsufficientScopesError');
    expect(err.message).toContain('mcp:read');
  });

  it('TokenValidationError includes errorCode', () => {
    const err = new TokenValidationError('expired', -1001);
    expect(err.errorCode).toBe(-1001);
    expect(err.name).toBe('TokenValidationError');
  });
});

describeIfNative('Scope helpers', () => {
  it('hasScope returns true for present scope', () => {
    expect(hasScope({ userId: 'u', scopes: 'openid mcp:read', audience: '', tokenExpiry: 0, authenticated: true }, 'mcp:read')).toBe(true);
  });

  it('hasScope returns false for missing scope', () => {
    expect(hasScope({ userId: 'u', scopes: 'openid', audience: '', tokenExpiry: 0, authenticated: true }, 'mcp:read')).toBe(false);
  });

  it('hasScope returns false for undefined context', () => {
    expect(hasScope(undefined, 'mcp:read')).toBe(false);
  });

  it('hasAllScopes returns true when all present', () => {
    expect(hasAllScopes({ userId: 'u', scopes: 'openid mcp:read mcp:admin', audience: '', tokenExpiry: 0, authenticated: true }, ['mcp:read', 'mcp:admin'])).toBe(true);
  });

  it('hasAnyScope returns true when at least one present', () => {
    expect(hasAnyScope({ userId: 'u', scopes: 'openid mcp:read', audience: '', tokenExpiry: 0, authenticated: true }, ['mcp:read', 'mcp:admin'])).toBe(true);
  });
});
