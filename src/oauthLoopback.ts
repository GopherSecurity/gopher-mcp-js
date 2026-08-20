import { createServer, Server, ServerResponse } from 'http';

export interface OAuthLoopbackCallbackResult {
  code: string;
  state: string;
}

export interface OAuthLoopbackCallbackServer {
  redirectUri: string;
  waitForCallback(): Promise<OAuthLoopbackCallbackResult>;
  close(): Promise<void>;
}

export interface OAuthLoopbackCallbackOptions {
  state: string;
  path?: string;
  timeoutMs?: number;
}

export async function createOAuthLoopbackCallbackServer(
  options: OAuthLoopbackCallbackOptions
): Promise<OAuthLoopbackCallbackServer> {
  const callbackPath = options.path ?? '/callback';
  const timeoutMs = options.timeoutMs ?? 120_000;
  let settled = false;

  let resolveCallback: (result: OAuthLoopbackCallbackResult) => void;
  let rejectCallback: (error: Error) => void;
  const callbackPromise = new Promise<OAuthLoopbackCallbackResult>(
    (resolve, reject) => {
      resolveCallback = resolve;
      rejectCallback = reject;
    }
  );

  const server = createServer((request, response) => {
    if (request.url === undefined) {
      respond(response, 400, 'OAuth callback request is missing URL.');
      return;
    }

    const requestUrl = new URL(request.url, 'http://127.0.0.1');
    if (requestUrl.pathname !== callbackPath) {
      respond(response, 404, 'OAuth callback path was not found.');
      return;
    }

    const state = requestUrl.searchParams.get('state');
    if (state !== options.state) {
      respond(response, 400, 'OAuth callback state mismatch.');
      return;
    }

    const error = requestUrl.searchParams.get('error');
    if (error !== null) {
      const description = requestUrl.searchParams.get('error_description');
      const detail = description ? `${error}: ${description}` : error;
      fail(
        server,
        response,
        `OAuth callback returned error: ${detail}`,
        rejectCallback
      );
      return;
    }

    const code = requestUrl.searchParams.get('code');
    if (code === null || code.length === 0) {
      fail(server, response, 'OAuth callback is missing code.', rejectCallback);
      return;
    }

    settle(server, response, () => resolveCallback({ code, state }));
  });

  const timer = setTimeout(() => {
    if (settled) {
      return;
    }
    settled = true;
    void closeServer(server);
    rejectCallback(new Error('OAuth callback timed out.'));
  }, timeoutMs);

  try {
    await listen(server);
  } catch (e) {
    settled = true;
    clearTimeout(timer);
    throw e;
  }

  return {
    redirectUri: `http://127.0.0.1:${addressPort(server)}${callbackPath}`,
    waitForCallback: () => callbackPromise.finally(() => clearTimeout(timer)),
    close: async () => {
      settled = true;
      clearTimeout(timer);
      await closeServer(server);
    },
  };

  function settle(
    activeServer: Server,
    response: ServerResponse,
    complete: () => void
  ): void {
    if (settled) {
      respond(response, 409, 'OAuth callback was already handled.');
      return;
    }
    settled = true;
    respond(
      response,
      200,
      'OAuth authorization complete. You may close this tab.',
      () => {
        void closeServer(activeServer).finally(complete);
      }
    );
  }

  function fail(
    activeServer: Server,
    response: ServerResponse,
    message: string,
    reject: (error: Error) => void
  ): void {
    settle(activeServer, response, () => reject(new Error(message)));
  }
}

function respond(
  response: ServerResponse,
  status: number,
  body: string,
  done?: () => void
): void {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(
    `<!doctype html><title>OAuth</title><p>${escapeHtml(body)}</p>`,
    done
  );
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function addressPort(server: Server): number {
  const address = server.address();
  if (typeof address === 'object' && address !== null) {
    return address.port;
  }
  throw new Error('OAuth callback server did not bind to a TCP port.');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
