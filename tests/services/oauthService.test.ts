import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { OAuthService } from '../../src/services/oauthService.js';
import type { Config } from '../../src/types/index.js';

// Mock dependencies
jest.mock('node-fetch');
jest.mock('fs/promises');

describe('OAuthService', () => {
  let oauthService: OAuthService;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      port: 3000,
      host: 'localhost',
      feishu: {
        app_id: 'test-app-id',
        app_secret: 'test-app-secret',
        redirect_uri: 'http://localhost:3000/oauth/callback',
      },
      lark_mcp: {
        binary_path: 'mock-lark-mcp',
        base_port: 3001,
        default_instance_port: 4000,
      },
      rate_limit: {
        per_session: 50,
        per_ip: 200,
        window_ms: 60000,
      },
      storage: {
        data_dir: './test-data',
        snapshot_interval_ms: 600000,
        token_ttl_ms: 2592000000,
      },
      instance: {
        max_instances: 20,
        idle_timeout_ms: 1800000,
        memory_limit_mb: 256,
      },
    };

    oauthService = new OAuthService(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
    oauthService.shutdown();
  });

  describe('OAuth URL generation', () => {
    it('should generate valid OAuth URL', () => {
      const sessionId = 'test-session-123';
      const authUrl = oauthService.generateAuthUrl(sessionId);
      
      expect(authUrl).toContain('https://open.feishu.cn/open-apis/authen/v1/authorize');
      expect(authUrl).toContain('app_id=test-app-id');
      expect(authUrl).toContain('redirect_uri=http%3A//localhost%3A3000/oauth/callback');
      expect(authUrl).toContain('response_type=code');
      expect(authUrl).toContain(`_${sessionId}`);
    });

    it('should include proper scopes', () => {
      const sessionId = 'test-session-123';
      const authUrl = oauthService.generateAuthUrl(sessionId);
      
      expect(authUrl).toContain('scope=');
      expect(authUrl).toContain('contact%3Auser.id%3Areadonly');
      expect(authUrl).toContain('calendar%3Acalendar.readonly');
    });
  });

  describe('OAuth callback handling', () => {
    it('should handle successful OAuth callback', async () => {
      const sessionId = 'test-session-123';
      const code = 'test-auth-code';
      
      // Generate state first
      const authUrl = oauthService.generateAuthUrl(sessionId);
      const stateMatch = authUrl.match(/state=([^&]+)/);
      const state = decodeURIComponent(stateMatch![1]);
      
      // Mock token exchange response
      global.mockFetch({
        code: 0,
        data: {
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
        }
      });
      
      // Mock user info response
      global.mockFetch({
        code: 0,
        data: {
          union_id: 'test-user-123',
          user_id: 'user-456',
          name: 'Test User',
          email: 'test@example.com',
        }
      });
      
      // Mock file operations
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      
      const result = await oauthService.handleCallback(code, state);
      
      expect(result.sessionId).toBe(sessionId);
      expect(result.userId).toBe('test-user-123');
    });

    it('should reject invalid state', async () => {
      const code = 'test-auth-code';
      const invalidState = 'invalid-state_test-session';
      
      await expect(oauthService.handleCallback(code, invalidState)).rejects.toThrow('Invalid or expired state parameter');
    });

    it('should handle token exchange error', async () => {
      const sessionId = 'test-session-123';
      const code = 'test-auth-code';
      
      // Generate valid state
      const authUrl = oauthService.generateAuthUrl(sessionId);
      const stateMatch = authUrl.match(/state=([^&]+)/);
      const state = decodeURIComponent(stateMatch![1]);
      
      // Mock failed token exchange
      global.mockFetch({
        code: 1001,
        msg: 'Invalid authorization code',
      });
      
      await expect(oauthService.handleCallback(code, state)).rejects.toThrow('Token exchange error');
    });
  });

  describe('Token management', () => {
    it('should save user tokens correctly', async () => {
      const userId = 'test-user-123';
      const tokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'test-scope',
      };
      
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      
      // Use private method through reflection for testing
      await (oauthService as any).saveUserTokens(userId, tokens);
      
      expect(mockFs.mkdir).toHaveBeenCalledWith('./test-data/user-test-user-123', { recursive: true });
      expect(mockFs.writeFile).toHaveBeenCalled();
      
      const writeCall = mockFs.writeFile.mock.calls[0];
      expect(writeCall[0]).toContain('user-test-user-123/tokens.json');
      
      const savedData = JSON.parse(writeCall[1]);
      expect(savedData.userId).toBe(userId);
      expect(savedData.access_token).toBe(tokens.access_token);
    });

    it('should load user tokens from file', async () => {
      const userId = 'test-user-123';
      const mockTokenData = {
        userId,
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      };
      
      const mockFs = require('fs/promises');
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockTokenData));
      
      const tokens = await oauthService.loadUserTokens(userId);
      
      expect(tokens).toBeDefined();
      expect(tokens!.userId).toBe(userId);
      expect(tokens!.access_token).toBe('test-access-token');
      expect(tokens!.expires_at).toBeInstanceOf(Date);
    });

    it('should return null for non-existent tokens', async () => {
      const userId = 'non-existent-user';
      
      const mockFs = require('fs/promises');
      const error = new Error('File not found') as any;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);
      
      const tokens = await oauthService.loadUserTokens(userId);
      
      expect(tokens).toBeNull();
    });

    it('should refresh expired tokens', async () => {
      const userId = 'test-user-123';
      const oldTokens = {
        userId,
        access_token: 'old-token',
        refresh_token: 'refresh-token',
        expires_at: new Date(Date.now() - 1000), // Expired
      };
      
      // Mock loading old tokens
      const mockFs = require('fs/promises');
      mockFs.readFile.mockResolvedValue(JSON.stringify(oldTokens));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      
      // Mock refresh response
      global.mockFetch({
        code: 0,
        data: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }
      });
      
      const newTokens = await oauthService.refreshUserToken(userId);
      
      expect(newTokens).toBeDefined();
      expect(newTokens!.access_token).toBe('new-access-token');
      expect(newTokens!.refresh_token).toBe('new-refresh-token');
    });

    it('should ensure valid token with auto-refresh', async () => {
      const userId = 'test-user-123';
      const expiringSoon = new Date(Date.now() + 240000); // 4 minutes from now
      
      const oldTokens = {
        userId,
        access_token: 'expiring-token',
        refresh_token: 'refresh-token',
        expires_at: expiringSoon.toISOString(),
      };
      
      // Mock loading tokens
      const mockFs = require('fs/promises');
      mockFs.readFile.mockResolvedValue(JSON.stringify(oldTokens));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      
      // Mock refresh response
      global.mockFetch({
        code: 0,
        data: {
          access_token: 'refreshed-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }
      });
      
      const validTokens = await oauthService.ensureValidToken(userId);
      
      expect(validTokens).toBeDefined();
      expect(validTokens!.access_token).toBe('refreshed-token');
    });
  });

  describe('Token validation', () => {
    it('should validate non-expired tokens', () => {
      const validTokens = {
        userId: 'test-user',
        access_token: 'valid-token',
        refresh_token: 'refresh-token',
        expires_at: new Date(Date.now() + 3600000), // 1 hour from now
      };
      
      const isValid = oauthService.isTokenValid(validTokens);
      expect(isValid).toBe(true);
    });

    it('should invalidate expired tokens', () => {
      const expiredTokens = {
        userId: 'test-user',
        access_token: 'expired-token',
        refresh_token: 'refresh-token',
        expires_at: new Date(Date.now() - 1000), // 1 second ago
      };
      
      const isValid = oauthService.isTokenValid(expiredTokens);
      expect(isValid).toBe(false);
    });
  });

  describe('Token utilities', () => {
    it('should get valid user token', async () => {
      const userId = 'test-user-123';
      const validTokens = {
        userId,
        access_token: 'valid-token',
        refresh_token: 'refresh-token',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      };
      
      const mockFs = require('fs/promises');
      mockFs.readFile.mockResolvedValue(JSON.stringify(validTokens));
      
      const token = await oauthService.getValidUserToken(userId);
      
      expect(token).toBe('valid-token');
    });

    it('should return null for invalid user', async () => {
      const userId = 'invalid-user';
      
      const mockFs = require('fs/promises');
      const error = new Error('File not found') as any;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);
      
      const token = await oauthService.getValidUserToken(userId);
      
      expect(token).toBeNull();
    });

    it('should clear user tokens', async () => {
      const userId = 'test-user-123';
      
      const mockFs = require('fs/promises');
      mockFs.unlink.mockResolvedValue(undefined);
      
      await oauthService.clearUserTokens(userId);
      
      expect(mockFs.unlink).toHaveBeenCalledWith('./test-data/user-test-user-123/tokens.json');
    });
  });

  describe('Error handling', () => {
    it('should handle network errors in token exchange', async () => {
      const sessionId = 'test-session-123';
      const code = 'test-auth-code';
      
      // Generate valid state
      const authUrl = oauthService.generateAuthUrl(sessionId);
      const stateMatch = authUrl.match(/state=([^&]+)/);
      const state = decodeURIComponent(stateMatch![1]);
      
      // Mock network error
      const mockFetch = require('node-fetch').default;
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      await expect(oauthService.handleCallback(code, state)).rejects.toThrow('Network error');
    });

    it('should handle file system errors gracefully', async () => {
      const userId = 'test-user-123';
      
      const mockFs = require('fs/promises');
      mockFs.readFile.mockRejectedValue(new Error('Permission denied'));
      
      const tokens = await oauthService.loadUserTokens(userId);
      
      expect(tokens).toBeNull();
    });
  });

  describe('Cleanup', () => {
    it('should shutdown cleanly', () => {
      expect(() => oauthService.shutdown()).not.toThrow();
    });
  });
});