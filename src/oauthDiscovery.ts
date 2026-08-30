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

export async function probeMcpOAuthChallenge(
  url: string
): Promise<McpOAuthChallenge> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-method': 'server/discover',
      'mcp-protocol-version': '2026-07-28',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'oauth-probe',
      method: 'server/discover',
      params: {},
    }),
    redirect: 'manual',
  });
  const wwwAuthenticate = response.headers.get('www-authenticate') ?? '';
  const resourceMetadataUrl = parseBearerAuthParam(
    wwwAuthenticate,
    'resource_metadata'
  );
  const requiresOAuth =
    response.status === 401 && /(^|,|\s)Bearer(\s|$)/i.test(wwwAuthenticate);

  if (requiresOAuth && resourceMetadataUrl === undefined) {
    throw new Error(
      `oauth_metadata_missing: MCP OAuth challenge for ${url} is missing resource_metadata`
    );
  }

  return {
    url,
    requiresOAuth,
    httpStatus: response.status,
    ...(wwwAuthenticate.length > 0 ? { wwwAuthenticate } : {}),
    ...(resourceMetadataUrl !== undefined ? { resourceMetadataUrl } : {}),
  };
}

export async function fetchOAuthProtectedResourceMetadata(
  resourceMetadataUrl: string
): Promise<OAuthProtectedResourceMetadata> {
  const { json, rawJson } = await fetchJsonObject(resourceMetadataUrl);
  const authorizationServers = stringArray(json.authorization_servers);
  if (authorizationServers.length === 0) {
    throw new Error(
      'oauth_metadata_fetch_failed: Protected resource metadata is missing authorization_servers'
    );
  }

  return {
    resource: stringField(json.resource),
    authorizationServers,
    scopesSupported: stringArray(json.scopes_supported),
    rawJson,
  };
}

export async function fetchOAuthAuthorizationServerMetadata(
  authorizationServer: string
): Promise<OAuthAuthorizationServerMetadata> {
  const { json, rawJson } = await fetchJsonObjectFromCandidates([
    metadataEndpointForIssuer(
      authorizationServer,
      'oauth-authorization-server'
    ),
    metadataEndpointForIssuer(authorizationServer, 'openid-configuration'),
  ]);
  const issuer = stringField(json.issuer);
  const authorizationEndpoint = stringField(json.authorization_endpoint);
  const tokenEndpoint = stringField(json.token_endpoint);
  if (
    issuer.length === 0 ||
    authorizationEndpoint.length === 0 ||
    tokenEndpoint.length === 0
  ) {
    throw new Error(
      'oauth_server_metadata_invalid: Authorization server metadata is missing issuer, authorization_endpoint, or token_endpoint'
    );
  }

  return {
    issuer,
    authorizationEndpoint,
    tokenEndpoint,
    ...(stringField(json.registration_endpoint).length > 0
      ? { registrationEndpoint: stringField(json.registration_endpoint) }
      : {}),
    scopesSupported: stringArray(json.scopes_supported),
    rawJson,
  };
}

function parseBearerAuthParam(
  header: string,
  name: string
): string | undefined {
  const pattern = new RegExp(`${name}=("(?:[^"\\\\]|\\\\.)*"|[^,\\s]+)`, 'i');
  const match = header.match(pattern);
  if (match === null) {
    return undefined;
  }
  const value = match[1] ?? '';
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return value;
}

async function fetchJsonObject(
  url: string
): Promise<{ json: Record<string, unknown>; rawJson: string }> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    redirect: 'manual',
  });
  const rawJson = await response.text();
  if (!response.ok) {
    throw new Error(
      `oauth_metadata_fetch_failed: HTTP request failed with status ${response.status}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    throw new Error(
      `oauth_metadata_fetch_failed: Invalid JSON response: ${(error as Error).message}`
    );
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('oauth_metadata_fetch_failed: Expected JSON object');
  }
  return { json: parsed as Record<string, unknown>, rawJson };
}

async function fetchJsonObjectFromCandidates(
  urls: string[]
): Promise<{ json: Record<string, unknown>; rawJson: string }> {
  let lastError: Error | undefined;
  for (const url of urls) {
    try {
      return await fetchJsonObject(url);
    } catch (error) {
      lastError = error as Error;
      if (!isMetadataHttpFetchError(lastError)) {
        throw lastError;
      }
    }
  }
  throw lastError ?? new Error('oauth_metadata_fetch_failed: No metadata URL');
}

function isMetadataHttpFetchError(error: Error): boolean {
  return error.message.startsWith(
    'oauth_metadata_fetch_failed: HTTP request failed'
  );
}

function metadataEndpointForIssuer(
  issuer: string,
  wellKnownName: string
): string {
  const parsed = new URL(issuer);
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  if (parsed.pathname === '' || parsed.pathname === '/') {
    parsed.pathname = `/.well-known/${wellKnownName}`;
  } else {
    parsed.pathname = `/.well-known/${wellKnownName}${parsed.pathname}`;
  }
  return parsed.toString();
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
