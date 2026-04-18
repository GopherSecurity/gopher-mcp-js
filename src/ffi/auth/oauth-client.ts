/**
 * GopherOAuthClient - FFI wrapper for OAuth HTTP client operations
 *
 * Provides token exchange, refresh, RFC 8693 token exchange, and
 * RFC 7591 dynamic client registration via the native C API.
 */

import { loadLibrary, isLibraryLoaded, getRawFunctions } from './loader';

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
  error?: string;
  errorDescription?: string;
  success: boolean;
}

export interface RegistrationResponse {
  clientId: string;
  clientSecret?: string;
  success: boolean;
  error?: string;
}

export class GopherOAuthClient {
  private handle: unknown = null;
  private destroyed = false;

  constructor(
    tokenEndpoint: string,
    clientId: string,
    clientSecret?: string,
    requestTimeout?: number
  ) {
    if (!isLibraryLoaded()) {
      loadLibrary();
    }

    const fns = getRawFunctions();
    if (!fns.oauthClientCreate) {
      throw new Error('OAuth client functions not available');
    }

    const out: unknown[] = [null];
    const result = fns.oauthClientCreate(
      out,
      tokenEndpoint,
      clientId,
      clientSecret ?? null,
      requestTimeout ?? 30
    ) as number;

    if (result !== 0 || !out[0]) {
      throw new Error(`Failed to create OAuth client: error code ${result}`);
    }
    this.handle = out[0];
  }

  private readTokenResponse(responseHandle: unknown): TokenResponse {
    const fns = getRawFunctions();

    const success =
      (fns.tokenResponseIsSuccess?.(responseHandle) as boolean) ?? false;

    const atOut: (string | null)[] = [null];
    fns.tokenResponseGetAccessToken?.(responseHandle, atOut);

    const rtOut: (string | null)[] = [null];
    fns.tokenResponseGetRefreshToken?.(responseHandle, rtOut);

    const expOut: bigint[] = [BigInt(0)];
    fns.tokenResponseGetExpiresIn?.(responseHandle, expOut);

    const errOut: (string | null)[] = [null];
    fns.tokenResponseGetError?.(responseHandle, errOut);

    fns.tokenResponseDestroy?.(responseHandle);

    const resp: TokenResponse = {
      accessToken: atOut[0] ?? '',
      expiresIn: Number(expOut[0] ?? 0),
      tokenType: 'Bearer',
      success,
    };

    if (rtOut[0]) resp.refreshToken = rtOut[0];
    if (!success && errOut[0]) {
      const parts = errOut[0].split(': ', 2);
      resp.error = parts[0];
      if (parts.length > 1) resp.errorDescription = parts[1];
    }

    return resp;
  }

  exchangeCode(
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): TokenResponse {
    this.ensureNotDestroyed();
    const fns = getRawFunctions();
    if (!fns.oauthExchangeCode) throw new Error('Function not available');

    const respOut: unknown[] = [null];
    const err = fns.oauthExchangeCode(
      this.handle,
      code,
      redirectUri,
      codeVerifier ?? null,
      respOut
    ) as number;

    if (err !== 0 || !respOut[0]) {
      return {
        accessToken: '',
        expiresIn: 0,
        tokenType: 'Bearer',
        success: false,
        error: 'ffi_error',
      };
    }

    return this.readTokenResponse(respOut[0]);
  }

  refreshToken(refreshToken: string): TokenResponse {
    this.ensureNotDestroyed();
    const fns = getRawFunctions();
    if (!fns.oauthRefreshToken) throw new Error('Function not available');

    const respOut: unknown[] = [null];
    const err = fns.oauthRefreshToken(
      this.handle,
      refreshToken,
      respOut
    ) as number;

    if (err !== 0 || !respOut[0]) {
      return {
        accessToken: '',
        expiresIn: 0,
        tokenType: 'Bearer',
        success: false,
        error: 'ffi_error',
      };
    }

    return this.readTokenResponse(respOut[0]);
  }

  tokenExchange(
    subjectToken: string,
    requestedIssuer: string,
    audience?: string,
    scope?: string
  ): TokenResponse {
    this.ensureNotDestroyed();
    const fns = getRawFunctions();
    if (!fns.oauthTokenExchange) throw new Error('Function not available');

    const respOut: unknown[] = [null];
    const err = fns.oauthTokenExchange(
      this.handle,
      subjectToken,
      requestedIssuer,
      audience ?? null,
      scope ?? null,
      respOut
    ) as number;

    if (err !== 0 || !respOut[0]) {
      return {
        accessToken: '',
        expiresIn: 0,
        tokenType: 'Bearer',
        success: false,
        error: 'ffi_error',
      };
    }

    return this.readTokenResponse(respOut[0]);
  }

  registerClient(
    registrationEndpoint: string,
    clientName: string,
    redirectUris: string[],
    scopes?: string
  ): RegistrationResponse {
    this.ensureNotDestroyed();
    const fns = getRawFunctions();
    if (!fns.oauthRegisterClient) throw new Error('Function not available');

    const respOut: unknown[] = [null];
    const err = fns.oauthRegisterClient(
      this.handle,
      registrationEndpoint,
      clientName,
      redirectUris,
      redirectUris.length,
      scopes ?? 'openid',
      respOut
    ) as number;

    if (err !== 0 || !respOut[0]) {
      return { clientId: '', success: false, error: 'ffi_error' };
    }

    const regHandle = respOut[0];
    const success =
      (fns.registrationResponseIsSuccess?.(regHandle) as boolean) ?? false;

    const cidOut: (string | null)[] = [null];
    fns.registrationResponseGetClientId?.(regHandle, cidOut);

    const csOut: (string | null)[] = [null];
    fns.registrationResponseGetClientSecret?.(regHandle, csOut);

    fns.registrationResponseDestroy?.(regHandle);

    const resp: RegistrationResponse = {
      clientId: cidOut[0] ?? '',
      success,
    };
    if (csOut[0]) resp.clientSecret = csOut[0];
    return resp;
  }

  destroy(): void {
    if (this.destroyed || !this.handle) return;
    const fns = getRawFunctions();
    fns.oauthClientDestroy?.(this.handle);
    this.handle = null;
    this.destroyed = true;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  getHandle(): unknown {
    this.ensureNotDestroyed();
    return this.handle;
  }

  private ensureNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error('GopherOAuthClient has been destroyed');
    }
  }
}
