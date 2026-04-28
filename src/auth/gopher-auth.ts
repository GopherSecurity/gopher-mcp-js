/**
 * GopherAuth - Reusable auth module replacing gopher-auth-sdk-nodejs
 *
 * Provides OAuth 2.0 / JWT authentication via native FFI bindings.
 * API is designed to be a near drop-in replacement for the old SDK.
 */

import {
  GopherAuthClient,
  gopherInitAuthLibrary,
  gopherShutdownAuthLibrary,
  gopherGenerateWwwAuthenticateHeaderV2,
} from '../ffi/auth/auth-client';
import { GopherAuthConfig } from '../ffi/auth/config-loader';
import { GopherOAuthClient } from '../ffi/auth/oauth-client';
import { GopherSessionManager } from '../ffi/auth/session-manager';
import { gopherAuthBuildProtectedResourceMetadata } from '../ffi/auth/loader';
import type { TokenPayload, GopherAuthContext } from '../ffi/auth/types';
import type { TokenResponse } from '../ffi/auth/oauth-client';
import { hasScope, hasAllScopes, hasAnyScope } from './scope-helpers';
import {
  TokenValidationError,
  InsufficientScopesError,
  TokenExchangeError,
  ConfigurationError,
} from './errors';
import type {
  GopherAuthOptions,
  TokenExchangeOptions,
  ExpressMiddlewareOptions,
  ProtectedResourceMetadata,
} from './types';
import { expressMiddleware } from './middleware';
import { registerOAuthRoutes } from './routes';

export class GopherAuth {
  private _config: GopherAuthConfig | null = null;
  private _authClient: GopherAuthClient | null = null;
  private _oauthClient: GopherOAuthClient | null = null;
  private _sessionManager: GopherSessionManager | null = null;
  private _options: GopherAuthOptions;
  private _initialized = false;

  constructor(options: GopherAuthOptions) {
    this._options = options;
  }

  /**
   * Initialize the auth module — loads config, creates native handles.
   * Must be called before any other method.
   */
  initialize(): void {
    if (this._initialized) return;

    if (this._options.authDisabled) {
      this._initialized = true;
      return;
    }

    // Validate configuration before loading native library
    if (!this._options.configPath && !this._options.config) {
      throw new ConfigurationError(
        'Either configPath or config must be provided'
      );
    }

    gopherInitAuthLibrary();

    // Load configuration
    if (this._options.configPath) {
      this._config = GopherAuthConfig.loadFile(this._options.configPath);
    } else if (this._options.config) {
      const c = this._options.config;
      const pairs: Record<string, string> = {};
      if (c.authServerUrl) pairs['auth_server_url'] = c.authServerUrl;
      if (c.clientId) pairs['client_id'] = c.clientId;
      if (c.clientSecret) pairs['client_secret'] = c.clientSecret;
      if (c.audience) pairs['audience'] = c.audience;
      if (c.issuer) pairs['issuer'] = c.issuer;
      if (c.jwksUri) pairs['jwks_uri'] = c.jwksUri;
      if (c.oauthAuthorizeUrl)
        pairs['oauth_authorize_url'] = c.oauthAuthorizeUrl;
      if (c.oauthTokenUrl) pairs['oauth_token_url'] = c.oauthTokenUrl;
      if (c.serverUrl) pairs['server_url'] = c.serverUrl;
      if (c.allowedScopes) pairs['allowed_scopes'] = c.allowedScopes;
      if (c.exchangeIdps) pairs['exchange_idps'] = c.exchangeIdps;
      if (c.host) pairs['host'] = c.host;
      if (c.port) pairs['port'] = String(c.port);
      if (c.jwksCacheDuration)
        pairs['jwks_cache_duration'] = String(c.jwksCacheDuration);
      this._config = GopherAuthConfig.loadFromPairs(pairs);
    }

    // _config is guaranteed non-null by the early validation check above
    const config = this._config!;

    // Create auth client
    const jwksUri = config.getString('jwks_uri');
    const issuer = config.getString('issuer');
    if (jwksUri && issuer) {
      this._authClient = new GopherAuthClient(jwksUri, issuer);

      const cacheDuration = config.getString('jwks_cache_duration');
      if (cacheDuration) {
        this._authClient.setOption('cache_duration', cacheDuration);
      }
    }

    // Create OAuth client
    const tokenEndpoint = config.getString('token_endpoint');
    const clientId = config.getString('client_id');
    const clientSecret = config.getString('client_secret');
    if (tokenEndpoint && clientId) {
      this._oauthClient = new GopherOAuthClient(
        tokenEndpoint,
        clientId,
        clientSecret || undefined,
        30
      );
    }

    // Create session manager
    this._sessionManager = new GopherSessionManager(300);

    this._initialized = true;
  }

  /**
   * Shutdown and release all native resources
   */
  shutdown(): void {
    this._sessionManager?.destroy();
    this._oauthClient?.destroy();
    this._authClient?.destroy();
    this._config?.destroy();
    this._sessionManager = null;
    this._oauthClient = null;
    this._authClient = null;
    this._config = null;
    if (this._initialized && !this._options.authDisabled) {
      gopherShutdownAuthLibrary();
    }
    this._initialized = false;
  }

