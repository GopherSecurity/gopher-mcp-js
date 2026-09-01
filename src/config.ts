import type { OAuthFlowHooks, OAuthResolverHooks } from './oauthResolver';

/**
 * Configuration options for creating a GopherAgent.
 */
export interface GopherAgentRuntimeOptions {
  /**
   * MCP runtime bearer token. Native gopher-orch maps this to
   * Authorization: Bearer <token> unless headers.Authorization is supplied.
   */
  accessToken?: string;
  /**
   * Dynamic MCP runtime headers applied when connecting to MCP servers.
   */
  headers?: Record<string, string>;
  /**
   * Dynamic MCP runtime options scoped to matching server config entries.
   * Native matching order is serverId, then serverName, then exact url.
   */
  serverOptions?: GopherAgentServerRuntimeOptions[];
}

export interface GopherAgentServerRuntimeOptions {
  serverId?: string;
  serverName?: string;
  name?: string;
  url?: string;
  accessToken?: string;
  headers?: Record<string, string>;
}

export type GopherAgentOAuthMode = 'auto' | 'disabled';

export interface GopherAgentTokenRecord {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt?: number;
  scope?: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
}

export interface GopherAgentTokenStore {
  get(key: string): Promise<GopherAgentTokenRecord | undefined>;
  set(key: string, token: GopherAgentTokenRecord): Promise<void>;
  delete?(key: string): Promise<void>;
}

export interface GopherAgentOAuthOptions {
  mode?: GopherAgentOAuthMode;
  scopes?: string[];
  clientName?: string;
  redirectUri?: string;
  openBrowser?: boolean;
  tokenStore?: GopherAgentTokenStore;
  /** @internal Test-only overrides for OAuth network and browser operations. */
  hooks?: Partial<OAuthResolverHooks & OAuthFlowHooks>;
}

export interface GopherAgentCreateOptions extends GopherAgentRuntimeOptions {
  oauth?: GopherAgentOAuthOptions;
}

export interface GopherAgentConfigOptions {
  provider: string;
  model: string;
  apiKey?: string;
  serverConfig?: string;
  runtimeOptions?: GopherAgentCreateOptions;
}

/**
 * Configuration for creating a GopherAgent via GopherAgent.create().
 *
 * The builder accepts the apiKey / serverConfig XOR plus optional MCP
 * runtime headers. The routing factories that take server/gateway
 * identifiers are exposed as static methods on GopherAgent because their
 * additional inputs do not fit this config shape.
 */
export class GopherAgentConfig {
  public readonly provider: string;
  public readonly model: string;
  public readonly apiKey?: string;
  public readonly serverConfig?: string;
  public readonly runtimeOptions?: GopherAgentCreateOptions;

  private constructor(options: GopherAgentConfigOptions) {
    if (!options.provider) {
      throw new Error('Provider is required');
    }
    if (!options.model) {
      throw new Error('Model is required');
    }
    if (!options.apiKey && !options.serverConfig) {
      throw new Error('Either apiKey or serverConfig is required');
    }
    if (options.apiKey && options.serverConfig) {
      throw new Error('Cannot specify both apiKey and serverConfig');
    }

    this.provider = options.provider;
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.serverConfig = options.serverConfig;
    this.runtimeOptions = normalizeCreateOptions(options.runtimeOptions);
  }

  /**
   * Check if this config uses an API key.
   */
  hasApiKey(): boolean {
    return this.apiKey !== undefined;
  }

  /**
   * Check if this config uses a server config.
   */
  hasServerConfig(): boolean {
    return this.serverConfig !== undefined;
  }

  /**
   * Create a new builder for GopherAgentConfig.
   */
  static builder(): GopherAgentConfigBuilder {
    return new GopherAgentConfigBuilder();
  }
}

/**
 * Builder for GopherAgentConfig.
 */
export class GopherAgentConfigBuilder {
  private _provider?: string;
  private _model?: string;
  private _apiKey?: string;
  private _serverConfig?: string;
  private _runtimeOptions?: GopherAgentCreateOptions;

  /**
   * Set the LLM provider (e.g., "AnthropicProvider").
   */
  provider(provider: string): this {
    this._provider = provider;
    return this;
  }

  /**
   * Set the model name (e.g., "claude-3-haiku-20240307").
   */
  model(model: string): this {
    this._model = model;
    return this;
  }

