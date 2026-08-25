/**
 * Auth FFI Module - gopher-auth bindings for JWT token validation
 *
 * Provides OAuth 2.0 / JWT authentication support via the gopher-auth
 * native library from gopher-orch.
 *
 * @example
 * ```typescript
 * import {
 *   gopherInitAuthLibrary,
 *   gopherShutdownAuthLibrary,
 *   GopherAuthClient,
 *   GopherValidationOptions,
 *   GopherAuthError,
 * } from '@gopher.security/gopher-mcp-js';
 *
 * // Initialize the library
 * gopherInitAuthLibrary();
 *
 * // Create client
 * const client = new GopherAuthClient(jwksUri, issuer);
 *
 * // Validate token
 * const options = new GopherValidationOptions().setScopes('mcp:read');
 * const result = client.validateToken(token, options);
 *
 * if (result.valid) {
 *   const payload = client.extractPayload(token);
 *   console.log('User:', payload.subject);
 * }
 *
 * // Cleanup
 * options.destroy();
 * client.destroy();
 * gopherShutdownAuthLibrary();
 * ```
 */

// Types
export {
  GopherAuthError,
  ValidationResult,
  TokenPayload,
  GopherAuthContext,
  isGopherAuthError,
  getErrorDescription,
  gopherCreateEmptyAuthContext,
} from './types';

// High-level classes
export {
  GopherAuthClient,
  gopherInitAuthLibrary,
  gopherShutdownAuthLibrary,
  gopherGetAuthLibraryVersion,
  gopherIsAuthLibraryInitialized,
  gopherGenerateWwwAuthenticateHeader,
  gopherGenerateWwwAuthenticateHeaderV2,
} from './auth-client';

export {
  GopherValidationOptions,
  gopherCreateValidationOptions,
} from './validation-options';

export { GopherAuthConfig } from './config-loader';

export { GopherOAuthClient } from './oauth-client';
export type { TokenResponse, RegistrationResponse } from './oauth-client';

export {
  probeNativeMcpOAuthChallenge,
  fetchNativeOAuthProtectedResourceMetadata,
  fetchNativeOAuthAuthorizationServerMetadata,
} from './oauth-discovery';
export type {
  NativeMcpOAuthChallenge,
  NativeMcpOAuthChallengeHandle,
  NativeMcpOAuthResourceMetadataHandle,
  NativeMcpOAuthServerMetadataHandle,
  NativeOAuthAuthorizationServerMetadata,
  NativeOAuthProtectedResourceMetadata,
} from './oauth-discovery';

export { GopherSessionManager } from './session-manager';

export { gopherAuthAutoRefresh } from './auto-refresh';
export type { AutoRefreshResult } from './auto-refresh';

// Low-level loader and functions (for advanced use)
export {
  loadLibrary as loadAuthLibrary,
  isLibraryLoaded as isAuthLibraryLoaded,
  payloadGetClaim,
  gopherAuthValidateIdp,
  gopherAuthValidateAllScopes,
  gopherAuthValidateAnyScopes,
  gopherAuthUrlEncode,
  gopherAuthUrlDecode,
  gopherAuthBuildProtectedResourceMetadata,
  gopherAuthBuildOAuthServerMetadata,
  gopherAuthBuildOidcDiscoveryMetadata,
  gopherAuthExtractBearerToken,
  gopherAuthExtractMethod,
  gopherAuthExtractPath,
} from './loader';
