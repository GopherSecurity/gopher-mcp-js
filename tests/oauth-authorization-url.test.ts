import { buildOAuthAuthorizationUrl } from '../src/oauthAuthorizationUrl';
import {
  OAuthAuthorizationServerMetadata,
  OAuthProtectedResourceMetadata,
} from '../src/oauthDiscovery';

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
