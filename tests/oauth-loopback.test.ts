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

  test('rejects wrong state', async () => {
    const server = await createOAuthLoopbackCallbackServer({
      state: 'expected-state',
      timeoutMs: 1000,
    });
    const callback = server.waitForCallback().catch((e: Error) => e);

    const status = await requestUrl(
      `${server.redirectUri}?code=code-123&state=wrong-state`
    );

    expect(status).toBe(200);
    await expect(callback).resolves.toThrow('state mismatch');
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
