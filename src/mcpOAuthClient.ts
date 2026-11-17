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

/** Persist privately with the token. Never expose client secrets to frontend code. */
export interface McpOAuthGrant {
  issuer: string;
  revocationEndpoint?: string;
  clientId: string;
  clientSecret?: string;
  tokenEndpointAuthMethod?: string;
}

export interface McpOAuthTokenRecord extends GopherAgentTokenRecord {
  grant: McpOAuthGrant;
}

/** Server-side authorization state. Contains secrets; keep private and never log. */
export interface McpOAuthPendingAuthorization extends McpOAuthGrant {
  serverUrl: string;
  redirectUri: string;
  state: string;
  codeVerifier: string;
  tokenEndpoint: string;
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
        issuer: metadata.issuer,
        revocationEndpoint: metadata.revocationEndpoint,
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
  ): Promise<McpOAuthTokenRecord> {
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
    const grant: McpOAuthGrant = {
      issuer: pending.issuer,
      revocationEndpoint: pending.revocationEndpoint,
      clientId: pending.clientId,
      clientSecret: pending.clientSecret,
      tokenEndpointAuthMethod: pending.tokenEndpointAuthMethod,
    };
    this.assertGrant(grant);
    return this.run(async () => {
      const tokens = await exchangeOAuthCodeForToken({
        code: callback.code,
        redirectUri: pending.redirectUri,
        codeVerifier: pending.codeVerifier,
        tokenEndpoint: pending.tokenEndpoint,
        clientId: pending.clientId,
        clientSecret: pending.clientSecret,
        tokenEndpointAuthMethod: pending.tokenEndpointAuthMethod,
        resource: pending.resource ?? pending.serverUrl,
      });
      return { ...tokens, grant };
    });
  }

  /** Revoke using private grant data saved at authorization time, without discovery. */
  async revoke(grant: McpOAuthGrant, accessToken: string): Promise<boolean>;
  /** @deprecated URL-only revocation is unsafe and throws OAUTH_GRANT_REQUIRED. */
  async revoke(serverUrl: string, accessToken: string): Promise<boolean>;
  async revoke(
    grant: McpOAuthGrant | string,
    accessToken: string
  ): Promise<boolean> {
    this.assertGrant(grant);
    const stored = grant;
    const { issuer, revocationEndpoint, clientId, clientSecret } = stored;
    const method =
      stored.tokenEndpointAuthMethod ??
      (clientSecret ? 'client_secret_basic' : 'none');
    if (
      !['none', 'client_secret_basic', 'client_secret_post'].includes(method)
    ) {
      throw new AgentError(
        'Unsupported OAuth client authentication method.',
        'OAUTH_CLIENT_AUTH_UNSUPPORTED'
      );
    }
    if (
      method !== 'none' &&
      (typeof clientSecret !== 'string' || clientSecret.length === 0)
    ) {
      throw new AgentError(
        'OAuth revocation requires the registered client secret.',
        'OAUTH_CLIENT_AUTH_REQUIRED'
      );
    }
    if (!revocationEndpoint) return false;
    this.assertRevocationEndpoint(issuer, revocationEndpoint);
    const params = new URLSearchParams({
      token: accessToken,
      token_type_hint: 'access_token',
    });
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    if (method === 'client_secret_basic') {
      const encode = (value: string) =>
        new URLSearchParams({ value }).toString().slice('value='.length);
      headers.Authorization = `Basic ${Buffer.from(`${encode(clientId)}:${encode(clientSecret!)}`).toString('base64')}`;
    } else {
      params.set('client_id', clientId);
      if (method === 'client_secret_post')
        params.set('client_secret', clientSecret!);
    }
    return this.run(async () => {
      const response = await fetchOAuth(
        revocationEndpoint,
        {
          method: 'POST',
          headers,
          body: params,
        },
        'token revocation'
      );
      await response.body?.cancel();
      return response.status === 200;
    });
  }

  private assertGrant(
    grant: McpOAuthGrant | string
  ): asserts grant is McpOAuthGrant {
    if (
      !grant ||
      typeof grant !== 'object' ||
      typeof grant.issuer !== 'string' ||
      grant.issuer.length === 0 ||
      typeof grant.clientId !== 'string' ||
      grant.clientId.length === 0
    ) {
      throw new AgentError(
        'OAuth revocation requires stored grant data from authorization. Reauthorize grants saved without issuer data.',
        'OAUTH_GRANT_REQUIRED'
      );
    }
    this.assertEndpoint(grant.issuer);
    if (grant.revocationEndpoint !== undefined)
      this.assertRevocationEndpoint(grant.issuer, grant.revocationEndpoint);
  }

  private assertRevocationEndpoint(issuer: string, endpoint: string): void {
    this.assertEndpoint(issuer);
    this.assertEndpoint(endpoint);
    const source = new URL(issuer);
    const target = new URL(endpoint);
    if (
      source.username ||
      source.password ||
      source.hash ||
      source.search ||
      target.username ||
      target.password ||
      target.hash ||
      target.origin !== source.origin
    ) {
      throw new AgentError(
        'OAuth revocation endpoint must belong to the stored issuer origin.',
        'OAUTH_REVOCATION_ENDPOINT_INVALID'
      );
    }
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
    ]) {
      if (endpoint) this.assertEndpoint(endpoint);
    }
    if (metadata.revocationEndpoint !== undefined) {
      try {
        this.assertRevocationEndpoint(
          metadata.issuer,
          metadata.revocationEndpoint
        );
      } catch {
        // Revocation is optional: unsupported destinations must not prevent
        // sign-in, and must never be retained for later token submission.
        metadata.revocationEndpoint = undefined;
      }
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
