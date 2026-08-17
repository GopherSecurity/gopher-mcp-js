export const GOOGLE_OAUTH_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export const GMAIL_REFRESH_TOKEN_ENV_VARS = [
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_GMAIL_REFRESH_TOKEN',
] as const;

type Env = Record<string, string | undefined>;

export interface GmailOAuthRefreshTokenEnv {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface GmailOAuthAccessToken {
  accessToken: string;
  tokenType: string;
}

export interface RefreshGmailAccessTokenOptions {
  env?: Env;
  fetchImpl?: typeof fetch;
  tokenEndpoint?: string;
}

export async function refreshGmailAccessTokenFromEnv(
  options: RefreshGmailAccessTokenOptions = {}
): Promise<GmailOAuthAccessToken> {
  const env = readGmailRefreshTokenEnv(options.env ?? process.env);
  const tokenEndpoint = options.tokenEndpoint ?? GOOGLE_OAUTH_TOKEN_ENDPOINT;
  const fetchImpl = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: env.refreshToken,
        client_id: env.clientId,
        client_secret: env.clientSecret,
      }),
    });
  } catch (error) {
    throw new Error(
      `gmail_oauth_refresh_failed: Google token endpoint request failed: ${errorMessage(error)}`
    );
  }

  const body = await parseJsonResponse(response);
  const oauthError = stringField(body, 'error');
  if (!response.ok) {
    throw new Error(
      `gmail_oauth_refresh_failed: Google token endpoint returned HTTP ${response.status}${formatOAuthError(oauthError)}`
    );
  }
  if (oauthError !== undefined) {
    throw new Error(
      `gmail_oauth_refresh_failed: Google token endpoint returned OAuth error ${oauthError}`
    );
  }

  const accessToken = stringField(body, 'access_token');
  if (accessToken === undefined || accessToken.length === 0) {
    throw new Error(
      'gmail_oauth_refresh_failed: Google token response missing access_token'
    );
  }

  const tokenType = stringField(body, 'token_type');
  if (tokenType === undefined || tokenType.length === 0) {
    throw new Error(
      'gmail_oauth_refresh_failed: Google token response missing token_type'
    );
  }

  return { accessToken, tokenType };
}

export function readGmailRefreshTokenEnv(
  env: Env = process.env
): GmailOAuthRefreshTokenEnv {
  const missing = GMAIL_REFRESH_TOKEN_ENV_VARS.filter(
    (name) => env[name] === undefined || env[name]?.trim().length === 0
  );

  if (missing.length > 0) {
    throw new Error(
      `gmail_oauth_refresh_env_missing: ${unique(missing).join(', ')}`
    );
  }

  return {
    clientId: env.GOOGLE_OAUTH_CLIENT_ID as string,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET as string,
    refreshToken: env.GOOGLE_GMAIL_REFRESH_TOKEN as string,
  };
}

async function parseJsonResponse(
  response: Pick<Response, 'text'>
): Promise<Record<string, unknown>> {
  const bodyText = await response.text();
  let body: unknown;
  try {
    body = bodyText.length > 0 ? JSON.parse(bodyText) : {};
  } catch (error) {
    throw new Error(
      `gmail_oauth_refresh_failed: Google token response was not valid JSON: ${errorMessage(error)}`
    );
  }

  if (!isRecord(body)) {
    throw new Error(
      'gmail_oauth_refresh_failed: Google token response was not a JSON object'
    );
  }

  return body;
}

function formatOAuthError(error: string | undefined): string {
  return error === undefined ? '' : ` (${error})`;
}

function stringField(
  value: Record<string, unknown>,
  field: string
): string | undefined {
  const fieldValue = value[field];
  return typeof fieldValue === 'string' ? fieldValue : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
