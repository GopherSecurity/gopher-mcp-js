import {
  getLoadedNativeFunctions,
  getRawFunctions,
  requireNativeFunction,
} from './loader';
import type { NativeFunction } from './loader';

export type NativeMcpOAuthChallengeHandle = {
  readonly __nativeMcpOAuthChallengeHandle: unique symbol;
};

export type NativeMcpOAuthResourceMetadataHandle = {
  readonly __nativeMcpOAuthResourceMetadataHandle: unique symbol;
};

export type NativeMcpOAuthServerMetadataHandle = {
  readonly __nativeMcpOAuthServerMetadataHandle: unique symbol;
};

export interface NativeMcpOAuthChallenge {
  requiresOAuth: boolean;
  httpStatus: number;
  wwwAuthenticate: string;
  resourceMetadataUrl: string;
  error: string;
}

export interface NativeOAuthProtectedResourceMetadata {
  resource: string;
  authorizationServers: string[];
  scopesSupported: string[];
  rawJson: string;
  error: string;
}

export interface NativeOAuthAuthorizationServerMetadata {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
  scopesSupported: string[];
  responseTypesSupported: string[];
  grantTypesSupported: string[];
  rawJson: string;
  error: string;
}

type NativeFns = ReturnType<typeof getRawFunctions>;

export function probeNativeMcpOAuthChallenge(
  url: string,
  timeoutSeconds = 30,
  fns = getLoadedNativeFunctions()
): NativeMcpOAuthChallenge {
  const probe = requireNativeFunction(fns.mcpOAuthProbeChallenge, 'probe');
  const destroy = requireNativeFunction(
    fns.mcpOAuthChallengeDestroy,
    'challenge destroy'
  );

  const out: (NativeMcpOAuthChallengeHandle | null)[] = [null];
  const err = probe(url, timeoutSeconds, out) as number;
  if (err !== 0 || !out[0]) {
    throw new Error(`MCP OAuth challenge probe failed: error code ${err}`);
  }

  const handle = out[0];
  try {
    return readNativeChallenge(handle, fns);
  } finally {
    destroy(handle);
  }
}

export async function probeNativeMcpOAuthChallengeAsync(
  url: string,
  timeoutSeconds = 30,
  fns = getLoadedNativeFunctions()
): Promise<NativeMcpOAuthChallenge> {
  const probe = requireNativeFunction(fns.mcpOAuthProbeChallenge, 'probe');
  const destroy = requireNativeFunction(
    fns.mcpOAuthChallengeDestroy,
    'challenge destroy'
  );

  const out: (NativeMcpOAuthChallengeHandle | null)[] = [null];
  const err = await callNativeAsync<number>(probe, [url, timeoutSeconds, out]);
  if (err !== 0 || !out[0]) {
    throw new Error(`MCP OAuth challenge probe failed: error code ${err}`);
  }

  const handle = out[0];
  try {
    return readNativeChallenge(handle, fns);
  } finally {
    destroy(handle);
  }
}

export function fetchNativeOAuthProtectedResourceMetadata(
  resourceMetadataUrl: string,
  timeoutSeconds = 30,
  fns = getLoadedNativeFunctions()
): NativeOAuthProtectedResourceMetadata {
  const fetchMetadata = requireNativeFunction(
    fns.mcpOAuthFetchResourceMetadata,
    'resource metadata fetch'
  );
  const destroy = requireNativeFunction(
    fns.mcpOAuthResourceMetadataDestroy,
    'resource metadata destroy'
  );

  const out: (NativeMcpOAuthResourceMetadataHandle | null)[] = [null];
  const err = fetchMetadata(resourceMetadataUrl, timeoutSeconds, out) as number;
  if (err !== 0 || !out[0]) {
    throw new Error(`OAuth resource metadata fetch failed: error code ${err}`);
  }

  const handle = out[0];
  try {
    return readNativeProtectedResourceMetadata(handle, fns);
  } finally {
    destroy(handle);
  }
}

export async function fetchNativeOAuthProtectedResourceMetadataAsync(
  resourceMetadataUrl: string,
  timeoutSeconds = 30,
  fns = getLoadedNativeFunctions()
): Promise<NativeOAuthProtectedResourceMetadata> {
  const fetchMetadata = requireNativeFunction(
    fns.mcpOAuthFetchResourceMetadata,
    'resource metadata fetch'
  );
  const destroy = requireNativeFunction(
    fns.mcpOAuthResourceMetadataDestroy,
    'resource metadata destroy'
  );

  const out: (NativeMcpOAuthResourceMetadataHandle | null)[] = [null];
  const err = await callNativeAsync<number>(fetchMetadata, [
    resourceMetadataUrl,
    timeoutSeconds,
    out,
  ]);
  if (err !== 0 || !out[0]) {
    throw new Error(`OAuth resource metadata fetch failed: error code ${err}`);
  }

  const handle = out[0];
  try {
    return readNativeProtectedResourceMetadata(handle, fns);
  } finally {
    destroy(handle);
  }
}

