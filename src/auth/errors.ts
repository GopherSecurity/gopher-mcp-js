/**
 * Custom error classes for the auth module
 *
 * Matches the error hierarchy from gopher-auth-sdk-nodejs for
 * drop-in migration compatibility.
 */

export class GopherAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GopherAuthError';
  }
}

export class TokenValidationError extends GopherAuthError {
  readonly errorCode: number;

  constructor(message: string, errorCode: number = 0) {
    super(message);
    this.name = 'TokenValidationError';
    this.errorCode = errorCode;
  }
}

export class InsufficientScopesError extends GopherAuthError {
  readonly requiredScopes: string[];
  readonly actualScopes: string[];

  constructor(
    requiredScopes: string[],
    actualScopes: string[],
    message?: string
  ) {
    super(
      message ??
        `Insufficient scopes: required [${requiredScopes.join(', ')}], ` +
          `actual [${actualScopes.join(', ')}]`
    );
    this.name = 'InsufficientScopesError';
    this.requiredScopes = requiredScopes;
    this.actualScopes = actualScopes;
  }
}

export class JwksError extends GopherAuthError {
  constructor(message: string) {
    super(message);
    this.name = 'JwksError';
  }
}

export class ConfigurationError extends GopherAuthError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class TokenExchangeError extends GopherAuthError {
  readonly errorCode?: string;
  readonly errorDescription?: string;

  constructor(message: string, errorCode?: string, errorDescription?: string) {
    super(message);
    this.name = 'TokenExchangeError';
    this.errorCode = errorCode;
    this.errorDescription = errorDescription;
  }
}
