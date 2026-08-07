import { GopherAgentTokenRecord } from './config';
import { GopherOAuthClient, TokenResponse } from './ffi/auth/oauth-client';

export interface ExchangeOAuthCodeInput {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  nowMs?: number;
  clientFactory?: OAuthTokenExchangeClientFactory;
}

export interface RefreshOAuthTokenInput {
  refreshToken: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  nowMs?: number;
  clientFactory?: OAuthTokenExchangeClientFactory;
}

export interface OAuthTokenExchangeClient {
  exchangeCode(
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): TokenResponse;
  refreshToken(refreshToken: string): TokenResponse;
  destroy(): void;
}

export type OAuthTokenExchangeClientFactory = (
  tokenEndpoint: string,
  clientId: string,
  clientSecret?: string
) => OAuthTokenExchangeClient;

export function exchangeOAuthCodeForToken(
  input: ExchangeOAuthCodeInput
): GopherAgentTokenRecord {
  logOAuthTokenDebug('token exchange request', {
    tokenEndpoint: input.tokenEndpoint,
    clientId: input.clientId,
    clientSecretPresent: input.clientSecret !== undefined,
    redirectUri: input.redirectUri,
    codePresent: input.code.length > 0,
    codeVerifierPresent: input.codeVerifier.length > 0,
  });
  const clientFactory =
    input.clientFactory ?? defaultTokenExchangeClientFactory;
  const client = clientFactory(
    input.tokenEndpoint,
    input.clientId,
    input.clientSecret
  );

  try {
    const response = client.exchangeCode(
      input.code,
      input.redirectUri,
      input.codeVerifier
    );
    logOAuthTokenDebug('token exchange response', {
      success: response.success,
      tokenType: response.tokenType,
      accessTokenPresent: response.accessToken.length > 0,
      refreshTokenPresent: response.refreshToken !== undefined,
      expiresIn: response.expiresIn,
      error: response.error,
      errorDescription: response.errorDescription,
    });
    return tokenResponseToRecord(response, input.nowMs);
  } finally {
    client.destroy();
  }
}

export function refreshOAuthToken(
  input: RefreshOAuthTokenInput
): GopherAgentTokenRecord {
  logOAuthTokenDebug('refresh token request', {
    tokenEndpoint: input.tokenEndpoint,
    clientId: input.clientId,
    clientSecretPresent: input.clientSecret !== undefined,
    refreshTokenPresent: input.refreshToken.length > 0,
  });
  const clientFactory =
    input.clientFactory ?? defaultTokenExchangeClientFactory;
  const client = clientFactory(
    input.tokenEndpoint,
    input.clientId,
    input.clientSecret
  );

  try {
    const response = client.refreshToken(input.refreshToken);
    logOAuthTokenDebug('refresh token response', {
      success: response.success,
      tokenType: response.tokenType,
      accessTokenPresent: response.accessToken.length > 0,
      refreshTokenPresent: response.refreshToken !== undefined,
      expiresIn: response.expiresIn,
      error: response.error,
      errorDescription: response.errorDescription,
    });
    return tokenResponseToRecord(response, input.nowMs);
  } finally {
    client.destroy();
  }
}

function tokenResponseToRecord(
  response: TokenResponse,
  nowMs?: number
): GopherAgentTokenRecord {
  if (!response.success || response.accessToken.length === 0) {
    const detail =
      response.errorDescription ??
      response.error ??
      'OAuth token request failed';
    throw new Error(`oauth_token_exchange_failed: ${detail}`);
  }

  return {
    accessToken: response.accessToken,
    ...(response.refreshToken ? { refreshToken: response.refreshToken } : {}),
    tokenType: response.tokenType,
    ...(response.expiresIn > 0
      ? { expiresAt: (nowMs ?? Date.now()) + response.expiresIn * 1000 }
      : {}),
  };
}

function defaultTokenExchangeClientFactory(
  tokenEndpoint: string,
  clientId: string,
  clientSecret?: string
): OAuthTokenExchangeClient {
  return new GopherOAuthClient(tokenEndpoint, clientId, clientSecret, 30);
}

function logOAuthTokenDebug(label: string, values: unknown): void {
  if (process.env.GOPHER_MCP_OAUTH_DEBUG !== '1' && process.env.DEBUG !== '1') {
    return;
  }
  process.stderr.write(
    `[gopher-mcp-js oauth] ${label}: ${JSON.stringify(values)}\n`
  );
}
