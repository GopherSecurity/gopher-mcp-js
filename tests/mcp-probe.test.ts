import { probeMcpServer } from '../src/mcpProbe';
import type { McpHttpRequest } from '../src/oauthFetch';

const url = 'https://mcp.example/mcp';
const json = (id: number, result: unknown) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id, result }));

function fixture({ sse = false, listStatus = 200, pagination = false } = {}) {
  const requests: Array<{
    method?: string;
    headers: Headers;
    rpc?: { method: string; params?: { cursor?: string } };
  }> = [];
  const cancelled = jest.fn();
  const request: McpHttpRequest = async (_, init) => {
    const headers = new Headers(init.headers);
    const rpc = init.body ? JSON.parse(init.body as string) : undefined;
    requests.push({ method: init.method, headers, rpc });
    expect(init.redirect).toBe('manual');
    if (init.method === 'DELETE') return new Response(null, { status: 204 });
    if (rpc.method === 'initialize') {
      const result = {
        protocolVersion: '2025-03-26',
        serverInfo: { name: 'fixture' },
      };
      if (sse)
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  'data: {"jsonrpc":"2.0","method":"notifications/progress"}\r\n\r\n'
                )
              );
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify({ jsonrpc: '2.0', id: 1, result })}\r\n\r\n`
                )
              );
              // Keep the SSE stream open: the probe must cancel after its matching result.
            },
            cancel: cancelled,
          }),
          {
            headers: {
              'Content-Type': 'text/event-stream',
              'Mcp-Session-Id': 'session',
            },
          }
        );
      const response = json(1, result);
      response.headers.set('Mcp-Session-Id', 'session');
      return response;
    }
    if (rpc.method === 'notifications/initialized')
      return new Response(null, { status: 202 });
    if (listStatus !== 200) return new Response(null, { status: listStatus });
    return json(2, {
      tools: [{ name: rpc.params?.cursor ? 'second' : 'first' }],
      ...(pagination && !rpc.params?.cursor ? { nextCursor: 'next' } : {}),
    });
  };
  return { request, requests, cancelled };
}

test('probe lists tools and terminates its session without any LLM', async () => {
  const f = fixture({ pagination: true });
  await expect(
    probeMcpServer(url, { request: f.request, accessToken: 'token' })
  ).resolves.toEqual({
    state: 'connected',
    serverName: 'fixture',
    tools: ['first', 'second'],
  });
  expect(f.requests.map((r) => r.rpc?.method ?? r.method)).toEqual([
    'initialize',
    'notifications/initialized',
    'tools/list',
    'tools/list',
    'DELETE',
  ]);
  for (const request of f.requests)
    expect(request.headers.get('Authorization')).toBe('Bearer token');
  for (const request of f.requests.slice(1)) {
    expect(request.headers.get('Mcp-Session-Id')).toBe('session');
    expect(request.headers.get('MCP-Protocol-Version')).toBe('2025-03-26');
  }
});

test('SSE notifications are skipped and an open stream is cancelled after the result', async () => {
  const f = fixture({ sse: true });
  await expect(
    probeMcpServer(url, { request: f.request })
  ).resolves.toMatchObject({ state: 'connected', tools: ['first'] });
  expect(f.cancelled).toHaveBeenCalledTimes(1);
});

for (const status of [401, 403]) {
  test(`initialize HTTP ${status} requires authorization`, async () => {
    await expect(
      probeMcpServer(url, {
        request: async () => new Response(null, { status }),
      })
    ).resolves.toEqual({ state: 'authRequired' });
  });
  test(`tools/list HTTP ${status} requires authorization and cleans up the session`, async () => {
    const f = fixture({ listStatus: status });
    await expect(probeMcpServer(url, { request: f.request })).resolves.toEqual({
      state: 'authRequired',
    });
    expect(f.requests.at(-1)?.method).toBe('DELETE');
  });
}

test('HTTP failure returns an error', async () => {
  await expect(
    probeMcpServer(url, {
      request: async () => new Response(null, { status: 404 }),
    })
  ).resolves.toMatchObject({
    state: 'error',
    message: expect.stringContaining('404'),
  });
});

test('application request policy failures are surfaced without bypassing the adapter', async () => {
  const request = jest.fn(async () => {
    throw new Error('Blocked URL');
  });
  await expect(probeMcpServer(url, { request })).resolves.toEqual({
    state: 'error',
    message: 'Blocked URL',
  });
  expect(request).toHaveBeenCalledTimes(1);
});

test('the total request budget aborts an unresponsive server', async () => {
  const request: McpHttpRequest = async (_, init) =>
    new Promise((_, reject) => {
      init.signal!.addEventListener(
        'abort',
        () => reject(new Error('aborted')),
        { once: true }
      );
    });
  await expect(
    probeMcpServer(url, { request, timeoutMs: 20 })
  ).resolves.toEqual({
    state: 'error',
    message: 'MCP probe timed out after 20ms.',
  });
});

test('JSON-RPC errors are reported and sessions are still terminated', async () => {
  const f = fixture();
  await expect(
    probeMcpServer(url, {
      request: async (url, init) => {
        if (
          init.body &&
          JSON.parse(init.body as string).method === 'tools/list'
        )
          return new Response(
            JSON.stringify({
              id: 2,
              error: { message: 'tool discovery failed' },
            })
          );
        return f.request(url, init);
      },
    })
  ).resolves.toEqual({ state: 'error', message: 'tool discovery failed' });
  expect(f.requests.at(-1)?.method).toBe('DELETE');
});

test('repeated pagination cursors fail instead of looping', async () => {
  const f = fixture();
  await expect(
    probeMcpServer(url, {
      request: async (url, init) => {
        if (
          init.body &&
          JSON.parse(init.body as string).method === 'tools/list'
        )
          return json(2, { tools: [], nextCursor: 'same' });
        return f.request(url, init);
      },
    })
  ).resolves.toMatchObject({
    state: 'error',
    message: expect.stringContaining('pagination'),
  });
  expect(f.requests.at(-1)?.method).toBe('DELETE');
});
