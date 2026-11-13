/** Opt-in: use a real v1 artifact; never infer capability from package version. */
import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { createHash } from 'crypto';
import { GopherAgent } from '../src/agent';
import { GopherOrchLibrary } from '../src/ffi/library';
import {
  GopherAgentTokenRecord,
  GopherAgentCreateOptions,
} from '../src/config';

const artifact = process.env.GOPHER_EMBEDDED_AUTH_TEST_LIBRARY;
const nativeDescribe = artifact ? describe : describe.skip;
const realFetch = global.fetch;

class OAuthFixture {
  server: Server;
  base = '';
  shared = false;
  providerRequired = false;
  providerReady = false;
  tokenLifetime = 600;
  refreshes: string[] = [];
  initialized: string[] = [];
  tokens = new Map<string, string>();
  validTokens = new Map<string, Set<string>>();
  codes = new Map<
    string,
    { resource: string; client: string; redirect: string; challenge: string }
  >();
  sequence = 0;
  constructor() {
    this.server = createServer((req, res) => {
      void this.handle(req, res).catch(() => {
        res.writeHead(500);
        res.end('{}');
      });
    });
  }
  async start() {
    await new Promise<void>((resolve) =>
      this.server.listen(0, '127.0.0.1', resolve)
    );
    this.base =
      'http://127.0.0.1:' + (this.server.address() as { port: number }).port;
  }
  async close() {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
  issuer(source: string) {
    return this.base + '/issuer/' + (this.shared ? 'shared' : source);
  }
  inventory() {
    return JSON.stringify({
      succeeded: true,
      message: 'success',
      data: {
        servers: ['a', 'b'].map((id) => ({
          id,
          name: id,
          transport: 'streamable_http',
          config: { url: this.base + '/' + id + '/mcp' },
        })),
      },
    });
  }
  async handle(req: IncomingMessage, res: ServerResponse) {
    const parts: Buffer[] = [];
    for await (const chunk of req) parts.push(Buffer.from(chunk as Uint8Array));
    const raw = Buffer.concat(parts).toString();
    const url = new URL(req.url!, this.base);
    const send = (
      status: number,
      body: unknown,
      headers: Record<string, string> = {}
    ) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };
    const source =
      url.pathname.includes('/a/') || url.pathname.startsWith('/a/')
        ? 'a'
        : 'b';
    if (url.pathname.endsWith('/metadata'))
      return send(200, {
        resource: this.base + '/' + source + '/mcp',
        authorization_servers: [this.issuer(source)],
        scopes_supported: ['openid', 'resource:' + source],
      });
    if (url.pathname.startsWith('/.well-known/oauth-authorization-server/')) {
      const issuer =
        this.base +
        url.pathname.replace('/.well-known/oauth-authorization-server', '');
      return send(200, {
        issuer,
        authorization_endpoint: issuer + '/authorize',
        token_endpoint: issuer + '/token',
        registration_endpoint: issuer + '/register',
        code_challenge_methods_supported: ['S256'],
      });
    }
    if (url.pathname.endsWith('/register'))
      return send(201, {
        client_id: 'fixture-client',
        token_endpoint_auth_method: 'none',
      });
    if (url.pathname.endsWith('/authorize')) {
      const p = url.searchParams;
      const resource = p.get('resource')!;
      if (p.get('code_challenge_method') !== 'S256' || !resource)
        return send(400, {});
      const code = 'code' + ++this.sequence;
      this.codes.set(code, {
        resource,
        client: p.get('client_id')!,
        redirect: p.get('redirect_uri')!,
        challenge: p.get('code_challenge')!,
      });
      const callback = new URL(p.get('redirect_uri')!);
      callback.search = new URLSearchParams({
        state: p.get('state')!,
        code,
        iss: this.issuer(resource.includes('/a/mcp') ? 'a' : 'b'),
      }).toString();
      return send(302, '', { location: callback.toString() });
    }
    if (url.pathname.endsWith('/token')) {
      const p = new URLSearchParams(raw);
      const resource = p.get('resource')!;
      const s = resource?.includes('/a/mcp') ? 'a' : 'b';
      if (p.get('grant_type') === 'refresh_token') {
        if (p.get('refresh_token') !== 'refresh-' + s) return send(400, {});
        this.refreshes.push(s);
      } else {
        const code = this.codes.get(p.get('code')!);
        this.codes.delete(p.get('code')!);
        if (
          !code ||
          code.resource !== resource ||
          code.redirect !== p.get('redirect_uri') ||
          code.client !== p.get('client_id') ||
          code.challenge !==
            createHash('sha256')
              .update(p.get('code_verifier')!)
              .digest('base64url')
        )
          return send(400, {});
      }
      const token = 'opaque-' + s + '-' + ++this.sequence;
      this.tokens.set(s, token);
      if (!this.validTokens.has(s)) this.validTokens.set(s, new Set());
      this.validTokens.get(s)!.add(token);
      return send(200, {
        access_token: token,
        refresh_token: 'refresh-' + s,
        token_type: 'Bearer',
        expires_in: this.tokenLifetime,
      });
    }
    if (url.pathname.endsWith('/mcp')) {
      if (
        !this.validTokens
          .get(source)
          ?.has((req.headers.authorization ?? '').replace(/^Bearer /, ''))
      )
        return send(
          401,
          {},
          {
            'www-authenticate':
              'Bearer resource_metadata="' +
              this.base +
              '/' +
              source +
              '/metadata"',
          }
        );
      if (req.method === 'GET') {
        if (this.providerRequired && !this.providerReady) {
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          res.end(
            'event: message\ndata: ' +
              JSON.stringify({
                jsonrpc: '2.0',
                id: 'provider',
                method: 'elicitation/create',
                params: {
                  elicitationId: 'provider',
                  mode: 'url',
                  url: 'https://provider.example/consent',
                  message: 'Connect provider',
                },
              }) +
              '\n\n'
          );
          return;
        }
        return send(405, {});
      }
      if (req.method === 'DELETE') return send(200, {});
      const rpc = JSON.parse(raw) as { id?: unknown; method: string };
      if (rpc.method === 'initialize') {
        this.initialized.push(source);
        return send(200, {
          jsonrpc: '2.0',
          id: rpc.id,
          result: {
            protocolVersion: '2025-11-25',
            capabilities: { tools: {} },
            serverInfo: { name: source, version: '1' },
          },
        });
      }
      if (rpc.method === 'tools/list') {
        return send(200, {
          jsonrpc: '2.0',
          id: rpc.id,
          result: {
            tools: [
              {
                name: 'tool_' + source,
                description: 'Fixture tool',
                inputSchema: { type: 'object', properties: {} },
              },
            ],
          },
        });
      }
      return send(202, '');
    }
    send(404, {});
  }
}
async function authorize(url: string, sources = ['a', 'b']) {
  const page = await realFetch(url);
  const html = await page.text();
  const csrf = html.match(/name="transaction" value="([^"]+)"/)?.[1];
  expect(csrf).toBeDefined();
  const post = (path: string, values: Record<string, string>) =>
    realFetch(url + path, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ transaction: csrf!, ...values }),
    });
  expect((await post('/continue', {})).status).toBe(409);
  for (const source of sources) {
    const connect = await post('/connect', { backend: source });
    expect(connect.status).toBe(303);
    const issuer = await realFetch(connect.headers.get('location')!, {
      redirect: 'manual',
    });
    expect(issuer.status).toBe(302);
    const callback = await realFetch(issuer.headers.get('location')!, {
      redirect: 'manual',
    });
    expect(callback.status).toBe(303);
  }
  expect((await post('/continue', {})).status).toBe(200);
}

