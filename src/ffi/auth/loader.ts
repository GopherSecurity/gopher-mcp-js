/**
 * Auth Library Loader - koffi bindings for libgopher-auth
 *
 * Provides FFI bindings to the gopher-auth native library for
 * JWT token validation and OAuth support.
 *
 * Note: The gopher_auth_* functions are part of libgopher-orch,
 * not a separate library.
 */

import * as koffi from 'koffi';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Track if library is loaded
let lib: koffi.IKoffiLib | null = null;
let libAvailable = false;
let debug = false;

// Opaque pointer types
const GopherAuthClientPtr = koffi.pointer('gopher_auth_client_t', koffi.opaque());
const GopherAuthPayloadPtr = koffi.pointer('gopher_auth_token_payload_t', koffi.opaque());
const GopherAuthOptionsPtr = koffi.pointer('gopher_auth_validation_options_t', koffi.opaque());

// Output pointer types for C API functions that use output parameters
const GopherAuthClientOutPtr = koffi.out(koffi.pointer(GopherAuthClientPtr));
const GopherAuthPayloadOutPtr = koffi.out(koffi.pointer(GopherAuthPayloadPtr));
const GopherAuthOptionsOutPtr = koffi.out(koffi.pointer(GopherAuthOptionsPtr));
const CharOutPtr = koffi.out(koffi.pointer('char*'));
const Int64OutPtr = koffi.out(koffi.pointer('int64_t'));

// Result struct
const GopherAuthValidationResult = koffi.struct('gopher_auth_validation_result_t', {
  valid: 'bool',
  error_code: 'int32_t',
  error_message: 'const char*',
});
const GopherAuthValidationResultOutPtr = koffi.out(koffi.pointer(GopherAuthValidationResult));

// Raw FFI function bindings
let _authInit: koffi.KoffiFunction | null = null;
let _authShutdown: koffi.KoffiFunction | null = null;
let _authVersion: koffi.KoffiFunction | null = null;

let _clientCreate: koffi.KoffiFunction | null = null;
let _clientDestroy: koffi.KoffiFunction | null = null;
let _clientSetOption: koffi.KoffiFunction | null = null;

let _optionsCreate: koffi.KoffiFunction | null = null;
let _optionsDestroy: koffi.KoffiFunction | null = null;
let _optionsSetScopes: koffi.KoffiFunction | null = null;
let _optionsSetAudience: koffi.KoffiFunction | null = null;
let _optionsSetClockSkew: koffi.KoffiFunction | null = null;

let _validateToken: koffi.KoffiFunction | null = null;
let _extractPayload: koffi.KoffiFunction | null = null;

let _payloadGetSubject: koffi.KoffiFunction | null = null;
let _payloadGetScopes: koffi.KoffiFunction | null = null;
let _payloadGetAudience: koffi.KoffiFunction | null = null;
let _payloadGetExpiration: koffi.KoffiFunction | null = null;
let _payloadGetIssuer: koffi.KoffiFunction | null = null;
let _payloadDestroy: koffi.KoffiFunction | null = null;

let _freeString: koffi.KoffiFunction | null = null;
let _generateWwwAuthenticate: koffi.KoffiFunction | null = null;
let _generateWwwAuthenticateV2: koffi.KoffiFunction | null = null;

/**
 * Get the library name for the current platform
 *
 * Note: The gopher_auth_* functions are part of libgopher-orch,
 * not a separate library.
 */
function getLibraryName(): string {
  switch (os.platform()) {
    case 'darwin':
      return 'libgopher-orch.dylib';
    case 'win32':
      return 'gopher-orch.dll';
    default:
      return 'libgopher-orch.so';
  }
}

/**
 * Get search paths for the native library
 */
