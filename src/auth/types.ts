/**
 * Auth module type definitions
 */

// Re-export FFI types
export type {
  TokenPayload,
  GopherAuthContext,
  ValidationResult,
} from '../ffi/auth/types';
export type {
  TokenResponse,
  RegistrationResponse,
} from '../ffi/auth/oauth-client';
export type { AutoRefreshResult } from '../ffi/auth/auto-refresh';

/**
 * Options for Express middleware
 */
export interface ExpressMiddlewareOptions {
  /** Paths that skip authentication (default: /.well-known/*, /oauth/*, /health) */
  publicPaths?: string[];
  /** MCP methods that skip authentication (e.g., ['initialize']) */
  publicMethods?: string[];
  /** Tool-specific scope requirements: tool name -> required scopes */
  toolScopes?: Record<string, string[]>;
}

/**
 * Options for GopherAuth constructor
 */
export interface GopherAuthOptions {
  /** Path to server.config file */
  configPath?: string;
  /** Inline configuration (alternative to configPath) */
  config?: {
    authServerUrl?: string;
    clientId?: string;
    clientSecret?: string;
    audience?: string;
    issuer?: string;
    requiredScopes?: string[];
    jwksCacheDuration?: number;
    jwksUri?: string;
    oauthAuthorizeUrl?: string;
    oauthTokenUrl?: string;
    serverUrl?: string;
    resourceMetadataUrl?: string;
    resourceDocumentation?: string;
    allowedScopes?: string;
    exchangeIdps?: string;
    host?: string;
    port?: number;
  };
  /** Disable authentication entirely */
  authDisabled?: boolean;
}

/**
 * Options for token exchange (RFC 8693)
 */
export interface TokenExchangeOptions {
  subjectToken: string;
  requestedIssuer: string;
  audience?: string;
  scope?: string;
}

/**
 * Options for OAuth route registration
 */
export interface OAuthRouteOptions {
  /** MCP server URL (defaults to config.serverUrl) */
  serverUrl?: string;
  /** Allowed scopes for discovery metadata */
  allowedScopes?: string[];
}

/**
 * RFC 9728 Protected Resource Metadata
 */
export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported?: string[];
  bearer_methods_supported?: string[];
  resource_documentation?: string;
}
