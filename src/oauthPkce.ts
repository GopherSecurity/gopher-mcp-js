import { createHash, randomBytes } from 'crypto';

export function createCodeVerifier(): string {
  return base64UrlEncode(randomBytes(32));
}

export function createCodeChallenge(verifier: string): string {
  return base64UrlEncode(createHash('sha256').update(verifier).digest());
}

export function base64UrlEncode(input: Buffer): string {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
