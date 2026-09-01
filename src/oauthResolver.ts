import {
  GopherAgentOAuthOptions,
  GopherAgentRuntimeOptions,
  GopherAgentTokenRecord,
  normalizeRuntimeOptions,
} from './config';
import { buildOAuthAuthorizationUrl } from './oauthAuthorizationUrl';
import {
  fetchOAuthAuthorizationServerMetadata,
  fetchOAuthProtectedResourceMetadata,
  OAuthAuthorizationServerMetadata,
  OAuthProtectedResourceMetadata,
  probeMcpOAuthChallenge,
} from './oauthDiscovery';
import { createOAuthLoopbackCallbackServer } from './oauthLoopback';
import { createCodeChallenge, createCodeVerifier } from './oauthPkce';
import {
  registerOAuthClient,
  OAuthRegisteredClient,
} from './oauthRegistration';
import { mergeOAuthTokenIntoRuntimeOptions } from './oauthRuntimeOptions';
import { extractMcpServerTargets } from './oauthServerTargets';
import {
  createOAuthTokenCacheKey,
  InMemoryGopherAgentTokenStore,
  resolveOAuthTokenFromStore,
} from './oauthTokenStore';
import {
  ExchangeOAuthCodeInput,
  exchangeOAuthCodeForToken,
  RefreshOAuthTokenInput,
  refreshOAuthToken,
} from './oauthTokenExchange';
import {
  openAuthorizationUrl,
  OpenAuthorizationUrlResult,
} from './oauthBrowser';

export interface OAuthResolutionInput {
  urls: string[];
  serverConfig?: string;
  runtimeOptions?: GopherAgentRuntimeOptions;
  oauth?: GopherAgentOAuthOptions;
}

export interface OAuthUrlResolutionInput {
  url: string;
  runtimeOptions?: GopherAgentRuntimeOptions;
  oauth?: GopherAgentOAuthOptions;
}

export interface OAuthChallengeResult {
  url: string;
  requiresOAuth: boolean;
  resourceMetadataUrl?: string;
  authorizationServer?: string;
  resource?: string;
  scopes?: string[];
}

export type OAuthChallengeProbe = (
  url: string
) => Promise<OAuthChallengeResult>;

export type OAuthTokenAcquirer = (
  challenges: OAuthChallengeResult[],
  oauth: GopherAgentOAuthOptions
) => Promise<GopherAgentRuntimeOptions | undefined>;

export type OAuthUrlRuntimeOptionsResolver = (
  input: OAuthUrlResolutionInput
) => Promise<GopherAgentRuntimeOptions | undefined>;

export interface OAuthResolverHooks {
  probeChallenge: OAuthChallengeProbe;
  acquireToken: OAuthTokenAcquirer;
}

export interface OAuthFlowHooks {
  fetchProtectedResourceMetadata: typeof fetchOAuthProtectedResourceMetadata;
  fetchAuthorizationServerMetadata: typeof fetchOAuthAuthorizationServerMetadata;
  createLoopbackCallbackServer: typeof createOAuthLoopbackCallbackServer;
  openAuthorizationUrl: typeof openAuthorizationUrl;
  registerClient: typeof registerOAuthClient;
  exchangeCodeForToken: (
    input: ExchangeOAuthCodeInput
  ) => MaybePromise<GopherAgentTokenRecord>;
  refreshToken: (
    input: RefreshOAuthTokenInput
  ) => MaybePromise<GopherAgentTokenRecord>;
  createCodeVerifier: typeof createCodeVerifier;
  createCodeChallenge: typeof createCodeChallenge;
}

type MaybePromise<T> = T | Promise<T>;

const defaultTokenStore = new InMemoryGopherAgentTokenStore();

async function defaultProbeChallenge(
  url: string
): Promise<OAuthChallengeResult> {
  return probeMcpOAuthChallenge(url);
}

