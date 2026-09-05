import type {
  GopherAgentCreateOptions,
  GopherAgentRuntimeOptions,
} from './config';
import {
  resolveElicitationActionSync,
  toElicitationRequest,
} from './elicitationRuntime';
import type { NativeElicitationRequestData } from './elicitationRuntime';
import { hasAuthorizationHeader } from './oauthRuntimeOptions';
import { logOAuthDebug } from './oauthInternal';

const GATEWAY_PATH_RE = /^\/v1\/mcp\/gateways\/[^/]+\/mcp\/?$/;
const MCP_PROTOCOL_VERSION = '2025-11-25';
const DEFAULT_PREFLIGHT_TIMEOUT_MS = 5_000;

export interface GatewayElicitationPreflightHooks {
  fetch: typeof fetch;
}

export async function preflightGatewayElicitation(
  url: string,
  runtimeOptions?: GopherAgentRuntimeOptions,
  createOptions?: GopherAgentCreateOptions,
  hooks: GatewayElicitationPreflightHooks = { fetch }
): Promise<GopherAgentRuntimeOptions | undefined> {
  if (!isGopherGatewayMcpUrl(url) || createOptions?.elicitation === undefined) {
    return runtimeOptions;
  }

  const authorization = authorizationHeaderValue(runtimeOptions);
  if (authorization === undefined) {
    return runtimeOptions;
  }

  const timeoutMs =
    createOptions.elicitation.timeoutMs !== undefined
      ? Math.max(0, Math.trunc(createOptions.elicitation.timeoutMs))
      : DEFAULT_PREFLIGHT_TIMEOUT_MS;
  if (timeoutMs === 0) {
    return runtimeOptions;
  }

  const session = await initializeGatewaySession(url, authorization, hooks);
  if (session === undefined) {
    return runtimeOptions;
  }

  await notifyInitialized(url, authorization, session, hooks);
  await listTools(url, authorization, session, hooks);
  await handleGatewayEventStream(
    url,
    authorization,
    session,
    createOptions,
    timeoutMs,
    hooks
  );
  return withGatewaySessionHeader(runtimeOptions, session);
}

function isGopherGatewayMcpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.hostname.endsWith('.gopher.security') &&
      GATEWAY_PATH_RE.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

function authorizationHeaderValue(
  options?: GopherAgentRuntimeOptions
): string | undefined {
  if (options?.headers !== undefined && hasAuthorizationHeader(options)) {
    const entry = Object.entries(options.headers).find(
      ([name]) => name.toLowerCase() === 'authorization'
    );
    return entry?.[1];
  }
  if (options?.accessToken !== undefined && options.accessToken.length > 0) {
    return `Bearer ${options.accessToken}`;
  }
  return undefined;
}

function withGatewaySessionHeader(
  options: GopherAgentRuntimeOptions | undefined,
  session: string
): GopherAgentRuntimeOptions {
  return {
    ...(options ?? {}),
    headers: {
      ...(options?.headers ?? {}),
      'Mcp-Session-Id': session,
    },
  };
}

async function initializeGatewaySession(
  url: string,
  authorization: string,
  hooks: GatewayElicitationPreflightHooks
): Promise<string | undefined> {
  const response = await postJson(
    url,
    authorization,
    undefined,
    {
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          elicitation: { form: {}, url: {} },
          sampling: {},
        },
        clientInfo: {
          name: 'gopher-mcp-js',
          version: '0.1.35.2',
        },
      },
    },
    hooks
  );
  const session = response.headers.get('mcp-session-id') ?? undefined;
  logOAuthDebug('gateway elicitation preflight initialized', {
    sessionPresent: session !== undefined,
    status: response.status,
  });
  return session;
}

async function notifyInitialized(
  url: string,
  authorization: string,
  session: string,
  hooks: GatewayElicitationPreflightHooks
): Promise<void> {
  await postJson(
    url,
    authorization,
    session,
    {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    },
    hooks
  );
}

async function listTools(
  url: string,
  authorization: string,
  session: string,
  hooks: GatewayElicitationPreflightHooks
): Promise<void> {
  await postJson(
    url,
    authorization,
    session,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    },
    hooks
  );
}

async function handleGatewayEventStream(
  url: string,
  authorization: string,
  session: string,
  createOptions: GopherAgentCreateOptions,
  timeoutMs: number,
  hooks: GatewayElicitationPreflightHooks
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await hooks.fetch(url, {
      method: 'GET',
      headers: {
        accept: 'text/event-stream',
        authorization,
        'mcp-protocol-version': MCP_PROTOCOL_VERSION,
        'mcp-session-id': session,
      },
      signal: controller.signal,
    });
    if (!response.ok || response.body === null) {
      return;
    }

    for await (const event of readSseEvents(response.body)) {
      const request = parseElicitationEvent(event);
      if (request === undefined) {
        continue;
      }
      const action = resolveElicitationActionSync(
        createOptions.elicitation ?? {},
        toElicitationRequest(request.data)
      );
      await postJson(
        url,
        authorization,
        session,
        {
          jsonrpc: '2.0',
          id: request.id,
          result: { action },
        },
        hooks
      );
      logOAuthDebug('gateway elicitation preflight answered', {
        action,
        session,
      });
      return;
    }
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      logOAuthDebug('gateway elicitation preflight skipped', {
        error: (error as Error).message,
      });
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function postJson(
  url: string,
  authorization: string,
  session: string | undefined,
  body: unknown,
  hooks: GatewayElicitationPreflightHooks
): Promise<Response> {
  const headers: Record<string, string> = {
    accept: 'application/json, text/event-stream',
    authorization,
    'content-type': 'application/json',
  };
  if (session !== undefined) {
    headers['mcp-protocol-version'] = MCP_PROTOCOL_VERSION;
    headers['mcp-session-id'] = session;
  }
  return await hooks.fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function* readSseEvents(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      buffered += decoder.decode(chunk.value, { stream: true });
      let boundary = buffered.indexOf('\n\n');
      while (boundary >= 0) {
        const event = buffered.slice(0, boundary);
        buffered = buffered.slice(boundary + 2);
        yield event;
        boundary = buffered.indexOf('\n\n');
      }
    }
    buffered += decoder.decode();
    if (buffered.length > 0) {
      yield buffered;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseElicitationEvent(
  event: string
): { id: unknown; data: NativeElicitationRequestData } | undefined {
  const dataLine = event
    .split(/\r?\n/)
    .find((line) => line.startsWith('data:'));
  if (dataLine === undefined) {
    return undefined;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(dataLine.slice('data:'.length).trim());
  } catch {
    return undefined;
  }
  if (!isJsonRpcElicitation(payload)) {
    return undefined;
  }
  return {
    id: payload.id,
    data: {
      request_id_json: JSON.stringify(payload.id),
      elicitation_id: stringField(payload.params, 'elicitationId'),
      mode: stringField(payload.params, 'mode'),
      message: stringField(payload.params, 'message'),
      url: stringField(payload.params, 'url'),
      raw_json: JSON.stringify(payload),
      raw_params_json: JSON.stringify(payload.params),
    },
  };
}

function isJsonRpcElicitation(value: unknown): value is {
  id: unknown;
  method: 'elicitation/create';
  params: Record<string, unknown>;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { method?: unknown }).method === 'elicitation/create' &&
    typeof (value as { params?: unknown }).params === 'object' &&
    (value as { params?: unknown }).params !== null
  );
}

function stringField(
  value: Record<string, unknown>,
  field: string
): string | undefined {
  const fieldValue = value[field];
  return typeof fieldValue === 'string' ? fieldValue : undefined;
}
