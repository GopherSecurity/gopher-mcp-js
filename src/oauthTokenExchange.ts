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

export interface OAuthTokenExchangeClient {
  exchangeCode(
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): TokenResponse;
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
    if (!response.success || response.accessToken.length === 0) {
      const detail =
        response.errorDescription ??
        response.error ??
        'OAuth authorization code exchange failed';
      throw new Error(`oauth_token_exchange_failed: ${detail}`);
    }

    return {
      accessToken: response.accessToken,
      ...(response.refreshToken ? { refreshToken: response.refreshToken } : {}),
      tokenType: response.tokenType,
      ...(response.expiresIn > 0
        ? { expiresAt: (input.nowMs ?? Date.now()) + response.expiresIn * 1000 }
        : {}),
    };
  } finally {
    client.destroy();
  }
}

function defaultTokenExchangeClientFactory(
  tokenEndpoint: string,
  clientId: string,
  clientSecret?: string
): OAuthTokenExchangeClient {
  return new GopherOAuthClient(tokenEndpoint, clientId, clientSecret, 30);
}
