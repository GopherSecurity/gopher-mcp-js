/**
 * GopherAuthClient - High-level wrapper for gopher-auth token validation
 *
 * Provides a TypeScript-friendly API for JWT token validation using
 * the gopher-auth native library.
 */

import { loadLibrary, isLibraryLoaded, getAuthFunctions } from './loader';
import { ValidationResult, TokenPayload, GopherAuthError } from './types';
import { GopherValidationOptions } from './validation-options';

// Track library initialization state
let libraryInitialized = false;

/**
 * Initialize the gopher-auth library
 *
 * Must be called before creating GopherAuthClient instances.
 *
 * @throws Error if library initialization fails
 */
export function gopherInitAuthLibrary(): void {
  if (libraryInitialized) {
    return;
  }

  if (!loadLibrary()) {
    throw new Error(
      'Failed to load gopher-auth library (ensure libgopher-orch is in native/lib/)'
    );
  }

  const fns = getAuthFunctions();
  if (!fns.authInit) {
    throw new Error('Auth library not properly loaded');
  }

  const result = fns.authInit();
  if (result !== 0) {
    throw new Error(`Failed to initialize auth library: error code ${result}`);
  }

  libraryInitialized = true;
}

/**
 * Shutdown the gopher-auth library
 *
 * Should be called when the application is shutting down.
 */
export function gopherShutdownAuthLibrary(): void {
  if (!libraryInitialized) {
    return;
  }

  const fns = getAuthFunctions();
  if (fns.authShutdown) {
    fns.authShutdown();
  }

  libraryInitialized = false;
}

/**
 * Get the gopher-auth library version
 *
 * @returns Version string or 'unknown' if not available
 */
export function gopherGetAuthLibraryVersion(): string {
  if (!isLibraryLoaded()) {
    loadLibrary();
  }

  const fns = getAuthFunctions();
  if (!fns.authVersion) {
    return 'unknown';
  }

  return fns.authVersion() || 'unknown';
}

/**
 * Check if the auth library is initialized
 */
export function gopherIsAuthLibraryInitialized(): boolean {
  return libraryInitialized;
}

/**
 * Generate WWW-Authenticate header for 401 responses
 *
 * @param realm - Authentication realm
 * @param error - OAuth error code
 * @param description - Human-readable error description
 * @returns WWW-Authenticate header value
 */
export function gopherGenerateWwwAuthenticateHeader(
  realm: string,
  error: string,
  description: string
): string {
  if (!isLibraryLoaded()) {
    throw new Error('Auth library not loaded');
  }

  const fns = getAuthFunctions();
  if (!fns.generateWwwAuthenticate) {
    throw new Error('Function not available');
  }

  const result = fns.generateWwwAuthenticate(realm, error, description);
  if (!result) {
    throw new Error('Failed to generate WWW-Authenticate header');
  }

  return result;
}

/**
 * Generate WWW-Authenticate header v2 (RFC 9728 compliant)
 *
 * @param resource - Resource server URL
 * @param resourceMetadataUrl - URL to OAuth Protected Resource metadata
 * @param scopes - Required scopes (space-separated)
 * @param error - OAuth error code
 * @param description - Human-readable error description
 * @returns WWW-Authenticate header value
 */
export function gopherGenerateWwwAuthenticateHeaderV2(
  resource: string,
  resourceMetadataUrl: string,
  scopes: string,
  error: string,
  description: string
): string {
  if (!isLibraryLoaded()) {
    throw new Error('Auth library not loaded');
  }

  const fns = getAuthFunctions();
  if (!fns.generateWwwAuthenticateV2) {
    throw new Error('Function not available');
  }

  const result = fns.generateWwwAuthenticateV2(
    resource,
    resourceMetadataUrl,
    scopes,
    error,
    description
  );
  if (!result) {
    throw new Error('Failed to generate WWW-Authenticate header');
  }

  return result;
}

/**
 * GopherAuthClient - JWT token validation client
 *
 * Wraps the native gopher-auth client for validating JWT tokens
 * against a JWKS endpoint.
 */
export class GopherAuthClient {
  private handle: unknown = null;
  private destroyed = false;

