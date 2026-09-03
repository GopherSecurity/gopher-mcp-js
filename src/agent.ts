/**
 * GopherAgent - Main entry point for the gopher-orch TypeScript SDK.
 *
 * Provides a clean, TypeScript-friendly interface to the gopher-orch agent functionality.
 *
 * @example
 * ```typescript
 * // Create an agent with API key
 * const agent = await GopherAgent.create(
 *   GopherAgentConfig.builder()
 *     .provider('AnthropicProvider')
 *     .model('claude-3-haiku-20240307')
 *     .apiKey('your-api-key')
 *     .build()
 * );
 *
 * // Run a query
 * const answer = agent.run('What time is it in Tokyo?');
 * console.log(answer);
 *
 * // Cleanup
 * agent.dispose();
 * ```
 *
 * @example
 * ```typescript
 * // Use try-finally for automatic cleanup
 * const agent = await GopherAgent.create(config);
 * try {
 *   const answer = agent.run('What time is it in Tokyo?');
 *   console.log(answer);
 * } finally {
 *   agent.dispose();
 * }
 * ```
 */

import {
  GopherAgentConfig,
  GopherAgentCreateOptions,
  GopherAgentRuntimeOptions,
  normalizeRuntimeOptions,
} from './config';
import { AgentResult, AgentResultStatus } from './result';
import { AgentError, TimeoutError } from './errors';
import { fetchGopherServerConfig, ServerConfigRoute } from './apiConfig';
import { GopherOrchLibrary } from './ffi/library';
import type { GopherOrchHandle, GopherOrchErrorInfoData } from './ffi/library';
import { resolveRuntimeOptionsWithOAuth } from './oauthResolver';
import { shouldSkipOAuthResolution } from './oauthRuntimeOptions';
import {
  GOPHER_AGENT_OAUTH_TEST_HOOKS,
  GopherAgentOAuthTestHooks,
} from './internalOAuthTestHooks';
import type { GopherAgentElicitationOptions } from './elicitation';
import { resolveElicitationActionSync } from './elicitationRuntime';

let initialized = false;
let cleanupHandlerRegistered = false;
const PROVIDER_AUTHORIZATION_RETRY_LIMIT = 1;
const PROVIDER_AUTHORIZATION_REQUIRED_CODE = 'PROVIDER_AUTHORIZATION_REQUIRED';

/**
 * Main agent class for interacting with the gopher-orch native library.
 */
export class GopherAgent {
  private handle: GopherOrchHandle;
  private disposed = false;
  private readonly elicitationOptions?: GopherAgentElicitationOptions;
  private readonly providerAuthorizationOrigins: ReadonlySet<string>;

  private constructor(
    handle: GopherOrchHandle,
    elicitationOptions?: GopherAgentElicitationOptions,
    providerAuthorizationOrigins?: Iterable<string>
  ) {
    this.handle = handle;
    this.elicitationOptions = elicitationOptions;
    this.providerAuthorizationOrigins = new Set(
      [...(providerAuthorizationOrigins ?? [])].filter(
        (origin) => origin.length > 0
      )
    );
  }

  /**
   * Initialize the gopher-orch library.
   *
   * Must be called before creating any agents. Called automatically by create() if not already
   * initialized.
   *
   * @throws {AgentError} if initialization fails
   */
  static init(): void {
    if (initialized) {
      return;
    }

    const lib = GopherOrchLibrary.getInstance();
    if (lib === null) {
      const loadError = GopherOrchLibrary.getLoadErrorMessage();
      throw new AgentError(
        `Failed to load gopher-orch native library.\n${loadError}`
      );
    }

    initialized = true;
    setupCleanupHandler();
  }

  /**
   * Shutdown the gopher-orch library.
   *
   * Called automatically on process exit, but can be called manually.
   */
  static shutdown(): void {
    initialized = false;
  }

  /**
   * Check if the library is initialized.
   */
  static isInitialized(): boolean {
    return initialized;
  }

  /**
   * Create a new GopherAgent instance.
   *
   * @param config Agent configuration
   * @returns GopherAgent instance
   * @throws {AgentError} if agent creation fails
   */
  static async create(config: GopherAgentConfig): Promise<GopherAgent> {
    if (config.hasApiKey()) {
      return GopherAgent.createFromApiConfig(
        config.provider,
        config.model,
        config.apiKey!,
        undefined,
        config.runtimeOptions
      );
    }

    const runtimeOptions = await resolveRuntimeOptionsForServerConfig(
      config.serverConfig!,
      config.runtimeOptions
    );
    return GopherAgent.createFromFfi(
      (lib) =>
        lib.agentCreateByJson(
          config.provider,
          config.model,
          config.serverConfig!,
          nativeCreateOptions(runtimeOptions)
        ),
      effectiveElicitationOptions(runtimeOptions),
      oauthAuthorizationOriginsFromOptions(runtimeOptions)
    );
  }

