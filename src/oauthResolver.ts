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
import { isRecord, logOAuthDebug } from './oauthInternal';
import { shouldSkipOAuthResolution } from './oauthRuntimeOptions';

export interface OAuthResolutionInput {
  urls: string[];
  serverConfig?: string;
  runtimeOptions?: GopherAgentRuntimeOptions;
  oauth?: GopherAgentOAuthOptions;
  hooks?: Partial<OAuthResolverHooks & OAuthFlowHooks>;
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
  url: string,
  options?: { headers?: Record<string, string> }
) => Promise<OAuthChallengeResult>;

export type OAuthTokenAcquirer = (
  challenges: OAuthChallengeResult[],
  oauth: GopherAgentOAuthOptions,
  hooks?: ResolvedOAuthHooks
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
export type ResolvedOAuthHooks = OAuthResolverHooks & OAuthFlowHooks;

const defaultTokenStore = new InMemoryGopherAgentTokenStore();

async function defaultProbeChallenge(
  url: string,
  options?: { headers?: Record<string, string> }
): Promise<OAuthChallengeResult> {
  return probeMcpOAuthChallenge(url, options);
}

async function defaultAcquireToken(
  challenges: OAuthChallengeResult[],
  oauth: GopherAgentOAuthOptions,
  hooks: ResolvedOAuthHooks = defaultOAuthHooks
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

  const resourceMetadata = await hooks.fetchProtectedResourceMetadata(
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
    await hooks.fetchAuthorizationServerMetadata(authorizationServer);
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
      return await hooks.refreshToken({
        refreshToken: cached.refreshToken ?? '',
        tokenEndpoint: authorizationMetadata.tokenEndpoint,
        clientId: cached.oauthClientId,
        clientSecret: cached.oauthClientSecret,
        resource: resourceMetadata.resource,
      });
    },
    acquireToken: async () => {
      const state = createOAuthState();
      const loopback = await hooks.createLoopbackCallbackServer({
        state,
        redirectUri: oauth.redirectUri,
      });
      logOAuthDebug('loopback redirect', {
        redirectUri: loopback.redirectUri,
      });

      try {
        const client = await hooks.registerClient({
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
          hooks,
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
  logOAuthDebug(
    'resolved access token claims',
    decodeJwtClaims(token.accessToken)
  );

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

const defaultOAuthHooks: ResolvedOAuthHooks = {
  probeChallenge: defaultProbeChallenge,
  acquireToken: defaultAcquireToken,
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

function resolveOAuthHooks(
  hooks?: Partial<OAuthResolverHooks & OAuthFlowHooks>
): ResolvedOAuthHooks {
  return {
    ...defaultOAuthHooks,
    ...(hooks ?? {}),
  };
}

export async function resolveRuntimeOptionsWithOAuth(
  input: OAuthResolutionInput
): Promise<GopherAgentRuntimeOptions | undefined> {
  const runtimeOptions = normalizeRuntimeOptions(input.runtimeOptions);
  if (shouldSkipOAuthResolution({ oauth: input.oauth, runtimeOptions })) {
    return runtimeOptions;
  }
  const hooks = resolveOAuthHooks(input.hooks);

  const serverTargets = extractMcpServerTargets({
    serverConfig: input.serverConfig,
  });
  const probeTargets = [
    ...input.urls.map((url) => ({ url })),
    ...serverTargets,
  ];

  const challenges = await Promise.all(
    probeTargets.map((target) =>
      probeUrl(target.url, probeHeadersForTarget(target, runtimeOptions), hooks)
    )
  );
  const oauthChallenges = challenges.filter(
    (challenge) => challenge.requiresOAuth
  );
  if (oauthChallenges.length === 0) {
    return runtimeOptions;
  }

  const enrichedOAuthChallenges =
    oauthChallenges.length > 1
      ? await enrichOAuthChallenges(oauthChallenges, hooks)
      : oauthChallenges;
  if (enrichedOAuthChallenges.length === 0) {
    return runtimeOptions;
  }

  assertCompatibleOAuthChallenges(enrichedOAuthChallenges);

  const tokenOptions = await hooks.acquireToken(
    enrichedOAuthChallenges,
    input.oauth ?? {},
    hooks
  );
  if (input.serverConfig !== undefined) {
    return scopeTokenOptionsToServerConfig(
      runtimeOptions,
      tokenOptions,
      input.serverConfig,
      enrichedOAuthChallenges
    );
  }
  return mergeRuntimeOptions(runtimeOptions, tokenOptions);
}

async function probeUrl(
  url: string,
  headers: Record<string, string> | undefined,
  hooks: ResolvedOAuthHooks
): Promise<OAuthChallengeResult> {
  try {
    return await hooks.probeChallenge(url, { headers });
  } catch (e) {
    logOAuthDebug('challenge probe failed', {
      url,
      error: (e as Error).message,
    });
    return {
      url,
      requiresOAuth: false,
    };
  }
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
    const scopes = [...(challenge.scopes ?? [])].sort();
    compatibilityKeys.add(JSON.stringify({ issuer, scopes }));
  }
  if (compatibilityKeys.size > 1) {
    throw new Error(
      'OAuth auto-flow found multiple protected MCP servers with different OAuth issuers.\nPer-server OAuth tokens are not supported yet.'
    );
  }
}

async function enrichOAuthChallenges(
  challenges: OAuthChallengeResult[],
  hooks: ResolvedOAuthHooks
): Promise<OAuthChallengeResult[]> {
  const enriched = await Promise.allSettled(
    challenges.map(async (challenge): Promise<OAuthChallengeResult> => {
      if (
        challenge.resourceMetadataUrl === undefined ||
        (challenge.authorizationServer !== undefined &&
          challenge.resource !== undefined)
      ) {
        return challenge;
      }
      const metadata = await hooks.fetchProtectedResourceMetadata(
        challenge.resourceMetadataUrl
      );
      return {
        ...challenge,
        resource: challenge.resource ?? metadata.resource,
        authorizationServer:
          challenge.authorizationServer ?? metadata.authorizationServers[0],
        scopes:
          challenge.scopes !== undefined && challenge.scopes.length > 0
            ? challenge.scopes
            : metadata.scopesSupported,
      };
    })
  );
  return enriched.flatMap((result, index) => {
    if (result.status === 'fulfilled') {
      return [result.value];
    }
    logOAuthDebug('OAuth challenge enrichment failed', {
      url: challenges[index]?.url,
      resourceMetadataUrl: challenges[index]?.resourceMetadataUrl,
      error: (result.reason as Error).message,
    });
    return [];
  });
}

function probeHeadersForTarget(
  target: {
    url: string;
    serverId?: string;
    serverName?: string;
    name?: string;
    headers?: Record<string, string>;
  },
  runtimeOptions?: GopherAgentRuntimeOptions
): Record<string, string> | undefined {
  const matchingServerOptions = runtimeOptions?.serverOptions?.filter(
    (option) => runtimeServerOptionMatchesTarget(option, target)
  );
  const serverOptionHeaders = (matchingServerOptions ?? []).reduce(
    (merged, option) => ({
      ...merged,
      ...(option.headers ?? {}),
      ...(option.accessToken !== undefined
        ? { Authorization: `Bearer ${option.accessToken}` }
        : {}),
    }),
    {} as Record<string, string>
  );
  const headers = {
    ...(runtimeOptions?.headers ?? {}),
    ...(target.headers ?? {}),
    ...serverOptionHeaders,
  };
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function runtimeServerOptionMatchesTarget(
  option: NonNullable<GopherAgentRuntimeOptions['serverOptions']>[number],
  target: { url: string; serverId?: string; serverName?: string; name?: string }
): boolean {
  if (option.serverId !== undefined && option.serverId === target.serverId) {
    return true;
  }
  const optionServerName = option.serverName ?? option.name;
  const targetServerName = target.serverName ?? target.name;
  if (optionServerName !== undefined && optionServerName === targetServerName) {
    return true;
  }
  return option.url !== undefined && option.url === target.url;
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
    serverOptions: [
      ...(base.serverOptions ?? []),
      ...(normalizedTokenOptions.serverOptions ?? []),
    ],
  });
}

function scopeTokenOptionsToServerConfig(
  base: GopherAgentRuntimeOptions | undefined,
  tokenOptions: GopherAgentRuntimeOptions | undefined,
  serverConfig: string,
  oauthChallenges: OAuthChallengeResult[]
): GopherAgentRuntimeOptions | undefined {
  const normalizedTokenOptions = normalizeRuntimeOptions(tokenOptions);
  if (normalizedTokenOptions?.accessToken === undefined) {
    return mergeRuntimeOptions(base, normalizedTokenOptions);
  }

  const protectedUrls = new Set(
    oauthChallenges.map((challenge) => challenge.url)
  );
  const serverOptions = extractMcpServerTargets({ serverConfig })
    .filter((target) => protectedUrls.has(target.url))
    .map((target) => ({
      ...(target.serverId !== undefined ? { serverId: target.serverId } : {}),
      ...(target.serverName !== undefined
        ? { serverName: target.serverName }
        : target.name !== undefined
          ? { serverName: target.name }
          : {}),
      url: target.url,
      accessToken: normalizedTokenOptions.accessToken,
    }));

  const { accessToken: _accessToken, ...withoutGlobalToken } =
    normalizedTokenOptions;
  return mergeRuntimeOptions(base, {
    ...withoutGlobalToken,
    serverOptions: [
      ...(normalizedTokenOptions.serverOptions ?? []),
      ...serverOptions,
    ],
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
  hooks: ResolvedOAuthHooks;
}

async function runAuthorizationCodeFlow(
  input: AuthorizationCodeFlowInput
): Promise<GopherAgentTokenRecord> {
  const codeVerifier = input.hooks.createCodeVerifier();
  const codeChallenge = input.hooks.createCodeChallenge(codeVerifier);
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

  const opened = await input.hooks.openAuthorizationUrl(authorizationUrl, {
    openBrowser: input.oauth.openBrowser,
  });
  printManualAuthorizationUrl(opened);

  const callback = await input.waitForCallback();
  logOAuthDebug('authorization callback', {
    codePresent: callback.code.length > 0,
    stateMatches: callback.state === input.state,
  });
  return await input.hooks.exchangeCodeForToken({
    code: callback.code,
    redirectUri: input.redirectUri,
    codeVerifier,
    tokenEndpoint: input.authorizationMetadata.tokenEndpoint,
    clientId: input.client.clientId,
    clientSecret: input.client.clientSecret,
    resource: input.resourceMetadata.resource,
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
