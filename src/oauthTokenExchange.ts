import { GopherAgentTokenRecord } from './config';
import { TokenResponse } from './ffi/auth/oauth-client';

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

export async function exchangeOAuthCodeForToken(
  input: ExchangeOAuthCodeInput
): Promise<GopherAgentTokenRecord> {
  logOAuthTokenDebug('token exchange request', {
    tokenEndpoint: input.tokenEndpoint,
    clientId: input.clientId,
    clientSecretPresent: input.clientSecret !== undefined,
    redirectUri: input.redirectUri,
    codePresent: input.code.length > 0,
    codeVerifierPresent: input.codeVerifier.length > 0,
  });
  const response =
    input.clientFactory !== undefined
      ? exchangeCodeWithClientFactory(input, input.clientFactory)
      : await exchangeCodeWithFetch(input);
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
}

export async function refreshOAuthToken(
  input: RefreshOAuthTokenInput
): Promise<GopherAgentTokenRecord> {
  logOAuthTokenDebug('refresh token request', {
    tokenEndpoint: input.tokenEndpoint,
    clientId: input.clientId,
    clientSecretPresent: input.clientSecret !== undefined,
    refreshTokenPresent: input.refreshToken.length > 0,
  });
  const response =
    input.clientFactory !== undefined
      ? refreshTokenWithClientFactory(input, input.clientFactory)
      : await refreshTokenWithFetch(input);
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

function exchangeCodeWithClientFactory(
  input: ExchangeOAuthCodeInput,
  clientFactory: OAuthTokenExchangeClientFactory
): TokenResponse {
  const client = clientFactory(
    input.tokenEndpoint,
    input.clientId,
    input.clientSecret
  );
  try {
    return client.exchangeCode(
      input.code,
      input.redirectUri,
      input.codeVerifier
    );
  } finally {
    client.destroy();
  }
}

function refreshTokenWithClientFactory(
  input: RefreshOAuthTokenInput,
  clientFactory: OAuthTokenExchangeClientFactory
): TokenResponse {
  const client = clientFactory(
    input.tokenEndpoint,
    input.clientId,
    input.clientSecret
  );
  try {
    return client.refreshToken(input.refreshToken);
  } finally {
    client.destroy();
  }
}

async function exchangeCodeWithFetch(
  input: ExchangeOAuthCodeInput
): Promise<TokenResponse> {
  return requestToken({
    tokenEndpoint: input.tokenEndpoint,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    fields: {
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    },
  });
}

async function refreshTokenWithFetch(
  input: RefreshOAuthTokenInput
): Promise<TokenResponse> {
  return requestToken({
    tokenEndpoint: input.tokenEndpoint,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    fields: {
      grant_type: 'refresh_token',
      refresh_token: input.refreshToken,
    },
  });
}

async function requestToken(input: {
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  fields: Record<string, string>;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    ...input.fields,
    client_id: input.clientId,
    ...(input.clientSecret !== undefined
      ? { client_secret: input.clientSecret }
      : {}),
  });
  const response = await fetch(input.tokenEndpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const text = await response.text();
  let json: Record<string, unknown> = {};
  if (text.length > 0) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
      ) {
        json = parsed as Record<string, unknown>;
      }
    } catch {
      return {
        success: false,
        accessToken: '',
        tokenType: '',
        expiresIn: 0,
        errorDescription: `Invalid JSON response from token endpoint: ${text.slice(0, 200)}`,
      };
    }
  }
  return {
    success: response.ok && stringField(json.access_token).length > 0,
    accessToken: stringField(json.access_token),
    ...(stringField(json.refresh_token).length > 0
      ? { refreshToken: stringField(json.refresh_token) }
      : {}),
    tokenType: stringField(json.token_type) || 'Bearer',
    expiresIn: numberField(json.expires_in),
    ...(stringField(json.scope).length > 0
      ? { scope: stringField(json.scope) }
      : {}),
    ...(stringField(json.error).length > 0
      ? { error: stringField(json.error) }
      : {}),
    ...(stringField(json.error_description).length > 0
      ? { errorDescription: stringField(json.error_description) }
      : {}),
    ...(!response.ok && stringField(json.error).length === 0
      ? {
          errorDescription: `HTTP request failed with status ${response.status}`,
        }
      : {}),
  };
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function logOAuthTokenDebug(label: string, values: unknown): void {
  if (process.env.GOPHER_MCP_OAUTH_DEBUG !== '1' && process.env.DEBUG !== '1') {
    return;
  }
  process.stderr.write(
    `[gopher-mcp-js oauth] ${label}: ${JSON.stringify(values)}\n`
  );
}