async function defaultAcquireToken(
  challenges: OAuthChallengeResult[],
  oauth: GopherAgentOAuthOptions
): Promise<GopherAgentRuntimeOptions> {
  const challenge = challenges[0];
  if (challenge === undefined) {
    return {};
  }
  if (challenge.resourceMetadataUrl === undefined) {
    throw new Error(
      `oauth_metadata_missing: MCP OAuth challenge for ${challenge.url} is missing resource_metadata`
    );
  }

  const cachedFromChallenge = await resolveCachedTokenFromChallenge(
    challenge,
    oauth
  );
  if (cachedFromChallenge !== undefined) {
    logOAuthDebug(
      'resolved access token claims',
      decodeJwtClaims(cachedFromChallenge.accessToken)
    );
    return mergeOAuthTokenIntoRuntimeOptions(undefined, cachedFromChallenge);
  }

  const resourceMetadata = await flowHooks.fetchProtectedResourceMetadata(
    challenge.resourceMetadataUrl
  );
  logOAuthDebug('resource metadata', {
    resourceMetadataUrl: challenge.resourceMetadataUrl,
    resource: resourceMetadata.resource,
    authorizationServers: resourceMetadata.authorizationServers,
    scopesSupported: resourceMetadata.scopesSupported,
  });
  const authorizationServer = selectAuthorizationServer(
    challenge,
    resourceMetadata
  );
  const authorizationMetadata =
    await flowHooks.fetchAuthorizationServerMetadata(authorizationServer);
  const scopes = selectScopes(oauth, resourceMetadata, authorizationMetadata);
  logOAuthDebug('authorization server metadata', {
    issuer: authorizationMetadata.issuer,
    authorizationEndpoint: authorizationMetadata.authorizationEndpoint,
    tokenEndpoint: authorizationMetadata.tokenEndpoint,
    registrationEndpoint: authorizationMetadata.registrationEndpoint,
    scopesSupported: authorizationMetadata.scopesSupported,
    selectedScopes: scopes,
  });

  const cacheKey = createOAuthTokenCacheKey({
    resource: resourceMetadata.resource,
    issuer: authorizationMetadata.issuer,
    scopes,
  });

  const token = await resolveOAuthTokenFromStore({
    store: oauth.tokenStore ?? defaultTokenStore,
    key: cacheKey,
    refreshToken: async (cached) => {
      if (cached.oauthClientId === undefined) {
        throw new Error(
          'oauth_refresh_client_missing: Cached OAuth token is missing client registration data'
        );
      }
      return await flowHooks.refreshToken({
        refreshToken: cached.refreshToken ?? '',
        tokenEndpoint: authorizationMetadata.tokenEndpoint,
        clientId: cached.oauthClientId,
        clientSecret: cached.oauthClientSecret,
      });
    },
    acquireToken: async () => {
      const state = createOAuthState();
      const loopback = await flowHooks.createLoopbackCallbackServer({
        state,
      });
      logOAuthDebug('loopback redirect', {
        redirectUri: loopback.redirectUri,
      });

      try {
        const client = await flowHooks.registerClient({
          metadata: authorizationMetadata,
          redirectUri: loopback.redirectUri,
          scopes,
          oauth,
        });
        logOAuthDebug('registered client', {
          clientId: client.clientId,
          clientSecretPresent: client.clientSecret !== undefined,
          clientName: oauth.clientName ?? 'gopher-mcp-js',
          redirectUri: loopback.redirectUri,
          scopes,
        });

        const acquired = await runAuthorizationCodeFlow({
          oauth,
          resourceMetadata,
          authorizationMetadata,
          client,
          redirectUri: loopback.redirectUri,
          waitForCallback: () => loopback.waitForCallback(),
          state,
        });
        return {
          ...acquired,
          oauthClientId: client.clientId,
          ...(client.clientSecret !== undefined
            ? { oauthClientSecret: client.clientSecret }
            : {}),
        };
      } finally {
        await loopback.close();
      }
    },
  });
  logOAuthDebug('resolved access token claims', decodeJwtClaims(token.accessToken));

  return mergeOAuthTokenIntoRuntimeOptions(undefined, token);
}

