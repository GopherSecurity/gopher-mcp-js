import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { createHash } from 'crypto';
import { AddressInfo } from 'net';

export const OAUTH_TEST_CLIENT_ID = 'test-client';
export const OAUTH_TEST_CLIENT_SECRET = 'test-secret';
export const OAUTH_TEST_REFRESH_TOKEN = 'test-refresh-token';
export const OAUTH_TEST_ACCESS_TOKEN = 'test-access-token';
export const OAUTH_TEST_AUTHORIZATION_CODE = 'test-authorization-code';
export const OAUTH_TEST_REGISTERED_CLIENT_ID = 'test-client-dcr-1';

export interface CustomOAuthTestIdpOptions {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  accessToken?: string;
  scope?: string;
  expiresIn?: number;
}

export interface CustomOAuthTestIdp {
  issuer: string;
  openIdConfigurationUrl: string;
  authorizationServerMetadataUrl: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUrl: string;
  close(): Promise<void>;
}

interface CustomOAuthTestIdpState {
  issuer: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken: string;
  scope: string;
  expiresIn: number;
  authorizationCodes: Map<
    string,
    { clientId: string; redirectUri: string; codeChallenge: string }
  >;
  registeredClients: Map<
    string,
    {
      authMethod: 'none' | 'client_secret_post';
      redirectUris: Set<string>;
    }
  >;
  nextRegisteredClientId: number;
}

export async function startCustomOAuthTestIdp(
  options: CustomOAuthTestIdpOptions = {}
): Promise<CustomOAuthTestIdp> {
  const state: CustomOAuthTestIdpState = {
    issuer: '',
    clientId: options.clientId ?? OAUTH_TEST_CLIENT_ID,
    clientSecret: options.clientSecret ?? OAUTH_TEST_CLIENT_SECRET,
    refreshToken: options.refreshToken ?? OAUTH_TEST_REFRESH_TOKEN,
    accessToken: options.accessToken ?? OAUTH_TEST_ACCESS_TOKEN,
    scope: options.scope ?? 'openid profile email',
    expiresIn: options.expiresIn ?? 3600,
    authorizationCodes: new Map(),
    registeredClients: new Map(),
    nextRegisteredClientId: 1,
  };

  const server = createServer((request, response) => {
    void handleIdpRequest(request, response, state);
  });
  await listen(server);

  const address = server.address() as AddressInfo | null;
  if (address === null) {
    throw new Error('custom OAuth test IdP failed to start');
  }
  state.issuer = `http://127.0.0.1:${address.port}`;

  return {
    issuer: state.issuer,
    openIdConfigurationUrl: `${state.issuer}/.well-known/openid-configuration`,
    authorizationServerMetadataUrl: `${state.issuer}/.well-known/oauth-authorization-server`,
    authorizationEndpoint: `${state.issuer}/authorize`,
    tokenEndpoint: `${state.issuer}/token`,
    jwksUrl: `${state.issuer}/jwks`,
    close: () => close(server),
  };
}

async function handleIdpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: CustomOAuthTestIdpState
): Promise<void> {
  const url = new URL(request.url ?? '/', state.issuer);

  if (
    request.method === 'GET' &&
    url.pathname === '/.well-known/openid-configuration'
  ) {
    json(response, authorizationServerMetadata(state));
    return;
  }

  if (
    request.method === 'GET' &&
    url.pathname === '/.well-known/oauth-authorization-server'
  ) {
    json(response, authorizationServerMetadata(state));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/jwks') {
    json(response, { keys: [] });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/authorize') {
    handleAuthorizeRequest(url, response, state);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/register') {
    await handleRegisterRequest(request, response, state);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/token') {
    await handleTokenRequest(request, response, state);
    return;
  }

  response.writeHead(404);
  response.end();
}

function handleAuthorizeRequest(
  url: URL,
  response: ServerResponse,
  state: CustomOAuthTestIdpState
): void {
  const clientId = url.searchParams.get('client_id');
  const redirectUri = url.searchParams.get('redirect_uri');
  const responseType = url.searchParams.get('response_type');
  const stateParam = url.searchParams.get('state');
  const codeChallenge = url.searchParams.get('code_challenge');
  const codeChallengeMethod = url.searchParams.get('code_challenge_method');

  if (
    clientId === null ||
    redirectUri === null ||
    responseType !== 'code' ||
    stateParam === null ||
    codeChallenge === null ||
    codeChallengeMethod !== 'S256' ||
    !isRedirectUriRegistered(state, clientId, redirectUri)
  ) {
    oauthError(response, 400, 'invalid_request');
    return;
  }

  state.authorizationCodes.set(OAUTH_TEST_AUTHORIZATION_CODE, {
    clientId,
    redirectUri,
    codeChallenge,
  });

  const callbackUrl = new URL(redirectUri);
  callbackUrl.searchParams.set('code', OAUTH_TEST_AUTHORIZATION_CODE);
  callbackUrl.searchParams.set('state', stateParam);
  response.writeHead(302, { Location: callbackUrl.toString() });
  response.end();
}

