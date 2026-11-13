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
