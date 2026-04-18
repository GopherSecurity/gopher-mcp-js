/**
 * Admin tool - Requires admin scope
 * Demonstrates scope-based access control
 */

export const adminTool = {
  name: 'admin-action',
  description: 'Perform administrative action (requires mcp:admin scope)',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list-users', 'system-status', 'clear-cache'],
        description: 'Administrative action to perform',
      },
    },
    required: ['action'],
  },
};

export const adminToolHandler = async (request: any) => {
  // This handler is only called if the user has 'mcp:admin' scope
  const auth = request._auth || {};
  const action = request.params.arguments.action;
  const adminUser = auth.email;

  // Simulate admin actions
  const actionResults = {
    'list-users': {
      totalUsers: 42,
      activeUsers: 38,
      recentlyCreated: 5,
    },
    'system-status': {
      uptime: '7 days',
      memoryUsage: '45%',
      cpuUsage: '23%',
      activeConnections: 12,
    },
    'clear-cache': {
      clearedItems: 156,
      freedMemory: '24.5 MB',
      timestamp: new Date().toISOString(),
    },
  };

  const result = actionResults[action as keyof typeof actionResults] || {
    error: 'Unknown action',
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            action,
            performedBy: adminUser,
            result,
            timestamp: new Date().toISOString(),
          },
          null,
          2
        ),
      },
    ],
  };
};
