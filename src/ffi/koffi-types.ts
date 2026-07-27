import * as koffi from 'koffi';

type RegisteredKoffiType = {
  kind: 'opaque-pointer' | 'struct';
  fingerprint: string;
  type?: koffi.IKoffiCType;
};

const REGISTRY_KEY = Symbol.for(
  '@gopher.security/gopher-mcp-js/koffi-type-registry'
);

function typeRegistry(): Map<string, RegisteredKoffiType> {
  // koffi registers native types process-wide, while Jest gives each test file
  // its own globalThis. Keep our metadata on process when available so it
  // survives across those VM contexts.
  const registryHost =
    typeof process !== 'undefined' ? process : globalThis;
  const globalWithRegistry = registryHost as typeof registryHost & {
    [REGISTRY_KEY]?: Map<string, RegisteredKoffiType>;
  };
  if (!globalWithRegistry[REGISTRY_KEY]) {
    globalWithRegistry[REGISTRY_KEY] = new Map<string, RegisteredKoffiType>();
  }
  return globalWithRegistry[REGISTRY_KEY];
}

function normalizeTypeSpec(value: koffi.TypeSpecWithAlignment): string {
  if (typeof value === 'string') {
    return value;
  }
  return String(value);
}

function structFingerprint(
  def: Record<string, koffi.TypeSpecWithAlignment>
): string {
  return JSON.stringify(
    Object.entries(def).map(([field, type]) => [field, normalizeTypeSpec(type)])
  );
}

function isMissingKoffiType(error: unknown): boolean {
  const candidate = error as { name?: unknown; message?: unknown };
  return (
    candidate.name === 'TypeError' &&
    typeof candidate.message === 'string' &&
    candidate.message.includes('Unknown or invalid type name')
  );
}

function resolveRegisteredType(
  name: string,
  expected: RegisteredKoffiType
): koffi.IKoffiCType | null {
  const registered = typeRegistry().get(name);
  if (registered) {
    if (
      registered.kind !== expected.kind ||
      registered.fingerprint !== expected.fingerprint
    ) {
      throw new Error(
        `Conflicting koffi type registration for ${name}: expected ` +
          `${expected.kind} ${expected.fingerprint}, found ` +
          `${registered.kind} ${registered.fingerprint}`
      );
    }
    return registered.type ?? koffi.resolve(name);
  }

  try {
    const resolved = koffi.resolve(name);
    if (isSdkOwnedTypeName(name)) {
      typeRegistry().set(name, { ...expected, type: resolved });
      return resolved;
    }
  } catch (error) {
    if (isMissingKoffiType(error)) {
      return null;
    }
    throw error;
  }

  throw new Error(
    `Koffi type ${name} is already registered outside the tracked FFI ` +
      'registry; refusing to reuse an unverified layout'
  );
}

function isSdkOwnedTypeName(name: string): boolean {
  return (
    name === 'GopherOrchErrorInfo' ||
    name === 'GopherOrchHeader' ||
    name === 'GopherOrchAgentOptions' ||
    name === 'gopher_auth_validation_result_t' ||
    name.startsWith('gopher_auth_')
  );
}

export function getOrCreateOpaquePointer(name: string): koffi.IKoffiCType {
  const expected: RegisteredKoffiType = {
    kind: 'opaque-pointer',
    fingerprint: 'opaque',
  };
  const existing = resolveRegisteredType(name, expected);
  if (existing) {
    return existing;
  }

  const created = koffi.pointer(name, koffi.opaque());
  typeRegistry().set(name, { ...expected, type: created });
  return created;
}

export function getOrCreateStruct(
  name: string,
  def: Record<string, koffi.TypeSpecWithAlignment>
): koffi.IKoffiCType {
  const expected: RegisteredKoffiType = {
    kind: 'struct',
    fingerprint: structFingerprint(def),
  };
  const existing = resolveRegisteredType(name, expected);
  if (existing) {
    return existing;
  }

  const created = koffi.struct(name, def);
  typeRegistry().set(name, { ...expected, type: created });
  return created;
}
