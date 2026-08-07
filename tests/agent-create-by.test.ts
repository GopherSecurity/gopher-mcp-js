/**
 * Contract tests for the five routing factories on GopherAgent.
 *
 * Mirrors the failure-path test set in
 * gopher-orch/tests/gopher/orch/agent_create_by_test.cc which locks
 * down the nullptr-on-failure contract that the C FFI surfaces here as
 * AgentError. Happy-path coverage needs a stubbed HTTP listener
 * capturing the /v1/mcp-servers query string and is tracked separately.
 */

import { GopherAgent } from '../src/agent';
import { AgentError } from '../src/errors';
import { GopherOrchLibrary } from '../src/ffi/library';

const PROVIDER = 'AnthropicProvider';
const MODEL = 'test-model';
const BAD_PROVIDER = 'NotARealProvider';
const URL = 'http://127.0.0.1:8080/mcp';

function describeIfNative(): jest.Describe {
  return GopherOrchLibrary.isAvailable() ? describe : describe.skip;
}

describeIfNative()('GopherAgent routing factories - contract tests', () => {
  // --------------------------------------------------------------
  // Empty api key. fetchMcpServers throws on the native side; the
  // factory must surface that as AgentError rather than returning a
  // partially-constructed agent or a null handle leaking through.
  // --------------------------------------------------------------

  test('createWithServerId rejects empty api key', async () => {
    await expect(
      GopherAgent.createWithServerId(PROVIDER, MODEL, '', 'srv-1')
    ).rejects.toThrow(AgentError);
  });

  test('createWithServerName rejects empty api key', async () => {
    await expect(
      GopherAgent.createWithServerName(PROVIDER, MODEL, '', 'my-server')
    ).rejects.toThrow(AgentError);
  });

  test('createWithGatewayId rejects empty api key', async () => {
    await expect(
      GopherAgent.createWithGatewayId(PROVIDER, MODEL, '', 'gw-1')
    ).rejects.toThrow(AgentError);
  });

  test('createWithGatewayName rejects empty api key', async () => {
    await expect(
      GopherAgent.createWithGatewayName(PROVIDER, MODEL, '', 'my-gateway')
    ).rejects.toThrow(AgentError);
  });

  // --------------------------------------------------------------
  // createWithUrl rejects empty url before any FFI work happens.
  // Mirrors the CreateByUrlRejectsEmptyUrl case in the C++ suite.
  // --------------------------------------------------------------

  test('createWithUrl rejects empty url', async () => {
    await expect(
      GopherAgent.createWithUrl(PROVIDER, MODEL, '')
    ).rejects.toThrow(AgentError);
  });

  // --------------------------------------------------------------
  // Unknown provider. createWithUrl synthesises a local http_sse
  // config and reaches createByJson, which rejects an unknown
  // provider name. The factory must surface that as AgentError.
  // --------------------------------------------------------------

  test('createWithUrl rejects unknown provider', async () => {
    await expect(
      GopherAgent.createWithUrl(BAD_PROVIDER, MODEL, URL, {
        oauth: { mode: 'disabled' },
      })
    ).rejects.toThrow(AgentError);
  });

  // --------------------------------------------------------------
  // AgentError surfaces a non-empty message so SDK consumers can
  // log a meaningful diagnostic; the C side fills lastError() and
  // the wrapper pump should propagate it through.
  // --------------------------------------------------------------

  test('createWithServerId surfaces a non-empty error message', async () => {
    try {
      await GopherAgent.createWithServerId(PROVIDER, MODEL, '', 'srv-1');
      fail('expected AgentError');
    } catch (e) {
      expect(e).toBeInstanceOf(AgentError);
      expect((e as AgentError).message.length).toBeGreaterThan(0);
    }
  });
});
