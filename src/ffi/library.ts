/**
 * koffi interface to the gopher-orch native library.
 */

import type * as Koffi from 'koffi';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { assertSupportedNodeVersion } from '../runtime';

import { getOrCreateStruct } from './koffi-types';
assertSupportedNodeVersion();
const koffi: typeof Koffi = require('koffi');

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

getOrCreateStruct('GopherOrchHeader', {
  name: 'const char*',
  value: 'const char*',
});

const GopherOrchAgentOptions = getOrCreateStruct('GopherOrchAgentOptions', {
  access_token: 'const char*',
  headers: 'GopherOrchHeader*',
  header_count: 'size_t',
});

export interface GopherOrchErrorInfoData {
  code: number;
  message: string | null;
  details: string | null;
  file: string | null;
  line: number;
}

export interface GopherOrchAgentRuntimeOptions {
  accessToken?: string;
  headers?: Record<string, string>;
}

interface GopherOrchHeaderData {
  name: string;
  value: string;
}

interface GopherOrchAgentOptionsData {
  access_token: string | null;
  headers: GopherOrchHeaderData[] | null;
  header_count: number;
}

type AgentCreateByJsonFn = (
  provider: string,
  model: string,
  serverJson: string
) => GopherOrchHandle;

type AgentCreateByApiKeyFn = (
  provider: string,
  model: string,
  apiKey: string
) => GopherOrchHandle;

type AgentCreateByScopedNameFn = (
  provider: string,
  model: string,
  apiKey: string,
  name: string
) => GopherOrchHandle;

type AgentCreateByUrlFn = (
  provider: string,
  model: string,
  url: string
) => GopherOrchHandle;

type AgentCreateByJsonWithOptionsFn = (
  provider: string,
  model: string,
  serverJson: string,
  options: GopherOrchAgentOptionsData | null
) => GopherOrchHandle;

type AgentCreateByApiKeyWithOptionsFn = (
  provider: string,
  model: string,
  apiKey: string,
  options: GopherOrchAgentOptionsData | null
) => GopherOrchHandle;

type AgentCreateByScopedNameWithOptionsFn = (
  provider: string,
  model: string,
  apiKey: string,
  name: string,
  options: GopherOrchAgentOptionsData | null
) => GopherOrchHandle;

type AgentCreateByUrlWithOptionsFn = (
  provider: string,
  model: string,
  url: string,
  options: GopherOrchAgentOptionsData | null
) => GopherOrchHandle;

/**
 * Wrapper for the gopher-orch native library using koffi.
 */
export class GopherOrchLibrary {
  private static instance: GopherOrchLibrary | null = null;
  private lib: Koffi.IKoffiLib | null = null;
  private available = false;
  private debug = false;
  private loadErrors: string[] = [];

  // Function bindings
  private _agentCreateByJson: AgentCreateByJsonFn | null = null;
  private _agentCreateByJsonWithOptions: AgentCreateByJsonWithOptionsFn | null =
    null;
  private _agentCreateByApiKey: AgentCreateByApiKeyFn | null = null;
  private _agentCreateByApiKeyWithOptions: AgentCreateByApiKeyWithOptionsFn | null =
    null;
  private _agentCreateByServerId: AgentCreateByScopedNameFn | null = null;
  private _agentCreateByServerIdWithOptions: AgentCreateByScopedNameWithOptionsFn | null =
    null;
  private _agentCreateByServerName: AgentCreateByScopedNameFn | null = null;
  private _agentCreateByServerNameWithOptions: AgentCreateByScopedNameWithOptionsFn | null =
    null;
  private _agentCreateByGatewayId: AgentCreateByScopedNameFn | null = null;
  private _agentCreateByGatewayIdWithOptions: AgentCreateByScopedNameWithOptionsFn | null =
    null;
  private _agentCreateByGatewayName: AgentCreateByScopedNameFn | null = null;
  private _agentCreateByGatewayNameWithOptions: AgentCreateByScopedNameWithOptionsFn | null =
    null;
  private _agentCreateByUrl: AgentCreateByUrlFn | null = null;
  private _agentCreateByUrlWithOptions: AgentCreateByUrlWithOptionsFn | null =
    null;
  private _agentRun:
    | ((agent: GopherOrchHandle, query: string, timeoutMs: bigint) => unknown)
    | null = null;
  private _agentAddRef: ((agent: GopherOrchHandle) => void) | null = null;
  private _agentRelease: ((agent: GopherOrchHandle) => void) | null = null;
  private _apiFetchServers: ((apiKey: string) => unknown) | null = null;
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

