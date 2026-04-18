/**
 * Tests for gopherAuthAutoRefresh FFI binding
 */

let gopherAuthAutoRefresh: typeof import('../src/ffi/auth/auto-refresh').gopherAuthAutoRefresh;
let GopherAuthClient: typeof import('../src/ffi/auth/auth-client').GopherAuthClient;
let GopherOAuthClient: typeof import('../src/ffi/auth/oauth-client').GopherOAuthClient;
let GopherSessionManager: typeof import('../src/ffi/auth/session-manager').GopherSessionManager;
let nativeAvailable = false;

try {
  const loader = require('../src/ffi/auth/loader');
  nativeAvailable = loader.loadLibrary();
  if (nativeAvailable) {
    loader.authInit();
    gopherAuthAutoRefresh =
      require('../src/ffi/auth/auto-refresh').gopherAuthAutoRefresh;
    GopherAuthClient = require('../src/ffi/auth/auth-client').GopherAuthClient;
    GopherOAuthClient =
      require('../src/ffi/auth/oauth-client').GopherOAuthClient;
    GopherSessionManager =
      require('../src/ffi/auth/session-manager').GopherSessionManager;
  }
} catch {
  nativeAvailable = false;
}

const describeIfNative = nativeAvailable ? describe : describe.skip;

describeIfNative('gopherAuthAutoRefresh', () => {
  let authClient: InstanceType<typeof GopherAuthClient>;
  let oauthClient: InstanceType<typeof GopherOAuthClient>;
  let sessionMgr: InstanceType<typeof GopherSessionManager>;

  beforeEach(() => {
    authClient = new GopherAuthClient('http://kc/certs', 'http://kc');
    oauthClient = new GopherOAuthClient(
      'http://192.0.2.1:1/token',
      'cid',
      'cs',
      1
    );
    sessionMgr = new GopherSessionManager(300);
  });

  afterEach(() => {
    authClient.destroy();
    oauthClient.destroy();
    sessionMgr.destroy();
  });

  it('should return error for unknown session', () => {
    const result = gopherAuthAutoRefresh(
      authClient,
      oauthClient,
      sessionMgr,
      'nonexistent'
    );
    expect(result.valid).toBe(false);
    expect(result.errorCode).not.toBe(0);
  });

  it('should return error for session without refresh token', () => {
    // Store a token with no refresh token (empty string)
    sessionMgr.storeToken('sess1', 'invalid.jwt.token', '', -10);

    const result = gopherAuthAutoRefresh(
      authClient,
      oauthClient,
      sessionMgr,
      'sess1'
    );
    // Token validation will fail (invalid JWT), and no refresh token
    expect(result.valid).toBe(false);
  });

  it('should return error for expired token + failed refresh', () => {
    sessionMgr.storeToken('sess1', 'invalid.jwt', 'refresh-tok', 3600);

    const result = gopherAuthAutoRefresh(
      authClient,
      oauthClient,
      sessionMgr,
      'sess1'
    );
    // Token validation fails (invalid JWT format), refresh to unreachable server also fails
    expect(result.valid).toBe(false);
  });

  it('should preserve session after failed auto-refresh', () => {
    sessionMgr.storeToken('sess1', 'my-token', 'my-refresh', 3600);

    gopherAuthAutoRefresh(authClient, oauthClient, sessionMgr, 'sess1');

    // Session should still exist
    expect(sessionMgr.getAccessToken('sess1')).toBe('my-token');
  });
});
