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

/** Remote inventory must never ask either JS or the native loader to read host env. */
function rejectEnvironmentReferences(value: unknown): void {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const item = pending.pop();
    if (typeof item === 'string' && /\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(item)) {
      throw new AgentError(
        'Remote inventory must not contain environment variable references'
      );
    }
    if (Array.isArray(item)) {
      for (const field of item as unknown[]) pending.push(field);
    } else if (isRecord(item)) {
      for (const [key, field] of Object.entries(item)) pending.push(key, field);
    }
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
  if (!isRecord(parsed.data) || !Array.isArray(parsed.data.servers)) {
    throw new AgentError(
      'Invalid inventory response: expected data.servers array'
    );
  }
  rejectEnvironmentReferences(parsed);
  // Do not silently discard routes or partial failures from a different schema.
  // Scalars (for example pagination totals) and empty extensions are harmless.
  for (const [container, allowed] of [
    [parsed, new Set(['data'])],
    [parsed.data, new Set(['servers'])],
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
  let changed = false;
  for (const [index, raw] of parsed.data.servers.entries()) {
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
  // Identity alone cannot distinguish a gateway from one of its backing servers.
  // Require an explicit discriminator rather than inferring policy ownership
  // from a URL or a name. Older ambiguous responses must fail closed.
  const gateways = servers.filter(
    (entry) =>
      entry.type === 'gateway' &&
      httpTransports.includes(entry.transport as string)
  );
  for (const id of selection.gatewayId ?? []) {
    if (
      !gateways.some(
        (entry) => (entry.id ?? entry.serverId ?? entry.server_id) === id
      )
    ) {
      throw new AgentError(
        'Inventory did not return an explicit gateway matching the requested gateway ID; refusing backing-server substitution'
      );
    }
  }
  for (const name of selection.gatewayName ?? []) {
    if (!gateways.some((entry) => entry.name === name)) {
      throw new AgentError(
        'Inventory did not return an explicit gateway matching the requested gateway name; refusing backing-server substitution'
      );
    }
  }
  if (!changed) return body;
  parsed.data.servers = servers;
  return JSON.stringify(parsed);
}
