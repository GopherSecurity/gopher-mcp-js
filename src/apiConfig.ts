import { execFileSync } from 'child_process';
import { AgentError, ApiKeyError } from './errors';

const FETCH_SCRIPT = `
const fs = require('fs');

(async () => {
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    const response = await fetch(input.url, {
      headers: {
        accept: 'application/json',
        Authorization: 'Bearer ' + input.apiKey,
      },
    });
    const body = await response.text();
    if (!response.ok) {
      console.error('HTTP request failed with status ' + response.status);
      process.exit(2);
    }
    process.stdout.write(body);
  } catch (error) {
    console.error(error && error.message ? error.message : String(error));
    process.exit(1);
  }
})();
`;

export interface ServerConfigRoute {
  key: 'serverId' | 'serverName' | 'gatewayId' | 'gatewayName';
  value: string;
}

export function fetchGopherServerConfig(
  apiKey: string,
  route?: ServerConfigRoute
): string {
  if (!apiKey || apiKey.trim() === '') {
    throw new ApiKeyError('Invalid or missing API key');
  }

  const url = new URL('/v1/mcp-servers', getGopherApiRoot());
  if (route !== undefined) {
    url.searchParams.set(route.key, route.value);
  }

  try {
    return execFileSync(process.execPath, ['-e', FETCH_SCRIPT], {
      input: JSON.stringify({ url: url.toString(), apiKey }),
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
    });
  } catch (error) {
    const detail =
      error instanceof Error && 'stderr' in error
        ? String((error as Error & { stderr?: unknown }).stderr).trim()
        : error instanceof Error
          ? error.message
          : String(error);
    throw new AgentError(
      `Failed to fetch servers${detail ? `: ${detail}` : ''}`
    );
  }
}

function getGopherApiRoot(): string {
  const value = process.env['GOPHER_SDK_TEST'];
  if (value !== undefined) {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return 'https://api-test.gopher.security';
    }
  }
  return 'https://api.gopher.security';
}
