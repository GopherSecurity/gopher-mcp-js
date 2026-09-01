import { GopherAgentOAuthOptions } from './config';
import { OAuthAuthorizationServerMetadata } from './oauthDiscovery';
import { fetchOAuth, responseBodyPreview } from './oauthFetch';
import { isRecord, logOAuthDebug, stringField } from './oauthInternal';

export interface OAuthRegisteredClient {
  clientId: string;
  clientSecret?: string;
}

export interface RegisterOAuthClientInput {
  metadata: OAuthAuthorizationServerMetadata;
  redirectUri: string;
  scopes: string[];
  oauth?: GopherAgentOAuthOptions;
}

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

  logOAuthDebug('registration request', {
    registrationEndpoint: input.metadata.registrationEndpoint,
    tokenEndpoint: input.metadata.tokenEndpoint,
    clientName,
    redirectUris: [input.redirectUri],
    scope,
  });

  const response = await registerWithFetch({
    registrationEndpoint: input.metadata.registrationEndpoint,
    clientName,
    redirectUri: input.redirectUri,
    scope,
  });

  logOAuthDebug('registration response', {
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

async function registerWithFetch(input: {
  registrationEndpoint: string;
  clientName: string;
  redirectUri: string;
  scope?: string;
}): Promise<OAuthRegisteredClientResponse> {
  const response = await fetchOAuth(
    input.registrationEndpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: input.clientName,
        redirect_uris: [input.redirectUri],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        ...(input.scope !== undefined ? { scope: input.scope } : {}),
      }),
    },
    'dynamic client registration'
  );

  const bodyText = response.ok
    ? await response.text()
    : await responseBodyPreview(response);
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
