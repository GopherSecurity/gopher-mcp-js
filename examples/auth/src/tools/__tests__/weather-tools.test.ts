import {
  hasScope,
  getSimulatedWeather,
  getSimulatedForecast,
  getSimulatedAlerts,
  registerWeatherTools,
} from '../weather-tools';
import { McpHandler } from '../../routes/mcp-handler';
import { OAuthAuthMiddleware } from '../../middleware/oauth-auth';
import { AuthenticatedRequest } from '../../middleware/oauth-auth';
import { createDefaultConfig } from '../../config';

describe('hasScope', () => {
  it('should return true when scope is present', () => {
    expect(hasScope('openid profile mcp:read', 'mcp:read')).toBe(true);
  });

  it('should return false when scope is not present', () => {
    expect(hasScope('openid profile', 'mcp:read')).toBe(false);
  });

  it('should return false for empty scopes', () => {
    expect(hasScope('', 'mcp:read')).toBe(false);
  });

  it('should return false for null or undefined scopes', () => {
    expect(hasScope(null as unknown as string, 'mcp:read')).toBe(false);
    expect(hasScope(undefined as unknown as string, 'mcp:read')).toBe(false);
  });

  it('should return false for empty required scope', () => {
    expect(hasScope('openid profile', '')).toBe(false);
  });

  it('should not match partial scope names', () => {
    expect(hasScope('mcp:readonly', 'mcp:read')).toBe(false);
  });

  it('should match exact scope names', () => {
    expect(hasScope('mcp:read mcp:write', 'mcp:write')).toBe(true);
  });
});

describe('getSimulatedWeather', () => {
  it('should return weather data for a city', () => {
    const weather = getSimulatedWeather('London');

    expect(weather.city).toBe('London');
    expect(weather.temperature).toBeGreaterThanOrEqual(10);
    expect(weather.temperature).toBeLessThanOrEqual(35);
    expect(weather.condition).toBeDefined();
    expect(weather.humidity).toBeGreaterThanOrEqual(40);
    expect(weather.humidity).toBeLessThanOrEqual(80);
    expect(weather.windSpeed).toBeGreaterThanOrEqual(5);
    expect(weather.windSpeed).toBeLessThanOrEqual(30);
  });

  it('should return consistent results for the same city', () => {
    const weather1 = getSimulatedWeather('Paris');
    const weather2 = getSimulatedWeather('Paris');

    expect(weather1).toEqual(weather2);
  });

  it('should return different results for different cities', () => {
    const weather1 = getSimulatedWeather('Tokyo');
    const weather2 = getSimulatedWeather('Sydney');

    // At least one property should be different
    const sameTemp = weather1.temperature === weather2.temperature;
    const sameCondition = weather1.condition === weather2.condition;
    expect(sameTemp && sameCondition).toBe(false);
  });
});

describe('getSimulatedForecast', () => {
  it('should return 5-day forecast', () => {
    const forecast = getSimulatedForecast('Berlin');

    expect(forecast).toHaveLength(5);
    expect(forecast[0].day).toBe('Today');
    expect(forecast[1].day).toBe('Tomorrow');
  });

  it('should have high greater than low for each day', () => {
    const forecast = getSimulatedForecast('Rome');

    forecast.forEach((day) => {
      expect(day.high).toBeGreaterThan(day.low);
    });
  });

  it('should return consistent results for the same city', () => {
    const forecast1 = getSimulatedForecast('Madrid');
    const forecast2 = getSimulatedForecast('Madrid');

    expect(forecast1).toEqual(forecast2);
  });
});

describe('getSimulatedAlerts', () => {
  it('should return an array of alerts', () => {
    const alerts = getSimulatedAlerts('California');

    expect(Array.isArray(alerts)).toBe(true);
  });

  it('should return consistent results for the same region', () => {
    const alerts1 = getSimulatedAlerts('Texas');
    const alerts2 = getSimulatedAlerts('Texas');

    expect(alerts1).toEqual(alerts2);
  });

  it('should have valid alert structure when alerts exist', () => {
    // Try a few regions to find one with alerts
    const regions = ['Region1', 'Region2', 'Region3', 'Region4', 'Region5'];
    let foundAlerts = false;

    for (const region of regions) {
      const alerts = getSimulatedAlerts(region);
      if (alerts.length > 0) {
        foundAlerts = true;
        expect(alerts[0]).toHaveProperty('type');
        expect(alerts[0]).toHaveProperty('severity');
        expect(alerts[0]).toHaveProperty('message');
        break;
      }
    }

    expect(foundAlerts).toBe(true);
  });
});

