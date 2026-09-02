import * as koffi from 'koffi';
import { GopherAgent } from '../src/agent';
import {
  GopherAgentOAuthOptions,
  GopherAgentTokenStore,
} from '../src/config';
import { GopherOrchHandle, GopherOrchLibrary } from '../src/ffi/library';
import {
  GOPHER_AGENT_OAUTH_TEST_HOOKS,
  GopherAgentOAuthTestHooks,
} from '../src/internalOAuthTestHooks';
import {
  OAUTH_TEST_ACCESS_TOKEN,
  OAUTH_TEST_CLIENT_ID,
  OAUTH_TEST_CLIENT_SECRET,
  OAUTH_TEST_REFRESH_TOKEN,
  startCustomOAuthTestIdp,
} from './helpers/customOAuthTestIdp';
import { startCustomProtectedMcpEndpoints } from './helpers/customProtectedMcpEndpoints';

const PROVIDER = 'AnthropicProvider';
const MODEL = 'test-model';
const mockRegisteredCallbacks: Array<(requestPtr: unknown) => number> = [];
let mockDecodedElicitationRequest: unknown;

jest.mock('koffi', () => ({
  register: jest.fn((callback: unknown) => {
    mockRegisteredCallbacks.push(callback as (requestPtr: unknown) => number);
    return callback;
  }),
  unregister: jest.fn(),
  decode: jest.fn(() => mockDecodedElicitationRequest),
}));

type AgentCreateByUrl = jest.Mock<
  GopherOrchHandle,
  [string, string, string, NativeAgentOptions | null]
>;
type NativeAgentOptions = {
  access_token: string | null;
  elicitation_callback: unknown;
  elicitation_timeout_ms: bigint;
};
type CreateFromFfi = (
  createHandle: (lib: GopherOrchLibrary) => GopherOrchHandle
) => GopherAgent;

describe('OAuth elicitation verification with custom IdP', () => {
  afterEach(() => {
    mockRegisteredCallbacks.length = 0;
    mockDecodedElicitationRequest = undefined;
    jest.mocked(koffi.unregister).mockClear();
    jest.restoreAllMocks();
  });

  test('resolves first-step OAuth and accepts second-step provider OAuth', async () => {
    const idp = await startCustomOAuthTestIdp();
    const endpoints = await startCustomProtectedMcpEndpoints({
      authorizationServer: idp.issuer,
      accessToken: OAUTH_TEST_ACCESS_TOKEN,
    });
    const tokenStore = refreshTokenStore();
    const elicitationHandler = jest.fn(() => ({ action: 'accept' as const }));
    mockDecodedElicitationRequest = {
      mode: 'url',
      elicitation_id: 'provider-oauth-1',
      message: 'Connect provider account',
      url: `${idp.authorizationEndpoint}?client_id=provider-client&state=provider-state`,
      request_id_json: '"srv-1"',
    };
    const agentCreateByUrl = installNativeCreateMock();

    try {
      await GopherAgent.createWithUrl(
        PROVIDER,
        MODEL,
        endpoints.gateway.mcpUrl,
        {
          oauth: withOAuthTestHooks(
            {
              tokenStore,
            },
            {
              registerClient: async () => ({
                clientId: OAUTH_TEST_CLIENT_ID,
                clientSecret: OAUTH_TEST_CLIENT_SECRET,
              }),
            }
          ),
          elicitation: {
            handler: elicitationHandler,
            openBrowser: false,
          },
        }
      );

      const nativeOptions = agentCreateByUrl.mock.calls[0]?.[3];
      expect(nativeOptions?.access_token).toBe(OAUTH_TEST_ACCESS_TOKEN);
      expect(nativeOptions?.elicitation_timeout_ms).toBe(BigInt(0));
      expect(nativeOptions?.elicitation_callback).toBe(
        mockRegisteredCallbacks[0]
      );

      expect(mockRegisteredCallbacks).toHaveLength(1);
      const registeredCallback = mockRegisteredCallbacks[0];
      expect(registeredCallback).toBeDefined();
      expect(registeredCallback!('native-request')).toBe(1);
      expect(koffi.decode).toHaveBeenCalledWith(
        'native-request',
        'GopherOrchElicitationRequest'
      );

      expect(elicitationHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'url',
          elicitationId: 'provider-oauth-1',
          url: expect.stringContaining(idp.authorizationEndpoint),
        })
      );
    } finally {
      await endpoints.close();
      await idp.close();
    }
  });

  test('releases registered callback when native create throws', () => {
    const nativeFailure = new Error('native create failed');
    const fakeLibrary = createFakeLibraryForAgentCreateByUrl(() => {
      throw nativeFailure;
    });

    expect(() =>
      GopherOrchLibrary.prototype.agentCreateByUrl.call(
        fakeLibrary,
        PROVIDER,
        MODEL,
        'http://127.0.0.1:8080/mcp',
        {
          elicitation: {
            handler: () => 'accept',
            openBrowser: false,
          },
        }
      )
    ).toThrow(nativeFailure);

    expect(mockRegisteredCallbacks).toHaveLength(1);
    expect(koffi.unregister).toHaveBeenCalledWith(mockRegisteredCallbacks[0]);
    expect(fakeLibrary.agentOptionResources.size).toBe(0);
  });

  test('releases registered callback when with-options symbol is missing', () => {
    const fakeLibrary = createFakeLibraryForAgentCreateByUrl(null);

    expect(() =>
      GopherOrchLibrary.prototype.agentCreateByUrl.call(
        fakeLibrary,
        PROVIDER,
        MODEL,
        'http://127.0.0.1:8080/mcp',
        {
          elicitation: {
            handler: () => 'accept',
            openBrowser: false,
          },
        }
      )
    ).toThrow('does not expose agent runtime options');

    expect(mockRegisteredCallbacks).toHaveLength(1);
    expect(koffi.unregister).toHaveBeenCalledWith(mockRegisteredCallbacks[0]);
    expect(fakeLibrary.agentOptionResources.size).toBe(0);
  });
});

