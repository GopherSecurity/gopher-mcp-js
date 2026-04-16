/**
 * Tests for extended payload claim extraction and updated types
 */

import { TokenPayload, GopherAuthContext } from '../src/ffi/auth/types';

describe('TokenPayload extended fields', () => {
  it('should include email field', () => {
    const payload: TokenPayload = {
      subject: 'user-123',
      scopes: 'openid',
      email: 'user@example.com',
    };
    expect(payload.email).toBe('user@example.com');
  });

  it('should include name field', () => {
    const payload: TokenPayload = {
      subject: 'user-123',
      scopes: 'openid',
      name: 'John Doe',
    };
    expect(payload.name).toBe('John Doe');
  });

  it('should include organization_id field', () => {
    const payload: TokenPayload = {
      subject: 'user-123',
      scopes: 'openid',
      organization_id: 'org-456',
    };
    expect(payload.organization_id).toBe('org-456');
  });

  it('should include server_id field', () => {
    const payload: TokenPayload = {
      subject: 'user-123',
      scopes: 'openid',
      server_id: 'srv-789',
    };
    expect(payload.server_id).toBe('srv-789');
  });

  it('should include claims map for arbitrary custom claims', () => {
    const payload: TokenPayload = {
      subject: 'user-123',
      scopes: 'openid',
      claims: {
        tenant: 'acme',
        role: 'admin',
      },
    };
    expect(payload.claims).toEqual({ tenant: 'acme', role: 'admin' });
  });

  it('should allow all extended fields to be undefined', () => {
    const payload: TokenPayload = {
      subject: 'user-123',
      scopes: 'openid',
    };
    expect(payload.email).toBeUndefined();
    expect(payload.name).toBeUndefined();
    expect(payload.organization_id).toBeUndefined();
    expect(payload.server_id).toBeUndefined();
    expect(payload.claims).toBeUndefined();
  });
});

describe('GopherAuthContext extended fields', () => {
  it('should include email field', () => {
    const ctx: GopherAuthContext = {
      userId: 'user-123',
      scopes: 'openid',
      audience: 'api',
      tokenExpiry: 0,
      authenticated: true,
      email: 'user@example.com',
    };
    expect(ctx.email).toBe('user@example.com');
  });

  it('should include name field', () => {
    const ctx: GopherAuthContext = {
      userId: 'user-123',
      scopes: 'openid',
      audience: 'api',
      tokenExpiry: 0,
      authenticated: true,
      name: 'John Doe',
    };
    expect(ctx.name).toBe('John Doe');
  });

  it('should include organizationId field', () => {
    const ctx: GopherAuthContext = {
      userId: 'user-123',
      scopes: 'openid',
      audience: 'api',
      tokenExpiry: 0,
      authenticated: true,
      organizationId: 'org-456',
    };
    expect(ctx.organizationId).toBe('org-456');
  });

  it('should include serverId field', () => {
    const ctx: GopherAuthContext = {
      userId: 'user-123',
      scopes: 'openid',
      audience: 'api',
      tokenExpiry: 0,
      authenticated: true,
      serverId: 'srv-789',
    };
    expect(ctx.serverId).toBe('srv-789');
  });

  it('should include rawToken field', () => {
    const ctx: GopherAuthContext = {
      userId: 'user-123',
      scopes: 'openid',
      audience: 'api',
      tokenExpiry: 0,
      authenticated: true,
      rawToken: 'eyJhbGciOiJSUzI1NiJ9.test.sig',
    };
    expect(ctx.rawToken).toBe('eyJhbGciOiJSUzI1NiJ9.test.sig');
  });

  it('should allow all extended fields to be undefined', () => {
    const ctx: GopherAuthContext = {
      userId: 'user-123',
      scopes: 'openid',
      audience: 'api',
      tokenExpiry: 0,
      authenticated: true,
    };
    expect(ctx.email).toBeUndefined();
    expect(ctx.name).toBeUndefined();
    expect(ctx.organizationId).toBeUndefined();
    expect(ctx.serverId).toBeUndefined();
    expect(ctx.rawToken).toBeUndefined();
  });
});
