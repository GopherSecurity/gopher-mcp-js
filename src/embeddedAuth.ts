import { randomUUID } from 'crypto';
import type { GopherAgentCreateOptions, GopherAgentTokenStore } from './config';
import { normalizeRuntimeOptions } from './config';
import { AgentError, TimeoutError } from './errors';
import { GopherOrchLibrary } from './ffi/library';
import type {
  NativeGrantBinding,
  NativeStoreRequest,
  NativeAuthEvent,
} from './ffi/embeddedAuth';
import { missingEmbeddedAuth } from './ffi/embeddedAuth';
import { openAuthorizationUrl } from './oauthBrowser';

type Context = ReturnType<GopherOrchLibrary['createEmbeddedAuth']>;
export interface EmbeddedAgentCreation {
  handle: ReturnType<Context['takeAgent']>;
  /** External stores require an async run so Node can keep polling. */
  requiresAsyncRun: boolean;
  close(): Promise<void>;
  check(): void;
}

function storeKey(binding: NativeGrantBinding): string {
  return (
    'gopher-embedded-v1:' +
    JSON.stringify([
      binding.identity_namespace,
      binding.source,
      binding.issuer,
      binding.resource,
      binding.scopes,
      binding.client_identity,
    ])
  );
}
async function serviceStore(
  store: GopherAgentTokenStore,
  request: NativeStoreRequest
): Promise<unknown> {
  const key = storeKey(request.binding);
  if (request.operation === 'get') {
    const token = await store.get(key);
    return token?.embeddedGrant
      ? { found: true, grant: token.embeddedGrant }
      : { found: false };
  }
  if (request.operation === 'put') {
    const grant = request.grant;
    if (!grant) throw new Error('Missing native grant');
    await store.set(key, {
      accessToken: grant.access_token,
      refreshToken: grant.refresh_token,
      tokenType: 'Bearer',
      expiresAt: grant.expires_at * 1000,
      oauthClientId: grant.client_id,
      oauthClientSecret: grant.client_secret,
      embeddedGrant: grant,
    });
    return { ok: true };
  }
  if (request.operation === 'erase' && store.delete) {
    await store.delete(key);
    return { ok: true };
  }
  throw new Error('Unsupported token-store request');
}
function timeout(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const number = value ?? fallback;
  if (!Number.isInteger(number) || number < min || number > max)
    throw new AgentError('Invalid assemble authorization timeout');
  return number;
}
function pageUrl(raw: string | undefined): string {
  try {
    const url = new URL(raw ?? '');
    if (
      url.protocol !== 'http:' ||
      !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) ||
      url.username ||
      url.password
    )
      throw new Error();
    return url.toString();
  } catch {
    throw new AgentError('Invalid native authorization page URL');
  }
}
function progress(sources: unknown): Array<{ source: string; state: string }> {
  if (!Array.isArray(sources)) return [];
  return sources.map((value) => {
    const row = value as Record<string, unknown>;
    if (!row || typeof row.source !== 'string' || typeof row.state !== 'string')
      throw new AgentError('Invalid authorization progress');
    return { source: row.source, state: row.state };
  });
}

