/**
 * koffi interface to the gopher-orch native library.
 */

import * as koffi from 'koffi';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Type aliases - koffi uses unknown for pointers at the TypeScript level
export type GopherOrchHandle = unknown;

/**
 * Error info structure matching C:
 * typedef struct {
 *     gopher_orch_error_t code;
 *     const char* message;
 *     const char* details;
 *     const char* file;
 *     int32_t line;
 * } gopher_orch_error_info_t;
 */
const GopherOrchErrorInfo = koffi.struct('GopherOrchErrorInfo', {
  code: 'int32_t',
  message: 'const char*',
  details: 'const char*',
  file: 'const char*',
  line: 'int32_t',
});

export interface GopherOrchErrorInfoData {
  code: number;
  message: string | null;
  details: string | null;
  file: string | null;
  line: number;
}

/**
 * Wrapper for the gopher-orch native library using koffi.
 */
export class GopherOrchLibrary {
  private static instance: GopherOrchLibrary | null = null;
  private lib: koffi.IKoffiLib | null = null;
  private available = false;
  private debug = false;

  // Function bindings
  private _agentCreateByJson:
    | ((
        provider: string,
        model: string,
        serverJson: string
      ) => GopherOrchHandle)
    | null = null;
  private _agentCreateByApiKey:
    | ((provider: string, model: string, apiKey: string) => GopherOrchHandle)
    | null = null;
  private _agentRun:
    | ((
        agent: GopherOrchHandle,
        query: string,
        timeoutMs: bigint
      ) => string | null)
    | null = null;
  private _agentAddRef: ((agent: GopherOrchHandle) => void) | null = null;
  private _agentRelease: ((agent: GopherOrchHandle) => void) | null = null;
  private _apiFetchServers: ((apiKey: string) => string | null) | null = null;
  private _lastError: (() => unknown) | null = null;
  private _clearError: (() => void) | null = null;
  private _free: ((ptr: unknown) => void) | null = null;

  private constructor() {
    this.loadLibrary();
  }

  /**
   * Get the library instance, loading it if necessary.
   */
  static getInstance(): GopherOrchLibrary | null {
    if (GopherOrchLibrary.instance === null) {
      GopherOrchLibrary.instance = new GopherOrchLibrary();
    }
    return GopherOrchLibrary.instance.available
      ? GopherOrchLibrary.instance
      : null;
  }

  /**
   * Check if the library is available.
   */
  static isAvailable(): boolean {
    const instance = GopherOrchLibrary.getInstance();
    return instance !== null && instance.available;
  }

  private loadLibrary(): void {
    this.debug = process.env['DEBUG'] !== undefined;

    const libraryName = this.getLibraryName();
    const searchPaths = this.getSearchPaths();

    // Try custom path from environment variable
    const envPath = process.env['GOPHER_ORCH_LIBRARY_PATH'];
    if (envPath && fs.existsSync(envPath)) {
      try {
        this.lib = koffi.load(envPath);
        this.setupFunctions();
        this.available = true;
        return;
      } catch (e) {
        if (this.debug) {
          console.error(
            `Failed to load from GOPHER_ORCH_LIBRARY_PATH: ${(e as Error).message}`
          );
        }
      }
    }

    // Try search paths
    for (const searchPath of searchPaths) {
      const libFile = path.join(searchPath, libraryName);
      if (fs.existsSync(libFile)) {
        try {
          this.lib = koffi.load(libFile);
          this.setupFunctions();
          this.available = true;
          return;
        } catch (e) {
          if (this.debug) {
            console.error(
              `Failed to load from ${searchPath}: ${(e as Error).message}`
            );
          }
        }
      }
    }

    // Try loading by name (system paths)
    const systemLibName =
      os.platform() === 'darwin' ? 'libgopher-orch.dylib' : 'libgopher-orch.so';
    try {
      this.lib = koffi.load(systemLibName);
      this.setupFunctions();
      this.available = true;
      return;
    } catch (e) {
      if (this.debug) {
        console.error(
          `Failed to load gopher-orch library: ${(e as Error).message}`
        );
        console.error('Searched paths:');
        for (const p of searchPaths) {
          console.error(`  - ${p}`);
        }
      }
    }

    this.available = false;
  }