  /**
   * @deprecated Use {@link GopherAgent.create}. It returns a Promise.
   */
  static createAsync(config: GopherAgentConfig): Promise<GopherAgent> {
    return GopherAgent.create(config);
  }

  /**
   * Create a new GopherAgent with API key.
   *
   * @param provider Provider name (e.g., "AnthropicProvider")
   * @param model Model name (e.g., "claude-3-haiku-20240307")
   * @param apiKey API key for fetching remote server config
   * @returns GopherAgent instance
   */
  static createWithApiKey(
    provider: string,
    model: string,
    apiKey: string,
    options?: GopherAgentCreateOptions
  ): Promise<GopherAgent> {
    const builder = GopherAgentConfig.builder()
      .provider(provider)
      .model(model)
      .apiKey(apiKey);
    if (options !== undefined) {
      builder.runtimeOptions(options);
    }
    return GopherAgent.create(builder.build());
  }

  /**
   * Create a new GopherAgent with JSON server config.
   *
   * @param provider Provider name (e.g., "AnthropicProvider")
   * @param model Model name (e.g., "claude-3-haiku-20240307")
   * @param serverConfig JSON server configuration
   * @returns GopherAgent instance
   */
  static async createWithServerConfig(
    provider: string,
    model: string,
    serverConfig: string,
    options?: GopherAgentCreateOptions
  ): Promise<GopherAgent> {
    const runtimeOptions = await resolveRuntimeOptionsForServerConfig(
      serverConfig,
      options
    );
    return GopherAgent.createFromFfi(
      (lib) =>
        lib.agentCreateByJson(
          provider,
          model,
          serverConfig,
          nativeCreateOptions(runtimeOptions)
        ),
      effectiveElicitationOptions(runtimeOptions),
      oauthAuthorizationOriginsFromOptions(runtimeOptions)
    );
  }

  /**
   * Create a new GopherAgent scoped to a single MCP server by id.
   *
   * Fetches server config from the Gopher API using the Bearer api key,
   * appending "?serverId={serverId}" so the response carries only the
   * matching MCP server entry.
   *
   * @param provider Provider name (e.g., "AnthropicProvider")
   * @param model Model identifier accepted by the chosen provider
   * @param apiKey Gopher API key
   * @param serverId MCP server id to scope the agent to
   * @returns GopherAgent instance
   */
  static createWithServerId(
    provider: string,
    model: string,
    apiKey: string,
    serverId: string,
    options?: GopherAgentCreateOptions
  ): Promise<GopherAgent> {
    return GopherAgent.createFromApiConfig(
      provider,
      model,
      apiKey,
      { key: 'serverId', value: serverId },
      options
    );
  }

  /**
   * Create a new GopherAgent scoped to a single MCP server by name.
   *
   * Fetches server config from the Gopher API using the Bearer api key,
   * appending "?serverName={serverName}" so the response carries only
   * the matching MCP server entry.
   *
   * @param provider Provider name (e.g., "AnthropicProvider")
   * @param model Model identifier accepted by the chosen provider
   * @param apiKey Gopher API key
   * @param serverName MCP server name to scope the agent to
   * @returns GopherAgent instance
   */
  static createWithServerName(
    provider: string,
    model: string,
    apiKey: string,
    serverName: string,
    options?: GopherAgentCreateOptions
  ): Promise<GopherAgent> {
    return GopherAgent.createFromApiConfig(
      provider,
      model,
      apiKey,
      { key: 'serverName', value: serverName },
      options
    );
  }

  /**
   * Create a new GopherAgent scoped to a single MCP gateway by id.
   *
   * Fetches server config from the Gopher API using the Bearer api key,
   * appending "?gatewayId={gatewayId}" so the response carries the
   * backing MCP servers for that gateway.
   *
   * @param provider Provider name (e.g., "AnthropicProvider")
   * @param model Model identifier accepted by the chosen provider
   * @param apiKey Gopher API key
   * @param gatewayId MCP gateway id to scope the agent to
   * @returns GopherAgent instance
   */
  static createWithGatewayId(
    provider: string,
    model: string,
    apiKey: string,
    gatewayId: string,
    options?: GopherAgentCreateOptions
  ): Promise<GopherAgent> {
    return GopherAgent.createFromApiConfig(
      provider,
      model,
      apiKey,
      { key: 'gatewayId', value: gatewayId },
      options
    );
  }

