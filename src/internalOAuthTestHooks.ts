import type { OAuthFlowHooks, OAuthResolverHooks } from './oauthResolver';

export const GOPHER_AGENT_OAUTH_TEST_HOOKS: unique symbol = Symbol(
  'gopher.agent.oauth.testHooks'
);

export type GopherAgentOAuthTestHooks = Partial<
  OAuthResolverHooks & OAuthFlowHooks
>;

