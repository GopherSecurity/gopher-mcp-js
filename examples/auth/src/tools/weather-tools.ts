/**
 * Weather Tools
 *
 * Example MCP tools demonstrating OAuth scope-based access control.
 * Mirrors the weather tools from the C++ auth example.
 */

import { McpHandler, ToolResult } from '../routes/mcp-handler';
import { OAuthAuthMiddleware } from '../middleware/oauth-auth';

/**
 * Check if a scope is present in a space-separated scope string
 *
 * @param scopes - Space-separated scope string
 * @param required - Required scope to check for
 * @returns true if the required scope is present
 */
export function hasScope(scopes: string, required: string): boolean {
  if (!scopes || !required) {
    return false;
  }
  return scopes.split(' ').includes(required);
}

/**
 * Weather conditions for simulation
 */
const CONDITIONS = ['Sunny', 'Cloudy', 'Rainy', 'Partly Cloudy', 'Windy', 'Stormy'];

/**
 * Get a deterministic but varying condition based on city name
 */
function getConditionForCity(city: string, offset: number = 0): string {
  const hash = city.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return CONDITIONS[(hash + offset) % CONDITIONS.length];
}

/**
 * Get a deterministic but varying temperature based on city name
 */
function getTempForCity(city: string, offset: number = 0): number {
  const hash = city.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  // Temperature between 10-35 Celsius
  return 10 + ((hash + offset * 7) % 26);
}

/**
 * Get simulated current weather for a city
 *
 * @param city - City name
 * @returns Weather data object
 */
export function getSimulatedWeather(city: string): {
  city: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
} {
  const hash = city.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

  return {
    city,
    temperature: getTempForCity(city),
    condition: getConditionForCity(city),
    humidity: 40 + (hash % 40), // 40-80%
    windSpeed: 5 + (hash % 25), // 5-30 km/h
  };
}

/**
 * Get simulated 5-day forecast for a city
 *
 * @param city - City name
 * @returns Array of daily forecasts
 */
export function getSimulatedForecast(city: string): Array<{
  day: string;
  high: number;
  low: number;
  condition: string;
}> {
  const days = ['Today', 'Tomorrow', 'Day 3', 'Day 4', 'Day 5'];

  return days.map((day, index) => ({
    day,
    high: getTempForCity(city, index) + 5,
    low: getTempForCity(city, index) - 5,
    condition: getConditionForCity(city, index),
  }));
}

/**
 * Get simulated weather alerts for a region
 *
 * @param region - Region name
 * @returns Array of weather alerts
 */
export function getSimulatedAlerts(region: string): Array<{
  type: string;
  severity: string;
  message: string;
}> {
  const hash = region.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

  // Return different alerts based on region
  if (hash % 3 === 0) {
    return [
      {
        type: 'Heat Warning',
        severity: 'moderate',
        message: `High temperatures expected in ${region}. Stay hydrated.`,
      },
    ];
  } else if (hash % 3 === 1) {
    return [
      {
        type: 'Storm Watch',
        severity: 'high',
        message: `Severe thunderstorms possible in ${region}. Seek shelter if needed.`,
      },
      {
        type: 'Wind Advisory',
        severity: 'low',
        message: `Strong winds expected in ${region}. Secure loose objects.`,
      },
    ];
  } else {
    return []; // No alerts
  }
}

/**
 * Create an access denied error result
 *
 * @param scope - Required scope that was missing
 * @returns ToolResult with error
 */
function accessDenied(scope: string): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          error: 'access_denied',
          message: `Access denied. Required scope: ${scope}`,
        }),
      },
    ],
    isError: true,
  };
}

/**
 * Register weather tools with the MCP handler
 *
 * @param mcp - MCP handler instance
 * @param authMiddleware - OAuth auth middleware instance (null if auth disabled)
 */
export function registerWeatherTools(
  mcp: McpHandler,
  authMiddleware: OAuthAuthMiddleware | null
): void {
  /**
   * get-weather - No authentication required
   * Returns current weather for a specified city.
   */
  mcp.registerTool(
    'get-weather',
    {
      description:
        'Get current weather for a city. No authentication required.',
      inputSchema: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: 'City name to get weather for',
          },
        },
        required: ['city'],
      },
    },
    (args) => {
      const city = String(args.city || 'Unknown');
      const weather = getSimulatedWeather(city);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(weather, null, 2),
          },
        ],
      };
    }
  );

  /**
   * get-forecast - Requires mcp:read scope
   * Returns 5-day weather forecast for a specified city.
   */
  mcp.registerTool(
    'get-forecast',
    {
      description:
        'Get 5-day weather forecast for a city. Requires mcp:read scope.',
      inputSchema: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: 'City name to get forecast for',
          },
        },
        required: ['city'],
      },
    },
    (args, req) => {
      // Check scope if auth is enabled
      if (authMiddleware && !authMiddleware.isAuthDisabled()) {
        const context = authMiddleware.getAuthContext();
        if (!hasScope(context.scopes, 'mcp:read')) {
          return accessDenied('mcp:read');
        }
      }

      const city = String(args.city || 'Unknown');
      const forecast = getSimulatedForecast(city);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ city, forecast }, null, 2),
          },
        ],
      };
    }
  );

  /**
   * get-weather-alerts - Requires mcp:admin scope
   * Returns weather alerts for a specified region.
   */
  mcp.registerTool(
    'get-weather-alerts',
    {
      description:
        'Get weather alerts for a region. Requires mcp:admin scope.',
      inputSchema: {
        type: 'object',
        properties: {
          region: {
            type: 'string',
            description: 'Region name to get alerts for',
          },
        },
        required: ['region'],
      },
    },
    (args, req) => {
      // Check scope if auth is enabled
      if (authMiddleware && !authMiddleware.isAuthDisabled()) {
        const context = authMiddleware.getAuthContext();
        if (!hasScope(context.scopes, 'mcp:admin')) {
          return accessDenied('mcp:admin');
        }
      }

      const region = String(args.region || 'Unknown');
      const alerts = getSimulatedAlerts(region);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ region, alerts }, null, 2),
          },
        ],
      };
    }
  );
}