export function fetchNativeOAuthAuthorizationServerMetadata(
  authorizationServer: string,
  timeoutSeconds = 30,
  fns = getLoadedNativeFunctions()
): NativeOAuthAuthorizationServerMetadata {
  const fetchMetadata = requireNativeFunction(
    fns.mcpOAuthFetchServerMetadata,
    'authorization server metadata fetch'
  );
  const destroy = requireNativeFunction(
    fns.mcpOAuthServerMetadataDestroy,
    'authorization server metadata destroy'
  );

  const out: (NativeMcpOAuthServerMetadataHandle | null)[] = [null];
  const err = fetchMetadata(authorizationServer, timeoutSeconds, out) as number;
  if (err !== 0 || !out[0]) {
    throw new Error(
      `OAuth authorization server metadata fetch failed: error code ${err}`
    );
  }

  const handle = out[0];
  try {
    return readNativeAuthorizationServerMetadata(handle, fns);
  } finally {
    destroy(handle);
  }
}

export async function fetchNativeOAuthAuthorizationServerMetadataAsync(
  authorizationServer: string,
  timeoutSeconds = 30,
  fns = getLoadedNativeFunctions()
): Promise<NativeOAuthAuthorizationServerMetadata> {
  const fetchMetadata = requireNativeFunction(
    fns.mcpOAuthFetchServerMetadata,
    'authorization server metadata fetch'
  );
  const destroy = requireNativeFunction(
    fns.mcpOAuthServerMetadataDestroy,
    'authorization server metadata destroy'
  );

  const out: (NativeMcpOAuthServerMetadataHandle | null)[] = [null];
  const err = await callNativeAsync<number>(fetchMetadata, [
    authorizationServer,
    timeoutSeconds,
    out,
  ]);
  if (err !== 0 || !out[0]) {
    throw new Error(
      `OAuth authorization server metadata fetch failed: error code ${err}`
    );
  }

  const handle = out[0];
  try {
    return readNativeAuthorizationServerMetadata(handle, fns);
  } finally {
    destroy(handle);
  }
}

function readNativeChallenge(
  handle: NativeMcpOAuthChallengeHandle,
  fns: NativeFns
): NativeMcpOAuthChallenge {
  return {
    requiresOAuth: readNativeBoolean(
      handle,
      requireNativeFunction(
        fns.mcpOAuthChallengeRequiresOAuth,
        'challenge requires OAuth'
      )
    ),
    httpStatus: readNativeNumber(
      handle,
      requireNativeFunction(
        fns.mcpOAuthChallengeGetHttpStatus,
        'challenge HTTP status'
      )
    ),
    wwwAuthenticate: readNativeString(
      handle,
      requireNativeFunction(
        fns.mcpOAuthChallengeGetWwwAuthenticate,
        'challenge WWW-Authenticate'
      )
    ),
    resourceMetadataUrl: readNativeString(
      handle,
      requireNativeFunction(
        fns.mcpOAuthChallengeGetResourceMetadataUrl,
        'challenge resource metadata URL'
      )
    ),
    error: readNativeString(
      handle,
      requireNativeFunction(fns.mcpOAuthChallengeGetError, 'challenge error')
    ),
  };
}

function readNativeProtectedResourceMetadata(
  handle: NativeMcpOAuthResourceMetadataHandle,
  fns: NativeFns
): NativeOAuthProtectedResourceMetadata {
  return {
    resource: readNativeString(
      handle,
      requireNativeFunction(
        fns.mcpOAuthResourceMetadataGetResource,
        'resource metadata resource'
      )
    ),
    authorizationServers: readNativeStringArray(
      handle,
      requireNativeFunction(
        fns.mcpOAuthResourceMetadataGetAuthorizationServerCount,
        'resource metadata authorization server count'
      ),
      requireNativeFunction(
        fns.mcpOAuthResourceMetadataGetAuthorizationServer,
        'resource metadata authorization server'
      )
    ),
    scopesSupported: readNativeStringArray(
      handle,
      requireNativeFunction(
        fns.mcpOAuthResourceMetadataGetScopeCount,
        'resource metadata scope count'
      ),
      requireNativeFunction(
        fns.mcpOAuthResourceMetadataGetScope,
        'resource metadata scope'
      )
    ),
    rawJson: readNativeString(
      handle,
      requireNativeFunction(
        fns.mcpOAuthResourceMetadataGetRawJson,
        'resource metadata raw JSON'
      )
    ),
    error: readNativeString(
      handle,
      requireNativeFunction(
        fns.mcpOAuthResourceMetadataGetError,
        'resource metadata error'
      )
    ),
  };
}