  /**
   * Create a new GopherAuthClient
   *
   * @param jwksUri - URL to the JWKS endpoint
   * @param issuer - Expected token issuer
   * @throws Error if client creation fails
   */
  constructor(jwksUri: string, issuer: string) {
    if (!isLibraryLoaded()) {
      loadLibrary();
    }

    const fns = getAuthFunctions();
    if (!fns.clientCreate) {
      throw new Error('Auth library not properly loaded');
    }

    this.handle = fns.clientCreate(jwksUri, issuer);
    if (!this.handle) {
      throw new Error('Failed to create auth client');
    }
  }

  /**
   * Set a client option
   *
   * @param option - Option name (e.g., 'cache_duration', 'auto_refresh')
   * @param value - Option value as string
   * @throws Error if setting option fails
   */
  setOption(option: string, value: string): void {
    this.ensureNotDestroyed();

    const fns = getAuthFunctions();
    if (!fns.clientSetOption) {
      throw new Error('Function not available');
    }

    const result = fns.clientSetOption(this.handle, option, value);
    if (result !== 0) {
      throw new Error(`Failed to set option ${option}: error code ${result}`);
    }
  }

  /**
   * Validate a JWT token
   *
   * @param token - JWT token string
   * @param options - Optional validation options
   * @returns Validation result
   */
  validateToken(
    token: string,
    options?: GopherValidationOptions
  ): ValidationResult {
    this.ensureNotDestroyed();

    const fns = getAuthFunctions();
    if (!fns.validateToken) {
      throw new Error('Function not available');
    }

    const optionsHandle = options?.getHandle() ?? null;
    const result = fns.validateToken(this.handle, token, optionsHandle) as {
      valid: boolean;
      error_code: number;
      error_message: string | null;
    };

    return {
      valid: result.valid,
      errorCode: result.error_code as GopherAuthError,
      errorMessage: result.error_message,
    };
  }

  /**
   * Extract payload from a JWT token
   *
   * @param token - JWT token string
   * @returns Token payload
   * @throws Error if extraction fails
   */
  extractPayload(token: string): TokenPayload {
    this.ensureNotDestroyed();

    const fns = getAuthFunctions();
    if (!fns.extractPayload) {
      throw new Error('Function not available');
    }

    // Note: extractPayload only takes the token, not the client handle
    const payloadHandle = fns.extractPayload(token);
    if (!payloadHandle) {
      throw new Error('Failed to extract token payload');
    }

    try {
      const email = fns.payloadGetClaim?.(payloadHandle, 'email') ?? undefined;
      const name = fns.payloadGetClaim?.(payloadHandle, 'name') ?? undefined;
      const organization_id =
        fns.payloadGetClaim?.(payloadHandle, 'organization_id') ?? undefined;
      const server_id =
        fns.payloadGetClaim?.(payloadHandle, 'server_id') ?? undefined;

      const payload: TokenPayload = {
        subject: fns.payloadGetSubject?.(payloadHandle) ?? '',
        scopes: fns.payloadGetScopes?.(payloadHandle) ?? '',
        audience: fns.payloadGetAudience?.(payloadHandle) ?? undefined,
        expiration: fns.payloadGetExpiration?.(payloadHandle) ?? undefined,
        issuer: fns.payloadGetIssuer?.(payloadHandle) ?? undefined,
        email,
        name,
        organization_id,
        server_id,
      };

      return payload;
    } finally {
      if (fns.payloadDestroy) {
        fns.payloadDestroy(payloadHandle);
      }
    }
  }

  /**
   * Validate token and extract payload in one call
   *
   * @param token - JWT token string
   * @param options - Optional validation options
   * @returns Object with validation result and payload (if valid)
   */
  validateAndExtract(
    token: string,
    options?: GopherValidationOptions
  ): { result: ValidationResult; payload?: TokenPayload } {
    const result = this.validateToken(token, options);

    if (!result.valid) {
      return { result };
    }

    try {
      const payload = this.extractPayload(token);
      return { result, payload };
    } catch {
      return { result };
    }
  }

  /**
   * Destroy the client and release resources
   *
   * This method is idempotent - safe to call multiple times.
   */
  destroy(): void {
    if (this.destroyed || !this.handle) {
      return;
    }

    const fns = getAuthFunctions();
    if (fns.clientDestroy) {
      fns.clientDestroy(this.handle);
    }

    this.handle = null;
    this.destroyed = true;
  }

  /**
   * Get the native handle (for internal use by auto-refresh)
   */
  getHandle(): unknown {
    this.ensureNotDestroyed();
    return this.handle;
  }

  /**
   * Check if the client has been destroyed
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  private ensureNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error('GopherAuthClient has been destroyed');
    }
  }
}
