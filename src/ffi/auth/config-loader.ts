/**
 * GopherAuthConfig - High-level wrapper for auth configuration loading
 *
 * Provides a TypeScript-friendly API for loading auth server configuration
 * from files, environment variables, or inline key-value pairs. Uses the
 * C++ core ConfigLoader which handles INI parsing, Keycloak endpoint
 * derivation, and validation.
 */

import {
  loadLibrary,
  isLibraryLoaded,
  configCreate,
  configDestroy,
  configLoadFile,
  configLoadEnv,
  configLoadFromPairs,
  configValidate,
  configGetString,
  configGetInt,
  configGetBool,
  configGetExchangeIdps,
} from './loader';

/**
 * Auth server configuration loaded via native ConfigLoader
 */
export class GopherAuthConfig {
  private handle: unknown = null;
  private destroyed = false;

  private constructor(handle: unknown) {
    this.handle = handle;
  }

  /**
   * Load configuration from an INI-style config file
   *
   * The file format is key = value with # comments. Keys are normalized
   * to lowercase with - replaced by _. After loading, Keycloak endpoints
   * are auto-derived from auth_server_url if not explicitly set.
   *
   * @param filepath - Path to config file
   * @returns GopherAuthConfig instance
   * @throws Error if file not found or validation fails
   */
  static loadFile(filepath: string): GopherAuthConfig {
    if (!isLibraryLoaded()) {
      loadLibrary();
    }

    const handle = configCreate();
    if (!handle) {
      throw new Error('Failed to create config handle');
    }

    const loadResult = configLoadFile(handle, filepath);
    if (loadResult !== 0) {
      configDestroy(handle);
      throw new Error(`Failed to load config file: ${filepath}`);
    }

    const validateResult = configValidate(handle);
    if (validateResult !== 0) {
      // Check if auth is disabled (validation is skipped)
      const disabled = configGetBool(handle, 'auth_disabled');
      if (!disabled) {
        configDestroy(handle);
        throw new Error('Configuration validation failed');
      }
    }

    return new GopherAuthConfig(handle);
  }

  /**
   * Load configuration from environment variables
   *
   * Reads: GOPHER_CLIENT_ID, GOPHER_CLIENT_SECRET, GOPHER_AUTH_SERVER_URL,
   * JWKS_URI, TOKEN_ISSUER, OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL,
   * SERVER_HOST, SERVER_PORT, SERVER_URL, EXCHANGE_IDPS, ALLOWED_SCOPES,
   * JWKS_CACHE_DURATION, JWKS_AUTO_REFRESH, REQUEST_TIMEOUT,
   * GOPHER_AUTH_DISABLED
   *
   * @returns GopherAuthConfig instance
   * @throws Error if validation fails
   */
  static loadEnv(): GopherAuthConfig {
    if (!isLibraryLoaded()) {
      loadLibrary();
    }

    const handle = configCreate();
    if (!handle) {
      throw new Error('Failed to create config handle');
    }

    configLoadEnv(handle);
    configValidate(handle);

    return new GopherAuthConfig(handle);
  }

  /**
   * Load configuration from inline key-value pairs
   *
   * Keys follow the same naming as config file keys (snake_case).
   * After loading, Keycloak endpoints are auto-derived.
   *
   * @param pairs - Key-value pairs (e.g., { auth_server_url: '...', client_id: '...' })
   * @returns GopherAuthConfig instance
   * @throws Error if validation fails
   */
  static loadFromPairs(pairs: Record<string, string>): GopherAuthConfig {
    if (!isLibraryLoaded()) {
      loadLibrary();
    }

    const handle = configCreate();
    if (!handle) {
      throw new Error('Failed to create config handle');
    }

    const keys = Object.keys(pairs);
    const values = keys.map((k) => pairs[k] ?? '');

    const loadResult = configLoadFromPairs(handle, keys, values, keys.length);
    if (loadResult !== 0) {
      configDestroy(handle);
      throw new Error('Failed to load config from pairs');
    }

    const validateResult = configValidate(handle);
    if (validateResult !== 0) {
      const disabled = configGetBool(handle, 'auth_disabled');
      if (!disabled) {
        configDestroy(handle);
        throw new Error('Configuration validation failed');
      }
    }

    return new GopherAuthConfig(handle);
  }

  /**
   * Get a string configuration value
   * @param key - Config key (e.g., 'client_id', 'jwks_uri', 'server_url')
   */
  getString(key: string): string {
    this.ensureNotDestroyed();
    return configGetString(this.handle, key) ?? '';
  }

  /**
   * Get an integer configuration value
   * @param key - Config key (e.g., 'port', 'jwks_cache_duration')
   */
  getInt(key: string): number {
    this.ensureNotDestroyed();
    return configGetInt(this.handle, key);
  }

  /**
   * Get a boolean configuration value
   * @param key - Config key (e.g., 'auth_disabled', 'jwks_auto_refresh')
   */
  getBool(key: string): boolean {
    this.ensureNotDestroyed();
    return configGetBool(this.handle, key);
  }

  /**
   * Get exchange IDPs as an array of strings
   *
   * The C API returns a comma-separated string which is split here.
   */
  getExchangeIdps(): string[] {
    this.ensureNotDestroyed();
    const csv = configGetExchangeIdps(this.handle);
    if (!csv || csv.trim() === '') {
      return [];
    }
    return csv
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /**
   * Get the native config handle (for internal use)
   */
  getHandle(): unknown {
    this.ensureNotDestroyed();
    return this.handle;
  }

  /**
   * Destroy the config and release resources
   *
   * This method is idempotent - safe to call multiple times.
   */
  destroy(): void {
    if (this.destroyed || !this.handle) {
      return;
    }

    configDestroy(this.handle);
    this.handle = null;
    this.destroyed = true;
  }

  /**
   * Check if the config has been destroyed
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  private ensureNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error('GopherAuthConfig has been destroyed');
    }
  }
}
