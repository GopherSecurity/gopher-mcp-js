import { buildNativeOAuthAuthorizationUrl } from '../src/ffi/auth/oauth-authorization-url';
import { requireNativeSingleOAuthAuthorizationServer } from '../src/ffi/auth/oauth-compatibility';
import {
  createNativeOAuthPkceChallenge,
  generateNativeOAuthPkce,
} from '../src/ffi/auth/oauth-pkce';
import { extractNativeMcpServerTargetUrls } from '../src/ffi/auth/oauth-server-targets';

describe('native OAuth protocol wrappers', () => {
  test('maps native PKCE generation outputs', () => {
    const fns = {
      mcpOAuthPkceGenerate: jest.fn(
        (verifierOut: (string | null)[], challengeOut: (string | null)[]) => {
          verifierOut[0] = 'verifier';
          challengeOut[0] = 'challenge';
          return 0;
        }
      ),
    };

    expect(generateNativeOAuthPkce(fns as never)).toEqual({
      codeVerifier: 'verifier',
      codeChallenge: 'challenge',
    });
  });

  test('maps native PKCE challenge output', () => {
    const fns = {
      mcpOAuthPkceChallenge: jest.fn(
        (verifier: string, challengeOut: (string | null)[]) => {
          expect(verifier).toBe('verifier');
          challengeOut[0] = 'challenge';
          return 0;
        }
      ),
    };

    expect(createNativeOAuthPkceChallenge('verifier', fns as never)).toBe(
      'challenge'
    );
  });

  test('maps native authorization URL output', () => {
    const fns = {
      mcpOAuthBuildAuthorizationUrl: jest.fn(
        (
          authorizationEndpoint: string,
          clientId: string,
          redirectUri: string,
          state: string,
          codeChallenge: string,
          scope: string | null,
          resource: string | null,
          urlOut: (string | null)[]
        ) => {
          expect(authorizationEndpoint).toBe('https://auth.example.com/auth');
          expect(clientId).toBe('client');
          expect(redirectUri).toBe('http://127.0.0.1/callback');
          expect(state).toBe('state');
          expect(codeChallenge).toBe('challenge');
          expect(scope).toBe('openid email');
          expect(resource).toBe('https://mcp.example.com');
          urlOut[0] = 'https://auth.example.com/auth?response_type=code';
          return 0;
        }
      ),
    };

    expect(
      buildNativeOAuthAuthorizationUrl(
        {
          authorizationEndpoint: 'https://auth.example.com/auth',
          clientId: 'client',
          redirectUri: 'http://127.0.0.1/callback',
          state: 'state',
          codeChallenge: 'challenge',
          scope: 'openid email',
          resource: 'https://mcp.example.com',
        },
        fns as never
      )
    ).toBe('https://auth.example.com/auth?response_type=code');
  });

  test('maps native compatibility output and errors', () => {
    const fns = {
      mcpOAuthRequireSingleAuthorizationServer: jest.fn(
        (
          servers: string[],
          count: number,
          hasPerServerCredentials: boolean,
          authorizationServerOut: (string | null)[],
          errorOut: (string | null)[]
        ) => {
          expect(servers).toEqual(['https://auth.example.com']);
          expect(count).toBe(1);
          expect(hasPerServerCredentials).toBe(false);
          authorizationServerOut[0] = 'https://auth.example.com';
          errorOut[0] = null;
          return 0;
        }
      ),
    };

    expect(
      requireNativeSingleOAuthAuthorizationServer(
        ['https://auth.example.com'],
        false,
        fns as never
      )
    ).toEqual({ authorizationServer: 'https://auth.example.com' });

    fns.mcpOAuthRequireSingleAuthorizationServer.mockImplementationOnce(
      (
        _servers,
        _count,
        _hasPerServerCredentials,
        _authorizationServerOut,
        errorOut
      ) => {
        errorOut[0] = 'multiple authorization servers';
        return 1;
      }
    );

    expect(() =>
      requireNativeSingleOAuthAuthorizationServer(
        ['https://auth-a.example.com', 'https://auth-b.example.com'],
        false,
        fns as never
      )
    ).toThrow('multiple authorization servers');
  });

  test('maps native server target JSON output and errors', () => {
    const fns = {
      mcpOAuthExtractServerTargets: jest.fn(
        (
          serverConfig: string,
          targetsJsonOut: (string | null)[],
          errorOut: (string | null)[]
        ) => {
          expect(serverConfig).toBe('{"servers":[]}');
          targetsJsonOut[0] =
            '["https://mcp.example.com/a","https://mcp.example.com/b"]';
          errorOut[0] = null;
          return 0;
        }
      ),
    };

    expect(
      extractNativeMcpServerTargetUrls('{"servers":[]}', fns as never)
    ).toEqual(['https://mcp.example.com/a', 'https://mcp.example.com/b']);

    fns.mcpOAuthExtractServerTargets.mockImplementationOnce(
      (_serverConfig, targetsJsonOut, errorOut) => {
        targetsJsonOut[0] = null;
        errorOut[0] = 'invalid config';
        return 1;
      }
    );

    expect(() =>
      extractNativeMcpServerTargetUrls('{bad json', fns as never)
    ).toThrow('invalid config');
  });
});
