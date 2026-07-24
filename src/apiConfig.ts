import { AgentError, ApiKeyError } from './errors';

const FETCH_TIMEOUT_MS = 30000;
const FETCH_MAX_BODY_PREVIEW = 512;

export interface ServerConfigRoute {
  key: 'serverId' | 'serverName' | 'gatewayId' | 'gatewayName';
  value: string;
}

export async function fetchGopherServerConfig(
  apiKey: string,
  route?: ServerConfigRoute
): Promise<string> {
  if (!apiKey || apiKey.trim() === '') {
    throw new ApiKeyError('Invalid or missing API key');
  }

  const url = new URL('/v1/mcp-servers', getGopherApiRoot());
  if (route !== undefined) {
    url.searchParams.set(route.key, route.value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });
    const body = await response.text();

    if (!response.ok) {
      const preview =
        body.length > FETCH_MAX_BODY_PREVIEW
          ? `${body.slice(0, FETCH_MAX_BODY_PREVIEW)}...`
          : body;
      throw new AgentError(
        `HTTP request failed with status ${response.status}${
          preview ? `: ${preview}` : ''
        }`
      );
    }

    return body;
  } catch (error) {
    if (error instanceof ApiKeyError || error instanceof AgentError) {
      throw error;
    }
    const detail =
      error instanceof Error && error.name === 'AbortError'
        ? `request timed out after ${FETCH_TIMEOUT_MS}ms`
        : error instanceof Error
          ? error.message
          : String(error);
    throw new AgentError(
      `Failed to fetch servers${detail ? `: ${detail}` : ''}`
    );
  } finally {
    clearTimeout(timeout);
  }
}

function getGopherApiRoot(): string {
  const value = process.env['GOPHER_SDK_TEST'];
  if (value !== undefined) {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return 'https://api-test.gopher.security';
    }
  }
  return 'https://api.gopher.security';
}
