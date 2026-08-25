import { extractMcpServerTargets } from '../src/oauthServerTargets';
import { extractNativeMcpServerTargetUrls } from '../src/ffi/auth/oauth-server-targets';

jest.mock('../src/ffi/auth/oauth-server-targets', () => ({
  extractNativeMcpServerTargetUrls: jest.fn(),
}));

const mockedExtractNativeMcpServerTargetUrls =
  extractNativeMcpServerTargetUrls as jest.MockedFunction<
    typeof extractNativeMcpServerTargetUrls
  >;

describe('extractMcpServerTargets', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('extracts direct url', () => {
    expect(
      extractMcpServerTargets({ url: 'http://127.0.0.1:3001/mcp' })
    ).toEqual([{ url: 'http://127.0.0.1:3001/mcp' }]);
    expect(mockedExtractNativeMcpServerTargetUrls).not.toHaveBeenCalled();
  });

  test('extracts native config urls', () => {
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
    mockedExtractNativeMcpServerTargetUrls.mockReturnValue([
      'https://mcp.example.com/mail',
    ]);

    expect(extractMcpServerTargets({ serverConfig })).toEqual([
      { url: 'https://mcp.example.com/mail' },
    ]);
    expect(mockedExtractNativeMcpServerTargetUrls).toHaveBeenCalledWith(
      serverConfig
    );
  });

  test('extracts direct and native config urls together', () => {
    const serverConfig = JSON.stringify({
      servers: [
        {
          id: 'srv-2',
          server_name: 'drive-tools',
          url: 'https://mcp.example.com/drive',
        },
      ],
    });
    mockedExtractNativeMcpServerTargetUrls.mockReturnValue([
      'https://mcp.example.com/drive',
    ]);

    expect(
      extractMcpServerTargets({
        url: 'https://mcp.example.com/direct',
        serverConfig,
      })
    ).toEqual([
      { url: 'https://mcp.example.com/direct' },
      { url: 'https://mcp.example.com/drive' },
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
    mockedExtractNativeMcpServerTargetUrls.mockReturnValue([]);

    expect(extractMcpServerTargets({ serverConfig })).toEqual([]);
  });

  test('handles malformed JSON with useful error', () => {
    mockedExtractNativeMcpServerTargetUrls.mockImplementation(() => {
      throw new Error(
        'oauth_metadata_fetch_failed: Invalid MCP server config JSON'
      );
    });

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
    mockedExtractNativeMcpServerTargetUrls.mockReturnValue([
      'https://mcp.example.com/a',
      'https://mcp.example.com/b',
    ]);

    expect(extractMcpServerTargets({ serverConfig })).toEqual([
      { url: 'https://mcp.example.com/a' },
      { url: 'https://mcp.example.com/b' },
    ]);
  });
});
