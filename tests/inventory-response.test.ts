import { normalizeInventoryResponse } from '../src/inventoryResponse';
import { extractMcpServerTargets } from '../src/oauthServerTargets';
import fixtures from '../third_party/gopher-orch/tests/fixtures/inventory/conformance.json';

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
  test('canonicalizes fallback URL and environment headers for the same native route', () => {
    process.env.INVENTORY_FIXTURE_HOST = 'https://example.invalid/mcp';
    try {
      const body = JSON.stringify({
        succeeded: true,
        data: {
          servers: [
            {
              name: 'fallback',
              transport: 'http',
              http_sse: {
                url: '${INVENTORY_FIXTURE_HOST}',
                headers: { Authorization: 'Bearer fixture' },
              },
            },
          ],
        },
      });
      const normalized = normalizeInventoryResponse(body);
      expect(JSON.parse(normalized).data.servers[0].config.url).toBe(
        'https://example.invalid/mcp'
      );
      expect(
        extractMcpServerTargets({ serverConfig: normalized })[0]?.url
      ).toBe('https://example.invalid/mcp');
    } finally {
      delete process.env.INVENTORY_FIXTURE_HOST;
    }
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
  test.each(['gateways', 'sources', 'futureRoutes', 'errors'])(
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
  ])('requires explicit gateway identity for selection %p', (selection) => {
    const gateway = fixtures.response_cases[1]!.response.data!.servers[0]!;
    const envelope = (servers: unknown[]) =>
      JSON.stringify({ succeeded: true, data: { servers } });
    for (const servers of [[], [gateway], [{ ...gateway, type: 'server' }]]) {
      expect(() =>
        normalizeInventoryResponse(envelope(servers), selection)
      ).toThrow('refusing backing-server substitution');
    }
    const marked = { ...gateway, type: 'gateway' };
    const normalized = normalizeInventoryResponse(
      envelope([marked]),
      selection
    );
    expect(extractMcpServerTargets({ serverConfig: normalized })[0]?.url).toBe(
      gateway.config.url
    );
    expect(JSON.parse(normalized).data.servers[0].config.headers).toEqual(
      gateway.config.headers
    );
  });
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
});