  static getLoadErrorMessage(): string {
    const instance = GopherOrchLibrary.instance;
    if (instance === null || instance.loadErrors.length === 0) {
      return 'Native library not loaded.';
    }
    return instance.loadErrors.join('\n');
  }

  private loadLibrary(): void {
    this.debug = process.env['DEBUG'] !== undefined;
    this.loadErrors = [];

    const libraryName = this.getLibraryName();
    const searchPaths = this.getSearchPaths();

    // Try custom path from environment variable. It may be either the library
    // file itself or a directory containing the platform library.
    const envPath = process.env['GOPHER_ORCH_LIBRARY_PATH'];
    const envLibFile = envPath
      ? this.resolveLibraryPath(envPath, libraryName)
      : null;
    if (envLibFile) {
      try {
        this.preloadSiblingLibraries(path.dirname(envLibFile));
        this.lib = loadNativeLibrary(envLibFile);
        this.setupFunctions();
        this.available = true;
        return;
      } catch (e) {
        this.recordLoadError(
          `Failed to load GOPHER_ORCH_LIBRARY_PATH ${envLibFile}: ${(e as Error).message}`
        );
        if (this.debug) {
          console.error(
            `Failed to load from GOPHER_ORCH_LIBRARY_PATH: ${(e as Error).message}`
          );
        }
      }
    } else if (envPath) {
      this.recordLoadError(
        `GOPHER_ORCH_LIBRARY_PATH does not contain ${libraryName}: ${envPath}`
      );
    }

    // Try search paths
    for (const searchPath of searchPaths) {
      const libFile = this.resolveLibraryPath(searchPath, libraryName);
      if (libFile) {
        try {
          this.preloadSiblingLibraries(searchPath);
          this.lib = loadNativeLibrary(libFile);
          this.setupFunctions();
          this.available = true;
          return;
        } catch (e) {
          this.recordLoadError(
            `Failed to load ${libFile}: ${(e as Error).message}`
          );
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
      this.lib = loadNativeLibrary(systemLibName);
      this.setupFunctions();
      this.available = true;
      return;
    } catch (e) {
      this.recordLoadError(
        `Failed to load ${systemLibName} from system library paths: ${(e as Error).message}`
      );
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

  private resolveLibraryPath(
    candidate: string,
    libraryName: string
  ): string | null {
    if (!fs.existsSync(candidate)) {
      return null;
    }

    const stat = fs.statSync(candidate);
    if (stat.isFile()) {
      return candidate;
    }
    if (!stat.isDirectory()) {
      return null;
    }

    const direct = path.join(candidate, libraryName);
    if (fs.existsSync(direct)) {
      return direct;
    }

    const match = fs
      .readdirSync(candidate)
      .filter(
        (file) => file === libraryName || file.startsWith(`${libraryName}.`)
      )
      .sort()[0];
    return match ? path.join(candidate, match) : null;
  }

  private recordLoadError(message: string): void {
    this.loadErrors.push(message);
  }

  private preloadSiblingLibraries(searchPath: string): void {
    if (os.platform() !== 'linux' || !fs.existsSync(searchPath)) {
      return;
    }

    const files = fs
      .readdirSync(searchPath)
      .filter((file) => file.startsWith('libgopher-mcp'))
      .filter((file) => file.endsWith('.so'))
      .sort((a, b) => {
        const rank = (file: string): number => {
          if (file.startsWith('libgopher-mcp-logging')) return 0;
          if (file.startsWith('libgopher-mcp-event')) return 1;
          if (file.startsWith('libgopher-mcp')) return 2;
          return 3;
        };
        return rank(a) - rank(b) || a.localeCompare(b);
      });

    for (const file of files) {
      const libFile = path.join(searchPath, file);
      try {
        loadNativeLibrary(libFile);
      } catch (e) {
        this.recordLoadError(
          `Failed to preload ${libFile}: ${(e as Error).message}`
        );
      }
    }
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
    ) as AgentCreateByJsonFn;

    this._agentCreateByJsonWithOptions = this.bindOptional(
      'gopher_orch_agent_create_by_json_with_options',
      'void*',
      [
        'const char*',
        'const char*',
        'const char*',
        koffi.pointer(GopherOrchAgentOptions),
      ]
    ) as AgentCreateByJsonWithOptionsFn | null;

    this._agentCreateByApiKey = this.lib.func(
      'gopher_orch_agent_create_by_api_key',
      'void*',
      ['const char*', 'const char*', 'const char*']
    ) as AgentCreateByApiKeyFn;

    this._agentCreateByApiKeyWithOptions = this.bindOptional(
      'gopher_orch_agent_create_by_api_key_with_options',
      'void*',
      [
        'const char*',
        'const char*',
        'const char*',
        koffi.pointer(GopherOrchAgentOptions),
      ]
    ) as AgentCreateByApiKeyWithOptionsFn | null;

    this._agentCreateByServerId = this.lib.func(
      'gopher_orch_agent_create_by_server_id',
      'void*',
      ['const char*', 'const char*', 'const char*', 'const char*']
    ) as AgentCreateByScopedNameFn;

    this._agentCreateByServerIdWithOptions = this.bindOptional(
      'gopher_orch_agent_create_by_server_id_with_options',
      'void*',
      [
        'const char*',
        'const char*',
        'const char*',
        'const char*',
        koffi.pointer(GopherOrchAgentOptions),
      ]
    ) as AgentCreateByScopedNameWithOptionsFn | null;

    this._agentCreateByServerName = this.lib.func(
      'gopher_orch_agent_create_by_server_name',
      'void*',
      ['const char*', 'const char*', 'const char*', 'const char*']
    ) as AgentCreateByScopedNameFn;

    this._agentCreateByServerNameWithOptions = this.bindOptional(
      'gopher_orch_agent_create_by_server_name_with_options',
      'void*',
      [
        'const char*',
        'const char*',
        'const char*',
        'const char*',
        koffi.pointer(GopherOrchAgentOptions),
      ]
    ) as AgentCreateByScopedNameWithOptionsFn | null;

    this._agentCreateByGatewayId = this.lib.func(
      'gopher_orch_agent_create_by_gateway_id',
      'void*',
      ['const char*', 'const char*', 'const char*', 'const char*']
    ) as AgentCreateByScopedNameFn;

    this._agentCreateByGatewayIdWithOptions = this.bindOptional(
      'gopher_orch_agent_create_by_gateway_id_with_options',
      'void*',
      [
        'const char*',
        'const char*',
        'const char*',
        'const char*',
        koffi.pointer(GopherOrchAgentOptions),
      ]
    ) as AgentCreateByScopedNameWithOptionsFn | null;

    this._agentCreateByGatewayName = this.lib.func(
      'gopher_orch_agent_create_by_gateway_name',
      'void*',
      ['const char*', 'const char*', 'const char*', 'const char*']
    ) as AgentCreateByScopedNameFn;

    this._agentCreateByGatewayNameWithOptions = this.bindOptional(
      'gopher_orch_agent_create_by_gateway_name_with_options',
      'void*',
      [
        'const char*',
        'const char*',
        'const char*',
        'const char*',
        koffi.pointer(GopherOrchAgentOptions),
      ]
    ) as AgentCreateByScopedNameWithOptionsFn | null;

    this._agentCreateByUrl = this.lib.func(
      'gopher_orch_agent_create_by_url',
      'void*',
      ['const char*', 'const char*', 'const char*']
    ) as AgentCreateByUrlFn;

    this._agentCreateByUrlWithOptions = this.bindOptional(
      'gopher_orch_agent_create_by_url_with_options',
      'void*',
      [
        'const char*',
        'const char*',
        'const char*',
        koffi.pointer(GopherOrchAgentOptions),
      ]
    ) as AgentCreateByUrlWithOptionsFn | null;

    this._agentRun = this.lib.func('gopher_orch_agent_run', 'void*', [
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
      'void*',
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

  private bindOptional(
    name: string,
    result: string | ReturnType<typeof koffi.pointer>,
    args: Array<string | ReturnType<typeof koffi.pointer>>
  ): ReturnType<Koffi.IKoffiLib['func']> | null {
    if (this.lib === null) {
      return null;
    }

    try {
      return this.lib.func(name, result, args);
    } catch (e) {
      if (this.debug) {
        console.error(
          `Optional gopher-orch symbol ${name} is unavailable: ${(e as Error).message}`
        );
      }
      return null;
    }
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
    const platformNativeDir = this.getPlatformNativeDirName();

    // Development paths. Prefer platform-specific output so cross-built
    // artifacts can coexist without changing the host runtime library.
    paths.push(
      path.join(process.cwd(), 'native', platformNativeDir, 'lib'),
      // Project root active native output
      path.join(process.cwd(), 'native', 'current', 'lib'),
      // Project root compatibility output
      path.join(process.cwd(), 'native', 'lib'),
      // Relative to module location
      path.join(moduleDir, 'native', platformNativeDir, 'lib'),
      path.join(moduleDir, 'native', 'current', 'lib'),
      path.join(moduleDir, 'native', 'lib'),
      path.join(path.dirname(moduleDir), 'native', platformNativeDir, 'lib'),
      path.join(path.dirname(moduleDir), 'native', 'current', 'lib'),
      path.join(path.dirname(moduleDir), 'native', 'lib')
    );

    // 3. System paths as last resort
    if (os.platform() === 'darwin') {
      paths.push('/usr/local/lib', '/opt/homebrew/lib');
    }
    paths.push('/usr/lib');

    return paths;
  }

  private getPlatformNativeDirName(): string {
    switch (`${os.platform()}-${os.arch()}`) {
      case 'darwin-arm64':
        return 'darwin-arm64';
      case 'darwin-x64':
        return 'darwin-x64';
      case 'linux-x64':
        return 'linux-x64';
      default:
        return `${os.platform()}-${os.arch()}`;
    }
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
    serverJson: string,
    options?: GopherOrchAgentRuntimeOptions
  ): GopherOrchHandle | null {
    if (!this.available || this._agentCreateByJson === null) {
      return null;
    }
    const ffiOptions = buildAgentOptions(options);
    if (ffiOptions !== null) {
      if (this._agentCreateByJsonWithOptions === null) {
        throw new Error(missingOptionsSymbolMessage());
      }
      return this._agentCreateByJsonWithOptions(
        provider,
        model,
        serverJson,
        ffiOptions
      );
    }
    return this._agentCreateByJson(provider, model, serverJson);
  }

  agentCreateByApiKey(
    provider: string,
    model: string,
    apiKey: string,
    options?: GopherOrchAgentRuntimeOptions
  ): GopherOrchHandle | null {
    if (!this.available || this._agentCreateByApiKey === null) {
      return null;
    }
    const ffiOptions = buildAgentOptions(options);
    if (ffiOptions !== null) {
      if (this._agentCreateByApiKeyWithOptions === null) {
        throw new Error(missingOptionsSymbolMessage());
      }
      return this._agentCreateByApiKeyWithOptions(
        provider,
        model,
        apiKey,
        ffiOptions
      );
    }
    return this._agentCreateByApiKey(provider, model, apiKey);
  }

  agentCreateByServerId(
    provider: string,
    model: string,
    apiKey: string,
    serverId: string,
    options?: GopherOrchAgentRuntimeOptions
  ): GopherOrchHandle | null {
    if (!this.available || this._agentCreateByServerId === null) {
      return null;
    }
    const ffiOptions = buildAgentOptions(options);
    if (ffiOptions !== null) {
      if (this._agentCreateByServerIdWithOptions === null) {
        throw new Error(missingOptionsSymbolMessage());
      }
      return this._agentCreateByServerIdWithOptions(
        provider,
        model,
        apiKey,
        serverId,
        ffiOptions
      );
    }
    return this._agentCreateByServerId(provider, model, apiKey, serverId);
  }

  agentCreateByServerName(
    provider: string,
    model: string,
    apiKey: string,
    serverName: string,
    options?: GopherOrchAgentRuntimeOptions
  ): GopherOrchHandle | null {
    if (!this.available || this._agentCreateByServerName === null) {
      return null;
    }
    const ffiOptions = buildAgentOptions(options);
    if (ffiOptions !== null) {
      if (this._agentCreateByServerNameWithOptions === null) {
        throw new Error(missingOptionsSymbolMessage());
      }
      return this._agentCreateByServerNameWithOptions(
        provider,
        model,
        apiKey,
        serverName,
        ffiOptions
      );
    }
    return this._agentCreateByServerName(provider, model, apiKey, serverName);
  }

  agentCreateByGatewayId(
    provider: string,
    model: string,
    apiKey: string,
    gatewayId: string,
    options?: GopherOrchAgentRuntimeOptions
  ): GopherOrchHandle | null {
    if (!this.available || this._agentCreateByGatewayId === null) {
      return null;
    }
    const ffiOptions = buildAgentOptions(options);
    if (ffiOptions !== null) {
      if (this._agentCreateByGatewayIdWithOptions === null) {
        throw new Error(missingOptionsSymbolMessage());
      }
      return this._agentCreateByGatewayIdWithOptions(
        provider,
        model,
        apiKey,
        gatewayId,
        ffiOptions
      );
    }
    return this._agentCreateByGatewayId(provider, model, apiKey, gatewayId);
  }

  agentCreateByGatewayName(
    provider: string,
    model: string,
    apiKey: string,
    gatewayName: string,
    options?: GopherOrchAgentRuntimeOptions
  ): GopherOrchHandle | null {
    if (!this.available || this._agentCreateByGatewayName === null) {
      return null;
    }
    const ffiOptions = buildAgentOptions(options);
    if (ffiOptions !== null) {
      if (this._agentCreateByGatewayNameWithOptions === null) {
        throw new Error(missingOptionsSymbolMessage());
      }
      return this._agentCreateByGatewayNameWithOptions(
        provider,
        model,
        apiKey,
        gatewayName,
        ffiOptions
      );
    }
    return this._agentCreateByGatewayName(provider, model, apiKey, gatewayName);
  }

  agentCreateByUrl(
    provider: string,
    model: string,
    url: string,
    options?: GopherOrchAgentRuntimeOptions
  ): GopherOrchHandle | null {
    if (!this.available || this._agentCreateByUrl === null) {
      return null;
    }
    const ffiOptions = buildAgentOptions(options);
    if (ffiOptions !== null) {
      if (this._agentCreateByUrlWithOptions === null) {
        throw new Error(missingOptionsSymbolMessage());
      }
      return this._agentCreateByUrlWithOptions(
        provider,
        model,
        url,
        ffiOptions
      );
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
    return this.decodeOwnedCString(
      this._agentRun(agent, query, BigInt(timeoutMs))
    );
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
    return this.decodeOwnedCString(this._apiFetchServers(apiKey));
  }

  private decodeOwnedCString(ptr: unknown): string | null {
    if (ptr === null) {
      return null;
    }
    try {
      return koffi.decode(ptr, 'char *') as string | null;
    } finally {
      if (this._free !== null) {
        this._free(ptr);
      }
    }
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

function loadNativeLibrary(file: string): Koffi.IKoffiLib {
  return os.platform() === 'linux'
    ? koffi.load(file, { deep: true })
    : koffi.load(file);
}

function buildAgentOptions(
  options?: GopherOrchAgentRuntimeOptions
): GopherOrchAgentOptionsData | null {
  if (options === undefined) {
    return null;
  }

  const accessToken = options.accessToken;
  if (accessToken !== undefined && typeof accessToken !== 'string') {
    throw new TypeError('Agent runtime option accessToken must be a string');
  }
  const normalizedAccessToken =
    accessToken !== undefined && accessToken.length > 0
      ? accessToken
      : undefined;

  const headers = options.headers;
  const headerEntries: GopherOrchHeaderData[] = [];
  if (headers !== undefined) {
    if (
      headers === null ||
      typeof headers !== 'object' ||
      Array.isArray(headers)
    ) {
      throw new TypeError(
        'Agent runtime option headers must be a string record'
      );
    }

    for (const [name, value] of Object.entries(headers)) {
      if (name.length === 0) {
        throw new TypeError(
          'Agent runtime option header names must be non-empty'
        );
      }
      if (typeof value !== 'string') {
        throw new TypeError(
          `Agent runtime option header "${name}" value must be a string`
        );
      }
      headerEntries.push({ name, value });
    }
  }

  if (normalizedAccessToken === undefined && headerEntries.length === 0) {
    return null;
  }

  return {
    access_token: normalizedAccessToken ?? null,
    headers: headerEntries.length > 0 ? headerEntries : null,
    header_count: headerEntries.length,
  };
}

function missingOptionsSymbolMessage(): string {
  return (
    'The loaded gopher-orch native library does not expose agent runtime ' +
    'options. Rebuild or update gopher-orch before passing accessToken or ' +
    'headers.'
  );
}
