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
}

export interface GopherAgentConfigOptions {
  provider: string;
  model: string;
  apiKey?: string;
  serverConfig?: string;
  runtimeOptions?: GopherAgentRuntimeOptions;
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
  public readonly runtimeOptions?: GopherAgentRuntimeOptions;

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
    this.runtimeOptions = normalizeRuntimeOptions(options.runtimeOptions);
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
  private _runtimeOptions?: GopherAgentRuntimeOptions;

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
  runtimeOptions(options: GopherAgentRuntimeOptions): this {
    this._runtimeOptions = normalizeRuntimeOptions(options);
    return this;
  }

  /**
   * Set the MCP runtime bearer token.
   */
  accessToken(accessToken: string): this {
    this._runtimeOptions = normalizeRuntimeOptions({
      ...this._runtimeOptions,
      accessToken,
    });
    return this;
  }

  /**
   * Set dynamic MCP runtime headers.
   */
  headers(headers: Record<string, string>): this {
    this._runtimeOptions = normalizeRuntimeOptions({
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

function normalizeRuntimeOptions(
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

  if (accessToken === undefined && headers === undefined) {
    return undefined;
  }

  return {
    ...(accessToken !== undefined ? { accessToken } : {}),
    ...(headers !== undefined ? { headers } : {}),
  };
}
