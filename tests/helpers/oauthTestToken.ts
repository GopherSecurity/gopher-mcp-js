export interface RefreshTestOAuthTokenInput {
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchImpl?: typeof fetch;
}

export interface TestOAuthToken {
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
  scope?: string;
}

export async function refreshTestOAuthToken(
  input: RefreshTestOAuthTokenInput
): Promise<TestOAuthToken> {
  const fetchImpl = input.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(input.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: input.clientId,
        client_secret: input.clientSecret,
        refresh_token: input.refreshToken,
      }),
    });
  } catch (error) {
    throw new Error(
      `oauth_test_token_refresh_failed: token endpoint request failed: ${errorMessage(error)}`
    );
  }

  const body = await parseJsonObject(response);
  const oauthError = stringField(body, 'error');
  if (!response.ok) {
    throw new Error(
      `oauth_test_token_refresh_failed: token endpoint returned HTTP ${response.status}${formatOAuthError(oauthError)}`
    );
  }
  if (oauthError !== undefined) {
    throw new Error(
      `oauth_test_token_refresh_failed: token endpoint returned OAuth error ${oauthError}`
    );
  }

  const accessToken = stringField(body, 'access_token');
  if (accessToken === undefined || accessToken.length === 0) {
    throw new Error(
      'oauth_test_token_refresh_failed: token response missing access_token'
    );
  }

  const tokenType = stringField(body, 'token_type');
  if (tokenType === undefined || tokenType.length === 0) {
    throw new Error(
      'oauth_test_token_refresh_failed: token response missing token_type'
    );
  }

  const expiresIn = numberField(body, 'expires_in');
  const scope = stringField(body, 'scope');
  return {
    accessToken,
    tokenType,
    ...(expiresIn !== undefined ? { expiresIn } : {}),
    ...(scope !== undefined ? { scope } : {}),
  };
}

async function parseJsonObject(
  response: Pick<Response, 'text'>
): Promise<Record<string, unknown>> {
  const bodyText = await response.text();
  let body: unknown;
  try {
    body = bodyText.length > 0 ? JSON.parse(bodyText) : {};
  } catch (error) {
    throw new Error(
      `oauth_test_token_refresh_failed: token response was not valid JSON: ${errorMessage(error)}`
    );
  }

  if (!isRecord(body)) {
    throw new Error(
      'oauth_test_token_refresh_failed: token response was not a JSON object'
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

function numberField(
  value: Record<string, unknown>,
  field: string
): number | undefined {
  const fieldValue = value[field];
  return typeof fieldValue === 'number' ? fieldValue : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
