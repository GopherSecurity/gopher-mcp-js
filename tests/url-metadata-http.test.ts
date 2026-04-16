/**
 * Tests for URL Utils, Metadata Builders, and HTTP Parsing FFI bindings
 */

let nativeAvailable = false;

try {
  const loader = require('../src/ffi/auth/loader');
  nativeAvailable = loader.loadLibrary();
  if (nativeAvailable) {
    loader.authInit();
  }
} catch {
  nativeAvailable = false;
}

const describeIfNative = nativeAvailable ? describe : describe.skip;

function loader() {
  return require('../src/ffi/auth/loader');
}

describeIfNative('URL Utils', () => {
  it('should encode special characters', () => {
    expect(loader().gopherAuthUrlEncode('hello world&foo=bar'))
      .toBe('hello%20world%26foo%3Dbar');
  });

  it('should decode percent-encoded string', () => {
    expect(loader().gopherAuthUrlDecode('hello%20world%26foo%3Dbar'))
      .toBe('hello world&foo=bar');
  });

  it('should round-trip encode/decode', () => {
    const original = 'urn:ietf:params:oauth:grant-type:token-exchange';
    const encoded = loader().gopherAuthUrlEncode(original);
    expect(loader().gopherAuthUrlDecode(encoded)).toBe(original);
  });

  it('should preserve unreserved characters', () => {
    expect(loader().gopherAuthUrlEncode('a-b_c.d~e')).toBe('a-b_c.d~e');
  });
});

describeIfNative('Metadata Builders', () => {
  it('should build protected resource metadata', () => {
    const meta = loader().gopherAuthBuildProtectedResourceMetadata(
      'https://server.com/mcp', 'https://server.com', 'openid mcp:read'
    );
    expect(meta.resource).toBe('https://server.com/mcp');
    expect(meta.authorization_servers).toContain('https://server.com');
    expect(meta.scopes_supported).toContain('openid');
    expect(meta.scopes_supported).toContain('mcp:read');
    expect(meta.bearer_methods_supported).toContain('header');
  });

  it('should build OAuth server metadata with all endpoints', () => {
    const meta = loader().gopherAuthBuildOAuthServerMetadata(
      'https://kc/realms/test', 'https://kc/auth', 'https://kc/token',
      'https://server/register', 'https://kc/certs', 'openid email'
    );
    expect(meta.issuer).toBe('https://kc/realms/test');
    expect(meta.authorization_endpoint).toBe('https://kc/auth');
    expect(meta.token_endpoint).toBe('https://kc/token');
    expect(meta.registration_endpoint).toBe('https://server/register');
    expect(meta.jwks_uri).toBe('https://kc/certs');
    expect(meta.response_types_supported).toContain('code');
    expect(meta.code_challenge_methods_supported).toContain('S256');
  });

  it('should build OIDC discovery metadata', () => {
    const meta = loader().gopherAuthBuildOidcDiscoveryMetadata(
      'https://kc/realms/test', 'https://kc/auth', 'https://kc/token',
      'https://kc/certs', 'https://server/register', 'openid',
      'https://kc/userinfo', 'https://kc/logout'
    );
    expect(meta.issuer).toBe('https://kc/realms/test');
    expect(meta.userinfo_endpoint).toBe('https://kc/userinfo');
    expect(meta.end_session_endpoint).toBe('https://kc/logout');
    expect(meta.subject_types_supported).toContain('public');
    expect(meta.id_token_signing_alg_values_supported).toContain('RS256');
  });

  it('should omit optional fields when not provided', () => {
    const meta = loader().gopherAuthBuildOAuthServerMetadata(
      'https://iss', 'https://auth', 'https://token'
    );
    expect(meta.registration_endpoint).toBeUndefined();
    expect(meta.jwks_uri).toBeUndefined();
  });
});

describeIfNative('HTTP Parsing', () => {
  it('should extract bearer token from Authorization header', () => {
    const http = 'GET /mcp HTTP/1.1\r\nAuthorization: Bearer my-jwt-token\r\n\r\n';
    expect(loader().gopherAuthExtractBearerToken(http)).toBe('my-jwt-token');
  });

  it('should extract bearer from query parameter', () => {
    const http = 'GET /mcp?access_token=query-tok HTTP/1.1\r\n\r\n';
    expect(loader().gopherAuthExtractBearerToken(http)).toBe('query-tok');
  });

  it('should return null when no token found', () => {
    const http = 'GET /mcp HTTP/1.1\r\nHost: localhost\r\n\r\n';
    expect(loader().gopherAuthExtractBearerToken(http)).toBeNull();
  });

  it('should extract HTTP method', () => {
    expect(loader().gopherAuthExtractMethod('POST /mcp HTTP/1.1\r\n')).toBe('POST');
    expect(loader().gopherAuthExtractMethod('GET /health HTTP/1.1\r\n')).toBe('GET');
  });

  it('should extract path without query string', () => {
    expect(loader().gopherAuthExtractPath('GET /authorize?client_id=x HTTP/1.1\r\n'))
      .toBe('/authorize');
    expect(loader().gopherAuthExtractPath('GET /.well-known/oauth-protected-resource HTTP/1.1\r\n'))
      .toBe('/.well-known/oauth-protected-resource');
  });
});
