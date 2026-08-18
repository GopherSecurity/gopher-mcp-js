import {
  OAUTH_TEST_ACCESS_TOKEN,
  startCustomOAuthTestIdp,
} from './helpers/customOAuthTestIdp';
import { startCustomProtectedMcpEndpoints } from './helpers/customProtectedMcpEndpoints';

describe('custom protected MCP endpoints', () => {
  test('server and gateway endpoints advertise OAuth protection', async () => {
    const idp = await startCustomOAuthTestIdp();
    const endpoints = await startCustomProtectedMcpEndpoints({
      authorizationServer: idp.issuer,
      accessToken: OAUTH_TEST_ACCESS_TOKEN,
    });

    try {
      for (const endpoint of [endpoints.server, endpoints.gateway]) {
        const response = await postMcp(endpoint.mcpUrl);

        expect(response.status).toBe(401);
        expect(response.headers.get('www-authenticate')).toBe(
          `Bearer realm="mcp", resource_metadata="${endpoint.resourceMetadataUrl}"`
        );
      }
    } finally {
      await endpoints.close();
      await idp.close();
    }
  });

  test('server and gateway metadata points to custom IdP issuer', async () => {
    const idp = await startCustomOAuthTestIdp();
    const endpoints = await startCustomProtectedMcpEndpoints({
      authorizationServer: idp.issuer,
      accessToken: OAUTH_TEST_ACCESS_TOKEN,
    });

    try {
      for (const endpoint of [endpoints.server, endpoints.gateway]) {
        const response = await fetch(endpoint.resourceMetadataUrl);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({
          resource: endpoint.mcpUrl,
          authorization_servers: [idp.issuer],
          scopes_supported: ['openid', 'profile', 'email'],
        });
      }
    } finally {
      await endpoints.close();
      await idp.close();
    }
  });

  test('server and gateway endpoints reject wrong bearer token', async () => {
    const idp = await startCustomOAuthTestIdp();
    const endpoints = await startCustomProtectedMcpEndpoints({
      authorizationServer: idp.issuer,
      accessToken: OAUTH_TEST_ACCESS_TOKEN,
    });

    try {
      for (const endpoint of [endpoints.server, endpoints.gateway]) {
        const response = await postMcp(endpoint.mcpUrl, 'wrong-token');

        expect(response.status).toBe(401);
      }
    } finally {
      await endpoints.close();
      await idp.close();
    }
  });

  test('server and gateway endpoints accept deterministic bearer token', async () => {
    const idp = await startCustomOAuthTestIdp();
    const endpoints = await startCustomProtectedMcpEndpoints({
      authorizationServer: idp.issuer,
      accessToken: OAUTH_TEST_ACCESS_TOKEN,
    });

    try {
      for (const endpoint of [endpoints.server, endpoints.gateway]) {
        const response = await postMcp(
          endpoint.mcpUrl,
          OAUTH_TEST_ACCESS_TOKEN
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({
          jsonrpc: '2.0',
          id: 'custom-protected-mcp-response',
          result: {
            endpoint: endpoint.kind,
            authenticated: true,
          },
        });
      }
    } finally {
      await endpoints.close();
      await idp.close();
    }
  });

  test('close stops both local endpoints', async () => {
    const idp = await startCustomOAuthTestIdp();
    const endpoints = await startCustomProtectedMcpEndpoints({
      authorizationServer: idp.issuer,
      accessToken: OAUTH_TEST_ACCESS_TOKEN,
    });
    await endpoints.close();
    await idp.close();

    await expect(fetch(endpoints.server.resourceMetadataUrl)).rejects.toThrow();
    await expect(fetch(endpoints.gateway.resourceMetadataUrl)).rejects.toThrow();
  });
});

function postMcp(url: string, accessToken?: string): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      ...(accessToken !== undefined
        ? { Authorization: `Bearer ${accessToken}` }
        : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'test-probe',
      method: 'initialize',
      params: {},
    }),
    redirect: 'manual',
  });
}
