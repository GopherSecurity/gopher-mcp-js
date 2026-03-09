/**
 * AuthClient - High-level wrapper for gopher-auth FFI
 *
 * Provides a TypeScript-friendly interface for JWT token validation
 * using the libgopher-auth native library.
 */

import koffi from 'koffi';
import {
  GopherAuthError,
  ValidationResult,
  TokenPayload,
  getErrorDescription,
} from './types';
import {
  loadLibrary,
  getGopherAuthInit,
  getGopherAuthShutdown,
  getGopherAuthVersion,
  getGopherAuthClientCreate,
  getGopherAuthClientDestroy,
  getGopherAuthClientSetOption,
  getGopherAuthValidateToken,
  getGopherAuthExtractPayload,
  getGopherAuthPayloadGetSubject,
  getGopherAuthPayloadGetIssuer,
  getGopherAuthPayloadGetAudience,
  getGopherAuthPayloadGetScopes,
  getGopherAuthPayloadGetExpiration,
  getGopherAuthPayloadDestroy,
  getGopherAuthFreeString,
  getGopherAuthGenerateWwwAuthenticate,
  getGopherAuthGenerateWwwAuthenticateV2,
  gopher_auth_client_ptr,
  gopher_auth_validation_result_t,
  gopher_auth_token_payload_ptr,
} from './loader';
import { ValidationOptions } from './validation-options';

// ============================================================================
// Library Initialization
// ============================================================================

let libraryInitialized = false;

/**
 * Initialize the auth library
 *
 * Must be called before creating any AuthClient instances.
 *
 * @throws Error if initialization fails
 */
export function initAuthLibrary(): void {
  if (libraryInitialized) {
    return;
  }

  loadLibrary();
  const err = getGopherAuthInit()();
  if (err !== GopherAuthError.SUCCESS) {
    throw new Error(`Failed to initialize auth library: ${getErrorDescription(err)}`);
  }
  libraryInitialized = true;
}

/**
 * Shutdown the auth library
 *
 * Should be called during application shutdown to clean up resources.
 */
export function shutdownAuthLibrary(): void {
  if (!libraryInitialized) {
    return;
  }

  getGopherAuthShutdown()();
  libraryInitialized = false;
}

/**
 * Get the auth library version
 */
export function getAuthLibraryVersion(): string {
  loadLibrary();
  return getGopherAuthVersion()();
}

/**
 * Check if the auth library is initialized
 */
export function isAuthLibraryInitialized(): boolean {
  return libraryInitialized;
}

// ============================================================================
// AuthClient Class
// ============================================================================

/**
 * Authentication client for JWT token validation
 *
 * Wraps the native gopher-auth client with a TypeScript-friendly interface.
 *
 * @example
 * ```typescript
 * initAuthLibrary();
 * const client = new AuthClient('https://auth.example.com/jwks', 'https://auth.example.com');
 * client.setOption('cache_duration', '3600');
 *
 * const result = client.validateToken(token);
 * if (result.valid) {
 *   const payload = client.extractPayload(token);
 *   console.log('User:', payload.subject);
 * }
 *
 * client.destroy();
 * shutdownAuthLibrary();
 * ```
 */
export class AuthClient {
  private handle: unknown = null;
  private destroyed = false;

  /**
   * Create a new AuthClient
   *
   * @param jwksUri - JWKS endpoint URI for fetching signing keys
   * @param issuer - Expected token issuer
   * @throws Error if client creation fails
   */
  constructor(jwksUri: string, issuer: string) {
    if (!libraryInitialized) {
      throw new Error('Auth library not initialized. Call initAuthLibrary() first.');
    }

    const handlePtr: unknown[] = [null];
    const err = getGopherAuthClientCreate()(handlePtr as unknown as unknown as koffi.IKoffiCType, jwksUri, issuer);

    if (err !== GopherAuthError.SUCCESS) {
      throw new Error(`Failed to create auth client: ${getErrorDescription(err)}`);
    }

    this.handle = handlePtr[0];
  }

