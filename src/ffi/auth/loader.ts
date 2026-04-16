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
const GopherAuthClientPtr = koffi.pointer(
  'gopher_auth_client_t',
  koffi.opaque()
);
const GopherAuthPayloadPtr = koffi.pointer(
  'gopher_auth_token_payload_t',
  koffi.opaque()
);
const GopherAuthOptionsPtr = koffi.pointer(
  'gopher_auth_validation_options_t',
  koffi.opaque()
);

const GopherAuthSessionMgrPtr = koffi.pointer(
  'gopher_auth_session_manager_t',
  koffi.opaque()
);
const GopherAuthSessionMgrOutPtr = koffi.out(koffi.pointer(GopherAuthSessionMgrPtr));

const GopherAuthOAuthClientPtr = koffi.pointer(
  'gopher_auth_oauth_client_t',
  koffi.opaque()
);
const GopherAuthTokenResponsePtr = koffi.pointer(
  'gopher_auth_oauth_token_response_t',
  koffi.opaque()
);
const GopherAuthRegResponsePtr = koffi.pointer(
  'gopher_auth_oauth_registration_response_t',
  koffi.opaque()
);

const GopherAuthOAuthClientOutPtr = koffi.out(koffi.pointer(GopherAuthOAuthClientPtr));
const GopherAuthTokenResponseOutPtr = koffi.out(koffi.pointer(GopherAuthTokenResponsePtr));
const GopherAuthRegResponseOutPtr = koffi.out(koffi.pointer(GopherAuthRegResponsePtr));

const GopherAuthConfigPtr = koffi.pointer(
  'gopher_auth_config_t',
  koffi.opaque()
);

// Output pointer types for C API functions that use output parameters
const GopherAuthConfigOutPtr = koffi.out(koffi.pointer(GopherAuthConfigPtr));
const GopherAuthClientOutPtr = koffi.out(koffi.pointer(GopherAuthClientPtr));
const GopherAuthPayloadOutPtr = koffi.out(koffi.pointer(GopherAuthPayloadPtr));
const GopherAuthOptionsOutPtr = koffi.out(koffi.pointer(GopherAuthOptionsPtr));
const CharOutPtr = koffi.out(koffi.pointer('char*'));
const Int64OutPtr = koffi.out(koffi.pointer('int64_t'));
const IntOutPtr = koffi.out(koffi.pointer('int'));
const BoolOutPtr = koffi.out(koffi.pointer('bool'));

// Result struct
const GopherAuthValidationResult = koffi.struct(
  'gopher_auth_validation_result_t',
  {
    valid: 'bool',
    error_code: 'int32_t',
    error_message: 'const char*',
  }
);
const GopherAuthValidationResultOutPtr = koffi.out(
  koffi.pointer(GopherAuthValidationResult)
);

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

let _payloadGetClaim: koffi.KoffiFunction | null = null;

// ConfigLoader
let _configCreate: koffi.KoffiFunction | null = null;
let _configDestroy: koffi.KoffiFunction | null = null;
let _configLoadFile: koffi.KoffiFunction | null = null;
let _configLoadEnv: koffi.KoffiFunction | null = null;
let _configLoadFromPairs: koffi.KoffiFunction | null = null;
let _configValidate: koffi.KoffiFunction | null = null;
let _configGetString: koffi.KoffiFunction | null = null;
let _configGetInt: koffi.KoffiFunction | null = null;
let _configGetBool: koffi.KoffiFunction | null = null;
let _configGetExchangeIdps: koffi.KoffiFunction | null = null;

// URL Utils
let _urlEncode: koffi.KoffiFunction | null = null;
let _urlDecode: koffi.KoffiFunction | null = null;
// Metadata Builders
let _metadataBuildProtectedResource: koffi.KoffiFunction | null = null;
let _metadataBuildOAuthServer: koffi.KoffiFunction | null = null;
let _metadataBuildOidcDiscovery: koffi.KoffiFunction | null = null;
// HTTP Parsing
let _httpExtractBearerToken: koffi.KoffiFunction | null = null;
let _httpExtractMethod: koffi.KoffiFunction | null = null;
let _httpExtractPath: koffi.KoffiFunction | null = null;

