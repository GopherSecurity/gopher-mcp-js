import { preflightGatewayElicitation } from '../src/gatewayElicitationPreflight';
import { setElicitationInputForTest } from '../src/elicitationRuntime';

const GATEWAY_URL = 'https://mcp-test.gopher.security/v1/mcp/gateways/gw-1/mcp';

describe('gateway elicitation preflight', () => {
  afterEach(() => {
    setElicitationInputForTest(null);
    jest.restoreAllMocks();
  });

  test('answers a gateway URL elicitation before native tool calls', async () => {
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockStdinInput('\n');
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response('', { 'mcp-session-id': 'session-1' }))
      .mockResolvedValueOnce(response(''))
      .mockResolvedValueOnce(response('{"tools":[]}'))
      .mockResolvedValueOnce(
        response(
          [
            'event: message',
            'data: {"jsonrpc":"2.0","id":"gw_elicitation_1","method":"elicitation/create","params":{"elicitationId":"provider-auth","message":"Connect provider account to continue.","mode":"url","url":"https://accounts.google.com/o/oauth2/v2/auth?state=s"}}',
            '',
            '',
          ].join('\n'),
          {},
          true
        )
      )
      .mockResolvedValueOnce(response(''));

    await expect(
      preflightGatewayElicitation(
        GATEWAY_URL,
        { accessToken: 'gateway-token' },
        { elicitation: { openBrowser: false } },
        { fetch: fetchMock as typeof fetch }
      )
    ).resolves.toEqual({
      accessToken: 'gateway-token',
      headers: {
        'Mcp-Session-Id': 'session-1',
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual(
      expect.objectContaining({ method: 'initialize' })
    );
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual(
      expect.objectContaining({ method: 'notifications/initialized' })
    );
    expect(JSON.parse(fetchMock.mock.calls[2]?.[1]?.body as string)).toEqual(
      expect.objectContaining({ method: 'tools/list' })
    );
    expect(fetchMock.mock.calls[3]?.[1]).toEqual(
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          accept: 'text/event-stream',
          authorization: 'Bearer gateway-token',
          'mcp-session-id': 'session-1',
        }),
      })
    );
    expect(JSON.parse(fetchMock.mock.calls[4]?.[1]?.body as string)).toEqual({
      jsonrpc: '2.0',
      id: 'gw_elicitation_1',
      result: { action: 'accept' },
    });
  });

  test('does nothing for non-gateway URLs', async () => {
    const fetchMock = jest.fn();

    await preflightGatewayElicitation(
      'https://mcp.example.com/mcp',
      { accessToken: 'token' },
      { elicitation: {} },
      { fetch: fetchMock as typeof fetch }
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function response(
  body: string,
  headers: Record<string, string> = {},
  stream = false
): Response {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    body: stream ? streamBody(body) : null,
  } as unknown as Response;
}

function streamBody(body: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
}

function mockStdinInput(input: string): void {
  let offset = 0;
  setElicitationInputForTest(
    ((fd: number, buffer: NodeJS.ArrayBufferView) => {
      void fd;
      if (offset >= input.length) {
        return 0;
      }
      const bytes = Buffer.from(input.slice(offset, offset + 1));
      bytes.copy(buffer as Buffer);
      offset += 1;
      return 1;
    }) as typeof import('fs').readSync,
    () => 42,
    () => undefined
  );
}
