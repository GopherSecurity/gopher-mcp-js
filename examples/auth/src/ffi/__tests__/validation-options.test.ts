/**
 * Unit tests for ValidationOptions class
 *
 * Note: These tests verify the class structure and API without
 * requiring the native library. Integration tests with the actual
 * library are in integration.test.ts.
 */

import { ValidationOptions, createValidationOptions } from '../validation-options';

// Mock the loader module to avoid loading the native library
jest.mock('../loader', () => ({
  loadLibrary: jest.fn(),
  getGopherAuthValidationOptionsCreate: jest.fn(() => jest.fn((ptr: unknown[]) => {
    ptr[0] = { __mock: true };
    return 0; // SUCCESS
  })),
  getGopherAuthValidationOptionsDestroy: jest.fn(() => jest.fn(() => 0)),
  getGopherAuthValidationOptionsSetScopes: jest.fn(() => jest.fn(() => 0)),
  getGopherAuthValidationOptionsSetAudience: jest.fn(() => jest.fn(() => 0)),
  getGopherAuthValidationOptionsSetClockSkew: jest.fn(() => jest.fn(() => 0)),
}));

describe('ValidationOptions', () => {
  describe('constructor', () => {
    it('should create a new instance', () => {
      const options = new ValidationOptions();
      expect(options).toBeInstanceOf(ValidationOptions);
      expect(options.isDestroyed()).toBe(false);
      options.destroy();
    });

    it('should have a valid handle after creation', () => {
      const options = new ValidationOptions();
      expect(options.getHandle()).not.toBeNull();
      options.destroy();
    });
  });

  describe('setScopes', () => {
    it('should return this for method chaining', () => {
      const options = new ValidationOptions();
      const result = options.setScopes('mcp:read mcp:write');
      expect(result).toBe(options);
      options.destroy();
    });

    it('should allow chaining multiple setScopes calls', () => {
      const options = new ValidationOptions();
      const result = options
        .setScopes('mcp:read')
        .setScopes('mcp:write');
      expect(result).toBe(options);
      options.destroy();
    });
  });

  describe('setAudience', () => {
    it('should return this for method chaining', () => {
      const options = new ValidationOptions();
      const result = options.setAudience('my-api');
      expect(result).toBe(options);
      options.destroy();
    });
  });

  describe('setClockSkew', () => {
    it('should return this for method chaining', () => {
      const options = new ValidationOptions();
      const result = options.setClockSkew(60);
      expect(result).toBe(options);
      options.destroy();
    });

    it('should accept zero clock skew', () => {
      const options = new ValidationOptions();
      const result = options.setClockSkew(0);
      expect(result).toBe(options);
      options.destroy();
    });

    it('should accept large clock skew values', () => {
      const options = new ValidationOptions();
      const result = options.setClockSkew(3600);
      expect(result).toBe(options);
      options.destroy();
    });
  });

  describe('fluent API chaining', () => {
    it('should support chaining all methods', () => {
      const options = new ValidationOptions()
        .setScopes('openid profile mcp:read')
        .setAudience('mcp-server')
        .setClockSkew(30);

      expect(options).toBeInstanceOf(ValidationOptions);
      expect(options.isDestroyed()).toBe(false);
      options.destroy();
    });
  });

  describe('destroy', () => {
    it('should mark options as destroyed', () => {
      const options = new ValidationOptions();
      expect(options.isDestroyed()).toBe(false);
      options.destroy();
      expect(options.isDestroyed()).toBe(true);
    });

    it('should be idempotent (safe to call multiple times)', () => {
      const options = new ValidationOptions();
      options.destroy();
      options.destroy();
      options.destroy();
      expect(options.isDestroyed()).toBe(true);
    });

    it('should return null handle after destroy', () => {
      const options = new ValidationOptions();
      options.destroy();
      expect(options.getHandle()).toBeNull();
    });
  });

  describe('error handling after destroy', () => {
    it('should throw when calling setScopes after destroy', () => {
      const options = new ValidationOptions();
      options.destroy();
      expect(() => options.setScopes('mcp:read')).toThrow('ValidationOptions has been destroyed');
    });

    it('should throw when calling setAudience after destroy', () => {
      const options = new ValidationOptions();
      options.destroy();
      expect(() => options.setAudience('api')).toThrow('ValidationOptions has been destroyed');
    });

    it('should throw when calling setClockSkew after destroy', () => {
      const options = new ValidationOptions();
      options.destroy();
      expect(() => options.setClockSkew(60)).toThrow('ValidationOptions has been destroyed');
    });
  });
});

describe('createValidationOptions', () => {
  it('should create options with default clock skew', () => {
    const options = createValidationOptions();
    expect(options).toBeInstanceOf(ValidationOptions);
    expect(options.isDestroyed()).toBe(false);
    options.destroy();
  });

  it('should create options with scopes', () => {
    const options = createValidationOptions('mcp:read mcp:write');
    expect(options).toBeInstanceOf(ValidationOptions);
    options.destroy();
  });

  it('should create options with custom clock skew', () => {
    const options = createValidationOptions(undefined, 120);
    expect(options).toBeInstanceOf(ValidationOptions);
    options.destroy();
  });

  it('should create options with scopes and custom clock skew', () => {
    const options = createValidationOptions('openid profile', 30);
    expect(options).toBeInstanceOf(ValidationOptions);
    options.destroy();
  });
});
