import {
  getLoadedNativeFunctions,
  requireNativeFunction,
} from './loader';

export interface NativeOAuthAuthorizationServerSelection {
  authorizationServer: string;
}

export function requireNativeSingleOAuthAuthorizationServer(
  authorizationServers: string[],
  hasPerServerCredentials = false,
  fns = getLoadedNativeFunctions()
): NativeOAuthAuthorizationServerSelection {
  const requireSingle = requireNativeFunction(
    fns.mcpOAuthRequireSingleAuthorizationServer,
    'authorization server compatibility'
  );
  const authorizationServerOut: (string | null)[] = [null];
  const errorOut: (string | null)[] = [null];

  const err = requireSingle(
    authorizationServers,
    authorizationServers.length,
    hasPerServerCredentials,
    authorizationServerOut,
    errorOut
  ) as number;
  if (err !== 0 || errorOut[0]) {
    throw new Error(
      errorOut[0] ??
        `OAuth authorization server compatibility failed: error code ${err}`
    );
  }
  if (!authorizationServerOut[0]) {
    throw new Error(
      'OAuth authorization server compatibility returned no issuer'
    );
  }

  return { authorizationServer: authorizationServerOut[0] };
}