nativeDescribe('real embedded authorization artifact', () => {
  let fixture: OAuthFixture;
  const oldPath = process.env.GOPHER_ORCH_LIBRARY_PATH;
  const oldKey = process.env.OPENAI_API_KEY;
  beforeAll(() => {
    process.env.GOPHER_ORCH_LIBRARY_PATH = artifact;
    process.env.OPENAI_API_KEY = 'fixture-only';
  });
  beforeEach(async () => {
    fixture = new OAuthFixture();
    await fixture.start();
  });
  afterEach(async () => {
    global.fetch = realFetch;
    await fixture.close();
  });
  afterAll(() => {
    if (oldPath === undefined) delete process.env.GOPHER_ORCH_LIBRARY_PATH;
    else process.env.GOPHER_ORCH_LIBRARY_PATH = oldPath;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
    GopherAgent.shutdown();
  });
  test.each([false, true])(
    'API factory uses one page, distinct grants and native handoff (shared issuer=%s)',
    async (shared) => {
      fixture.shared = shared;
      let inventoryCalls = 0;
      global.fetch = ((input, init) => {
        if (
          input
            .toString()
            .startsWith('https://api.gopher.security/v1/mcp-servers') ||
          input
            .toString()
            .startsWith('https://api-test.gopher.security/v1/mcp-servers')
        ) {
          inventoryCalls++;
          expect(init?.method).toBe('POST');
          return Promise.resolve(
            new Response(fixture.inventory(), { status: 200 })
          );
        }
        return realFetch(input, init);
      }) as typeof fetch;
      const pages = jest.fn(async (url: string) => authorize(url));
      const store = new Map<string, GopherAgentTokenRecord>();
      const options: GopherAgentCreateOptions = {
        oauth: {
          openBrowser: false,
          tokenStore: {
            get: async (key) => store.get(key),
            set: async (key, value) => {
              store.set(key, value);
            },
            delete: async (key) => {
              store.delete(key);
            },
          },
          assemble: {
            identityNamespace: 'fixture-user',
            allowLoopbackHttp: true,
            networkTimeoutMs: 2000,
            onAuthorizationUrl: pages,
          },
        },
      };
      const create = () =>
        GopherAgent.createWithApiKey(
          'OpenAIProvider',
          'fixture-model',
          'inventory-fixture',
          options
        );
      const agent = await create();
      try {
        expect(pages).toHaveBeenCalledTimes(1);
        expect(inventoryCalls).toBe(1);
        expect(store.size).toBe(2);
        expect(fixture.tokens.get('a')).not.toBe(fixture.tokens.get('b'));
        expect(fixture.initialized).toEqual(expect.arrayContaining(['a', 'b']));
        expect(
          GopherOrchLibrary.getInstance()?.embeddedAuthCapabilities()?.version
        ).toBe(1);
      } finally {
        await agent.disposeAsync();
      }
      const bToken = fixture.tokens.get('b');
      for (const token of store.values()) {
        if (token.embeddedGrant?.binding.source.includes('/a/mcp'))
          token.embeddedGrant.expires_at = 0;
      }
      const cached = await create();
      try {
        expect(pages).toHaveBeenCalledTimes(1);
        expect(fixture.refreshes).toEqual(['a']);
        expect(fixture.tokens.get('b')).toBe(bToken);
        expect(inventoryCalls).toBe(2);
      } finally {
        await cached.disposeAsync();
      }
    },
    30000
  );
  test('server assemble completion still permits existing provider discovery authorization', async () => {
    fixture.providerRequired = true;
    global.fetch = ((input, init) =>
      input.toString().includes('/v1/mcp-servers')
        ? Promise.resolve(new Response(fixture.inventory(), { status: 200 }))
        : realFetch(input, init)) as typeof fetch;
    const providerHandler = jest.fn(() => {
      expect(fixture.tokens.size).toBe(2);
      fixture.providerReady = true;
      return 'accept' as const;
    });
    const agent = await GopherAgent.createWithApiKey(
      'OpenAIProvider',
      'fixture-model',
      'fixture',
      {
        elicitation: { handler: providerHandler },
        oauth: {
          openBrowser: false,
          assemble: {
            allowLoopbackHttp: true,
            onAuthorizationUrl: async (url) => authorize(url),
          },
        },
      }
    );
    try {
      expect(providerHandler).toHaveBeenCalled();
      expect(fixture.providerReady).toBe(true);
    } finally {
      await agent.disposeAsync();
    }
  }, 30000);

  test('cancelling real native authorization closes its local page', async () => {
    global.fetch = ((input, init) =>
      input.toString().includes('/v1/mcp-servers')
        ? Promise.resolve(new Response(fixture.inventory(), { status: 200 }))
        : realFetch(input, init)) as typeof fetch;
    const controller = new AbortController();
    let privateUrl = '';
    await expect(
      GopherAgent.createWithApiKey(
        'OpenAIProvider',
        'fixture-model',
        'fixture',
        {
          oauth: {
            assemble: {
              signal: controller.signal,
              allowLoopbackHttp: true,
              onAuthorizationUrl: (url) => {
                privateUrl = url;
                controller.abort();
              },
            },
          },
        }
      )
    ).rejects.toThrow('cancelled');
    expect(privateUrl).not.toBe('');
    await expect(realFetch(privateUrl)).rejects.toThrow();
  }, 30000);
  test('concurrent creates keep page transactions and identity-bound stores separate', async () => {
    global.fetch = ((input, init) =>
      input.toString().includes('/v1/mcp-servers')
        ? Promise.resolve(new Response(fixture.inventory(), { status: 200 }))
        : realFetch(input, init)) as typeof fetch;
    const urls: string[] = [];
    const agents = await Promise.all(
      ['user-one', 'user-two'].map((identityNamespace) =>
        GopherAgent.createWithApiKey(
          'OpenAIProvider',
          'fixture-model',
          'fixture',
          {
            oauth: {
              assemble: {
                identityNamespace,
                allowLoopbackHttp: true,
                onAuthorizationUrl: async (url) => {
                  urls.push(url);
                  await authorize(url);
                },
              },
            },
          }
        )
      )
    );
    try {
      expect(new Set(urls).size).toBe(2);
      expect(agents).toHaveLength(2);
    } finally {
      await Promise.all(agents.map((agent) => agent.disposeAsync()));
    }
  }, 30000);
});
