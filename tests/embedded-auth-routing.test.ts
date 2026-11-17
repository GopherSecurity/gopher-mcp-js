import {
  MultipleMcpOAuthRequired,
  resolveRuntimeOptionsWithOAuth,
} from '../src/oauthResolver';

const urls = ['https://one.example/mcp', 'https://two.example/mcp'];
describe('assemble routing preserves equivalent legacy resources', () => {
  test.each([true, false])(
    'same issuer resource equivalence=%s',
    async (equivalent) => {
      const acquireToken = jest.fn(async () => ({
        accessToken: 'scoped-token',
      }));
      const resolve = resolveRuntimeOptionsWithOAuth({
        urls,
        deferMultipleOAuth: true,
        hooks: {
          probeChallenge: async (url) => ({
            url,
            requiresOAuth: true,
            authorizationServer: 'https://issuer.example',
            resourceMetadataUrl: url + '/metadata',
            resource: equivalent ? 'https://shared.example/resource' : url,
            scopes: ['read'],
          }),
          acquireToken,
        },
      });
      if (equivalent) {
        await expect(resolve).resolves.toEqual({ accessToken: 'scoped-token' });
        expect(acquireToken).toHaveBeenCalledTimes(1);
      } else {
        await expect(resolve).rejects.toBeInstanceOf(MultipleMcpOAuthRequired);
        expect(acquireToken).not.toHaveBeenCalled();
      }
    }
  );
});

describe('configured OAuth clients never silently use legacy DCR', () => {
  const clients = {
    source: {
      clientId: 'registered-client',
      clientSecret: 'private-client-secret',
      tokenEndpointAuthMethod: 'client_secret_post' as const,
    },
  };
  const challenge = async (url: string) => ({
    url,
    requiresOAuth: true,
    authorizationServer: 'https://issuer.example',
    resourceMetadataUrl: url + '/metadata',
    resource: 'https://shared.example/resource',
    scopes: ['read'],
  });

  test.each([1, 2])(
    'routes %s OAuth source(s) with clients directly to native coordination',
    async (count) => {
      const acquireToken = jest.fn(async () => ({
        accessToken: 'legacy-token',
      }));
      const fetchProtectedResourceMetadata = jest.fn();
      await expect(
        resolveRuntimeOptionsWithOAuth({
          urls: urls.slice(0, count),
          deferMultipleOAuth: true,
          oauth: { assemble: { clients } },
          hooks: {
            probeChallenge: challenge,
            acquireToken,
            fetchProtectedResourceMetadata,
          },
        })
      ).rejects.toBeInstanceOf(MultipleMcpOAuthRequired);
      expect(acquireToken).not.toHaveBeenCalled();
      expect(fetchProtectedResourceMetadata).not.toHaveBeenCalled();
    }
  );

  test.each([undefined, false])(
    'rejects configured clients when native handoff is unavailable (%s)',
    async (deferMultipleOAuth) => {
      const acquireToken = jest.fn();
      await expect(
        resolveRuntimeOptionsWithOAuth({
          urls: [urls[0]!],
          deferMultipleOAuth,
          oauth: { assemble: { clients } },
          hooks: { probeChallenge: challenge, acquireToken },
        })
      ).rejects.toMatchObject({ code: 'OAUTH_ASSEMBLE_CLIENTS_UNSUPPORTED' });
      expect(acquireToken).not.toHaveBeenCalled();
    }
  );

  test.each([undefined, {}])(
    'single source without configured clients retains legacy flow (%p)',
    async (configuredClients) => {
      const acquireToken = jest.fn(async () => ({
        accessToken: 'legacy-token',
      }));
      await expect(
        resolveRuntimeOptionsWithOAuth({
          urls: [urls[0]!],
          deferMultipleOAuth: true,
          oauth: { assemble: { clients: configuredClients } },
          hooks: { probeChallenge: challenge, acquireToken },
        })
      ).resolves.toEqual({ accessToken: 'legacy-token' });
      expect(acquireToken).toHaveBeenCalledTimes(1);
    }
  );

  test('public sources do not start authorization just because clients are configured', async () => {
    const acquireToken = jest.fn();
    await expect(
      resolveRuntimeOptionsWithOAuth({
        urls,
        deferMultipleOAuth: true,
        oauth: { assemble: { clients } },
        hooks: {
          probeChallenge: async (url) => ({ url, requiresOAuth: false }),
          acquireToken,
        },
      })
    ).resolves.toBeUndefined();
    expect(acquireToken).not.toHaveBeenCalled();
  });

  test.each([
    { oauth: { mode: 'disabled' as const, assemble: { clients } } },
    {
      oauth: { assemble: { clients } },
      runtimeOptions: { accessToken: 'explicit-token' },
    },
  ])(
    'disabled OAuth or explicit credentials keep existing behavior',
    async (options) => {
      const probeChallenge = jest.fn();
      const acquireToken = jest.fn();
      await expect(
        resolveRuntimeOptionsWithOAuth({
          urls,
          deferMultipleOAuth: true,
          ...options,
          hooks: { probeChallenge, acquireToken },
        })
      ).resolves.toEqual(options.runtimeOptions);
      expect(probeChallenge).not.toHaveBeenCalled();
      expect(acquireToken).not.toHaveBeenCalled();
    }
  );
});
