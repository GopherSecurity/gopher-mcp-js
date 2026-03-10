/**
 * Configuration loader for Auth MCP Server
 *
 * Mirrors AuthServerConfig from the C++ example:
 * /gopher-orch/examples/auth/auth_server_config.h
 */

import fs from 'fs';
import path from 'path';

/**
 * Server configuration interface
 */
export interface AuthServerConfig {
  // Server settings
  host: string;
  port: number;
  serverUrl: string;

  // OAuth/IDP settings
  authServerUrl: string;
  jwksUri: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;

  // Direct OAuth endpoint URLs
  oauthAuthorizeUrl: string;
  oauthTokenUrl: string;

  // Scopes
  allowedScopes: string;

  // Cache settings
  jwksCacheDuration: number;
  jwksAutoRefresh: boolean;
  requestTimeout: number;

  // Auth bypass mode
  authDisabled: boolean;
}

/**
 * Parse a configuration file in key=value format
 *
 * @param content - Raw file content
 * @returns Parsed key-value map
 */
export function parseConfigFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.substring(0, eqIndex).trim();
    const value = trimmed.substring(eqIndex + 1).trim();

    if (key) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Load and parse configuration from a file
 *
 * @param configPath - Path to the configuration file
 * @returns Parsed AuthServerConfig
 * @throws Error if file not found or required fields missing
 */
export function loadConfigFromFile(configPath: string): AuthServerConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  const configMap = parseConfigFile(content);

  return buildConfig(configMap);
}

/**
 * Load configuration from the default location relative to a base path
 *
 * @param basePath - Base path (typically __dirname or process executable path)
 * @returns Parsed AuthServerConfig
 */
export function loadConfigFromDefaultLocation(
  basePath: string
): AuthServerConfig {
  const configPath = path.join(basePath, 'server.config');
  return loadConfigFromFile(configPath);
}

/**
 * Build AuthServerConfig from a parsed key-value map
 *
 * @param configMap - Parsed configuration map
 * @returns AuthServerConfig object
 * @throws Error if required fields are missing (when auth is enabled)
 */
export function buildConfig(
  configMap: Record<string, string>
): AuthServerConfig {
  const port = parseInt(configMap.port || '3001', 10);

  const config: AuthServerConfig = {
    // Server settings
    host: configMap.host || '0.0.0.0',
    port,
    serverUrl: configMap.server_url || `http://localhost:${port}`,

    // OAuth/IDP settings
    authServerUrl: configMap.auth_server_url || '',
    jwksUri: configMap.jwks_uri || '',
    issuer: configMap.issuer || '',
    clientId: configMap.client_id || '',
    clientSecret: configMap.client_secret || '',
    tokenEndpoint: configMap.token_endpoint || '',

    // Direct OAuth endpoint URLs
    oauthAuthorizeUrl: configMap.oauth_authorize_url || '',
    oauthTokenUrl: configMap.oauth_token_url || '',

    // Scopes
    allowedScopes:
      configMap.allowed_scopes || 'openid profile email mcp:read mcp:admin',

    // Cache settings
    jwksCacheDuration: parseInt(configMap.jwks_cache_duration || '3600', 10),
    jwksAutoRefresh: configMap.jwks_auto_refresh !== 'false',
    requestTimeout: parseInt(configMap.request_timeout || '30', 10),

    // Auth bypass mode
    authDisabled: configMap.auth_disabled === 'true',
  };

  // Derive endpoints from auth_server_url if not explicitly set
  if (config.authServerUrl) {
    if (!config.jwksUri) {
      config.jwksUri = `${config.authServerUrl}/protocol/openid-connect/certs`;
    }
    if (!config.tokenEndpoint) {
      config.tokenEndpoint = `${config.authServerUrl}/protocol/openid-connect/token`;
    }
    if (!config.issuer) {
      config.issuer = config.authServerUrl;
    }
    if (!config.oauthAuthorizeUrl) {
      config.oauthAuthorizeUrl = `${config.authServerUrl}/protocol/openid-connect/auth`;
    }
    if (!config.oauthTokenUrl) {
      config.oauthTokenUrl = `${config.authServerUrl}/protocol/openid-connect/token`;
    }
  }

  // Validate required fields when auth is enabled
  if (!config.authDisabled) {
    validateRequiredFields(config);
  }

  return config;
}

/**
 * Validate that required configuration fields are present
 *
 * @param config - Configuration to validate
 * @throws Error if required fields are missing
 */
function validateRequiredFields(config: AuthServerConfig): void {
  const errors: string[] = [];

  if (!config.clientId) {
    errors.push('client_id is required when auth is enabled');
  }
  if (!config.clientSecret) {
    errors.push('client_secret is required when auth is enabled');
  }
  if (!config.jwksUri && !config.authServerUrl) {
    errors.push('jwks_uri or auth_server_url is required when auth is enabled');
  }

  if (errors.length > 0) {
    throw new Error(
      `Configuration validation failed:\n  - ${errors.join('\n  - ')}`
    );
  }
}

/**
 * Create a default configuration for testing or development
 *
 * @param overrides - Optional overrides for default values
 * @returns AuthServerConfig with defaults
 */
export function createDefaultConfig(
  overrides: Partial<AuthServerConfig> = {}
): AuthServerConfig {
  return {
    host: '0.0.0.0',
    port: 3001,
    serverUrl: 'http://localhost:3001',
    authServerUrl: '',
    jwksUri: '',
    issuer: '',
    clientId: '',
    clientSecret: '',
    tokenEndpoint: '',
    oauthAuthorizeUrl: '',
    oauthTokenUrl: '',
    allowedScopes: 'openid profile email mcp:read mcp:admin',
    jwksCacheDuration: 3600,
    jwksAutoRefresh: true,
    requestTimeout: 30,
    authDisabled: true,
    ...overrides,
  };
}
