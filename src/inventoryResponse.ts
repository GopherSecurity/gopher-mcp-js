import { AgentError } from './errors';
import { isRecord } from './oauthInternal';

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

/** Match native ConfigLoader substitutions before OAuth and native creation. */
function expand(value: string): string {
  for (let i = 0; i < 100; i++) {
    if (!/\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(value)) return value;
    value = value.replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/,
      (_, key: string) => process.env[key] ?? ''
    );
  }
  throw new AgentError(
    'Invalid inventory configuration: recursive environment substitution'
  );
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
export function normalizeInventoryResponse(body: string): string {
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
  const entries = new Set<string>();
  const names = new Set<string>();
  const servers: Record<string, unknown>[] = [];
  let changed = false;
  for (const [index, raw] of parsed.data.servers.entries()) {
    const fail = (): never => {
      throw new AgentError(
        `Invalid inventory source at index ${index}; expected a named supported transport with its endpoint configuration`
      );
    };
    if (!isRecord(raw) || typeof raw.name !== 'string' || raw.name.length === 0)
      fail();
    const entry = raw as Record<string, unknown>;
    const transport = entry.transport ?? 'stdio';
    if (
      typeof transport !== 'string' ||
      !['stdio', ...httpTransports, ...wsTransports].includes(transport)
    )
      fail();
    const fallback =
      transport === 'stdio'
        ? entry.stdio
        : wsTransports.includes(transport as string)
          ? entry.websocket
          : (entry.http_sse ?? entry.streamable_http);
    const config = entry.config !== undefined ? entry.config : fallback;
    if (!isRecord(config)) fail();
    const endpoint = transport === 'stdio' ? 'command' : 'url';
    if (typeof (config as Record<string, unknown>)[endpoint] !== 'string')
      fail();
    const normalizedConfig = { ...(config as Record<string, unknown>) };
    normalizedConfig[endpoint] = expand(normalizedConfig[endpoint] as string);
    if (!(normalizedConfig[endpoint] as string).length) fail();
    if (isRecord(normalizedConfig.headers)) {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(normalizedConfig.headers)) {
        if (typeof value !== 'string') fail();
        headers[key] = expand(value as string);
      }
      normalizedConfig.headers = headers;
    }
    // Reject fields whose native conversion could silently skip a source.
    if (
      normalizedConfig.verify_ssl !== undefined &&
      typeof normalizedConfig.verify_ssl !== 'boolean'
    )
      fail();
    if (transport === 'stdio') {
      if (
        normalizedConfig.args !== undefined &&
        (!Array.isArray(normalizedConfig.args) ||
          normalizedConfig.args.some((value) => typeof value !== 'string'))
      )
        fail();
      if (
        normalizedConfig.env !== undefined &&
        (!isRecord(normalizedConfig.env) ||
          Object.values(normalizedConfig.env).some(
            (value) => typeof value !== 'string'
          ))
      )
        fail();
      if (
        normalizedConfig.working_directory !== undefined &&
        typeof normalizedConfig.working_directory !== 'string'
      )
        fail();
    }
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
  if (!changed) return body;
  parsed.data.servers = servers;
  return JSON.stringify(parsed);
}
