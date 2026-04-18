/**
 * Tests for IDP and multi-scope validation FFI bindings
 */

let gopherAuthValidateIdp: typeof import('../src/ffi/auth/loader').gopherAuthValidateIdp;
let gopherAuthValidateAllScopes: typeof import('../src/ffi/auth/loader').gopherAuthValidateAllScopes;
let gopherAuthValidateAnyScopes: typeof import('../src/ffi/auth/loader').gopherAuthValidateAnyScopes;
let nativeAvailable = false;

try {
  const loader = require('../src/ffi/auth/loader');
  nativeAvailable = loader.loadLibrary();
  if (nativeAvailable) {
    loader.authInit();
    gopherAuthValidateIdp = loader.gopherAuthValidateIdp;
    gopherAuthValidateAllScopes = loader.gopherAuthValidateAllScopes;
    gopherAuthValidateAnyScopes = loader.gopherAuthValidateAnyScopes;
  }
} catch {
  nativeAvailable = false;
}

const describeIfNative = nativeAvailable ? describe : describe.skip;

describeIfNative('gopherAuthValidateIdp', () => {
  it('should return true for valid IDP in whitelist', () => {
    expect(gopherAuthValidateIdp('google,github,azure', 'github')).toBe(true);
  });

  it('should return false for IDP not in whitelist', () => {
    expect(gopherAuthValidateIdp('google,github', 'azure')).toBe(false);
  });

  it('should return false for empty whitelist', () => {
    expect(gopherAuthValidateIdp('', 'google')).toBe(false);
  });

  it('should handle whitespace in whitelist', () => {
    expect(gopherAuthValidateIdp(' google , github ', 'google')).toBe(true);
  });
});

describeIfNative('gopherAuthValidateAllScopes', () => {
  it('should return true when all required scopes present', () => {
    expect(
      gopherAuthValidateAllScopes(
        'openid mcp:read mcp:admin',
        'mcp:read mcp:admin'
      )
    ).toBe(true);
  });

  it('should return false when one required scope missing', () => {
    expect(
      gopherAuthValidateAllScopes('openid mcp:read', 'mcp:read mcp:admin')
    ).toBe(false);
  });

  it('should return true for empty required scopes', () => {
    expect(gopherAuthValidateAllScopes('openid', '')).toBe(true);
  });

  it('should return false for empty available scopes with requirements', () => {
    expect(gopherAuthValidateAllScopes('', 'mcp:read')).toBe(false);
  });
});

describeIfNative('gopherAuthValidateAnyScopes', () => {
  it('should return true when at least one required scope present', () => {
    expect(
      gopherAuthValidateAnyScopes('openid mcp:read', 'mcp:read mcp:admin')
    ).toBe(true);
  });

  it('should return false when no required scopes present', () => {
    expect(gopherAuthValidateAnyScopes('openid', 'mcp:read mcp:admin')).toBe(
      false
    );
  });

  it('should return true for empty required scopes', () => {
    expect(gopherAuthValidateAnyScopes('openid', '')).toBe(true);
  });

  it('should return false for empty available scopes with requirements', () => {
    expect(gopherAuthValidateAnyScopes('', 'mcp:read')).toBe(false);
  });
});
