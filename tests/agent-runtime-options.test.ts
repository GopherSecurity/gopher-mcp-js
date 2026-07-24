import { GopherOrchHandle, GopherOrchLibrary } from '../src/ffi/library';

type AgentCreateByUrlMethod = (
  this: unknown,
  provider: string,
  model: string,
  url: string,
  options?: {
    accessToken?: string;
    headers?: Record<string, string>;
  }
) => GopherOrchHandle | null;

function callAgentCreateByUrl(
  fakeLibrary: unknown,
  options?: {
    accessToken?: string;
    headers?: Record<string, string>;
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
      }
    );
  });
});