  /**
   * Validate a JWT token
   * @returns TokenPayload on success
   * @throws TokenValidationError on failure
   * @throws InsufficientScopesError if requiredScopes specified and missing
   */
  validateToken(
    token: string,
    options?: { requiredScopes?: string[]; audience?: string | string[] }
  ): TokenPayload {
    this.ensureInitialized();
    if (!this._authClient) {
      throw new TokenValidationError('Auth client not initialized');
    }

    const result = this._authClient.validateToken(token);
    if (!result || !result.valid) {
      throw new TokenValidationError(
        result?.errorMessage ?? 'Token validation failed',
        result?.errorCode ?? 0
      );
    }

    const payload = this._authClient.extractPayload(token);

    // Check required scopes
    if (options?.requiredScopes && options.requiredScopes.length > 0) {
      const tokenScopes = (payload.scopes ?? '').split(' ').filter(Boolean);
      const missing = options.requiredScopes.filter(
        (s) => !tokenScopes.includes(s)
      );
      if (missing.length > 0) {
        throw new InsufficientScopesError(options.requiredScopes, tokenScopes);
      }
    }

    return payload;
  }

  /** Check if payload has a specific scope */
  hasScope(payload: TokenPayload, scope: string): boolean {
    const ctx: GopherAuthContext = {
      userId: payload.subject,
      scopes: payload.scopes,
      audience: payload.audience ?? '',
      tokenExpiry: payload.expiration ?? 0,
      authenticated: true,
    };
    return hasScope(ctx, scope);
  }

  /** Check if payload has all required scopes */
  hasAllScopes(payload: TokenPayload, scopes: string[]): boolean {
    const ctx: GopherAuthContext = {
      userId: payload.subject,
      scopes: payload.scopes,
      audience: payload.audience ?? '',
      tokenExpiry: payload.expiration ?? 0,
      authenticated: true,
    };
    return hasAllScopes(ctx, scopes);
  }

  /** Check if payload has any of the required scopes */
  hasAnyScope(payload: TokenPayload, scopes: string[]): boolean {
    const ctx: GopherAuthContext = {
      userId: payload.subject,
      scopes: payload.scopes,
      audience: payload.audience ?? '',
      tokenExpiry: payload.expiration ?? 0,
      authenticated: true,
    };
    return hasAnyScope(ctx, scopes);
  }

  /**
   * Exchange a token for an external IDP token (RFC 8693)
   * @throws TokenExchangeError on failure
   */
  exchangeToken(options: TokenExchangeOptions): TokenResponse {
    this.ensureInitialized();
    if (!this._oauthClient) {
      throw new TokenExchangeError('OAuth client not initialized');
    }

    const result = this._oauthClient.tokenExchange(
      options.subjectToken,
      options.requestedIssuer,
      options.audience,
      options.scope
    );

    if (!result.success) {
      throw new TokenExchangeError(
        result.error ?? 'Token exchange failed',
        result.error,
        result.errorDescription
      );
    }

    return result;
  }

  /**
   * Get Express middleware for authentication
   */
  expressMiddleware(options?: ExpressMiddlewareOptions) {
    return expressMiddleware(this, options);
  }

  /**
   * Register OAuth discovery and flow routes on Express app
   */
  registerOAuthRoutes(
    app: { get: Function; post: Function; options: Function },
    options?: { serverUrl?: string; allowedScopes?: string[] }
  ): void {
    registerOAuthRoutes(app, this, options);
  }

  /**
   * Get RFC 9728 Protected Resource Metadata
   */
  getProtectedResourceMetadata(): ProtectedResourceMetadata {
    const serverUrl = this._config?.getString('server_url') ?? '';
    const scopes = this._config?.getString('allowed_scopes') ?? '';
    return gopherAuthBuildProtectedResourceMetadata(
      `${serverUrl}/mcp`,
      serverUrl,
      scopes || undefined
    ) as ProtectedResourceMetadata;
  }

  /**
   * Generate WWW-Authenticate header for 401 responses
   */
  getWWWAuthenticateHeader(options?: {
    error?: string;
    errorDescription?: string;
    requiredScopes?: string[];
  }): string {
    const serverUrl = this._config?.getString('server_url') ?? '';
    const resourceMetadata = `${serverUrl}/.well-known/oauth-protected-resource`;
    const scope = options?.requiredScopes?.join(' ') ?? '';
    return gopherGenerateWwwAuthenticateHeaderV2(
      serverUrl,
      resourceMetadata,
      scope,
      options?.error ?? '',
      options?.errorDescription ?? ''
    );
  }

  /** Get token endpoint URL */
  getTokenEndpoint(): string {
    return this._config?.getString('token_endpoint') ?? '';
  }

  /** Trigger JWKS cache refresh */
  refreshJwks(): void {
    if (this._authClient) {
      this._authClient.setOption('cache_duration', '0');
      this._authClient.setOption('cache_duration', '3600');
    }
  }

  // Getters
  get authClient(): GopherAuthClient | null {
    return this._authClient;
  }
  get oauthClient(): GopherOAuthClient | null {
    return this._oauthClient;
  }
  get sessionManager(): GopherSessionManager | null {
    return this._sessionManager;
  }
  get isDisabled(): boolean {
    return this._options.authDisabled === true;
  }
  get nativeConfig(): GopherAuthConfig | null {
    return this._config;
  }

  private ensureInitialized(): void {
    if (!this._initialized) {
      throw new ConfigurationError(
        'GopherAuth not initialized. Call initialize() first.'
      );
    }
  }
}
