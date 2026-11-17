import { createHash } from 'node:crypto';
import { McpOAuthClient } from '../src/mcpOAuthClient';
import type { McpHttpRequest } from '../src/oauthFetch';

const serverUrl = 'https://mcp.example/server/mcp';
const resource = serverUrl;
const redirectUri = 'http://127.0.0.1:3000/oauth/callback';

function fixture(method?: string, secret?: string) {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  let authorizationEndpoint = 'https://auth.example/authorize';
  let revoke = true;
  let protectedResource = resource;
  let issuer = 'https://auth.example';
  let oidcFallback = false;
  const request: McpHttpRequest = async (url, init) => {
    await Promise.resolve();
    requests.push({ url, init });
    expect(init.redirect).toBe('manual');
    const json = (body: unknown) => new Response(JSON.stringify(body));
    if (url === serverUrl)
      return new Response('', {
        status: 401,
        headers: {
          'WWW-Authenticate':
            'Bearer resource_metadata="https://mcp.example/metadata"',
        },
      });
    if (url === 'https://mcp.example/metadata')
      return json({
        resource: protectedResource,
        authorization_servers: ['https://auth.example'],
        scopes_supported: ['mcp:read'],
      });
    if (
      oidcFallback &&
      url === 'https://auth.example/.well-known/oauth-authorization-server'
    )
      return new Response('', { status: 404 });
    if (
      url === 'https://auth.example/.well-known/oauth-authorization-server' ||
      (oidcFallback &&
        url === 'https://auth.example/.well-known/openid-configuration')
    )
      return json({
        issuer,
        authorization_endpoint: authorizationEndpoint,
        token_endpoint: 'https://auth.example/token',
        registration_endpoint: 'https://auth.example/register',
        ...(revoke
          ? { revocation_endpoint: 'https://auth.example/revoke' }
          : {}),
        scopes_supported: ['mcp:read', 'unrelated:admin', 'openid'],
      });
    if (url === 'https://auth.example/register')
      return json({
        client_id: 'client',
        ...(secret ? { client_secret: secret } : {}),
        ...(method ? { token_endpoint_auth_method: method } : {}),
      });
    if (url === 'https://auth.example/token')
      return json({ access_token: 'token', expires_in: 300 });
    if (url === 'https://auth.example/revoke')
      return new Response('', { status: 200 });
    throw new Error(`Unexpected request: ${url}`);
  };
  return {
    request,
    requests,
    insecure: () => {
      authorizationEndpoint = 'http://auth.example/authorize';
    },
    resource: (value: string) => {
      protectedResource = value;
    },
    issuer: (value: string) => {
      issuer = value;
    },
    oidc: () => {
      oidcFallback = true;
    },
    noRevocation: () => {
      revoke = false;
    },
  };
}

for (const [method, secret] of [
  [undefined, undefined],
  ['client_secret_post', 'secret'],
  ['client_secret_basic', 'secret'],
  [undefined, 'secret'],
] as const) {
  test(`web OAuth round trip: ${method ?? 'default'} ${secret ? 'confidential' : 'public'}`, async () => {
    const f = fixture(method, secret);
    const client = new McpOAuthClient({
      request: f.request,
      clientName: 'Web app',
    });
    const { authorizeUrl, pending } = await client.start(
      serverUrl,
      redirectUri
    );
    const authorize = new URL(authorizeUrl);
    expect(authorize.searchParams.get('redirect_uri')).toBe(redirectUri);
    expect(authorize.searchParams.get('resource')).toBe(resource);
    expect(authorize.searchParams.get('scope')).toBe('mcp:read');
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(pending.codeVerifier).digest('base64url')
    );
    expect(authorize.searchParams.has('client_secret')).toBe(false);
    const registration = JSON.parse(
      f.requests.find((r) => r.url.endsWith('/register'))!.init.body as string
    );
    expect(registration).toMatchObject({
      client_name: 'Web app',
      scope: 'mcp:read',
      redirect_uris: [redirectUri],
    });
    await expect(
      client.exchange(pending, { code: 'code', state: pending.state })
    ).resolves.toMatchObject({ accessToken: 'token' });
    const token = f.requests.find((r) => r.url.endsWith('/token'))!;
    const form = new URLSearchParams(token.init.body as URLSearchParams);
    expect(form.get('code_verifier')).toBe(pending.codeVerifier);
    expect(form.get('redirect_uri')).toBe(redirectUri);
    expect(form.get('resource')).toBe(resource);
    expect(new Headers(token.init.headers).has('authorization')).toBe(
      pending.tokenEndpointAuthMethod === 'client_secret_basic'
    );
    expect(form.get('client_secret')).toBe(
      method === 'client_secret_post' ? secret : null
    );
  });
}

test('state mismatch is rejected before token exchange', async () => {
  const f = fixture();
  const client = new McpOAuthClient({ request: f.request });
  const { pending } = await client.start(serverUrl, redirectUri);
  await expect(
    client.exchange(pending, { code: 'code', state: 'wrong' })
  ).rejects.toMatchObject({ code: 'OAUTH_STATE_MISMATCH' });
  expect(f.requests.some((r) => r.url.endsWith('/token'))).toBe(false);
});

