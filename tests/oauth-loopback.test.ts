import { createOAuthLoopbackCallbackServer } from '../src/oauthLoopback';
import { get } from 'http';

function requestUrl(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode ?? 0));
    });
    request.on('error', reject);
  });
}

describe('OAuth loopback callback server', () => {
  test('receives code and state', async () => {
    const server = await createOAuthLoopbackCallbackServer({
      state: 'state-123',
      timeoutMs: 1000,
    });
    const callback = server.waitForCallback().catch((e: Error) => e);

    const status = await requestUrl(
      `${server.redirectUri}?code=code-123&state=state-123`
    );

    expect(status).toBe(200);
    await expect(callback).resolves.toEqual({
      code: 'code-123',
      state: 'state-123',
    });
  });

  test('binds configured fixed loopback redirect URI', async () => {
    const firstServer = await createOAuthLoopbackCallbackServer({
      state: 'state-123',
      timeoutMs: 1000,
    });
    const redirectUri = firstServer.redirectUri.replace(
      '/callback',
      '/fixed-callback'
    );
    await firstServer.close();

    const server = await createOAuthLoopbackCallbackServer({
      state: 'state-123',
      redirectUri,
      timeoutMs: 1000,
    });
    const callback = server.waitForCallback();

    expect(server.redirectUri).toBe(redirectUri);
    const status = await requestUrl(
      `${server.redirectUri}?code=code-123&state=state-123`
    );

    expect(status).toBe(200);
    await expect(callback).resolves.toEqual({
      code: 'code-123',
      state: 'state-123',
    });
  });

  test('rejects wrong state without closing callback server', async () => {
    const server = await createOAuthLoopbackCallbackServer({
      state: 'expected-state',
      timeoutMs: 1000,
    });
    const callback = server.waitForCallback();

    const wrongStateStatus = await requestUrl(
      `${server.redirectUri}?code=code-123&state=wrong-state`
    );

    expect(wrongStateStatus).toBe(400);

    const validStatus = await requestUrl(
      `${server.redirectUri}?code=code-123&state=expected-state`
    );

    expect(validStatus).toBe(200);
    await expect(callback).resolves.toEqual({
      code: 'code-123',
      state: 'expected-state',
    });
  });

  test('captures OAuth error and description', async () => {
    const server = await createOAuthLoopbackCallbackServer({
      state: 'state-123',
      timeoutMs: 1000,
    });
    const callback = server.waitForCallback().catch((e: Error) => e);

    const status = await requestUrl(
      `${server.redirectUri}?error=access_denied&error_description=Nope&state=state-123`
    );

    expect(status).toBe(200);
    await expect(callback).resolves.toThrow('access_denied: Nope');
  });

  test('times out', async () => {
    const server = await createOAuthLoopbackCallbackServer({
      state: 'state-123',
      timeoutMs: 10,
    });

    await expect(server.waitForCallback()).rejects.toThrow(
      'OAuth callback timed out'
    );
  });

  test('closes after success', async () => {
    const server = await createOAuthLoopbackCallbackServer({
      state: 'state-123',
      timeoutMs: 1000,
    });
    const callback = server.waitForCallback();

    await requestUrl(`${server.redirectUri}?code=code-123&state=state-123`);
    await callback;

    await expect(requestUrl(server.redirectUri)).rejects.toThrow();
  });
});
