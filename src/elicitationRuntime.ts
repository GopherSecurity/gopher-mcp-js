import {
  GopherAgentElicitationAction,
  GopherAgentElicitationOptions,
  GopherAgentElicitationHandler,
  GopherAgentElicitationRequest,
  GopherAgentElicitationResponse,
} from './elicitation';
import { openAuthorizationUrlDetached } from './oauthBrowser';

export const ELICITATION_ACTION_ACCEPT = 1;
export const ELICITATION_ACTION_DECLINE = 2;
export const ELICITATION_ACTION_CANCEL = 3;

export interface NativeElicitationRequestData {
  request_id_json?: string | null;
  elicitation_id?: string | null;
  mode?: string | null;
  message?: string | null;
  url?: string | null;
  raw_json?: string | null;
  raw_params_json?: string | null;
}

export function toElicitationRequest(
  request: NativeElicitationRequestData
): GopherAgentElicitationRequest {
  if (request.mode !== 'url') {
    throw new Error(
      `Unsupported MCP elicitation mode: ${request.mode ?? '<missing>'}`
    );
  }
  if (!request.url) {
    throw new Error('URL-mode MCP elicitation request is missing url');
  }

  return {
    mode: 'url',
    url: request.url,
    ...(request.elicitation_id
      ? { elicitationId: request.elicitation_id }
      : {}),
    ...(request.message ? { message: request.message } : {}),
    ...(request.request_id_json
      ? { requestIdJson: request.request_id_json }
      : {}),
    ...(request.raw_json ? { rawJson: request.raw_json } : {}),
    ...(request.raw_params_json
      ? { rawParamsJson: request.raw_params_json }
      : {}),
  };
}

export function resolveElicitationActionSync(
  options: GopherAgentElicitationOptions,
  request: GopherAgentElicitationRequest
): GopherAgentElicitationAction {
  const handler = options.handler ?? defaultUrlElicitationHandler(options);
  logElicitationDebug('request', summarizeElicitationRequest(request));
  const response = handler(request);
  if (isPromiseLike(response)) {
    throw new Error(
      'Async MCP elicitation handlers are not supported by the native FFI bridge yet'
    );
  }
  const action = normalizeElicitationAction(response);
  logElicitationDebug('response', {
    elicitationId: request.elicitationId ?? null,
    mode: request.mode,
    action,
  });
  return action;
}

export async function resolveElicitationAction(
  options: GopherAgentElicitationOptions,
  request: GopherAgentElicitationRequest
): Promise<GopherAgentElicitationAction> {
  const handler = options.handler ?? defaultUrlElicitationHandler(options);
  try {
    logElicitationDebug('request', summarizeElicitationRequest(request));
    const action = normalizeElicitationAction(await handler(request));
    logElicitationDebug('response', {
      elicitationId: request.elicitationId ?? null,
      mode: request.mode,
      action,
    });
    return action;
  } catch {
    logElicitationDebug('response', {
      elicitationId: request.elicitationId ?? null,
      mode: request.mode,
      action: 'cancel',
    });
    return 'cancel';
  }
}

export function defaultUrlElicitationHandler(
  options: Pick<GopherAgentElicitationOptions, 'openBrowser'> = {}
): GopherAgentElicitationHandler {
  return (request) => {
    const result = openAuthorizationUrlDetached(request.url, {
      openBrowser: options.openBrowser,
    });
    if (!result.opened) {
      process.stderr.write(
        `Open this OAuth authorization URL to continue:\n${request.url}\n`
      );
    }
    return 'accept';
  };
}

export function nativeActionFromElicitationAction(
  action: GopherAgentElicitationAction
): number {
  switch (action) {
    case 'accept':
      return ELICITATION_ACTION_ACCEPT;
    case 'decline':
      return ELICITATION_ACTION_DECLINE;
    case 'cancel':
      return ELICITATION_ACTION_CANCEL;
  }
}

export function normalizeElicitationAction(
  response: GopherAgentElicitationResponse | GopherAgentElicitationAction
): GopherAgentElicitationAction {
  const action = typeof response === 'string' ? response : response.action;
  if (action === 'accept' || action === 'decline' || action === 'cancel') {
    return action;
  }
  throw new Error(`Unsupported MCP elicitation action: ${String(action)}`);
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

export function redactElicitationUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const name of Array.from(parsed.searchParams.keys())) {
      if (isSensitiveQueryName(name)) {
        parsed.searchParams.set(name, '<redacted>');
      } else {
        parsed.searchParams.set(name, '<present>');
      }
    }
    parsed.hash = parsed.hash ? '#<redacted>' : '';
    return parsed.toString();
  } catch {
    return '<invalid-url>';
  }
}

function summarizeElicitationRequest(
  request: GopherAgentElicitationRequest
): Record<string, string | null> {
  let host: string | null = null;
  try {
    host = new URL(request.url).host;
  } catch {
    host = null;
  }

  return {
    elicitationId: request.elicitationId ?? null,
    mode: request.mode,
    host,
    url: redactElicitationUrl(request.url),
  };
}

function logElicitationDebug(label: string, values: unknown): void {
  if (process.env.GOPHER_MCP_OAUTH_DEBUG !== '1' && process.env.DEBUG !== '1') {
    return;
  }
  process.stderr.write(
    `[gopher-mcp-js elicitation] ${label}: ${JSON.stringify(values)}\n`
  );
}

function isSensitiveQueryName(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    normalized === 'state' ||
    normalized === 'code' ||
    normalized === 'client_secret' ||
    normalized.includes('token') ||
    normalized.includes('secret')
  );
}
