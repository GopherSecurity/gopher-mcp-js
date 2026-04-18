/**
 * Protected tool - Requires basic authentication
 * Demonstrates a tool that requires a valid OAuth token
 */

export const protectedTool = {
  name: 'get-user-data',
  description: 'Get data for the authenticated user (requires authentication)',
  inputSchema: {
    type: 'object',
    properties: {
      dataType: {
        type: 'string',
        enum: ['profile', 'preferences', 'activity'],
        description: 'Type of data to retrieve',
      },
    },
    required: ['dataType'],
  },
};

export const protectedToolHandler = async (request: any) => {
  // User context is available from auth middleware via _auth
  const auth = request._auth || {};
  const userId = auth.sub;
  const userEmail = auth.email;
  const dataType = request.params.arguments.dataType;

  // Simulate fetching user data
  const mockData = {
    profile: {
      userId,
      email: userEmail,
      name: auth.name || 'Unknown',
      createdAt: '2025-01-01T00:00:00Z',
    },
    preferences: {
      theme: 'dark',
      notifications: true,
      language: 'en',
    },
    activity: {
      lastLogin: new Date().toISOString(),
      totalRequests: 42,
      favoriteTools: ['health', 'get-user-data'],
    },
  };

  const data = mockData[dataType as keyof typeof mockData] || {
    error: 'Unknown data type',
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            dataType,
            userId,
            data,
          },
          null,
          2
        ),
      },
    ],
  };
};
