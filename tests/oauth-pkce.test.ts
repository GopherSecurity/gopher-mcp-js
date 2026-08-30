import {
  base64UrlEncode,
  createCodeChallenge,
  createCodeVerifier,
} from '../src/oauthPkce';

describe('OAuth PKCE utilities', () => {
  test('challenge is deterministic for a fixed verifier', () => {
    expect(
      createCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
    ).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  test('base64url encoding omits padding', () => {
    expect(base64UrlEncode(Buffer.from('sure.'))).toBe('c3VyZS4');
  });

  test('verifier length is valid', () => {
    const verifier = createCodeVerifier();

    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
