/**
 * Tests for GopherOAuthClient FFI binding
 */

let GopherOAuthClient: typeof import('../src/ffi/auth/oauth-client').GopherOAuthClient;
let nativeAvailable = false;

try {
  const loader = require('../src/ffi/auth/loader');
  nativeAvailable = loader.loadLibrary();
  if (nativeAvailable) {
    const mod = require('../src/ffi/auth/oauth-client');
    GopherOAuthClient = mod.GopherOAuthClient;
    // Init auth library
    loader.authInit();
  }
} catch {
  nativeAvailable = false;
}

const describeIfNative = nativeAvailable ? describe : describe.skip;

describeIfNative('GopherOAuthClient', () => {
  it('should create client with all parameters', () => {
    const client = new GopherOAuthClient(
      'http://kc:8080/token',
      'my-client',
      'my-secret',
      30
    );
    expect(client.isDestroyed()).toBe(false);
    client.destroy();
  });

  it('should create client without secret (public client)', () => {
    const client = new GopherOAuthClient(
      'http://kc:8080/token',
      'my-client',
      undefined,
      30
    );
    expect(client.isDestroyed()).toBe(false);
    client.destroy();
  });

  it('should return error TokenResponse for unreachable server', () => {
    const client = new GopherOAuthClient(
      'http://192.0.2.1:1/token',
      'cid',
      'cs',
      1
    );

    const resp = client.exchangeCode('code123', 'http://localhost/cb');
    expect(resp.success).toBe(false);
    expect(resp.accessToken).toBe('');
    client.destroy();
  });

  it('should return error for refresh with unreachable server', () => {
    const client = new GopherOAuthClient(
      'http://192.0.2.1:1/token',
      'cid',
      'cs',
      1
    );

    const resp = client.refreshToken('refresh-tok');
    expect(resp.success).toBe(false);
    client.destroy();
  });

  it('should return error for tokenExchange with unreachable server', () => {
    const client = new GopherOAuthClient(
      'http://192.0.2.1:1/token',
      'cid',
      'cs',
      1
    );

    const resp = client.tokenExchange('subject-tok', 'google');
    expect(resp.success).toBe(false);
    client.destroy();
  });

  it('should destroy and mark as destroyed', () => {
    const client = new GopherOAuthClient(
      'http://kc:8080/token',
      'cid',
      'cs',
      5
    );
    client.destroy();
    expect(client.isDestroyed()).toBe(true);
  });

  it('should throw on call after destroy', () => {
    const client = new GopherOAuthClient(
      'http://kc:8080/token',
      'cid',
      'cs',
      5
    );
    client.destroy();
    expect(() => client.exchangeCode('code', 'http://cb')).toThrow(
      'GopherOAuthClient has been destroyed'
    );
  });

  it('should be safe to call destroy twice', () => {
    const client = new GopherOAuthClient(
      'http://kc:8080/token',
      'cid',
      'cs',
      5
    );
    client.destroy();
    client.destroy();
    expect(client.isDestroyed()).toBe(true);
  });
});
