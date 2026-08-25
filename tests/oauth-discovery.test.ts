import {
  fetchOAuthAuthorizationServerMetadata,
  fetchOAuthProtectedResourceMetadata,
  probeMcpOAuthChallenge,
} from '../src/oauthDiscovery';
import {
  fetchNativeOAuthAuthorizationServerMetadata,
  fetchNativeOAuthProtectedResourceMetadata,
  probeNativeMcpOAuthChallenge,
} from '../src/ffi/auth/oauth-discovery';

jest.mock('../src/ffi/auth/oauth-discovery', () => ({
  fetchNativeOAuthAuthorizationServerMetadata: jest.fn(),
  fetchNativeOAuthProtectedResourceMetadata: jest.fn(),
  probeNativeMcpOAuthChallenge: jest.fn(),
}));

const probeNativeMock = jest.mocked(probeNativeMcpOAuthChallenge);
const fetchResourceMock = jest.mocked(
  fetchNativeOAuthProtectedResourceMetadata
);
const fetchServerMock = jest.mocked(
  fetchNativeOAuthAuthorizationServerMetadata
);

describe('MCP OAuth challenge discovery', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('maps native no-OAuth response', async () => {
    probeNativeMock.mockReturnValue({
      requiresOAuth: false,
      httpStatus: 200,
      wwwAuthenticate: '',
      resourceMetadataUrl: '',
      error: '',
    });

    await expect(
      probeMcpOAuthChallenge('https://mcp.example.com/mcp')
    ).resolves.toEqual({
      url: 'https://mcp.example.com/mcp',
      requiresOAuth: false,
      httpStatus: 200,
    });
  });

  test('maps native OAuth challenge with resource metadata', async () => {
    probeNativeMock.mockReturnValue({
      requiresOAuth: true,
      httpStatus: 401,
      wwwAuthenticate:
        'Bearer realm="mcp", resource_metadata="https://mcp.example.com/resource"',
      resourceMetadataUrl: 'https://mcp.example.com/resource',
      error: '',
    });

    await expect(
      probeMcpOAuthChallenge('https://mcp.example.com/mcp')
    ).resolves.toEqual({
      url: 'https://mcp.example.com/mcp',
      requiresOAuth: true,
      httpStatus: 401,
      wwwAuthenticate:
        'Bearer realm="mcp", resource_metadata="https://mcp.example.com/resource"',
      resourceMetadataUrl: 'https://mcp.example.com/resource',
    });
  });

  test('preserves oauth_metadata_missing challenge failures', async () => {
    probeNativeMock.mockReturnValue({
      requiresOAuth: true,
      httpStatus: 401,
      wwwAuthenticate: 'Bearer realm="mcp"',
      resourceMetadataUrl: '',
      error: 'MCP OAuth challenge is missing resource_metadata',
    });

    await expect(
      probeMcpOAuthChallenge('https://mcp.example.com/mcp')
    ).rejects.toThrow('oauth_metadata_missing');
  });
});

describe('OAuth protected resource metadata discovery', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('maps native protected resource metadata', async () => {
    fetchResourceMock.mockReturnValue({
      resource: 'https://mcp.example.com/mcp',
      authorizationServers: ['https://auth.example.com'],
      scopesSupported: ['openid', 'email'],
      rawJson:
        '{"resource":"https://mcp.example.com/mcp","authorization_servers":["https://auth.example.com"],"scopes_supported":["openid","email"]}',
      error: '',
    });

    await expect(
      fetchOAuthProtectedResourceMetadata(
        'https://mcp.example.com/.well-known/oauth-protected-resource/mcp'
      )
    ).resolves.toEqual({
      resource: 'https://mcp.example.com/mcp',
      authorizationServers: ['https://auth.example.com'],
      scopesSupported: ['openid', 'email'],
      rawJson:
        '{"resource":"https://mcp.example.com/mcp","authorization_servers":["https://auth.example.com"],"scopes_supported":["openid","email"]}',
    });
  });

  test('preserves native protected resource metadata failures', async () => {
    fetchResourceMock.mockReturnValue({
      resource: '',
      authorizationServers: [],
      scopesSupported: [],
      rawJson: '',
      error: 'Protected resource metadata is missing authorization_servers',
    });

    await expect(
      fetchOAuthProtectedResourceMetadata('https://mcp.example.com/resource')
    ).rejects.toThrow('authorization_servers');
  });
});

describe('OAuth authorization server metadata discovery', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('maps native authorization server metadata', async () => {
    fetchServerMock.mockReturnValue({
      issuer: 'https://auth.example.com',
      authorizationEndpoint: 'https://auth.example.com/authorize',
      tokenEndpoint: 'https://auth.example.com/token',
      registrationEndpoint: 'https://auth.example.com/register',
      scopesSupported: ['openid', 'email'],
      responseTypesSupported: ['code'],
      grantTypesSupported: ['authorization_code', 'refresh_token'],
      rawJson:
        '{"issuer":"https://auth.example.com","authorization_endpoint":"https://auth.example.com/authorize","token_endpoint":"https://auth.example.com/token","registration_endpoint":"https://auth.example.com/register","scopes_supported":["openid","email"]}',
      error: '',
    });

    await expect(
      fetchOAuthAuthorizationServerMetadata('https://auth.example.com')
    ).resolves.toEqual({
      issuer: 'https://auth.example.com',
      authorizationEndpoint: 'https://auth.example.com/authorize',
      tokenEndpoint: 'https://auth.example.com/token',
      registrationEndpoint: 'https://auth.example.com/register',
      scopesSupported: ['openid', 'email'],
      rawJson:
        '{"issuer":"https://auth.example.com","authorization_endpoint":"https://auth.example.com/authorize","token_endpoint":"https://auth.example.com/token","registration_endpoint":"https://auth.example.com/register","scopes_supported":["openid","email"]}',
    });
  });

  test('omits empty native registration endpoint', async () => {
    fetchServerMock.mockReturnValue({
      issuer: 'https://auth.example.com',
      authorizationEndpoint: 'https://auth.example.com/authorize',
      tokenEndpoint: 'https://auth.example.com/token',
      registrationEndpoint: '',
      scopesSupported: [],
      responseTypesSupported: [],
      grantTypesSupported: [],
      rawJson: '{}',
      error: '',
    });

    await expect(
      fetchOAuthAuthorizationServerMetadata('https://auth.example.com')
    ).resolves.toEqual({
      issuer: 'https://auth.example.com',
      authorizationEndpoint: 'https://auth.example.com/authorize',
      tokenEndpoint: 'https://auth.example.com/token',
      scopesSupported: [],
      rawJson: '{}',
    });
  });

  test('preserves native authorization server metadata failures', async () => {
    fetchServerMock.mockReturnValue({
      issuer: '',
      authorizationEndpoint: '',
      tokenEndpoint: '',
      registrationEndpoint: '',
      scopesSupported: [],
      responseTypesSupported: [],
      grantTypesSupported: [],
      rawJson: '',
      error: 'Authorization server metadata is missing token_endpoint',
    });

    await expect(
      fetchOAuthAuthorizationServerMetadata('https://auth.example.com')
    ).rejects.toThrow('token_endpoint');
  });
});
