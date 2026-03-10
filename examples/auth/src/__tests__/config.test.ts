import fs from 'fs';
import path from 'path';
import {
  parseConfigFile,
  loadConfigFromFile,
  buildConfig,
  createDefaultConfig,
  AuthServerConfig,
} from '../config';

describe('parseConfigFile', () => {
  it('should parse key=value pairs', () => {
    const content = `
host=localhost
port=3001
server_url=http://localhost:3001
`;
    const result = parseConfigFile(content);
    expect(result).toEqual({
      host: 'localhost',
      port: '3001',
      server_url: 'http://localhost:3001',
    });
  });

  it('should skip empty lines', () => {
    const content = `
host=localhost

port=3001

`;
    const result = parseConfigFile(content);
    expect(result).toEqual({
      host: 'localhost',
      port: '3001',
    });
  });

  it('should skip comment lines starting with #', () => {
    const content = `
# This is a comment
host=localhost
# Another comment
port=3001
`;
    const result = parseConfigFile(content);
    expect(result).toEqual({
      host: 'localhost',
      port: '3001',
    });
  });

  it('should handle values containing = characters', () => {
    const content = `
url=http://example.com?foo=bar&baz=qux
`;
    const result = parseConfigFile(content);
    expect(result.url).toBe('http://example.com?foo=bar&baz=qux');
  });

  it('should trim whitespace from keys and values', () => {
    const content = `
  host  =  localhost
  port=3001
`;
    const result = parseConfigFile(content);
    expect(result.host).toBe('localhost');
    expect(result.port).toBe('3001');
  });

  it('should skip lines without = separator', () => {
    const content = `
host=localhost
invalid line without separator
port=3001
`;
    const result = parseConfigFile(content);
    expect(result).toEqual({
      host: 'localhost',
      port: '3001',
    });
  });

  it('should handle empty values', () => {
    const content = `
host=localhost
empty_value=
port=3001
`;
    const result = parseConfigFile(content);
    expect(result.empty_value).toBe('');
  });

  it('should return empty object for empty content', () => {
    const result = parseConfigFile('');
    expect(result).toEqual({});
  });

  it('should return empty object for content with only comments', () => {
    const content = `
# Comment 1
# Comment 2
`;
    const result = parseConfigFile(content);
    expect(result).toEqual({});
  });
});