  /**
   * Set a client configuration option
   *
   * @param option - Option name (e.g., 'cache_duration', 'auto_refresh', 'request_timeout')
   * @param value - Option value as string
   * @throws Error if option setting fails
   */
  setOption(option: string, value: string): void {
    this.ensureNotDestroyed();

    const err = getGopherAuthClientSetOption()(this.handle, option, value);
    if (err !== GopherAuthError.SUCCESS) {
      throw new Error(`Failed to set option '${option}': ${getErrorDescription(err)}`);
    }
  }

  /**
   * Validate a JWT token
   *
   * @param token - JWT token string to validate
   * @param options - Optional validation options (scopes, clock skew, etc.)
   * @returns Validation result with valid flag, error code, and message
   */
  validateToken(token: string, options?: ValidationOptions): ValidationResult {
    this.ensureNotDestroyed();

    const resultStruct = {
      valid: false,
      error_code: 0,
      error_message: null as string | null,
    };
    const resultPtr: unknown[] = [resultStruct];

    const optionsHandle = options?.getHandle() ?? null;

    getGopherAuthValidateToken()(
      this.handle,
      token,
      optionsHandle,
      resultPtr as unknown as koffi.IKoffiCType
    );

    const result = resultPtr[0] as typeof resultStruct;
    return {
      valid: result.valid,
      errorCode: result.error_code as GopherAuthError,
      errorMessage: result.error_message,
    };
  }

  /**
   * Extract payload from a JWT token without full validation
   *
   * This decodes the token payload but does not verify the signature.
   * Use validateToken() first for secure validation.
   *
   * @param token - JWT token string
   * @returns Extracted token payload
   * @throws Error if payload extraction fails
   */
  extractPayload(token: string): TokenPayload {
    this.ensureNotDestroyed();

    const payloadPtr: unknown[] = [null];
    const err = getGopherAuthExtractPayload()(token, payloadPtr as unknown as koffi.IKoffiCType);

    if (err !== GopherAuthError.SUCCESS) {
      throw new Error(`Failed to extract payload: ${getErrorDescription(err)}`);
    }

    const payloadHandle = payloadPtr[0];

    try {
      return this.readPayload(payloadHandle);
    } finally {
      getGopherAuthPayloadDestroy()(payloadHandle);
    }
  }

  /**
   * Validate token and extract payload in one operation
   *
   * @param token - JWT token string
   * @param options - Optional validation options
   * @returns Object with validation result and payload (if valid)
   */
  validateAndExtract(
    token: string,
    options?: ValidationOptions
  ): { result: ValidationResult; payload?: TokenPayload } {
    const result = this.validateToken(token, options);

    if (!result.valid) {
      return { result };
    }

    try {
      const payload = this.extractPayload(token);
      return { result, payload };
    } catch (error) {
      return {
        result: {
          valid: false,
          errorCode: GopherAuthError.INTERNAL_ERROR,
          errorMessage: `Payload extraction failed: ${error}`,
        },
      };
    }
  }

  /**
   * Destroy the client and release native resources
   *
   * This method is idempotent - calling it multiple times is safe.
   */
  destroy(): void {
    if (this.destroyed || !this.handle) {
      return;
    }

    getGopherAuthClientDestroy()(this.handle);
    this.handle = null;
    this.destroyed = true;
  }

