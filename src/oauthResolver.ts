import {
  GopherAgentOAuthOptions,
  GopherAgentRuntimeOptions,
  normalizeRuntimeOptions,
} from './config';
import { probeMcpOAuthChallenge } from './oauthDiscovery';
import { extractMcpServerTargets } from './oauthServerTargets';

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

async function defaultProbeChallenge(
  url: string
): Promise<OAuthChallengeResult> {
  return probeMcpOAuthChallenge(url);
}

async function defaultAcquireToken(): Promise<GopherAgentRuntimeOptions> {
  throw new Error(
    'OAuth token acquisition is not implemented yet. Pass accessToken or headers.Authorization, or set oauth.mode to disabled.'
  );
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
