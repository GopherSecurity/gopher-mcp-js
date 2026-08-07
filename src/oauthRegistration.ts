import { GopherAgentOAuthOptions } from './config';
import { OAuthAuthorizationServerMetadata } from './oauthDiscovery';
import {
  GopherOAuthClient,
  RegistrationResponse,
} from './ffi/auth/oauth-client';

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
  ): RegistrationResponse;
  destroy(): void;
}

export type OAuthRegistrationClientFactory = (
  tokenEndpoint: string
) => OAuthRegistrationClient;

export function registerOAuthClient(
  input: RegisterOAuthClientInput
): OAuthRegisteredClient {
  if (input.metadata.registrationEndpoint === undefined) {
    throw new Error(
      'oauth_registration_required: Authorization server metadata has no registration_endpoint and caller-provided client metadata is not supported yet.'
    );
  }

  const clientName = input.oauth?.clientName ?? 'gopher-mcp-js';
  const scope = input.scopes.length > 0 ? input.scopes.join(' ') : undefined;
  const clientFactory = input.clientFactory ?? defaultRegistrationClientFactory;
  const client = clientFactory(input.metadata.tokenEndpoint);

  try {
    const response = client.registerClient(
      input.metadata.registrationEndpoint,
      clientName,
      [input.redirectUri],
      scope
    );
    if (!response.success || response.clientId.length === 0) {
      throw new Error(
        `oauth_registration_failed: ${response.error ?? 'Dynamic client registration failed'}`
      );
    }
    return {
      clientId: response.clientId,
      ...(response.clientSecret ? { clientSecret: response.clientSecret } : {}),
    };
  } finally {
    client.destroy();
  }
}

function defaultRegistrationClientFactory(
  tokenEndpoint: string
): OAuthRegistrationClient {
  return new GopherOAuthClient(tokenEndpoint, '', undefined, 30);
}
