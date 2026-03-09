/**
 * OAuth Discovery Endpoints
 *
 * Implements OAuth 2.0 discovery endpoints:
 * - /.well-known/oauth-protected-resource (RFC 9728)
 * - /.well-known/oauth-authorization-server (RFC 8414)
 * - /.well-known/openid-configuration
 * - /oauth/authorize (redirect to IdP)
 */

import { Express, Request, Response } from 'express';
import { AuthServerConfig } from '../config';

/**
 * Set common CORS headers on response
 *
 * @param res - Express response object
 */
function setCorsHeaders(res: Response): void {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, Origin, X-Requested-With');
  res.set('Access-Control-Expose-Headers', 'WWW-Authenticate, Content-Length');
  res.set('Access-Control-Max-Age', '86400');
}

/**
 * OAuth Protected Resource Metadata (RFC 9728)
 */
export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported?: string[];
  bearer_methods_supported?: string[];
  resource_documentation?: string;
}

/**
 * OAuth Authorization Server Metadata (RFC 8414)
 */
export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri?: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported: string[];
  grant_types_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  code_challenge_methods_supported?: string[];
}

/**
 * OpenID Connect Discovery Metadata
 */
export interface OpenIDConfiguration extends AuthorizationServerMetadata {
  userinfo_endpoint?: string;
  subject_types_supported?: string[];
  id_token_signing_alg_values_supported?: string[];
}

/**
 * Register OAuth discovery endpoints
 *
 * @param app - Express application instance
 * @param config - Server configuration
 */
export function registerOAuthEndpoints(app: Express, config: AuthServerConfig): void {
  // OPTIONS handler for CORS preflight - applies to all .well-known endpoints
  app.options('/.well-known/oauth-protected-resource', (_req: Request, res: Response) => {
    setCorsHeaders(res);
    res.status(204).set('Content-Length', '0').end();
  });

  // RFC 9728: Resource-specific discovery URL for /mcp endpoint
  // MCP Inspector requests: /.well-known/oauth-protected-resource/mcp
  app.options('/.well-known/oauth-protected-resource/mcp', (_req: Request, res: Response) => {
    setCorsHeaders(res);
    res.status(204).set('Content-Length', '0').end();
  });

  app.options('/.well-known/oauth-authorization-server', (_req: Request, res: Response) => {
    setCorsHeaders(res);
    res.status(204).set('Content-Length', '0').end();
  });

  app.options('/.well-known/openid-configuration', (_req: Request, res: Response) => {
    setCorsHeaders(res);
    res.status(204).set('Content-Length', '0').end();
  });

  app.options('/oauth/authorize', (_req: Request, res: Response) => {
    setCorsHeaders(res);
    res.status(204).set('Content-Length', '0').end();
  });

  // Helper to build protected resource metadata
  const buildProtectedResourceMetadata = (): ProtectedResourceMetadata => ({
    resource: `${config.serverUrl}/mcp`,
    authorization_servers: [config.serverUrl],
    scopes_supported: config.allowedScopes.split(' ').filter(Boolean),
    bearer_methods_supported: ['header', 'query'],
    resource_documentation: `${config.serverUrl}/docs`,
  });

  // RFC 9728 - Protected Resource Metadata (root)
  app.get('/.well-known/oauth-protected-resource', (_req: Request, res: Response) => {
    setCorsHeaders(res);
    res.status(200).json(buildProtectedResourceMetadata());
  });

  // RFC 9728: Resource-specific discovery URL for /mcp endpoint
  // MCP Inspector requests: /.well-known/oauth-protected-resource/mcp
  app.get('/.well-known/oauth-protected-resource/mcp', (_req: Request, res: Response) => {
    setCorsHeaders(res);
    res.status(200).json(buildProtectedResourceMetadata());
  });

  // RFC 8414 - OAuth Authorization Server Metadata
  app.get('/.well-known/oauth-authorization-server', (_req: Request, res: Response) => {
    const authEndpoint = config.oauthAuthorizeUrl ||
      `${config.authServerUrl}/protocol/openid-connect/auth`;
    const tokenEndpoint = config.oauthTokenUrl ||
      `${config.authServerUrl}/protocol/openid-connect/token`;

    const metadata: AuthorizationServerMetadata = {
      issuer: config.issuer || config.serverUrl,
      authorization_endpoint: authEndpoint,
      token_endpoint: tokenEndpoint,
      jwks_uri: config.jwksUri,
      scopes_supported: config.allowedScopes.split(' ').filter(Boolean),
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      code_challenge_methods_supported: ['S256'],
    };

    setCorsHeaders(res);
    res.status(200).json(metadata);
  });

  // OpenID Connect Discovery
  app.get('/.well-known/openid-configuration', (_req: Request, res: Response) => {
    const authEndpoint = config.oauthAuthorizeUrl ||
      `${config.authServerUrl}/protocol/openid-connect/auth`;
    const tokenEndpoint = config.oauthTokenUrl ||
      `${config.authServerUrl}/protocol/openid-connect/token`;

    const baseScopes = ['openid', 'profile', 'email'];
    const customScopes = config.allowedScopes.split(' ').filter(Boolean);
    const allScopes = [...new Set([...baseScopes, ...customScopes])];

    const metadata: OpenIDConfiguration = {
      issuer: config.issuer || config.serverUrl,
      authorization_endpoint: authEndpoint,
      token_endpoint: tokenEndpoint,
      jwks_uri: config.jwksUri,
      userinfo_endpoint: config.authServerUrl
        ? `${config.authServerUrl}/protocol/openid-connect/userinfo`
        : undefined,
      scopes_supported: allScopes,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      code_challenge_methods_supported: ['S256'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
    };

    setCorsHeaders(res);
    res.status(200).json(metadata);
  });

  // OAuth Authorization redirect
  app.get('/oauth/authorize', (req: Request, res: Response) => {
    const authEndpoint = config.oauthAuthorizeUrl ||
      `${config.authServerUrl}/protocol/openid-connect/auth`;

    try {
      const authUrl = new URL(authEndpoint);

      // Forward all query parameters
      for (const [key, value] of Object.entries(req.query)) {
        if (typeof value === 'string') {
          authUrl.searchParams.set(key, value);
        } else if (Array.isArray(value)) {
          // Handle array parameters (use first value)
          const firstValue = value[0];
          if (typeof firstValue === 'string') {
            authUrl.searchParams.set(key, firstValue);
          }
        }
      }

      setCorsHeaders(res);
      res.redirect(302, authUrl.toString());
    } catch (error) {
      setCorsHeaders(res);
      res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to construct authorization URL',
      });
    }
  });
}
