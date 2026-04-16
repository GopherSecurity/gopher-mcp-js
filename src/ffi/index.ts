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
  GopherAuthContext,
  isGopherAuthError,
  getErrorDescription,
  gopherCreateEmptyAuthContext,
  // Classes
  GopherAuthClient,
  GopherValidationOptions,
  // Functions
  gopherInitAuthLibrary,
  gopherShutdownAuthLibrary,
  gopherGetAuthLibraryVersion,
  gopherIsAuthLibraryInitialized,
  gopherGenerateWwwAuthenticateHeader,
  gopherGenerateWwwAuthenticateHeaderV2,
  gopherCreateValidationOptions,
  loadAuthLibrary,
  isAuthLibraryLoaded,
  payloadGetClaim,
  GopherAuthConfig,
} from './auth';
