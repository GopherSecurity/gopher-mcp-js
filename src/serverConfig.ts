/**
 * Utility class for fetching server configurations.
 */

import { GopherAgent } from './agent';
import { AgentError, ApiKeyError } from './errors';
import { fetchGopherServerConfig } from './apiConfig';

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
  async fetch(apiKey: string): Promise<string> {
    if (!GopherAgent.isInitialized()) {
      GopherAgent.init();
    }

    if (!apiKey || apiKey.trim() === '') {
      throw new ApiKeyError('Invalid or missing API key');
    }

    if (getGopherOrchLibraryClass().getInstance() === null) {
      const loadError = getGopherOrchLibraryClass().getLoadErrorMessage();
      throw new AgentError(`Native library not available.\n${loadError}`);
    }

    try {
      return await fetchGopherServerConfig(apiKey);
    } catch (e) {
      if (e instanceof ApiKeyError) {
        throw e;
      }
      throw new AgentError(`Failed to fetch servers: ${(e as Error).message}`);
    }
  },
};
