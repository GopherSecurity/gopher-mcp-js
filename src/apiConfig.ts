import { normalizeInventoryResponse } from './inventoryResponse';
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
  const normalized = normalizeSourceSelection(selection);
  const requestBody = JSON.stringify(normalized);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let response = await fetch(url, {
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
    let body = await response.text();

    if (response.status === 405) {
      const selectors = Object.entries(normalized).flatMap(([key, values]) =>
        values.map((value) => [key, value] as const)
      );
      if (selectors.length > 1) {
        throw new AgentError(
          'Inventory HTTP request failed with status 405: this backend requires POST support for multiple selectors'
        );
      }
      // Older deployments accept GET with at most one filter. Preserve the
      // exact selection; never drop filters or split a multi-source request.
      const legacyUrl = new URL(url);
      for (const [key, value] of selectors)
        legacyUrl.searchParams.set(key, value);
      response = await fetch(legacyUrl, {
        method: 'GET',
        redirect: 'error',
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      });
      body = await response.text();
    }

    if (!response.ok) {
      throw new AgentError(
        `Inventory HTTP request failed with status ${response.status}`
      );
    }

    return normalizeInventoryResponse(body, normalized);
  } catch (error) {
    if (error instanceof ApiKeyError || error instanceof AgentError) {
      throw error;
    }
    const detail = controller.signal.aborted
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