describe('registerWeatherTools', () => {
  let mcpHandler: McpHandler;
  const mockReq = {} as AuthenticatedRequest;

  beforeEach(() => {
    mcpHandler = new McpHandler();
  });

  it('should register three weather tools', () => {
    registerWeatherTools(mcpHandler, null);

    const tools = mcpHandler.getTools();
    expect(tools).toHaveLength(3);

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain('get-weather');
    expect(toolNames).toContain('get-forecast');
    expect(toolNames).toContain('get-weather-alerts');
  });

  describe('get-weather tool', () => {
    it('should return weather data without auth', async () => {
      registerWeatherTools(mcpHandler, null);

      const response = await mcpHandler.handleRequest(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'get-weather', arguments: { city: 'Seattle' } },
        },
        mockReq
      );

      expect(response.error).toBeUndefined();
      const result = response.result as { content: Array<{ text: string }> };
      const data = JSON.parse(result.content[0].text);
      expect(data.city).toBe('Seattle');
      expect(data.temperature).toBeDefined();
    });

    it('should work with auth middleware in disabled mode', async () => {
      const config = createDefaultConfig({ authDisabled: true });
      const middleware = new OAuthAuthMiddleware(null, config);
      registerWeatherTools(mcpHandler, middleware);

      const response = await mcpHandler.handleRequest(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'get-weather', arguments: { city: 'Boston' } },
        },
        mockReq
      );

      expect(response.error).toBeUndefined();
    });
  });

  describe('get-forecast tool', () => {
    it('should return forecast data when auth is disabled', async () => {
      const config = createDefaultConfig({ authDisabled: true });
      const middleware = new OAuthAuthMiddleware(null, config);
      registerWeatherTools(mcpHandler, middleware);

      const response = await mcpHandler.handleRequest(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'get-forecast', arguments: { city: 'Denver' } },
        },
        mockReq
      );

      expect(response.error).toBeUndefined();
      const result = response.result as { content: Array<{ text: string }> };
      const data = JSON.parse(result.content[0].text);
      expect(data.city).toBe('Denver');
      expect(data.forecast).toHaveLength(5);
    });

    it('should return access denied without mcp:read scope', async () => {
      const config = createDefaultConfig({
        authDisabled: false,
        clientId: 'test',
        clientSecret: 'secret',
        jwksUri: 'https://example.com/.well-known/jwks.json',
      });
      const middleware = new OAuthAuthMiddleware(null, config);
      registerWeatherTools(mcpHandler, middleware);

      const response = await mcpHandler.handleRequest(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'get-forecast', arguments: { city: 'Portland' } },
        },
        mockReq
      );

      expect(response.error).toBeUndefined();
      const result = response.result as {
        content: Array<{ text: string }>;
        isError?: boolean;
      };
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('access_denied');
      expect(data.message).toContain('mcp:read');
    });

    it('should return data when no auth middleware provided', async () => {
      registerWeatherTools(mcpHandler, null);

      const response = await mcpHandler.handleRequest(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'get-forecast', arguments: { city: 'Miami' } },
        },
        mockReq
      );

      expect(response.error).toBeUndefined();
      const result = response.result as { content: Array<{ text: string }> };
      const data = JSON.parse(result.content[0].text);
      expect(data.city).toBe('Miami');
    });
  });

  describe('get-weather-alerts tool', () => {
    it('should return alerts data when auth is disabled', async () => {
      const config = createDefaultConfig({ authDisabled: true });
      const middleware = new OAuthAuthMiddleware(null, config);
      registerWeatherTools(mcpHandler, middleware);

      const response = await mcpHandler.handleRequest(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'get-weather-alerts', arguments: { region: 'West' } },
        },
        mockReq
      );

      expect(response.error).toBeUndefined();
      const result = response.result as { content: Array<{ text: string }> };
      const data = JSON.parse(result.content[0].text);
      expect(data.region).toBe('West');
      expect(Array.isArray(data.alerts)).toBe(true);
    });

    it('should return access denied without mcp:admin scope', async () => {
      const config = createDefaultConfig({
        authDisabled: false,
        clientId: 'test',
        clientSecret: 'secret',
        jwksUri: 'https://example.com/.well-known/jwks.json',
      });
      const middleware = new OAuthAuthMiddleware(null, config);
      registerWeatherTools(mcpHandler, middleware);

      const response = await mcpHandler.handleRequest(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'get-weather-alerts', arguments: { region: 'East' } },
        },
        mockReq
      );

      expect(response.error).toBeUndefined();
      const result = response.result as {
        content: Array<{ text: string }>;
        isError?: boolean;
      };
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('access_denied');
      expect(data.message).toContain('mcp:admin');
    });

    it('should return data when no auth middleware provided', async () => {
      registerWeatherTools(mcpHandler, null);

      const response = await mcpHandler.handleRequest(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'get-weather-alerts',
            arguments: { region: 'Central' },
          },
        },
        mockReq
      );

      expect(response.error).toBeUndefined();
      const result = response.result as { content: Array<{ text: string }> };
      const data = JSON.parse(result.content[0].text);
      expect(data.region).toBe('Central');
    });
  });

  describe('tool specifications', () => {
    beforeEach(() => {
      registerWeatherTools(mcpHandler, null);
    });

    it('should have proper input schema for get-weather', () => {
      const tools = mcpHandler.getTools();
      const getWeather = tools.find((t) => t.name === 'get-weather');

      expect(getWeather?.inputSchema.properties.city).toEqual({
        type: 'string',
        description: 'City name to get weather for',
      });
      expect(getWeather?.inputSchema.required).toContain('city');
    });

    it('should have proper input schema for get-forecast', () => {
      const tools = mcpHandler.getTools();
      const getForecast = tools.find((t) => t.name === 'get-forecast');

      expect(getForecast?.inputSchema.properties.city).toEqual({
        type: 'string',
        description: 'City name to get forecast for',
      });
      expect(getForecast?.inputSchema.required).toContain('city');
    });

    it('should have proper input schema for get-weather-alerts', () => {
      const tools = mcpHandler.getTools();
      const getAlerts = tools.find((t) => t.name === 'get-weather-alerts');

      expect(getAlerts?.inputSchema.properties.region).toEqual({
        type: 'string',
        description: 'Region name to get alerts for',
      });
      expect(getAlerts?.inputSchema.required).toContain('region');
    });

    it('should have descriptions mentioning required scopes', () => {
      const tools = mcpHandler.getTools();

      const getWeather = tools.find((t) => t.name === 'get-weather');
      expect(getWeather?.description).toContain('No authentication required');

      const getForecast = tools.find((t) => t.name === 'get-forecast');
      expect(getForecast?.description).toContain('mcp:read');

      const getAlerts = tools.find((t) => t.name === 'get-weather-alerts');
      expect(getAlerts?.description).toContain('mcp:admin');
    });
  });
});