  private setupFunctions(): void {
    if (this.lib === null) {
      return;
    }

    // Agent functions
    this._agentCreateByJson = this.lib.func(
      'gopher_orch_agent_create_by_json',
      'void*',
      ['const char*', 'const char*', 'const char*']
    );

    this._agentCreateByApiKey = this.lib.func(
      'gopher_orch_agent_create_by_api_key',
      'void*',
      ['const char*', 'const char*', 'const char*']
    );

    this._agentRun = this.lib.func('gopher_orch_agent_run', 'const char*', [
      'void*',
      'const char*',
      'int64_t',
    ]);

    this._agentAddRef = this.lib.func('gopher_orch_agent_add_ref', 'void', [
      'void*',
    ]);

    this._agentRelease = this.lib.func('gopher_orch_agent_release', 'void', [
      'void*',
    ]);

    // API functions
    this._apiFetchServers = this.lib.func(
      'gopher_orch_api_fetch_servers',
      'const char*',
      ['const char*']
    );

    // Error functions
    this._lastError = this.lib.func(
      'gopher_orch_last_error',
      koffi.pointer(GopherOrchErrorInfo),
      []
    );

    this._clearError = this.lib.func('gopher_orch_clear_error', 'void', []);

    this._free = this.lib.func('gopher_orch_free', 'void', ['void*']);
  }

  private getLibraryName(): string {
    switch (os.platform()) {
      case 'darwin':
        return 'libgopher-orch.dylib';
      case 'win32':
        return 'gopher-orch.dll';
      default:
        return 'libgopher-orch.so';
    }
  }

  private getSearchPaths(): string[] {
    // Get the directory containing this module
    const moduleDir = path.dirname(path.dirname(__dirname));

    const paths = [
      // Project root native/lib
      path.join(process.cwd(), 'native', 'lib'),
      // Relative to module location
      path.join(moduleDir, 'native', 'lib'),
      path.join(path.dirname(moduleDir), 'native', 'lib'),
    ];

    // System paths
    if (os.platform() === 'darwin') {
      paths.push('/usr/local/lib', '/opt/homebrew/lib');
    }
    paths.push('/usr/lib');

    return paths;
  }

  // Agent functions
  agentCreateByJson(
    provider: string,
    model: string,
    serverJson: string
  ): GopherOrchHandle | null {
    if (!this.available || this._agentCreateByJson === null) {
      return null;
    }
    return this._agentCreateByJson(provider, model, serverJson);
  }

  agentCreateByApiKey(
    provider: string,
    model: string,
    apiKey: string
  ): GopherOrchHandle | null {
    if (!this.available || this._agentCreateByApiKey === null) {
      return null;
    }
    return this._agentCreateByApiKey(provider, model, apiKey);
  }

  agentRun(
    agent: GopherOrchHandle,
    query: string,
    timeoutMs: number
  ): string | null {
    if (!this.available || this._agentRun === null) {
      return null;
    }
    return this._agentRun(agent, query, BigInt(timeoutMs));
  }

  agentAddRef(agent: GopherOrchHandle): void {
    if (this.available && this._agentAddRef !== null) {
      this._agentAddRef(agent);
    }
  }

  agentRelease(agent: GopherOrchHandle): void {
    if (this.available && this._agentRelease !== null) {
      this._agentRelease(agent);
    }
  }

  // API functions
  apiFetchServers(apiKey: string): string | null {
    if (!this.available || this._apiFetchServers === null) {
      return null;
    }
    return this._apiFetchServers(apiKey);
  }

  // Error functions
  lastError(): GopherOrchErrorInfoData | null {
    if (!this.available || this._lastError === null) {
      return null;
    }
    const errorPtr = this._lastError();
    if (errorPtr === null) {
      return null;
    }
    try {
      const decoded = koffi.decode(errorPtr, GopherOrchErrorInfo);
      return decoded as GopherOrchErrorInfoData;
    } catch {
      return null;
    }
  }

  getLastErrorMessage(): string | null {
    const errorInfo = this.lastError();
    if (errorInfo && errorInfo.message) {
      return errorInfo.message;
    }
    return null;
  }

  clearError(): void {
    if (this.available && this._clearError !== null) {
      this._clearError();
    }
  }

  free(ptr: unknown): void {
    if (this.available && this._free !== null) {
      this._free(ptr);
    }
  }
}
