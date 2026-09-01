import { GopherAgentTokenRecord } from './config';
import { AgentError } from './errors';
import { fetchOAuth } from './oauthFetch';
import {
  isRecord,
  logOAuthDebug,
  numberField,
  stringField,
} from './oauthInternal';

export interface ExchangeOAuthCodeInput {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  nowMs?: number;
}

export interface RefreshOAuthTokenInput {
  refreshToken: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  nowMs?: number;
}

export class OAuthTokenRefreshError extends AgentError {
  public readonly permanent: boolean;

  constructor(message: string, permanent: boolean) {
    super(
      message,
      permanent ? 'OAUTH_REFRESH_INVALID_GRANT' : 'OAUTH_REFRESH_FAILED'
    );
    this.name = 'OAuthTokenRefreshError';
    this.permanent = permanent;
    Object.setPrototypeOf(this, OAuthTokenRefreshError.prototype);
  }
}

interface OAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
  success: boolean;
  error?: string;
  errorDescription?: string;
}

export async function exchangeOAuthCodeForToken(
  input: ExchangeOAuthCodeInput
): Promise<GopherAgentTokenRecord> {
  logOAuthDebug('token exchange request', {
    tokenEndpoint: input.tokenEndpoint,
    clientId: input.clientId,
    clientSecretPresent: input.clientSecret !== undefined,
    redirectUri: input.redirectUri,
    codePresent: input.code.length > 0,
    codeVerifierPresent: input.codeVerifier.length > 0,
  });
  const response = await exchangeCodeWithFetch(input);
  logOAuthDebug('token exchange response', {
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
  logOAuthDebug('refresh token request', {
    tokenEndpoint: input.tokenEndpoint,
    clientId: input.clientId,
    clientSecretPresent: input.clientSecret !== undefined,
    refreshTokenPresent: input.refreshToken.length > 0,
  });
  const response = await refreshTokenWithFetch(input);
  logOAuthDebug('refresh token response', {
    success: response.success,
    tokenType: response.tokenType,
    accessTokenPresent: response.accessToken.length > 0,
    refreshTokenPresent: response.refreshToken !== undefined,
    expiresIn: response.expiresIn,
    error: response.error,
    errorDescription: response.errorDescription,
  });
  try {
    return tokenResponseToRecord(response, input.nowMs, input.refreshToken);
  } catch (e) {
    const code = response.error;
    throw new OAuthTokenRefreshError(
      (e as Error).message,
      code === 'invalid_grant' || code === 'invalid_token'
    );
  }
}

function tokenResponseToRecord(
  response: OAuthTokenResponse,
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
    ...((response.refreshToken ?? fallbackRefreshToken)
      ? { refreshToken: response.refreshToken ?? fallbackRefreshToken }
      : {}),
    tokenType: response.tokenType,
    ...(response.expiresIn > 0
      ? { expiresAt: (nowMs ?? Date.now()) + response.expiresIn * 1000 }
      : {}),
  };
}

async function exchangeCodeWithFetch(
  input: ExchangeOAuthCodeInput
): Promise<OAuthTokenResponse> {
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
): Promise<OAuthTokenResponse> {
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
): Promise<OAuthTokenResponse> {
  const response = await fetchOAuth(
    tokenEndpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    },
    'token endpoint'
  );

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
