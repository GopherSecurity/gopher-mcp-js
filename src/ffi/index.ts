/**
 * FFI module exports.
 */

export { GopherOrchLibrary } from './library';
export type { GopherOrchHandle, GopherOrchErrorInfoData } from './library';

// Auth module exports
export {
  // Types
  GopherAuthError,
  ValidationResult,
  TokenPayload,
  AuthContext,
  isGopherAuthError,
  getErrorDescription,
  createEmptyAuthContext,
  // Classes
  AuthClient,
  ValidationOptions,
  // Functions
  initAuthLibrary,
  shutdownAuthLibrary,
  getAuthLibraryVersion,
  isAuthLibraryInitialized,
  generateWwwAuthenticateHeader,
  generateWwwAuthenticateHeaderV2,
  createValidationOptions,
  loadAuthLibrary,
  isAuthLibraryLoaded,
} from './auth';
