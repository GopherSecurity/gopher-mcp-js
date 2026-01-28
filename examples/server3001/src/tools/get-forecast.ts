/**
 * Get 5-day weather forecast
 * Requires mcp:read scope
 */
export const getForecast = {
  name: 'get-forecast',
  description:
    'Get 5-day weather forecast for a city (requires authentication with mcp:read scope)',
  inputSchema: {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: 'City name',
      },
      days: {
        type: 'number',
        description: 'Number of days to forecast (1-5)',
        default: 5,
      },
    },
    required: ['city'],
  },
  handler: async (request: any) => {
    const { city, days = 5 } = request.params;

    // In a real app, you'd check authentication here
    // For now, just return mock data

    const forecastDays = Math.min(days, 5);
    const forecast = [];

    for (let i = 0; i < forecastDays; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);

      forecast.push({
        date: date.toLocaleDateString(),
        temp_high: Math.floor(Math.random() * 10) + 20,
        temp_low: Math.floor(Math.random() * 10) + 10,
        condition: ['Sunny', 'Cloudy', 'Rainy', 'Partly Cloudy'][Math.floor(Math.random() * 4)],
      });
    }

    const forecastText = forecast
      .map(day => `${day.date}: ${day.temp_low}-${day.temp_high}°C, ${day.condition}`)
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `${forecastDays}-day forecast for ${city}:\n\n${forecastText}`,
        },
      ],
    };
  },
};
