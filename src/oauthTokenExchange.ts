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
  return tokenResponseToRecord(response, input.nowMs, input.refreshToken);
}

function tokenResponseToRecord(
  response: TokenResponse,
  nowMs?: number,
  fallbackRefreshToken?: string
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
    ...(response.refreshToken ?? fallbackRefreshToken
      ? { refreshToken: response.refreshToken ?? fallbackRefreshToken }
      : {}),
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
  return tokenRequestWithFetch(input.tokenEndpoint, {
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    ...(input.clientSecret !== undefined
      ? { client_secret: input.clientSecret }
      : {}),
    ...(input.codeVerifier.length > 0
      ? { code_verifier: input.codeVerifier }
      : {}),
  });
}

async function refreshTokenWithFetch(
  input: RefreshOAuthTokenInput
): Promise<TokenResponse> {
  return tokenRequestWithFetch(input.tokenEndpoint, {
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    ...(input.clientSecret !== undefined
      ? { client_secret: input.clientSecret }
      : {}),
  });
}

async function tokenRequestWithFetch(
  tokenEndpoint: string,
  params: Record<string, string>
): Promise<TokenResponse> {
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });

  const bodyText = await response.text();
  let body: unknown;
  try {
    body = bodyText.length > 0 ? JSON.parse(bodyText) : {};
  } catch (e) {
    return {
      accessToken: '',
      expiresIn: 0,
      tokenType: 'Bearer',
      success: false,
      error: 'invalid_token_response',
      errorDescription: (e as Error).message,
    };
  }

  if (!isRecord(body)) {
    return {
      accessToken: '',
      expiresIn: 0,
      tokenType: 'Bearer',
      success: false,
      error: 'invalid_token_response',
    };
  }

  return {
    accessToken: stringField(body, 'access_token') ?? '',
    ...(stringField(body, 'refresh_token') !== undefined
      ? { refreshToken: stringField(body, 'refresh_token') }
      : {}),
    expiresIn: numberField(body, 'expires_in') ?? 0,
    tokenType: stringField(body, 'token_type') ?? 'Bearer',
    success: response.ok && stringField(body, 'access_token') !== undefined,
    ...(stringField(body, 'error') !== undefined
      ? { error: stringField(body, 'error') }
      : {}),
    ...(stringField(body, 'error_description') !== undefined
      ? { errorDescription: stringField(body, 'error_description') }
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

function numberField(
  value: Record<string, unknown>,
  field: string
): number | undefined {
  const fieldValue = value[field];
  if (typeof fieldValue === 'number') {
    return fieldValue;
  }
  if (typeof fieldValue === 'string' && fieldValue.trim().length > 0) {
    const parsed = Number(fieldValue);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function logOAuthTokenDebug(label: string, values: unknown): void {
  if (process.env.GOPHER_MCP_OAUTH_DEBUG !== '1' && process.env.DEBUG !== '1') {
    return;
  }
  process.stderr.write(
    `[gopher-mcp-js oauth] ${label}: ${JSON.stringify(values)}\n`
  );
}
