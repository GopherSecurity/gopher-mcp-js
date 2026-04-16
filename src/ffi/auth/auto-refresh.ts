/**
 * Auto-Refresh - Combines session lookup, token refresh, and re-validation
 */

import { getRawFunctions } from './loader';
import { GopherAuthClient } from './auth-client';
import { GopherOAuthClient } from './oauth-client';
import { GopherSessionManager } from './session-manager';
import { GopherAuthError } from './types';

export interface AutoRefreshResult {
  valid: boolean;
  newAccessToken?: string;
  errorCode: number;
  errorMessage?: string;
}

/**
 * Auto-refresh: validate token, refresh if expired, re-validate
 *
 * If the token is still valid, newAccessToken is undefined.
 * If refreshed, newAccessToken contains the new token.
 */
export function gopherAuthAutoRefresh(
  authClient: GopherAuthClient,
  oauthClient: GopherOAuthClient,
  sessionManager: GopherSessionManager,
  sessionId: string
): AutoRefreshResult {
  const fns = getRawFunctions();
  if (!fns.autoRefresh) {
    return {
      valid: false,
      errorCode: GopherAuthError.NOT_INITIALIZED,
      errorMessage: 'Auto-refresh function not available',
    };
  }

  const tokenOut: (string | null)[] = [null];
  const resultOut: unknown[] = [
    { valid: false, error_code: 0, error_message: null },
  ];

  const err = fns.autoRefresh(
    authClient.getHandle(),
    oauthClient.getHandle(),
    sessionManager.getHandle(),
    sessionId,
    tokenOut,
    resultOut
  ) as number;

  const result = resultOut[0] as {
    valid: boolean;
    error_code: number;
    error_message: string | null;
  };

  if (err !== 0) {
    return {
      valid: false,
      errorCode: err,
      errorMessage: result?.error_message ?? `Error code ${err}`,
    };
  }

  const autoResult: AutoRefreshResult = {
    valid: result.valid,
    errorCode: result.error_code,
    errorMessage: result.error_message ?? undefined,
  };

  if (tokenOut[0]) {
    autoResult.newAccessToken = tokenOut[0];
  }

  return autoResult;
}
