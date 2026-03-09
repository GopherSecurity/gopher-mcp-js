/**
 * FFI Library Loader for libgopher-auth
 *
 * Provides koffi-based native library loading and C function bindings
 * matching auth_c_api.h from gopher-orch.
 */

import koffi from 'koffi';
import path from 'path';
import fs from 'fs';

// ============================================================================
// Library Loading
// ============================================================================

/**
 * Determine the library filename based on platform
 */
function getLibraryFilename(): string {
  switch (process.platform) {
    case 'darwin':
      return 'libgopher-auth.dylib';
    case 'win32':
      return 'gopher-auth.dll';
    default:
      return 'libgopher-auth.so';
  }
}

/**
 * Find the library path, checking multiple locations
 */
function findLibraryPath(): string {
  const filename = getLibraryFilename();
  const searchPaths = [
    // Relative to this module
    path.join(__dirname, '../../lib', filename),
    // Relative to dist output
    path.join(__dirname, '../../../lib', filename),
    // Absolute path from env
    process.env.GOPHER_AUTH_LIB_PATH,
  ].filter(Boolean) as string[];

  for (const searchPath of searchPaths) {
    if (fs.existsSync(searchPath)) {
      return searchPath;
    }
  }

  throw new Error(
    `Native library not found. Searched:\n  - ${searchPaths.join('\n  - ')}\n` +
    `Set GOPHER_AUTH_LIB_PATH environment variable or copy ${filename} to lib/`
  );
}

// ============================================================================
// Type Definitions
// ============================================================================

let lib: koffi.IKoffiLib | null = null;

// Opaque pointer types
const gopher_auth_client_ptr = koffi.pointer('gopher_auth_client', koffi.opaque());
const gopher_auth_token_payload_ptr = koffi.pointer('gopher_auth_token_payload', koffi.opaque());
const gopher_auth_validation_options_ptr = koffi.pointer('gopher_auth_validation_options', koffi.opaque());

// Error type alias
const gopher_auth_error_t = 'int32';

// Validation result structure
const gopher_auth_validation_result_t = koffi.struct('gopher_auth_validation_result_t', {
  valid: 'bool',
  error_code: 'int32',
  error_message: 'const char *',
});

// Token exchange result structure
const gopher_auth_token_exchange_result_t = koffi.struct('gopher_auth_token_exchange_result_t', {
  access_token: 'char *',
  token_type: 'char *',
  expires_in: 'int64',
  refresh_token: 'char *',
  scope: 'char *',
  error_code: 'int32',
  error_description: 'const char *',
});

// ============================================================================
// Function Bindings
// ============================================================================

// Function signature holders (initialized on load)
let gopher_auth_init: () => number;
let gopher_auth_shutdown: () => number;
let gopher_auth_version: () => string;

let gopher_auth_client_create: (
  client: koffi.IKoffiCType,
  jwks_uri: string,
  issuer: string
) => number;
let gopher_auth_client_destroy: (client: unknown) => number;
let gopher_auth_client_set_option: (
  client: unknown,
  option: string,
  value: string
) => number;

let gopher_auth_validation_options_create: (options: koffi.IKoffiCType) => number;
let gopher_auth_validation_options_destroy: (options: unknown) => number;
let gopher_auth_validation_options_set_scopes: (options: unknown, scopes: string) => number;
let gopher_auth_validation_options_set_audience: (options: unknown, audience: string) => number;
let gopher_auth_validation_options_set_clock_skew: (options: unknown, seconds: bigint) => number;

let gopher_auth_validate_token: (
  client: unknown,
  token: string,
  options: unknown | null,
  result: koffi.IKoffiCType
) => number;
let gopher_auth_extract_payload: (token: string, payload: koffi.IKoffiCType) => number;

let gopher_auth_payload_get_subject: (payload: unknown, value: koffi.IKoffiCType) => number;
let gopher_auth_payload_get_issuer: (payload: unknown, value: koffi.IKoffiCType) => number;
let gopher_auth_payload_get_audience: (payload: unknown, value: koffi.IKoffiCType) => number;
let gopher_auth_payload_get_scopes: (payload: unknown, value: koffi.IKoffiCType) => number;
let gopher_auth_payload_get_expiration: (payload: unknown, value: koffi.IKoffiCType) => number;
let gopher_auth_payload_get_claim: (
  payload: unknown,
  claim_name: string,
  value: koffi.IKoffiCType
) => number;
let gopher_auth_payload_destroy: (payload: unknown) => number;

let gopher_auth_free_string: (str: unknown) => void;
let gopher_auth_get_last_error: () => string;
let gopher_auth_clear_error: () => void;
let gopher_auth_error_to_string: (error_code: number) => string;

let gopher_auth_generate_www_authenticate: (
  realm: string,
  error: string | null,
  error_description: string | null,
  header: koffi.IKoffiCType
) => number;

let gopher_auth_generate_www_authenticate_v2: (
  realm: string,
  resource_metadata: string | null,
  scope: string | null,
  error: string | null,
  error_description: string | null,
  header: koffi.IKoffiCType
) => number;

