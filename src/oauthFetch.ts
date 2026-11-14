import { AsyncLocalStorage } from 'node:async_hooks';
import { AgentError } from './errors';

export type McpHttpRequest = (
  url: string,
  init: RequestInit
) => Promise<Response>;
const requestContext = new AsyncLocalStorage<McpHttpRequest>();

/** Internal per-operation request adapter; concurrent clients remain isolated. */
export function withOAuthRequest<T>(
  request: McpHttpRequest,
  run: () => Promise<T>
): Promise<T> {
  return requestContext.run(request, run);
}

export const OAUTH_FETCH_TIMEOUT_MS = 30_000;
export const OAUTH_FETCH_MAX_BODY_PREVIEW = 512;

export async function fetchOAuth(
  url: string,
  init: RequestInit,
  label: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OAUTH_FETCH_TIMEOUT_MS);

  try {
    return await (requestContext.getStore() ?? fetch)(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (e) {
    const detail =
      e instanceof Error && e.name === 'AbortError'
        ? `request timed out after ${OAUTH_FETCH_TIMEOUT_MS}ms`
        : e instanceof Error
          ? e.message
          : String(e);
    throw new AgentError(
      `Failed to fetch OAuth ${label}${detail ? `: ${detail}` : ''}`,
      'OAUTH_FETCH_FAILED'
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function responseBodyPreview(response: Response): Promise<string> {
  const body = await response.text();
  return body.length > OAUTH_FETCH_MAX_BODY_PREVIEW
    ? `${body.slice(0, OAUTH_FETCH_MAX_BODY_PREVIEW)}...`
    : body;
}
