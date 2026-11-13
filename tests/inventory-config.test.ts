import { GopherAgentConfig, normalizeRuntimeOptions } from '../src/config';
import { GopherAgent } from '../src/agent';

describe('inventory creation configuration', () => {
  test('builder retains selectors and runtime options independently', () => {
    const ids = ['s1'];
    const config = GopherAgentConfig.builder()
      .provider('p')
      .model('m')
      .apiKey('key')
      .runtimeOptions({
        serverId: ids,
        gatewayName: ['Prod'],
        oauth: { mode: 'disabled' },
        accessToken: 'runtime',
      })
      .build();
    ids.push('s2');
    expect(config.runtimeOptions?.serverId).toEqual(['s1']);
    expect(config.runtimeOptions?.gatewayName).toEqual(['Prod']);
    expect(normalizeRuntimeOptions(config.runtimeOptions)).toEqual({
      accessToken: 'runtime',
    });
  });
  test('config-only creation rejects selectors', () => {
    expect(() =>
      GopherAgentConfig.builder()
        .provider('p')
        .model('m')
        .serverConfig('{}')
        .runtimeOptions({ serverId: [] })
        .build()
    ).toThrow('Inventory selectors');
  });
  test('URL and server-config factories reject selectors before network/native work', async () => {
    await expect(
      GopherAgent.createWithUrl('p', 'm', 'https://example.invalid', {
        gatewayId: ['g'],
      })
    ).rejects.toThrow('Inventory selectors');
    await expect(
      GopherAgent.createWithServerConfig('p', 'm', '{}', { serverName: ['s'] })
    ).rejects.toThrow('Inventory selectors');
  });
});
