import { timingSafeEqual } from 'node:crypto';
import type { GopherAgentTokenRecord } from './config';
import { AgentError } from './errors';
import { buildOAuthAuthorizationUrl } from './oauthAuthorizationUrl';
import {
  fetchOAuthAuthorizationServerMetadata,
  fetchOAuthProtectedResourceMetadata,
  probeMcpOAuthChallenge,
} from './oauthDiscovery';
import { fetchOAuth, McpHttpRequest, withOAuthRequest } from './oauthFetch';
import { createCodeChallenge, createCodeVerifier } from './oauthPkce';
import { registerOAuthClient } from './oauthRegistration';
import { exchangeOAuthCodeForToken } from './oauthTokenExchange';

export interface McpOAuthClientOptions {
  /** Optional application HTTP adapter, e.g. to enforce an outbound URL policy. */
  request?: McpHttpRequest;
  clientName?: string;
  scopes?: string[];
  /** Local development only. Production OAuth endpoints require HTTPS. */
  allowInsecureHttp?: boolean;
}

/** Server-side authorization state. Contains secrets; keep private and never log. */
export interface McpOAuthPendingAuthorization {
  serverUrl: string;
  redirectUri: string;
  state: string;
  codeVerifier: string;
  clientId: string;
  clientSecret?: string;
  tokenEndpoint: string;
  tokenEndpointAuthMethod?: string;
  resource: string;
}

/**
 * MCP OAuth for web apps that own their callback endpoint. The application
 * stores pending state privately and presents the URL; the SDK owns the protocol.
 * Agent factories remain the default when an SDK-managed callback is suitable.
 */
export class McpOAuthClient {
  constructor(private readonly options: McpOAuthClientOptions = {}) {}

  async start(
    serverUrl: string,
    redirectUri: string
  ): Promise<{
    authorizeUrl: string;
    pending: McpOAuthPendingAuthorization;
  }> {
    // A redirect URI is a browser destination, not an outbound metadata request.
    const redirect = new URL(redirectUri);
    if (!['http:', 'https:'].includes(redirect.protocol) || redirect.hash) {
      throw new AgentError(
        'OAuth redirect URI must be an HTTP(S) URL without a fragment.',
        'OAUTH_REDIRECT_URI_INVALID'
      );
    }
    return this.run(async () => {
      const { resource, metadata } = await this.discover(serverUrl);
      const scopes = this.options.scopes ?? resource.scopesSupported;
      const client = await registerOAuthClient({
        metadata,
        redirectUri,
        scopes,
        oauth: { clientName: this.options.clientName },
      });
      if (
        client.tokenEndpointAuthMethod &&
        !['none', 'client_secret_post', 'client_secret_basic'].includes(
          client.tokenEndpointAuthMethod
        )
      ) {
        throw new AgentError(
          'Unsupported OAuth client authentication method.',
          'OAUTH_CLIENT_AUTH_UNSUPPORTED'
        );
      }
      const codeVerifier = createCodeVerifier();
      const state = createCodeVerifier();
      const pending: McpOAuthPendingAuthorization = {
        serverUrl,
        redirectUri,
        state,
        codeVerifier,
        clientId: client.clientId,
        clientSecret: client.clientSecret,
        tokenEndpoint: metadata.tokenEndpoint,
        // RFC 7591 defaults a confidential registration to Basic authentication.
        tokenEndpointAuthMethod:
          client.tokenEndpointAuthMethod ??
          (client.clientSecret ? 'client_secret_basic' : 'none'),
        resource: resource.resource,
      };
      return {
        authorizeUrl: buildOAuthAuthorizationUrl({
          metadata,
          clientId: client.clientId,
          redirectUri,
          state,
          codeChallenge: createCodeChallenge(codeVerifier),
          scopes,
          resourceMetadata: resource,
        }),
        pending,
      };
    });
  }

  async exchange(
    pending: McpOAuthPendingAuthorization,
    callback: { code: string; state: string }
  ): Promise<GopherAgentTokenRecord> {
    const actual = Buffer.from(callback.state);
    const expected = Buffer.from(pending.state);
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new AgentError(
        'OAuth state mismatch. Start the flow again.',
        'OAUTH_STATE_MISMATCH'
      );
    }
    return this.run(() =>
      exchangeOAuthCodeForToken({
        code: callback.code,
        redirectUri: pending.redirectUri,
        codeVerifier: pending.codeVerifier,
        tokenEndpoint: pending.tokenEndpoint,
        clientId: pending.clientId,
        clientSecret: pending.clientSecret,
        tokenEndpointAuthMethod: pending.tokenEndpointAuthMethod,
        resource: pending.resource ?? pending.serverUrl,
      })
    );
  }

  /** Best effort at the application boundary: callers decide how to handle errors. */
  async revoke(serverUrl: string, accessToken: string): Promise<boolean> {
    return this.run(async () => {
      const { metadata } = await this.discover(serverUrl);
      if (!metadata.revocationEndpoint) return false;
      const response = await fetchOAuth(
        metadata.revocationEndpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            token: accessToken,
            token_type_hint: 'access_token',
          }),
        },
        'token revocation'
      );
      await response.body?.cancel();
      return response.ok;
    });
  }

  private async discover(serverUrl: string) {
    const challenge = await probeMcpOAuthChallenge(serverUrl);
    if (!challenge.requiresOAuth || !challenge.resourceMetadataUrl) {
      throw new AgentError(
        'The MCP server did not advertise OAuth resource metadata.',
        'OAUTH_METADATA_MISSING'
      );
    }
    const resource = await fetchOAuthProtectedResourceMetadata(
      challenge.resourceMetadataUrl
    );
    // RFC 9728 sections 3.3 and 6 require exact identifier equality.
    // Never acquire a victim resource's token on behalf of a different MCP URL.
    if (resource.resource !== serverUrl) {
      throw new AgentError(
        'OAuth protected resource metadata does not match the requested MCP resource.',
        'OAUTH_RESOURCE_MISMATCH'
      );
    }
    const authorizationServer = resource.authorizationServers[0]!;
    const metadata =
      await fetchOAuthAuthorizationServerMetadata(authorizationServer);
    // RFC 8414 sections 3.3 and 4 also forbid normalizing issuer identifiers.
    // Apply this after either OAuth metadata or the OIDC discovery fallback.
    if (metadata.issuer !== authorizationServer) {
      throw new AgentError(
        'OAuth authorization server metadata does not match the advertised issuer.',
        'OAUTH_ISSUER_MISMATCH'
      );
    }
    // Validate destinations before issuing a registration or exposing a browser URL.
    for (const endpoint of [
      metadata.authorizationEndpoint,
      metadata.tokenEndpoint,
      metadata.registrationEndpoint,
      metadata.revocationEndpoint,
    ]) {
      if (endpoint) this.assertEndpoint(endpoint);
    }
    return { resource, metadata };
  }

  private assertEndpoint(url: string): void {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' &&
      !(this.options.allowInsecureHttp && parsed.protocol === 'http:')
    ) {
      throw new AgentError(
        'OAuth endpoint must use HTTPS.',
        'OAUTH_ENDPOINT_INVALID'
      );
    }
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    return withOAuthRequest((url, init) => {
      this.assertEndpoint(url);
      return (this.options.request ?? fetch)(url, {
        ...init,
        redirect: 'manual',
      });
    }, operation);
  }
}
