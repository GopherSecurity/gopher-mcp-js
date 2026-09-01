import {
  GopherAgentElicitationAction,
  GopherAgentElicitationOptions,
  GopherAgentElicitationHandler,
  GopherAgentElicitationRequest,
  GopherAgentElicitationResponse,
} from './elicitation';
import { openAuthorizationUrlDetached } from './oauthBrowser';
import { closeSync, openSync, readSync } from 'fs';

export const ELICITATION_ACTION_ACCEPT = 1;
export const ELICITATION_ACTION_DECLINE = 2;
export const ELICITATION_ACTION_CANCEL = 3;

let readInputSync: typeof readSync = readSync;
let openInputFdSync: () => number | null = openTerminalInputFdSync;
let closeInputFdSync: (fd: number) => void = closeSync;

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
  return {
    mode: request.mode ?? '',
    ...(request.url ? { url: request.url } : {}),
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

export function defaultUrlElicitationHandler(
  options: Pick<GopherAgentElicitationOptions, 'openBrowser'> = {}
): GopherAgentElicitationHandler {
  return (request) => {
    if (request.mode !== 'url' || !request.url) {
      return 'decline';
    }
    const result = openAuthorizationUrlDetached(request.url, {
      openBrowser: options.openBrowser,
    });
    if (!result.opened) {
      process.stderr.write(
        `Open this OAuth authorization URL to continue:\n${request.url}\n`
      );
    }
    return waitForOAuthCompletionSync();
  };
}

export function waitForOAuthCompletionSync(): GopherAgentElicitationAction {
  process.stderr.write(
    'Complete the OAuth flow in the browser, then press Enter to continue. Type "cancel" and press Enter to cancel.\n'
  );

  if (!process.stdin.isTTY) {
    process.stderr.write(
      'Cannot wait for OAuth completion without interactive stdin; canceling provider authorization.\n'
    );
    return 'cancel';
  }

  const fd = openInputFdSync();
  if (fd === null) {
    process.stderr.write(
      'Cannot access an interactive terminal; canceling provider authorization.\n'
    );
    return 'cancel';
  }

  try {
    let input = '';
    const buffer = Buffer.alloc(1);
    while (true) {
      const bytesRead = readInputSync(fd, buffer, 0, 1, null);
      if (bytesRead <= 0) {
        return 'cancel';
      }

      const char = buffer.toString('utf8', 0, bytesRead);
      if (char === '\n' || char === '\r') {
        break;
      }
      input += char;
    }

    return input.trim().toLowerCase() === 'cancel' ? 'cancel' : 'accept';
  } finally {
    if (fd !== 0) {
      closeInputFdSync(fd);
    }
  }
}

export function setElicitationInputForTest(
  read: typeof readSync | null,
  openFd?: (() => number | null) | null,
  closeFd?: ((fd: number) => void) | null
): void {
  readInputSync = read ?? readSync;
  openInputFdSync = openFd ?? openTerminalInputFdSync;
  closeInputFdSync = closeFd ?? closeSync;
}

function openTerminalInputFdSync(): number | null {
  if (process.platform !== 'win32') {
    try {
      return openSync('/dev/tty', 'r');
    } catch {
    }
  }
  return 0;
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
    host = request.url ? new URL(request.url).host : null;
  } catch {
    host = null;
  }

  return {
    elicitationId: request.elicitationId ?? null,
    mode: request.mode,
    host,
    url: request.url ? redactElicitationUrl(request.url) : null,
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
