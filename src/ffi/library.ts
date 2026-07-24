/**
 * koffi interface to the gopher-orch native library.
 */

import * as koffi from 'koffi';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { getOrCreateStruct } from './koffi-types';

// Opaque handle type for native pointers - uses branded type pattern
// to avoid 'unknown | null' redundancy issues with eslint
declare const OpaqueHandle: unique symbol;
export type GopherOrchHandle = { readonly [OpaqueHandle]: 'GopherOrchHandle' };

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
const GopherOrchErrorInfo = getOrCreateStruct('GopherOrchErrorInfo', {
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
  private _agentCreateByServerId:
    | ((
        provider: string,
        model: string,
        apiKey: string,
        serverId: string
      ) => GopherOrchHandle)
    | null = null;
  private _agentCreateByServerName:
    | ((
        provider: string,
        model: string,
        apiKey: string,
        serverName: string
      ) => GopherOrchHandle)
    | null = null;
  private _agentCreateByGatewayId:
    | ((
        provider: string,
        model: string,
        apiKey: string,
        gatewayId: string
      ) => GopherOrchHandle)
    | null = null;
  private _agentCreateByGatewayName:
    | ((
        provider: string,
        model: string,
        apiKey: string,
        gatewayName: string
      ) => GopherOrchHandle)
    | null = null;
  private _agentCreateByUrl:
    | ((provider: string, model: string, url: string) => GopherOrchHandle)
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
  private _setLogLevel: ((level: number) => void) | null = null;

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

    this._agentCreateByServerId = this.lib.func(
      'gopher_orch_agent_create_by_server_id',
      'void*',
      ['const char*', 'const char*', 'const char*', 'const char*']
    );

    this._agentCreateByServerName = this.lib.func(
      'gopher_orch_agent_create_by_server_name',
      'void*',
      ['const char*', 'const char*', 'const char*', 'const char*']
    );

    this._agentCreateByGatewayId = this.lib.func(
      'gopher_orch_agent_create_by_gateway_id',
      'void*',
      ['const char*', 'const char*', 'const char*', 'const char*']
    );

    this._agentCreateByGatewayName = this.lib.func(
      'gopher_orch_agent_create_by_gateway_name',
      'void*',
      ['const char*', 'const char*', 'const char*', 'const char*']
    );

    this._agentCreateByUrl = this.lib.func(
      'gopher_orch_agent_create_by_url',
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

    // Logging functions
    this._setLogLevel = this.lib.func('gopher_orch_set_log_level', 'void', [
      'int',
    ]);

    // Set default log level to Warning (3) for production use
    // This suppresses debug and info logs that appear during normal operation
    this._setLogLevel(3);
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
    const paths: string[] = [];

    // 1. Try platform-specific optional dependency package (npm distribution)
    const platformPackagePath = this.getPlatformPackagePath();
    if (platformPackagePath) {
      paths.push(platformPackagePath);
    }

    // 2. Get the directory containing this module for development fallbacks
    const moduleDir = path.dirname(path.dirname(__dirname));

    // Development paths (native/lib in various locations)
    paths.push(
      // Project root native/lib
      path.join(process.cwd(), 'native', 'lib'),
      // Relative to module location
      path.join(moduleDir, 'native', 'lib'),
      path.join(path.dirname(moduleDir), 'native', 'lib')
    );

    // 3. System paths as last resort
    if (os.platform() === 'darwin') {
      paths.push('/usr/local/lib', '/opt/homebrew/lib');
    }
    paths.push('/usr/lib');

    return paths;
  }

  /**
   * Get the path to the platform-specific optional dependency package.
   * These packages are published as gopher-orch-{platform}-{arch}
   * and contain the native library for that specific platform.
   */
  private getPlatformPackagePath(): string | null {
    const platform = os.platform(); // 'darwin', 'linux', 'win32'
    const arch = os.arch(); // 'arm64', 'x64'

    // Map Node.js platform names to package names
    const platformMap: Record<string, string> = {
      darwin: 'darwin',
      linux: 'linux',
      win32: 'win32',
    };

    const platformName = platformMap[platform];
    if (!platformName) {
      if (this.debug) {
        console.error(`Unsupported platform: ${platform}`);
      }
      return null;
    }

    // Construct the package name: @gopher.security/gopher-orch-darwin-arm64, etc.
    const packageName = `@gopher.security/gopher-orch-${platformName}-${arch}`;

    try {
      // Try to resolve the package.json of the platform-specific package
      const packageJsonPath = require.resolve(`${packageName}/package.json`);
      const packageDir = path.dirname(packageJsonPath);
      const libPath = path.join(packageDir, 'lib');

      if (fs.existsSync(libPath)) {
        if (this.debug) {
          console.log(`Found platform package at: ${libPath}`);
        }
        return libPath;
      }
    } catch {
      // Package not installed - this is expected on platforms where
      // the optional dependency wasn't installed
      if (this.debug) {
        console.log(`Platform package ${packageName} not found`);
      }
    }

    return null;
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

  agentCreateByServerId(
    provider: string,
    model: string,
    apiKey: string,
    serverId: string
  ): GopherOrchHandle | null {
    if (!this.available || this._agentCreateByServerId === null) {
      return null;
    }
    return this._agentCreateByServerId(provider, model, apiKey, serverId);
  }

  agentCreateByServerName(
    provider: string,
    model: string,
    apiKey: string,
    serverName: string
  ): GopherOrchHandle | null {
    if (!this.available || this._agentCreateByServerName === null) {
      return null;
    }
    return this._agentCreateByServerName(provider, model, apiKey, serverName);
  }

  agentCreateByGatewayId(
    provider: string,
    model: string,
    apiKey: string,
    gatewayId: string
  ): GopherOrchHandle | null {
    if (!this.available || this._agentCreateByGatewayId === null) {
      return null;
    }
    return this._agentCreateByGatewayId(provider, model, apiKey, gatewayId);
  }

  agentCreateByGatewayName(
    provider: string,
    model: string,
    apiKey: string,
    gatewayName: string
  ): GopherOrchHandle | null {
    if (!this.available || this._agentCreateByGatewayName === null) {
      return null;
    }
    return this._agentCreateByGatewayName(provider, model, apiKey, gatewayName);
  }

  agentCreateByUrl(
    provider: string,
    model: string,
    url: string
  ): GopherOrchHandle | null {
    if (!this.available || this._agentCreateByUrl === null) {
      return null;
    }
    return this._agentCreateByUrl(provider, model, url);
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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

  /**
   * Set the global log level for the native library.
   * Log levels:
   *   0 = Debug (most verbose)
   *   1 = Info
   *   2 = Notice
   *   3 = Warning (default for production)
   *   4 = Error
   *   5 = Critical
   *   6 = Alert
   *   7 = Emergency
   *   8 = Off (no logging)
   *
   * @param level - Log level (0-8)
   */
  setLogLevel(level: number): void {
    if (this.available && this._setLogLevel !== null) {
      this._setLogLevel(level);
    }
  }
}
