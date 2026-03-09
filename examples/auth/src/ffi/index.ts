/**
 * FFI Module - Barrel export for gopher-auth FFI bindings
 *
 * This module provides a unified interface for interacting with
 * the libgopher-auth native library.
 *
 * @example
 * ```typescript
 * import {
 *   initAuthLibrary,
 *   shutdownAuthLibrary,
 *   AuthClient,
 *   ValidationOptions,
 *   GopherAuthError,
 * } from './ffi';
 *
 * initAuthLibrary();
 * const client = new AuthClient(jwksUri, issuer);
 * const options = new ValidationOptions().setScopes('mcp:read');
 * const result = client.validateToken(token, options);
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

export {
  ValidationOptions,
  createValidationOptions,
} from './validation-options';

// Low-level loader (for advanced use)
export {
  loadLibrary,
  isLibraryLoaded,
  getLibrary,
} from './loader';
