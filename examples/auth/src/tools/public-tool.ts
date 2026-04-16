/**
 * Public tool - No authentication required
 * Demonstrates a tool that is accessible without OAuth
 */

export const publicTool = {
  name: 'health',
  description: 'Check server health (no authentication required)',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export const publicToolHandler = async () => {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            server: 'gopher-auth-example-server',
            version: '1.0.0',
          },
          null,
          2
        ),
      },
    ],
  };
};
