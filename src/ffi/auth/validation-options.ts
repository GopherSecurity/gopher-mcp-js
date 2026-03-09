/**
 * ValidationOptions - Token validation configuration
 *
 * Provides a fluent API for configuring JWT token validation options.
 */

import { loadLibrary, isLibraryLoaded, getAuthFunctions } from './loader';

/**
 * ValidationOptions - Configures token validation behavior
 *
 * Use the fluent API to configure validation options:
 * ```typescript
 * const options = new ValidationOptions()
 *   .setScopes('mcp:read mcp:write')
 *   .setAudience('my-api')
 *   .setClockSkew(30);
 * ```
 */
export class ValidationOptions {
  private handle: unknown = null;
  private destroyed = false;

  /**
   * Create new ValidationOptions
   *
   * @throws Error if options creation fails
   */
  constructor() {
    if (!isLibraryLoaded()) {
      loadLibrary();
    }

    const fns = getAuthFunctions();
    if (!fns.optionsCreate) {
      throw new Error('Auth library not properly loaded');
    }

    this.handle = fns.optionsCreate();
    if (!this.handle) {
      throw new Error('Failed to create validation options');
    }
  }

  /**
   * Set required scopes for validation
   *
   * @param scopes - Space-separated list of required scopes
   * @returns this for method chaining
   */
  setScopes(scopes: string): this {
    this.ensureNotDestroyed();

    const fns = getAuthFunctions();
    if (fns.optionsSetScopes) {
      fns.optionsSetScopes(this.handle, scopes);
    }

    return this;
  }

  /**
   * Set required audience for validation
   *
   * @param audience - Expected audience claim value
   * @returns this for method chaining
   */
  setAudience(audience: string): this {
    this.ensureNotDestroyed();

    const fns = getAuthFunctions();
    if (fns.optionsSetAudience) {
      fns.optionsSetAudience(this.handle, audience);
    }

    return this;
  }

  /**
   * Set clock skew tolerance for expiration validation
   *
   * @param seconds - Number of seconds of clock skew to allow
   * @returns this for method chaining
   */
  setClockSkew(seconds: number): this {
    this.ensureNotDestroyed();

    const fns = getAuthFunctions();
    if (fns.optionsSetClockSkew) {
      fns.optionsSetClockSkew(this.handle, seconds);
    }

    return this;
  }

  /**
   * Get the native handle (for internal use)
   *
   * @returns Native options handle or null if destroyed
   */
  getHandle(): unknown {
    return this.handle;
  }

  /**
   * Destroy the options and release resources
   *
   * This method is idempotent - safe to call multiple times.
   */
  destroy(): void {
    if (this.destroyed || !this.handle) {
      return;
    }

    const fns = getAuthFunctions();
    if (fns.optionsDestroy) {
      fns.optionsDestroy(this.handle);
    }

    this.handle = null;
    this.destroyed = true;
  }

  /**
   * Check if options have been destroyed
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  private ensureNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error('ValidationOptions has been destroyed');
    }
  }
}

/**
 * Create ValidationOptions with common settings
 *
 * @param scopes - Optional required scopes
 * @param clockSkew - Clock skew tolerance in seconds (default: 30)
 * @returns Configured ValidationOptions
 */
export function createValidationOptions(
  scopes?: string,
  clockSkew: number = 30
): ValidationOptions {
  const options = new ValidationOptions();
  options.setClockSkew(clockSkew);

  if (scopes) {
    options.setScopes(scopes);
  }

  return options;
}