async function handleRegisterRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: CustomOAuthTestIdpState
): Promise<void> {
  let body: unknown;
  try {
    body = JSON.parse(await readBody(request));
  } catch (_e) {
    oauthError(response, 400, 'invalid_client_metadata');
    return;
  }

  if (
    !isRecord(body) ||
    !Array.isArray(body['redirect_uris']) ||
    typeof body['redirect_uris'][0] !== 'string' ||
    body['token_endpoint_auth_method'] !== 'none'
  ) {
    oauthError(response, 400, 'invalid_client_metadata');
    return;
  }

  const clientId = `${state.clientId}-dcr-${state.nextRegisteredClientId++}`;
  state.registeredClients.set(clientId, {
    authMethod: 'none',
    redirectUris: new Set([body['redirect_uris'][0]]),
  });
  response.writeHead(201, { 'Content-Type': 'application/json' });
  response.end(
    JSON.stringify({
      client_id: clientId,
    })
  );
}

async function handleTokenRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: CustomOAuthTestIdpState
): Promise<void> {
  const form = new URLSearchParams(await readBody(request));
  const grantType = form.get('grant_type');
  const clientId = form.get('client_id');
  const clientSecret = form.get('client_secret');
  const refreshToken = form.get('refresh_token');

  if (grantType === null) {
    oauthError(response, 400, 'invalid_request');
    return;
  }
  if (clientId === null) {
    oauthError(response, 400, 'invalid_request');
    return;
  }
  if (!isClientAuthenticated(state, clientId, clientSecret)) {
    oauthError(response, 401, 'invalid_client');
    return;
  }

  if (grantType === 'authorization_code') {
    handleAuthorizationCodeTokenRequest(form, response, state, clientId);
    return;
  }

  if (grantType !== 'refresh_token') {
    oauthError(response, 400, 'unsupported_grant_type');
    return;
  }
  if (refreshToken === null) {
    oauthError(response, 400, 'invalid_request');
    return;
  }
  if (refreshToken !== state.refreshToken) {
    oauthError(response, 400, 'invalid_grant');
    return;
  }

  tokenResponse(response, state, false);
}

function handleAuthorizationCodeTokenRequest(
  form: URLSearchParams,
  response: ServerResponse,
  state: CustomOAuthTestIdpState,
  clientId: string
): void {
  const code = form.get('code');
  const redirectUri = form.get('redirect_uri');
  const codeVerifier = form.get('code_verifier');

  if (code === null || redirectUri === null || codeVerifier === null) {
    oauthError(response, 400, 'invalid_request');
    return;
  }

  const authorizationCode = state.authorizationCodes.get(code);
  if (
    authorizationCode === undefined ||
    authorizationCode.clientId !== clientId ||
    authorizationCode.redirectUri !== redirectUri ||
    codeChallengeForVerifier(codeVerifier) !== authorizationCode.codeChallenge
  ) {
    oauthError(response, 400, 'invalid_grant');
    return;
  }

  state.authorizationCodes.delete(code);
  tokenResponse(response, state, true);
}

function tokenResponse(
  response: ServerResponse,
  state: CustomOAuthTestIdpState,
  includeRefreshToken: boolean
): void {
  json(response, {
    access_token: state.accessToken,
    token_type: 'Bearer',
    expires_in: state.expiresIn,
    scope: state.scope,
    ...(includeRefreshToken ? { refresh_token: state.refreshToken } : {}),
  });
}

function authorizationServerMetadata(
  state: CustomOAuthTestIdpState
): Record<string, unknown> {
  return {
    issuer: state.issuer,
    authorization_endpoint: `${state.issuer}/authorize`,
    token_endpoint: `${state.issuer}/token`,
    registration_endpoint: `${state.issuer}/register`,
    jwks_uri: `${state.issuer}/jwks`,
    scopes_supported: ['openid', 'profile', 'email'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
  };
}

function isClientAuthenticated(
  state: CustomOAuthTestIdpState,
  clientId: string,
  clientSecret: string | null
): boolean {
  const registeredClient = state.registeredClients.get(clientId);
  if (registeredClient?.authMethod === 'none') {
    return clientSecret === null || clientSecret.length === 0;
  }

  if (clientId !== state.clientId) {
    return false;
  }
  return clientSecret === state.clientSecret;
}

function isRedirectUriRegistered(
  state: CustomOAuthTestIdpState,
  clientId: string,
  redirectUri: string
): boolean {
  return (
    state.registeredClients.get(clientId)?.redirectUris.has(redirectUri) ??
    false
  );
}

function codeChallengeForVerifier(verifier: string): string {
  return createHash('sha256')
    .update(verifier)
    .digest('base64url');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oauthError(
  response: ServerResponse,
  statusCode: number,
  error: string
): void {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ error }));
}

function json(response: ServerResponse, body: unknown): void {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.closeAllConnections?.();
    server.closeIdleConnections?.();
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
