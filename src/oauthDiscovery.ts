import {
  fetchNativeOAuthAuthorizationServerMetadata,
  fetchNativeOAuthProtectedResourceMetadata,
  probeNativeMcpOAuthChallenge,
} from './ffi/auth/oauth-discovery';
import { OAuthChallengeResult } from './oauthResolver';

export interface McpOAuthChallenge extends OAuthChallengeResult {
  httpStatus: number;
  wwwAuthenticate?: string;
}

export interface OAuthProtectedResourceMetadata {
  resource: string;
  authorizationServers: string[];
  scopesSupported: string[];
  rawJson: string;
}

export interface OAuthAuthorizationServerMetadata {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
  scopesSupported: string[];
  rawJson: string;
}

export async function probeMcpOAuthChallenge(
  url: string
): Promise<McpOAuthChallenge> {
  const challenge = probeNativeMcpOAuthChallenge(url);

  if (challenge.error.length > 0) {
    throw new Error(withOAuthPrefix('oauth_metadata_missing', challenge.error));
  }
  if (challenge.requiresOAuth && challenge.resourceMetadataUrl.length === 0) {
    throw new Error(
      `oauth_metadata_missing: MCP OAuth challenge for ${url} is missing resource_metadata`
    );
  }

  return {
    url,
    requiresOAuth: challenge.requiresOAuth,
    httpStatus: challenge.httpStatus,
    ...(challenge.wwwAuthenticate.length > 0
      ? { wwwAuthenticate: challenge.wwwAuthenticate }
      : {}),
    ...(challenge.resourceMetadataUrl.length > 0
      ? { resourceMetadataUrl: challenge.resourceMetadataUrl }
      : {}),
  };
}

export async function fetchOAuthProtectedResourceMetadata(
  resourceMetadataUrl: string
): Promise<OAuthProtectedResourceMetadata> {
  const metadata =
    fetchNativeOAuthProtectedResourceMetadata(resourceMetadataUrl);
  if (metadata.error.length > 0) {
    throw new Error(
      withOAuthPrefix('oauth_metadata_fetch_failed', metadata.error)
    );
  }
  if (metadata.authorizationServers.length === 0) {
    throw new Error(
      'oauth_metadata_fetch_failed: Protected resource metadata is missing authorization_servers'
    );
  }

  return {
    resource: metadata.resource,
    authorizationServers: metadata.authorizationServers,
    scopesSupported: metadata.scopesSupported,
    rawJson: metadata.rawJson,
  };
}

export async function fetchOAuthAuthorizationServerMetadata(
  authorizationServer: string
): Promise<OAuthAuthorizationServerMetadata> {
  const metadata =
    fetchNativeOAuthAuthorizationServerMetadata(authorizationServer);
  if (metadata.error.length > 0) {
    throw new Error(
      withOAuthPrefix('oauth_server_metadata_invalid', metadata.error)
    );
  }

  return {
    issuer: metadata.issuer,
    authorizationEndpoint: metadata.authorizationEndpoint,
    tokenEndpoint: metadata.tokenEndpoint,
    ...(metadata.registrationEndpoint.length > 0
      ? { registrationEndpoint: metadata.registrationEndpoint }
      : {}),
    scopesSupported: metadata.scopesSupported,
    rawJson: metadata.rawJson,
  };
}

function withOAuthPrefix(prefix: string, message: string): string {
  return message.startsWith(`${prefix}:`) ? message : `${prefix}: ${message}`;
}
