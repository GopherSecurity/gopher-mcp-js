/**
 * Get current time for a timezone or location
 * No authentication required - public tool
 */
export const getTime = {
  name: 'get-time',
  description: 'Get current time and date for a specific timezone or city',
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description:
          'Timezone (e.g., "UTC", "America/New_York") or city name (e.g., "London", "Tokyo")',
      },
    },
    required: ['location'],
  },
  handler: async (request: any) => {
    // Handle different parameter structures
    let location;

    if (request.params?.arguments) {
      if (typeof request.params.arguments === 'string') {
        // Gopher-orch sends arguments as JSON string
        try {
          const parsedArgs = JSON.parse(request.params.arguments);
          location = parsedArgs.location;
        } catch (e) {
          location = undefined;
        }
      } else {
        // Direct calls send arguments as object
        location = request.params.arguments.location;
      }
    } else {
      // Fallback to direct params
      location = request.params?.location;
    }

    if (!location) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: No location parameter provided',
          },
        ],
        isError: true,
      };
    }

    // Map common city names to timezones
    const cityToTimezone: { [key: string]: string } = {
      london: 'Europe/London',
      'new york': 'America/New_York',
      tokyo: 'Asia/Tokyo',
      paris: 'Europe/Paris',
      france: 'Europe/Paris',
      sydney: 'Australia/Sydney',
      'los angeles': 'America/Los_Angeles',
      chicago: 'America/Chicago',
      dubai: 'Asia/Dubai',
      singapore: 'Asia/Singapore',
      mumbai: 'Asia/Kolkata',
      beijing: 'Asia/Shanghai',
      moscow: 'Europe/Moscow',
      berlin: 'Europe/Berlin',
      toronto: 'America/Toronto',
    };

    // Determine timezone
    let timezone = location;
    const normalizedLocation = location.toLowerCase();

    if (cityToTimezone[normalizedLocation]) {
      timezone = cityToTimezone[normalizedLocation];
    }

    try {
      // Get current time in specified timezone
      const now = new Date();
      const timeInTimezone = now.toLocaleString('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      });

      const dateOnly = now.toLocaleDateString('en-US', {
        timeZone: timezone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const timeOnly = now.toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      });

      return {
        content: [
          {
            type: 'text',
            text: `Current time in ${location}:\n\nFull Date & Time: ${timeInTimezone}\nDate: ${dateOnly}\nTime: ${timeOnly}\nTimezone: ${timezone}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Invalid timezone or location "${location}". Please use a valid timezone (e.g., "UTC", "America/New_York") or city name (e.g., "London", "Tokyo").`,
          },
        ],
        isError: true,
      };
    }
  },
};
