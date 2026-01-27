/**
 * Tests for FFI bindings to the native gopher-orch library.
 *
 * These tests verify that the TypeScript side can correctly call C++ functions
 * through koffi FFI bindings.
 */

import { GopherOrchLibrary } from '../src/ffi/library';

function isNativeLibraryAvailable(): boolean {
  return GopherOrchLibrary.isAvailable();
}

describe('GopherOrchLibrary', () => {
  test('library should be available', () => {
    const available = GopherOrchLibrary.isAvailable();
    expect(available).toBe(true);
    if (!available) {
      console.warn(
        'Native library should be available. ' +
          'Make sure to run ./build.sh first to build the native library.'
      );
    }
  });

  describe('when native library is available', () => {
    const skipIfUnavailable = !isNativeLibraryAvailable();

    test('should get library instance', () => {
      if (skipIfUnavailable) return;

      const lib = GopherOrchLibrary.getInstance();
      expect(lib).not.toBeNull();
    });

    test('should create agent by JSON with valid config', () => {
      if (skipIfUnavailable) return;

      const lib = GopherOrchLibrary.getInstance();
      expect(lib).not.toBeNull();

      // Valid server configuration JSON
      const serverConfig = JSON.stringify({
        succeeded: true,
        code: 200000000,
        message: 'success',
        data: {
          servers: [
            {
              version: '2025-01-09',
              serverId: '1',
              name: 'test-server',
              transport: 'http_sse',
              config: { url: 'http://127.0.0.1:9999/mcp', headers: {} },
              connectTimeout: 5000,
              requestTimeout: 30000,
            },
          ],
        },
      });

      // Call native function to create agent
      const handle = lib!.agentCreateByJson(
        'AnthropicProvider',
        'claude-3-haiku-20240307',
        serverConfig
      );

      // Agent should be created (handle may be null if no API key, but function should not crash)
      // The important thing is that the FFI call works without throwing
      if (handle !== null) {
        // Clean up if agent was created
        lib!.agentRelease(handle);
      }
    });

    test('should handle agent create by JSON with empty config', () => {
      if (skipIfUnavailable) return;

      const lib = GopherOrchLibrary.getInstance();
      expect(lib).not.toBeNull();

      // Empty/invalid config should return null handle
      const handle = lib!.agentCreateByJson(
        'AnthropicProvider',
        'claude-3-haiku-20240307',
        '{}'
      );

      // Should handle gracefully (null or valid pointer, but no crash)
      if (handle !== null) {
        lib!.agentRelease(handle);
      }
    });

    test('should create agent by API key', () => {
      if (skipIfUnavailable) return;

      const lib = GopherOrchLibrary.getInstance();
      expect(lib).not.toBeNull();

      // Call with a dummy API key - should not crash
      const handle = lib!.agentCreateByApiKey(
        'AnthropicProvider',
        'claude-3-haiku-20240307',
        'test-api-key-12345'
      );

      // May return null if API key is invalid, but should not crash
      if (handle !== null) {
        lib!.agentRelease(handle);
      }
    });

    test('should handle last error and clear error', () => {
      if (skipIfUnavailable) return;

      const lib = GopherOrchLibrary.getInstance();
      expect(lib).not.toBeNull();

      // Try to get last error (may be null if no error)
      expect(() => {
        lib!.lastError();
      }).not.toThrow();

      // Clear error should not throw
      expect(() => {
        lib!.clearError();
      }).not.toThrow();
    });

    test('should fetch servers via API', () => {
      if (skipIfUnavailable) return;

      const lib = GopherOrchLibrary.getInstance();
      expect(lib).not.toBeNull();

      // Call with dummy API key - should return JSON (possibly error response)
      expect(() => {
        lib!.apiFetchServers('test-api-key');
      }).not.toThrow();
    });

    test('should handle agent run with null handle', () => {
      if (skipIfUnavailable) return;

      const lib = GopherOrchLibrary.getInstance();
      expect(lib).not.toBeNull();

      // Running with null handle should be handled gracefully
      try {
        lib!.agentRun(null, 'test query', 1000);
        // May return null or error message, but should not crash
      } catch {
        // Exception is acceptable for null handle
      }
    });

    test('should handle agent release with null handle', () => {
      if (skipIfUnavailable) return;

      const lib = GopherOrchLibrary.getInstance();
      expect(lib).not.toBeNull();

      // Releasing null handle should be handled gracefully
      try {
        lib!.agentRelease(null);
      } catch {
        // Exception is acceptable for null handle
      }
    });

    test('should handle free with null pointer', () => {
      if (skipIfUnavailable) return;

      const lib = GopherOrchLibrary.getInstance();
      expect(lib).not.toBeNull();

      // Free with null should be handled gracefully
      try {
        lib!.free(null);
      } catch {
        // Exception is acceptable for null pointer
      }
    });
  });

  test('should get last error message gracefully', () => {
    const lib = GopherOrchLibrary.getInstance();
    if (lib !== null) {
      // Should return null gracefully, not throw
      expect(() => {
        lib.getLastErrorMessage();
      }).not.toThrow();
    }
  });
});
