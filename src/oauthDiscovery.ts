import { OAuthChallengeResult } from './oauthResolver';

export interface McpOAuthChallenge extends OAuthChallengeResult {
  httpStatus: number;
  wwwAuthenticate?: string;
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
    throw new Error(
      `oauth_metadata_fetch_failed: MCP OAuth probe failed for ${url}: ${(e as Error).message}`
    );
  }

  if (response.status >= 200 && response.status < 300) {
    return {
      url,
      requiresOAuth: false,
      httpStatus: response.status,
    };
  }

  if (response.status !== 401) {
    throw new Error(
      `oauth_metadata_fetch_failed: MCP OAuth probe for ${url} received HTTP ${response.status}`
    );
  }

  const wwwAuthenticate = response.headers.get('www-authenticate') ?? undefined;
  const resourceMetadataUrl =
    wwwAuthenticate === undefined
      ? undefined
      : parseWwwAuthenticateParam(wwwAuthenticate, 'resource_metadata');
  if (resourceMetadataUrl === undefined || resourceMetadataUrl.length === 0) {
    throw new Error(
      `oauth_metadata_missing: MCP OAuth challenge for ${url} is missing resource_metadata`
    );
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
