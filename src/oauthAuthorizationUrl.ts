import {
  OAuthAuthorizationServerMetadata,
  OAuthProtectedResourceMetadata,
} from './oauthDiscovery';
import { buildNativeOAuthAuthorizationUrl } from './ffi/auth/oauth-authorization-url';

export interface OAuthAuthorizationUrlInput {
  metadata: OAuthAuthorizationServerMetadata;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes?: string[];
  resourceMetadata?: OAuthProtectedResourceMetadata;
}

export function buildOAuthAuthorizationUrl(
  input: OAuthAuthorizationUrlInput
): string {
  const scope = selectScopes(input);

  return buildNativeOAuthAuthorizationUrl({
    authorizationEndpoint: input.metadata.authorizationEndpoint,
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    state: input.state,
    codeChallenge: input.codeChallenge,
    ...(scope.length > 0 ? { scope: scope.join(' ') } : {}),
    ...(input.resourceMetadata?.resource
      ? { resource: input.resourceMetadata.resource }
      : {}),
  });
}

function selectScopes(input: OAuthAuthorizationUrlInput): string[] {
  if (input.scopes !== undefined && input.scopes.length > 0) {
    return input.scopes;
  }
  if (input.resourceMetadata?.scopesSupported.length) {
    return input.resourceMetadata.scopesSupported;
  }
  return [];
}