describe('buildConfig', () => {
  it('should build config with default values', () => {
    const configMap = {
      auth_disabled: 'true',
    };
    const config = buildConfig(configMap);

    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(3001);
    expect(config.serverUrl).toBe('http://localhost:3001');
    expect(config.authDisabled).toBe(true);
  });

  it('should use provided values', () => {
    const configMap = {
      host: '127.0.0.1',
      port: '8080',
      server_url: 'http://myserver.com',
      auth_disabled: 'true',
    };
    const config = buildConfig(configMap);

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(8080);
    expect(config.serverUrl).toBe('http://myserver.com');
  });

  it('should derive server_url from port if not provided', () => {
    const configMap = {
      port: '9000',
      auth_disabled: 'true',
    };
    const config = buildConfig(configMap);

    expect(config.serverUrl).toBe('http://localhost:9000');
  });

  it('should derive OAuth endpoints from auth_server_url', () => {
    const configMap = {
      auth_server_url: 'https://keycloak.example.com/realms/mcp',
      client_id: 'test-client',
      client_secret: 'test-secret',
    };
    const config = buildConfig(configMap);

    expect(config.jwksUri).toBe(
      'https://keycloak.example.com/realms/mcp/protocol/openid-connect/certs'
    );
    expect(config.tokenEndpoint).toBe(
      'https://keycloak.example.com/realms/mcp/protocol/openid-connect/token'
    );
    expect(config.issuer).toBe('https://keycloak.example.com/realms/mcp');
    expect(config.oauthAuthorizeUrl).toBe(
      'https://keycloak.example.com/realms/mcp/protocol/openid-connect/auth'
    );
    expect(config.oauthTokenUrl).toBe(
      'https://keycloak.example.com/realms/mcp/protocol/openid-connect/token'
    );
  });

  it('should not override explicitly set endpoints', () => {
    const configMap = {
      auth_server_url: 'https://keycloak.example.com/realms/mcp',
      jwks_uri: 'https://custom.example.com/jwks',
      issuer: 'https://custom-issuer.example.com',
      client_id: 'test-client',
      client_secret: 'test-secret',
    };
    const config = buildConfig(configMap);

    expect(config.jwksUri).toBe('https://custom.example.com/jwks');
    expect(config.issuer).toBe('https://custom-issuer.example.com');
  });

  it('should parse cache settings', () => {
    const configMap = {
      auth_disabled: 'true',
      jwks_cache_duration: '7200',
      jwks_auto_refresh: 'false',
      request_timeout: '60',
    };
    const config = buildConfig(configMap);

    expect(config.jwksCacheDuration).toBe(7200);
    expect(config.jwksAutoRefresh).toBe(false);
    expect(config.requestTimeout).toBe(60);
  });

  it('should default jwks_auto_refresh to true', () => {
    const configMap = {
      auth_disabled: 'true',
    };
    const config = buildConfig(configMap);

    expect(config.jwksAutoRefresh).toBe(true);
  });

  it('should parse allowed_scopes', () => {
    const configMap = {
      auth_disabled: 'true',
      allowed_scopes: 'openid custom:scope',
    };
    const config = buildConfig(configMap);

    expect(config.allowedScopes).toBe('openid custom:scope');
  });

  it('should throw error when auth enabled and client_id missing', () => {
    const configMap = {
      auth_server_url: 'https://keycloak.example.com',
      client_secret: 'secret',
    };

    expect(() => buildConfig(configMap)).toThrow('client_id is required');
  });

  it('should throw error when auth enabled and client_secret missing', () => {
    const configMap = {
      auth_server_url: 'https://keycloak.example.com',
      client_id: 'client',
    };

    expect(() => buildConfig(configMap)).toThrow('client_secret is required');
  });

  it('should throw error when auth enabled and no jwks_uri or auth_server_url', () => {
    const configMap = {
      client_id: 'client',
      client_secret: 'secret',
    };

    expect(() => buildConfig(configMap)).toThrow(
      'jwks_uri or auth_server_url is required'
    );
  });

  it('should not throw when auth is disabled', () => {
    const configMap = {
      auth_disabled: 'true',
    };

    expect(() => buildConfig(configMap)).not.toThrow();
  });
});

describe('loadConfigFromFile', () => {
  const testConfigPath = path.join(__dirname, 'test-config.tmp');

  afterEach(() => {
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  });

  it('should load and parse config from file', () => {
    const content = `
host=127.0.0.1
port=8080
auth_disabled=true
`;
    fs.writeFileSync(testConfigPath, content);

    const config = loadConfigFromFile(testConfigPath);

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(8080);
    expect(config.authDisabled).toBe(true);
  });

  it('should throw error if file does not exist', () => {
    expect(() => loadConfigFromFile('/nonexistent/path/config')).toThrow(
      'Config file not found'
    );
  });
});

describe('createDefaultConfig', () => {
  it('should create config with all defaults', () => {
    const config = createDefaultConfig();

    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(3001);
    expect(config.serverUrl).toBe('http://localhost:3001');
    expect(config.authDisabled).toBe(true);
    expect(config.allowedScopes).toBe(
      'openid profile email mcp:read mcp:admin'
    );
  });

  it('should allow overriding specific fields', () => {
    const config = createDefaultConfig({
      port: 9000,
      host: '192.168.1.1',
    });

    expect(config.port).toBe(9000);
    expect(config.host).toBe('192.168.1.1');
    expect(config.serverUrl).toBe('http://localhost:3001'); // not auto-derived
  });

  it('should allow enabling auth with overrides', () => {
    const config = createDefaultConfig({
      authDisabled: false,
      clientId: 'test',
      clientSecret: 'secret',
      jwksUri: 'https://example.com/jwks',
    });

    expect(config.authDisabled).toBe(false);
    expect(config.clientId).toBe('test');
  });
});
