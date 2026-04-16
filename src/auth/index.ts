/**
 * Auth Module - Reusable OAuth/JWT authentication for MCP servers
 *
 * Drop-in replacement for gopher-auth-sdk-nodejs using native FFI bindings.
 */

// Main class
export { GopherAuth } from './gopher-auth';

// Error classes
export {
  GopherAuthError,
  TokenValidationError,
  InsufficientScopesError,
  JwksError,
  ConfigurationError,
  TokenExchangeError,
} from './errors';

// Scope helpers
export { hasScope, hasAllScopes, hasAnyScope } from './scope-helpers';

// Middleware and routes
export { expressMiddleware } from './middleware';
export { registerOAuthRoutes } from './routes';

// Types
export type {
  GopherAuthOptions,
  ExpressMiddlewareOptions,
  TokenExchangeOptions,
  OAuthRouteOptions,
  ProtectedResourceMetadata,
  TokenPayload,
  GopherAuthContext,
  ValidationResult,
  TokenResponse,
  RegistrationResponse,
  AutoRefreshResult,
} from './types';