test('all metadata requests pass through the application URL policy', async () => {
  const f = fixture();
  const client = new McpOAuthClient({
    request: async (url, init) => {
      if (url.includes('auth.example'))
        throw new Error('Blocked by application URL policy');
      return f.request(url, init);
    },
  });
  await expect(client.start(serverUrl, redirectUri)).rejects.toThrow(
    'Blocked by application URL policy'
  );
  expect(f.requests.some((r) => r.url.endsWith('/register'))).toBe(false);
});

test('insecure authorization endpoints are rejected before registration', async () => {
  const f = fixture();
  f.insecure();
  await expect(
    new McpOAuthClient({ request: f.request }).start(serverUrl, redirectUri)
  ).rejects.toMatchObject({ code: 'OAUTH_ENDPOINT_INVALID' });
  expect(f.requests.some((r) => r.url.endsWith('/register'))).toBe(false);
});

test('parallel clients keep request adapters isolated', async () => {
  const a = fixture();
  const b = fixture();
  const makeClient = (f: ReturnType<typeof fixture>, id: string) =>
    new McpOAuthClient({
      request: async (url, init) => {
        const response = await f.request(url, init);
        return url.endsWith('/register')
          ? new Response(JSON.stringify({ client_id: id }))
          : response;
      },
    });
  const [first, second] = await Promise.all([
    makeClient(a, 'a').start(serverUrl, redirectUri),
    makeClient(b, 'b').start(serverUrl, redirectUri),
  ]);
  expect(first.pending.clientId).toBe('a');
  expect(second.pending.clientId).toBe('b');
  expect(a.requests.length).toBe(b.requests.length);
});

test('revocation uses the discovered endpoint and submitted token', async () => {
  const f = fixture();
  await expect(
    new McpOAuthClient({ request: f.request }).revoke(serverUrl, 'access-token')
  ).resolves.toBe(true);
  const revocation = f.requests.find((r) => r.url.endsWith('/revoke'))!;
  expect(
    new URLSearchParams(revocation.init.body as URLSearchParams).get('token')
  ).toBe('access-token');
});

test('missing revocation endpoint returns false', async () => {
  const f = fixture();
  f.noRevocation();
  await expect(
    new McpOAuthClient({ request: f.request }).revoke(serverUrl, 'access-token')
  ).resolves.toBe(false);
});

describe.each(['start', 'revoke'] as const)(
  'metadata identity validation during %s',
  (operation) => {
    const invoke = (client: McpOAuthClient) =>
      operation === 'start'
        ? client.start(serverUrl, redirectUri)
        : client.revoke(serverUrl, 'private-access-token');

    test.each([
      'https://victim.example/mcp',
      'https://mcp.example/server',
      serverUrl + '/',
      'https://MCP.example/server/mcp',
      'https://mcp.example:443/server/mcp',
      'https://mcp.example/server/%6dcp',
    ])(
      'rejects mismatched resource %s before contacting the authorization server',
      async (value) => {
        const f = fixture();
        f.resource(value);
        await expect(
          invoke(new McpOAuthClient({ request: f.request }))
        ).rejects.toMatchObject({ code: 'OAUTH_RESOURCE_MISMATCH' });
        expect(f.requests.map((r) => r.url)).toEqual([
          serverUrl,
          'https://mcp.example/metadata',
        ]);
        expect(JSON.stringify(f.requests)).not.toContain(
          'private-access-token'
        );
      }
    );

    test.each([
      'https://victim.example',
      'https://auth.example/tenant',
      'https://auth.example/',
      'https://AUTH.example',
      'https://auth.example:443',
    ])(
      'rejects mismatched issuer %s before registration or token submission',
      async (value) => {
        const f = fixture();
        f.issuer(value);
        await expect(
          invoke(new McpOAuthClient({ request: f.request }))
        ).rejects.toMatchObject({ code: 'OAUTH_ISSUER_MISMATCH' });
        expect(f.requests.map((r) => r.url)).toEqual([
          serverUrl,
          'https://mcp.example/metadata',
          'https://auth.example/.well-known/oauth-authorization-server',
        ]);
        expect(JSON.stringify(f.requests)).not.toContain(
          'private-access-token'
        );
      }
    );

    test('also validates the issuer returned by OIDC fallback', async () => {
      const f = fixture();
      f.oidc();
      f.issuer('https://victim.example');
      await expect(
        invoke(new McpOAuthClient({ request: f.request }))
      ).rejects.toMatchObject({ code: 'OAUTH_ISSUER_MISMATCH' });
      expect(f.requests.at(-1)?.url).toBe(
        'https://auth.example/.well-known/openid-configuration'
      );
      expect(
        f.requests.some((r) => /\/(register|token|revoke)$/.test(r.url))
      ).toBe(false);
    });
  }
);

test('OIDC fallback with matching identities still permits authorization', async () => {
  const f = fixture();
  f.oidc();
  await expect(
    new McpOAuthClient({ request: f.request }).start(serverUrl, redirectUri)
  ).resolves.toHaveProperty('pending.resource', serverUrl);
});
