import {
  GopherAgentOAuthOptions,
  GopherAgentRuntimeOptions,
  GopherAgentTokenRecord,
  normalizeRuntimeOptions,
} from './config';

export function mergeOAuthTokenIntoRuntimeOptions(
  existing: GopherAgentRuntimeOptions | undefined,
  token: GopherAgentTokenRecord
): GopherAgentRuntimeOptions {
  const normalizedExisting = normalizeRuntimeOptions(existing);
  if (hasRuntimeAuthorization(normalizedExisting)) {
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

export function hasRuntimeAuthorization(
  options?: GopherAgentRuntimeOptions
): boolean {
  return options?.accessToken !== undefined || hasAuthorizationHeader(options);
}

export function shouldSkipOAuthResolution(options: {
  oauth?: GopherAgentOAuthOptions;
  runtimeOptions?: GopherAgentRuntimeOptions;
}): boolean {
  return (
    options.oauth?.mode === 'disabled' ||
    hasRuntimeAuthorization(options.runtimeOptions)
  );
}
