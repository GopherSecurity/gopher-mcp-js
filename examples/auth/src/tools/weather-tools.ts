/**
 * Weather Tools
 *
 * Example MCP tools demonstrating OAuth scope-based access control.
 * Scope checking is now handled by the middleware toolScopes config,
 * so tool handlers just focus on business logic.
 */

import { McpHandler, ToolResult } from '../routes/mcp-handler';
import { GopherAuth } from '@gopher.security/gopher-mcp-js';

/**
 * Weather conditions for simulation
 */
const CONDITIONS = [
  'Sunny',
  'Cloudy',
  'Rainy',
  'Partly Cloudy',
  'Windy',
  'Stormy',
];

function getConditionForCity(city: string, offset: number = 0): string {
  const hash = city
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return CONDITIONS[(hash + offset) % CONDITIONS.length];
}

function getTempForCity(city: string, offset: number = 0): number {
  const hash = city
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return 10 + ((hash + offset * 7) % 26);
}

export function getSimulatedWeather(city: string) {
  const hash = city
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return {
    city,
    temperature: getTempForCity(city),
    condition: getConditionForCity(city),
    humidity: 40 + (hash % 40),
    windSpeed: 5 + (hash % 25),
  };
}

export function getSimulatedForecast(city: string) {
  const days = ['Today', 'Tomorrow', 'Day 3', 'Day 4', 'Day 5'];
  return days.map((day, index) => ({
    day,
    high: getTempForCity(city, index) + 5,
    low: getTempForCity(city, index) - 5,
    condition: getConditionForCity(city, index),
  }));
}

export function getSimulatedAlerts(region: string) {
  const hash = region
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  if (hash % 3 === 0) {
    return [{
      type: 'Heat Warning',
      severity: 'moderate',
      message: `High temperatures expected in ${region}. Stay hydrated.`,
    }];
  } else if (hash % 3 === 1) {
    return [
      { type: 'Storm Watch', severity: 'high', message: `Severe thunderstorms possible in ${region}.` },
      { type: 'Wind Advisory', severity: 'low', message: `Strong winds expected in ${region}.` },
    ];
  }
  return [];
}

/**
 * Register weather tools with the MCP handler
 *
 * Scope checking is handled by the GopherAuth middleware's toolScopes
 * config, so tools don't need to check scopes manually.
 */
export function registerWeatherTools(
  mcp: McpHandler,
  _auth: GopherAuth
): void {
  mcp.registerTool(
    'get-weather',
    {
      description: 'Get current weather for a city. No authentication required.',
      inputSchema: {
        type: 'object',
        properties: { city: { type: 'string', description: 'City name' } },
        required: ['city'],
      },
    },
    (args) => ({
      content: [{ type: 'text', text: JSON.stringify(getSimulatedWeather(String(args.city || 'Unknown')), null, 2) }],
    })
  );

  mcp.registerTool(
    'get-forecast',
    {
      description: 'Get 5-day weather forecast. Requires mcp:read scope.',
      inputSchema: {
        type: 'object',
        properties: { city: { type: 'string', description: 'City name' } },
        required: ['city'],
      },
    },
    (args) => {
      const city = String(args.city || 'Unknown');
      return {
        content: [{ type: 'text', text: JSON.stringify({ city, forecast: getSimulatedForecast(city) }, null, 2) }],
      };
    }
  );

  mcp.registerTool(
    'get-weather-alerts',
    {
      description: 'Get weather alerts for a region. Requires mcp:admin scope.',
      inputSchema: {
        type: 'object',
        properties: { region: { type: 'string', description: 'Region name' } },
        required: ['region'],
      },
    },
    (args) => {
      const region = String(args.region || 'Unknown');
      return {
        content: [{ type: 'text', text: JSON.stringify({ region, alerts: getSimulatedAlerts(region) }, null, 2) }],
      };
    }
  );
}
