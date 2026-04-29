/**
 * Express middleware for JWT authentication
 *
 * CRITICAL: Auth context is attached per-request to req.authContext,
 * NEVER stored as a shared class field.
 */

import type { GopherAuth } from './gopher-auth';
import type { ExpressMiddlewareOptions } from './types';
import type { GopherAuthContext } from '../ffi/auth/types';
import { hasAllScopes } from './scope-helpers';

// Augment Express Request type
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authContext?: GopherAuthContext;
    }
  }
}

const DEFAULT_PUBLIC_PATHS = [
  '/.well-known/',
  '/oauth/',
  '/health',
  '/favicon.ico',
];

/**
 * Create Express middleware that validates JWT tokens
 */
export function expressMiddleware(
  auth: GopherAuth,
  options?: ExpressMiddlewareOptions
) {
  const publicPaths = options?.publicPaths ?? DEFAULT_PUBLIC_PATHS;
  const publicMethods = options?.publicMethods ?? [];
  const toolScopes = options?.toolScopes ?? {};

  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
  return (req: any, res: any, next: any) => {
    // Skip if auth is disabled
    if (auth.isDisabled) {
      return next();
    }

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Origin', '*');
      res.set(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS'
      );
      res.set(
        'Access-Control-Allow-Headers',
        'Authorization, Content-Type, Accept, Origin, X-Requested-With, Mcp-Session-Id'
      );
      res.set(
        'Access-Control-Expose-Headers',
        'WWW-Authenticate, Content-Length, Mcp-Session-Id'
      );
      res.set('Access-Control-Max-Age', '86400');
      return res.status(204).end();
    }

    // Check public paths
    const path = req.path || req.url || '';
    for (const pp of publicPaths) {
      if (path.startsWith(pp)) {
        return next();
      }
    }

    // Check public MCP methods
    if (req.body?.method && publicMethods.includes(req.body.method)) {
      return next();
    }

    // Extract bearer token
    let token: string | undefined;
    const authHeader = req.headers?.authorization || req.headers?.Authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
    if (!token && req.query?.access_token) {
      token = req.query.access_token;
    }

    if (!token) {
      const wwwAuth = auth.getWWWAuthenticateHeader({
        error: 'invalid_request',
        errorDescription: 'Missing bearer token',
      });
      res.set('WWW-Authenticate', wwwAuth);
      return res.status(401).json({
        error: 'invalid_request',
        error_description: 'Missing bearer token',
      });
    }

    // Validate token
    try {
      const payload = auth.validateToken(token);

      // Build per-request auth context (NEVER shared class field)
      const authContext: GopherAuthContext = {
        userId: payload.subject,
        scopes: payload.scopes,
        audience: payload.audience ?? '',
        tokenExpiry: payload.expiration ?? 0,
        authenticated: true,
        email: payload.email,
        name: payload.name,
        organizationId: payload.organization_id,
        serverId: payload.server_id,
        rawToken: token,
      };

      req.authContext = authContext;

      // Tool-level scope checking
      if (
        req.body?.method === 'tools/call' &&
        req.body?.params?.name &&
        toolScopes[req.body.params.name]
      ) {
        const required = toolScopes[req.body.params.name] ?? [];
        if (required.length > 0 && !hasAllScopes(authContext, required)) {
          return res.status(403).json({
            error: 'insufficient_scope',
            error_description: `Tool ${req.body.params.name} requires scopes: ${required.join(', ')}`,
            required_scopes: required,
            actual_scopes: authContext.scopes.split(' ').filter(Boolean),
          });
        }
      }

      next();
    } catch (err) {
      const wwwAuth = auth.getWWWAuthenticateHeader({
        error: 'invalid_token',
        errorDescription:
          err instanceof Error ? err.message : 'Token validation failed',
      });
      res.set('WWW-Authenticate', wwwAuth);
      return res.status(401).json({
        error: 'invalid_token',
        error_description:
          err instanceof Error ? err.message : 'Token validation failed',
      });
    }
  };
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
}