  /**
   * Check if the client has been destroyed
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Get the native handle (for advanced use)
   */
  getHandle(): unknown {
    this.ensureNotDestroyed();
    return this.handle;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private ensureNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error('AuthClient has been destroyed');
    }
  }

  private readPayload(payloadHandle: unknown): TokenPayload {
    const payload: TokenPayload = {
      subject: '',
      scopes: '',
    };

    // Read subject
    const subjectPtr: unknown[] = [null];
    if (getGopherAuthPayloadGetSubject()(payloadHandle, subjectPtr as unknown as koffi.IKoffiCType) === GopherAuthError.SUCCESS) {
      const ptr = subjectPtr[0];
      if (ptr) {
        payload.subject = ptr as string;
        getGopherAuthFreeString()(ptr);
      }
    }

    // Read issuer
    const issuerPtr: unknown[] = [null];
    if (getGopherAuthPayloadGetIssuer()(payloadHandle, issuerPtr as unknown as koffi.IKoffiCType) === GopherAuthError.SUCCESS) {
      const ptr = issuerPtr[0];
      if (ptr) {
        payload.issuer = ptr as string;
        getGopherAuthFreeString()(ptr);
      }
    }

    // Read audience
    const audiencePtr: unknown[] = [null];
    if (getGopherAuthPayloadGetAudience()(payloadHandle, audiencePtr as unknown as koffi.IKoffiCType) === GopherAuthError.SUCCESS) {
      const ptr = audiencePtr[0];
      if (ptr) {
        payload.audience = ptr as string;
        getGopherAuthFreeString()(ptr);
      }
    }

    // Read scopes
    const scopesPtr: unknown[] = [null];
    if (getGopherAuthPayloadGetScopes()(payloadHandle, scopesPtr as unknown as koffi.IKoffiCType) === GopherAuthError.SUCCESS) {
      const ptr = scopesPtr[0];
      if (ptr) {
        payload.scopes = ptr as string;
        getGopherAuthFreeString()(ptr);
      }
    }

    // Read expiration
    const expPtr: unknown[] = [BigInt(0)];
    if (getGopherAuthPayloadGetExpiration()(payloadHandle, expPtr as unknown as koffi.IKoffiCType) === GopherAuthError.SUCCESS) {
      payload.expiration = Number(expPtr[0]);
    }

    return payload;
  }
}

// ============================================================================
// WWW-Authenticate Header Generation
// ============================================================================

/**
 * Generate a WWW-Authenticate header for 401 responses
 *
 * @param realm - Authentication realm (typically the server URL)
 * @param error - OAuth error code (e.g., 'invalid_token')
 * @param errorDescription - Human-readable error description
 * @returns WWW-Authenticate header value
 */
export function generateWwwAuthenticateHeader(
  realm: string,
  error?: string,
  errorDescription?: string
): string {
  loadLibrary();

  const headerPtr: unknown[] = [null];
  const err = getGopherAuthGenerateWwwAuthenticate()(
    realm,
    error ?? null,
    errorDescription ?? null,
    headerPtr as unknown as koffi.IKoffiCType
  );

  if (err !== GopherAuthError.SUCCESS) {
    // Fall back to basic Bearer header
    return `Bearer realm="${realm}"`;
  }

  const header = headerPtr[0] as string;
  if (header) {
    const result = header;
    getGopherAuthFreeString()(headerPtr[0]);
    return result;
  }

  return `Bearer realm="${realm}"`;
}

/**
 * Generate a WWW-Authenticate header with resource metadata (RFC 9728)
 *
 * @param realm - Authentication realm (server URL)
 * @param resourceMetadata - Protected resource metadata URL
 * @param scope - Required scopes
 * @param error - OAuth error code
 * @param errorDescription - Human-readable error description
 * @returns WWW-Authenticate header value
 */
export function generateWwwAuthenticateHeaderV2(
  realm: string,
  resourceMetadata?: string,
  scope?: string,
  error?: string,
  errorDescription?: string
): string {
  loadLibrary();

  const headerPtr: unknown[] = [null];
  const err = getGopherAuthGenerateWwwAuthenticateV2()(
    realm,
    resourceMetadata ?? null,
    scope ?? null,
    error ?? null,
    errorDescription ?? null,
    headerPtr as unknown as koffi.IKoffiCType
  );

  if (err !== GopherAuthError.SUCCESS) {
    return `Bearer realm="${realm}"`;
  }

  const header = headerPtr[0] as string;
  if (header) {
    const result = header;
    getGopherAuthFreeString()(headerPtr[0]);
    return result;
  }

  return `Bearer realm="${realm}"`;
}
