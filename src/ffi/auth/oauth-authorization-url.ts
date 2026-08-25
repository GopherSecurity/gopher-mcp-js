import { getRawFunctions, isLibraryLoaded, loadLibrary } from './loader';

export interface NativeOAuthAuthorizationUrlInput {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope?: string;
  resource?: string;
}

type NativeFns = ReturnType<typeof getRawFunctions>;
type NativeFunction = (...args: unknown[]) => unknown;

export function buildNativeOAuthAuthorizationUrl(
  input: NativeOAuthAuthorizationUrlInput,
  fns = getLoadedNativeFunctions()
): string {
  const build = requireNativeFunction(
    fns.mcpOAuthBuildAuthorizationUrl,
    'authorization URL builder'
  );
  const urlOut: (string | null)[] = [null];

  const err = build(
    input.authorizationEndpoint,
    input.clientId,
    input.redirectUri,
    input.state,
    input.codeChallenge,
    input.scope ?? null,
    input.resource ?? null,
    urlOut
  ) as number;
  if (err !== 0 || !urlOut[0]) {
    throw new Error(`OAuth authorization URL build failed: error code ${err}`);
  }

  return urlOut[0];
}

function getLoadedNativeFunctions(): NativeFns {
  if (!isLibraryLoaded()) {
    loadLibrary();
  }
  return getRawFunctions();
}

function requireNativeFunction(
  fn: NativeFunction | null | undefined,
  label: string
): NativeFunction {
  if (!fn) {
    throw new Error(`Native OAuth ${label} function not available`);
  }
  return fn;
}
