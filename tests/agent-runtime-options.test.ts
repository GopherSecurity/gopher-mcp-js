import { GopherOrchHandle, GopherOrchLibrary } from '../src/ffi/library';
import {
  GopherAgentCreateOptions,
  GopherAgentTokenRecord,
  GopherAgentTokenStore,
  normalizeRuntimeOptions,
} from '../src/config';
import { GopherAgentElicitationOptions } from '../src/elicitation';

type AgentCreateByUrlMethod = (
  this: unknown,
  provider: string,
  model: string,
  url: string,
  options?: {
    accessToken?: string;
    headers?: Record<string, string>;
    serverOptions?: Array<{
      serverId?: string;
      serverName?: string;
      url?: string;
      accessToken?: string;
      headers?: Record<string, string>;
    }>;
    elicitation?: GopherAgentElicitationOptions;
  }
) => GopherOrchHandle | null;

function callAgentCreateByUrl(
  fakeLibrary: unknown,
  options?: {
    accessToken?: string;
    headers?: Record<string, string>;
    serverOptions?: Array<{
      serverId?: string;
      serverName?: string;
      url?: string;
      accessToken?: string;
      headers?: Record<string, string>;
    }>;
    elicitation?: GopherAgentElicitationOptions;
  }
): GopherOrchHandle | null {
  const method = GopherOrchLibrary.prototype
    .agentCreateByUrl as AgentCreateByUrlMethod;
  return method.call(
    fakeLibrary,
    'AnthropicProvider',
    'claude-3-haiku-20240307',
    'http://127.0.0.1:8080/mcp',
    options
  );
}

describe('agent runtime options marshalling', () => {
  test('treats an empty access token as absent', () => {
    const handle = {} as GopherOrchHandle;
    const legacyCreate = jest.fn(() => handle);
    const fakeLibrary = {
      available: true,
      _agentCreateByUrl: legacyCreate,
      _agentCreateByUrlWithOptions: null,
    };

    expect(callAgentCreateByUrl(fakeLibrary, { accessToken: '' })).toBe(handle);
    expect(legacyCreate).toHaveBeenCalledTimes(1);
  });

  test('passes non-empty access tokens through the with-options path', () => {
    const handle = {} as GopherOrchHandle;
    const legacyCreate = jest.fn();
    const createWithOptions = jest.fn(() => handle);
    const fakeLibrary = {
      available: true,
      _agentCreateByUrl: legacyCreate,
      _agentCreateByUrlWithOptions: createWithOptions,
    };

    expect(
      callAgentCreateByUrl(fakeLibrary, { accessToken: 'token-123' })
    ).toBe(handle);
    expect(legacyCreate).not.toHaveBeenCalled();
    expect(createWithOptions).toHaveBeenCalledWith(
      'AnthropicProvider',
      'claude-3-haiku-20240307',
      'http://127.0.0.1:8080/mcp',
      {
        access_token: 'token-123',
        headers: null,
        header_count: 0,
        server_options: null,
        server_option_count: 0,
        elicitation_callback: null,
        elicitation_user_data: null,
        elicitation_timeout_ms: BigInt(0),
      }
    );
  });

  test('keeps headers when the access token is empty', () => {
    const handle = {} as GopherOrchHandle;
    const createWithOptions = jest.fn(() => handle);
    const fakeLibrary = {
      available: true,
      _agentCreateByUrl: jest.fn(),
      _agentCreateByUrlWithOptions: createWithOptions,
    };

    expect(
      callAgentCreateByUrl(fakeLibrary, {
        accessToken: '',
        headers: { Authorization: 'Bearer header-token' },
      })
    ).toBe(handle);
    expect(createWithOptions).toHaveBeenCalledWith(
      'AnthropicProvider',
      'claude-3-haiku-20240307',
      'http://127.0.0.1:8080/mcp',
      {
        access_token: null,
        headers: [{ name: 'Authorization', value: 'Bearer header-token' }],
        header_count: 1,
        server_options: null,
        server_option_count: 0,
        elicitation_callback: null,
        elicitation_user_data: null,
        elicitation_timeout_ms: BigInt(0),
      }
    );
  });

  test('passes per-server runtime options through the with-options path', () => {
    const handle = {} as GopherOrchHandle;
    const createWithOptions = jest.fn(() => handle);
    const fakeLibrary = {
      available: true,
      _agentCreateByUrl: jest.fn(),
      _agentCreateByUrlWithOptions: createWithOptions,
    };

    expect(
      callAgentCreateByUrl(fakeLibrary, {
        serverOptions: [
          {
            serverId: 'srv-a',
            serverName: 'server-a',
            url: 'http://127.0.0.1:8080/mcp',
            accessToken: 'server-token',
            headers: { 'X-Server-Tenant': 'tenant-a' },
          },
        ],
      })
    ).toBe(handle);
    expect(createWithOptions).toHaveBeenCalledWith(
      'AnthropicProvider',
      'claude-3-haiku-20240307',
      'http://127.0.0.1:8080/mcp',
      {
        access_token: null,
        headers: null,
        header_count: 0,
        server_options: [
          {
            server_id: 'srv-a',
            server_name: 'server-a',
            url: 'http://127.0.0.1:8080/mcp',
            access_token: 'server-token',
            headers: [{ name: 'X-Server-Tenant', value: 'tenant-a' }],
            header_count: 1,
          },
        ],
        server_option_count: 1,
        elicitation_callback: null,
        elicitation_user_data: null,
        elicitation_timeout_ms: BigInt(0),
      }
    );
  });

  test('elicitation handler requires native callback support', () => {
    const fakeLibrary = {
      available: true,
      _agentCreateByUrl: jest.fn(),
      _agentCreateByUrlWithOptions: jest.fn(),
      ffiTypes: null,
    };

    expect(() =>
      callAgentCreateByUrl(fakeLibrary, {
        elicitation: {
          handler: () => 'accept',
        },
      })
    ).toThrow('does not expose MCP elicitation callback support');
  });

  test('normalizes disabled oauth without changing runtime options', () => {
    const options: GopherAgentCreateOptions = {
      accessToken: 'token-123',
      headers: { 'X-Tenant': 'tenant-a' },
      oauth: { mode: 'disabled' },
    };

    expect(normalizeRuntimeOptions(options)).toEqual({
      accessToken: 'token-123',
      headers: { 'X-Tenant': 'tenant-a' },
    });
  });

  test('empty oauth options do not become runtime options', () => {
    const options: GopherAgentCreateOptions = {
      oauth: {},
    };

    expect(normalizeRuntimeOptions(options)).toBeUndefined();
  });

  test('token store type accepts optional refresh data', async () => {
    const token: GopherAgentTokenRecord = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      expiresAt: Date.now() + 3600_000,
      scope: 'openid email',
    };
    const store: GopherAgentTokenStore = {
      get: jest.fn(async () => token),
      set: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
    };

    await expect(store.get('resource-key')).resolves.toEqual(token);
    await expect(store.set('resource-key', token)).resolves.toBeUndefined();
    await expect(store.delete?.('resource-key')).resolves.toBeUndefined();
  });
});