// Validation (IDP + multi-scope)
let _validateIdp: koffi.KoffiFunction | null = null;
let _validateAllScopes: koffi.KoffiFunction | null = null;
let _validateAnyScopes: koffi.KoffiFunction | null = null;

// Auto-Refresh
let _autoRefresh: koffi.KoffiFunction | null = null;

// SessionManager
let _sessionManagerCreate: koffi.KoffiFunction | null = null;
let _sessionManagerDestroy: koffi.KoffiFunction | null = null;
let _sessionStoreToken: koffi.KoffiFunction | null = null;
let _sessionGetAccessToken: koffi.KoffiFunction | null = null;
let _sessionGetRefreshToken: koffi.KoffiFunction | null = null;
let _sessionHasValidToken: koffi.KoffiFunction | null = null;
let _sessionCleanup: koffi.KoffiFunction | null = null;
let _sessionGenerateId: koffi.KoffiFunction | null = null;

// OAuthClient
let _oauthClientCreate: koffi.KoffiFunction | null = null;
let _oauthClientDestroy: koffi.KoffiFunction | null = null;
let _oauthExchangeCode: koffi.KoffiFunction | null = null;
let _oauthRefreshToken: koffi.KoffiFunction | null = null;
let _oauthTokenExchange: koffi.KoffiFunction | null = null;
let _oauthRegisterClient: koffi.KoffiFunction | null = null;
let _tokenResponseGetAccessToken: koffi.KoffiFunction | null = null;
let _tokenResponseGetRefreshToken: koffi.KoffiFunction | null = null;
let _tokenResponseGetExpiresIn: koffi.KoffiFunction | null = null;
let _tokenResponseGetError: koffi.KoffiFunction | null = null;
let _tokenResponseIsSuccess: koffi.KoffiFunction | null = null;
let _tokenResponseDestroy: koffi.KoffiFunction | null = null;
let _registrationResponseGetClientId: koffi.KoffiFunction | null = null;
let _registrationResponseGetClientSecret: koffi.KoffiFunction | null = null;
let _registrationResponseIsSuccess: koffi.KoffiFunction | null = null;
let _registrationResponseDestroy: koffi.KoffiFunction | null = null;

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
  _clientDestroy = lib.func('gopher_auth_client_destroy', 'int32_t', [
    GopherAuthClientPtr,
  ]);
  _clientSetOption = lib.func('gopher_auth_client_set_option', 'int32_t', [
    GopherAuthClientPtr,
    'const char*',
    'const char*',
  ]);

  // Options functions - use output parameters
  // gopher_auth_error_t gopher_auth_validation_options_create(gopher_auth_validation_options_t* options);
  _optionsCreate = lib.func(
    'gopher_auth_validation_options_create',
    'int32_t',
    [GopherAuthOptionsOutPtr]
  );
  _optionsDestroy = lib.func(
    'gopher_auth_validation_options_destroy',
    'int32_t',
    [GopherAuthOptionsPtr]
  );
  _optionsSetScopes = lib.func(
    'gopher_auth_validation_options_set_scopes',
    'int32_t',
    [GopherAuthOptionsPtr, 'const char*']
  );
  _optionsSetAudience = lib.func(
    'gopher_auth_validation_options_set_audience',
    'int32_t',
    [GopherAuthOptionsPtr, 'const char*']
  );
  _optionsSetClockSkew = lib.func(
    'gopher_auth_validation_options_set_clock_skew',
    'int32_t',
    [GopherAuthOptionsPtr, 'int64_t']
  );

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
  _payloadGetAudience = lib.func(
    'gopher_auth_payload_get_audience',
    'int32_t',
    [GopherAuthPayloadPtr, CharOutPtr]
  );
  _payloadGetExpiration = lib.func(
    'gopher_auth_payload_get_expiration',
    'int32_t',
    [GopherAuthPayloadPtr, Int64OutPtr]
  );
  _payloadGetIssuer = lib.func('gopher_auth_payload_get_issuer', 'int32_t', [
    GopherAuthPayloadPtr,
    CharOutPtr,
  ]);
  _payloadDestroy = lib.func('gopher_auth_payload_destroy', 'int32_t', [
    GopherAuthPayloadPtr,
  ]);
  // gopher_auth_error_t gopher_auth_payload_get_claim(payload, const char* claim_name, char** value);
  _payloadGetClaim = lib.func('gopher_auth_payload_get_claim', 'int32_t', [
    GopherAuthPayloadPtr,
    'const char*',
    CharOutPtr,
  ]);

  // ConfigLoader functions
  _configCreate = lib.func('gopher_auth_config_create', 'int32_t', [
    GopherAuthConfigOutPtr,
  ]);
  _configDestroy = lib.func('gopher_auth_config_destroy', 'int32_t', [
    GopherAuthConfigPtr,
  ]);
  _configLoadFile = lib.func('gopher_auth_config_load_file', 'int32_t', [
    GopherAuthConfigPtr,
    'const char*',
  ]);
  _configLoadEnv = lib.func('gopher_auth_config_load_env', 'int32_t', [
    GopherAuthConfigPtr,
  ]);
  _configLoadFromPairs = lib.func(
    'gopher_auth_config_load_from_pairs',
    'int32_t',
    [GopherAuthConfigPtr, 'const char**', 'const char**', 'int']
  );
  _configValidate = lib.func('gopher_auth_config_validate', 'int32_t', [
    GopherAuthConfigPtr,
  ]);
  _configGetString = lib.func('gopher_auth_config_get_string', 'int32_t', [
    GopherAuthConfigPtr,
    'const char*',
    CharOutPtr,
  ]);
  _configGetInt = lib.func('gopher_auth_config_get_int', 'int32_t', [
    GopherAuthConfigPtr,
    'const char*',
    IntOutPtr,
  ]);
  _configGetBool = lib.func('gopher_auth_config_get_bool', 'int32_t', [
    GopherAuthConfigPtr,
    'const char*',
    BoolOutPtr,
  ]);
  _configGetExchangeIdps = lib.func(
    'gopher_auth_config_get_exchange_idps',
    'int32_t',
    [GopherAuthConfigPtr, CharOutPtr]
  );

  // URL Utils
  _urlEncode = lib.func('gopher_auth_url_encode', 'int32_t', ['const char*', CharOutPtr]);
  _urlDecode = lib.func('gopher_auth_url_decode', 'int32_t', ['const char*', CharOutPtr]);

  // Metadata Builders
  _metadataBuildProtectedResource = lib.func('gopher_auth_metadata_build_protected_resource', 'int32_t', [
    'const char*', 'const char*', 'const char*', CharOutPtr,
  ]);
  _metadataBuildOAuthServer = lib.func('gopher_auth_metadata_build_oauth_server', 'int32_t', [
    'const char*', 'const char*', 'const char*', 'const char*', 'const char*', 'const char*', CharOutPtr,
  ]);
  _metadataBuildOidcDiscovery = lib.func('gopher_auth_metadata_build_oidc_discovery', 'int32_t', [
    'const char*', 'const char*', 'const char*', 'const char*', 'const char*', 'const char*', 'const char*', 'const char*', CharOutPtr,
  ]);

  // HTTP Parsing
  _httpExtractBearerToken = lib.func('gopher_auth_http_extract_bearer_token', 'int32_t', ['const char*', CharOutPtr]);
  _httpExtractMethod = lib.func('gopher_auth_http_extract_method', 'int32_t', ['const char*', CharOutPtr]);
  _httpExtractPath = lib.func('gopher_auth_http_extract_path', 'int32_t', ['const char*', CharOutPtr]);

  // Validation (IDP + multi-scope)
  _validateIdp = lib.func('gopher_auth_validate_idp', 'int32_t', [
    'const char*', 'const char*', BoolOutPtr,
  ]);
  _validateAllScopes = lib.func('gopher_auth_validate_all_scopes', 'int32_t', [
    'const char*', 'const char*', BoolOutPtr,
  ]);
  _validateAnyScopes = lib.func('gopher_auth_validate_any_scopes', 'int32_t', [
    'const char*', 'const char*', BoolOutPtr,
  ]);

  // Auto-Refresh
  _autoRefresh = lib.func('gopher_auth_auto_refresh', 'int32_t', [
    GopherAuthClientPtr, GopherAuthOAuthClientPtr, GopherAuthSessionMgrPtr,
    'const char*', CharOutPtr, GopherAuthValidationResultOutPtr,
  ]);

  // SessionManager functions
  _sessionManagerCreate = lib.func('gopher_auth_session_manager_create', 'int32_t', [
    GopherAuthSessionMgrOutPtr, 'int',
  ]);
  _sessionManagerDestroy = lib.func('gopher_auth_session_manager_destroy', 'int32_t', [
    GopherAuthSessionMgrPtr,
  ]);
  _sessionStoreToken = lib.func('gopher_auth_session_store_token', 'int32_t', [
    GopherAuthSessionMgrPtr, 'const char*', 'const char*', 'const char*', 'int64_t',
  ]);
  _sessionGetAccessToken = lib.func('gopher_auth_session_get_access_token', 'int32_t', [
    GopherAuthSessionMgrPtr, 'const char*', CharOutPtr,
  ]);
  _sessionGetRefreshToken = lib.func('gopher_auth_session_get_refresh_token', 'int32_t', [
    GopherAuthSessionMgrPtr, 'const char*', CharOutPtr,
  ]);
  _sessionHasValidToken = lib.func('gopher_auth_session_has_valid_token', 'int32_t', [
    GopherAuthSessionMgrPtr, 'const char*', BoolOutPtr,
  ]);
  _sessionCleanup = lib.func('gopher_auth_session_cleanup', 'int32_t', [
    GopherAuthSessionMgrPtr,
  ]);
  _sessionGenerateId = lib.func('gopher_auth_session_generate_id', 'int32_t', [
    CharOutPtr,
  ]);

  // OAuthClient functions
  _oauthClientCreate = lib.func('gopher_auth_oauth_client_create', 'int32_t', [
    GopherAuthOAuthClientOutPtr, 'const char*', 'const char*', 'const char*', 'int',
  ]);
  _oauthClientDestroy = lib.func('gopher_auth_oauth_client_destroy', 'int32_t', [
    GopherAuthOAuthClientPtr,
  ]);
  _oauthExchangeCode = lib.func('gopher_auth_oauth_exchange_code', 'int32_t', [
    GopherAuthOAuthClientPtr, 'const char*', 'const char*', 'const char*',
    GopherAuthTokenResponseOutPtr,
  ]);
  _oauthRefreshToken = lib.func('gopher_auth_oauth_refresh_token', 'int32_t', [
    GopherAuthOAuthClientPtr, 'const char*', GopherAuthTokenResponseOutPtr,
  ]);
  _oauthTokenExchange = lib.func('gopher_auth_oauth_token_exchange', 'int32_t', [
    GopherAuthOAuthClientPtr, 'const char*', 'const char*', 'const char*',
    'const char*', GopherAuthTokenResponseOutPtr,
  ]);
  _oauthRegisterClient = lib.func('gopher_auth_oauth_register_client', 'int32_t', [
    GopherAuthOAuthClientPtr, 'const char*', 'const char*', 'const char**',
    'int', 'const char*', GopherAuthRegResponseOutPtr,
  ]);
  _tokenResponseGetAccessToken = lib.func('gopher_auth_token_response_get_access_token', 'int32_t', [
    GopherAuthTokenResponsePtr, CharOutPtr,
  ]);
  _tokenResponseGetRefreshToken = lib.func('gopher_auth_token_response_get_refresh_token', 'int32_t', [
    GopherAuthTokenResponsePtr, CharOutPtr,
  ]);
  _tokenResponseGetExpiresIn = lib.func('gopher_auth_token_response_get_expires_in', 'int32_t', [
    GopherAuthTokenResponsePtr, Int64OutPtr,
  ]);
  _tokenResponseGetError = lib.func('gopher_auth_token_response_get_error', 'int32_t', [
    GopherAuthTokenResponsePtr, CharOutPtr,
  ]);
  _tokenResponseIsSuccess = lib.func('gopher_auth_token_response_is_success', 'bool', [
    GopherAuthTokenResponsePtr,
  ]);
  _tokenResponseDestroy = lib.func('gopher_auth_token_response_destroy', 'int32_t', [
    GopherAuthTokenResponsePtr,
  ]);
  _registrationResponseGetClientId = lib.func('gopher_auth_registration_response_get_client_id', 'int32_t', [
    GopherAuthRegResponsePtr, CharOutPtr,
  ]);
  _registrationResponseGetClientSecret = lib.func('gopher_auth_registration_response_get_client_secret', 'int32_t', [
    GopherAuthRegResponsePtr, CharOutPtr,
  ]);
  _registrationResponseIsSuccess = lib.func('gopher_auth_registration_response_is_success', 'bool', [
    GopherAuthRegResponsePtr,
  ]);
  _registrationResponseDestroy = lib.func('gopher_auth_registration_response_destroy', 'int32_t', [
    GopherAuthRegResponsePtr,
  ]);

  // Utility functions
  _freeString = lib.func('gopher_auth_free_string', 'void', ['char*']);
  // gopher_auth_error_t gopher_auth_generate_www_authenticate(realm, error, description, char** header);
  _generateWwwAuthenticate = lib.func(
    'gopher_auth_generate_www_authenticate',
    'int32_t',
    ['const char*', 'const char*', 'const char*', CharOutPtr]
  );
  _generateWwwAuthenticateV2 = lib.func(
    'gopher_auth_generate_www_authenticate_v2',
    'int32_t',
    [
      'const char*',
      'const char*',
      'const char*',
      'const char*',
      'const char*',
      CharOutPtr,
    ]
  );
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
  const envPath =
    process.env['GOPHER_ORCH_LIBRARY_PATH'] ||
    process.env['GOPHER_AUTH_LIBRARY_PATH'];
  if (envPath && fs.existsSync(envPath)) {
    try {
      lib = koffi.load(envPath);
      setupFunctions();
      libAvailable = true;
      return true;
    } catch (e) {
      if (debug) {
        console.error(
          `Failed to load from environment path: ${(e as Error).message}`
        );
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
          console.error(
            `Failed to load from ${searchPath}: ${(e as Error).message}`
          );
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
      console.error(
        `Failed to load gopher-orch library: ${(e as Error).message}`
      );
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
    payloadGetClaim: _payloadGetClaim,
    payloadDestroy: _payloadDestroy,
    urlEncode: _urlEncode,
    urlDecode: _urlDecode,
    metadataBuildProtectedResource: _metadataBuildProtectedResource,
    metadataBuildOAuthServer: _metadataBuildOAuthServer,
    metadataBuildOidcDiscovery: _metadataBuildOidcDiscovery,
    httpExtractBearerToken: _httpExtractBearerToken,
    httpExtractMethod: _httpExtractMethod,
    httpExtractPath: _httpExtractPath,
    validateIdp: _validateIdp,
    validateAllScopes: _validateAllScopes,
    validateAnyScopes: _validateAnyScopes,
    autoRefresh: _autoRefresh,
    sessionManagerCreate: _sessionManagerCreate,
    sessionManagerDestroy: _sessionManagerDestroy,
    sessionStoreToken: _sessionStoreToken,
    sessionGetAccessToken: _sessionGetAccessToken,
    sessionGetRefreshToken: _sessionGetRefreshToken,
    sessionHasValidToken: _sessionHasValidToken,
    sessionCleanup: _sessionCleanup,
    sessionGenerateId: _sessionGenerateId,
    oauthClientCreate: _oauthClientCreate,
    oauthClientDestroy: _oauthClientDestroy,
    oauthExchangeCode: _oauthExchangeCode,
    oauthRefreshToken: _oauthRefreshToken,
    oauthTokenExchange: _oauthTokenExchange,
    oauthRegisterClient: _oauthRegisterClient,
    tokenResponseGetAccessToken: _tokenResponseGetAccessToken,
    tokenResponseGetRefreshToken: _tokenResponseGetRefreshToken,
    tokenResponseGetExpiresIn: _tokenResponseGetExpiresIn,
    tokenResponseGetError: _tokenResponseGetError,
    tokenResponseIsSuccess: _tokenResponseIsSuccess,
    tokenResponseDestroy: _tokenResponseDestroy,
    registrationResponseGetClientId: _registrationResponseGetClientId,
    registrationResponseGetClientSecret: _registrationResponseGetClientSecret,
    registrationResponseIsSuccess: _registrationResponseIsSuccess,
    registrationResponseDestroy: _registrationResponseDestroy,
    configCreate: _configCreate,
    configDestroy: _configDestroy,
    configLoadFile: _configLoadFile,
    configLoadEnv: _configLoadEnv,
    configLoadFromPairs: _configLoadFromPairs,
    configValidate: _configValidate,
    configGetString: _configGetString,
    configGetInt: _configGetInt,
    configGetBool: _configGetBool,
    configGetExchangeIdps: _configGetExchangeIdps,
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
  return _authInit() as number;
}

/**
 * Shutdown the auth library
 * @returns Error code (0 = success)
 */
export function authShutdown(): number {
  if (!_authShutdown) throw new Error('Library not loaded');
  return _authShutdown() as number;
}

/**
 * Get library version string
 */
export function authVersion(): string {
  if (!_authVersion) throw new Error('Library not loaded');
  return _authVersion() as string;
}

/**
 * Create an auth client
 * @returns Client handle or null on error
 */
export function clientCreate(jwksUri: string, issuer: string): unknown {
  if (!_clientCreate) throw new Error('Library not loaded');

  const clientOut: unknown[] = [null];
  const result = _clientCreate(clientOut, jwksUri, issuer) as number;

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
  return _clientDestroy(client) as number;
}

/**
 * Set client option
 */
export function clientSetOption(
  client: unknown,
  option: string,
  value: string
): number {
  if (!_clientSetOption) throw new Error('Library not loaded');
  return _clientSetOption(client, option, value) as number;
}

/**
 * Create validation options
 */
export function optionsCreate(): unknown {
  if (!_optionsCreate) throw new Error('Library not loaded');

  const optionsOut: unknown[] = [null];
  const result = _optionsCreate(optionsOut) as number;

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
  return _optionsDestroy(options) as number;
}

/**
 * Set required scopes
 */
export function optionsSetScopes(options: unknown, scopes: string): number {
  if (!_optionsSetScopes) throw new Error('Library not loaded');
  return _optionsSetScopes(options, scopes) as number;
}

/**
 * Set required audience
 */
export function optionsSetAudience(options: unknown, audience: string): number {
  if (!_optionsSetAudience) throw new Error('Library not loaded');
  return _optionsSetAudience(options, audience) as number;
}

/**
 * Set clock skew tolerance
 */
export function optionsSetClockSkew(options: unknown, seconds: number): number {
  if (!_optionsSetClockSkew) throw new Error('Library not loaded');
  return _optionsSetClockSkew(options, seconds) as number;
}

/**
 * Validate a token
 */
export function validateToken(
  client: unknown,
  token: string,
  options: unknown
): { valid: boolean; error_code: number; error_message: string | null } | null {
  if (!_validateToken) throw new Error('Library not loaded');

  const resultOut: unknown[] = [
    { valid: false, error_code: 0, error_message: null },
  ];
  const err = _validateToken(client, token, options, resultOut) as number;

  if (err !== 0) {
    return null;
  }

  return resultOut[0] as {
    valid: boolean;
    error_code: number;
    error_message: string | null;
  };
}

/**
 * Extract payload from token
 */
export function extractPayload(token: string): unknown {
  if (!_extractPayload) throw new Error('Library not loaded');

  const payloadOut: unknown[] = [null];
  const result = _extractPayload(token, payloadOut) as number;

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
  const result = _payloadGetSubject(payload, valueOut) as number;

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
  const result = _payloadGetScopes(payload, valueOut) as number;

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
  const result = _payloadGetAudience(payload, valueOut) as number;

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
  const result = _payloadGetExpiration(payload, valueOut) as number;

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
  const result = _payloadGetIssuer(payload, valueOut) as number;

  if (result !== 0) {
    return null;
  }

  return valueOut[0] ?? null;
}

/**
 * Get custom claim from payload by name
 */
export function payloadGetClaim(
  payload: unknown,
  claimName: string
): string | null {
  if (!_payloadGetClaim) throw new Error('Library not loaded');

  const valueOut: (string | null)[] = [null];
  const result = _payloadGetClaim(payload, claimName, valueOut) as number;

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
  return _payloadDestroy(payload) as number;
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
  const result = _generateWwwAuthenticate(
    realm,
    error,
    description,
    headerOut
  ) as number;

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
  const result = _generateWwwAuthenticateV2(
    realm,
    resourceMetadata,
    scope,
    error,
    description,
    headerOut
  ) as number;

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
    payloadGetClaim,
    payloadDestroy,
    freeString,
    generateWwwAuthenticate,
    generateWwwAuthenticateV2,
  };
}

// ============================================================================
// ConfigLoader high-level wrappers
// ============================================================================

/**
 * Create a config handle
 */
export function configCreate(): unknown {
  if (!_configCreate) throw new Error('Library not loaded');
  const out: unknown[] = [null];
  const result = _configCreate(out) as number;
  if (result !== 0) return null;
  return out[0];
}

/**
 * Destroy a config handle
 */
export function configDestroy(config: unknown): number {
  if (!_configDestroy) throw new Error('Library not loaded');
  return _configDestroy(config) as number;
}

/**
 * Load config from file
 */
export function configLoadFile(config: unknown, filepath: string): number {
  if (!_configLoadFile) throw new Error('Library not loaded');
  return _configLoadFile(config, filepath) as number;
}

/**
 * Load config from environment variables
 */
export function configLoadEnv(config: unknown): number {
  if (!_configLoadEnv) throw new Error('Library not loaded');
  return _configLoadEnv(config) as number;
}

/**
 * Load config from key-value arrays
 */
export function configLoadFromPairs(
  config: unknown,
  keys: string[],
  values: string[],
  count: number
): number {
  if (!_configLoadFromPairs) throw new Error('Library not loaded');
  return _configLoadFromPairs(config, keys, values, count) as number;
}

/**
 * Validate config and derive Keycloak endpoints
 */
export function configValidate(config: unknown): number {
  if (!_configValidate) throw new Error('Library not loaded');
  return _configValidate(config) as number;
}

/**
 * Get string value from config
 */
export function configGetString(
  config: unknown,
  key: string
): string | null {
  if (!_configGetString) throw new Error('Library not loaded');
  const out: (string | null)[] = [null];
  const result = _configGetString(config, key, out) as number;
  if (result !== 0) return null;
  return out[0] ?? null;
}

/**
 * Get integer value from config
 */
export function configGetInt(config: unknown, key: string): number {
  if (!_configGetInt) throw new Error('Library not loaded');
  const out: number[] = [0];
  const result = _configGetInt(config, key, out) as number;
  if (result !== 0) return 0;
  return out[0] ?? 0;
}

/**
 * Get boolean value from config
 */
export function configGetBool(config: unknown, key: string): boolean {
  if (!_configGetBool) throw new Error('Library not loaded');
  const out: boolean[] = [false];
  const result = _configGetBool(config, key, out) as number;
  if (result !== 0) return false;
  return out[0] ?? false;
}

/**
 * Get exchange IDPs as comma-separated string
 */
export function configGetExchangeIdps(config: unknown): string | null {
  if (!_configGetExchangeIdps) throw new Error('Library not loaded');
  const out: (string | null)[] = [null];
  const result = _configGetExchangeIdps(config, out) as number;
  if (result !== 0) return null;
  return out[0] ?? null;
}

// ============================================================================
// URL Utils high-level wrappers
// ============================================================================

export function gopherAuthUrlEncode(input: string): string {
  if (!_urlEncode) throw new Error('Library not loaded');
  const out: (string | null)[] = [null];
  _urlEncode(input, out);
  return out[0] ?? '';
}

export function gopherAuthUrlDecode(input: string): string {
  if (!_urlDecode) throw new Error('Library not loaded');
  const out: (string | null)[] = [null];
  _urlDecode(input, out);
  return out[0] ?? '';
}

// ============================================================================
// Metadata Builder high-level wrappers
// ============================================================================

export function gopherAuthBuildProtectedResourceMetadata(
  resourceUrl: string,
  authServerUrl: string,
  scopes?: string
): object {
  if (!_metadataBuildProtectedResource) throw new Error('Library not loaded');
  const out: (string | null)[] = [null];
  _metadataBuildProtectedResource(resourceUrl, authServerUrl, scopes ?? null, out);
  return out[0] ? JSON.parse(out[0]) : {};
}

export function gopherAuthBuildOAuthServerMetadata(
  issuer: string,
  authEndpoint: string,
  tokenEndpoint: string,
  registrationEndpoint?: string,
  jwksUri?: string,
  scopes?: string
): object {
  if (!_metadataBuildOAuthServer) throw new Error('Library not loaded');
  const out: (string | null)[] = [null];
  _metadataBuildOAuthServer(
    issuer, authEndpoint, tokenEndpoint,
    registrationEndpoint ?? null, jwksUri ?? null, scopes ?? null, out
  );
  return out[0] ? JSON.parse(out[0]) : {};
}

export function gopherAuthBuildOidcDiscoveryMetadata(
  issuer: string,
  authEndpoint: string,
  tokenEndpoint: string,
  jwksUri?: string,
  registrationEndpoint?: string,
  scopes?: string,
  userinfoEndpoint?: string,
  endSessionEndpoint?: string
): object {
  if (!_metadataBuildOidcDiscovery) throw new Error('Library not loaded');
  const out: (string | null)[] = [null];
  _metadataBuildOidcDiscovery(
    issuer, authEndpoint, tokenEndpoint,
    jwksUri ?? null, registrationEndpoint ?? null, scopes ?? null,
    userinfoEndpoint ?? null, endSessionEndpoint ?? null, out
  );
  return out[0] ? JSON.parse(out[0]) : {};
}

// ============================================================================
// HTTP Parsing high-level wrappers
// ============================================================================

export function gopherAuthExtractBearerToken(httpData: string): string | null {
  if (!_httpExtractBearerToken) throw new Error('Library not loaded');
  const out: (string | null)[] = [null];
  _httpExtractBearerToken(httpData, out);
  return out[0] ?? null;
}

export function gopherAuthExtractMethod(httpData: string): string | null {
  if (!_httpExtractMethod) throw new Error('Library not loaded');
  const out: (string | null)[] = [null];
  _httpExtractMethod(httpData, out);
  return out[0] ?? null;
}

export function gopherAuthExtractPath(httpData: string): string | null {
  if (!_httpExtractPath) throw new Error('Library not loaded');
  const out: (string | null)[] = [null];
  _httpExtractPath(httpData, out);
  return out[0] ?? null;
}

// ============================================================================
// Validation high-level wrappers
// ============================================================================

export function gopherAuthValidateIdp(
  exchangeIdpsCsv: string,
  requestedIssuer: string
): boolean {
  if (!_validateIdp) throw new Error('Library not loaded');
  const out: boolean[] = [false];
  const result = _validateIdp(exchangeIdpsCsv, requestedIssuer, out) as number;
  if (result !== 0) return false;
  return out[0] ?? false;
}

export function gopherAuthValidateAllScopes(
  scopes: string,
  requiredScopes: string
): boolean {
  if (!_validateAllScopes) throw new Error('Library not loaded');
  const out: boolean[] = [false];
  const result = _validateAllScopes(scopes, requiredScopes, out) as number;
  if (result !== 0) return false;
  return out[0] ?? false;
}

export function gopherAuthValidateAnyScopes(
  scopes: string,
  requiredScopes: string
): boolean {
  if (!_validateAnyScopes) throw new Error('Library not loaded');
  const out: boolean[] = [false];
  const result = _validateAnyScopes(scopes, requiredScopes, out) as number;
  if (result !== 0) return false;
  return out[0] ?? false;
}
