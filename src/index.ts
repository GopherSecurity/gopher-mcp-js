/**
 * gopher-orch TypeScript SDK
 *
 * TypeScript SDK for Gopher Orch - AI Agent orchestration framework with native performance.
 *
 * @example
 * ```typescript
 * import { GopherAgent, GopherAgentConfig } from '@gopher.security/gopher-mcp';
 *
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
 */

// Main exports
export { GopherAgent } from './agent';
export { GopherAgentConfig, GopherAgentConfigBuilder } from './config';
export type { GopherAgentConfigOptions } from './config';
export { AgentResult, AgentResultBuilder, AgentResultStatus } from './result';
export type { AgentResultOptions } from './result';
export { ServerConfig } from './serverConfig';

// Error exports
export {
  AgentError,
  ApiKeyError,
  ConnectionError,
  TimeoutError,
} from './errors';

// FFI exports (for advanced use)
export { GopherOrchLibrary } from './ffi';
export type { GopherOrchHandle, GopherOrchErrorInfoData } from './ffi';
