export interface OAuthMcpServerTarget {
  serverId?: string;
  name?: string;
  serverName?: string;
  url: string;
  headers?: Record<string, string>;
}

export interface OAuthMcpServerTargetInput {
  url?: string;
  serverConfig?: string;
}

interface ServerConfigEntry {
  serverId?: unknown;
  server_id?: unknown;
  id?: unknown;
  name?: unknown;
  serverName?: unknown;
  server_name?: unknown;
  transport?: unknown;
  url?: unknown;
  config?: {
    url?: unknown;
    headers?: unknown;
  };
  headers?: unknown;
}

export function extractMcpServerTargets(
  input: OAuthMcpServerTargetInput
): OAuthMcpServerTarget[] {
  const targets: OAuthMcpServerTarget[] = [];
  if (input.url !== undefined && input.url.length > 0) {
    targets.push({ url: input.url });
  }

  if (input.serverConfig === undefined) {
    return targets;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.serverConfig);
  } catch (e) {
    throw new Error(
      `Failed to parse MCP server config for OAuth URL extraction: ${(e as Error).message}`
    );
  }

  for (const server of collectServerEntries(parsed)) {
    const target = targetFromServerEntry(server);
    if (target !== undefined) {
      targets.push(target);
    }
  }

  return targets;
}

function collectServerEntries(value: unknown): ServerConfigEntry[] {
  if (!isRecord(value)) {
    return [];
  }

  const directServers = value['servers'];
  if (Array.isArray(directServers)) {
    return directServers.filter(isRecord) as ServerConfigEntry[];
  }

  const data = value['data'];
  if (isRecord(data)) {
    const dataServers = data['servers'];
    if (Array.isArray(dataServers)) {
      return dataServers.filter(isRecord) as ServerConfigEntry[];
    }
  }

  return [];
}

function targetFromServerEntry(
  server: ServerConfigEntry
): OAuthMcpServerTarget | undefined {
  const transport = readString(server.transport);
  if (transport?.toLowerCase() === 'stdio') {
    return undefined;
  }

  const url = readString(server.url) ?? readString(server.config?.url);
  if (url === undefined || url.length === 0) {
    return undefined;
  }

  return {
    ...optionalString(
      'serverId',
      firstString(server.serverId, server.server_id, server.id)
    ),
    ...optionalString('name', readString(server.name)),
    ...optionalString(
      'serverName',
      firstString(server.serverName, server.server_name)
    ),
    url,
    ...optionalHeaders(firstRecord(server.headers, server.config?.headers)),
  };
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const stringValue = readString(value);
    if (stringValue !== undefined) {
      return stringValue;
    }
  }
  return undefined;
}

function optionalString(
  key: 'serverId' | 'name' | 'serverName',
  value: string | undefined
): Partial<OAuthMcpServerTarget> {
  return value === undefined ? {} : { [key]: value };
}

function optionalHeaders(
  headers: Record<string, unknown> | undefined
): Partial<OAuthMcpServerTarget> {
  if (headers === undefined) {
    return {};
  }
  const normalized = Object.fromEntries(
    Object.entries(headers).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  );
  return Object.keys(normalized).length > 0 ? { headers: normalized } : {};
}

function firstRecord(
  ...values: unknown[]
): Record<string, unknown> | undefined {
  for (const value of values) {
    if (isRecord(value)) {
      return value;
    }
  }
  return undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
