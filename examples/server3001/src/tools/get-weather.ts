/**
 * Get current weather for a city
 * No authentication required - public tool
 */
export const getWeather = {
  name: 'get-weather',
  description: 'Get current weather information for a specific city',
  inputSchema: {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: 'City name (e.g., "London", "New York", "Tokyo")',
      },
    },
    required: ['city'],
  },
  handler: async (request: any) => {
    const { city } = request.params;

    // Simulate weather data (in a real app, you'd call a weather API)
    const weatherData = {
      London: { temp: 15, condition: 'Cloudy', humidity: 75 },
      'New York': { temp: 22, condition: 'Sunny', humidity: 60 },
      Tokyo: { temp: 18, condition: 'Rainy', humidity: 80 },
      Paris: { temp: 17, condition: 'Partly Cloudy', humidity: 70 },
      Sydney: { temp: 25, condition: 'Sunny', humidity: 55 },
    };

    const weather = weatherData[city as keyof typeof weatherData] || {
      temp: Math.floor(Math.random() * 30) + 10,
      condition: ['Sunny', 'Cloudy', 'Rainy', 'Partly Cloudy'][Math.floor(Math.random() * 4)],
      humidity: Math.floor(Math.random() * 40) + 50,
    };

    return {
      content: [
        {
          type: 'text',
          text: `Weather in ${city}:\nTemperature: ${weather.temp}°C\nCondition: ${weather.condition}\nHumidity: ${weather.humidity}%`,
        },
      ],
    };
  },
};
