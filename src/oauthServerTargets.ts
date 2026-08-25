import { extractNativeMcpServerTargetUrls } from './ffi/auth/oauth-server-targets';

export interface OAuthMcpServerTarget {
  serverId?: string;
  name?: string;
  serverName?: string;
  url: string;
}

export interface OAuthMcpServerTargetInput {
  url?: string;
  serverConfig?: string;
}

export function extractMcpServerTargets(
  input: OAuthMcpServerTargetInput
): OAuthMcpServerTarget[] {
  const urls = [
    ...(input.url !== undefined && input.url.length > 0 ? [input.url] : []),
    ...(input.serverConfig !== undefined
      ? extractServerConfigTargetUrls(input.serverConfig)
      : []),
  ];
  return urls.map((url) => ({ url }));
}

function extractServerConfigTargetUrls(serverConfig: string): string[] {
  try {
    return extractNativeMcpServerTargetUrls(serverConfig);
  } catch (e) {
    throw new Error(
      `Failed to parse MCP server config for OAuth URL extraction: ${(e as Error).message}`
    );
  }
}