  /**
   * Create a new GopherAgent scoped to a single MCP gateway by name.
   *
   * Fetches server config from the Gopher API using the Bearer api key,
   * appending "?gatewayName={gatewayName}" so the response carries the
   * backing MCP servers for that gateway.
   *
   * @param provider Provider name (e.g., "AnthropicProvider")
   * @param model Model identifier accepted by the chosen provider
   * @param apiKey Gopher API key
   * @param gatewayName MCP gateway name to scope the agent to
   * @returns GopherAgent instance
   */
  static createWithGatewayName(
    provider: string,
    model: string,
    apiKey: string,
    gatewayName: string,
    options?: GopherAgentCreateOptions
  ): Promise<GopherAgent> {
    return GopherAgent.createFromApiConfig(
      provider,
      model,
      apiKey,
      { key: 'gatewayName', value: gatewayName },
      options
    );
  }

  /**
   * Create a new GopherAgent for a single MCP server reachable at a URL.
   *
   * Skips the remote config fetch entirely: synthesises an http_sse server
   * entry around the URL and delegates to createByJson. Useful for local
   * development or one-off endpoints where the operator already knows the
   * URL.
   *
   * @param provider Provider name (e.g., "AnthropicProvider")
   * @param model Model identifier accepted by the chosen provider
   * @param url Full URL of the MCP server (e.g., "http://127.0.0.1:8080/mcp")
   * @returns GopherAgent instance
   */
  static async createWithUrl(
    provider: string,
    model: string,
    url: string,
    options?: GopherAgentCreateOptions
  ): Promise<GopherAgent> {
    const runtimeOptions = normalizeRuntimeOptions(options);
    const createOptions = mergeCreateOptions(runtimeOptions, options);

    if (
      url.length === 0 ||
      shouldSkipOAuthResolution({ oauth: options?.oauth, runtimeOptions })
    ) {
      return GopherAgent.createFromFfi(
        (lib) =>
          lib.agentCreateByUrl(
            provider,
            model,
            url,
            nativeCreateOptions(createOptions)
          ),
        effectiveElicitationOptions(createOptions)
      );
    }

    const resolvedOptions = await resolveRuntimeOptionsWithOAuth({
      urls: [url],
      runtimeOptions,
      oauth: options?.oauth ?? {},
      hooks: oauthTestHooks(options),
    });
    const resolvedCreateOptions = mergeCreateOptions(resolvedOptions, options);
    return GopherAgent.createFromFfi(
      (lib) =>
        lib.agentCreateByUrl(
          provider,
          model,
          url,
          nativeCreateOptions(resolvedCreateOptions)
        ),
      effectiveElicitationOptions(resolvedCreateOptions),
      oauthAuthorizationOriginsFromOptions(resolvedOptions)
    );
  }

  /**
   * Shared handle-creation pump for factories that bypass GopherAgentConfig.
   *
   * Ensures the native library is initialised, invokes the supplied FFI
   * call, and translates a nullptr return into AgentError using the
   * same lastError + clearError contract as create().
   */
  private static createFromFfi(
    createHandle: (lib: GopherOrchLibrary) => GopherOrchHandle | null,
    elicitationOptions?: GopherAgentElicitationOptions,
    providerAuthorizationOrigins?: string[]
  ): GopherAgent {
    if (!initialized) {
      GopherAgent.init();
    }

    const lib = GopherOrchLibrary.getInstance();
    if (lib === null) {
      const loadError = GopherOrchLibrary.getLoadErrorMessage();
      throw new AgentError(`Native library not available.\n${loadError}`);
    }

    let handle: GopherOrchHandle | null;
    try {
      handle = createHandle(lib);
    } catch (e) {
      throw new AgentError(`Failed to create agent: ${(e as Error).message}`);
    }

    if (handle === null) {
      const errorInfo = lib.lastError();
      lib.clearError();
      throw new AgentError(buildCreateErrorMessage(errorInfo));
    }

    return new GopherAgent(
      handle,
      elicitationOptions,
      providerAuthorizationOrigins
    );
  }

