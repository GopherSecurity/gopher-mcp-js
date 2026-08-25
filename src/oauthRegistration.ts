import { GopherAgentOAuthOptions } from './config';
import { GopherOAuthClient } from './ffi/auth/oauth-client';
import { OAuthAuthorizationServerMetadata } from './oauthDiscovery';

export interface OAuthRegisteredClient {
  clientId: string;
  clientSecret?: string;
}

export interface RegisterOAuthClientInput {
  metadata: OAuthAuthorizationServerMetadata;
  redirectUri: string;
  scopes: string[];
  oauth?: GopherAgentOAuthOptions;
  clientFactory?: OAuthRegistrationClientFactory;
}

export interface OAuthRegistrationClient {
  registerClient(
    registrationEndpoint: string,
    clientName: string,
    redirectUris: string[],
    scopes?: string
  ): OAuthRegisteredClientResponse;
  destroy(): void;
}

export type OAuthRegistrationClientFactory = (
  tokenEndpoint: string
) => OAuthRegistrationClient;

export interface OAuthRegisteredClientResponse {
  clientId: string;
  clientSecret?: string;
  success: boolean;
  error?: string;
}

export async function registerOAuthClient(
  input: RegisterOAuthClientInput
): Promise<OAuthRegisteredClient> {
  if (input.metadata.registrationEndpoint === undefined) {
    throw new Error(
      'oauth_registration_required: Authorization server metadata has no registration_endpoint and caller-provided client metadata is not supported yet.'
    );
  }

  const clientName = input.oauth?.clientName ?? 'gopher-mcp-js';
  const scope = input.scopes.length > 0 ? input.scopes.join(' ') : undefined;

  logOAuthRegistrationDebug('registration request', {
    registrationEndpoint: input.metadata.registrationEndpoint,
    tokenEndpoint: input.metadata.tokenEndpoint,
    clientName,
    redirectUris: [input.redirectUri],
    scope,
  });

  const response = registerWithClientFactory({
    clientFactory: input.clientFactory ?? createNativeOAuthRegistrationClient,
    tokenEndpoint: input.metadata.tokenEndpoint,
    registrationEndpoint: input.metadata.registrationEndpoint,
    clientName,
    redirectUri: input.redirectUri,
    scope,
  });

  logOAuthRegistrationDebug('registration response', {
    success: response.success,
    clientId: response.clientId,
    clientSecretPresent: response.clientSecret !== undefined,
    error: response.error,
  });
  if (!response.success || response.clientId.length === 0) {
    throw new Error(
      `oauth_registration_failed: ${response.error ?? 'Dynamic client registration failed'}`
    );
  }
  return {
    clientId: response.clientId,
    ...(response.clientSecret ? { clientSecret: response.clientSecret } : {}),
  };
}

function registerWithClientFactory(input: {
  clientFactory: OAuthRegistrationClientFactory;
  tokenEndpoint: string;
  registrationEndpoint: string;
  clientName: string;
  redirectUri: string;
  scope?: string;
}): OAuthRegisteredClientResponse {
  const client = input.clientFactory(input.tokenEndpoint);
  try {
    return client.registerClient(
      input.registrationEndpoint,
      input.clientName,
      [input.redirectUri],
      input.scope
    );
  } finally {
    client.destroy();
  }
}

function createNativeOAuthRegistrationClient(
  tokenEndpoint: string
): OAuthRegistrationClient {
  return new GopherOAuthClient(tokenEndpoint, '');
}

function logOAuthRegistrationDebug(label: string, values: unknown): void {
  if (process.env.GOPHER_MCP_OAUTH_DEBUG !== '1' && process.env.DEBUG !== '1') {
    return;
  }
  process.stderr.write(
    `[gopher-mcp-js oauth] ${label}: ${JSON.stringify(values)}\n`
  );
}
