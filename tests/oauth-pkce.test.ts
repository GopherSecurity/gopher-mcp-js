import {
  base64UrlEncode,
  createCodeChallenge,
  createCodeVerifier,
} from '../src/oauthPkce';
import {
  createNativeOAuthPkceChallenge,
  generateNativeOAuthPkce,
} from '../src/ffi/auth/oauth-pkce';

jest.mock('../src/ffi/auth/oauth-pkce', () => ({
  createNativeOAuthPkceChallenge: jest.fn(),
  generateNativeOAuthPkce: jest.fn(),
}));

const mockedCreateNativeOAuthPkceChallenge =
  createNativeOAuthPkceChallenge as jest.MockedFunction<
    typeof createNativeOAuthPkceChallenge
  >;
const mockedGenerateNativeOAuthPkce =
  generateNativeOAuthPkce as jest.MockedFunction<
    typeof generateNativeOAuthPkce
  >;

describe('OAuth PKCE utilities', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('challenge is deterministic for a fixed verifier', () => {
    mockedCreateNativeOAuthPkceChallenge.mockReturnValue(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    );

    expect(
      createCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
    ).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    expect(mockedCreateNativeOAuthPkceChallenge).toHaveBeenCalledWith(
      'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    );
  });

  test('base64url encoding omits padding', () => {
    expect(base64UrlEncode(Buffer.from('sure.'))).toBe('c3VyZS4');
  });

  test('verifier length is valid', () => {
    mockedGenerateNativeOAuthPkce.mockReturnValue({
      codeVerifier: 'a'.repeat(43),
      codeChallenge: 'challenge',
    });
    const verifier = createCodeVerifier();

    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(mockedGenerateNativeOAuthPkce).toHaveBeenCalledTimes(1);
  });
});
