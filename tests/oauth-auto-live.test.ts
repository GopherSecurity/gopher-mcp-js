import { GopherAgent } from '../src';
import {
  liveGmailOAuthTest,
  readLiveGmailOAuthEnv,
  refreshGmailAccessTokenFromEnv,
} from './helpers/gmailOAuthLive';

jest.setTimeout(120_000);

describe('OAuth auto live verification', () => {
  const liveTest = liveGmailOAuthTest();

  liveTest('verifies Gmail OAuth through direct MCP server URL', async () => {
    const env = readLiveGmailOAuthEnv();
    const token = await refreshGmailAccessTokenFromEnv();
    console.log('gmail_access_token_refreshed');

    const agent = await GopherAgent.createWithUrl(
      env.provider,
      env.model,
      env.serverMcpUrl,
      {
        accessToken: token.accessToken,
      }
    );
    console.log('server_agent_created');

    try {
      const response = agent.run('Get my mail profile');
      expect(response).toContain(env.expectedEmail);
      console.log('server_agent_response_verified');
    } finally {
      agent.dispose();
    }
  });

  liveTest('verifies Gmail OAuth through MCP gateway URL', async () => {
    const env = readLiveGmailOAuthEnv();
    const token = await refreshGmailAccessTokenFromEnv();
    console.log('gmail_access_token_refreshed');

    const agent = await GopherAgent.createWithUrl(
      env.provider,
      env.model,
      env.gatewayMcpUrl,
      {
        accessToken: token.accessToken,
      }
    );
    console.log('gateway_agent_created');

    try {
      const response = agent.run('Get my mail profile');
      expect(response).toContain(env.expectedEmail);
      console.log('gateway_agent_response_verified');
    } finally {
      agent.dispose();
    }
  });
});
