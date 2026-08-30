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
  let parsed: unknown;
  try {
    parsed = JSON.parse(serverConfig);
  } catch (e) {
    throw new Error(
      `Failed to parse MCP server config for OAuth URL extraction: ${(e as Error).message}`
    );
  }

  return extractServers(parsed)
    .map(extractServerUrl)
    .filter((url): url is string => url !== undefined);
}

function extractServers(config: unknown): unknown[] {
  if (!isRecord(config)) {
    return [];
  }

  const directServers = getArray(config, 'servers');
  const dataServers = isRecord(config.data)
    ? getArray(config.data, 'servers')
    : [];
  return [...directServers, ...dataServers];
}

function extractServerUrl(server: unknown): string | undefined {
  if (!isRecord(server)) {
    return undefined;
  }
  const config = isRecord(server.config) ? server.config : undefined;
  const transport =
    stringValue(server.transport) ?? stringValue(config?.transport);
  if (transport?.toLowerCase() === 'stdio') {
    return undefined;
  }

  const url =
    stringValue(server.url) ??
    stringValue(server.mcpUrl) ??
    stringValue(server.mcp_url) ??
    stringValue(config?.url) ??
    stringValue(config?.mcpUrl) ??
    stringValue(config?.mcp_url);
  if (url === undefined || url.length === 0) {
    return undefined;
  }
  return url;
}

function getArray(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
