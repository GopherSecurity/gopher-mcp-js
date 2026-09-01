import { extractMcpServerTargets } from '../src/oauthServerTargets';

describe('extractMcpServerTargets', () => {
  test('extracts direct url', () => {
    expect(
      extractMcpServerTargets({ url: 'http://127.0.0.1:3001/mcp' })
    ).toEqual([{ url: 'http://127.0.0.1:3001/mcp' }]);
  });

  test('extracts nested config url with identity metadata', () => {
    const serverConfig = JSON.stringify({
      succeeded: true,
      data: {
        servers: [
          {
            serverId: 'srv-1',
            name: 'mail',
            serverName: 'mail-tools',
            transport: 'http_sse',
            config: { url: 'https://mcp.example.com/mail' },
          },
        ],
      },
    });

    expect(extractMcpServerTargets({ serverConfig })).toEqual([
      {
        serverId: 'srv-1',
        name: 'mail',
        serverName: 'mail-tools',
        url: 'https://mcp.example.com/mail',
      },
    ]);
  });

  test('extracts server config headers', () => {
    const serverConfig = JSON.stringify({
      servers: [
        {
          name: 'api-key-server',
          transport: 'http_sse',
          config: {
            url: 'https://mcp.example.com/mcp',
            headers: {
              'X-Api-Key': 'api-key',
              ignored: 123,
            },
          },
        },
      ],
    });

    expect(extractMcpServerTargets({ serverConfig })).toEqual([
      {
        name: 'api-key-server',
        url: 'https://mcp.example.com/mcp',
        headers: { 'X-Api-Key': 'api-key' },
      },
    ]);
  });

  test('extracts top-level server url', () => {
    const serverConfig = JSON.stringify({
      servers: [
        {
          id: 'srv-2',
          server_name: 'drive-tools',
          url: 'https://mcp.example.com/drive',
        },
      ],
    });

    expect(extractMcpServerTargets({ serverConfig })).toEqual([
      {
        serverId: 'srv-2',
        serverName: 'drive-tools',
        url: 'https://mcp.example.com/drive',
      },
    ]);
  });

  test('ignores stdio and missing url servers', () => {
    const serverConfig = JSON.stringify({
      data: {
        servers: [
          { name: 'stdio', transport: 'stdio', config: { command: 'server' } },
          { name: 'missing-url', transport: 'http_sse', config: {} },
        ],
      },
    });

    expect(extractMcpServerTargets({ serverConfig })).toEqual([]);
  });

  test('handles malformed JSON with useful error', () => {
    expect(() =>
      extractMcpServerTargets({ serverConfig: '{bad json' })
    ).toThrow('Failed to parse MCP server config for OAuth URL extraction');
  });

  test('handles multiple URLs', () => {
    const serverConfig = JSON.stringify({
      data: {
        servers: [
          { config: { url: 'https://mcp.example.com/a' } },
          { config: { url: 'https://mcp.example.com/b' } },
        ],
      },
    });

    expect(extractMcpServerTargets({ serverConfig })).toEqual([
      { url: 'https://mcp.example.com/a' },
      { url: 'https://mcp.example.com/b' },
    ]);
  });
});
