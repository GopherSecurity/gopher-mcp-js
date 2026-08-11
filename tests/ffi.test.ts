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
    // In CI environments without native library, skip this assertion
    if (process.env['CI'] && !available) {
      console.log('Skipping native library check in CI environment');
      return;
    }
    expect(available).toBe(true);
    if (!available && process.env['DEBUG']) {
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

    test('should handle agent run with null handle', () => {
      if (skipIfUnavailable) return;

      const lib = GopherOrchLibrary.getInstance();
      expect(lib).not.toBeNull();

      // Running with null handle should be handled gracefully
      expect(
        lib!.agentRun(
          null as unknown as import('../src/ffi/library').GopherOrchHandle,
          'test query',
          1000
        )
      ).toBeNull();
    });

    test('should handle agent release with null handle', () => {
      if (skipIfUnavailable) return;

      const lib = GopherOrchLibrary.getInstance();
      expect(lib).not.toBeNull();

      expect(() => {
        lib!.agentRelease(
          null as unknown as import('../src/ffi/library').GopherOrchHandle
        );
      }).not.toThrow();
    });

    test('should handle free with null pointer', () => {
      if (skipIfUnavailable) return;

      const lib = GopherOrchLibrary.getInstance();
      expect(lib).not.toBeNull();

      expect(() => {
        lib!.free(null);
      }).not.toThrow();
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
