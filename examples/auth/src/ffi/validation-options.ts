/**
 * ValidationOptions - Configuration for token validation
 *
 * Provides a fluent API for configuring JWT validation options
 * such as required scopes, audience, and clock skew tolerance.
 */

import koffi from 'koffi';
import { GopherAuthError, getErrorDescription } from './types';
import {
  loadLibrary,
  getGopherAuthValidationOptionsCreate,
  getGopherAuthValidationOptionsDestroy,
  getGopherAuthValidationOptionsSetScopes,
  getGopherAuthValidationOptionsSetAudience,
  getGopherAuthValidationOptionsSetClockSkew,
} from './loader';

/**
 * Validation options for JWT token validation
 *
 * Provides a fluent API for setting validation parameters.
 *
 * @example
 * ```typescript
 * const options = new ValidationOptions()
 *   .setScopes('mcp:read mcp:write')
 *   .setAudience('my-api')
 *   .setClockSkew(60);
 *
 * const result = client.validateToken(token, options);
 * options.destroy();
 * ```
 */
export class ValidationOptions {
  private handle: unknown = null;
  private destroyed = false;

  /**
   * Create new validation options
   *
   * @throws Error if creation fails
   */
  constructor() {
    loadLibrary();

    const handlePtr: unknown[] = [null];
    const err = getGopherAuthValidationOptionsCreate()(handlePtr as unknown as koffi.IKoffiCType);

    if (err !== GopherAuthError.SUCCESS) {
      throw new Error(`Failed to create validation options: ${getErrorDescription(err)}`);
    }

    this.handle = handlePtr[0];
  }

  /**
   * Set required scopes for validation
   *
   * The token must contain all specified scopes to pass validation.
   *
   * @param scopes - Space-separated list of required scopes
   * @returns this for method chaining
   */
  setScopes(scopes: string): this {
    this.ensureNotDestroyed();

    const err = getGopherAuthValidationOptionsSetScopes()(this.handle, scopes);
    if (err !== GopherAuthError.SUCCESS) {
      throw new Error(`Failed to set scopes: ${getErrorDescription(err)}`);
    }

    return this;
  }

  /**
   * Set expected audience for validation
   *
   * The token's audience claim must match this value.
   *
   * @param audience - Expected audience value
   * @returns this for method chaining
   */
  setAudience(audience: string): this {
    this.ensureNotDestroyed();

    const err = getGopherAuthValidationOptionsSetAudience()(this.handle, audience);
    if (err !== GopherAuthError.SUCCESS) {
      throw new Error(`Failed to set audience: ${getErrorDescription(err)}`);
    }

    return this;
  }

  /**
   * Set clock skew tolerance for time-based validation
   *
   * Allows for clock differences between the token issuer and validator.
   *
   * @param seconds - Maximum allowed clock skew in seconds
   * @returns this for method chaining
   */
  setClockSkew(seconds: number): this {
    this.ensureNotDestroyed();

    const err = getGopherAuthValidationOptionsSetClockSkew()(this.handle, BigInt(seconds));
    if (err !== GopherAuthError.SUCCESS) {
      throw new Error(`Failed to set clock skew: ${getErrorDescription(err)}`);
    }

    return this;
  }

  /**
   * Destroy the options and release native resources
   *
   * This method is idempotent - calling it multiple times is safe.
   */
  destroy(): void {
    if (this.destroyed || !this.handle) {
      return;
    }

    getGopherAuthValidationOptionsDestroy()(this.handle);
    this.handle = null;
    this.destroyed = true;
  }

  /**
   * Check if the options have been destroyed
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Get the native handle (for internal use)
   */
  getHandle(): unknown {
    if (this.destroyed) {
      return null;
    }
    return this.handle;
  }

  private ensureNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error('ValidationOptions has been destroyed');
    }
  }
}

/**
 * Create validation options with common defaults
 *
 * @param scopes - Optional required scopes
 * @param clockSkew - Optional clock skew in seconds (default: 60)
 * @returns Configured ValidationOptions
 */
export function createValidationOptions(
  scopes?: string,
  clockSkew = 60
): ValidationOptions {
  const options = new ValidationOptions();

  if (scopes) {
    options.setScopes(scopes);
  }

  options.setClockSkew(clockSkew);

  return options;
}
