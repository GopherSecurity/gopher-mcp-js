/**
 * Configuration options for creating a GopherAgent.
 */
export interface GopherAgentConfigOptions {
  provider: string;
  model: string;
  apiKey?: string;
  serverConfig?: string;
}

/**
 * Configuration for creating a GopherAgent.
 */
export class GopherAgentConfig {
  public readonly provider: string;
  public readonly model: string;
  public readonly apiKey?: string;
  public readonly serverConfig?: string;

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
    });
  }
}
