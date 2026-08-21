import {
  defaultUrlElicitationHandler,
  resolveElicitationAction,
  resolveElicitationActionSync,
} from '../src/elicitationRuntime';

describe('MCP elicitation runtime', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('default URL handler returns accept after surfacing manual URL', () => {
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const handler = defaultUrlElicitationHandler({ openBrowser: false });

    expect(
      handler({
        mode: 'url',
        url: 'https://auth.example.com/authorize?state=s',
      })
    ).toBe('accept');
    expect(stderr).toHaveBeenCalledWith(
      'Open this OAuth authorization URL to continue:\n' +
        'https://auth.example.com/authorize?state=s\n'
    );
  });

  test('resolveElicitationActionSync uses default URL handler when omitted', () => {
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(
      resolveElicitationActionSync(
        { openBrowser: false },
        {
          mode: 'url',
          url: 'https://auth.example.com/authorize',
        }
      )
    ).toBe('accept');
  });

  test.each(['accept', 'decline', 'cancel'] as const)(
    'manual handler can return %s action object',
    async (action) => {
      await expect(
        resolveElicitationAction(
          { handler: () => ({ action }) },
          {
            mode: 'url',
            url: 'https://auth.example.com/authorize',
          }
        )
      ).resolves.toBe(action);
    }
  );

  test('manual handler receives the elicitation request', async () => {
    const handler = jest.fn(async () => 'accept' as const);
    const request = {
      mode: 'url' as const,
      url: 'https://auth.example.com/authorize',
      elicitationId: 'el-1',
      message: 'Connect account',
      requestIdJson: '"req-1"',
    };

    await expect(
      resolveElicitationAction({ handler }, request)
    ).resolves.toBe('accept');
    expect(handler).toHaveBeenCalledWith(request);
  });

  test('manual handler thrown errors become cancel', async () => {
    await expect(
      resolveElicitationAction(
        {
          handler: () => {
            throw new Error('user closed prompt');
          },
        },
        {
          mode: 'url',
          url: 'https://auth.example.com/authorize',
        }
      )
    ).resolves.toBe('cancel');
  });
});
