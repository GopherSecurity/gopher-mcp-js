import { GopherAgent } from '../src/agent';
import { GopherOrchLibrary, GopherOrchHandle } from '../src/ffi/library';
import { AgentError } from '../src/errors';

const url =
  'https://trusted.example/authorize?client_id=c&redirect_uri=https%3A%2F%2Fcallback.example&response_type=code';
function fixture(external = false) {
  const handler = jest.fn(() => 'accept' as const);
  const lib = {
    agentAddRef: jest.fn(),
    agentRelease: jest.fn(),
    agentRun: jest.fn(),
    agentRunAsync: jest.fn(),
  };
  jest
    .spyOn(GopherOrchLibrary, 'getInstance')
    .mockReturnValue(lib as unknown as GopherOrchLibrary);
  const created = {
    requiresAsyncRun: external,
    close: jest.fn(async () => undefined),
    check: jest.fn(),
  };
  const Constructor = GopherAgent as unknown as {
    new (
      handle: GopherOrchHandle,
      options: unknown,
      origins: string[]
    ): GopherAgent;
  };
  const agent = new Constructor({} as GopherOrchHandle, { handler }, [
    'https://trusted.example',
  ]);
  Object.assign(agent, { embeddedCreation: created });
  return { agent, lib, created, handler };
}
afterEach(() => jest.restoreAllMocks());

describe('assembled agent provider continuation and disposal', () => {
  test('async run retains handle and preserves trusted provider retry', async () => {
    const { agent, lib, handler } = fixture(true);
    lib.agentRunAsync
      .mockResolvedValueOnce('Connect ' + url)
      .mockResolvedValueOnce('provider-ok');
    await expect(agent.runAsync('query')).resolves.toBe('provider-ok');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(lib.agentRunAsync).toHaveBeenCalledTimes(2);
    expect(lib.agentAddRef).toHaveBeenCalledTimes(1);
    expect(lib.agentRelease).toHaveBeenCalledTimes(1);
    await agent.disposeAsync();
  });
  test('rejects sync run before executing with an external store', () => {
    const { agent, lib } = fixture(true);
    expect(() => agent.run('query')).toThrow('runAsync');
    expect(lib.agentRun).not.toHaveBeenCalled();
    agent.dispose();
  });
  test('does not broaden provider origin trust or retry indefinitely', async () => {
    const { agent, lib, handler } = fixture();
    lib.agentRunAsync.mockResolvedValue(
      'Connect ' + url.replace('trusted.example', 'untrusted.example')
    );
    await agent.runAsync('query');
    expect(handler).not.toHaveBeenCalled();
    lib.agentRunAsync.mockResolvedValue('Connect ' + url);
    await expect(agent.runAsync('query')).rejects.toBeInstanceOf(AgentError);
    expect(handler).toHaveBeenCalledTimes(1);
    await agent.disposeAsync();
  });
  test('dispose during async run defers context close until retained handle is released', async () => {
    const { agent, lib, created } = fixture(true);
    let finish!: (value: string) => void;
    lib.agentRunAsync.mockReturnValue(
      new Promise<string>((resolve) => {
        finish = resolve;
      })
    );
    const run = agent.runAsync('query');
    agent.dispose();
    expect(created.close).not.toHaveBeenCalled();
    finish('done');
    await run;
    await agent.disposeAsync();
    expect(created.close).toHaveBeenCalledTimes(1);
    expect(lib.agentRelease).toHaveBeenCalledTimes(2);
    await expect(agent.runAsync('query')).rejects.toThrow('disposed');
  });
  test('structured async results retain error behavior and no extra replay', async () => {
    const { agent, lib } = fixture();
    lib.agentRunAsync.mockResolvedValue(null);
    const result = await agent.runDetailedAsync('query');
    expect(result.isSuccess()).toBe(false);
    expect(lib.agentRunAsync).toHaveBeenCalledTimes(1);
    await agent.disposeAsync();
  });
});
