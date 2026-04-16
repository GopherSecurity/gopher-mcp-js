/**
 * Weather Tools
 *
 * Example MCP tools registered on @modelcontextprotocol/sdk McpServer.
 * Scope checking is handled by the GopherAuth middleware's toolScopes.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GopherAuth } from '@gopher.security/gopher-mcp-js';

const CONDITIONS = ['Sunny', 'Cloudy', 'Rainy', 'Partly Cloudy', 'Windy', 'Stormy'];

function hash(s: string): number {
  return s.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

function getWeather(city: string) {
  const h = hash(city);
  return {
    city,
    temperature: 10 + (h % 26),
    condition: CONDITIONS[h % CONDITIONS.length],
    humidity: 40 + (h % 40),
    windSpeed: 5 + (h % 25),
  };
}

function getForecast(city: string) {
  return ['Today', 'Tomorrow', 'Day 3', 'Day 4', 'Day 5'].map((day, i) => ({
    day,
    high: 10 + ((hash(city) + i * 7) % 26) + 5,
    low: 10 + ((hash(city) + i * 7) % 26) - 5,
    condition: CONDITIONS[(hash(city) + i) % CONDITIONS.length],
  }));
}

function getAlerts(region: string) {
  const h = hash(region);
  if (h % 3 === 0)
    return [{ type: 'Heat Warning', severity: 'moderate', message: `High temperatures in ${region}.` }];
  if (h % 3 === 1)
    return [
      { type: 'Storm Watch', severity: 'high', message: `Thunderstorms possible in ${region}.` },
      { type: 'Wind Advisory', severity: 'low', message: `Strong winds in ${region}.` },
    ];
  return [];
}

export function registerWeatherTools(server: McpServer, _auth: GopherAuth): void {
  server.tool('get-weather', 'Get current weather for a city. No auth required.', {
    city: z.string().describe('City name'),
  }, async ({ city }) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(getWeather(city), null, 2) }],
  }));

  server.tool('get-forecast', 'Get 5-day forecast. Requires mcp:read scope.', {
    city: z.string().describe('City name'),
  }, async ({ city }) => ({
    content: [{ type: 'text' as const, text: JSON.stringify({ city, forecast: getForecast(city) }, null, 2) }],
  }));

  server.tool('get-weather-alerts', 'Get weather alerts. Requires mcp:admin scope.', {
    region: z.string().describe('Region name'),
  }, async ({ region }) => ({
    content: [{ type: 'text' as const, text: JSON.stringify({ region, alerts: getAlerts(region) }, null, 2) }],
  }));
}
