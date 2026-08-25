import { getRawFunctions, isLibraryLoaded, loadLibrary } from './loader';

type NativeFns = ReturnType<typeof getRawFunctions>;
type NativeFunction = (...args: unknown[]) => unknown;

export function extractNativeMcpServerTargetUrls(
  serverConfig: string,
  fns = getLoadedNativeFunctions()
): string[] {
  const extract = requireNativeFunction(
    fns.mcpOAuthExtractServerTargets,
    'server target extraction'
  );
  const targetsJsonOut: (string | null)[] = [null];
  const errorOut: (string | null)[] = [null];

  const err = extract(serverConfig, targetsJsonOut, errorOut) as number;
  if (err !== 0 || errorOut[0]) {
    throw new Error(
      errorOut[0] ?? `MCP server target extraction failed: error code ${err}`
    );
  }
  if (!targetsJsonOut[0]) {
    return [];
  }

  const parsed = JSON.parse(targetsJsonOut[0]) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('MCP server target extraction returned non-array JSON');
  }
  return parsed.filter((value): value is string => typeof value === 'string');
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
