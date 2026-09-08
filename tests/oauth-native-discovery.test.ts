import {
  fetchNativeOAuthAuthorizationServerMetadataAsync,
  fetchNativeOAuthProtectedResourceMetadataAsync,
  fetchNativeOAuthAuthorizationServerMetadata,
  fetchNativeOAuthProtectedResourceMetadata,
  probeNativeMcpOAuthChallenge,
  probeNativeMcpOAuthChallengeAsync,
} from '../src/ffi/auth/oauth-discovery';
import { getRawFunctions } from '../src/ffi/auth/loader';

type NativeFns = ReturnType<typeof getRawFunctions>;

describe('native MCP OAuth discovery wrappers', () => {
  test('maps challenge accessors and destroys the native handle', () => {
    const handle = { kind: 'challenge' };
    const destroy = jest.fn(() => 0);
    const fns = {
      mcpOAuthProbeChallenge: jest.fn(
        (_url: string, _timeout: number, out: unknown[]) => {
          out[0] = handle;
          return 0;
        }
      ),
      mcpOAuthChallengeDestroy: destroy,
      mcpOAuthChallengeRequiresOAuth: jest.fn(
        (_handle: unknown, out: boolean[]) => {
          out[0] = true;
          return 0;
        }
      ),
      mcpOAuthChallengeGetHttpStatus: jest.fn(
        (_handle: unknown, out: number[]) => {
          out[0] = 401;
          return 0;
        }
      ),
      mcpOAuthChallengeGetWwwAuthenticate: stringGetter(
        'Bearer resource_metadata="https://mcp.example/.well-known/oauth-protected-resource"'
      ),
      mcpOAuthChallengeGetResourceMetadataUrl: stringGetter(
        'https://mcp.example/.well-known/oauth-protected-resource'
      ),
      mcpOAuthChallengeGetError: stringGetter(''),
    } as unknown as NativeFns;

    expect(probeNativeMcpOAuthChallenge('https://mcp.example', 7, fns)).toEqual(
      {
        requiresOAuth: true,
        httpStatus: 401,
        wwwAuthenticate:
          'Bearer resource_metadata="https://mcp.example/.well-known/oauth-protected-resource"',
        resourceMetadataUrl:
          'https://mcp.example/.well-known/oauth-protected-resource',
        error: '',
      }
    );
    expect(destroy).toHaveBeenCalledWith(handle);
  });

  test('maps challenge accessors through the native async call', async () => {
    const handle = { kind: 'challenge' };
    const destroy = jest.fn(() => 0);
    const probe = nativeAsyncFunction(
      (_url: string, _timeout: number, out: unknown[]) => {
        out[0] = handle;
        return 0;
      }
    );
    const fns = {
      mcpOAuthProbeChallenge: probe,
      mcpOAuthChallengeDestroy: destroy,
      mcpOAuthChallengeRequiresOAuth: jest.fn(
        (_handle: unknown, out: boolean[]) => {
          out[0] = true;
          return 0;
        }
      ),
      mcpOAuthChallengeGetHttpStatus: jest.fn(
        (_handle: unknown, out: number[]) => {
          out[0] = 401;
          return 0;
        }
      ),
      mcpOAuthChallengeGetWwwAuthenticate: stringGetter(
        'Bearer resource_metadata="https://mcp.example/.well-known/oauth-protected-resource"'
      ),
      mcpOAuthChallengeGetResourceMetadataUrl: stringGetter(
        'https://mcp.example/.well-known/oauth-protected-resource'
      ),
      mcpOAuthChallengeGetError: stringGetter(''),
    } as unknown as NativeFns;

    await expect(
      probeNativeMcpOAuthChallengeAsync('https://mcp.example', 7, fns)
    ).resolves.toEqual({
      requiresOAuth: true,
      httpStatus: 401,
      wwwAuthenticate:
        'Bearer resource_metadata="https://mcp.example/.well-known/oauth-protected-resource"',
      resourceMetadataUrl:
        'https://mcp.example/.well-known/oauth-protected-resource',
      error: '',
    });
    expect(probe).not.toHaveBeenCalled();
    expect(probe.async).toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledWith(handle);
  });

  test('maps protected resource metadata arrays and destroys the native handle', () => {
    const handle = { kind: 'resource' };
    const destroy = jest.fn(() => 0);
    const fns = {
      mcpOAuthFetchResourceMetadata: jest.fn(
        (_url: string, _timeout: number, out: unknown[]) => {
          out[0] = handle;
          return 0;
        }
      ),
      mcpOAuthResourceMetadataDestroy: destroy,
      mcpOAuthResourceMetadataGetResource: stringGetter('https://mcp.example'),
      mcpOAuthResourceMetadataGetAuthorizationServerCount: countGetter(2),
      mcpOAuthResourceMetadataGetAuthorizationServer: indexedStringGetter([
        'https://idp-a.example',
        'https://idp-b.example',
      ]),
      mcpOAuthResourceMetadataGetScopeCount: countGetter(1),
      mcpOAuthResourceMetadataGetScope: indexedStringGetter(['gmail.readonly']),
      mcpOAuthResourceMetadataGetRawJson: stringGetter('{"resource":"x"}'),
      mcpOAuthResourceMetadataGetError: stringGetter(''),
    } as unknown as NativeFns;

    expect(
      fetchNativeOAuthProtectedResourceMetadata(
        'https://mcp.example/.well-known/oauth-protected-resource',
        5,
        fns
      )
    ).toEqual({
      resource: 'https://mcp.example',
      authorizationServers: ['https://idp-a.example', 'https://idp-b.example'],
      scopesSupported: ['gmail.readonly'],
      rawJson: '{"resource":"x"}',
      error: '',
    });
    expect(destroy).toHaveBeenCalledWith(handle);
  });

  test('maps protected resource metadata through the native async call', async () => {
    const handle = { kind: 'resource' };
    const destroy = jest.fn(() => 0);
    const fetchMetadata = nativeAsyncFunction(
      (_url: string, _timeout: number, out: unknown[]) => {
        out[0] = handle;
        return 0;
      }
    );
    const fns = {
      mcpOAuthFetchResourceMetadata: fetchMetadata,
      mcpOAuthResourceMetadataDestroy: destroy,
      mcpOAuthResourceMetadataGetResource: stringGetter('https://mcp.example'),
      mcpOAuthResourceMetadataGetAuthorizationServerCount: countGetter(1),
      mcpOAuthResourceMetadataGetAuthorizationServer: indexedStringGetter([
        'https://idp.example',
      ]),
      mcpOAuthResourceMetadataGetScopeCount: countGetter(1),
      mcpOAuthResourceMetadataGetScope: indexedStringGetter(['gmail.readonly']),
      mcpOAuthResourceMetadataGetRawJson: stringGetter('{"resource":"x"}'),
      mcpOAuthResourceMetadataGetError: stringGetter(''),
    } as unknown as NativeFns;

    await expect(
      fetchNativeOAuthProtectedResourceMetadataAsync(
        'https://mcp.example/.well-known/oauth-protected-resource',
        5,
        fns
      )
    ).resolves.toEqual({
      resource: 'https://mcp.example',
      authorizationServers: ['https://idp.example'],
      scopesSupported: ['gmail.readonly'],
      rawJson: '{"resource":"x"}',
      error: '',
    });
    expect(fetchMetadata).not.toHaveBeenCalled();
    expect(fetchMetadata.async).toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledWith(handle);
  });

  test('maps authorization server metadata arrays and destroys the native handle', () => {
    const handle = { kind: 'server' };
    const destroy = jest.fn(() => 0);
    const fns = {
      mcpOAuthFetchServerMetadata: jest.fn(
        (_url: string, _timeout: number, out: unknown[]) => {
          out[0] = handle;
          return 0;
        }
      ),
      mcpOAuthServerMetadataDestroy: destroy,
      mcpOAuthServerMetadataGetIssuer: stringGetter('https://idp.example'),
      mcpOAuthServerMetadataGetAuthorizationEndpoint: stringGetter(
        'https://idp.example/authorize'
      ),
      mcpOAuthServerMetadataGetTokenEndpoint: stringGetter(
        'https://idp.example/token'
      ),
      mcpOAuthServerMetadataGetRegistrationEndpoint: stringGetter(
        'https://idp.example/register'
      ),
      mcpOAuthServerMetadataGetScopeCount: countGetter(1),
      mcpOAuthServerMetadataGetScope: indexedStringGetter(['openid']),
      mcpOAuthServerMetadataGetResponseTypeCount: countGetter(1),
      mcpOAuthServerMetadataGetResponseType: indexedStringGetter(['code']),
      mcpOAuthServerMetadataGetGrantTypeCount: countGetter(2),
      mcpOAuthServerMetadataGetGrantType: indexedStringGetter([
        'authorization_code',
        'refresh_token',
      ]),
      mcpOAuthServerMetadataGetRawJson: stringGetter('{"issuer":"x"}'),
      mcpOAuthServerMetadataGetError: stringGetter(''),
    } as unknown as NativeFns;

    expect(
      fetchNativeOAuthAuthorizationServerMetadata('https://idp.example', 5, fns)
    ).toEqual({
      issuer: 'https://idp.example',
      authorizationEndpoint: 'https://idp.example/authorize',
      tokenEndpoint: 'https://idp.example/token',
      registrationEndpoint: 'https://idp.example/register',
      scopesSupported: ['openid'],
      responseTypesSupported: ['code'],
      grantTypesSupported: ['authorization_code', 'refresh_token'],
      rawJson: '{"issuer":"x"}',
      error: '',
    });
    expect(destroy).toHaveBeenCalledWith(handle);
  });

  test('maps authorization server metadata through the native async call', async () => {
    const handle = { kind: 'server' };
    const destroy = jest.fn(() => 0);
    const fetchMetadata = nativeAsyncFunction(
      (_url: string, _timeout: number, out: unknown[]) => {
        out[0] = handle;
        return 0;
      }
    );
    const fns = {
      mcpOAuthFetchServerMetadata: fetchMetadata,
      mcpOAuthServerMetadataDestroy: destroy,
      mcpOAuthServerMetadataGetIssuer: stringGetter('https://idp.example'),
      mcpOAuthServerMetadataGetAuthorizationEndpoint: stringGetter(
        'https://idp.example/authorize'
      ),
      mcpOAuthServerMetadataGetTokenEndpoint: stringGetter(
        'https://idp.example/token'
      ),
      mcpOAuthServerMetadataGetRegistrationEndpoint: stringGetter(
        'https://idp.example/register'
      ),
      mcpOAuthServerMetadataGetScopeCount: countGetter(1),
      mcpOAuthServerMetadataGetScope: indexedStringGetter(['openid']),
      mcpOAuthServerMetadataGetResponseTypeCount: countGetter(1),
      mcpOAuthServerMetadataGetResponseType: indexedStringGetter(['code']),
      mcpOAuthServerMetadataGetGrantTypeCount: countGetter(1),
      mcpOAuthServerMetadataGetGrantType: indexedStringGetter([
        'authorization_code',
      ]),
      mcpOAuthServerMetadataGetRawJson: stringGetter('{"issuer":"x"}'),
      mcpOAuthServerMetadataGetError: stringGetter(''),
    } as unknown as NativeFns;

    await expect(
      fetchNativeOAuthAuthorizationServerMetadataAsync(
        'https://idp.example',
        5,
        fns
      )
    ).resolves.toEqual({
      issuer: 'https://idp.example',
      authorizationEndpoint: 'https://idp.example/authorize',
      tokenEndpoint: 'https://idp.example/token',
      registrationEndpoint: 'https://idp.example/register',
      scopesSupported: ['openid'],
      responseTypesSupported: ['code'],
      grantTypesSupported: ['authorization_code'],
      rawJson: '{"issuer":"x"}',
      error: '',
    });
    expect(fetchMetadata).not.toHaveBeenCalled();
    expect(fetchMetadata.async).toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledWith(handle);
  });

  test('destroys the native handle when an accessor fails', () => {
    const handle = { kind: 'resource' };
    const destroy = jest.fn(() => 0);
    const fns = {
      mcpOAuthFetchResourceMetadata: jest.fn(
        (_url: string, _timeout: number, out: unknown[]) => {
          out[0] = handle;
          return 0;
        }
      ),
      mcpOAuthResourceMetadataDestroy: destroy,
      mcpOAuthResourceMetadataGetResource: () => -1011,
    } as unknown as NativeFns;

    expect(() =>
      fetchNativeOAuthProtectedResourceMetadata(
        'https://metadata.example',
        5,
        fns
      )
    ).toThrow(/native string read failed/);
    expect(destroy).toHaveBeenCalledWith(handle);
  });
});

function stringGetter(value: string) {
  return (_handle: unknown, out: Array<string | null>) => {
    out[0] = value;
    return 0;
  };
}

function countGetter(value: number) {
  return (_handle: unknown, out: Array<number | bigint>) => {
    out[0] = value;
    return 0;
  };
}

function indexedStringGetter(values: string[]) {
  return (_handle: unknown, index: number, out: Array<string | null>) => {
    out[0] = values[index] ?? null;
    return 0;
  };
}

function nativeAsyncFunction(
  implementation: (...args: any[]) => number
): jest.Mock & { async: jest.Mock } {
  const syncFn = jest.fn() as jest.Mock & { async: jest.Mock };
  syncFn.async = jest.fn((...args: unknown[]) => {
    const callback = args.pop() as (error: unknown, result: number) => void;
    try {
      callback(null, implementation(...args));
    } catch (error) {
      callback(error, 0);
    }
  });
  return syncFn;
}