async function resolveCachedTokenFromChallenge(
  challenge: OAuthChallengeResult,
  oauth: GopherAgentOAuthOptions
): Promise<GopherAgentTokenRecord | undefined> {
  if (
    challenge.resource === undefined ||
    challenge.authorizationServer === undefined
  ) {
    return undefined;
  }

  const scopes =
    oauth.scopes !== undefined && oauth.scopes.length > 0
      ? oauth.scopes
      : challenge.scopes;
  if (scopes === undefined || scopes.length === 0) {
    return undefined;
  }

  const cached = await (oauth.tokenStore ?? defaultTokenStore).get(
    createOAuthTokenCacheKey({
      resource: challenge.resource,
      issuer: challenge.authorizationServer,
      scopes,
    })
  );
  if (cached === undefined || isTokenExpired(cached)) {
    return undefined;
  }
  return cached;
}

async function defaultOAuthUrlRuntimeOptionsResolver(
  input: OAuthUrlResolutionInput
): Promise<GopherAgentRuntimeOptions | undefined> {
  return resolveRuntimeOptionsWithOAuth({
    urls: [input.url],
    runtimeOptions: input.runtimeOptions,
    oauth: input.oauth,
  });
}

let resolverHooks: OAuthResolverHooks = {
  probeChallenge: defaultProbeChallenge,
  acquireToken: defaultAcquireToken,
};

let flowHooks: OAuthFlowHooks = {
  fetchProtectedResourceMetadata: fetchOAuthProtectedResourceMetadata,
  fetchAuthorizationServerMetadata: fetchOAuthAuthorizationServerMetadata,
  createLoopbackCallbackServer: createOAuthLoopbackCallbackServer,
  openAuthorizationUrl,
  registerClient: registerOAuthClient,
  exchangeCodeForToken: exchangeOAuthCodeForToken,
  refreshToken: refreshOAuthToken,
  createCodeVerifier,
  createCodeChallenge,
};

let activeOAuthUrlRuntimeOptionsResolver: OAuthUrlRuntimeOptionsResolver =
  defaultOAuthUrlRuntimeOptionsResolver;

export async function resolveRuntimeOptionsWithOAuth(
  input: OAuthResolutionInput
): Promise<GopherAgentRuntimeOptions | undefined> {
  const runtimeOptions = normalizeRuntimeOptions(input.runtimeOptions);
  if (
    input.oauth?.mode === 'disabled' ||
    hasRuntimeAuthorization(runtimeOptions)
  ) {
    return runtimeOptions;
  }

  const urls = [
    ...input.urls,
    ...extractMcpServerTargets({ serverConfig: input.serverConfig }).map(
      (target) => target.url
    ),
  ];

  const challenges = await Promise.all(
    urls.map((url) => resolverHooks.probeChallenge(url))
  );
  const oauthChallenges = challenges.filter(
    (challenge) => challenge.requiresOAuth
  );
  if (oauthChallenges.length === 0) {
    return runtimeOptions;
  }

  assertCompatibleOAuthChallenges(oauthChallenges);

  const tokenOptions = await resolverHooks.acquireToken(
    oauthChallenges,
    input.oauth ?? {}
  );
  return mergeRuntimeOptions(runtimeOptions, tokenOptions);
}

export async function resolveUrlRuntimeOptionsWithOAuth(
  input: OAuthUrlResolutionInput
): Promise<GopherAgentRuntimeOptions | undefined> {
  return activeOAuthUrlRuntimeOptionsResolver(input);
}

export function setOAuthUrlRuntimeOptionsResolverForTest(
  resolver?: OAuthUrlRuntimeOptionsResolver
): void {
  activeOAuthUrlRuntimeOptionsResolver =
    resolver ?? defaultOAuthUrlRuntimeOptionsResolver;
}

export function setOAuthResolverHooksForTest(
  hooks?: Partial<OAuthResolverHooks>
): void {
  resolverHooks = {
    probeChallenge: hooks?.probeChallenge ?? defaultProbeChallenge,
    acquireToken: hooks?.acquireToken ?? defaultAcquireToken,
  };
}

