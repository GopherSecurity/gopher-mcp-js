import { OAuthChallengeResult } from './oauthResolver';

export interface McpOAuthChallenge extends OAuthChallengeResult {
  httpStatus: number;
  wwwAuthenticate?: string;
}

export interface OAuthProtectedResourceMetadata {
  resource: string;
  authorizationServers: string[];
  scopesSupported: string[];
  rawJson: string;
}

export interface OAuthAuthorizationServerMetadata {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
  scopesSupported: string[];
  rawJson: string;
}

const MCP_DISCOVERY_BODY = JSON.stringify({
  jsonrpc: '2.0',
  id: 'gopher-sdk-oauth-probe',
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: {
      name: 'gopher-mcp-js-oauth-probe',
      version: '1.0',
    },
  },
});

export async function probeMcpOAuthChallenge(
  url: string
): Promise<McpOAuthChallenge> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      body: MCP_DISCOVERY_BODY,
      redirect: 'manual',
    });
  } catch (e) {
    return {
      url,
      requiresOAuth: false,
      httpStatus: 0,
    };
  }

  if (response.status >= 200 && response.status < 300) {
    await drainResponseBody(response);
    return {
      url,
      requiresOAuth: false,
      httpStatus: response.status,
    };
  }

  if (response.status !== 401) {
    await drainResponseBody(response);
    return {
      url,
      requiresOAuth: false,
      httpStatus: response.status,
    };
  }

  const wwwAuthenticate = response.headers.get('www-authenticate') ?? undefined;
  const resourceMetadataUrl =
    wwwAuthenticate === undefined
      ? undefined
      : parseWwwAuthenticateParam(wwwAuthenticate, 'resource_metadata');
  if (resourceMetadataUrl === undefined || resourceMetadataUrl.length === 0) {
    await drainResponseBody(response);
    return {
      url,
      requiresOAuth: false,
      httpStatus: response.status,
      wwwAuthenticate,
    };
  }

  return {
    url,
    requiresOAuth: true,
    httpStatus: response.status,
    wwwAuthenticate,
    resourceMetadataUrl,
  };
}

export function parseWwwAuthenticateParam(
  challenge: string,
  name: string
): string | undefined {
  const parts = splitChallengeParams(challenge);
  for (const part of parts) {
    const equal = part.indexOf('=');
    if (equal < 0) {
      continue;
    }
    const key = part.slice(0, equal).trim();
    if (key !== name) {
      continue;
    }
    const value = part.slice(equal + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      return value.slice(1, -1);
    }
    return value;
  }
  return undefined;
}

export async function fetchOAuthProtectedResourceMetadata(
  resourceMetadataUrl: string
): Promise<OAuthProtectedResourceMetadata> {
  const body = await fetchJson(resourceMetadataUrl, 'protected resource');
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw new Error(
      `oauth_metadata_fetch_failed: Invalid protected resource metadata JSON: ${(e as Error).message}`
    );
  }

  if (!isRecord(parsed)) {
    throw new Error(
      'oauth_metadata_fetch_failed: Protected resource metadata must be a JSON object'
    );
  }

  const resource = readString(parsed['resource']);
  if (resource === undefined) {
    throw new Error(
      'oauth_metadata_fetch_failed: Protected resource metadata is missing resource'
    );
  }

  const authorizationServers = readStringArray(parsed['authorization_servers']);
  if (authorizationServers.length === 0) {
    throw new Error(
      'oauth_metadata_fetch_failed: Protected resource metadata is missing authorization_servers'
    );
  }

  return {
    resource,
    authorizationServers,
    scopesSupported: readStringArray(parsed['scopes_supported']),
    rawJson: body,
  };
}

export async function fetchOAuthAuthorizationServerMetadata(
  authorizationServer: string
): Promise<OAuthAuthorizationServerMetadata> {
  const oauthMetadataUrl = buildPathInsertedWellKnownUrl(
    authorizationServer,
    'oauth-authorization-server'
  );
  let body: string;
  try {
    body = await fetchJson(oauthMetadataUrl, 'authorization server');
  } catch {
    const oidcMetadataUrls = [
      buildIssuerRelativeWellKnownUrl(
        authorizationServer,
        'openid-configuration'
      ),
      buildPathInsertedWellKnownUrl(authorizationServer, 'openid-configuration'),
    ];
    body = await fetchFirstJson(oidcMetadataUrls, 'authorization server');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw new Error(
      `oauth_server_metadata_invalid: Invalid authorization server metadata JSON: ${(e as Error).message}`
    );
  }

  if (!isRecord(parsed)) {
    throw new Error(
      'oauth_server_metadata_invalid: Authorization server metadata must be a JSON object'
    );
  }

  const issuer = readString(parsed['issuer']);
  if (issuer === undefined) {
    throw new Error(
      'oauth_server_metadata_invalid: Authorization server metadata is missing issuer'
    );
  }

  const authorizationEndpoint = readString(parsed['authorization_endpoint']);
  if (authorizationEndpoint === undefined) {
    throw new Error(
      'oauth_server_metadata_invalid: Authorization server metadata is missing authorization_endpoint'
    );
  }

  const tokenEndpoint = readString(parsed['token_endpoint']);
  if (tokenEndpoint === undefined) {
    throw new Error(
      'oauth_server_metadata_invalid: Authorization server metadata is missing token_endpoint'
    );
  }

  return {
    issuer,
    authorizationEndpoint,
    tokenEndpoint,
    ...optionalString(
      'registrationEndpoint',
      readString(parsed['registration_endpoint'])
    ),
    scopesSupported: readStringArray(parsed['scopes_supported']),
    rawJson: body,
  };
}

function splitChallengeParams(challenge: string): string[] {
  const bearerPrefix = /^Bearer\s+/i;
  const value = challenge.replace(bearerPrefix, '');
  const parts: string[] = [];
  let current = '';
  let quoted = false;

  for (const char of value) {
    if (char === '"') {
      quoted = !quoted;
      current += char;
      continue;
    }
    if (char === ',' && !quoted) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.length > 0) {
    parts.push(current.trim());
  }
  return parts;
}

function buildPathInsertedWellKnownUrl(
  issuer: string,
  wellKnownName: string
): string {
  const parsed = new URL(issuer);
  const path =
    parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
  parsed.pathname = `/.well-known/${wellKnownName}${path}`;
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

function buildIssuerRelativeWellKnownUrl(
  issuer: string,
  wellKnownName: string
): string {
  const parsed = new URL(issuer);
  const path =
    parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
  parsed.pathname = `${path}/.well-known/${wellKnownName}`;
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

async function fetchFirstJson(urls: string[], label: string): Promise<string> {
  let lastError: unknown;
  for (const url of urls) {
    try {
      return await fetchJson(url, label);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

async function fetchJson(url: string, label: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  } catch (e) {
    throw new Error(
      `oauth_metadata_fetch_failed: Failed to fetch OAuth ${label} metadata from ${url}: ${(e as Error).message}`
    );
  }

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `oauth_metadata_fetch_failed: OAuth ${label} metadata fetch from ${url} received HTTP ${response.status}`
    );
  }

  return response.text();
}

async function drainResponseBody(response: Response): Promise<void> {
  try {
    await response.text();
  } catch {
    response.body?.cancel().catch(() => undefined);
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function optionalString(
  key: 'registrationEndpoint',
  value: string | undefined
): Partial<OAuthAuthorizationServerMetadata> {
  return value === undefined ? {} : { [key]: value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
