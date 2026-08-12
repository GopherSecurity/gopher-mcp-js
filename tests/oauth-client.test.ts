export {};

/**
 * Tests for GopherOAuthClient FFI binding
 */

import { spawn, ChildProcess } from 'child_process';

let GopherOAuthClient: typeof import('../src/ffi/auth/oauth-client').GopherOAuthClient;
let nativeAvailable = false;

try {
  const loader = require('../src/ffi/auth/loader');
  nativeAvailable = loader.loadLibrary();
  if (nativeAvailable) {
    const mod = require('../src/ffi/auth/oauth-client');
    GopherOAuthClient = mod.GopherOAuthClient;
    // Init auth library
    loader.authInit();
  }
} catch {
  nativeAvailable = false;
}

const describeIfNative = nativeAvailable ? describe : describe.skip;

describeIfNative('GopherOAuthClient', () => {
  let tokenServer: ChildProcess | undefined;

  afterEach(async () => {
    if (tokenServer !== undefined) {
      tokenServer.kill();
      tokenServer = undefined;
    }
  });

  it('should create client with all parameters', () => {
    const client = new GopherOAuthClient(
      'http://kc:8080/token',
      'my-client',
      'my-secret',
      30
    );
    expect(client.isDestroyed()).toBe(false);
    client.destroy();
  });

  it('should create client without secret (public client)', () => {
    const client = new GopherOAuthClient(
      'http://kc:8080/token',
      'my-client',
      undefined,
      30
    );
    expect(client.isDestroyed()).toBe(false);
    client.destroy();
  });

  it('should return error TokenResponse for unreachable server', () => {
    const client = new GopherOAuthClient(
      'http://192.0.2.1:1/token',
      'cid',
      'cs',
      1
    );

    const resp = client.exchangeCode('code123', 'http://localhost/cb');
    expect(resp.success).toBe(false);
    expect(resp.accessToken).toBe('');
    client.destroy();
  });

  it('should exchange an authorization code against a local token endpoint', async () => {
    const started = await startTokenServer();
    tokenServer = started.child;

    const client = new GopherOAuthClient(
      `${started.baseUrl}/token`,
      'cid',
      'cs',
      5
    );

    const resp = client.exchangeCode(
      'code123',
      'http://127.0.0.1/callback',
      'verifier123'
    );
    expect(resp).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
      success: true,
    });
    client.destroy();
  });

  it('should return error for refresh with unreachable server', () => {
    const client = new GopherOAuthClient(
      'http://192.0.2.1:1/token',
      'cid',
      'cs',
      1
    );

    const resp = client.refreshToken('refresh-tok');
    expect(resp.success).toBe(false);
    client.destroy();
  });

  it('should return error for tokenExchange with unreachable server', () => {
    const client = new GopherOAuthClient(
      'http://192.0.2.1:1/token',
      'cid',
      'cs',
      1
    );

    const resp = client.tokenExchange('subject-tok', 'google');
    expect(resp.success).toBe(false);
    client.destroy();
  });

  it('should destroy and mark as destroyed', () => {
    const client = new GopherOAuthClient(
      'http://kc:8080/token',
      'cid',
      'cs',
      5
    );
    client.destroy();
    expect(client.isDestroyed()).toBe(true);
  });

  it('should throw on call after destroy', () => {
    const client = new GopherOAuthClient(
      'http://kc:8080/token',
      'cid',
      'cs',
      5
    );
    client.destroy();
    expect(() => client.exchangeCode('code', 'http://cb')).toThrow(
      'GopherOAuthClient has been destroyed'
    );
  });

  it('should be safe to call destroy twice', () => {
    const client = new GopherOAuthClient(
      'http://kc:8080/token',
      'cid',
      'cs',
      5
    );
    client.destroy();
    client.destroy();
    expect(client.isDestroyed()).toBe(true);
  });
});

function startTokenServer(): Promise<{
  child: ChildProcess;
  baseUrl: string;
}> {
  const script = `
const http = require('http');
const server = http.createServer((request, response) => {
  if (request.method !== 'POST' || request.url !== '/token') {
    response.writeHead(404);
    response.end();
    return;
  }
  const chunks = [];
  request.on('data', chunk => chunks.push(chunk));
  request.on('end', () => {
    const body = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    const ok =
      body.get('grant_type') === 'authorization_code' &&
      body.get('code') === 'code123' &&
      body.get('redirect_uri') === 'http://127.0.0.1/callback' &&
      body.get('code_verifier') === 'verifier123' &&
      body.get('client_id') === 'cid' &&
      body.get('client_secret') === 'cs';
    if (!ok) {
      response.writeHead(400);
      response.end('bad request');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      token_type: 'Bearer',
      expires_in: 3600
    }));
  });
});
server.listen(0, '127.0.0.1', () => {
  console.log(server.address().port);
});
`;
  const child = spawn(process.execPath, ['-e', script], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('token server did not start'));
    }, 5000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      reject(
        new Error(
          `token server exited before startup: code=${code ?? 'null'} signal=${
            signal ?? 'null'
          }`
        )
      );
    });
    child.stdout.once('data', (chunk: Buffer) => {
      clearTimeout(timer);
      const port = Number(chunk.toString('utf8').trim());
      if (!Number.isFinite(port) || port <= 0) {
        child.kill();
        reject(new Error(`token server returned invalid port: ${chunk}`));
        return;
      }
      resolve({ child, baseUrl: `http://127.0.0.1:${port}` });
    });
    child.stderr.once('data', (chunk: Buffer) => {
      const error = chunk.toString('utf8').trim();
      if (error) {
        clearTimeout(timer);
        child.kill();
        reject(new Error(error));
      }
    });
  });
}
