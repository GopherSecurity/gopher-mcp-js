import { normalizeInventoryResponse } from '../src/inventoryResponse';
import { extractMcpServerTargets } from '../src/oauthServerTargets';
import fixtures from './fixtures/inventory/conformance.json';

describe('native inventory response conformance', () => {
  test.each(fixtures.response_cases)('$name', (item) => {
    const body = JSON.stringify(item.response);
    if (!item.valid) {
      expect(() => normalizeInventoryResponse(body)).toThrow(
        'Inventory backend rejected'
      );
    } else {
      const normalized = normalizeInventoryResponse(body);
      const servers = JSON.parse(normalized).data.servers;
      expect(servers).toHaveLength(item.count!);
      expect(
        extractMcpServerTargets({ serverConfig: normalized }).map((s) => s.url)
      ).toEqual(servers.map((s: { config: { url: string } }) => s.config.url));
    }
  });
  test('only data.servers routes and nested credentials reach OAuth', () => {
    const gateway = fixtures.response_cases[1]!.response.data!.servers[0]!;
    const envelope = {
      succeeded: true,
      servers: [],
      data: {
        sources: [],
        servers: [
          {
            ...gateway,
            serverId: 'wrong',
            url: 'https://wrong.invalid',
            headers: { Authorization: 'wrong' },
          },
        ],
      },
    };
    const normalized = normalizeInventoryResponse(JSON.stringify(envelope));
    expect(extractMcpServerTargets({ serverConfig: normalized })).toEqual([
      {
        serverId: 'gateway-1',
        name: 'remote-gateway',
        url: gateway.config.url,
        headers: gateway.config.headers,
      },
    ]);
  });
  test.each([
    {},
    { succeeded: true },
    { succeeded: true, data: { sources: [] } },
    {
      succeeded: true,
      data: { servers: [{ name: 'bad', transport: 'http_sse', config: {} }] },
    },
    { succeeded: true, message: 'secret', data: { servers: [] } },
  ])('rejects invalid envelope/source without echoing body %#', (data) => {
    expect(() => normalizeInventoryResponse(JSON.stringify(data))).toThrow();
    try {
      normalizeInventoryResponse(JSON.stringify(data));
    } catch (error) {
      expect((error as Error).message).not.toContain('secret');
    }
  });
  test('rejects conflicting names while retaining distinct routes', () => {
    const source = fixtures.response_cases[0]!.response.data!.servers[0]!;
    expect(() =>
      normalizeInventoryResponse(
        JSON.stringify({
          succeeded: true,
          data: {
            servers: [
              source,
              { ...source, config: { url: 'https://different.invalid' } },
            ],
          },
        })
      )
    ).toThrow('same runtime name');
  });
  test('canonicalizes a literal fallback endpoint without interpreting credentials', () => {
    const body = JSON.stringify({
      succeeded: true,
      data: {
        servers: [
          {
            name: 'fallback',
            transport: 'http',
            http_sse: {
              url: 'https://example.invalid/mcp',
              headers: { Authorization: 'Bearer fixture' },
            },
          },
        ],
      },
    });
    const normalized = normalizeInventoryResponse(body);
    expect(JSON.parse(normalized).data.servers[0].config).toEqual({
      url: 'https://example.invalid/mcp',
      headers: { Authorization: 'Bearer fixture' },
    });
    expect(extractMcpServerTargets({ serverConfig: normalized })[0]?.url).toBe(
      'https://example.invalid/mcp'
    );
  });

  test.each([
    { name: 'command', config: { command: 'sh', args: ['-c', 'echo unsafe'] } },
    { name: 'command', transport: 'stdio', config: { command: 'sh' } },
    { name: 'command', transport: 'stdio', stdio: { command: 'sh' } },
    { name: 'command', transport: null, config: { command: 'sh' } },
  ])('rejects API-sourced local command entries %#', (entry) => {
    expect(() =>
      normalizeInventoryResponse(
        JSON.stringify({ succeeded: true, data: { servers: [entry] } })
      )
    ).toThrow('explicit network transport');
  });

  test.each(['url', 'headers', 'fallback', 'root'])(
    'rejects native-expanded environment references in %s without leaking host values',
    (field) => {
      const key = 'INVENTORY_FIXTURE_SECRET';
      const original = process.env[key];
      process.env[key] = 'host-secret-never-leave';
      try {
        const reference = '${' + key + '}';
        const entry: Record<string, unknown> = {
          name: 'network',
          transport: 'http',
          config: { url: 'https://remote.invalid/mcp' },
        };
        const config = entry.config as Record<string, unknown>;
        const envelope = {
          succeeded: true,
          data: { servers: [entry], base_url: '' },
        };
        if (field === 'url')
          config.url = 'https://remote.invalid/?secret=' + reference;
        if (field === 'headers') config.headers = { Authorization: reference };
        if (field === 'fallback') {
          delete entry.config;
          entry.http_sse = { url: 'https://remote.invalid/' + reference };
        }
        if (field === 'root') envelope.data.base_url = reference;
        expect(() =>
          normalizeInventoryResponse(JSON.stringify(envelope))
        ).toThrow('must not contain environment variable references');
        try {
          normalizeInventoryResponse(JSON.stringify(envelope));
        } catch (error) {
          expect((error as Error).message).not.toContain(
            'host-secret-never-leave'
          );
          expect((error as Error).message).not.toContain(key);
        }
        expect(process.env[key]).toBe('host-secret-never-leave');
      } finally {
        if (original === undefined) delete process.env[key];
        else process.env[key] = original;
      }
    }
  );

  test.each(['http_sse', 'streamable_http', 'websocket'])(
    'rejects environment references in effective %s fallback URL and headers',
    (fallback) => {
      for (const config of [
        { url: 'https://example.invalid/${HOST_SECRET}' },
        {
          url: 'https://example.invalid/mcp',
          headers: { Authorization: '${HOST_SECRET}' },
        },
      ]) {
        const entry = {
          name: 'fallback',
          transport: fallback === 'websocket' ? 'websocket' : 'http',
          [fallback]: config,
        };
        expect(() =>
          normalizeInventoryResponse(
            JSON.stringify({ succeeded: true, data: { servers: [entry] } })
          )
        ).toThrow('must not contain environment variable references');
      }
    }
  );

  test('preserves literal placeholders in descriptive text, identities, keys and unused fields', () => {
    const reference = '${DOCUMENTATION_EXAMPLE}';
    const body = JSON.stringify({
      succeeded: true,
      description: reference,
      data: {
        description: reference,
        servers: [
          {
            id: reference,
            name: 'Example ' + reference,
            transport: 'http',
            description: 'Use ' + reference + ' in your tool input',
            tools: [
              {
                name: 'example',
                description: reference,
                inputSchema: { description: reference },
              },
            ],
            metadata: { [reference]: reference },
            config: {
              url: 'https://example.invalid/mcp',
              headers: { Authorization: 'literal-token' },
              extra: { description: reference },
            },
            http_sse: {
              url: 'https://unused.invalid/' + reference,
              headers: { Authorization: reference },
            },
          },
        ],
      },
    });
    const normalized = normalizeInventoryResponse(body);
    expect(normalized).toBe(body);
    expect(extractMcpServerTargets({ serverConfig: normalized })[0]?.url).toBe(
      'https://example.invalid/mcp'
    );
  });
  test.each([
    'http_sse',
    'http-sse',
    'sse',
    'streamable_http',
    'streamable-http',
    'http_stream',
    'http',
    'websocket',
    'ws',
  ])('accepts explicit remote network transport %s', (transport) => {
    const body = JSON.stringify({
      succeeded: true,
      data: {
        servers: [
          {
            name: 'network',
            transport,
            config: {
              url: 'https://example.invalid/mcp',
              headers: { Authorization: 'literal-token' },
            },
          },
        ],
      },
    });
    expect(normalizeInventoryResponse(body)).toBe(body);
  });
  test.each([
    { config: { url: 'https://example.invalid', verify_ssl: 'yes' } },
    { requestTimeout: 'long' },
    { id: 3 },
  ])('rejects native conversion failures %#', (override) => {
    const source = fixtures.response_cases[0]!.response.data!.servers[0]!;
    expect(() =>
      normalizeInventoryResponse(
        JSON.stringify({
          succeeded: true,
          data: { servers: [{ ...source, ...override }] },
        })
      )
    ).toThrow('Invalid inventory source');
  });
  test.each(['sources', 'futureRoutes', 'errors'])(
    'rejects unsupported non-empty data.%s instead of dropping it',
    (field) => {
      expect(() =>
        normalizeInventoryResponse(
          JSON.stringify({
            succeeded: true,
            data: { servers: [], [field]: [{ token: 'private-token' }] },
          })
        )
      ).toThrow('Unsupported non-empty inventory collection');
    }
  );
  test('rejects non-empty alternate top-level collections', () => {
    expect(() =>
      normalizeInventoryResponse(
        JSON.stringify({
          succeeded: true,
          servers: [{ name: 'bypass' }],
          data: { servers: [] },
        })
      )
    ).toThrow('Unsupported non-empty inventory collection');
  });
  test.each([
    { gatewayId: ['gateway-1'] },
    { gatewayName: ['remote-gateway'] },
  ])(
    'shared gateway-only fixture conforms with gateway selection %p',
    (selection) => {
      const gateway = fixtures.response_cases[1]!.response.data!.servers[0]!;
      const envelope = (servers: unknown[]) =>
        JSON.stringify({ succeeded: true, data: { servers } });
      for (const servers of [
        [],
        [
          {
            ...gateway,
            config: {
              url: 'https://example.invalid/v1/mcp/servers/gateway-1/mcp',
            },
          },
        ],
      ]) {
        expect(() =>
          normalizeInventoryResponse(envelope(servers), selection)
        ).toThrow('refusing backing-server substitution');
      }
      const body = envelope([gateway]);
      const normalized = normalizeInventoryResponse(body, selection);
      expect(normalized).toBe(body);
      expect(
        extractMcpServerTargets({ serverConfig: normalized })[0]?.url
      ).toBe(gateway.config.url);
      expect(JSON.parse(normalized).data.servers[0].config.headers).toEqual(
        gateway.config.headers
      );
    }
  );
  test('requires every requested gateway even with direct servers in a mixed result', () => {
    const gateway = {
      ...fixtures.response_cases[1]!.response.data!.servers[0]!,
      type: 'gateway',
    };
    const body = JSON.stringify({
      succeeded: true,
      data: { servers: [gateway] },
    });
    expect(() =>
      normalizeInventoryResponse(body, {
        serverId: ['s'],
        gatewayId: ['missing'],
      })
    ).toThrow('refusing backing-server substitution');
    expect(() =>
      normalizeInventoryResponse(body, { gatewayId: ['gateway-1', 'missing'] })
    ).toThrow('refusing backing-server substitution');
    expect(() =>
      normalizeInventoryResponse(body, { gatewayName: ['wrong'] })
    ).toThrow('refusing backing-server substitution');
  });
  test('normalizes separate gateway endpoints without exposing backing members', () => {
    const gateway = fixtures.response_cases[1]!.response.data!.servers[0]!;
    const normalized = normalizeInventoryResponse(
      JSON.stringify({ succeeded: true, data: { gateways: [gateway] } }),
      { gatewayId: ['gateway-1'] }
    );
    const data = JSON.parse(normalized).data;
    expect(data.gateways).toBeUndefined();
    expect(data.servers).toEqual([{ ...gateway, type: 'gateway' }]);
    expect(extractMcpServerTargets({ serverConfig: normalized })[0]?.url).toBe(
      gateway.config.url
    );
  });
  test('merges separately selected direct and gateway endpoints without duplication', () => {
    const direct = fixtures.response_cases[0]!.response.data!.servers[0]!;
    const gateway = fixtures.response_cases[1]!.response.data!.servers[0]!;
    const normalized = normalizeInventoryResponse(
      JSON.stringify({
        succeeded: true,
        data: {
          servers: [direct, { ...gateway, type: 'gateway' }],
          gateways: [gateway],
        },
      }),
      { serverId: ['server-1'], gatewayName: ['remote-gateway'] }
    );
    expect(JSON.parse(normalized).data.servers).toHaveLength(2);
  });
  test.each([
    { id: 'gateway-1', name: 'remote-gateway', members: ['server-1'] },
    { id: 'gateway-1', name: 'remote-gateway', type: 'server' },
    {
      id: 'gateway-1',
      name: 'remote-gateway',
      transport: 'stdio',
      config: { command: 'sh' },
    },
  ])(
    'rejects unsupported gateway configuration without guessing a route: %p',
    (gateway) => {
      expect(() =>
        normalizeInventoryResponse(
          JSON.stringify({
            succeeded: true,
            data: { servers: [], gateways: [gateway] },
          }),
          { gatewayId: ['gateway-1'] }
        )
      ).toThrow();
    }
  );
  test('gateway-only selection refuses direct/backing routes even when the gateway is present', () => {
    const gateway = fixtures.response_cases[1]!.response.data!.servers[0]!;
    const direct = fixtures.response_cases[0]!.response.data!.servers[0]!;
    expect(() =>
      normalizeInventoryResponse(
        JSON.stringify({
          succeeded: true,
          data: { servers: [direct], gateways: [gateway] },
        }),
        { gatewayId: ['gateway-1'] }
      )
    ).toThrow('refusing backing-server substitution');
  });
  test.each(['mcp', 'sse'])(
    'canonical gateway /%s route also matches its path ID',
    (endpoint) => {
      const entry = {
        ...fixtures.response_cases[1]!.response.data!.servers[0]!,
        id: 'inventory-alias',
        config: {
          url:
            'https://example.invalid/v1/mcp/gateways/gateway-1/' +
            endpoint +
            '/',
        },
      };
      const body = JSON.stringify({
        succeeded: true,
        data: { servers: [entry] },
      });
      expect(
        normalizeInventoryResponse(body, { gatewayId: ['gateway-1'] })
      ).toBe(body);
    }
  );
  test('canonical route accepts decoded gateway identity and ignores query/fragment text', () => {
    const entry = {
      ...fixtures.response_cases[1]!.response.data!.servers[0]!,
      id: 'alias',
      config: {
        url: 'https://example.invalid/v1/mcp/gateways/gateway%2D1/mcp?ignored=true#status',
      },
    };
    const body = JSON.stringify({
      succeeded: true,
      data: { servers: [entry] },
    });
    expect(normalizeInventoryResponse(body, { gatewayId: ['gateway-1'] })).toBe(
      body
    );
  });
  test.each([
    'https://example.invalid/v1/mcp/servers/gateway-1/mcp',
    'https://example.invalid/v1/mcp/servers/gateway-1/sse',
    'https://example.invalid/mcp?route=/v1/mcp/gateways/gateway-1/mcp',
    'https://example.invalid/other/v1/mcp/gateways/gateway-1/mcp',
    'https://example.invalid/v1/mcp/gateways/gateway-1/mcp/extra',
    'https://example.invalid/v1/mcp/gateways/gateway-1/other',
    'https://example.invalid/v1/mcp/gateways/gateway%2F1/mcp',
    'https://example.invalid/v1/mcp/gateways/gateway%5C1/mcp',
    'https://example.invalid/v1/mcp/gateways/%GG/mcp',
    'https://example.invalid/v1/mcp/gateways//mcp',
    'file:///v1/mcp/gateways/gateway-1/mcp',
  ])(
    'noncanonical or backing URL cannot satisfy an untyped gateway selection: %s',
    (url) => {
      const entry = {
        ...fixtures.response_cases[1]!.response.data!.servers[0]!,
        config: { url },
      };
      const body = JSON.stringify({
        succeeded: true,
        data: { servers: [entry] },
      });
      expect(() =>
        normalizeInventoryResponse(body, { gatewayId: ['gateway-1'] })
      ).toThrow('refusing backing-server substitution');
    }
  );
  test('an explicit marker cannot bless a backing-server URL', () => {
    const entry = {
      ...fixtures.response_cases[1]!.response.data!.servers[0]!,
      type: 'gateway',
      config: { url: 'https://example.invalid/v1/mcp/servers/gateway-1/mcp' },
    };
    expect(() =>
      normalizeInventoryResponse(
        JSON.stringify({ succeeded: true, data: { servers: [entry] } }),
        { gatewayName: ['remote-gateway'] }
      )
    ).toThrow('refusing backing-server substitution');
  });
});
