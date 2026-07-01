/**
 * Utility class for fetching server configurations.
 */

import { GopherAgent } from './agent';
import { AgentError, ApiKeyError } from './errors';

type GopherOrchLibraryClass = typeof import('./ffi/library').GopherOrchLibrary;

function getGopherOrchLibraryClass(): GopherOrchLibraryClass {
  return require('./ffi/library').GopherOrchLibrary as GopherOrchLibraryClass;
}

/**
 * Utility functions for fetching server configurations.
 */
export const ServerConfig = {
  /**
   * Fetch MCP server configurations from remote API.
   *
   * @param apiKey API key for authentication
   * @returns Server configuration JSON string
   * @throws {ApiKeyError} if API key is invalid or missing
   * @throws {AgentError} if fetch fails
   */
  fetch(apiKey: string): string {
    if (!GopherAgent.isInitialized()) {
      GopherAgent.init();
    }

    if (!apiKey || apiKey.trim() === '') {
      throw new ApiKeyError('Invalid or missing API key');
    }

    const lib = getGopherOrchLibraryClass().getInstance();
    if (lib === null) {
      const loadError = getGopherOrchLibraryClass().getLoadErrorMessage();
      throw new AgentError(`Native library not available.\n${loadError}`);
    }

    try {
      const result = lib.apiFetchServers(apiKey);
      if (result === null) {
        throw new AgentError('Failed to fetch servers: no response');
      }
      return result;
    } catch (e) {
      if (e instanceof ApiKeyError) {
        throw e;
      }
      throw new AgentError(`Failed to fetch servers: ${(e as Error).message}`);
    }
  },
};
