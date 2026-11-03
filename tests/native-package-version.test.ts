import packageJson from '../package.json';
import packageLock from '../package-lock.json';
import {
  REQUIRED_MCP_OAUTH_NATIVE_SYMBOLS,
  REQUIRED_OAUTH_NATIVE_PACKAGE_VERSION,
  createMissingOAuthNativeSymbolError,
} from '../src/ffi/auth/loader';

const expectedNativePackages = [
  '@gopher.security/gopher-orch-darwin-arm64',
  '@gopher.security/gopher-orch-darwin-x64',
  '@gopher.security/gopher-orch-linux-arm64',
  '@gopher.security/gopher-orch-linux-x64',
  '@gopher.security/gopher-orch-win32-arm64',
  '@gopher.security/gopher-orch-win32-x64',
] as const;

type LockPackage = {
  optionalDependencies?: Record<string, string>;
};

describe('native gopher-orch package pin', () => {
  test('keeps every platform package pinned to the required OAuth ABI version', () => {
    const optionalDependencies = packageJson.optionalDependencies as Record<
      string,
      string
    >;
    const lockRoot = packageLock.packages[''] as LockPackage;

    expect(Object.keys(optionalDependencies).sort()).toEqual([
      ...expectedNativePackages,
    ].sort());
    expect(Object.keys(lockRoot.optionalDependencies ?? {}).sort()).toEqual([
      ...expectedNativePackages,
    ].sort());

    for (const packageName of expectedNativePackages) {
      expect(optionalDependencies[packageName]).toBe(
        REQUIRED_OAUTH_NATIVE_PACKAGE_VERSION
      );
      expect(lockRoot.optionalDependencies?.[packageName]).toBe(
        REQUIRED_OAUTH_NATIVE_PACKAGE_VERSION
      );
    }
  });

  test('reports missing OAuth native symbols with package guidance', () => {
    const error = createMissingOAuthNativeSymbolError(
      REQUIRED_MCP_OAUTH_NATIVE_SYMBOLS[0],
      new Error('symbol not found')
    );

    expect(error.message).toContain(REQUIRED_MCP_OAUTH_NATIVE_SYMBOLS[0]);
    expect(error.message).toContain('@gopher.security/gopher-orch-*');
    expect(error.message).toContain(REQUIRED_OAUTH_NATIVE_PACKAGE_VERSION);
    expect(error.message).toContain('symbol not found');
  });
});
