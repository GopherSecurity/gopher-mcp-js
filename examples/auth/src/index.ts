/**
 * JS Auth MCP Server - Entry Point
 *
 * OAuth-protected MCP server example using gopher-auth FFI bindings.
 * Demonstrates JWT token validation with Keycloak and scope-based
 * access control for MCP tools.
 */

import express from 'express';
import path from 'path';
import {
  initAuthLibrary,
  shutdownAuthLibrary,
  getAuthLibraryVersion,
  AuthClient,
} from '@gopher.security/gopher-mcp-js';
import { loadConfigFromFile, AuthServerConfig } from './config';
import { registerHealthEndpoint } from './routes/health';
import { registerOAuthEndpoints } from './routes/oauth-endpoints';
import { registerMcpHandler } from './routes/mcp-handler';
import { OAuthAuthMiddleware } from './middleware/oauth-auth';
import { registerWeatherTools } from './tools/weather-tools';

/**
 * Print startup banner
 */
function printBanner(): void {
  console.log('');
  console.log('========================================');
  console.log('    JS Auth MCP Server');
  console.log('    OAuth-Protected MCP Example');
  console.log('========================================');
  console.log('');
}

/**
 * Print endpoint information
 */
function printEndpoints(config: AuthServerConfig): void {
  const baseUrl = config.serverUrl;

  console.log('Endpoints:');
  console.log(`  Health:       GET  ${baseUrl}/health`);
  console.log(
    `  OAuth Meta:   GET  ${baseUrl}/.well-known/oauth-protected-resource`
  );
  console.log(
    `  Auth Server:  GET  ${baseUrl}/.well-known/oauth-authorization-server`
  );
  console.log(
    `  OIDC Config:  GET  ${baseUrl}/.well-known/openid-configuration`
  );
  console.log(`  OAuth Auth:   GET  ${baseUrl}/oauth/authorize`);
  console.log(`  MCP:          POST ${baseUrl}/mcp`);
  console.log(`  RPC:          POST ${baseUrl}/rpc`);
  console.log('');

  if (config.authDisabled) {
    console.log('Authentication: DISABLED');
  } else {
    console.log('Authentication: ENABLED');
    console.log(`  JWKS URI:     ${config.jwksUri}`);
    console.log(`  Issuer:       ${config.issuer}`);
  }
  console.log('');
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  printBanner();

  // Determine config path
  const configPath =
    process.argv[2] || path.join(__dirname, '..', 'server.config');

  // Load configuration
  let config: AuthServerConfig;
  try {
    console.log(`Loading configuration from: ${configPath}`);
    config = loadConfigFromFile(configPath);
    console.log('Configuration loaded successfully');
    console.log('');
  } catch (error) {
    console.error(`Failed to load configuration: ${error}`);
    process.exit(1);
  }

  // Initialize auth library if auth is enabled
  let authClient: AuthClient | null = null;

  if (!config.authDisabled) {
    try {
      console.log('Initializing gopher-auth library...');
      initAuthLibrary();
      const version = getAuthLibraryVersion();
      console.log(`  Library version: ${version}`);

      // Create auth client
      authClient = new AuthClient(config.jwksUri!, config.issuer!);

      // Set client options
      if (config.jwksCacheDuration > 0) {
        authClient.setOption(
          'cache_duration',
          String(config.jwksCacheDuration)
        );
      }
      if (config.jwksAutoRefresh) {
        authClient.setOption('auto_refresh', 'true');
      }
      if (config.requestTimeout > 0) {
        authClient.setOption('request_timeout', String(config.requestTimeout));
      }

      console.log('  Auth client created successfully');
      console.log('');
    } catch (error) {
      console.error(`Failed to initialize auth library: ${error}`);
      process.exit(1);
    }
  } else {
    console.log(
      'Authentication disabled - skipping auth library initialization'
    );
    console.log('');
  }

  // Create Express app
  const app = express();
  app.use(express.json());

  // Create auth middleware
  const authMiddleware = new OAuthAuthMiddleware(authClient, config);

  // Register health endpoint (no auth required)
  const serverVersion = config.authDisabled ? '1.0.0' : getAuthLibraryVersion();
  registerHealthEndpoint(app, serverVersion);

  // Register OAuth discovery endpoints (no auth required)
  registerOAuthEndpoints(app, config);

  // Apply auth middleware to protected routes
  app.use(authMiddleware.middleware);

  // Register MCP handler
  const mcpHandler = registerMcpHandler(app);

  // Register weather tools
  registerWeatherTools(mcpHandler, authMiddleware);

  // Start server
  const server = app.listen(config.port, config.host, () => {
    console.log(`Server started on ${config.host}:${config.port}`);
    console.log('');
    printEndpoints(config);
    console.log('Press Ctrl+C to shutdown');
    console.log('');
  });

  // Graceful shutdown handler
  const shutdown = async (): Promise<void> => {
    console.log('');
    console.log('Shutting down...');

    // Close HTTP server
    server.close(() => {
      console.log('  HTTP server closed');
    });

    // Cleanup auth resources
    if (authClient) {
      try {
        authClient.destroy();
        console.log('  Auth client destroyed');
      } catch (error) {
        console.error(`  Error destroying auth client: ${error}`);
      }
    }

    if (!config.authDisabled) {
      try {
        shutdownAuthLibrary();
        console.log('  Auth library shutdown complete');
      } catch (error) {
        console.error(`  Error shutting down auth library: ${error}`);
      }
    }

    console.log('Goodbye!');
    process.exit(0);
  };

  // Register signal handlers
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Run main
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
