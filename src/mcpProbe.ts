import type { McpHttpRequest } from './oauthFetch';

const SESSION_CLEANUP_TIMEOUT_MS = 1000;

export type McpServerStatus =
  | { state: 'connected'; serverName?: string; tools: string[] }
  | { state: 'authRequired' }
  | { state: 'error'; message: string };

export interface McpProbeOptions {
  accessToken?: string;
  headers?: Record<string, string>;
  /** Application HTTP adapter, e.g. for outbound URL policy enforcement. */
  request?: McpHttpRequest;
  /** Probe budget including response bodies; best-effort session cleanup can add up to 1 second. */
  timeoutMs?: number;
}

type RpcResponse = {
  id?: unknown;
  result?: Record<string, unknown>;
  error?: { message?: string };
};

/** Probe an HTTP MCP endpoint and list tools without creating an agent or using an LLM. */
export async function probeMcpServer(
  url: string,
  options: McpProbeOptions = {}
): Promise<McpServerStatus> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return {
      state: 'error',
      message: 'MCP probe timeout must be a positive finite number.',
    };
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let sessionId: string | undefined;
  let protocolVersion = '2025-06-18';
  const headers = new Headers(options.headers);
  if (options.accessToken && !headers.has('Authorization'))
    headers.set('Authorization', `Bearer ${options.accessToken}`);
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json, text/event-stream');
  const request = (
    method: string,
    payload?: unknown,
    signal: AbortSignal = controller.signal
  ) => {
    const requestHeaders = new Headers(headers);
    if (sessionId) {
      requestHeaders.set('Mcp-Session-Id', sessionId);
      requestHeaders.set('MCP-Protocol-Version', protocolVersion);
    }
    return (options.request ?? fetch)(url, {
      method,
      headers: requestHeaders,
      redirect: 'manual',
      signal,
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
  };
  try {
    if (!['http:', 'https:'].includes(new URL(url).protocol))
      throw new Error('MCP server URL must use HTTP(S).');
    const response = await request('POST', {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion,
        capabilities: {},
        clientInfo: { name: 'gopher-mcp-js-probe', version: '1.0' },
      },
    });
    sessionId = response.headers.get('mcp-session-id') ?? undefined;
    const initialStatus = httpStatus(response, 'initialize');
    if (initialStatus) {
      await response.body?.cancel();
      return initialStatus;
    }
    const initialized = await parseRpcResponse(response, 1);
    if (initialized.error)
      throw new Error(initialized.error.message ?? 'MCP initialize failed.');
    if (!initialized.result)
      throw new Error('MCP initialize returned no result.');
    if (typeof initialized.result.protocolVersion === 'string')
      protocolVersion = initialized.result.protocolVersion;
    headers.set('MCP-Protocol-Version', protocolVersion);
    const serverInfo = initialized.result.serverInfo as
      | { name?: unknown }
      | undefined;
    const notification = await request('POST', {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    const notificationStatus = httpStatus(
      notification,
      'notifications/initialized'
    );
    await notification.body?.cancel();
    if (notificationStatus) return notificationStatus;
    const tools: string[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const listed = await request('POST', {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        ...(cursor ? { params: { cursor } } : {}),
      });
      const listStatus = httpStatus(listed, 'tools/list');
      if (listStatus) {
        await listed.body?.cancel();
        return listStatus;
      }
      const result = await parseRpcResponse(listed, 2);
      if (result.error)
        throw new Error(result.error.message ?? 'MCP tools/list failed.');
      if (!Array.isArray(result.result?.tools))
        throw new Error('MCP tools/list returned an invalid tool list.');
      for (const tool of result.result.tools as unknown[]) {
        if (
          tool &&
          typeof tool === 'object' &&
          'name' in tool &&
          typeof tool.name === 'string'
        )
          tools.push(tool.name);
      }
      const next = result.result.nextCursor;
      cursor = typeof next === 'string' && next.length ? next : undefined;
      if (cursor && cursors.has(cursor))
        throw new Error('MCP tools/list repeated its pagination cursor.');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return {
      state: 'connected',
      ...(typeof serverInfo?.name === 'string'
        ? { serverName: serverInfo.name }
        : {}),
      tools,
    };
  } catch (error) {
    return {
      state: 'error',
      message: controller.signal.aborted
        ? `MCP probe timed out after ${timeoutMs}ms.`
        : error instanceof Error
          ? error.message
          : 'Could not reach the MCP server.',
    };
  } finally {
    clearTimeout(timer);
    if (sessionId) {
      // A timed-out probe must still get a fresh chance to terminate its session.
      const cleanup = new AbortController();
      const cleanupTimer = setTimeout(
        () => cleanup.abort(),
        SESSION_CLEANUP_TIMEOUT_MS
      );
      try {
        const response = await request('DELETE', undefined, cleanup.signal);
        await response.body?.cancel();
      } catch {
        /* Cleanup must not replace the probe result. */
      } finally {
        clearTimeout(cleanupTimer);
      }
    }
  }
}

function httpStatus(
  response: Response,
  method: string
): McpServerStatus | undefined {
  if (response.status === 401 || response.status === 403)
    return { state: 'authRequired' };
  if (!response.ok)
    return {
      state: 'error',
      message: `MCP server answered HTTP ${response.status} to ${method}.`,
    };
  return undefined;
}

async function parseRpcResponse(
  response: Response,
  id: number
): Promise<RpcResponse> {
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const parsed = (await response.json()) as RpcResponse;
    if (!parsed || parsed.id !== id)
      throw new Error('MCP returned an invalid JSON-RPC response.');
    return parsed;
  }
  const reader = (
    response.body as ReadableStream<Uint8Array> | null
  )?.getReader();
  if (!reader) throw new Error('MCP returned an empty event stream.');
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];
  try {
    for (;;) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      if (chunk.done) buffer += '\n\n';
      let end: number;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end).replace(/\r$/, '');
        buffer = buffer.slice(end + 1);
        if (line.startsWith('data:'))
          data.push(line.slice(5).replace(/^ /, ''));
        if (!line && data.length) {
          const parsed = JSON.parse(data.join('\n')) as RpcResponse;
          data = [];
          if (parsed?.id === id) return parsed;
        }
      }
      if (chunk.done)
        throw new Error('MCP event stream ended without a matching response.');
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
