import { buildOAuthAuthorizationUrl } from '../src/oauthAuthorizationUrl';
import {
  OAuthAuthorizationServerMetadata,
  OAuthProtectedResourceMetadata,
} from '../src/oauthDiscovery';
import { buildNativeOAuthAuthorizationUrl } from '../src/ffi/auth/oauth-authorization-url';

jest.mock('../src/ffi/auth/oauth-authorization-url', () => ({
  buildNativeOAuthAuthorizationUrl: jest.fn(
    (input: {
      authorizationEndpoint: string;
      clientId: string;
      redirectUri: string;
      state: string;
      codeChallenge: string;
      scope?: string;
      resource?: string;
    }) => {
      const url = new URL(input.authorizationEndpoint);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', input.clientId);
      url.searchParams.set('redirect_uri', input.redirectUri);
      url.searchParams.set('state', input.state);
      url.searchParams.set('code_challenge', input.codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
      if (input.scope !== undefined) {
        url.searchParams.set('scope', input.scope);
      }
      if (input.resource !== undefined) {
        url.searchParams.set('resource', input.resource);
      }
      return url.toString();
    }
  ),
}));

const mockedBuildNativeOAuthAuthorizationUrl =
  buildNativeOAuthAuthorizationUrl as jest.MockedFunction<
    typeof buildNativeOAuthAuthorizationUrl
  >;

const metadata: OAuthAuthorizationServerMetadata = {
  issuer: 'https://auth.example.com',
  authorizationEndpoint: 'https://auth.example.com/authorize?prompt=consent',
  tokenEndpoint: 'https://auth.example.com/token',
  scopesSupported: ['openid', 'profile'],
  rawJson: '{}',
};

function params(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe('buildOAuthAuthorizationUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('includes all required params', () => {
    const search = params(
      buildOAuthAuthorizationUrl({
        metadata,
        clientId: 'client-123',
        redirectUri: 'http://127.0.0.1:49152/callback',
        state: 'state-123',
        codeChallenge: 'challenge-123',
      })
    );

    expect(search.get('response_type')).toBe('code');
    expect(search.get('client_id')).toBe('client-123');
    expect(search.get('redirect_uri')).toBe('http://127.0.0.1:49152/callback');
    expect(search.get('state')).toBe('state-123');
    expect(search.get('code_challenge')).toBe('challenge-123');
    expect(search.get('code_challenge_method')).toBe('S256');
    expect(mockedBuildNativeOAuthAuthorizationUrl).toHaveBeenCalledWith({
      authorizationEndpoint:
        'https://auth.example.com/authorize?prompt=consent',
      clientId: 'client-123',
      redirectUri: 'http://127.0.0.1:49152/callback',
      state: 'state-123',
      codeChallenge: 'challenge-123',
      scope: 'openid profile',
    });
  });

  test('scope defaults from options first', () => {
    const search = params(
      buildOAuthAuthorizationUrl({
        metadata,
        clientId: 'client-123',
        redirectUri: 'http://127.0.0.1:49152/callback',
        state: 'state-123',
        codeChallenge: 'challenge-123',
        scopes: ['email'],
      })
    );

    expect(search.get('scope')).toBe('email');
    expect(mockedBuildNativeOAuthAuthorizationUrl).toHaveBeenLastCalledWith({
      authorizationEndpoint:
        'https://auth.example.com/authorize?prompt=consent',
      clientId: 'client-123',
      redirectUri: 'http://127.0.0.1:49152/callback',
      state: 'state-123',
      codeChallenge: 'challenge-123',
      scope: 'email',
    });
  });

  test('scope defaults from resource metadata before server metadata', () => {
    const resourceMetadata: OAuthProtectedResourceMetadata = {
      resource: 'https://mcp.example.com/mcp',
      authorizationServers: ['https://auth.example.com'],
      scopesSupported: ['mcp:read'],
      rawJson: '{}',
    };

    const search = params(
      buildOAuthAuthorizationUrl({
        metadata,
        clientId: 'client-123',
        redirectUri: 'http://127.0.0.1:49152/callback',
        state: 'state-123',
        codeChallenge: 'challenge-123',
        resourceMetadata,
      })
    );

    expect(search.get('scope')).toBe('mcp:read');
    expect(mockedBuildNativeOAuthAuthorizationUrl).toHaveBeenLastCalledWith({
      authorizationEndpoint:
        'https://auth.example.com/authorize?prompt=consent',
      clientId: 'client-123',
      redirectUri: 'http://127.0.0.1:49152/callback',
      state: 'state-123',
      codeChallenge: 'challenge-123',
      scope: 'mcp:read',
      resource: 'https://mcp.example.com/mcp',
    });
  });

  test('omits scope when only authorization server scopes are known', () => {
    const search = params(
      buildOAuthAuthorizationUrl({
        metadata,
        clientId: 'client-123',
        redirectUri: 'http://127.0.0.1:49152/callback',
        state: 'state-123',
        codeChallenge: 'challenge-123',
        resourceMetadata: {
          resource: 'https://mcp.example.com/mcp',
          authorizationServers: ['https://auth.example.com'],
          scopesSupported: [],
          rawJson: '{}',
        },
      })
    );

    expect(search.get('scope')).toBeNull();
  });

  test('includes resource parameter when provided', () => {
    const search = params(
      buildOAuthAuthorizationUrl({
        metadata,
        clientId: 'client-123',
        redirectUri: 'http://127.0.0.1:49152/callback',
        state: 'state-123',
        codeChallenge: 'challenge-123',
        resourceMetadata: {
          resource: 'https://mcp.example.com/mcp',
          authorizationServers: ['https://auth.example.com'],
          scopesSupported: [],
          rawJson: '{}',
        },
      })
    );

    expect(search.get('resource')).toBe('https://mcp.example.com/mcp');
  });

  test('preserves existing query params on authorization endpoint', () => {
    const search = params(
      buildOAuthAuthorizationUrl({
        metadata,
        clientId: 'client-123',
        redirectUri: 'http://127.0.0.1:49152/callback',
        state: 'state-123',
        codeChallenge: 'challenge-123',
      })
    );

    expect(search.get('prompt')).toBe('consent');
  });
});
