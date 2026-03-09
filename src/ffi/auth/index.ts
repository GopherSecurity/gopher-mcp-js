/**
 * Auth FFI Module - gopher-auth bindings for JWT token validation
 *
 * Provides OAuth 2.0 / JWT authentication support via the gopher-auth
 * native library from gopher-orch.
 *
 * @example
 * ```typescript
 * import {
 *   initAuthLibrary,
 *   shutdownAuthLibrary,
 *   AuthClient,
 *   ValidationOptions,
 *   GopherAuthError,
 * } from '@gopher.security/gopher-mcp-js';
 *
 * // Initialize the library
 * initAuthLibrary();
 *
 * // Create client
 * const client = new AuthClient(jwksUri, issuer);
 *
 * // Validate token
 * const options = new ValidationOptions().setScopes('mcp:read');
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
 * shutdownAuthLibrary();
 * ```
 */

// Types
export {
  GopherAuthError,
  ValidationResult,
  TokenPayload,
  AuthContext,
  isGopherAuthError,
  getErrorDescription,
  createEmptyAuthContext,
} from './types';

// High-level classes
export {
  AuthClient,
  initAuthLibrary,
  shutdownAuthLibrary,
  getAuthLibraryVersion,
  isAuthLibraryInitialized,
  generateWwwAuthenticateHeader,
  generateWwwAuthenticateHeaderV2,
} from './auth-client';

export { ValidationOptions, createValidationOptions } from './validation-options';

// Low-level loader (for advanced use)
export { loadLibrary as loadAuthLibrary, isLibraryLoaded as isAuthLibraryLoaded } from './loader';
