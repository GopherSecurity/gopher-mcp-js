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

  const resourceMetadata = await flowHooks.fetchProtectedResourceMetadata(
    challenge.resourceMetadataUrl
  );
  const authorizationServer = selectAuthorizationServer(
    challenge,
    resourceMetadata
  );
  const authorizationMetadata =
    await flowHooks.fetchAuthorizationServerMetadata(authorizationServer);
  const scopes = selectScopes(oauth, resourceMetadata, authorizationMetadata);
  const state = createOAuthState();
  const loopback = await flowHooks.createLoopbackCallbackServer({
    state,
  });

  try {
    const client = flowHooks.registerClient({
      metadata: authorizationMetadata,
      redirectUri: loopback.redirectUri,
      scopes,
      oauth,
    });
    const cacheKey = createOAuthTokenCacheKey({
      resource: resourceMetadata.resource,
      issuer: authorizationMetadata.issuer,
      clientId: client.clientId,
      scopes,
    });

    const token = await resolveOAuthTokenFromStore({
      store: oauth.tokenStore ?? defaultTokenStore,
      key: cacheKey,
      refreshToken: async (existingRefreshToken) =>
        await flowHooks.refreshToken({
          refreshToken: existingRefreshToken,
          tokenEndpoint: authorizationMetadata.tokenEndpoint,
          clientId: client.clientId,
          clientSecret: client.clientSecret,
        }),
      acquireToken: () =>
        runAuthorizationCodeFlow({
          oauth,
          resourceMetadata,
          authorizationMetadata,
          client,
          redirectUri: loopback.redirectUri,
          waitForCallback: loopback.waitForCallback,
          state,
        }),
    });

    return mergeOAuthTokenIntoRuntimeOptions(undefined, token);
  } finally {
    await loopback.close();
  }
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
  const codeChallenge = await flowHooks.createCodeChallenge(codeVerifier);
  const authorizationUrl = buildOAuthAuthorizationUrl({
    metadata: input.authorizationMetadata,
    clientId: input.client.clientId,
    redirectUri: input.redirectUri,
    state: input.state,
    codeChallenge,
    scopes: input.oauth.scopes,
    resourceMetadata: input.resourceMetadata,
  });

  const opened = await flowHooks.openAuthorizationUrl(authorizationUrl, {
    openBrowser: input.oauth.openBrowser,
  });
  printManualAuthorizationUrl(opened);

  const callback = await input.waitForCallback();
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