  /**
   * Set the API key for fetching remote server config.
   * Mutually exclusive with serverConfig.
   */
  apiKey(apiKey: string): this {
    this._apiKey = apiKey;
    return this;
  }

  /**
   * Set the JSON server configuration.
   * Mutually exclusive with apiKey.
   */
  serverConfig(serverConfig: string): this {
    this._serverConfig = serverConfig;
    return this;
  }

  /**
   * Set MCP runtime options passed to native gopher-orch.
   */
  runtimeOptions(options: GopherAgentCreateOptions): this {
    this._runtimeOptions = normalizeCreateOptions(options);
    return this;
  }

  /**
   * Set the MCP runtime bearer token.
   */
  accessToken(accessToken: string): this {
    this._runtimeOptions = normalizeCreateOptions({
      ...this._runtimeOptions,
      accessToken,
    });
    return this;
  }

  /**
   * Set dynamic MCP runtime headers.
   */
  headers(headers: Record<string, string>): this {
    this._runtimeOptions = normalizeCreateOptions({
      ...this._runtimeOptions,
      headers,
    });
    return this;
  }

  /**
   * Build the GopherAgentConfig.
   */
  build(): GopherAgentConfig {
    return new (GopherAgentConfig as unknown as {
      new (options: GopherAgentConfigOptions): GopherAgentConfig;
    })({
      provider: this._provider ?? '',
      model: this._model ?? '',
      apiKey: this._apiKey,
      serverConfig: this._serverConfig,
      runtimeOptions: this._runtimeOptions,
    });
  }
}

function normalizeCreateOptions(
  options?: GopherAgentCreateOptions
): GopherAgentCreateOptions | undefined {
  if (options === undefined) {
    return undefined;
  }

  const runtimeOptions = normalizeRuntimeOptions(options);
  const oauth = options.oauth !== undefined ? { oauth: options.oauth } : {};
  if (runtimeOptions === undefined && options.oauth === undefined) {
    return undefined;
  }

  return {
    ...(runtimeOptions ?? {}),
    ...oauth,
  };
}

export function normalizeRuntimeOptions(
  options?: GopherAgentRuntimeOptions
): GopherAgentRuntimeOptions | undefined {
  if (options === undefined) {
    return undefined;
  }

  const accessToken =
    options.accessToken !== undefined && options.accessToken.length > 0
      ? options.accessToken
      : undefined;
  const headers =
    options.headers !== undefined && Object.keys(options.headers).length > 0
      ? { ...options.headers }
      : undefined;
  const serverOptions = normalizeServerRuntimeOptions(options.serverOptions);

  if (
    accessToken === undefined &&
    headers === undefined &&
    serverOptions === undefined
  ) {
    return undefined;
  }

  return {
    ...(accessToken !== undefined ? { accessToken } : {}),
    ...(headers !== undefined ? { headers } : {}),
    ...(serverOptions !== undefined ? { serverOptions } : {}),
  };
}

function normalizeServerRuntimeOptions(
  options?: GopherAgentServerRuntimeOptions[]
): GopherAgentServerRuntimeOptions[] | undefined {
  if (options === undefined) {
    return undefined;
  }

  const normalized = options
    .map((option) => {
      const accessToken =
        option.accessToken !== undefined && option.accessToken.length > 0
          ? option.accessToken
          : undefined;
      const headers =
        option.headers !== undefined && Object.keys(option.headers).length > 0
          ? { ...option.headers }
          : undefined;
      return {
        ...(option.serverId !== undefined && option.serverId.length > 0
          ? { serverId: option.serverId }
          : {}),
        ...(option.serverName !== undefined && option.serverName.length > 0
          ? { serverName: option.serverName }
          : {}),
        ...(option.name !== undefined && option.name.length > 0
          ? { name: option.name }
          : {}),
        ...(option.url !== undefined && option.url.length > 0
          ? { url: option.url }
          : {}),
        ...(accessToken !== undefined ? { accessToken } : {}),
        ...(headers !== undefined ? { headers } : {}),
      };
    })
    .filter(
      (option) =>
        option.serverId !== undefined ||
        option.serverName !== undefined ||
        option.name !== undefined ||
        option.url !== undefined ||
        option.accessToken !== undefined ||
        option.headers !== undefined
    );

  return normalized.length > 0 ? normalized : undefined;
}
