import {
  GopherAgentRuntimeOptions,
  GopherAgentTokenRecord,
  normalizeRuntimeOptions,
} from './config';

export function mergeOAuthTokenIntoRuntimeOptions(
  existing: GopherAgentRuntimeOptions | undefined,
  token: GopherAgentTokenRecord
): GopherAgentRuntimeOptions {
  const normalizedExisting = normalizeRuntimeOptions(existing);
  if (
    hasAuthorizationHeader(normalizedExisting) ||
    normalizedExisting?.accessToken
  ) {
    return normalizedExisting ?? {};
  }

  return {
    ...(normalizedExisting ?? {}),
    accessToken: token.accessToken,
  };
}

export function hasAuthorizationHeader(
  options?: GopherAgentRuntimeOptions
): boolean {
  if (options?.headers === undefined) {
    return false;
  }
  return Object.keys(options.headers).some(
    (name) => name.toLowerCase() === 'authorization'
  );
}
