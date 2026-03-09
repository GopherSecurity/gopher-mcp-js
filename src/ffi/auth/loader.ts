/**
 * Auth Library Loader - koffi bindings for libgopher-auth
 *
 * Provides FFI bindings to the gopher-auth native library for
 * JWT token validation and OAuth support.
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

// Result struct
const GopherAuthValidationResult = koffi.struct('gopher_auth_validation_result_t', {
  valid: 'bool',
  error_code: 'int32_t',
  error_message: 'const char*',
});

// Function bindings
let _authInit: (() => number) | null = null;
let _authShutdown: (() => void) | null = null;
let _authVersion: (() => string) | null = null;

let _clientCreate: ((jwksUri: string, issuer: string) => unknown) | null = null;
let _clientDestroy: ((client: unknown) => void) | null = null;
let _clientSetOption: ((client: unknown, option: string, value: string) => number) | null = null;

let _optionsCreate: (() => unknown) | null = null;
let _optionsDestroy: ((options: unknown) => void) | null = null;
let _optionsSetScopes: ((options: unknown, scopes: string) => void) | null = null;
let _optionsSetAudience: ((options: unknown, audience: string) => void) | null = null;
let _optionsSetClockSkew: ((options: unknown, seconds: number) => void) | null = null;

let _validateToken: ((client: unknown, token: string, options: unknown | null) => unknown) | null = null;
let _extractPayload: ((client: unknown, token: string) => unknown) | null = null;

let _payloadGetSubject: ((payload: unknown) => string | null) | null = null;
let _payloadGetScopes: ((payload: unknown) => string | null) | null = null;
let _payloadGetAudience: ((payload: unknown) => string | null) | null = null;
let _payloadGetExpiration: ((payload: unknown) => number) | null = null;
let _payloadGetIssuedAt: ((payload: unknown) => number) | null = null;
let _payloadGetIssuer: ((payload: unknown) => string | null) | null = null;
let _payloadDestroy: ((payload: unknown) => void) | null = null;

let _freeString: ((str: unknown) => void) | null = null;
let _generateWwwAuthenticate: ((
  resource: string,
  authServer: string,
  scopes: string,
  error: string,
  description: string
) => string | null) | null = null;
let _generateWwwAuthenticateV2: ((
  resource: string,
  resourceMetadataUrl: string,
  scopes: string,
  error: string,
  description: string
) => string | null) | null = null;

/**
 * Get the library name for the current platform
 */
function getLibraryName(): string {
  switch (os.platform()) {
    case 'darwin':
      return 'libgopher-auth.dylib';
    case 'win32':
      return 'gopher-auth.dll';
    default:
      return 'libgopher-auth.so';
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

  // Library lifecycle
  _authInit = lib.func('gopher_auth_init', 'int32_t', []);
  _authShutdown = lib.func('gopher_auth_shutdown', 'void', []);
  _authVersion = lib.func('gopher_auth_version', 'const char*', []);

  // Client functions
  _clientCreate = lib.func('gopher_auth_client_create', GopherAuthClientPtr, [
    'const char*',
    'const char*',
  ]);
  _clientDestroy = lib.func('gopher_auth_client_destroy', 'void', [GopherAuthClientPtr]);
  _clientSetOption = lib.func('gopher_auth_client_set_option', 'int32_t', [
    GopherAuthClientPtr,
    'const char*',
    'const char*',
  ]);

  // Options functions
  _optionsCreate = lib.func('gopher_auth_validation_options_create', GopherAuthOptionsPtr, []);
  _optionsDestroy = lib.func('gopher_auth_validation_options_destroy', 'void', [
    GopherAuthOptionsPtr,
  ]);
  _optionsSetScopes = lib.func('gopher_auth_validation_options_set_scopes', 'void', [
    GopherAuthOptionsPtr,
    'const char*',
  ]);
  _optionsSetAudience = lib.func('gopher_auth_validation_options_set_audience', 'void', [
    GopherAuthOptionsPtr,
    'const char*',
  ]);
  _optionsSetClockSkew = lib.func('gopher_auth_validation_options_set_clock_skew', 'void', [
    GopherAuthOptionsPtr,
    'int32_t',
  ]);

  // Validation functions
  _validateToken = lib.func('gopher_auth_validate_token', GopherAuthValidationResult, [
    GopherAuthClientPtr,
    'const char*',
    GopherAuthOptionsPtr,
  ]);
  _extractPayload = lib.func('gopher_auth_extract_payload', GopherAuthPayloadPtr, [
    GopherAuthClientPtr,
    'const char*',
  ]);

  // Payload functions
  _payloadGetSubject = lib.func('gopher_auth_payload_get_subject', 'const char*', [
    GopherAuthPayloadPtr,
  ]);
  _payloadGetScopes = lib.func('gopher_auth_payload_get_scopes', 'const char*', [
    GopherAuthPayloadPtr,
  ]);
  _payloadGetAudience = lib.func('gopher_auth_payload_get_audience', 'const char*', [
    GopherAuthPayloadPtr,
  ]);
  _payloadGetExpiration = lib.func('gopher_auth_payload_get_expiration', 'int64_t', [
    GopherAuthPayloadPtr,
  ]);
  _payloadGetIssuedAt = lib.func('gopher_auth_payload_get_issued_at', 'int64_t', [
    GopherAuthPayloadPtr,
  ]);
  _payloadGetIssuer = lib.func('gopher_auth_payload_get_issuer', 'const char*', [
    GopherAuthPayloadPtr,
  ]);
  _payloadDestroy = lib.func('gopher_auth_payload_destroy', 'void', [GopherAuthPayloadPtr]);

  // Utility functions
  _freeString = lib.func('gopher_auth_free_string', 'void', ['char*']);
  _generateWwwAuthenticate = lib.func('gopher_auth_generate_www_authenticate', 'char*', [
    'const char*',
    'const char*',
    'const char*',
    'const char*',
    'const char*',
  ]);
  _generateWwwAuthenticateV2 = lib.func('gopher_auth_generate_www_authenticate_v2', 'char*', [
    'const char*',
    'const char*',
    'const char*',
    'const char*',
    'const char*',
  ]);
}

/**
 * Load the gopher-auth native library
 */
export function loadLibrary(): boolean {
  if (lib !== null) {
    return libAvailable;
  }

  debug = process.env['DEBUG'] !== undefined;
  const libraryName = getLibraryName();
  const searchPaths = getSearchPaths();

  // Try environment variable path first
  const envPath = process.env['GOPHER_AUTH_LIBRARY_PATH'];
  if (envPath && fs.existsSync(envPath)) {
    try {
      lib = koffi.load(envPath);
      setupFunctions();
      libAvailable = true;
      return true;
    } catch (e) {
      if (debug) {
        console.error(`Failed to load from GOPHER_AUTH_LIBRARY_PATH: ${(e as Error).message}`);
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
      console.error(`Failed to load gopher-auth library: ${(e as Error).message}`);
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
 * Get FFI function bindings (for internal use)
 */
export function getAuthFunctions() {
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
    payloadGetIssuedAt: _payloadGetIssuedAt,
    payloadGetIssuer: _payloadGetIssuer,
    payloadDestroy: _payloadDestroy,
    freeString: _freeString,
    generateWwwAuthenticate: _generateWwwAuthenticate,
    generateWwwAuthenticateV2: _generateWwwAuthenticateV2,
  };
}
