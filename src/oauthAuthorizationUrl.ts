import {
  OAuthAuthorizationServerMetadata,
  OAuthProtectedResourceMetadata,
} from './oauthDiscovery';

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
  const url = new URL(input.metadata.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  const scope = selectScopes(input);
  if (scope.length > 0) {
    url.searchParams.set('scope', scope.join(' '));
  }

  if (input.resourceMetadata?.resource) {
    url.searchParams.set('resource', input.resourceMetadata.resource);
  }

  return url.toString();
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
