/** Additive v1 native authorization ABI. Owned poll strings use gopher_orch_free. */
import type * as koffi from 'koffi';
import type { GopherOrchHandle } from './library';
import { AgentError } from '../errors';

export type AuthHandle = GopherOrchHandle;
export interface EmbeddedAuthCapabilities {
  version: number;
  embedded_auth: boolean;
  async_store?: boolean;
}
export interface NativeAuthEvent {
  type:
    | 'progress'
    | 'page'
    | 'authorized'
    | 'agent_ready'
    | 'failed'
    | 'cancelled';
  url?: string;
  flow?: 'single' | 'assemble';
  sources?: unknown;
  code?: string;
}
export interface NativeGrantBinding {
  identity_namespace: string;
  source: string;
  issuer: string;
  resource: string;
  scopes: string;
  client_identity: string;
}
export interface NativeGrant {
  binding: NativeGrantBinding;
  access_token: string;
  refresh_token?: string;
  client_id: string;
  client_secret?: string;
  token_endpoint: string;
  expires_at: number;
}
export interface NativeStoreRequest {
  id: string;
  operation: 'get' | 'put' | 'erase';
  binding: NativeGrantBinding;
  grant?: NativeGrant;
}

export const missingEmbeddedAuth = () =>
  new AgentError(
    'Multiple MCP OAuth flows require a native library with embedded authorization interface v1. Build/install a compatible gopher-orch artifact.',
    'EMBEDDED_AUTH_UNAVAILABLE'
  );

type Fn<T extends unknown[], R> = (...args: T) => R;
export class EmbeddedAuthBindings {
  private capabilitiesFn: Fn<[], string>;
  private createFn: Fn<[string, string, unknown], AuthHandle | null>;
  private startFn: Fn<[AuthHandle], number>;
  private eventFn: Fn<[AuthHandle], string | null>;
  private storeFn: Fn<[AuthHandle], string | null>;
  private completeFn: Fn<[AuthHandle, string, string], number>;
  private buildFn: Fn<[AuthHandle, string, string], number>;
  private takeFn: Fn<[AuthHandle], GopherOrchHandle | null>;
  private retainFn: Fn<[AuthHandle], number>;
  private cancelFn: Fn<[AuthHandle], void>;
  private releaseFn: koffi.KoffiFunction;
  constructor(lib: koffi.IKoffiLib, ownedString: koffi.TypeSpec) {
    this.capabilitiesFn = lib.func(
      'gopher_orch_auth_capabilities',
      'str',
      []
    ) as typeof this.capabilitiesFn;
    this.createFn = lib.func('gopher_orch_auth_create', 'void*', [
      'str',
      'str',
      'GopherOrchAgentOptions*',
    ]) as typeof this.createFn;
    this.startFn = lib.func('gopher_orch_auth_start', 'int', [
      'void*',
    ]) as typeof this.startFn;
    this.eventFn = lib.func('gopher_orch_auth_next_event', ownedString, [
      'void*',
    ]) as typeof this.eventFn;
    this.storeFn = lib.func(
      'gopher_orch_auth_next_store_request',
      ownedString,
      ['void*']
    ) as typeof this.storeFn;
    this.completeFn = lib.func(
      'gopher_orch_auth_complete_store_request',
      'int',
      ['void*', 'str', 'str']
    ) as typeof this.completeFn;
    this.buildFn = lib.func('gopher_orch_auth_create_agent', 'int', [
      'void*',
      'str',
      'str',
    ]) as typeof this.buildFn;
    this.takeFn = lib.func('gopher_orch_auth_take_agent', 'void*', [
      'void*',
    ]) as typeof this.takeFn;
    this.retainFn = lib.func('gopher_orch_auth_retain', 'int', [
      'void*',
    ]) as typeof this.retainFn;
    this.cancelFn = lib.func('gopher_orch_auth_cancel', 'void', [
      'void*',
    ]) as typeof this.cancelFn;
    this.releaseFn = lib.func('gopher_orch_auth_release', 'void', ['void*']);
  }
  capabilities(): EmbeddedAuthCapabilities | null {
    try {
      const value = JSON.parse(
        this.capabilitiesFn()
      ) as EmbeddedAuthCapabilities;
      return value.version === 1 && value.embedded_auth === true ? value : null;
    } catch {
      return null;
    }
  }
  create(inventory: string, options: string, runtime: unknown): AuthHandle {
    if (!this.capabilities()) throw missingEmbeddedAuth();
    const handle = this.createFn(inventory, options, runtime);
    if (!handle)
      throw new AgentError(
        'Invalid embedded authorization configuration',
        'EMBEDDED_AUTH_CONFIG'
      );
    return handle;
  }
  private check(code: number): void {
    if (code !== 0)
      throw new AgentError(
        'Native authorization operation rejected',
        'EMBEDDED_AUTH_STATE'
      );
  }
  start(handle: AuthHandle): void {
    this.check(this.startFn(handle));
  }
  event(handle: AuthHandle): NativeAuthEvent | null {
    return this.read(this.eventFn(handle));
  }
  storeRequest(handle: AuthHandle): NativeStoreRequest | null {
    return this.read(this.storeFn(handle));
  }
  private read<T>(text: string | null): T | null {
    if (text === null) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new AgentError(
        'Invalid native authorization event',
        'EMBEDDED_AUTH_PROTOCOL'
      );
    }
  }
  completeStore(handle: AuthHandle, id: string, result: unknown): void {
    this.check(this.completeFn(handle, id, JSON.stringify(result)));
  }
  createAgent(handle: AuthHandle, provider: string, model: string): void {
    this.check(this.buildFn(handle, provider, model));
  }
  takeAgent(handle: AuthHandle): GopherOrchHandle {
    const agent = this.takeFn(handle);
    if (!agent)
      throw new AgentError(
        'Native authorization returned no agent',
        'EMBEDDED_AUTH_STATE'
      );
    return agent;
  }
  retain(handle: AuthHandle): void {
    this.check(this.retainFn(handle));
  }
  cancel(handle: AuthHandle): void {
    this.cancelFn(handle);
  }
  release(handle: AuthHandle): Promise<void> {
    // Last release can join workers; leave Node free to service queued callbacks.
    return new Promise((resolve, reject) => {
      this.releaseFn.async(handle, (error: Error | null) => {
        if (error)
          reject(new AgentError('Native authorization cleanup failed'));
        else resolve();
      });
    });
  }
}
