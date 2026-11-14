import { GopherAgent } from '../src/agent';
import { GopherOrchLibrary, GopherOrchHandle } from '../src/ffi/library';

function fixture(raw: string | null = '["first_tool","second_tool"]') {
  const handle = {} as GopherOrchHandle;
  const lib = {
    agentToolNames: jest.fn(() => raw),
    agentRelease: jest.fn(),
    agentRun: jest.fn(),
    agentRunAsync: jest.fn(),
    lastError: jest.fn(() => ({ message: 'native error' })),
    clearError: jest.fn(),
  };
  jest
    .spyOn(GopherOrchLibrary, 'getInstance')
    .mockReturnValue(lib as unknown as GopherOrchLibrary);
  const Constructor = GopherAgent as unknown as {
    new (handle: GopherOrchHandle): GopherAgent;
  };
  return { agent: new Constructor(handle), lib, handle };
}

afterEach(() => jest.restoreAllMocks());

test('reads the existing agent registry without network or LLM work', () => {
  const { agent, lib, handle } = fixture();
  const fetch = jest.spyOn(globalThis, 'fetch');
  expect(agent.getToolNames()).toEqual(['first_tool', 'second_tool']);
  expect(lib.agentToolNames).toHaveBeenCalledWith(handle);
  expect(fetch).not.toHaveBeenCalled();
  expect(lib.agentRun).not.toHaveBeenCalled();
  expect(lib.agentRunAsync).not.toHaveBeenCalled();
  agent.dispose();
});

test('a connected agent may have no tools', () => {
  const { agent } = fixture('[]');
  expect(agent.getToolNames()).toEqual([]);
  agent.dispose();
});

for (const raw of ['invalid-json', '{}', '["ok",1]']) {
  test(`invalid native tool list is rejected: ${raw}`, () => {
    const { agent } = fixture(raw);
    expect(() => agent.getToolNames()).toThrow('invalid tool list');
    agent.dispose();
  });
}

test('native errors are surfaced and cleared', () => {
  const { agent, lib } = fixture(null);
  expect(() => agent.getToolNames()).toThrow('native error');
  expect(lib.clearError).toHaveBeenCalledTimes(1);
  agent.dispose();
});

test('missing native capability gives a rebuild error without changing other agent methods', () => {
  const { agent, lib } = fixture();
  lib.agentToolNames.mockImplementation(() => {
    throw new Error('Rebuild the native SDK');
  });
  expect(() => agent.getToolNames()).toThrow('Rebuild the native SDK');
  expect(agent.isDisposed()).toBe(false);
  agent.dispose();
});

test('disposed agents are rejected before reading a native handle', () => {
  const { agent, lib } = fixture();
  agent.dispose();
  expect(() => agent.getToolNames()).toThrow('disposed');
  expect(lib.agentToolNames).not.toHaveBeenCalled();
});

test('assembled agent host failures are checked before reading tools', () => {
  const { agent, lib } = fixture();
  Object.assign(agent, {
    embeddedCreation: {
      check: () => {
        throw new Error('authorization host failed');
      },
      close: async () => undefined,
    },
  });
  expect(() => agent.getToolNames()).toThrow('authorization host failed');
  expect(lib.agentToolNames).not.toHaveBeenCalled();
  agent.dispose();
});
