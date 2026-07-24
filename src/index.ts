/**
 * gopher-orch TypeScript SDK
 *
 * TypeScript SDK for Gopher Orch - AI Agent orchestration framework with native performance.
 *
 * @example
 * ```typescript
 * import { GopherAgent, GopherAgentConfig } from '@gopher.security/gopher-mcp-js';
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
 *
 * @example
 * ```typescript
 * import { GopherAgent } from '@gopher.security/gopher-mcp-js';
 *
 * // Scope an agent to a single MCP server (or gateway) routed by id or
 * // name; or point directly at a known URL with no remote config fetch.
 * const byServerId    = await GopherAgent.createWithServerId   (provider, model, apiKey, 'srv-1');
 * const byServerName  = await GopherAgent.createWithServerName (provider, model, apiKey, 'weather-tools');
 * const byGatewayId   = await GopherAgent.createWithGatewayId  (provider, model, apiKey, 'gw-1');
 * const byGatewayName = await GopherAgent.createWithGatewayName(provider, model, apiKey, 'prod-gateway');
 * const byUrl         = GopherAgent.createWithUrl        (provider, model, 'http://127.0.0.1:8080/mcp');
 * ```
 */

import { assertSupportedNodeVersion } from './runtime';

assertSupportedNodeVersion();

// Main exports
export { GopherAgent } from './agent';
export { GopherAgentConfig, GopherAgentConfigBuilder } from './config';
export type {
  GopherAgentConfigOptions,
  GopherAgentRuntimeOptions,
} from './config';
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

// Auth exports
export {
  // Types
  GopherAuthError,
  isGopherAuthError,
  getErrorDescription,
  gopherCreateEmptyAuthContext,
  // Classes
  GopherAuthClient,
  GopherValidationOptions,
  // Functions
  gopherInitAuthLibrary,
  gopherShutdownAuthLibrary,
  gopherGetAuthLibraryVersion,
  gopherIsAuthLibraryInitialized,
  gopherGenerateWwwAuthenticateHeader,
  gopherGenerateWwwAuthenticateHeaderV2,
  gopherCreateValidationOptions,
  payloadGetClaim,
  gopherAuthValidateIdp,
  gopherAuthValidateAllScopes,
  gopherAuthValidateAnyScopes,
  gopherAuthUrlEncode,
  gopherAuthUrlDecode,
  gopherAuthBuildProtectedResourceMetadata,
  gopherAuthBuildOAuthServerMetadata,
  gopherAuthBuildOidcDiscoveryMetadata,
  gopherAuthExtractBearerToken,
  gopherAuthExtractMethod,
  gopherAuthExtractPath,
  GopherAuthConfig,
  GopherOAuthClient,
  GopherSessionManager,
  gopherAuthAutoRefresh,
} from './ffi';
export type { AutoRefreshResult } from './ffi';
export type { TokenResponse, RegistrationResponse } from './ffi';
export type { ValidationResult, TokenPayload, GopherAuthContext } from './ffi';

// Auth module (reusable, replaces gopher-auth-sdk-nodejs)
export {
  GopherAuth,
  GopherAuthError as GopherAuthBaseError,
  TokenValidationError,
  InsufficientScopesError,
  JwksError,
  ConfigurationError,
  TokenExchangeError,
  hasScope,
  hasAllScopes,
  hasAnyScope,
  expressMiddleware as gopherExpressMiddleware,
  registerOAuthRoutes as gopherRegisterOAuthRoutes,
} from './auth';
export type {
  GopherAuthOptions,
  ExpressMiddlewareOptions,
  TokenExchangeOptions,
  OAuthRouteOptions,
  ProtectedResourceMetadata,
} from './auth';