export function setOAuthFlowHooksForTest(
  hooks?: Partial<OAuthFlowHooks>
): void {
  flowHooks = {
    fetchProtectedResourceMetadata:
      hooks?.fetchProtectedResourceMetadata ??
      fetchOAuthProtectedResourceMetadata,
    fetchAuthorizationServerMetadata:
      hooks?.fetchAuthorizationServerMetadata ??
      fetchOAuthAuthorizationServerMetadata,
    createLoopbackCallbackServer:
      hooks?.createLoopbackCallbackServer ?? createOAuthLoopbackCallbackServer,
    openAuthorizationUrl: hooks?.openAuthorizationUrl ?? openAuthorizationUrl,
    registerClient: hooks?.registerClient ?? registerOAuthClient,
    exchangeCodeForToken:
      hooks?.exchangeCodeForToken ?? exchangeOAuthCodeForToken,
    refreshToken: hooks?.refreshToken ?? refreshOAuthToken,
    createCodeVerifier: hooks?.createCodeVerifier ?? createCodeVerifier,
    createCodeChallenge: hooks?.createCodeChallenge ?? createCodeChallenge,
  };
}

function hasRuntimeAuthorization(options?: GopherAgentRuntimeOptions): boolean {
  if (options?.accessToken !== undefined) {
    return true;
  }
  if (options?.headers === undefined) {
    return false;
  }
  return Object.keys(options.headers).some(
    (name) => name.toLowerCase() === 'authorization'
  );
}

function assertCompatibleOAuthChallenges(
  challenges: OAuthChallengeResult[]
): void {
  const compatibilityKeys = new Set<string>();
  for (const challenge of challenges) {
    const issuer =
      challenge.authorizationServer ??
      challenge.resourceMetadataUrl ??
      challenge.url;
    const resource =
      challenge.resource ?? challenge.resourceMetadataUrl ?? challenge.url;
    const scopes = [...(challenge.scopes ?? [])].sort();
    compatibilityKeys.add(JSON.stringify({ issuer, resource, scopes }));
  }
  if (compatibilityKeys.size > 1) {
    throw new Error(
      'OAuth auto-flow found multiple protected MCP servers with different OAuth issuers.\nPer-server OAuth tokens are not supported yet.'
    );
  }
}

function mergeRuntimeOptions(
  base?: GopherAgentRuntimeOptions,
  tokenOptions?: GopherAgentRuntimeOptions
): GopherAgentRuntimeOptions | undefined {
  const normalizedTokenOptions = normalizeRuntimeOptions(tokenOptions);
  if (base === undefined) {
    return normalizedTokenOptions;
  }
  if (normalizedTokenOptions === undefined) {
    return base;
  }
  return normalizeRuntimeOptions({
    ...base,
    ...normalizedTokenOptions,
    headers: {
      ...(base.headers ?? {}),
      ...(normalizedTokenOptions.headers ?? {}),
    },
  });
}

interface AuthorizationCodeFlowInput {
  oauth: GopherAgentOAuthOptions;
  resourceMetadata: OAuthProtectedResourceMetadata;
  authorizationMetadata: OAuthAuthorizationServerMetadata;
  client: OAuthRegisteredClient;
  redirectUri: string;
  waitForCallback: () => Promise<{ code: string; state: string }>;
  state: string;
}

async function runAuthorizationCodeFlow(
  input: AuthorizationCodeFlowInput
): Promise<GopherAgentTokenRecord> {
  const codeVerifier = flowHooks.createCodeVerifier();
  const codeChallenge = flowHooks.createCodeChallenge(codeVerifier);
  const authorizationUrl = buildOAuthAuthorizationUrl({
    metadata: input.authorizationMetadata,
    clientId: input.client.clientId,
    redirectUri: input.redirectUri,
    state: input.state,
    codeChallenge,
    scopes: input.oauth.scopes,
    resourceMetadata: input.resourceMetadata,
  });
  logOAuthDebug(
    'authorization request',
    summarizeAuthorizationUrl(authorizationUrl)
  );

  const opened = await flowHooks.openAuthorizationUrl(authorizationUrl, {
    openBrowser: input.oauth.openBrowser,
  });
  printManualAuthorizationUrl(opened);

  const callback = await input.waitForCallback();
  logOAuthDebug('authorization callback', {
    codePresent: callback.code.length > 0,
    stateMatches: callback.state === input.state,
  });
  return await flowHooks.exchangeCodeForToken({
    code: callback.code,
    redirectUri: input.redirectUri,
    codeVerifier,
    tokenEndpoint: input.authorizationMetadata.tokenEndpoint,
    clientId: input.client.clientId,
    clientSecret: input.client.clientSecret,
  });
}

