import { spawn } from 'child_process';
import { platform } from 'os';

export interface OpenAuthorizationUrlOptions {
  openBrowser?: boolean;
  platform?: NodeJS.Platform;
  spawn?: SpawnFunction;
}

export interface OpenAuthorizationUrlResult {
  opened: boolean;
  url: string;
  command?: string;
  args?: string[];
}

type SpawnFunction = (
  command: string,
  args: string[],
  options: { detached: boolean; stdio: 'ignore' }
) => SpawnedProcess;

interface SpawnedProcess {
  unref(): void;
  once(event: 'error', listener: (error: Error) => void): SpawnedProcess;
  once(event: 'spawn', listener: () => void): SpawnedProcess;
}

export async function openAuthorizationUrl(
  url: string,
  options: OpenAuthorizationUrlOptions = {}
): Promise<OpenAuthorizationUrlResult> {
  if (options.openBrowser === false) {
    return { opened: false, url };
  }

  const selectedPlatform = options.platform ?? platform();
  const command = commandForPlatform(selectedPlatform);
  const args = argsForPlatform(selectedPlatform, url);
  const spawnFn = options.spawn ?? spawn;

  await spawnDetached(spawnFn, command, args, url);
  return { opened: true, url, command, args };
}

export function commandForPlatform(currentPlatform: NodeJS.Platform): string {
  switch (currentPlatform) {
    case 'darwin':
      return 'open';
    case 'win32':
      return 'cmd';
    default:
      return 'xdg-open';
  }
}

function argsForPlatform(
  currentPlatform: NodeJS.Platform,
  url: string
): string[] {
  if (currentPlatform === 'win32') {
    return ['/c', 'start', '', url];
  }
  return [url];
}

function spawnDetached(
  spawnFn: SpawnFunction,
  command: string,
  args: string[],
  url: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnFn(command, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.once('error', (error) => {
      reject(
        new Error(
          `Failed to open OAuth authorization URL ${url}: ${error.message}`
        )
      );
    });
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
