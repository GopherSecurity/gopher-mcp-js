/**
 * MCP server-to-client elicitation support for second-step provider OAuth.
 */

export type GopherAgentElicitationAction = 'accept' | 'decline' | 'cancel';

export type GopherAgentElicitationMode = 'url';

export interface GopherAgentElicitationRequest {
  /**
   * Server-provided elicitation identifier.
   */
  elicitationId?: string;
  /**
   * First version supports URL-mode provider authorization requests.
   */
  mode: GopherAgentElicitationMode;
  /**
   * Human-readable server message describing why authorization is needed.
   */
  message?: string;
  /**
   * Provider authorization URL that should be opened or surfaced to the user.
   */
  url: string;
  /**
   * JSON-RPC request id serialized as JSON for stable logging/debugging.
   */
  requestIdJson?: string;
  /**
   * Raw MCP elicitation/create request JSON for diagnostics.
   */
  rawJson?: string;
  /**
   * Raw MCP elicitation/create params JSON for diagnostics.
   */
  rawParamsJson?: string;
}

export interface GopherAgentElicitationResponse {
  action: GopherAgentElicitationAction;
}

export type GopherAgentElicitationHandler = (
  request: GopherAgentElicitationRequest
) => GopherAgentElicitationResponse | GopherAgentElicitationAction;

export interface GopherAgentElicitationOptions {
  /**
   * Application-controlled handler. If omitted, the SDK may use its default
   * URL-mode behavior. Native MCP elicitation callbacks are synchronous, so
   * async handlers are not supported.
   */
  handler?: GopherAgentElicitationHandler;
  /**
   * Timeout budget in milliseconds for user/browser completion.
   */
  timeoutMs?: number;
  /**
   * Whether the default URL-mode handler may open a browser.
   */
  openBrowser?: boolean;
}
