/**
 * FFI Type Definitions for gopher-orch auth module
 *
 * These types mirror the C API definitions from:
 * /gopher-orch/include/gopher/orch/auth/auth_c_api.h
 */

/**
 * Authentication error codes
 * Mirrors gopher_auth_error_t enum from auth_c_api.h
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
 * Result of token validation
 */
export interface ValidationResult {
  /** Whether validation succeeded */
  valid: boolean;
  /** Error code if validation failed */
  errorCode: GopherAuthError;
  /** Human-readable error message if validation failed */
  errorMessage: string | null;
}

/**
 * JWT token payload extracted from a validated token
 */
export interface TokenPayload {
  /** Subject (user ID) from the token */
  subject: string;
  /** Space-separated OAuth scopes */
  scopes: string;
  /** Token audience (optional) */
  audience?: string;
  /** Token expiration timestamp in seconds (optional) */
  expiration?: number;
  /** Token issuer (optional) */
  issuer?: string;
  /** OAuth client ID (optional) */
  clientId?: string;
}

/**
 * Authentication context attached to requests after successful validation
 */
export interface AuthContext {
  /** User ID from the token subject claim */
  userId: string;
  /** Space-separated OAuth scopes from the token */
  scopes: string;
  /** Token audience */
  audience: string;
  /** Token expiration timestamp in seconds */
  tokenExpiry: number;
  /** Whether the request has been authenticated */
  authenticated: boolean;
}

/**
 * Type guard to check if a value is a valid GopherAuthError
 */
export function isGopherAuthError(value: number): value is GopherAuthError {
  return Object.values(GopherAuthError).includes(value);
}

/**
 * Get human-readable description for an error code
 */
export function getErrorDescription(error: GopherAuthError): string {
  switch (error) {
    case GopherAuthError.SUCCESS:
      return 'Success';
    case GopherAuthError.INVALID_TOKEN:
      return 'Invalid token';
    case GopherAuthError.EXPIRED_TOKEN:
      return 'Token has expired';
    case GopherAuthError.INVALID_SIGNATURE:
      return 'Invalid token signature';
    case GopherAuthError.INVALID_ISSUER:
      return 'Invalid token issuer';
    case GopherAuthError.INVALID_AUDIENCE:
      return 'Invalid token audience';
    case GopherAuthError.INSUFFICIENT_SCOPE:
      return 'Insufficient scope';
    case GopherAuthError.JWKS_FETCH_FAILED:
      return 'Failed to fetch JWKS';
    case GopherAuthError.INVALID_KEY:
      return 'Invalid key';
    case GopherAuthError.NETWORK_ERROR:
      return 'Network error';
    case GopherAuthError.INVALID_CONFIG:
      return 'Invalid configuration';
    case GopherAuthError.OUT_OF_MEMORY:
      return 'Out of memory';
    case GopherAuthError.INVALID_PARAMETER:
      return 'Invalid parameter';
    case GopherAuthError.NOT_INITIALIZED:
      return 'Auth library not initialized';
    case GopherAuthError.INTERNAL_ERROR:
      return 'Internal error';
    case GopherAuthError.TOKEN_EXCHANGE_FAILED:
      return 'Token exchange failed';
    case GopherAuthError.IDP_NOT_LINKED:
      return 'IDP not linked';
    case GopherAuthError.INVALID_IDP_ALIAS:
      return 'Invalid IDP alias';
    default:
      return `Unknown error (${error})`;
  }
}

/**
 * Create an empty AuthContext
 */
export function createEmptyAuthContext(): AuthContext {
  return {
    userId: '',
    scopes: '',
    audience: '',
    tokenExpiry: 0,
    authenticated: false,
  };
}
