/**
 * GopherSessionManager - FFI wrapper for per-client session management
 *
 * Thread-safe session manager with OAuth token storage, expiry tracking,
 * and secure session ID generation.
 */

import { loadLibrary, isLibraryLoaded, getRawFunctions } from './loader';

export class GopherSessionManager {
  private handle: unknown = null;
  private destroyed = false;

  constructor(timeoutSeconds: number = 300) {
    if (!isLibraryLoaded()) {
      loadLibrary();
    }

    const fns = getRawFunctions();
    if (!fns.sessionManagerCreate) {
      throw new Error('Session manager functions not available');
    }

    const out: unknown[] = [null];
    const result = fns.sessionManagerCreate(out, timeoutSeconds) as number;
    if (result !== 0 || !out[0]) {
      throw new Error(`Failed to create session manager: error code ${result}`);
    }
    this.handle = out[0];
  }

  storeToken(
    sessionId: string,
    accessToken: string,
    refreshToken: string,
    expiresIn: number
  ): void {
    this.ensureNotDestroyed();
    const fns = getRawFunctions();
    fns.sessionStoreToken?.(
      this.handle,
      sessionId,
      accessToken,
      refreshToken,
      expiresIn
    );
  }

  getAccessToken(sessionId: string): string | null {
    this.ensureNotDestroyed();
    const fns = getRawFunctions();
    if (!fns.sessionGetAccessToken) return null;

    const out: (string | null)[] = [null];
    const result = fns.sessionGetAccessToken(this.handle, sessionId, out) as number;
    if (result !== 0) return null;
    return out[0] ?? null;
  }

  getRefreshToken(sessionId: string): string | null {
    this.ensureNotDestroyed();
    const fns = getRawFunctions();
    if (!fns.sessionGetRefreshToken) return null;

    const out: (string | null)[] = [null];
    const result = fns.sessionGetRefreshToken(this.handle, sessionId, out) as number;
    if (result !== 0) return null;
    return out[0] ?? null;
  }

  hasValidToken(sessionId: string): boolean {
    this.ensureNotDestroyed();
    const fns = getRawFunctions();
    if (!fns.sessionHasValidToken) return false;

    const out: boolean[] = [false];
    const result = fns.sessionHasValidToken(this.handle, sessionId, out) as number;
    if (result !== 0) return false;
    return out[0] ?? false;
  }

  cleanup(): void {
    this.ensureNotDestroyed();
    const fns = getRawFunctions();
    fns.sessionCleanup?.(this.handle);
  }

  static generateSessionId(): string {
    if (!isLibraryLoaded()) {
      loadLibrary();
    }

    const fns = getRawFunctions();
    if (!fns.sessionGenerateId) {
      throw new Error('Function not available');
    }

    const out: (string | null)[] = [null];
    const result = fns.sessionGenerateId(out) as number;
    if (result !== 0 || !out[0]) {
      throw new Error('Failed to generate session ID');
    }
    return out[0];
  }

  destroy(): void {
    if (this.destroyed || !this.handle) return;
    const fns = getRawFunctions();
    fns.sessionManagerDestroy?.(this.handle);
    this.handle = null;
    this.destroyed = true;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  getHandle(): unknown {
    this.ensureNotDestroyed();
    return this.handle;
  }

  private ensureNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error('GopherSessionManager has been destroyed');
    }
  }
}
