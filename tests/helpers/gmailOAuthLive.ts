export const GOOGLE_OAUTH_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export const GMAIL_REFRESH_TOKEN_ENV_VARS = [
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_GMAIL_REFRESH_TOKEN',
] as const;

export const LIVE_GMAIL_OAUTH_ENV_VARS = [
  ...GMAIL_REFRESH_TOKEN_ENV_VARS,
  'GOPHER_GMAIL_SERVER_MCP_URL',
  'GOPHER_GMAIL_GATEWAY_MCP_URL',
  'LLM_PROVIDER',
  'LLM_MODEL',
  'ANTHROPIC_API_KEY',
  'VERIFY_EXPECTED_EMAIL',
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

export interface LiveGmailOAuthEnv {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  serverMcpUrl: string;
  gatewayMcpUrl: string;
  provider: string;
  model: string;
  providerApiKey: string;
  expectedEmail: string;
}

export interface LiveGmailOAuthEnvStatus {
  canRun: boolean;
  missing: string[];
}

export interface LiveGmailOAuthTestRunnerOptions {
  env?: Env;
  write?: (message: string) => void;
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

export function getLiveGmailOAuthEnvStatus(
  env: Env = process.env
): LiveGmailOAuthEnvStatus {
  const missing = missingEnvVars(LIVE_GMAIL_OAUTH_ENV_VARS, env);
  return {
    canRun: missing.length === 0,
    missing,
  };
}

export function readLiveGmailOAuthEnv(
  env: Env = process.env
): LiveGmailOAuthEnv {
  const status = getLiveGmailOAuthEnvStatus(env);
  if (!status.canRun) {
    throw new Error(
      `live_gmail_oauth_env_missing: ${status.missing.join(', ')}`
    );
  }

  return {
    clientId: env.GOOGLE_OAUTH_CLIENT_ID as string,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET as string,
    refreshToken: env.GOOGLE_GMAIL_REFRESH_TOKEN as string,
    serverMcpUrl: env.GOPHER_GMAIL_SERVER_MCP_URL as string,
    gatewayMcpUrl: env.GOPHER_GMAIL_GATEWAY_MCP_URL as string,
    provider: env.LLM_PROVIDER as string,
    model: env.LLM_MODEL as string,
    providerApiKey: env.ANTHROPIC_API_KEY as string,
    expectedEmail: env.VERIFY_EXPECTED_EMAIL as string,
  };
}

export function liveGmailOAuthTest(
  options: LiveGmailOAuthTestRunnerOptions = {}
): jest.It {
  const status = getLiveGmailOAuthEnvStatus(options.env ?? process.env);
  if (status.canRun) {
    return test;
  }

  const write =
    options.write ?? ((message: string) => process.stderr.write(message));
  write(
    `Skipping live Gmail OAuth tests; missing env: ${status.missing.join(', ')}\n`
  );
  return test.skip;
}

export function readGmailRefreshTokenEnv(
  env: Env = process.env
): GmailOAuthRefreshTokenEnv {
  const missing = missingEnvVars(GMAIL_REFRESH_TOKEN_ENV_VARS, env);

  if (missing.length > 0) {
    throw new Error(
      `gmail_oauth_refresh_env_missing: ${missing.join(', ')}`
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

function missingEnvVars(
  names: readonly string[],
  env: Env
): string[] {
  return names.filter(
    (name) => env[name] === undefined || env[name]?.trim().length === 0
  );
}
