import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { OAuthService } from '../../src/services/oauthService.js';
import type { Config } from '../../src/types/index.js';

describe('OAuthService', () => {
  let oauthService: OAuthService;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      port: 3000,
      host: 'localhost',
      feishu: {
        app_id: 'test_app_id',
        app_secret: 'test_app_secret',
        redirect_uri: 'http://localhost:3000/oauth/callback'
      },
      lark_mcp: {
        binary_path: 'lark-mcp',
        base_port: 3001,
        default_instance_port: 4000
      },
      rate_limit: {
        per_session: 50,
        per_ip: 200,
        window_ms: 60000
      },
      storage: {
        data_dir: './test-data',
        snapshot_interval_ms: 600000,
        token_ttl_ms: 2592000000
      },
      instance: {
        max_instances: 20,
        idle_timeout_ms: 1800000,
        memory_limit_mb: 256
      }
    };

    oauthService = new OAuthService(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authorization URL generation', () => {
    it('should generate valid authorization URL', () => {
      const sessionId = 'test-session-123';
      const authUrl = oauthService.generateAuthUrl(sessionId);
      
      expect(authUrl).toContain('https://open.feishu.cn/open-apis/authen/v1/authorize');
      expect(authUrl).toContain('app_id=test_app_id');
      expect(authUrl).toContain('redirect_uri=http%3A//localhost%3A3000/oauth/callback');
      expect(authUrl).toContain('response_type=code');
      expect(authUrl).toContain('scope=contact%3Auser.id%3Areadonly');
      expect(authUrl).toContain(`state=`);
      expect(authUrl).toContain(`_${sessionId}`);
    });

    it('should generate different state for different sessions', () => {
      const url1 = oauthService.generateAuthUrl('session-1');
      const url2 = oauthService.generateAuthUrl('session-2');
      
      const state1 = new URL(url1).searchParams.get('state');
      const state2 = new URL(url2).searchParams.get('state');
      
      expect(state1).not.toBe(state2);
      expect(state1).toContain('_session-1');
      expect(state2).toContain('_session-2');
    });
  });

  describe('OAuth callback handling', () => {
    it('should handle callback with valid code and state', async () => {
      const sessionId = 'test-session-123';
      const authUrl = oauthService.generateAuthUrl(sessionId);
      const state = new URL(authUrl).searchParams.get('state')!;
      const code = 'test-auth-code';

      // Mock fetch for token exchange
      const mockTokenResponse = {
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            access_token: 'test-access-token',
            refresh_token: 'test-refresh-token',
            expires_in: 3600,
            token_type: 'Bearer',
            scope: 'contact:user.id:readonly'
          }
        })
      };

      const mockUserResponse = {
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            union_id: 'test-union-id',
            user_id: 'test-user-id',
            name: 'Test User'
          }
        })
      };

      (global.fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce(mockTokenResponse as any)
        .mockResolvedValueOnce(mockUserResponse as any);

      const result = await oauthService.handleCallback(code, state);
      
      expect(result.sessionId).toBe(sessionId);
      expect(result.userId).toBe('test-union-id');
    });

    it('should reject invalid state', async () => {
      const code = 'test-auth-code';
      const invalidState = 'invalid-state_invalid-session';
      
      await expect(oauthService.handleCallback(code, invalidState))
        .rejects.toThrow('Invalid or expired state parameter');
    });

    it('should handle token exchange errors', async () => {
      const sessionId = 'test-session-123';
      const authUrl = oauthService.generateAuthUrl(sessionId);
      const state = new URL(authUrl).searchParams.get('state')!;
      const code = 'test-auth-code';

      // Mock failed token response
      const mockErrorResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request'
      };

      (global.fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce(mockErrorResponse as any);

      await expect(oauthService.handleCallback(code, state))
        .rejects.toThrow('Token exchange failed: 400 Bad Request');
    });
  });

  describe('token management', () => {
    it('should load user tokens', async () => {
      const userId = 'test-user-123';
      
      // Mock successful file read
      const mockTokens = {
        userId,
        access_token: 'test-token',
        refresh_token: 'test-refresh',
        expires_at: new Date(Date.now() + 3600000)
      };

      const mockReadFile = jest.fn().mockResolvedValue(JSON.stringify(mockTokens));
      jest.doMock('fs/promises', () => ({ readFile: mockReadFile }));

      const tokens = await oauthService.loadUserTokens(userId);
      expect(tokens).toBeDefined();
      expect(tokens?.userId).toBe(userId);
    });

    it('should return null for non-existent user tokens', async () => {
      const userId = 'non-existent-user';
      
      const mockReadFile = jest.fn().mockRejectedValue({ code: 'ENOENT' });
      jest.doMock('fs/promises', () => ({ readFile: mockReadFile }));

      const tokens = await oauthService.loadUserTokens(userId);
      expect(tokens).toBeNull();
    });

    it('should validate token expiry correctly', () => {
      const validTokens = {
        userId: 'test-user',
        access_token: 'token',
        refresh_token: 'refresh',
        expires_at: new Date(Date.now() + 3600000) // 1 hour from now
      };

      const expiredTokens = {
        userId: 'test-user',
        access_token: 'token',
        refresh_token: 'refresh',
        expires_at: new Date(Date.now() - 3600000) // 1 hour ago
      };

      expect(oauthService.isTokenValid(validTokens)).toBe(true);
      expect(oauthService.isTokenValid(expiredTokens)).toBe(false);
    });
  });
});