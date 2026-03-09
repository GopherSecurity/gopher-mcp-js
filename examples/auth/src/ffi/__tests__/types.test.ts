import {
  GopherAuthError,
  ValidationResult,
  TokenPayload,
  AuthContext,
  isGopherAuthError,
  getErrorDescription,
  createEmptyAuthContext,
} from '../types';

describe('GopherAuthError', () => {
  it('should have SUCCESS = 0', () => {
    expect(GopherAuthError.SUCCESS).toBe(0);
  });

  it('should have INVALID_TOKEN = -1000', () => {
    expect(GopherAuthError.INVALID_TOKEN).toBe(-1000);
  });

  it('should have EXPIRED_TOKEN = -1001', () => {
    expect(GopherAuthError.EXPIRED_TOKEN).toBe(-1001);
  });

  it('should have INVALID_SIGNATURE = -1002', () => {
    expect(GopherAuthError.INVALID_SIGNATURE).toBe(-1002);
  });

  it('should have INVALID_ISSUER = -1003', () => {
    expect(GopherAuthError.INVALID_ISSUER).toBe(-1003);
  });

  it('should have INVALID_AUDIENCE = -1004', () => {
    expect(GopherAuthError.INVALID_AUDIENCE).toBe(-1004);
  });

  it('should have INSUFFICIENT_SCOPE = -1005', () => {
    expect(GopherAuthError.INSUFFICIENT_SCOPE).toBe(-1005);
  });

  it('should have JWKS_FETCH_FAILED = -1006', () => {
    expect(GopherAuthError.JWKS_FETCH_FAILED).toBe(-1006);
  });

  it('should have INVALID_KEY = -1007', () => {
    expect(GopherAuthError.INVALID_KEY).toBe(-1007);
  });

  it('should have NETWORK_ERROR = -1008', () => {
    expect(GopherAuthError.NETWORK_ERROR).toBe(-1008);
  });

  it('should have INVALID_CONFIG = -1009', () => {
    expect(GopherAuthError.INVALID_CONFIG).toBe(-1009);
  });

  it('should have OUT_OF_MEMORY = -1010', () => {
    expect(GopherAuthError.OUT_OF_MEMORY).toBe(-1010);
  });

  it('should have INVALID_PARAMETER = -1011', () => {
    expect(GopherAuthError.INVALID_PARAMETER).toBe(-1011);
  });

  it('should have NOT_INITIALIZED = -1012', () => {
    expect(GopherAuthError.NOT_INITIALIZED).toBe(-1012);
  });

  it('should have INTERNAL_ERROR = -1013', () => {
    expect(GopherAuthError.INTERNAL_ERROR).toBe(-1013);
  });

  it('should have TOKEN_EXCHANGE_FAILED = -1014', () => {
    expect(GopherAuthError.TOKEN_EXCHANGE_FAILED).toBe(-1014);
  });

  it('should have IDP_NOT_LINKED = -1015', () => {
    expect(GopherAuthError.IDP_NOT_LINKED).toBe(-1015);
  });

  it('should have INVALID_IDP_ALIAS = -1016', () => {
    expect(GopherAuthError.INVALID_IDP_ALIAS).toBe(-1016);
  });
});

describe('isGopherAuthError', () => {
  it('should return true for valid error codes', () => {
    expect(isGopherAuthError(0)).toBe(true);
    expect(isGopherAuthError(-1000)).toBe(true);
    expect(isGopherAuthError(-1005)).toBe(true);
    expect(isGopherAuthError(-1016)).toBe(true);
  });

  it('should return false for invalid error codes', () => {
    expect(isGopherAuthError(1)).toBe(false);
    expect(isGopherAuthError(-999)).toBe(false);
    expect(isGopherAuthError(-2000)).toBe(false);
    expect(isGopherAuthError(100)).toBe(false);
  });
});

describe('getErrorDescription', () => {
  it('should return correct description for SUCCESS', () => {
    expect(getErrorDescription(GopherAuthError.SUCCESS)).toBe('Success');
  });

  it('should return correct description for INVALID_TOKEN', () => {
    expect(getErrorDescription(GopherAuthError.INVALID_TOKEN)).toBe('Invalid token');
  });

  it('should return correct description for EXPIRED_TOKEN', () => {
    expect(getErrorDescription(GopherAuthError.EXPIRED_TOKEN)).toBe('Token has expired');
  });

  it('should return correct description for INVALID_SIGNATURE', () => {
    expect(getErrorDescription(GopherAuthError.INVALID_SIGNATURE)).toBe('Invalid token signature');
  });

  it('should return correct description for INSUFFICIENT_SCOPE', () => {
    expect(getErrorDescription(GopherAuthError.INSUFFICIENT_SCOPE)).toBe('Insufficient scope');
  });

  it('should return correct description for NOT_INITIALIZED', () => {
    expect(getErrorDescription(GopherAuthError.NOT_INITIALIZED)).toBe('Auth library not initialized');
  });

  it('should return unknown error for invalid codes', () => {
    expect(getErrorDescription(-9999 as GopherAuthError)).toBe('Unknown error (-9999)');
  });
});

describe('createEmptyAuthContext', () => {
  it('should return an empty auth context', () => {
    const ctx = createEmptyAuthContext();
    expect(ctx).toEqual({
      userId: '',
      scopes: '',
      audience: '',
      tokenExpiry: 0,
      authenticated: false,
    });
  });

  it('should return a new object each time', () => {
    const ctx1 = createEmptyAuthContext();
    const ctx2 = createEmptyAuthContext();
    expect(ctx1).not.toBe(ctx2);
    expect(ctx1).toEqual(ctx2);
  });
});

describe('ValidationResult interface', () => {
  it('should accept valid ValidationResult objects', () => {
    const success: ValidationResult = {
      valid: true,
      errorCode: GopherAuthError.SUCCESS,
      errorMessage: null,
    };
    expect(success.valid).toBe(true);

    const failure: ValidationResult = {
      valid: false,
      errorCode: GopherAuthError.EXPIRED_TOKEN,
      errorMessage: 'Token has expired',
    };
    expect(failure.valid).toBe(false);
    expect(failure.errorMessage).toBe('Token has expired');
  });
});

describe('TokenPayload interface', () => {
  it('should accept valid TokenPayload objects', () => {
    const payload: TokenPayload = {
      subject: 'user-123',
      scopes: 'openid profile mcp:read',
    };
    expect(payload.subject).toBe('user-123');
    expect(payload.scopes).toBe('openid profile mcp:read');
  });

  it('should accept optional fields', () => {
    const payload: TokenPayload = {
      subject: 'user-123',
      scopes: 'openid',
      audience: 'mcp-server',
      expiration: 1704067200,
      issuer: 'https://auth.example.com',
      clientId: 'my-client',
    };
    expect(payload.audience).toBe('mcp-server');
    expect(payload.expiration).toBe(1704067200);
    expect(payload.issuer).toBe('https://auth.example.com');
    expect(payload.clientId).toBe('my-client');
  });
});

describe('AuthContext interface', () => {
  it('should accept valid AuthContext objects', () => {
    const ctx: AuthContext = {
      userId: 'user-123',
      scopes: 'openid profile mcp:read',
      audience: 'mcp-server',
      tokenExpiry: 1704067200,
      authenticated: true,
    };
    expect(ctx.userId).toBe('user-123');
    expect(ctx.authenticated).toBe(true);
  });
});