  private static async createFromApiConfig(
    provider: string,
    model: string,
    apiKey: string,
    route?: ServerConfigRoute,
    options?: GopherAgentCreateOptions
  ): Promise<GopherAgent> {
    const serverConfig = await fetchGopherServerConfig(apiKey, route);
    const runtimeOptions = await resolveRuntimeOptionsForServerConfig(
      serverConfig,
      options
    );
    return GopherAgent.createFromFfi(
      (lib) =>
        lib.agentCreateByJson(
          provider,
          model,
          serverConfig,
          nativeCreateOptions(runtimeOptions)
        ),
      effectiveElicitationOptions(runtimeOptions),
      oauthAuthorizationOriginsFromOptions(runtimeOptions)
    );
  }

  /**
   * Run a query against the agent.
   *
   * @param query The user query to process
   * @param timeoutMs Timeout in milliseconds (default: 60000)
   * @returns The agent's response
   * @throws {AgentError} if the query fails
   */
  run(query: string, timeoutMs = 60000): string {
    this.ensureNotDisposed();

    const lib = GopherOrchLibrary.getInstance();
    if (lib === null) {
      throw new AgentError('Native library not available');
    }

    try {
      const response = this.runAgentOnce(lib, query, timeoutMs);
      const authorizationUrl = extractProviderAuthorizationUrl(
        response,
        this.providerAuthorizationOrigins
      );
      if (authorizationUrl !== undefined) {
        const action = resolveElicitationActionSync(
          this.elicitationOptions ?? {},
          {
            mode: 'url',
            url: authorizationUrl,
            message: 'Connect provider account',
          }
        );
        if (action === 'accept') {
          const retryResponse = this.retryAfterProviderAuthorization(
            lib,
            query,
            timeoutMs
          );
          return retryResponse;
        }
      }
      return response;
    } catch (e) {
      if (e instanceof AgentError) {
        throw e;
      }
      throw new AgentError(`Query execution failed: ${(e as Error).message}`);
    }
  }

  private runAgentOnce(
    lib: GopherOrchLibrary,
    query: string,
    timeoutMs: number
  ): string {
    const response = lib.agentRun(this.handle, query, timeoutMs);
    if (response === null) {
      const errorInfo = lib.lastError();
      lib.clearError();
      throw new AgentError(buildRunErrorMessage(errorInfo, query));
    }
    return response;
  }

  private retryAfterProviderAuthorization(
    lib: GopherOrchLibrary,
    query: string,
    timeoutMs: number
  ): string {
    let response = '';
    for (
      let attempt = 0;
      attempt < PROVIDER_AUTHORIZATION_RETRY_LIMIT;
      attempt++
    ) {
      response = this.runAgentOnce(lib, query, timeoutMs);
      if (
        extractProviderAuthorizationUrl(
          response,
          this.providerAuthorizationOrigins
        ) === undefined
      ) {
        return response;
      }
    }
    throw new AgentError(
      'Provider authorization is still required after the configured elicitation was accepted.',
      PROVIDER_AUTHORIZATION_REQUIRED_CODE
    );
  }

  /**
   * Run a query with detailed result information.
   *
   * @param query The user query to process
   * @param timeoutMs Timeout in milliseconds (default: 60000)
   * @returns AgentResult with response and metadata
   */
  runDetailed(query: string, timeoutMs = 60000): AgentResult {
    try {
      const response = this.run(query, timeoutMs);
      return AgentResult.builder()
        .response(response)
        .status(AgentResultStatus.SUCCESS)
        .iterationCount(1)
        .tokensUsed(0)
        .build();
    } catch (e) {
      if (e instanceof TimeoutError) {
        return AgentResult.timeout((e as Error).message);
      }
      return AgentResult.error((e as Error).message);
    }
  }