function selectAuthorizationServer(
  challenge: OAuthChallengeResult,
  metadata: OAuthProtectedResourceMetadata
): string {
  if (challenge.authorizationServer !== undefined) {
    return challenge.authorizationServer;
  }
  const authorizationServer = metadata.authorizationServers[0];
  if (authorizationServer === undefined) {
    throw new Error(
      'oauth_metadata_fetch_failed: Protected resource metadata is missing authorization_servers'
    );
  }
  return authorizationServer;
}

function selectScopes(
  oauth: GopherAgentOAuthOptions,
  resourceMetadata: OAuthProtectedResourceMetadata,
  authorizationMetadata: OAuthAuthorizationServerMetadata
): string[] {
  if (oauth.scopes !== undefined && oauth.scopes.length > 0) {
    return oauth.scopes;
  }
  if (resourceMetadata.scopesSupported.length > 0) {
    return resourceMetadata.scopesSupported;
  }
  return authorizationMetadata.scopesSupported;
}

function printManualAuthorizationUrl(result: OpenAuthorizationUrlResult): void {
  if (!result.opened) {
    process.stderr.write(`Open this OAuth authorization URL:\n${result.url}\n`);
  }
}

function createOAuthState(): string {
  return createCodeVerifier();
}

function isTokenExpired(token: GopherAgentTokenRecord): boolean {
  return token.expiresAt !== undefined && token.expiresAt <= Date.now();
}

function logOAuthDebug(label: string, values: unknown): void {
  if (process.env.GOPHER_MCP_OAUTH_DEBUG !== '1' && process.env.DEBUG !== '1') {
    return;
  }
  process.stderr.write(
    `[gopher-mcp-js oauth] ${label}: ${JSON.stringify(values)}\n`
  );
}

function summarizeAuthorizationUrl(url: string): Record<string, string | null> {
  const parsed = new URL(url);
  return {
    endpoint: `${parsed.origin}${parsed.pathname}`,
    response_type: parsed.searchParams.get('response_type'),
    client_id: parsed.searchParams.get('client_id'),
    redirect_uri: parsed.searchParams.get('redirect_uri'),
    scope: parsed.searchParams.get('scope'),
    resource: parsed.searchParams.get('resource'),
    code_challenge_method: parsed.searchParams.get('code_challenge_method'),
  };
}

function decodeJwtClaims(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2 || parts[1] === undefined) {
    return { jwt: false };
  }

  try {
    const payload: unknown = JSON.parse(base64UrlDecode(parts[1]));
    if (!isRecord(payload)) {
      return { jwt: true, claimsDecodeError: 'JWT payload is not an object' };
    }
    const claimNames = [
      'iss',
      'aud',
      'azp',
      'client_id',
      'scope',
      'scp',
      'sub',
      'exp',
      'iat',
    ];
    const claims: Record<string, unknown> = { jwt: true };
    for (const name of claimNames) {
      if (Object.prototype.hasOwnProperty.call(payload, name)) {
        claims[name] = payload[name];
      }
    }
    return claims;
  } catch (e) {
    return {
      jwt: true,
      claimsDecodeError: (e as Error).message,
    };
  }
}

function base64UrlDecode(value: string): string {
  const padded = value.padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    '='
  );
  return Buffer.from(
    padded.replace(/-/g, '+').replace(/_/g, '/'),
    'base64'
  ).toString('utf8');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
