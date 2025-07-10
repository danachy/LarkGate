import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import type { Config, OAuthTokenResponse, FeishuUserInfo, UserTokens } from '../types/index.js';

export class OAuthService {
  private stateStore = new Map<string, { sessionId: string; createdAt: Date }>();
  private tokenCache = new Map<string, UserTokens>(); // 内存缓存用户 token
  private stateCleanupInterval: NodeJS.Timeout;

  constructor(private config: Config) {
    // 清理过期的 state
    this.stateCleanupInterval = setInterval(() => {
      const now = new Date();
      for (const [state, data] of this.stateStore.entries()) {
        if (now.getTime() - data.createdAt.getTime() > 600000) { // 10分钟过期
          this.stateStore.delete(state);
        }
      }
    }, 300000); // 每5分钟清理一次
  }

  generateAuthUrl(sessionId: string): string {
    const state = randomBytes(32).toString('hex');
    this.stateStore.set(state, { sessionId, createdAt: new Date() });
    
    const params = new URLSearchParams({
      app_id: this.config.feishu.app_id,
      redirect_uri: this.config.feishu.redirect_uri,
      response_type: 'code',
      scope: 'contact:user.id:readonly calendar:calendar.readonly calendar:calendar.event:readonly docs:docs:readonly',
      state: `${state}_${sessionId}`, // 包含sessionId便于回调处理
    });
    
    const authUrl = `https://open.feishu.cn/open-apis/authen/v1/authorize?${params.toString()}`;
    console.log(`🔗 Generated OAuth URL for session ${sessionId}: ${authUrl}`);
    
    return authUrl;
  }

  async handleCallback(code: string, state: string): Promise<{ sessionId: string; userId: string }> {
    console.log(`🔄 Processing OAuth callback for state: ${state}`);
    
    // 解析 state
    const [stateToken, sessionId] = state.split('_');
    const stateData = this.stateStore.get(stateToken);
    
    if (!stateData || stateData.sessionId !== sessionId) {
      throw new Error('Invalid or expired state parameter');
    }
    
    this.stateStore.delete(stateToken);
    
    try {
      // 获取访问令牌
      const tokenResponse = await this.exchangeCodeForToken(code);
      
      // 获取用户信息
      const userInfo = await this.getUserInfo(tokenResponse.access_token);
      const userId = userInfo.union_id;
      
      // 保存用户令牌到专属目录
      await this.saveUserTokens(userId, tokenResponse);
      
      console.log(`✅ OAuth success for user ${userId} (${userInfo.name}), session ${sessionId}`);
      
      return { sessionId, userId };
    } catch (error) {
      console.error(`❌ OAuth callback failed for session ${sessionId}:`, error);
      throw error;
    }
  }

  private async exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
    const response = await fetch('https://open.feishu.cn/open-apis/authen/v1/oidc/access_token', {
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
    
    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json() as any;
    
    if (data.code !== 0) {
      throw new Error(`Token exchange error: ${data.msg || 'Unknown error'}`);
    }
    
    return {
      access_token: data.data.access_token,
      refresh_token: data.data.refresh_token,
      expires_in: data.data.expires_in,
      token_type: data.data.token_type || 'Bearer',
      scope: data.data.scope || '',
    };
  }

  private async getUserInfo(accessToken: string): Promise<FeishuUserInfo> {
    const response = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json() as any;
    
    if (data.code !== 0) {
      throw new Error(`User info error: ${data.msg || 'Unknown error'}`);
    }
    
    return {
      union_id: data.data.union_id,
      user_id: data.data.user_id,
      name: data.data.name,
      en_name: data.data.en_name,
      avatar_url: data.data.avatar_url,
      email: data.data.email,
    };
  }

  private async saveUserTokens(userId: string, tokens: OAuthTokenResponse): Promise<void> {
    const userDir = path.join(this.config.storage.data_dir, `user-${userId}`);
    await fs.mkdir(userDir, { recursive: true });
    
    const userTokens: UserTokens = {
      userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000),
    };
    
    // 更新缓存
    this.tokenCache.set(userId, userTokens);
    
    const tokenFile = path.join(userDir, 'tokens.json');
    await fs.writeFile(tokenFile, JSON.stringify(userTokens, null, 2));
    
    console.log(`💾 Saved tokens for user ${userId} to ${tokenFile}`);
  }

