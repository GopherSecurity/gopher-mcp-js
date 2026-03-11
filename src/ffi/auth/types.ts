/**
 * Auth Types - Type definitions for gopher-auth FFI bindings
 *
 * These types mirror the C API from gopher-orch/include/gopher/orch/auth/auth_c_api.h
 */

/**
 * Error codes from gopher_auth_error_t enum
 */
export enum GopherAuthError {
  SUCCESS = 0,
  INVALID_TOKEN = -1000,
  EXPIRED_TOKEN = -1001,
  INVALID_SIGNATURE = -1002,
  INVALID_ISSUER = -1003,
  INVALID_AUDIENCE = -1004,
  INSUFFICIENT_SCOPE = -1005,
  JWKS_FETCH_FAILED = -1006,
  INVALID_KEY = -1007,
  NETWORK_ERROR = -1008,
  INVALID_CONFIG = -1009,
  OUT_OF_MEMORY = -1010,
  INVALID_PARAMETER = -1011,
  NOT_INITIALIZED = -1012,
  INTERNAL_ERROR = -1013,
  TOKEN_EXCHANGE_FAILED = -1014,
  IDP_NOT_LINKED = -1015,
  INVALID_IDP_ALIAS = -1016,
}

/**
 * Check if a value is a valid GopherAuthError code
 */
export function isGopherAuthError(code: number): code is GopherAuthError {
  const success = GopherAuthError.SUCCESS as number;
  const minError = GopherAuthError.INVALID_IDP_ALIAS as number;
  const maxError = GopherAuthError.INVALID_TOKEN as number;
  return code === success || (code <= maxError && code >= minError);
}

/**
 * Get human-readable description for an error code
 */
export function getErrorDescription(code: GopherAuthError): string {
  const descriptions: Record<GopherAuthError, string> = {
    [GopherAuthError.SUCCESS]: 'Success',
    [GopherAuthError.INVALID_TOKEN]: 'Invalid token format or structure',
    [GopherAuthError.EXPIRED_TOKEN]: 'Token has expired',
    [GopherAuthError.INVALID_SIGNATURE]: 'Token signature verification failed',
    [GopherAuthError.INVALID_ISSUER]:
      'Token issuer does not match expected value',
    [GopherAuthError.INVALID_AUDIENCE]:
      'Token audience does not match expected value',
    [GopherAuthError.INSUFFICIENT_SCOPE]: 'Token does not have required scopes',
    [GopherAuthError.JWKS_FETCH_FAILED]: 'Failed to fetch JWKS from server',
    [GopherAuthError.INVALID_KEY]: 'Invalid or unsupported key in JWKS',
    [GopherAuthError.NETWORK_ERROR]: 'Network error during authentication',
    [GopherAuthError.INVALID_CONFIG]: 'Invalid configuration',
    [GopherAuthError.OUT_OF_MEMORY]: 'Out of memory',
    [GopherAuthError.INVALID_PARAMETER]: 'Invalid parameter provided',
    [GopherAuthError.NOT_INITIALIZED]: 'Auth library not initialized',
    [GopherAuthError.INTERNAL_ERROR]: 'Internal error',
    [GopherAuthError.TOKEN_EXCHANGE_FAILED]: 'Token exchange failed',
    [GopherAuthError.IDP_NOT_LINKED]: 'Identity provider not linked',
    [GopherAuthError.INVALID_IDP_ALIAS]: 'Invalid identity provider alias',
  };

  return descriptions[code] || `Unknown error code: ${code}`;
}

/**
 * Token validation result
 */
export interface ValidationResult {
  valid: boolean;
  errorCode: GopherAuthError;
  errorMessage: string | null;
}

/**
 * Decoded JWT token payload
 */
export interface TokenPayload {
  subject: string;
  scopes: string;
  audience?: string;
  expiration?: number;
  issuer?: string;
}

/**
 * Authentication context for the current request
 */
export interface GopherAuthContext {
  userId: string;
  scopes: string;
  audience: string;
  tokenExpiry: number;
  authenticated: boolean;
}

/**
 * Create an empty auth context (unauthenticated)
 */
export function gopherCreateEmptyAuthContext(): GopherAuthContext {
  return {
    userId: '',
    scopes: '',
    audience: '',
    tokenExpiry: 0,
    authenticated: false,
  };
}
