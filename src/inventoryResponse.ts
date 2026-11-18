import { AgentError } from './errors';
import { isRecord } from './oauthInternal';
import type { GopherSourceSelection } from './config';

const httpTransports = [
  'http_sse',
  'http-sse',
  'sse',
  'streamable_http',
  'streamable-http',
  'http_stream',
  'http',
];
const wsTransports = ['websocket', 'ws'];

/** Guard only strings that native ConfigLoader actually substitutes. */
function rejectEnvironmentReference(value: unknown): void {
  if (typeof value === 'string' && /\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(value)) {
    throw new AgentError(
      'Remote inventory configuration must not contain environment variable references'
    );
  }
}

function rejectEndpointEnvironmentReferences(
  config: Record<string, unknown>
): void {
  rejectEnvironmentReference(config.url);
  if (isRecord(config.headers)) {
    for (const value of Object.values(config.headers))
      rejectEnvironmentReference(value);
  }
}

function stableKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableKey).join(',')}]`;
  if (isRecord(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableKey(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

interface GatewayRoute {
  entry: Record<string, unknown>;
  gateway: boolean;
  pathId?: string;
}

/** Match native inventoryRoute's canonical, decoded gateway URL identity. */
function gatewayRoute(entry: Record<string, unknown>): GatewayRoute {
  const route: GatewayRoute = { entry, gateway: false };
  if (![...httpTransports, ...wsTransports].includes(entry.transport as string))
    return route;
  try {
    const config = entry.config as Record<string, unknown>;
    const url = new URL(config.url as string);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol))
      return route;
    const path = decodeURIComponent(url.pathname).replace(/\/$/, '');
    // A marker must never turn a backing-server route into a gateway route.
    if (path.startsWith('/v1/mcp/servers/')) return route;
    const match = /^\/v1\/mcp\/gateways\/([^/]+)\/(?:mcp|sse)$/.exec(path);
    if (match) {
      const id = match[1]!;
      if (
        id === '.' ||
        id === '..' ||
        id.includes('\\') ||
        Array.from(id).some(
          (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
        )
      )
        return route;
      return { entry, gateway: true, pathId: id };
    }
    if (path.startsWith('/v1/mcp/gateways/')) return route;
    // Keep explicit gateway metadata for nonstandard remote endpoint URLs.
    route.gateway = entry.type === 'gateway';
  } catch {
    /* Invalid URL/encoding cannot establish a gateway identity. */
  }
  return route;
}

/** Inventory only: never tighten local URL/JSON configuration semantics. */
export function normalizeInventoryResponse(
  body: string,
  selection: GopherSourceSelection = {}
): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new AgentError('Invalid inventory response: expected JSON envelope');
  }
  if (!isRecord(parsed) || typeof parsed.succeeded !== 'boolean') {
    throw new AgentError(
      'Invalid inventory response: expected succeeded/data.servers envelope'
    );
  }
  if (
    !parsed.succeeded ||
    (parsed.message !== undefined && parsed.message !== 'success')
  ) {
    throw new AgentError(
      'Inventory backend rejected the request; check selectors and API-key access'
    );
  }
  if (
    !isRecord(parsed.data) ||
    (parsed.data.servers !== undefined &&
      !Array.isArray(parsed.data.servers)) ||
    (parsed.data.gateways !== undefined &&
      !Array.isArray(parsed.data.gateways)) ||
    (parsed.data.servers === undefined && parsed.data.gateways === undefined)
  ) {
    throw new AgentError(
      'Invalid inventory response: expected data.servers or data.gateways arrays'
    );
  }
  const direct = (parsed.data.servers ?? []) as unknown[];
  const remoteGateways = (parsed.data.gateways ?? []) as unknown[];
  const sources = [
    ...direct,
    ...remoteGateways.flatMap((gateway) => {
      // Legacy inventory also lists gateway summaries alongside server routes.
      // These identify groups, not connectable endpoints. Never synthesize a
      // route from them or let them satisfy an explicit gateway selection.
      if (
        isRecord(gateway) &&
        typeof gateway.gatewayId === 'string' &&
        gateway.gatewayId.length > 0 &&
        typeof gateway.name === 'string' &&
        gateway.name.length > 0 &&
        Object.keys(gateway).every((key) => ['gatewayId', 'name'].includes(key))
      ) {
        return [];
      }
      if (
        !isRecord(gateway) ||
        (gateway.type !== undefined && gateway.type !== 'gateway')
      ) {
        throw new AgentError(
          'Invalid inventory gateway: expected an explicit remote endpoint'
        );
      }
      return [{ ...gateway, type: 'gateway' }];
    }),
  ];
  // Native also substitutes this scalar registry field before reading servers.
  rejectEnvironmentReference(parsed.data.base_url);
  // Do not silently discard routes or partial failures from a different schema.
  // Scalars (for example pagination totals) and empty extensions are harmless.
  for (const [container, allowed] of [
    [parsed, new Set(['data'])],
    [parsed.data, new Set(['servers', 'gateways'])],
  ] as const) {
    for (const [key, value] of Object.entries(container)) {
      if (allowed.has(key)) continue;
      if (
        (Array.isArray(value) && value.length > 0) ||
        (isRecord(value) && Object.keys(value).length > 0)
      ) {
        throw new AgentError('Unsupported non-empty inventory collection');
      }
    }
  }
  const entries = new Set<string>();
  const names = new Set<string>();
  const servers: Record<string, unknown>[] = [];
  let changed = parsed.data.gateways !== undefined;
  for (const [index, raw] of sources.entries()) {
    const fail = (): never => {
      throw new AgentError(
        `Invalid inventory source at index ${index}; expected a named explicit network transport with its endpoint configuration`
      );
    };
    if (!isRecord(raw) || typeof raw.name !== 'string' || raw.name.length === 0)
      fail();
    const entry = raw as Record<string, unknown>;
    const transport = entry.transport;
    if (
      typeof transport !== 'string' ||
      ![...httpTransports, ...wsTransports].includes(transport)
    )
      fail();
    if (
      entry.type === 'gateway' &&
      !httpTransports.includes(transport as string)
    )
      fail();
    const fallback = wsTransports.includes(transport as string)
      ? entry.websocket
      : (entry.http_sse ?? entry.streamable_http);
    const config = entry.config !== undefined ? entry.config : fallback;
    if (!isRecord(config)) fail();
    const normalizedConfig = { ...(config as Record<string, unknown>) };
    if (
      typeof normalizedConfig.url !== 'string' ||
      normalizedConfig.url.length === 0
    )
      fail();
    if (normalizedConfig.headers !== undefined) {
      if (!isRecord(normalizedConfig.headers)) fail();
      for (const value of Object.values(
        normalizedConfig.headers as Record<string, unknown>
      )) {
        if (typeof value !== 'string') fail();
      }
    }
    // This config is also the native parser's effective config. Unused fallback
    // objects and descriptive text are not expansion inputs.
    rejectEndpointEnvironmentReferences(normalizedConfig);
    // Reject fields whose native conversion could silently skip a source.
    if (
      normalizedConfig.verify_ssl !== undefined &&
      typeof normalizedConfig.verify_ssl !== 'boolean'
    )
      fail();
    for (const field of ['connectTimeout', 'requestTimeout', 'max_retries']) {
      if (
        entry[field] !== undefined &&
        (typeof entry[field] !== 'number' ||
          !Number.isSafeInteger(entry[field]))
      )
        fail();
    }
    // Validate identity precedence consumed by native ConfigLoader.
    for (const key of ['id', 'serverId', 'server_id']) {
      if (entry[key] !== undefined) {
        if (typeof entry[key] !== 'string') fail();
        break;
      }
    }
    const canonical = { ...entry, config: normalizedConfig };
    const key = stableKey(entry);
    if (entries.has(key)) {
      changed = true;
      continue;
    }
    entries.add(key);
    if (names.has(entry.name as string))
      throw new AgentError(
        'Inventory contains distinct sources with the same runtime name; select unique routes'
      );
    names.add(entry.name as string);
    if (JSON.stringify(canonical) !== JSON.stringify(entry)) changed = true;
    servers.push(canonical);
  }
  const routes = servers.map(gatewayRoute);
  const gateways = routes.filter((route) => route.gateway);
  const matchesId = (route: GatewayRoute, id: string) =>
    (route.entry.id ?? route.entry.serverId ?? route.entry.server_id) === id ||
    route.pathId === id;
  for (const id of selection.gatewayId ?? []) {
    if (!gateways.some((route) => matchesId(route, id))) {
      throw new AgentError(
        'Inventory did not return a gateway matching the requested gateway ID; refusing backing-server substitution'
      );
    }
  }
  for (const name of selection.gatewayName ?? []) {
    if (!gateways.some((route) => route.entry.name === name)) {
      throw new AgentError(
        'Inventory did not return a gateway matching the requested gateway name; refusing backing-server substitution'
      );
    }
  }
  const gatewayOnly =
    (selection.gatewayId?.length ?? 0) + (selection.gatewayName?.length ?? 0) >
      0 && !(selection.serverId?.length || selection.serverName?.length);
  if (
    gatewayOnly &&
    routes.some(
      (route) =>
        !route.gateway ||
        !(
          selection.gatewayId?.some((id) => matchesId(route, id)) ||
          selection.gatewayName?.includes(route.entry.name as string)
        )
    )
  ) {
    throw new AgentError(
      'Inventory returned unrequested routes for a gateway-only selection; refusing backing-server substitution'
    );
  }
  if (!changed) return body;
  parsed.data.servers = servers;
  delete parsed.data.gateways;
  return JSON.stringify(parsed);
}
