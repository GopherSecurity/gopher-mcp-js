import { GopherOrchLibrary } from '../src/ffi/library';

function capability(
  probe: (() => number) | null,
  embedded: boolean,
  version: string | null
) {
  const lib = Object.create(GopherOrchLibrary.prototype);
  lib._elicitationCallbackSupport = probe;
  lib.loadedNativePackageVersion = version;
  lib.embeddedAuthCapabilities = () =>
    embedded ? { version: 1, embedded_auth: true } : null;
  return lib.supportsElicitationCallbackOptions();
}

describe('native elicitation capability detection', () => {
  test('accepts local embedded-auth v1 without package metadata', () => {
    expect(capability(null, true, null)).toBe(true);
  });
  test('keeps an explicit native probe authoritative', () => {
    expect(capability(() => 0, true, '0.1.42')).toBe(false);
    expect(capability(() => 1, false, null)).toBe(true);
  });
  test('preserves package compatibility and rejects unrecognized local binaries', () => {
    expect(capability(null, false, '0.1.42')).toBe(true);
    expect(capability(null, false, '0.1.34')).toBe(false);
    expect(capability(null, false, null)).toBe(false);
  });
});
