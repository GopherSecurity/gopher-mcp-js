import {
  ELICITATION_ACTION_ACCEPT,
  ELICITATION_ACTION_CANCEL,
  ELICITATION_ACTION_DECLINE,
  defaultUrlElicitationHandler,
  nativeActionFromElicitationAction,
  redactElicitationUrl,
  resolveElicitationActionSync,
  setElicitationInputForTest,
  toElicitationRequest,
  waitForOAuthCompletionSync,
} from '../src/elicitationRuntime';

describe('MCP elicitation runtime', () => {
  const originalDebug = process.env.DEBUG;
  const originalOAuthDebug = process.env.GOPHER_MCP_OAUTH_DEBUG;

  afterEach(() => {
    jest.restoreAllMocks();
    restoreEnv('DEBUG', originalDebug);
    restoreEnv('GOPHER_MCP_OAUTH_DEBUG', originalOAuthDebug);
    setElicitationInputForTest(null);
  });

  test('default URL handler returns accept after user confirms OAuth completion', () => {
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    mockStdinInput('\n');
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
    expect(stderr).toHaveBeenCalledWith(
      'Complete the OAuth flow in the browser, then press Enter to continue. Type "cancel" and press Enter to cancel.\n'
    );
  });

  test('default URL handler returns cancel when user cancels', () => {
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockStdinInput('cancel\n');
    const handler = defaultUrlElicitationHandler({ openBrowser: false });

    expect(
      handler({
        mode: 'url',
        url: 'https://auth.example.com/authorize?state=s',
      })
    ).toBe('cancel');
  });

  test('default URL handler closes terminal fd after confirmation', () => {
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const closeFd = jest.fn();
    mockStdinInput('\n', 42, closeFd);
    const handler = defaultUrlElicitationHandler({ openBrowser: false });

    expect(
      handler({
        mode: 'url',
        url: 'https://auth.example.com/authorize?state=s',
      })
    ).toBe('accept');
    expect(closeFd).toHaveBeenCalledWith(42);
  });

  test('default URL handler cancels in non-interactive mode', () => {
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const handler = defaultUrlElicitationHandler({ openBrowser: false });

    expect(
      handler({
        mode: 'url',
        url: 'https://auth.example.com/authorize?state=s',
      })
    ).toBe('cancel');
    expect(stderr).toHaveBeenCalledWith(
      'Cannot access an interactive terminal; canceling provider authorization.\n'
    );
  });

  test('default URL handler can use controlling terminal when stdin is piped', () => {
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockStdinInput('\n', 42);
    const handler = defaultUrlElicitationHandler({ openBrowser: false });

    expect(
      handler({
        mode: 'url',
        url: 'https://auth.example.com/authorize?state=s',
      })
    ).toBe('accept');
  });

  test('OAuth completion wait honors timeout while terminal has no input', () => {
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    setElicitationInputForTest((() => {
      const error = new Error('try again') as NodeJS.ErrnoException;
      error.code = 'EAGAIN';
      throw error;
    }) as typeof import('fs').readSync, () => 42, () => undefined);

    expect(waitForOAuthCompletionSync(1)).toBe('cancel');
    expect(stderr).toHaveBeenCalledWith(
      'Timed out waiting for OAuth completion; canceling provider authorization.\n'
    );
  });

  test('default URL handler declines form mode', () => {
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const handler = defaultUrlElicitationHandler({ openBrowser: false });

    expect(
      handler({
        mode: 'form',
        message: 'Choose an account',
      })
    ).toBe('decline');
    expect(stderr).not.toHaveBeenCalled();
  });

  test('custom handler receives form mode requests', () => {
    const handler = jest.fn(() => 'accept' as const);

    expect(
      resolveElicitationActionSync(
        { handler },
        {
          mode: 'form',
          elicitationId: 'form-1',
          message: 'Choose an account',
          rawParamsJson: '{"mode":"form"}',
        }
      )
    ).toBe('accept');
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'form',
        elicitationId: 'form-1',
        rawParamsJson: '{"mode":"form"}',
      })
    );
  });

  test('native request conversion passes form and unknown modes through', () => {
    expect(
      toElicitationRequest({
        mode: 'form',
        elicitation_id: 'form-1',
        message: 'Choose an account',
        raw_params_json: '{"mode":"form"}',
      })
    ).toEqual({
      mode: 'form',
      elicitationId: 'form-1',
      message: 'Choose an account',
      rawParamsJson: '{"mode":"form"}',
    });

    expect(
      toElicitationRequest({
        mode: 'future-mode',
        raw_json: '{"method":"elicitation/create"}',
      })
    ).toEqual({
      mode: 'future-mode',
      rawJson: '{"method":"elicitation/create"}',
    });
  });

  test('resolveElicitationActionSync uses default URL handler when omitted', () => {
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockStdinInput('\n');

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
    (action) => {
      expect(
        resolveElicitationActionSync(
          { handler: () => ({ action }) },
          {
            mode: 'url',
            url: 'https://auth.example.com/authorize',
          }
        )
      ).toBe(action);
    }
  );

  test('manual handler receives the elicitation request', () => {
    const handler = jest.fn(() => 'accept' as const);
    const request = {
      mode: 'url' as const,
      url: 'https://auth.example.com/authorize',
      elicitationId: 'el-1',
      message: 'Connect account',
      requestIdJson: '"req-1"',
    };

    expect(resolveElicitationActionSync({ handler }, request)).toBe('accept');
    expect(handler).toHaveBeenCalledWith(request);
  });

  test('custom handler receives unknown native modes without conversion failure', () => {
    const handler = jest.fn(() => 'decline' as const);

    expect(
      resolveElicitationActionSync(
        { handler },
        {
          mode: 'future-mode',
          elicitationId: 'future-1',
          rawJson: '{"method":"elicitation/create"}',
        }
      )
    ).toBe('decline');
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'future-mode',
        elicitationId: 'future-1',
      })
    );
  });

  test('manual handler thrown errors propagate to the native bridge', () => {
    expect(() =>
      resolveElicitationActionSync(
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
    ).toThrow('user closed prompt');
  });

  test.each([
    ['accept', ELICITATION_ACTION_ACCEPT],
    ['decline', ELICITATION_ACTION_DECLINE],
    ['cancel', ELICITATION_ACTION_CANCEL],
  ] as const)('maps %s to native action %s', (action, nativeAction) => {
    expect(nativeActionFromElicitationAction(action)).toBe(nativeAction);
  });

  test('sync resolver rejects async handlers for native bridge', () => {
    expect(() =>
      resolveElicitationActionSync(
        {
          handler: (async () =>
            'accept' as const) as unknown as () => 'accept',
        },
        {
          mode: 'url',
          url: 'https://auth.example.com/authorize',
        }
      )
    ).toThrow('Async MCP elicitation handlers are not supported');
  });

  test('redacts OAuth URL query secrets', () => {
    expect(
      redactElicitationUrl(
        'https://auth.example.com/oauth?client_id=c&state=secret-state&code=secret-code&access_token=tok#frag'
      )
    ).toBe(
      'https://auth.example.com/oauth?client_id=%3Cpresent%3E&state=%3Credacted%3E&code=%3Credacted%3E&access_token=%3Credacted%3E#%3Credacted%3E'
    );
  });

  test('debug logging is secret-safe', () => {
    process.env.GOPHER_MCP_OAUTH_DEBUG = '1';
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    expect(
      resolveElicitationActionSync(
        { handler: () => 'accept' },
        {
          mode: 'url',
          url: 'https://auth.example.com/oauth?state=secret-state&client_secret=secret-client',
          elicitationId: 'el-1',
        }
      )
    ).toBe('accept');

    const logs = stderr.mock.calls.map((call) => String(call[0])).join('');
    expect(logs).toContain('"host":"auth.example.com"');
    expect(logs).toContain('"mode":"url"');
    expect(logs).toContain('"elicitationId":"el-1"');
    expect(logs).toContain('"action":"accept"');
    expect(logs).not.toContain('secret-state');
    expect(logs).not.toContain('secret-client');
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function mockStdinInput(
  input: string,
  fd = 42,
  closeFd: (fd: number) => void = () => undefined
): void {
  let offset = 0;
  setElicitationInputForTest(((
    _fd: number,
    buffer: NodeJS.ArrayBufferView
  ) => {
    if (offset >= input.length) {
      return 0;
    }
    const byte = input.charCodeAt(offset);
    offset += 1;
    new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)[0] =
      byte;
    return 1;
  }) as typeof import('fs').readSync, () => fd, closeFd);
}
