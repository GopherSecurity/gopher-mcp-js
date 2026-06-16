/**
 * GopherAgent - Main entry point for the gopher-orch TypeScript SDK.
 *
 * Provides a clean, TypeScript-friendly interface to the gopher-orch agent functionality.
 *
 * @example
 * ```typescript
 * // Create an agent with API key
 * const agent = GopherAgent.create(
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
 * const agent = GopherAgent.create(config);
 * try {
 *   const answer = agent.run('What time is it in Tokyo?');
 *   console.log(answer);
 * } finally {
 *   agent.dispose();
 * }
 * ```
 */

import { GopherAgentConfig } from './config';
import { AgentResult, AgentResultStatus } from './result';
import { AgentError, TimeoutError } from './errors';
import { GopherOrchLibrary, GopherOrchHandle } from './ffi';

let initialized = false;
let cleanupHandlerRegistered = false;

/**
 * Main agent class for interacting with the gopher-orch native library.
 */
export class GopherAgent {
  private handle: GopherOrchHandle;
  private disposed = false;

  private constructor(handle: GopherOrchHandle) {
    this.handle = handle;
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
      throw new AgentError('Failed to load gopher-orch native library');
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
  static create(config: GopherAgentConfig): GopherAgent {
    if (!initialized) {
      GopherAgent.init();
    }

    const lib = GopherOrchLibrary.getInstance();
    if (lib === null) {
      throw new AgentError('Native library not available');
    }

    let handle: GopherOrchHandle | null;
    try {
      if (config.hasApiKey()) {
        handle = lib.agentCreateByApiKey(
          config.provider,
          config.model,
          config.apiKey!
        );
      } else {
        handle = lib.agentCreateByJson(
          config.provider,
          config.model,
          config.serverConfig!
        );
      }
    } catch (e) {
      throw new AgentError(`Failed to create agent: ${(e as Error).message}`);
    }

    if (handle === null) {
      const errorInfo = lib.lastError();
      lib.clearError();
      if (errorInfo) {
        const details = errorInfo.details ? `: ${errorInfo.details}` : '';
        throw new AgentError(
          `${errorInfo.message ?? 'Failed to create agent'}${details}`
        );
      }
      throw new AgentError('Failed to create agent');
    }

    return new GopherAgent(handle);
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
    apiKey: string
  ): GopherAgent {
    return GopherAgent.create(
      GopherAgentConfig.builder()
        .provider(provider)
        .model(model)
        .apiKey(apiKey)
        .build()
    );
  }

  /**
   * Create a new GopherAgent with JSON server config.
   *
   * @param provider Provider name (e.g., "AnthropicProvider")
   * @param model Model name (e.g., "claude-3-haiku-20240307")
   * @param serverConfig JSON server configuration
   * @returns GopherAgent instance
   */
  static createWithServerConfig(
    provider: string,
    model: string,
    serverConfig: string
  ): GopherAgent {
    return GopherAgent.create(
      GopherAgentConfig.builder()
        .provider(provider)
        .model(model)
        .serverConfig(serverConfig)
        .build()
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
    serverId: string
  ): GopherAgent {
    return GopherAgent.createFromFfi((lib) =>
      lib.agentCreateByServerId(provider, model, apiKey, serverId)
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
    serverName: string
  ): GopherAgent {
    return GopherAgent.createFromFfi((lib) =>
      lib.agentCreateByServerName(provider, model, apiKey, serverName)
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
    gatewayId: string
  ): GopherAgent {
    return GopherAgent.createFromFfi((lib) =>
      lib.agentCreateByGatewayId(provider, model, apiKey, gatewayId)
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
    gatewayName: string
  ): GopherAgent {
    return GopherAgent.createFromFfi((lib) =>
      lib.agentCreateByGatewayName(provider, model, apiKey, gatewayName)
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
  static createWithUrl(
    provider: string,
    model: string,
    url: string
  ): GopherAgent {
    return GopherAgent.createFromFfi((lib) =>
      lib.agentCreateByUrl(provider, model, url)
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
    createHandle: (lib: GopherOrchLibrary) => GopherOrchHandle | null
  ): GopherAgent {
    if (!initialized) {
      GopherAgent.init();
    }

    const lib = GopherOrchLibrary.getInstance();
    if (lib === null) {
      throw new AgentError('Native library not available');
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
      if (errorInfo) {
        const details = errorInfo.details ? `: ${errorInfo.details}` : '';
        throw new AgentError(
          `${errorInfo.message ?? 'Failed to create agent'}${details}`
        );
      }
      throw new AgentError('Failed to create agent');
    }

    return new GopherAgent(handle);
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
      const response = lib.agentRun(this.handle, query, timeoutMs);
      if (response === null) {
        return `No response for query: "${query}"`;
      }
      return response;
    } catch (e) {
      throw new AgentError(`Query execution failed: ${(e as Error).message}`);
    }
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
