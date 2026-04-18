/**
 * User context tool - Demonstrates using user information from token
 * Shows how to access user claims and build personalized responses
 */

export const userContextTool = {
  name: 'user-profile',
  description:
    'Get personalized profile information using authentication context',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export const userContextToolHandler = async (request: any) => {
  // Extract user information from the authenticated token
  const auth = request._auth || {};
  const {
    sub: userId,
    email,
    name,
    scopes,
    organization_id,
    server_id,
    iat,
    exp,
  } = auth;

  // Calculate token lifetime
  const issuedAt = new Date(iat * 1000);
  const expiresAt = new Date(exp * 1000);
  const now = new Date();
  const timeRemaining = Math.floor(
    (expiresAt.getTime() - now.getTime()) / 1000 / 60
  ); // minutes

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            user: {
              id: userId,
              email,
              name: name || 'Not provided',
            },
            context: {
              organizationId: organization_id,
              serverId: server_id,
            },
            authorization: {
              scopes,
              hasAdminAccess: scopes.includes('mcp:admin'),
              hasWriteAccess: scopes.includes('mcp:write'),
            },
            session: {
              issuedAt: issuedAt.toISOString(),
              expiresAt: expiresAt.toISOString(),
              timeRemainingMinutes: timeRemaining,
            },
            personalized: {
              greeting: `Hello, ${name || email}!`,
              permissions: scopes.length,
              accountAge: 'New user', // Would calculate from real data
            },
          },
          null,
          2
        ),
      },
    ],
  };
};