  async loadUserTokens(userId: string): Promise<UserTokens | null> {
    // 先检查缓存
    const cached = this.tokenCache.get(userId);
    if (cached) {
      return cached;
    }
    
    try {
      const tokenFile = path.join(this.config.storage.data_dir, `user-${userId}`, 'tokens.json');
      const data = await fs.readFile(tokenFile, 'utf-8');
      const tokens = JSON.parse(data) as UserTokens;
      
      // 转换日期字符串为 Date 对象
      tokens.expires_at = new Date(tokens.expires_at);
      
      // 更新缓存
      this.tokenCache.set(userId, tokens);
      
      return tokens;
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        console.error(`Failed to load tokens for user ${userId}:`, error);
      }
      return null;
    }
  }

  async refreshUserToken(userId: string): Promise<UserTokens | null> {
    const tokens = await this.loadUserTokens(userId);
    if (!tokens) {
      console.log(`⚠️  No tokens found for user ${userId}, cannot refresh`);
      return null;
    }
    
    try {
      console.log(`🔄 Refreshing tokens for user ${userId}...`);
      
      const response = await fetch('https://open.feishu.cn/open-apis/authen/v1/oidc/refresh_access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json() as any;
      
      if (data.code !== 0) {
        throw new Error(`Token refresh error: ${data.msg || 'Unknown error'}`);
      }
      
      const newTokens: UserTokens = {
        userId,
        access_token: data.data.access_token,
        refresh_token: data.data.refresh_token || tokens.refresh_token,
        expires_at: new Date(Date.now() + data.data.expires_in * 1000),
      };
      
      await this.saveUserTokens(userId, {
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expires_in: data.data.expires_in,
        token_type: 'Bearer',
        scope: data.data.scope || '',
      });
      
      console.log(`✅ Successfully refreshed tokens for user ${userId}`);
      return newTokens;
    } catch (error) {
      console.error(`❌ Failed to refresh token for user ${userId}:`, error);
      
      // 清理缓存中的无效 token
      this.tokenCache.delete(userId);
      
      return null;
    }
  }

  async ensureValidToken(userId: string): Promise<UserTokens | null> {
    let tokens = await this.loadUserTokens(userId);
    if (!tokens) {
      return null;
    }
    
    // 检查是否需要刷新（提前5分钟刷新）
    const now = new Date();
    const expiresAt = new Date(tokens.expires_at.getTime() - 5 * 60 * 1000);
    
    if (now >= expiresAt) {
      console.log(`⏰ Token expiring for user ${userId}, refreshing...`);
      tokens = await this.refreshUserToken(userId);
    }
    
    return tokens;
  }

  isTokenValid(tokens: UserTokens): boolean {
    const now = new Date();
    return now < tokens.expires_at;
  }

  // 获取用户的有效 token（包含自动刷新）
  async getValidUserToken(userId: string): Promise<string | null> {
    const tokens = await this.ensureValidToken(userId);
    return tokens ? tokens.access_token : null;
  }

  // 清理用户 token
  async clearUserTokens(userId: string): Promise<void> {
    try {
      this.tokenCache.delete(userId);
      
      const tokenFile = path.join(this.config.storage.data_dir, `user-${userId}`, 'tokens.json');
      await fs.unlink(tokenFile);
      
      console.log(`🗑️  Cleared tokens for user ${userId}`);
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        console.error(`Failed to clear tokens for user ${userId}:`, error);
      }
    }
  }

  // 关闭服务
  shutdown(): void {
    if (this.stateCleanupInterval) {
      clearInterval(this.stateCleanupInterval);
    }
    
    this.stateStore.clear();
    this.tokenCache.clear();
    
    console.log('🔚 OAuthService shutdown completed');
  }
}