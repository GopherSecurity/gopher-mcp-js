import { AgentError, ApiKeyError } from './errors';
import type { GopherSourceSelection } from './config';
import { normalizeSourceSelection } from './sourceSelection';
export type { ServerConfigRoute } from './sourceSelection';

const FETCH_TIMEOUT_MS = 30000;

export async function fetchGopherServerConfig(
  apiKey: string,
  selection: GopherSourceSelection = {}
): Promise<string> {
  if (!apiKey || apiKey.trim() === '') {
    throw new ApiKeyError('Invalid or missing API key');
  }

  const url = new URL('/v1/mcp-servers', getGopherApiRoot());
  const requestBody = JSON.stringify(normalizeSourceSelection(selection));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      body: requestBody,
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });
    const body = await response.text();

    if (!response.ok) {
      throw new AgentError(
        `Inventory HTTP request failed with status ${response.status}`
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
        : 'transport failed';
    throw new AgentError(`Failed to fetch servers: ${detail}`);
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
