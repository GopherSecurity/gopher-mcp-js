import { GopherAgentTokenRecord, GopherAgentTokenStore } from './config';
import { OAuthTokenRefreshError } from './oauthTokenExchange';

export interface OAuthTokenCacheKeyInput {
  resource: string;
  issuer: string;
  scopes: string[];
}

export interface ResolveOAuthTokenFromStoreInput {
  store: GopherAgentTokenStore;
  key: string;
  nowMs?: number;
  refreshToken: (
    token: GopherAgentTokenRecord
  ) => Promise<GopherAgentTokenRecord>;
  acquireToken: () => Promise<GopherAgentTokenRecord>;
}

export class InMemoryGopherAgentTokenStore implements GopherAgentTokenStore {
  private readonly tokens = new Map<string, GopherAgentTokenRecord>();

  get(key: string): Promise<GopherAgentTokenRecord | undefined> {
    return Promise.resolve(this.tokens.get(key));
  }

  set(key: string, token: GopherAgentTokenRecord): Promise<void> {
    this.tokens.set(key, token);
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.tokens.delete(key);
    return Promise.resolve();
  }
}

export function createOAuthTokenCacheKey(
  input: OAuthTokenCacheKeyInput
): string {
  const scopes = [...new Set(input.scopes)].sort().join(' ');
  return JSON.stringify({
    resource: input.resource,
    issuer: input.issuer,
    scopes,
  });
}

export async function resolveOAuthTokenFromStore(
  input: ResolveOAuthTokenFromStoreInput
): Promise<GopherAgentTokenRecord> {
  const nowMs = input.nowMs ?? Date.now();
  const cached = await input.store.get(input.key);
  if (cached !== undefined && !isExpired(cached, nowMs)) {
    return cached;
  }

  if (cached?.refreshToken) {
    try {
      const refreshed = await input.refreshToken(cached);
      const refreshedWithRefreshToken = {
        ...refreshed,
        refreshToken: refreshed.refreshToken ?? cached.refreshToken,
        oauthClientId: refreshed.oauthClientId ?? cached.oauthClientId,
        oauthClientSecret:
          refreshed.oauthClientSecret ?? cached.oauthClientSecret,
      };
      await input.store.set(input.key, refreshedWithRefreshToken);
      return refreshedWithRefreshToken;
    } catch (e) {
      if (isPermanentRefreshFailure(e)) {
        await input.store.delete?.(input.key);
      } else {
        throw e;
      }
    }
  }

  const acquired = await input.acquireToken();
  await input.store.set(input.key, acquired);
  return acquired;
}

function isPermanentRefreshFailure(error: unknown): boolean {
  return error instanceof OAuthTokenRefreshError && error.permanent;
}

function isExpired(token: GopherAgentTokenRecord, nowMs: number): boolean {
  return token.expiresAt !== undefined && token.expiresAt <= nowMs;
}
