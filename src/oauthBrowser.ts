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

  const opened = await spawnDetached(spawnFn, command, args);
  return { opened, url, command, args };
}

export function openAuthorizationUrlDetached(
  url: string,
  options: OpenAuthorizationUrlOptions = {}
): OpenAuthorizationUrlResult {
  if (options.openBrowser === false) {
    return { opened: false, url };
  }

  const selectedPlatform = options.platform ?? platform();
  const command = commandForPlatform(selectedPlatform);
  const args = argsForPlatform(selectedPlatform, url);
  const spawnFn = options.spawn ?? spawn;

  try {
    const child = spawnFn(command, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.once('error', () => undefined);
    child.unref();
    // Detached opens cannot observe async spawn failures before returning.
    // Treat the browser launch as best-effort so callers still show the URL.
    return { opened: false, url, command, args };
  } catch {
    return { opened: false, url, command, args };
  }
}

export function commandForPlatform(currentPlatform: NodeJS.Platform): string {
  switch (currentPlatform) {
    case 'darwin':
      return 'open';
    case 'win32':
      return 'rundll32';
    default:
      return 'xdg-open';
  }
}

export function argsForPlatform(
  currentPlatform: NodeJS.Platform,
  url: string
): string[] {
  if (currentPlatform === 'win32') {
    return ['url.dll,FileProtocolHandler', url];
  }
  return [url];
}

function spawnDetached(
  spawnFn: SpawnFunction,
  command: string,
  args: string[]
): Promise<boolean> {
  return new Promise((resolve) => {
    let child: SpawnedProcess;
    try {
      child = spawnFn(command, args, {
        detached: true,
        stdio: 'ignore',
      });
    } catch {
      resolve(false);
      return;
    }
    child.once('error', () => {
      resolve(false);
    });
    child.once('spawn', () => {
      child.unref();
      resolve(true);
    });
  });
}