function getSearchPaths(): string[] {
  const paths: string[] = [];

  // Platform-specific optional dependency package
  const platformPackagePath = getPlatformPackagePath();
  if (platformPackagePath) {
    paths.push(platformPackagePath);
  }

  // Get the directory containing this module
  const moduleDir = path.dirname(path.dirname(path.dirname(__dirname)));

  // Development paths
  paths.push(
    path.join(process.cwd(), 'native', 'lib'),
    path.join(process.cwd(), 'lib'),
    path.join(moduleDir, 'native', 'lib'),
    path.join(path.dirname(moduleDir), 'native', 'lib')
  );

  // System paths
  if (os.platform() === 'darwin') {
    paths.push('/usr/local/lib', '/opt/homebrew/lib');
  }
  paths.push('/usr/lib');

  return paths;
}

/**
 * Get the path to the platform-specific optional dependency package
 */
function getPlatformPackagePath(): string | null {
  const platform = os.platform();
  const arch = os.arch();

  const platformMap: Record<string, string> = {
    darwin: 'darwin',
    linux: 'linux',
    win32: 'win32',
  };

  const platformName = platformMap[platform];
  if (!platformName) {
    return null;
  }

  const packageName = `@gopher.security/gopher-orch-${platformName}-${arch}`;

  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`);
    const packageDir = path.dirname(packageJsonPath);
    const libPath = path.join(packageDir, 'lib');

    if (fs.existsSync(libPath)) {
      return libPath;
    }
  } catch {
    // Package not installed
  }

  return null;
}

/**
 * Setup FFI function bindings
 */
function setupFunctions(): void {
  if (lib === null) {
    return;
  }

  // Library lifecycle - these return error codes or simple values
  _authInit = lib.func('gopher_auth_init', 'int32_t', []);
  _authShutdown = lib.func('gopher_auth_shutdown', 'int32_t', []);
  _authVersion = lib.func('gopher_auth_version', 'const char*', []);

  // Client functions - use output parameters for handles
  // gopher_auth_error_t gopher_auth_client_create(gopher_auth_client_t* client, const char* jwks_uri, const char* issuer);
  _clientCreate = lib.func('gopher_auth_client_create', 'int32_t', [
    GopherAuthClientOutPtr,
    'const char*',
    'const char*',
  ]);
  _clientDestroy = lib.func('gopher_auth_client_destroy', 'int32_t', [GopherAuthClientPtr]);
  _clientSetOption = lib.func('gopher_auth_client_set_option', 'int32_t', [
    GopherAuthClientPtr,
    'const char*',
    'const char*',
  ]);

  // Options functions - use output parameters
  // gopher_auth_error_t gopher_auth_validation_options_create(gopher_auth_validation_options_t* options);
  _optionsCreate = lib.func('gopher_auth_validation_options_create', 'int32_t', [
    GopherAuthOptionsOutPtr,
  ]);
  _optionsDestroy = lib.func('gopher_auth_validation_options_destroy', 'int32_t', [
    GopherAuthOptionsPtr,
  ]);
  _optionsSetScopes = lib.func('gopher_auth_validation_options_set_scopes', 'int32_t', [
    GopherAuthOptionsPtr,
    'const char*',
  ]);
  _optionsSetAudience = lib.func('gopher_auth_validation_options_set_audience', 'int32_t', [
    GopherAuthOptionsPtr,
    'const char*',
  ]);
  _optionsSetClockSkew = lib.func('gopher_auth_validation_options_set_clock_skew', 'int32_t', [
    GopherAuthOptionsPtr,
    'int64_t',
  ]);

  // Validation functions
  // gopher_auth_error_t gopher_auth_validate_token(client, token, options, gopher_auth_validation_result_t* result);
  _validateToken = lib.func('gopher_auth_validate_token', 'int32_t', [
    GopherAuthClientPtr,
    'const char*',
    GopherAuthOptionsPtr,
    GopherAuthValidationResultOutPtr,
  ]);
  // gopher_auth_error_t gopher_auth_extract_payload(const char* token, gopher_auth_token_payload_t* payload);
  _extractPayload = lib.func('gopher_auth_extract_payload', 'int32_t', [
    'const char*',
    GopherAuthPayloadOutPtr,
  ]);

  // Payload functions - use output parameters for strings
  // gopher_auth_error_t gopher_auth_payload_get_subject(payload, char** value);
  _payloadGetSubject = lib.func('gopher_auth_payload_get_subject', 'int32_t', [
    GopherAuthPayloadPtr,
    CharOutPtr,
  ]);
  _payloadGetScopes = lib.func('gopher_auth_payload_get_scopes', 'int32_t', [
    GopherAuthPayloadPtr,
    CharOutPtr,
  ]);
  _payloadGetAudience = lib.func('gopher_auth_payload_get_audience', 'int32_t', [
    GopherAuthPayloadPtr,
    CharOutPtr,
  ]);
  _payloadGetExpiration = lib.func('gopher_auth_payload_get_expiration', 'int32_t', [
    GopherAuthPayloadPtr,
    Int64OutPtr,
  ]);
  _payloadGetIssuer = lib.func('gopher_auth_payload_get_issuer', 'int32_t', [
    GopherAuthPayloadPtr,
    CharOutPtr,
  ]);
  _payloadDestroy = lib.func('gopher_auth_payload_destroy', 'int32_t', [GopherAuthPayloadPtr]);

  // Utility functions
  _freeString = lib.func('gopher_auth_free_string', 'void', ['char*']);
  // gopher_auth_error_t gopher_auth_generate_www_authenticate(realm, error, description, char** header);
  _generateWwwAuthenticate = lib.func('gopher_auth_generate_www_authenticate', 'int32_t', [
    'const char*',
    'const char*',
    'const char*',
    CharOutPtr,
  ]);
  _generateWwwAuthenticateV2 = lib.func('gopher_auth_generate_www_authenticate_v2', 'int32_t', [
    'const char*',
    'const char*',
    'const char*',
    'const char*',
    'const char*',
    CharOutPtr,
  ]);
}

/**
 * Load the gopher-orch native library
 */
export function loadLibrary(): boolean {
  if (lib !== null) {
    return libAvailable;
  }

  debug = process.env['DEBUG'] !== undefined;
  const libraryName = getLibraryName();
  const searchPaths = getSearchPaths();

  // Try environment variable path first
  const envPath = process.env['GOPHER_ORCH_LIBRARY_PATH'] || process.env['GOPHER_AUTH_LIBRARY_PATH'];
  if (envPath && fs.existsSync(envPath)) {
    try {
      lib = koffi.load(envPath);
      setupFunctions();
      libAvailable = true;
      return true;
    } catch (e) {
      if (debug) {
        console.error(`Failed to load from environment path: ${(e as Error).message}`);
      }
    }
  }

  // Try search paths
  for (const searchPath of searchPaths) {
    const libFile = path.join(searchPath, libraryName);
    if (fs.existsSync(libFile)) {
      try {
        lib = koffi.load(libFile);
        setupFunctions();
        libAvailable = true;
        return true;
      } catch (e) {
        if (debug) {
          console.error(`Failed to load from ${searchPath}: ${(e as Error).message}`);
        }
      }
    }
  }

  // Try system paths
  try {
    lib = koffi.load(libraryName);
    setupFunctions();
    libAvailable = true;
    return true;
  } catch (e) {
    if (debug) {
      console.error(`Failed to load gopher-orch library: ${(e as Error).message}`);
      console.error('Searched paths:');
      for (const p of searchPaths) {
        console.error(`  - ${p}`);
      }
    }
  }

  libAvailable = false;
  return false;
}

/**
 * Check if the library is loaded and available
 */
export function isLibraryLoaded(): boolean {
  return libAvailable;
}

/**
 * Get raw FFI functions for internal use
 */
export function getRawFunctions() {
  return {
    authInit: _authInit,
    authShutdown: _authShutdown,
    authVersion: _authVersion,
    clientCreate: _clientCreate,
    clientDestroy: _clientDestroy,
    clientSetOption: _clientSetOption,
    optionsCreate: _optionsCreate,
    optionsDestroy: _optionsDestroy,
    optionsSetScopes: _optionsSetScopes,
    optionsSetAudience: _optionsSetAudience,
    optionsSetClockSkew: _optionsSetClockSkew,
    validateToken: _validateToken,
    extractPayload: _extractPayload,
    payloadGetSubject: _payloadGetSubject,
    payloadGetScopes: _payloadGetScopes,
    payloadGetAudience: _payloadGetAudience,
    payloadGetExpiration: _payloadGetExpiration,
    payloadGetIssuer: _payloadGetIssuer,
    payloadDestroy: _payloadDestroy,
    freeString: _freeString,
    generateWwwAuthenticate: _generateWwwAuthenticate,
    generateWwwAuthenticateV2: _generateWwwAuthenticateV2,
  };
}

// ============================================================================
// High-level wrapper functions that handle output parameters
// ============================================================================

/**
 * Initialize the auth library
 * @returns Error code (0 = success)
 */
export function authInit(): number {
  if (!_authInit) throw new Error('Library not loaded');
  return _authInit();
}

/**
 * Shutdown the auth library
 * @returns Error code (0 = success)
 */
export function authShutdown(): number {
  if (!_authShutdown) throw new Error('Library not loaded');
  return _authShutdown();
}

/**
 * Get library version string
 */
export function authVersion(): string {
  if (!_authVersion) throw new Error('Library not loaded');
  return _authVersion();
}

/**
 * Create an auth client
 * @returns Client handle or null on error
 */
export function clientCreate(jwksUri: string, issuer: string): unknown | null {
  if (!_clientCreate) throw new Error('Library not loaded');

  const clientOut: unknown[] = [null];
  const result = _clientCreate(clientOut, jwksUri, issuer);

  if (result !== 0) {
    return null;
  }

  return clientOut[0];
}

/**
 * Destroy an auth client
 */
export function clientDestroy(client: unknown): number {
  if (!_clientDestroy) throw new Error('Library not loaded');
  return _clientDestroy(client);
}

/**
 * Set client option
 */
export function clientSetOption(client: unknown, option: string, value: string): number {
  if (!_clientSetOption) throw new Error('Library not loaded');
  return _clientSetOption(client, option, value);
}

/**
 * Create validation options
 */
export function optionsCreate(): unknown | null {
  if (!_optionsCreate) throw new Error('Library not loaded');

  const optionsOut: unknown[] = [null];
  const result = _optionsCreate(optionsOut);

  if (result !== 0) {
    return null;
  }

  return optionsOut[0];
}

/**
 * Destroy validation options
 */
export function optionsDestroy(options: unknown): number {
  if (!_optionsDestroy) throw new Error('Library not loaded');
  return _optionsDestroy(options);
}

/**
 * Set required scopes
 */
export function optionsSetScopes(options: unknown, scopes: string): number {
  if (!_optionsSetScopes) throw new Error('Library not loaded');
  return _optionsSetScopes(options, scopes);
}

/**
 * Set required audience
 */
export function optionsSetAudience(options: unknown, audience: string): number {
  if (!_optionsSetAudience) throw new Error('Library not loaded');
  return _optionsSetAudience(options, audience);
}

/**
 * Set clock skew tolerance
 */
export function optionsSetClockSkew(options: unknown, seconds: number): number {
  if (!_optionsSetClockSkew) throw new Error('Library not loaded');
  return _optionsSetClockSkew(options, seconds);
}

/**
 * Validate a token
 */
export function validateToken(
  client: unknown,
  token: string,
  options: unknown | null
): { valid: boolean; error_code: number; error_message: string | null } | null {
  if (!_validateToken) throw new Error('Library not loaded');

  const resultOut: unknown[] = [{ valid: false, error_code: 0, error_message: null }];
  const err = _validateToken(client, token, options, resultOut);

  if (err !== 0) {
    return null;
  }

  return resultOut[0] as { valid: boolean; error_code: number; error_message: string | null };
}

/**
 * Extract payload from token
 */
export function extractPayload(token: string): unknown | null {
  if (!_extractPayload) throw new Error('Library not loaded');

  const payloadOut: unknown[] = [null];
  const result = _extractPayload(token, payloadOut);

  if (result !== 0) {
    return null;
  }

  return payloadOut[0];
}

/**
 * Get subject from payload
 */
export function payloadGetSubject(payload: unknown): string | null {
  if (!_payloadGetSubject) throw new Error('Library not loaded');

  const valueOut: (string | null)[] = [null];
  const result = _payloadGetSubject(payload, valueOut);

  if (result !== 0) {
    return null;
  }

  return valueOut[0] ?? null;
}

/**
 * Get scopes from payload
 */
export function payloadGetScopes(payload: unknown): string | null {
  if (!_payloadGetScopes) throw new Error('Library not loaded');

  const valueOut: (string | null)[] = [null];
  const result = _payloadGetScopes(payload, valueOut);

  if (result !== 0) {
    return null;
  }

  return valueOut[0] ?? null;
}

/**
 * Get audience from payload
 */
export function payloadGetAudience(payload: unknown): string | null {
  if (!_payloadGetAudience) throw new Error('Library not loaded');

  const valueOut: (string | null)[] = [null];
  const result = _payloadGetAudience(payload, valueOut);

  if (result !== 0) {
    return null;
  }

  return valueOut[0] ?? null;
}

/**
 * Get expiration from payload
 */
export function payloadGetExpiration(payload: unknown): number | null {
  if (!_payloadGetExpiration) throw new Error('Library not loaded');

  const valueOut: bigint[] = [BigInt(0)];
  const result = _payloadGetExpiration(payload, valueOut);

  if (result !== 0) {
    return null;
  }

  return Number(valueOut[0]);
}

/**
 * Get issuer from payload
 */
export function payloadGetIssuer(payload: unknown): string | null {
  if (!_payloadGetIssuer) throw new Error('Library not loaded');

  const valueOut: (string | null)[] = [null];
  const result = _payloadGetIssuer(payload, valueOut);

  if (result !== 0) {
    return null;
  }

  return valueOut[0] ?? null;
}

/**
 * Destroy payload
 */
export function payloadDestroy(payload: unknown): number {
  if (!_payloadDestroy) throw new Error('Library not loaded');
  return _payloadDestroy(payload);
}

/**
 * Free a string allocated by the library
 */
export function freeString(str: unknown): void {
  if (!_freeString) throw new Error('Library not loaded');
  _freeString(str);
}

/**
 * Generate WWW-Authenticate header
 */
export function generateWwwAuthenticate(
  realm: string,
  error: string,
  description: string
): string | null {
  if (!_generateWwwAuthenticate) throw new Error('Library not loaded');

  const headerOut: (string | null)[] = [null];
  const result = _generateWwwAuthenticate(realm, error, description, headerOut);

  if (result !== 0) {
    return null;
  }

  return headerOut[0] ?? null;
}

/**
 * Generate WWW-Authenticate header v2 (RFC 9728)
 */
export function generateWwwAuthenticateV2(
  realm: string,
  resourceMetadata: string,
  scope: string,
  error: string,
  description: string
): string | null {
  if (!_generateWwwAuthenticateV2) throw new Error('Library not loaded');

  const headerOut: (string | null)[] = [null];
  const result = _generateWwwAuthenticateV2(realm, resourceMetadata, scope, error, description, headerOut);

  if (result !== 0) {
    return null;
  }

  return headerOut[0] ?? null;
}

// Legacy exports for backward compatibility
export function getAuthFunctions() {
  return {
    authInit,
    authShutdown,
    authVersion,
    clientCreate,
    clientDestroy,
    clientSetOption,
    optionsCreate,
    optionsDestroy,
    optionsSetScopes,
    optionsSetAudience,
    optionsSetClockSkew,
    validateToken,
    extractPayload,
    payloadGetSubject,
    payloadGetScopes,
    payloadGetAudience,
    payloadGetExpiration,
    payloadGetIssuer,
    payloadDestroy,
    freeString,
    generateWwwAuthenticate,
    generateWwwAuthenticateV2,
  };
}