let gopher_auth_validate_scopes: (required: string, available: string) => boolean;

// Token exchange functions
let gopher_auth_exchange_token: (
  client: unknown,
  subject_token: string,
  idp_alias: string,
  audience: string | null,
  scope: string | null
) => unknown;
let gopher_auth_set_exchange_idps: (client: unknown, exchange_idps: string) => number;
let gopher_auth_free_exchange_result: (result: koffi.IKoffiCType) => void;

// ============================================================================
// Library State
// ============================================================================

let isLoaded = false;

/**
 * Load the native library and bind all functions
 *
 * @throws Error if library cannot be loaded
 */
export function loadLibrary(): void {
  if (isLoaded) {
    return;
  }

  const libPath = findLibraryPath();
  lib = koffi.load(libPath);

  // Library initialization
  gopher_auth_init = lib.func('gopher_auth_init', gopher_auth_error_t, []);
  gopher_auth_shutdown = lib.func('gopher_auth_shutdown', gopher_auth_error_t, []);
  gopher_auth_version = lib.func('gopher_auth_version', 'const char *', []);

  // Client lifecycle
  gopher_auth_client_create = lib.func(
    'gopher_auth_client_create',
    gopher_auth_error_t,
    [koffi.out(koffi.pointer(gopher_auth_client_ptr)), 'const char *', 'const char *']
  );
  gopher_auth_client_destroy = lib.func(
    'gopher_auth_client_destroy',
    gopher_auth_error_t,
    [gopher_auth_client_ptr]
  );
  gopher_auth_client_set_option = lib.func(
    'gopher_auth_client_set_option',
    gopher_auth_error_t,
    [gopher_auth_client_ptr, 'const char *', 'const char *']
  );

  // Validation options
  gopher_auth_validation_options_create = lib.func(
    'gopher_auth_validation_options_create',
    gopher_auth_error_t,
    [koffi.out(koffi.pointer(gopher_auth_validation_options_ptr))]
  );
  gopher_auth_validation_options_destroy = lib.func(
    'gopher_auth_validation_options_destroy',
    gopher_auth_error_t,
    [gopher_auth_validation_options_ptr]
  );
  gopher_auth_validation_options_set_scopes = lib.func(
    'gopher_auth_validation_options_set_scopes',
    gopher_auth_error_t,
    [gopher_auth_validation_options_ptr, 'const char *']
  );
  gopher_auth_validation_options_set_audience = lib.func(
    'gopher_auth_validation_options_set_audience',
    gopher_auth_error_t,
    [gopher_auth_validation_options_ptr, 'const char *']
  );
  gopher_auth_validation_options_set_clock_skew = lib.func(
    'gopher_auth_validation_options_set_clock_skew',
    gopher_auth_error_t,
    [gopher_auth_validation_options_ptr, 'int64']
  );

  // Token validation
  gopher_auth_validate_token = lib.func(
    'gopher_auth_validate_token',
    gopher_auth_error_t,
    [gopher_auth_client_ptr, 'const char *', gopher_auth_validation_options_ptr, koffi.out(koffi.pointer(gopher_auth_validation_result_t))]
  );
  gopher_auth_extract_payload = lib.func(
    'gopher_auth_extract_payload',
    gopher_auth_error_t,
    ['const char *', koffi.out(koffi.pointer(gopher_auth_token_payload_ptr))]
  );

  // Payload accessors
  gopher_auth_payload_get_subject = lib.func(
    'gopher_auth_payload_get_subject',
    gopher_auth_error_t,
    [gopher_auth_token_payload_ptr, koffi.out(koffi.pointer('char *'))]
  );
  gopher_auth_payload_get_issuer = lib.func(
    'gopher_auth_payload_get_issuer',
    gopher_auth_error_t,
    [gopher_auth_token_payload_ptr, koffi.out(koffi.pointer('char *'))]
  );
  gopher_auth_payload_get_audience = lib.func(
    'gopher_auth_payload_get_audience',
    gopher_auth_error_t,
    [gopher_auth_token_payload_ptr, koffi.out(koffi.pointer('char *'))]
  );
  gopher_auth_payload_get_scopes = lib.func(
    'gopher_auth_payload_get_scopes',
    gopher_auth_error_t,
    [gopher_auth_token_payload_ptr, koffi.out(koffi.pointer('char *'))]
  );
  gopher_auth_payload_get_expiration = lib.func(
    'gopher_auth_payload_get_expiration',
    gopher_auth_error_t,
    [gopher_auth_token_payload_ptr, koffi.out(koffi.pointer('int64'))]
  );
  gopher_auth_payload_get_claim = lib.func(
    'gopher_auth_payload_get_claim',
    gopher_auth_error_t,
    [gopher_auth_token_payload_ptr, 'const char *', koffi.out(koffi.pointer('char *'))]
  );
  gopher_auth_payload_destroy = lib.func(
    'gopher_auth_payload_destroy',
    gopher_auth_error_t,
    [gopher_auth_token_payload_ptr]
  );

  // Memory management
  gopher_auth_free_string = lib.func('gopher_auth_free_string', 'void', ['char *']);

  // Error handling
  gopher_auth_get_last_error = lib.func('gopher_auth_get_last_error', 'const char *', []);
  gopher_auth_clear_error = lib.func('gopher_auth_clear_error', 'void', []);
  gopher_auth_error_to_string = lib.func('gopher_auth_error_to_string', 'const char *', ['int32']);

  // Utility functions
  gopher_auth_generate_www_authenticate = lib.func(
    'gopher_auth_generate_www_authenticate',
    gopher_auth_error_t,
    ['const char *', 'const char *', 'const char *', koffi.out(koffi.pointer('char *'))]
  );
  gopher_auth_generate_www_authenticate_v2 = lib.func(
    'gopher_auth_generate_www_authenticate_v2',
    gopher_auth_error_t,
    ['const char *', 'const char *', 'const char *', 'const char *', 'const char *', koffi.out(koffi.pointer('char *'))]
  );
  gopher_auth_validate_scopes = lib.func(
    'gopher_auth_validate_scopes',
    'bool',
    ['const char *', 'const char *']
  );

  // Token exchange
  gopher_auth_exchange_token = lib.func(
    'gopher_auth_exchange_token',
    gopher_auth_token_exchange_result_t,
    [gopher_auth_client_ptr, 'const char *', 'const char *', 'const char *', 'const char *']
  );
  gopher_auth_set_exchange_idps = lib.func(
    'gopher_auth_set_exchange_idps',
    gopher_auth_error_t,
    [gopher_auth_client_ptr, 'const char *']
  );
  gopher_auth_free_exchange_result = lib.func(
    'gopher_auth_free_exchange_result',
    'void',
    [koffi.pointer(gopher_auth_token_exchange_result_t)]
  );

  isLoaded = true;
}

