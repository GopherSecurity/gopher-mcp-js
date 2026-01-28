/**
 * Get weather alerts
 * Requires mcp:admin scope for severe weather alerts
 */
export const getAlerts = {
  name: 'get-weather-alerts',
  description: 'Get weather alerts and warnings for a region (requires mcp:admin scope)',
  inputSchema: {
    type: 'object',
    properties: {
      region: {
        type: 'string',
        description: 'Region or city name',
      },
    },
    required: ['region'],
  },
  handler: async (request: any) => {
    const { region } = request.params;

    // Simulate weather alerts
    const alerts = [
      {
        severity: 'moderate',
        type: 'Heavy Rain',
        message: 'Heavy rain expected in the next 6 hours',
      },
      { severity: 'low', type: 'Wind', message: 'Strong winds possible this evening' },
    ];

    const hasAlerts = Math.random() > 0.5;

    if (!hasAlerts) {
      return {
        content: [
          {
            type: 'text',
            text: `No active weather alerts for ${region}`,
          },
        ],
      };
    }

    const alertText = alerts
      .map(alert => `[${alert.severity.toUpperCase()}] ${alert.type}: ${alert.message}`)
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `Weather Alerts for ${region}:\n\n${alertText}`,
        },
      ],
    };
  },
};