/** Native owns all OAuth state transitions; JS only pumps host callbacks. */
export async function createEmbeddedAgent(
  lib: GopherOrchLibrary,
  inventory: string,
  provider: string,
  model: string,
  options: GopherAgentCreateOptions = {}
): Promise<EmbeddedAgentCreation> {
  if (!lib.embeddedAuthCapabilities()) throw missingEmbeddedAuth();
  const oauth = options.oauth ?? {};
  const settings = oauth.assemble ?? {};
  if (oauth.tokenStore && !settings.identityNamespace?.trim())
    throw new AgentError(
      'Custom assemble token stores require oauth.assemble.identityNamespace'
    );
  if (
    settings.identityNamespace !== undefined &&
    (!settings.identityNamespace.trim() ||
      settings.identityNamespace.includes('\0'))
  )
    throw new AgentError('Invalid assemble identity namespace');
  if (settings.signal?.aborted)
    throw new AgentError('Authorization cancelled', 'AUTH_CANCELLED');
  const authOptions: Record<string, unknown> = {
    identity_namespace: settings.identityNamespace ?? randomUUID(),
    external_store: !!oauth.tokenStore,
    authorization_timeout_ms: timeout(settings.timeoutMs, 600000, 100, 1800000),
    network_timeout_ms: timeout(settings.networkTimeoutMs, 10000, 100, 30000),
    discovery_timeout_ms: timeout(
      settings.discoveryTimeoutMs,
      30000,
      100,
      120000
    ),
    allow_loopback_http: settings.allowLoopbackHttp ?? false,
  };
  const clients: Record<string, unknown> = {};
  for (const [source, client] of Object.entries(settings.clients ?? {})) {
    clients[source] = {
      client_id: client.clientId,
      ...(client.clientSecret !== undefined
        ? { client_secret: client.clientSecret }
        : {}),
      token_endpoint_auth_method:
        client.tokenEndpointAuthMethod ??
        (client.clientSecret ? 'client_secret_post' : 'none'),
      ...(client.scopes ? { scopes: client.scopes } : {}),
    };
  }
  if (oauth.scopes) {
    const parsed = JSON.parse(inventory) as {
      data: {
        servers: Array<{
          id?: string;
          serverId?: string;
          server_id?: string;
          name: string;
        }>;
      };
    };
    for (const source of parsed.data.servers) {
      const key =
        source.id ?? source.serverId ?? source.server_id ?? source.name;
      const client = clients[key] as Record<string, unknown> | undefined;
      clients[key] = { scopes: oauth.scopes, ...client };
    }
  }
  authOptions.clients = clients;
  // Preserve provider elicitation callbacks. Server-auth completion sets no preflight markers.
  const context = lib.createEmbeddedAuth(
    inventory,
    JSON.stringify(authOptions),
    {
      ...normalizeRuntimeOptions(options),
      elicitation: options.elicitation ?? {},
    }
  );
  let closed = false;
  let transferred = false;
  let authorized = false;
  let pagePresented = false;
  let failure: Error | undefined;
  const pending = new Set<string>();
  const tasks = new Set<Promise<void>>();
  let closePromise: Promise<void> | undefined;
  const reportFailure = () => {
    failure = new AgentError(
      'Authorization host callback failed',
      'AUTH_HOST_CALLBACK'
    );
    context.cancel();
  };
  const schedule = (task: Promise<void>) => {
    const tracked = task
      .catch(reportFailure)
      .finally(() => tasks.delete(tracked));
    tasks.add(tracked);
  };
  const abort = () => {
    failure = new AgentError('Authorization cancelled', 'AUTH_CANCELLED');
    context.cancel();
  };
  settings.signal?.addEventListener('abort', abort, { once: true });
  const pumpStore = () => {
    for (let i = 0; i < 16; i++) {
      const request = context.storeRequest();
      if (!request) break;
      if (!oauth.tokenStore || pending.has(request.id)) {
        reportFailure();
        break;
      }
      pending.add(request.id);
      schedule(
        (async () => {
          let result: unknown;
          try {
            result = await serviceStore(oauth.tokenStore!, request);
          } catch {
            result = { ok: false };
          }
          if (!closed) {
            try {
              context.completeStore(request.id, result);
            } catch {
              if (!failure) reportFailure();
            }
          }
          pending.delete(request.id);
        })()
      );
    }
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  const close = (): Promise<void> => {
    if (closePromise) return closePromise;
    closed = true;
    if (timer) clearInterval(timer);
    settings.signal?.removeEventListener('abort', abort);
    closePromise = context.release();
    return closePromise;
  };
  // Deadline covers authorization, discovery and async creation; it never governs provider run consent.
  const deadline =
    Date.now() +
    Number(authOptions.authorization_timeout_ms) +
    Number(authOptions.discovery_timeout_ms) +
    Number(authOptions.network_timeout_ms);
  try {
    context.start();
    while (!closed) {
      if (settings.signal?.aborted) abort();
      if (failure) throw failure;
      if (Date.now() > deadline)
        throw new TimeoutError('Assemble authorization timed out');
      pumpStore();
      let event: NativeAuthEvent | null;
      while ((event = context.event())) {
        if (event.type === 'page' && !pagePresented) {
          pagePresented = true;
          const url = pageUrl(event.url);
          const flow = event.flow ?? 'assemble';
          schedule(
            (async () => {
              // Custom presentation owns the URL; never write capability URLs to logs.
              if (settings.onAuthorizationUrl)
                await settings.onAuthorizationUrl(url, flow);
              else {
                const opened = await openAuthorizationUrl(url, {
                  openBrowser: oauth.openBrowser,
                });
                if (!opened.opened)
                  throw new Error('Manual URL handler required');
              }
            })()
          );
        } else if (event.type === 'progress') {
          settings.onProgress?.(progress(event.sources));
        } else if (event.type === 'authorized' && !authorized) {
          authorized = true;
          context.createAgent(provider, model);
        } else if (event.type === 'agent_ready') {
          if (!authorized || failure)
            throw (
              failure ?? new AgentError('Invalid native authorization state')
            );
          await Promise.all([...tasks]);
          if (failure) throw failure;
          const handle = context.takeAgent();
          transferred = true;
          settings.signal?.removeEventListener('abort', abort);
          if (oauth.tokenStore) {
            timer = setInterval(() => {
              try {
                pumpStore();
              } catch {
                reportFailure();
              }
            }, 10);
            timer.unref();
          } else await close();
          return {
            handle,
            requiresAsyncRun: !!oauth.tokenStore,
            close,
            check: () => {
              if (failure) throw failure;
            },
          };
        } else if (event.type === 'failed' || event.type === 'cancelled') {
          throw new AgentError(
            event.type === 'cancelled'
              ? 'Authorization cancelled'
              : 'Native authorization or agent creation failed',
            event.type === 'cancelled' ? 'AUTH_CANCELLED' : 'AUTH_FAILED'
          );
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new AgentError('Authorization closed before completion');
  } catch (error) {
    if (!transferred) context.cancel();
    await close();
    if (error instanceof AgentError) throw error;
    throw new AgentError(
      'Authorization host integration failed',
      'AUTH_HOST_CALLBACK'
    );
  }
}
