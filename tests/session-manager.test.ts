/**
 * Tests for GopherSessionManager FFI binding
 */

let GopherSessionManager: typeof import('../src/ffi/auth/session-manager').GopherSessionManager;
let nativeAvailable = false;

try {
  const loader = require('../src/ffi/auth/loader');
  nativeAvailable = loader.loadLibrary();
  if (nativeAvailable) {
    GopherSessionManager = require('../src/ffi/auth/session-manager').GopherSessionManager;
    loader.authInit();
  }
} catch {
  nativeAvailable = false;
}

const describeIfNative = nativeAvailable ? describe : describe.skip;

describeIfNative('GopherSessionManager', () => {
  it('should store and retrieve token', () => {
    const mgr = new GopherSessionManager(300);
    mgr.storeToken('sess1', 'access-tok', 'refresh-tok', 3600);
    expect(mgr.getAccessToken('sess1')).toBe('access-tok');
    expect(mgr.getRefreshToken('sess1')).toBe('refresh-tok');
    mgr.destroy();
  });

  it('should return true for hasValidToken on fresh token', () => {
    const mgr = new GopherSessionManager(300);
    mgr.storeToken('sess1', 'tok', 'ref', 3600);
    expect(mgr.hasValidToken('sess1')).toBe(true);
    mgr.destroy();
  });

  it('should return false for hasValidToken on expired token', () => {
    const mgr = new GopherSessionManager(300);
    // Store with negative expiry (already expired beyond 5s buffer)
    mgr.storeToken('sess1', 'tok', 'ref', -10);
    expect(mgr.hasValidToken('sess1')).toBe(false);
    mgr.destroy();
  });

  it('should return null for unknown session', () => {
    const mgr = new GopherSessionManager(300);
    expect(mgr.getAccessToken('nonexistent')).toBeNull();
    expect(mgr.getRefreshToken('nonexistent')).toBeNull();
    mgr.destroy();
  });

  it('should generate 32-char hex session ID', () => {
    const id = GopherSessionManager.generateSessionId();
    expect(id).toHaveLength(32);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('should generate unique session IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      ids.add(GopherSessionManager.generateSessionId());
    }
    expect(ids.size).toBe(10);
  });

  it('should cleanup expired sessions', () => {
    const mgr = new GopherSessionManager(1); // 1 second timeout
    mgr.storeToken('sess1', 'tok1', 'ref1', 3600);

    // Wait for inactivity timeout
    const start = Date.now();
    while (Date.now() - start < 2100) {
      // busy wait
    }

    mgr.storeToken('sess2', 'tok2', 'ref2', 3600); // fresh session
    mgr.cleanup();

    expect(mgr.getAccessToken('sess1')).toBeNull(); // expired
    expect(mgr.getAccessToken('sess2')).toBe('tok2'); // preserved
    mgr.destroy();
  });

  it('should destroy and mark as destroyed', () => {
    const mgr = new GopherSessionManager(300);
    mgr.destroy();
    expect(mgr.isDestroyed()).toBe(true);
  });

  it('should be safe to call destroy twice', () => {
    const mgr = new GopherSessionManager(300);
    mgr.destroy();
    mgr.destroy();
    expect(mgr.isDestroyed()).toBe(true);
  });
});