function installNativeCreateMock(): AgentCreateByUrl {
  const agentCreateByUrl = jest.fn<
    GopherOrchHandle,
    [string, string, string, NativeAgentOptions | null]
  >(() => ({}) as GopherOrchHandle);
  const agent = {
    dispose: jest.fn(),
    isDisposed: jest.fn(() => false),
  } as unknown as GopherAgent;

  jest
    .spyOn(
      GopherAgent as unknown as { createFromFfi: CreateFromFfi },
      'createFromFfi'
    )
    .mockImplementation((createHandle) => {
      createHandle(createFakeLibraryForAgentCreateByUrl(agentCreateByUrl));
      return agent;
    });

  return agentCreateByUrl;
}

function createFakeLibraryForAgentCreateByUrl(
  createWithOptions: AgentCreateByUrl | (() => never) | null
): GopherOrchLibrary & {
  agentOptionResources: Map<GopherOrchHandle, unknown>;
} {
  return {
    available: true,
    _agentCreateByUrl: jest.fn(),
    _agentCreateByUrlWithOptions: createWithOptions,
    ffiTypes: {
      GopherOrchElicitationRequest: 'GopherOrchElicitationRequest',
    },
    _elicitationCallbackSupport: jest.fn(() => 1),
    agentOptionResources: new Map(),
    agentCreateByUrl: GopherOrchLibrary.prototype.agentCreateByUrl,
  } as unknown as GopherOrchLibrary & {
    agentOptionResources: Map<GopherOrchHandle, unknown>;
  };
}

function refreshTokenStore(): GopherAgentTokenStore {
  return {
    get: jest.fn(async () => ({
      accessToken: 'expired-access-token',
      refreshToken: OAUTH_TEST_REFRESH_TOKEN,
      tokenType: 'Bearer',
      expiresAt: 0,
      oauthClientId: OAUTH_TEST_CLIENT_ID,
      oauthClientSecret: OAUTH_TEST_CLIENT_SECRET,
    })),
    set: jest.fn(async () => undefined),
  };
}

function withOAuthTestHooks(
  oauth: GopherAgentOAuthOptions,
  hooks: GopherAgentOAuthTestHooks
): GopherAgentOAuthOptions {
  return {
    ...oauth,
    [GOPHER_AGENT_OAUTH_TEST_HOOKS]: hooks,
  } as GopherAgentOAuthOptions;
}
