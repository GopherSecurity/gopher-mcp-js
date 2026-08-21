import {
  defaultUrlElicitationHandler,
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
});
