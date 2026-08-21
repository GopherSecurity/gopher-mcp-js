import {
  GopherAgentElicitationAction,
  GopherAgentElicitationHandler,
  GopherAgentElicitationRequest,
  GopherAgentElicitationResponse,
} from './elicitation';

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
  handler: GopherAgentElicitationHandler,
  request: GopherAgentElicitationRequest
): GopherAgentElicitationAction {
  const response = handler(request);
  if (isPromiseLike(response)) {
    throw new Error(
      'Async MCP elicitation handlers are not supported by the native FFI bridge yet'
    );
  }
  return normalizeElicitationAction(response);
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
