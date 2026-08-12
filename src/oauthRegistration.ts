import { GopherAgentOAuthOptions } from './config';
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

  const response =
    input.clientFactory !== undefined
      ? registerWithClientFactory({
          clientFactory: input.clientFactory,
          tokenEndpoint: input.metadata.tokenEndpoint,
          registrationEndpoint: input.metadata.registrationEndpoint,
          clientName,
          redirectUri: input.redirectUri,
          scope,
        })
      : await registerWithFetch({
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

async function registerWithFetch(input: {
  registrationEndpoint: string;
  clientName: string;
  redirectUri: string;
  scope?: string;
}): Promise<OAuthRegisteredClientResponse> {
  const response = await fetch(input.registrationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: input.clientName,
      redirect_uris: [input.redirectUri],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      ...(input.scope !== undefined ? { scope: input.scope } : {}),
    }),
  });

  const bodyText = await response.text();
  let body: unknown;
  try {
    body = bodyText.length > 0 ? JSON.parse(bodyText) : {};
  } catch (e) {
    return {
      clientId: '',
      success: false,
      error: `invalid_registration_response: ${(e as Error).message}`,
    };
  }

  if (!isRecord(body)) {
    return {
      clientId: '',
      success: false,
      error: 'invalid_registration_response',
    };
  }

  if (!response.ok) {
    return {
      clientId: '',
      success: false,
      error: stringField(body, 'error') ?? `HTTP ${response.status}`,
    };
  }

  return {
    clientId: stringField(body, 'client_id') ?? '',
    ...(stringField(body, 'client_secret') !== undefined
      ? { clientSecret: stringField(body, 'client_secret') }
      : {}),
    success: stringField(body, 'client_id') !== undefined,
    ...(stringField(body, 'error') !== undefined
      ? { error: stringField(body, 'error') }
      : {}),
  };
}

function stringField(
  value: Record<string, unknown>,
  field: string
): string | undefined {
  const fieldValue = value[field];
  return typeof fieldValue === 'string' ? fieldValue : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function logOAuthRegistrationDebug(label: string, values: unknown): void {
  if (process.env.GOPHER_MCP_OAUTH_DEBUG !== '1' && process.env.DEBUG !== '1') {
    return;
  }
  process.stderr.write(
    `[gopher-mcp-js oauth] ${label}: ${JSON.stringify(values)}\n`
  );
}