function readNativeAuthorizationServerMetadata(
  handle: NativeMcpOAuthServerMetadataHandle,
  fns: NativeFns
): NativeOAuthAuthorizationServerMetadata {
  return {
    issuer: readNativeString(
      handle,
      requireNativeFunction(
        fns.mcpOAuthServerMetadataGetIssuer,
        'authorization server metadata issuer'
      )
    ),
    authorizationEndpoint: readNativeString(
      handle,
      requireNativeFunction(
        fns.mcpOAuthServerMetadataGetAuthorizationEndpoint,
        'authorization server metadata authorization endpoint'
      )
    ),
    tokenEndpoint: readNativeString(
      handle,
      requireNativeFunction(
        fns.mcpOAuthServerMetadataGetTokenEndpoint,
        'authorization server metadata token endpoint'
      )
    ),
    registrationEndpoint: readNativeString(
      handle,
      requireNativeFunction(
        fns.mcpOAuthServerMetadataGetRegistrationEndpoint,
        'authorization server metadata registration endpoint'
      )
    ),
    scopesSupported: readNativeStringArray(
      handle,
      requireNativeFunction(
        fns.mcpOAuthServerMetadataGetScopeCount,
        'authorization server metadata scope count'
      ),
      requireNativeFunction(
        fns.mcpOAuthServerMetadataGetScope,
        'authorization server metadata scope'
      )
    ),
    responseTypesSupported: readNativeStringArray(
      handle,
      requireNativeFunction(
        fns.mcpOAuthServerMetadataGetResponseTypeCount,
        'authorization server metadata response type count'
      ),
      requireNativeFunction(
        fns.mcpOAuthServerMetadataGetResponseType,
        'authorization server metadata response type'
      )
    ),
    grantTypesSupported: readNativeStringArray(
      handle,
      requireNativeFunction(
        fns.mcpOAuthServerMetadataGetGrantTypeCount,
        'authorization server metadata grant type count'
      ),
      requireNativeFunction(
        fns.mcpOAuthServerMetadataGetGrantType,
        'authorization server metadata grant type'
      )
    ),
    rawJson: readNativeString(
      handle,
      requireNativeFunction(
        fns.mcpOAuthServerMetadataGetRawJson,
        'authorization server metadata raw JSON'
      )
    ),
    error: readNativeString(
      handle,
      requireNativeFunction(
        fns.mcpOAuthServerMetadataGetError,
        'authorization server metadata error'
      )
    ),
  };
}

function callNativeAsync<T>(
  fn: NativeFunction,
  args: unknown[]
): Promise<T> {
  const asyncFn = (fn as { async?: (...args: unknown[]) => void }).async;
  if (typeof asyncFn !== 'function') {
    throw new Error('MCP OAuth native function does not support async calls');
  }

  return new Promise<T>((resolve, reject) => {
    asyncFn(...args, (error: unknown, result: T) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    });
  });
}

function readNativeString(handle: unknown, getter: NativeFunction): string {
  const out: (string | null)[] = [null];
  const err = getter(handle, out) as number;
  if (err !== 0) {
    throw new Error(`MCP OAuth native string read failed: error code ${err}`);
  }
  return out[0] ?? '';
}

function readNativeBoolean(handle: unknown, getter: NativeFunction): boolean {
  const out: boolean[] = [false];
  const err = getter(handle, out) as number;
  if (err !== 0) {
    throw new Error(`MCP OAuth native boolean read failed: error code ${err}`);
  }
  return out[0] ?? false;
}

function readNativeNumber(handle: unknown, getter: NativeFunction): number {
  const out: number[] = [0];
  const err = getter(handle, out) as number;
  if (err !== 0) {
    throw new Error(`MCP OAuth native number read failed: error code ${err}`);
  }
  return out[0] ?? 0;
}

function readNativeSize(handle: unknown, getter: NativeFunction): number {
  const out: Array<number | bigint> = [0];
  const err = getter(handle, out) as number;
  if (err !== 0) {
    throw new Error(`MCP OAuth native array count failed: error code ${err}`);
  }
  return Number(out[0] ?? 0);
}

function readNativeStringArray(
  handle: unknown,
  countGetter: NativeFunction,
  itemGetter: NativeFunction
): string[] {
  const count = readNativeSize(handle, countGetter);
  const values: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const out: (string | null)[] = [null];
    const err = itemGetter(handle, index, out) as number;
    if (err !== 0) {
      throw new Error(
        `MCP OAuth native array item read failed at ${index}: error code ${err}`
      );
    }
    if (out[0]) {
      values.push(out[0]);
    }
  }

  return values;
}