  /**
   * Dispose of the agent and free resources.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    const lib = GopherOrchLibrary.getInstance();
    if (lib !== null && this.handle !== null) {
      lib.agentRelease(this.handle);
    }
  }

  /**
   * Check if agent is disposed.
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new AgentError('Agent has been disposed');
    }
  }
}

function setupCleanupHandler(): void {
  if (cleanupHandlerRegistered) {
    return;
  }

  cleanupHandlerRegistered = true;
  process.on('exit', () => {
    GopherAgent.shutdown();
  });
}

async function resolveRuntimeOptionsForServerConfig(
  serverConfig: string,
  options?: GopherAgentCreateOptions
): Promise<GopherAgentCreateOptions | undefined> {
  const runtimeOptions = normalizeRuntimeOptions(options);
  if (shouldSkipOAuthResolution({ oauth: options?.oauth, runtimeOptions })) {
    return mergeCreateOptions(runtimeOptions, options);
  }

  const resolvedOptions = await resolveRuntimeOptionsWithOAuth({
    urls: [],
    serverConfig,
    runtimeOptions,
    oauth: options?.oauth ?? {},
    hooks: oauthTestHooks(options),
  });
  return mergeCreateOptions(resolvedOptions, options);
}

function mergeCreateOptions(
  runtimeOptions?: GopherAgentRuntimeOptions,
  options?: GopherAgentCreateOptions
): GopherAgentCreateOptions | undefined {
  const oauthAuthorizationOrigins = oauthAuthorizationOriginsFromOptions(
    runtimeOptions
  );
  const merged = {
    ...(runtimeOptions ?? {}),
    ...(options?.elicitation !== undefined
      ? { elicitation: options.elicitation }
      : {}),
    ...(options?.elicitation === undefined &&
    oauthAuthorizationOrigins !== undefined &&
    oauthAuthorizationOrigins.length > 0
      ? { elicitation: {} }
      : {}),
  };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function effectiveElicitationOptions(
  options?: GopherAgentCreateOptions
): GopherAgentElicitationOptions | undefined {
  return options?.elicitation;
}

function oauthAuthorizationOriginsFromOptions(
  options?: GopherAgentRuntimeOptions
): string[] | undefined {
  return options?.oauthAuthorizationOrigins;
}

function nativeCreateOptions(
  options?: GopherAgentCreateOptions
): GopherAgentCreateOptions | undefined {
  if (options === undefined) {
    return undefined;
  }
  const { oauthAuthorizationOrigins: _oauthAuthorizationOrigins, ...native } =
    options;
  return Object.keys(native).length > 0 ? native : undefined;
}

function extractProviderAuthorizationUrl(
  response: string,
  allowedOrigins: ReadonlySet<string>
): string | undefined {
  if (allowedOrigins.size === 0) {
    return undefined;
  }
  const matches = response.match(/https?:\/\/[^\s<>)"]+/g);
  if (!matches) {
    return undefined;
  }

  for (const match of matches) {
    const url = match.replace(/[.,;:!?]+$/, '');
    try {
      const parsed = new URL(url);
      if (
        allowedOrigins.has(parsed.origin) &&
        parsed.searchParams.has('client_id') &&
        parsed.searchParams.has('redirect_uri') &&
        parsed.searchParams.get('response_type') === 'code'
      ) {
        return url;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

function oauthTestHooks(
  options: GopherAgentCreateOptions | undefined
): GopherAgentOAuthTestHooks | undefined {
  return (
    options?.oauth as
      | ({ [GOPHER_AGENT_OAUTH_TEST_HOOKS]?: GopherAgentOAuthTestHooks })
      | undefined
  )?.[GOPHER_AGENT_OAUTH_TEST_HOOKS];
}

/**
 * Build the AgentError message for a nullptr return from native create*().
 *
 * The native side fills `gopher_orch_last_error` for explicit failures
 * (unsupported provider, fetchMcpServers failure, etc.) but a few paths —
 * notably the empty-registry guard in gopher-orch's createByJson — return
 * nullptr with only a warning logged and no last_error set. For those, we
 * surface an actionable fallback instead of the bare "Failed to create
 * agent" string that earlier versions of the SDK emitted.
 *
 * @internal exported for unit tests only — not part of the public surface.
 */
export function buildCreateErrorMessage(
  errorInfo: GopherOrchErrorInfoData | null
): string {
  // A populated lastError trumps the generic fallback.
  if (errorInfo && errorInfo.message) {
    const details = errorInfo.details ? `: ${errorInfo.details}` : '';
    return `${errorInfo.message}${details}`;
  }

  // No message was set — most likely the gopher-orch empty-registry guard
  // returned null after every configured MCP server failed connection or
  // discovery. Tell the caller what to check.
  return (
    'Failed to create agent: native library returned null without a ' +
    'specific error. Most often this means every configured MCP server ' +
    'failed to connect or returned no tools (TLS / network / bad URL), ' +
    'or the LLM provider could not be initialized. Set GOPHER_DEBUG=1 to ' +
    'see native-side logs.'
  );
}

function buildRunErrorMessage(
  errorInfo: GopherOrchErrorInfoData | null,
  query: string
): string {
  if (errorInfo && errorInfo.message) {
    const details = errorInfo.details ? `: ${errorInfo.details}` : '';
    return `${errorInfo.message}${details}`;
  }

  return `No response for query: "${query}"`;
}
