/**
 * Tests for GopherAuthConfig (ConfigLoader FFI binding)
 *
 * These tests require the native library to be available.
 * Tests are skipped if the library cannot be loaded.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Check if native library is available before importing
let GopherAuthConfig: typeof import('../src/ffi/auth/config-loader').GopherAuthConfig;
let nativeAvailable = false;

try {
  const loader = require('../src/ffi/auth/loader');
  nativeAvailable = loader.loadLibrary();
  if (nativeAvailable) {
    GopherAuthConfig =
      require('../src/ffi/auth/config-loader').GopherAuthConfig;
  }
} catch {
  nativeAvailable = false;
}

const describeIfNative = nativeAvailable ? describe : describe.skip;

// Create a temp config file for testing
function createTempConfig(content: string): string {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(
    tmpDir,
    `gopher_config_test_${Date.now()}_${Math.random().toString(36).slice(2)}.config`
  );
  fs.writeFileSync(tmpFile, content);
  return tmpFile;
}

describeIfNative('GopherAuthConfig', () => {
  let tmpFile: string | null = null;

  afterEach(() => {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
      tmpFile = null;
    }
  });

  describe('loadFile', () => {
    it('should load config from file and read client_id', () => {
      tmpFile = createTempConfig(
        'client_id = my-test-client\n' +
          'client_secret = my-secret\n' +
          'auth_server_url = http://keycloak:8080/realms/test\n'
      );

      const config = GopherAuthConfig.loadFile(tmpFile);
      expect(config.getString('client_id')).toBe('my-test-client');
      config.destroy();
    });

    it('should derive jwks_uri from auth_server_url after validate', () => {
      tmpFile = createTempConfig(
        'client_id = cid\n' +
          'client_secret = cs\n' +
          'auth_server_url = http://kc:8080/realms/myrealm\n'
      );

      const config = GopherAuthConfig.loadFile(tmpFile);
      expect(config.getString('jwks_uri')).toBe(
        'http://kc:8080/realms/myrealm/protocol/openid-connect/certs'
      );
      expect(config.getString('issuer')).toBe(
        'http://kc:8080/realms/myrealm'
      );
      config.destroy();
    });

    it('should read port as integer', () => {
      tmpFile = createTempConfig(
        'client_id = cid\n' +
          'client_secret = cs\n' +
          'auth_server_url = http://kc:8080/realms/test\n' +
          'port = 9090\n'
      );

      const config = GopherAuthConfig.loadFile(tmpFile);
      expect(config.getInt('port')).toBe(9090);
      config.destroy();
    });

    it('should read auth_disabled as boolean', () => {
      tmpFile = createTempConfig('auth_disabled = true\n');

      const config = GopherAuthConfig.loadFile(tmpFile);
      expect(config.getBool('auth_disabled')).toBe(true);
      config.destroy();
    });

    it('should throw on missing file', () => {
      expect(() => {
        GopherAuthConfig.loadFile('/nonexistent/path/config.ini');
      }).toThrow();
    });
  });

  describe('loadFromPairs', () => {
    it('should load from inline key-value pairs', () => {
      const config = GopherAuthConfig.loadFromPairs({
        client_id: 'pair-client',
        client_secret: 'pair-secret',
        auth_server_url: 'http://kc:8080/realms/test',
      });

      expect(config.getString('client_id')).toBe('pair-client');
      expect(config.getString('jwks_uri')).toBe(
        'http://kc:8080/realms/test/protocol/openid-connect/certs'
      );
      config.destroy();
    });

    it('should work with auth_disabled', () => {
      const config = GopherAuthConfig.loadFromPairs({
        auth_disabled: 'true',
      });

      expect(config.getBool('auth_disabled')).toBe(true);
      config.destroy();
    });
  });

  describe('getExchangeIdps', () => {
    it('should return empty array when not set', () => {
      const config = GopherAuthConfig.loadFromPairs({
        auth_disabled: 'true',
      });
      expect(config.getExchangeIdps()).toEqual([]);
      config.destroy();
    });

    it('should parse comma-separated IDPs', () => {
      tmpFile = createTempConfig(
        'auth_disabled = true\n' + 'exchange_idps = google,github,azure\n'
      );

      const config = GopherAuthConfig.loadFile(tmpFile);
      expect(config.getExchangeIdps()).toEqual([
        'google',
        'github',
        'azure',
      ]);
      config.destroy();
    });
  });

  describe('destroy', () => {
    it('should free handle', () => {
      const config = GopherAuthConfig.loadFromPairs({
        auth_disabled: 'true',
      });
      config.destroy();
      expect(config.isDestroyed()).toBe(true);
    });

    it('should be safe to call twice', () => {
      const config = GopherAuthConfig.loadFromPairs({
        auth_disabled: 'true',
      });
      config.destroy();
      config.destroy(); // Should not throw
      expect(config.isDestroyed()).toBe(true);
    });

    it('should throw on getString after destroy', () => {
      const config = GopherAuthConfig.loadFromPairs({
        auth_disabled: 'true',
      });
      config.destroy();
      expect(() => config.getString('client_id')).toThrow(
        'GopherAuthConfig has been destroyed'
      );
    });
  });

  describe('defaults', () => {
    it('should have default port 3001', () => {
      const config = GopherAuthConfig.loadFromPairs({
        auth_disabled: 'true',
      });
      expect(config.getInt('port')).toBe(3001);
      config.destroy();
    });

    it('should have default host 0.0.0.0', () => {
      const config = GopherAuthConfig.loadFromPairs({
        auth_disabled: 'true',
      });
      expect(config.getString('host')).toBe('0.0.0.0');
      config.destroy();
    });
  });
});