/**
 * Check if the library has been loaded
 */
export function isLibraryLoaded(): boolean {
  return isLoaded;
}

/**
 * Get the library instance (for advanced use)
 */
export function getLibrary(): koffi.IKoffiLib {
  if (!lib) {
    throw new Error('Library not loaded. Call loadLibrary() first.');
  }
  return lib;
}

// ============================================================================
// Exported Function Accessors
// ============================================================================

export function getGopherAuthInit() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_init;
}

export function getGopherAuthShutdown() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_shutdown;
}

export function getGopherAuthVersion() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_version;
}

export function getGopherAuthClientCreate() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_client_create;
}

export function getGopherAuthClientDestroy() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_client_destroy;
}

export function getGopherAuthClientSetOption() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_client_set_option;
}

export function getGopherAuthValidationOptionsCreate() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_validation_options_create;
}

export function getGopherAuthValidationOptionsDestroy() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_validation_options_destroy;
}

export function getGopherAuthValidationOptionsSetScopes() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_validation_options_set_scopes;
}

export function getGopherAuthValidationOptionsSetAudience() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_validation_options_set_audience;
}

export function getGopherAuthValidationOptionsSetClockSkew() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_validation_options_set_clock_skew;
}

export function getGopherAuthValidateToken() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_validate_token;
}

export function getGopherAuthExtractPayload() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_extract_payload;
}

export function getGopherAuthPayloadGetSubject() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_payload_get_subject;
}

export function getGopherAuthPayloadGetIssuer() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_payload_get_issuer;
}

export function getGopherAuthPayloadGetAudience() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_payload_get_audience;
}

export function getGopherAuthPayloadGetScopes() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_payload_get_scopes;
}

export function getGopherAuthPayloadGetExpiration() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_payload_get_expiration;
}

export function getGopherAuthPayloadGetClaim() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_payload_get_claim;
}

export function getGopherAuthPayloadDestroy() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_payload_destroy;
}

export function getGopherAuthFreeString() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_free_string;
}

export function getGopherAuthGetLastError() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_get_last_error;
}

export function getGopherAuthClearError() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_clear_error;
}

export function getGopherAuthErrorToString() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_error_to_string;
}

export function getGopherAuthGenerateWwwAuthenticate() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_generate_www_authenticate;
}

export function getGopherAuthGenerateWwwAuthenticateV2() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_generate_www_authenticate_v2;
}

export function getGopherAuthValidateScopes() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_validate_scopes;
}

export function getGopherAuthExchangeToken() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_exchange_token;
}

export function getGopherAuthSetExchangeIdps() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_set_exchange_idps;
}

export function getGopherAuthFreeExchangeResult() {
  if (!isLoaded) loadLibrary();
  return gopher_auth_free_exchange_result;
}

// Export types for use in other modules
export {
  gopher_auth_client_ptr,
  gopher_auth_token_payload_ptr,
  gopher_auth_validation_options_ptr,
  gopher_auth_validation_result_t,
  gopher_auth_token_exchange_result_t,
};
