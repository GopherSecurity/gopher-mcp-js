import type { GopherSourceSelection } from './config';
import { AgentError } from './errors';

export const selectionFields = [
  'serverId',
  'serverName',
  'gatewayId',
  'gatewayName',
] as const;
export type SourceSelectionField = (typeof selectionFields)[number];
export interface ServerConfigRoute {
  key: SourceSelectionField;
  value: string;
}
export type NormalizedSourceSelection = Required<GopherSourceSelection>;

/** Strict selection-only boundary, matching native SourceSelection. */
export function normalizeSourceSelection(
  input: GopherSourceSelection = {},
  route?: ServerConfigRoute
): NormalizedSourceSelection {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new AgentError('Inventory selection must be an object');
  }
  if (
    Object.keys(input).some(
      (key) => !selectionFields.includes(key as SourceSelectionField)
    )
  ) {
    throw new AgentError('Unknown inventory selector key');
  }
  if (route && !selectionFields.includes(route.key)) {
    throw new AgentError('Unknown inventory selector key');
  }
  const result: NormalizedSourceSelection = {
    serverId: [],
    serverName: [],
    gatewayId: [],
    gatewayName: [],
  };
  for (const field of selectionFields) {
    const values = input[field] === undefined ? [] : input[field];
    if (!Array.isArray(values))
      throw new AgentError(`Invalid ${field}: expected an array of strings`);
    const combined: unknown[] =
      route?.key === field ? [route.value, ...values] : [...values];
    for (const value of combined) {
      if (
        typeof value !== 'string' ||
        value.includes('\0') ||
        /^[ \t\r\n\f\v]*$/.test(value)
      ) {
        throw new AgentError(`Invalid inventory selector in ${field}`);
      }
      if (!result[field].includes(value)) result[field].push(value);
    }
  }
  return result;
}

/** Extract from creation options without confusing selectors with runtime fields. */
export function selectionFromCreateOptions(
  options?: GopherSourceSelection
): GopherSourceSelection {
  if (options === undefined) return {};
  if (
    options === null ||
    typeof options !== 'object' ||
    Array.isArray(options)
  ) {
    throw new AgentError('Creation options must be an object');
  }
  // Reject likely selector misspellings while preserving unrelated runtime extensions.
  for (const key of Object.keys(options)) {
    if (
      (/^(server|gateway)(id|name)s?$/i.test(key) || key === 'select') &&
      !selectionFields.includes(key as SourceSelectionField)
    ) {
      throw new AgentError('Unknown inventory selector key');
    }
  }
  const selection: GopherSourceSelection = {};
  for (const field of selectionFields) {
    if (options[field] !== undefined) selection[field] = options[field];
  }
  return selection;
}
