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
      servers: [{ url: 'https://bypass.invalid' }],
      data: {
        sources: [{ url: 'https://ignored.invalid' }],
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
});
