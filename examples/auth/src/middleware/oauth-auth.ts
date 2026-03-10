/**
 * OAuth Authentication Middleware
 *
 * Express middleware for JWT token validation using gopher-auth FFI.
 * Mirrors OAuthAuthFilter from the C++ example.
 */

import { Request, Response, NextFunction } from 'express';
import { AuthServerConfig } from '../config';
import {
  AuthClient,
  ValidationOptions,
  AuthContext,
  createEmptyAuthContext,
  generateWwwAuthenticateHeaderV2,
} from '@gopher.security/gopher-mcp-js';

/**
 * Extended Express Request with auth context
 */
export interface AuthenticatedRequest extends Request {
  authContext?: AuthContext;
}

/**
 * OAuth authentication middleware
 *
 * Validates JWT tokens on protected endpoints and attaches
 * the auth context to the request.
 */
export class OAuthAuthMiddleware {
  private authClient: AuthClient | null;
  private config: AuthServerConfig;
  private currentAuthContext: AuthContext = createEmptyAuthContext();

  /**
   * Create new OAuth middleware
   *
   * @param authClient - AuthClient instance for token validation (null if auth disabled)
   * @param config - Server configuration
   */
  constructor(authClient: AuthClient | null, config: AuthServerConfig) {
    this.authClient = authClient;
    this.config = config;
  }

  /**
   * Express middleware handler
   */
  middleware = (req: Request, res: Response, next: NextFunction): void => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      this.sendCorsPreflightResponse(res);
      return;
    }

    const path = req.path;

    // Check if path requires authentication
    if (!this.requiresAuth(path)) {
      next();
      return;
    }

    // Extract bearer token
    const token = this.extractToken(req);
    if (!token) {
      this.sendUnauthorized(res, 'invalid_request', 'Missing bearer token');
      return;
    }

    // Validate token
    const validationResult = this.validateToken(token);
    if (!validationResult.valid) {
      this.sendUnauthorized(
        res,
        'invalid_token',
        validationResult.errorMessage || 'Token validation failed'
      );
      return;
    }

    // Attach auth context to request
    (req as AuthenticatedRequest).authContext = this.currentAuthContext;
    next();
  };

  /**
   * Extract bearer token from request
   *
   * Checks Authorization header first, then query parameter.
   *
   * @param req - Express request
   * @returns Token string or null if not found
   */
  extractToken(req: Request): string | null {
    // Try Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Try query parameter
    const queryToken = req.query.access_token;
    if (typeof queryToken === 'string' && queryToken.length > 0) {
      return queryToken;
    }

    return null;
  }

  /**
   * Check if path requires authentication
   *
   * @param path - Request path
   * @returns true if authentication is required
   */
  requiresAuth(path: string): boolean {
    // Auth is globally disabled
    if (this.config.authDisabled) {
      return false;
    }

    // No auth client available
    if (!this.authClient) {
      return false;
    }

    // Public paths (no auth required)
    if (path.startsWith('/.well-known/')) return false;
    if (path.startsWith('/oauth/')) return false;
    if (path === '/authorize') return false;
    if (path === '/health') return false;
    if (path === '/favicon.ico') return false;

    // Protected paths (auth required)
    if (path === '/mcp' || path.startsWith('/mcp/')) return true;
    if (path === '/rpc' || path.startsWith('/rpc/')) return true;
    if (path === '/events' || path.startsWith('/events/')) return true;
    if (path === '/sse' || path.startsWith('/sse/')) return true;

    // Default: require auth for unknown paths
    return true;
  }

  /**
   * Validate JWT token using gopher-auth
   *
   * @param token - JWT token string
   * @returns Validation result
   */
  private validateToken(token: string): {
    valid: boolean;
    errorMessage: string | null;
  } {
    if (!this.authClient) {
      return { valid: false, errorMessage: 'Auth client not initialized' };
    }

    const options = new ValidationOptions();
    options.setClockSkew(30);

    try {
      const result = this.authClient.validateToken(token, options);

      if (!result.valid) {
        return { valid: false, errorMessage: result.errorMessage };
      }

      // Extract payload to populate auth context
      try {
        const payload = this.authClient.extractPayload(token);

        this.currentAuthContext = {
          userId: payload.subject,
          scopes: payload.scopes,
          audience: payload.audience || '',
          tokenExpiry: payload.expiration || 0,
          authenticated: true,
        };
      } catch {
        // Payload extraction failed, but token is valid
        this.currentAuthContext = {
          userId: '',
          scopes: '',
          audience: '',
          tokenExpiry: 0,
          authenticated: true,
        };
      }

      return { valid: true, errorMessage: null };
    } finally {
      options.destroy();
    }
  }

  /**
   * Send 401 Unauthorized response with WWW-Authenticate header
   *
   * @param res - Express response
   * @param error - OAuth error code
   * @param description - Human-readable error description
   */
  private sendUnauthorized(
    res: Response,
    error: string,
    description: string
  ): void {
    let wwwAuthenticate: string;

    try {
      wwwAuthenticate = generateWwwAuthenticateHeaderV2(
        this.config.serverUrl,
        `${this.config.serverUrl}/.well-known/oauth-protected-resource`,
        this.config.allowedScopes,
        error,
        description
      );
    } catch {
      // Fallback to basic Bearer header
      wwwAuthenticate = `Bearer realm="${this.config.serverUrl}", error="${error}", error_description="${description}"`;
    }

    res
      .status(401)
      .set('WWW-Authenticate', wwwAuthenticate)
      .set('Content-Type', 'application/json')
      .set('Access-Control-Allow-Origin', '*')
      .set('Access-Control-Expose-Headers', 'WWW-Authenticate')
      .json({
        error,
        error_description: description,
      });
  }

  /**
   * Send CORS preflight response
   *
   * @param res - Express response
   */
  private sendCorsPreflightResponse(res: Response): void {
    res
      .status(204)
      .set('Access-Control-Allow-Origin', '*')
      .set(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD'
      )
      .set(
        'Access-Control-Allow-Headers',
        'Accept, Accept-Language, Content-Language, Content-Type, Authorization, ' +
          'X-Requested-With, Origin, Cache-Control, Pragma, Mcp-Session-Id, Mcp-Protocol-Version'
      )
      .set('Access-Control-Max-Age', '86400')
      .set(
        'Access-Control-Expose-Headers',
        'WWW-Authenticate, Content-Length, Content-Type'
      )
      .end();
  }

  /**
   * Get the current authentication context
   */
  getAuthContext(): AuthContext {
    return this.currentAuthContext;
  }

  /**
   * Check if authentication is disabled
   */
  isAuthDisabled(): boolean {
    return this.config.authDisabled;
  }

  /**
   * Check if a scope is present in the current auth context
   *
   * @param scope - Scope to check
   * @returns true if scope is present
   */
  hasScope(scope: string): boolean {
    if (!this.currentAuthContext.authenticated) {
      return false;
    }
    return this.currentAuthContext.scopes.split(' ').includes(scope);
  }
}
