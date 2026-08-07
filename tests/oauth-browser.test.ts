import { EventEmitter } from 'events';
import { commandForPlatform, openAuthorizationUrl } from '../src/oauthBrowser';

class FakeSpawnedProcess extends EventEmitter {
  unref = jest.fn();

  emitSpawn(): void {
    this.emit('spawn');
  }

  emitError(error: Error): void {
    this.emit('error', error);
  }
}

function createSpawn(seen: {
  child?: FakeSpawnedProcess;
  command?: string;
  args?: string[];
}) {
  return jest.fn((command, args) => {
    seen.command = command;
    seen.args = args;
    seen.child = new FakeSpawnedProcess();
    process.nextTick(() => seen.child?.emitSpawn());
    return seen.child;
  });
}

describe('OAuth browser open helper', () => {
  test('selects command by platform', () => {
    expect(commandForPlatform('darwin')).toBe('open');
    expect(commandForPlatform('win32')).toBe('cmd');
    expect(commandForPlatform('linux')).toBe('xdg-open');
  });

  test('macOS opens URL with open command', async () => {
    const seen: {
      child?: FakeSpawnedProcess;
      command?: string;
      args?: string[];
    } = {};
    const spawn = createSpawn(seen);

    await expect(
      openAuthorizationUrl('https://auth.example.com/authorize', {
        platform: 'darwin',
        spawn,
      })
    ).resolves.toEqual({
      opened: true,
      url: 'https://auth.example.com/authorize',
      command: 'open',
      args: ['https://auth.example.com/authorize'],
    });

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(seen.child?.unref).toHaveBeenCalledTimes(1);
  });

  test('Windows uses cmd start', async () => {
    const seen: {
      child?: FakeSpawnedProcess;
      command?: string;
      args?: string[];
    } = {};

    await openAuthorizationUrl('https://auth.example.com/authorize', {
      platform: 'win32',
      spawn: createSpawn(seen),
    });

    expect(seen.command).toBe('cmd');
    expect(seen.args).toEqual([
      '/c',
      'start',
      '',
      'https://auth.example.com/authorize',
    ]);
  });

  test('Linux uses xdg-open', async () => {
    const seen: {
      child?: FakeSpawnedProcess;
      command?: string;
      args?: string[];
    } = {};

    await openAuthorizationUrl('https://auth.example.com/authorize', {
      platform: 'linux',
      spawn: createSpawn(seen),
    });

    expect(seen.command).toBe('xdg-open');
    expect(seen.args).toEqual(['https://auth.example.com/authorize']);
  });

  test('openBrowser false does not spawn', async () => {
    const spawn = jest.fn();

    await expect(
      openAuthorizationUrl('https://auth.example.com/authorize', {
        openBrowser: false,
        spawn,
      })
    ).resolves.toEqual({
      opened: false,
      url: 'https://auth.example.com/authorize',
    });

    expect(spawn).not.toHaveBeenCalled();
  });

  test('spawn errors include authorization URL', async () => {
    const spawn = jest.fn(() => {
      const child = new FakeSpawnedProcess();
      process.nextTick(() => child.emitError(new Error('missing command')));
      return child;
    });

    await expect(
      openAuthorizationUrl('https://auth.example.com/authorize', {
        platform: 'linux',
        spawn,
      })
    ).rejects.toThrow(
      'Failed to open OAuth authorization URL https://auth.example.com/authorize'
    );
  });
});
