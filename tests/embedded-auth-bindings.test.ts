import type * as koffi from 'koffi';
import { EmbeddedAuthBindings } from '../src/ffi/embeddedAuth';
import type { GopherOrchHandle } from '../src/ffi/library';

function fixture() {
  const handle = {} as GopherOrchHandle;
  const functions: Record<string, jest.Mock> = {};
  const release = Object.assign(jest.fn(), {
    async: jest.fn((_handle, cb: (error: null) => void) => cb(null)),
  });
  const lib = {
    func: jest.fn((name: string) => {
      if (name.endsWith('_release')) return release;
      return (functions[name] ??= jest.fn(() => 0));
    }),
  } as unknown as koffi.IKoffiLib;
  const bindings = new EmbeddedAuthBindings(lib, 'str');
  functions.gopher_orch_auth_capabilities!.mockReturnValue(
    '{"version":1,"embedded_auth":true}'
  );
  functions.gopher_orch_auth_create!.mockReturnValue(handle);
  functions.gopher_orch_auth_take_agent!.mockReturnValue(handle);
  return { bindings, functions, release, handle };
}

describe('additive embedded auth ABI', () => {
  test('feature detects version/platform without affecting old bindings', () => {
    const { bindings, functions } = fixture();
    expect(bindings.capabilities()?.version).toBe(1);
    functions.gopher_orch_auth_capabilities!.mockReturnValue(
      '{"version":1,"embedded_auth":false}'
    );
    expect(bindings.capabilities()).toBeNull();
    expect(() => bindings.create('{}', '{}', null)).toThrow('interface v1');
  });
  test('keeps public and privileged queues separate and releases asynchronously', async () => {
    const { bindings, functions, handle, release } = fixture();
    expect(bindings.create('{}', '{}', null)).toBe(handle);
    bindings.start(handle);
    functions.gopher_orch_auth_next_event!.mockReturnValue(
      '{"type":"page","url":"private"}'
    );
    functions.gopher_orch_auth_next_store_request!.mockReturnValue(
      '{"id":"1","operation":"get","binding":{}}'
    );
    expect(bindings.event(handle)?.type).toBe('page');
    expect(bindings.storeRequest(handle)?.operation).toBe('get');
    bindings.completeStore(handle, '1', { found: false });
    bindings.createAgent(handle, 'p', 'm');
    expect(bindings.takeAgent(handle)).toBe(handle);
    bindings.cancel(handle);
    await bindings.release(handle);
    expect(release.async).toHaveBeenCalledTimes(1);
  });
  test('reports sanitized state/protocol failures', () => {
    const { bindings, functions, handle } = fixture();
    functions.gopher_orch_auth_start!.mockReturnValue(-32);
    expect(() => bindings.start(handle)).toThrow('operation rejected');
    functions.gopher_orch_auth_next_event!.mockReturnValue(
      'secret broken JSON'
    );
    expect(() => bindings.event(handle)).toThrow(
      'Invalid native authorization event'
    );
    functions.gopher_orch_auth_next_event!.mockReturnValue(null);
    expect(bindings.event(handle)).toBeNull();
  });
});
