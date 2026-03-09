/**
 * Health check endpoint
 *
 * Provides a simple health check endpoint for monitoring
 * and load balancer health checks.
 */

import { Express, Request, Response } from 'express';

/**
 * Health check response structure
 */
export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  version?: string;
  uptime?: number;
}

/**
 * Register the health check endpoint
 *
 * @param app - Express application instance
 * @param version - Optional version string to include in response
 */
export function registerHealthEndpoint(app: Express, version?: string): void {
  const startTime = Date.now();

  app.get('/health', (_req: Request, res: Response) => {
    const response: HealthResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };

    if (version) {
      response.version = version;
    }

    response.uptime = Math.floor((Date.now() - startTime) / 1000);

    res.status(200).json(response);
  });
}
