import { EventEmitter } from 'events';
import {
  commandForPlatform,
  openAuthorizationUrl,
  openAuthorizationUrlDetached,
} from '../src/oauthBrowser';

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
    expect(commandForPlatform('win32')).toBe('rundll32');
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

  test('Windows opens URL without cmd shell parsing', async () => {
    const seen: {
      child?: FakeSpawnedProcess;
      command?: string;
      args?: string[];
    } = {};

    await openAuthorizationUrl(
      'https://auth.example.com/authorize?client_id=c&state=s',
      {
        platform: 'win32',
        spawn: createSpawn(seen),
      }
    );

    expect(seen.command).toBe('rundll32');
    expect(seen.args).toEqual([
      'url.dll,FileProtocolHandler',
      'https://auth.example.com/authorize?client_id=c&state=s',
    ]);
  });

  test('spawn errors fall back to manual URL', async () => {
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
    ).resolves.toEqual({
      opened: false,
      url: 'https://auth.example.com/authorize',
      command: 'xdg-open',
      args: ['https://auth.example.com/authorize'],
    });
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

  test('detached opener returns immediately after spawning', () => {
    const seen: {
      child?: FakeSpawnedProcess;
      command?: string;
      args?: string[];
    } = {};
    const spawn = createSpawn(seen);

    expect(
      openAuthorizationUrlDetached('https://auth.example.com/authorize', {
        platform: 'darwin',
        spawn,
      })
    ).toEqual({
      opened: true,
      url: 'https://auth.example.com/authorize',
      command: 'open',
      args: ['https://auth.example.com/authorize'],
    });
    expect(seen.child?.unref).toHaveBeenCalledTimes(1);
  });

  test('detached opener reports synchronous spawn failures', () => {
    const spawn = jest.fn(() => {
      throw new Error('missing command');
    });

    expect(
      openAuthorizationUrlDetached('https://auth.example.com/authorize', {
        platform: 'linux',
        spawn,
      })
    ).toEqual({
      opened: false,
      url: 'https://auth.example.com/authorize',
      command: 'xdg-open',
      args: ['https://auth.example.com/authorize'],
    });
  });
});
