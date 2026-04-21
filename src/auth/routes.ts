/**
 * OAuth discovery and flow route registration
 *
 * Uses core library metadata builders via FFI for RFC-compliant
 * discovery endpoints. Token proxy forwards to Keycloak transparently.
 */

import type { GopherAuth } from './gopher-auth';
import {
  gopherAuthBuildProtectedResourceMetadata,
  gopherAuthBuildOAuthServerMetadata,
  gopherAuthBuildOidcDiscoveryMetadata,
  gopherAuthUrlEncode,
  gopherAuthValidateIdp,
} from '../ffi/auth/loader';

function setCorsHeaders(res: { set: (k: string, v: string) => void }): void {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, Accept, Origin, X-Requested-With, Mcp-Session-Id'
  );
  res.set(
    'Access-Control-Expose-Headers',
    'WWW-Authenticate, Content-Length, Mcp-Session-Id'
  );
  res.set('Access-Control-Max-Age', '86400');
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function registerOAuthRoutes(
  app: any,
  auth: GopherAuth,
  options?: { serverUrl?: string; allowedScopes?: string[] }
): void {
  const cfg = auth.nativeConfig;
  const serverUrl =
    options?.serverUrl ??
    cfg?.getString('server_url') ??
    'http://localhost:3001';
  const scopes =
    options?.allowedScopes?.join(' ') ?? cfg?.getString('allowed_scopes') ?? '';
  const issuer = cfg?.getString('issuer') ?? serverUrl;
  const jwksUri = cfg?.getString('jwks_uri') ?? '';
  const authServerUrl = cfg?.getString('auth_server_url') ?? '';
  const oauthAuthorizeUrl = cfg?.getString('oauth_authorize_url') ?? '';
  const oauthTokenUrl =
    cfg?.getString('oauth_token_url') ?? cfg?.getString('token_endpoint') ?? '';
  const clientId = cfg?.getString('client_id') ?? '';
  const clientSecret = cfg?.getString('client_secret') ?? '';
  const exchangeIdps = cfg?.getString('exchange_idps') ?? '';

  // CORS preflight for all well-known endpoints
  const corsHandler = (_req: any, res: any) => {
    setCorsHeaders(res);
    res.status(204).set('Content-Length', '0').end();
  };

  app.options('/.well-known/oauth-protected-resource', corsHandler);
  app.options('/.well-known/oauth-protected-resource/mcp', corsHandler);
  app.options('/.well-known/oauth-authorization-server', corsHandler);
  app.options('/.well-known/openid-configuration', corsHandler);
  app.options('/oauth/authorize', corsHandler);
  app.options('/oauth/register', corsHandler);
  app.options('/authorize', corsHandler);

  // RFC 9728 — Protected Resource Metadata
  const protectedResourceHandler = (_req: any, res: any) => {
    setCorsHeaders(res);
    try {
      const meta = gopherAuthBuildProtectedResourceMetadata(
        `${serverUrl}/mcp`,
        serverUrl,
        scopes || undefined
      );
      res.status(200).json(meta);
    } catch (err) {
      res.status(500).json({
        error: 'server_error',
        error_description:
          err instanceof Error ? err.message : 'Metadata build failed',
      });
    }
  };
  app.get('/.well-known/oauth-protected-resource', protectedResourceHandler);
  app.get(
    '/.well-known/oauth-protected-resource/mcp',
    protectedResourceHandler
  );

  // RFC 8414 — Authorization Server Metadata
  // Use Keycloak URLs directly for authorization and token endpoints
  // (same pattern as the working gopher-auth-sdk-nodejs)
  app.get('/.well-known/oauth-authorization-server', (_req: any, res: any) => {
    setCorsHeaders(res);
    try {
      const meta = gopherAuthBuildOAuthServerMetadata(
        issuer,
        oauthAuthorizeUrl || `${serverUrl}/oauth/authorize`,
        oauthTokenUrl || `${serverUrl}/oauth/token`,
        `${serverUrl}/oauth/register`,
        jwksUri || undefined,
        scopes || undefined
      );
      if (authServerUrl) {
        (meta as any).end_session_endpoint =
          `${authServerUrl}/protocol/openid-connect/logout`;
      }
      res.status(200).json(meta);
    } catch (err) {
      res.status(500).json({
        error: 'server_error',
        error_description:
          err instanceof Error ? err.message : 'Metadata build failed',
      });
    }
  });

  // OIDC Discovery
  app.get('/.well-known/openid-configuration', (_req: any, res: any) => {
    setCorsHeaders(res);
    const userinfo = authServerUrl
      ? `${authServerUrl}/protocol/openid-connect/userinfo`
      : undefined;
    const endSession = authServerUrl
      ? `${authServerUrl}/protocol/openid-connect/logout`
      : undefined;
    const meta = gopherAuthBuildOidcDiscoveryMetadata(
      issuer,
      oauthAuthorizeUrl || `${serverUrl}/oauth/authorize`,
      oauthTokenUrl || `${serverUrl}/oauth/token`,
      jwksUri || undefined,
      `${serverUrl}/oauth/register`,
      scopes || undefined,
      userinfo,
      endSession
    );
    res.status(200).json(meta);
  });

  // GET /oauth/authorize — redirect to IdP
  const authorizeHandler = (req: any, res: any) => {
    const q = req.query || {};
    const target =
      oauthAuthorizeUrl || `${authServerUrl}/protocol/openid-connect/auth`;
    let url = `${target}?client_id=${gopherAuthUrlEncode(q.client_id || '')}`;
    if (q.redirect_uri)
      url += `&redirect_uri=${gopherAuthUrlEncode(q.redirect_uri)}`;
    if (q.scope) url += `&scope=${gopherAuthUrlEncode(q.scope)}`;
    if (q.response_type)
      url += `&response_type=${gopherAuthUrlEncode(q.response_type)}`;
    if (q.state) url += `&state=${gopherAuthUrlEncode(q.state)}`;
    if (q.code_challenge) {
      url += `&code_challenge=${gopherAuthUrlEncode(q.code_challenge)}`;
      url += `&code_challenge_method=${q.code_challenge_method || 'S256'}`;
    }
    res.redirect(302, url);
  };
  app.get('/oauth/authorize', authorizeHandler);
  app.get('/authorize', authorizeHandler);

  // POST /oauth/token — proxy to IdP token endpoint
  // Required for clients (like claude.ai) that use the discovered token_endpoint
  const tokenUrl =
    oauthTokenUrl || `${authServerUrl}/protocol/openid-connect/token`;
  app.options('/oauth/token', corsHandler);
  app.post('/oauth/token', async (req: any, res: any) => {
    setCorsHeaders(res);
    try {
      // Forward the request body as form-encoded to the IdP
      const body = req.body || {};
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(body)) {
        if (typeof value === 'string') {
          params.append(key, value);
        }
      }
      // Inject client credentials if not provided
      if (!params.has('client_id') && clientId) {
        params.append('client_id', clientId);
      }
      if (!params.has('client_secret') && clientSecret) {
        params.append('client_secret', clientSecret);
      }

      console.log(`🔑 Token proxy → ${tokenUrl}`);
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const data = await response.text();
      res
        .status(response.status)
        .set('Content-Type', response.headers.get('content-type') || 'application/json')
        .send(data);
    } catch (err) {
      console.error('❌ Token proxy error:', err);
      res.status(502).json({
        error: 'token_proxy_error',
        error_description:
          err instanceof Error ? err.message : 'Failed to proxy token request',
      });
    }
  });

  // POST /oauth/token/exchange — RFC 8693
  app.post('/oauth/token/exchange', (req: any, res: any) => {
    setCorsHeaders(res);
    const subjectToken = req.body?.subject_token;
    const requestedIssuer = req.body?.requested_issuer;

    if (!subjectToken || !requestedIssuer) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing subject_token or requested_issuer',
      });
    }

    // Validate IDP
    if (exchangeIdps && !gopherAuthValidateIdp(exchangeIdps, requestedIssuer)) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: `Unknown IDP: ${requestedIssuer}`,
      });
    }

    try {
      const result = auth.exchangeToken({
        subjectToken,
        requestedIssuer,
        audience: req.body?.audience,
        scope: req.body?.scope,
      });
      res.status(200).json({
        access_token: result.accessToken,
        token_type: result.tokenType || 'Bearer',
        expires_in: result.expiresIn,
        issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      });
    } catch (err) {
      res.status(400).json({
        error: 'token_exchange_failed',
        error_description:
          err instanceof Error ? err.message : 'Exchange failed',
      });
    }
  });

  // POST /oauth/register — RFC 7591 (stateless: return pre-configured creds)
  app.post('/oauth/register', (req: any, res: any) => {
    setCorsHeaders(res);
    const redirectUris = req.body?.redirect_uris ?? [];

    res.status(201).json({
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_secret_expires_at: 0,
      redirect_uris: redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: clientSecret ? 'client_secret_post' : 'none',
    });
  });

  // GET /health
  app.get('/health', (_req: any, res: any) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: Math.floor(Date.now() / 1000),
      service: 'gopher-auth-mcp-server',
    });
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */
