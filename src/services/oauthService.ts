import { randomBytes, createHash } from 'crypto';
import fetch from 'node-fetch';
import type { Config, TokenData, OAuthState } from '../types/index.js';

export class OAuthService {
  private config: Config;
  private stateStore = new Map<string, OAuthState>();

  constructor(config: Config) {
    this.config = config;
    
    // Clean up expired states every hour
    setInterval(() => {
      const now = Date.now();
      for (const [key, state] of this.stateStore.entries()) {
        if (now - state.created_at > 3600000) { // 1 hour
          this.stateStore.delete(key);
        }
      }
    }, 3600000);
  }

  generateAuthUrl(sessionId: string): string {
    const state = randomBytes(32).toString('hex');
    const oauthState: OAuthState = {
      sessionId,
      state,
      created_at: Date.now(),
    };
    
    this.stateStore.set(state, oauthState);
    
    const params = new URLSearchParams({
      app_id: this.config.feishu.app_id,
      redirect_uri: this.config.feishu.redirect_uri,
      response_type: 'code',
      scope: 'contact:user.id:readonly',
      state,
    });
    
    return `https://open.feishu.cn/open-apis/authen/v1/authorize?${params.toString()}`;
  }

  async handleCallback(code: string, state: string): Promise<{ sessionId: string; tokenData: TokenData; unionId: string }> {
    const oauthState = this.stateStore.get(state);
    if (!oauthState) {
      throw new Error('Invalid or expired state parameter');
    }
    
    this.stateStore.delete(state);
    
    // Exchange code for token
    const tokenResponse = await fetch('https://open.feishu.cn/open-apis/authen/v1/oidc/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: this.config.feishu.app_id,
        client_secret: this.config.feishu.app_secret,
        code,
        redirect_uri: this.config.feishu.redirect_uri,
      }),
    });
    
    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }
    
    const tokenData = await tokenResponse.json() as any;
    
    if (tokenData.code !== 0) {
      throw new Error(`Token exchange error: ${tokenData.msg}`);
    }
    
    // Get user info to obtain union_id
    const userResponse = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
      headers: {
        'Authorization': `Bearer ${tokenData.data.access_token}`,
      },
    });
    
    if (!userResponse.ok) {
      throw new Error(`Failed to get user info: ${userResponse.status}`);
    }
    
    const userData = await userResponse.json() as any;
    
    if (userData.code !== 0) {
      throw new Error(`User info error: ${userData.msg}`);
    }
    
    const processedTokenData: TokenData = {
      access_token: tokenData.data.access_token,
      refresh_token: tokenData.data.refresh_token,
      expires_in: tokenData.data.expires_in,
      token_type: tokenData.data.token_type || 'Bearer',
      scope: tokenData.data.scope,
      created_at: Date.now(),
    };
    
    return {
      sessionId: oauthState.sessionId,
      tokenData: processedTokenData,
      unionId: userData.data.union_id,
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenData> {
    const response = await fetch('https://open.feishu.cn/open-apis/authen/v1/oidc/refresh_access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status}`);
    }
    
    const data = await response.json() as any;
    
    if (data.code !== 0) {
      throw new Error(`Token refresh error: ${data.msg}`);
    }
    
    return {
      access_token: data.data.access_token,
      refresh_token: data.data.refresh_token || refreshToken,
      expires_in: data.data.expires_in,
      token_type: data.data.token_type || 'Bearer',
      scope: data.data.scope,
      created_at: Date.now(),
    };
  }

  isTokenExpired(tokenData: TokenData): boolean {
    const now = Date.now();
    const expiresAt = tokenData.created_at + (tokenData.expires_in * 1000);
    // Consider token expired 5 minutes before actual expiry
    return now >= (expiresAt - 300000);
  }

  async ensureValidToken(tokenData: TokenData): Promise<TokenData> {
    if (!this.isTokenExpired(tokenData)) {
      return tokenData;
    }
    
    if (!tokenData.refresh_token) {
      throw new Error('Token expired and no refresh token available');
    }
    
    return await this.refreshToken(tokenData.refresh_token);
  }
}