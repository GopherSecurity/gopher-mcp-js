export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

export function stringField(
  value: Record<string, unknown>,
  field: string
): string | undefined {
  return readString(value[field]);
}

export function numberField(
  value: Record<string, unknown>,
  field: string
): number | undefined {
  const fieldValue = value[field];
  if (typeof fieldValue === 'number') {
    return fieldValue;
  }
  if (typeof fieldValue === 'string' && fieldValue.trim().length > 0) {
    const parsed = Number(fieldValue);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function logOAuthDebug(label: string, values: unknown): void {
  if (process.env.GOPHER_MCP_OAUTH_DEBUG !== '1' && process.env.DEBUG !== '1') {
    return;
  }
  process.stderr.write(
    `[gopher-mcp-js oauth] ${label}: ${JSON.stringify(values)}\n`
  );
}
