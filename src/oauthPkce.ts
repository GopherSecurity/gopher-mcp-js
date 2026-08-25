import {
  createNativeOAuthPkceChallenge,
  generateNativeOAuthPkce,
} from './ffi/auth/oauth-pkce';

export function createCodeVerifier(): string {
  return generateNativeOAuthPkce().codeVerifier;
}

export function createCodeChallenge(verifier: string): string {
  return createNativeOAuthPkceChallenge(verifier);
}

export function base64UrlEncode(input: Buffer): string {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
