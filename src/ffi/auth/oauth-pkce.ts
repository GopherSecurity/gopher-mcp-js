import { getRawFunctions, isLibraryLoaded, loadLibrary } from './loader';

export interface NativeOAuthPkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

type NativeFns = ReturnType<typeof getRawFunctions>;
type NativeFunction = (...args: unknown[]) => unknown;

export function generateNativeOAuthPkce(
  fns = getLoadedNativeFunctions()
): NativeOAuthPkcePair {
  const generate = requireNativeFunction(
    fns.mcpOAuthPkceGenerate,
    'PKCE generate'
  );
  const verifierOut: (string | null)[] = [null];
  const challengeOut: (string | null)[] = [null];

  const err = generate(verifierOut, challengeOut) as number;
  if (err !== 0 || !verifierOut[0] || !challengeOut[0]) {
    throw new Error(`OAuth PKCE generation failed: error code ${err}`);
  }

  return {
    codeVerifier: verifierOut[0],
    codeChallenge: challengeOut[0],
  };
}

export function createNativeOAuthPkceChallenge(
  codeVerifier: string,
  fns = getLoadedNativeFunctions()
): string {
  const challenge = requireNativeFunction(
    fns.mcpOAuthPkceChallenge,
    'PKCE challenge'
  );
  const challengeOut: (string | null)[] = [null];

  const err = challenge(codeVerifier, challengeOut) as number;
  if (err !== 0 || !challengeOut[0]) {
    throw new Error(`OAuth PKCE challenge failed: error code ${err}`);
  }

  return challengeOut[0];
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
