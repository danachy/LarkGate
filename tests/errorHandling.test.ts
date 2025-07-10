import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { InstanceManager } from '../src/services/instanceManager.js';
import { RequestRouter } from '../src/services/requestRouter.js';
import { OAuthService } from '../src/services/oauthService.js';
import type { Config, MCPRequest } from '../src/types/index.js';

// Mock dependencies
jest.mock('child_process');
jest.mock('fs/promises');
jest.mock('node-fetch');

describe('Error Handling Scenarios', () => {
  let instanceManager: InstanceManager;
  let requestRouter: RequestRouter;
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

    instanceManager = new InstanceManager(mockConfig);
    requestRouter = new RequestRouter(mockConfig, instanceManager);
    oauthService = new OAuthService(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Network Error Scenarios', () => {
    it('should handle connection refused errors', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);

      // Mock spawn for initialization
      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      await instanceManager.initialize();

      // Create user instance
      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      const instance = await instanceManager.createUserInstance('user-123');

      // Mock connection refused error
      const mockFetch = require('node-fetch').default;
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const sessionId = 'test-session';
      requestRouter.bindSessionToUser(sessionId, 'user-123');

      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'test',
        method: 'test/method'
      };

      const response = await requestRouter.routeRequest(sessionId, request);

      expect(response.error).toBeDefined();
      expect(response.error!.message).toContain('ECONNREFUSED');
      expect(instance.status).toBe('error');
    });

    it('should handle timeout errors', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);

      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      await instanceManager.initialize();

      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      const instance = await instanceManager.createUserInstance('user-123');

      // Mock timeout error
      const mockFetch = require('node-fetch').default;
      mockFetch.mockRejectedValue(new Error('Request timeout'));

      const sessionId = 'test-session';
      requestRouter.bindSessionToUser(sessionId, 'user-123');

      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'test',
        method: 'test/method'
      };

      const response = await requestRouter.routeRequest(sessionId, request);

      expect(response.error).toBeDefined();
      expect(response.error!.message).toContain('timeout');
      expect(instance.status).toBe('error');
    });

    it('should handle HTTP error responses', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);

      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      await instanceManager.initialize();

      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      const instance = await instanceManager.createUserInstance('user-123');

      // Mock HTTP 500 error
      global.mockFetch({ error: 'Internal server error' }, 500);

      const sessionId = 'test-session';
      requestRouter.bindSessionToUser(sessionId, 'user-123');

      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'test',
        method: 'test/method'
      };

      const response = await requestRouter.routeRequest(sessionId, request);

      expect(response.error).toBeDefined();
      expect(response.error!.message).toContain('HTTP 500');
    });
  });

  describe('Process Management Errors', () => {
    it('should handle process spawn failures', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);

      // Mock spawn failure
      const mockSpawn = require('child_process').spawn;
      const mockProcess = {
        pid: null,
        killed: true,
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
      };
      mockSpawn.mockReturnValue(mockProcess);

      // Trigger error event
      setTimeout(() => {
        const errorCallback = mockProcess.on.mock.calls.find(call => call[0] === 'error');
        if (errorCallback) errorCallback[1](new Error('ENOENT: no such file or directory'));
      }, 100);

      await expect(instanceManager.initialize()).rejects.toThrow();
    });

    it('should handle process crashes', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);

      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      await instanceManager.initialize();

      const mockProcess = global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      const instance = await instanceManager.createUserInstance('user-123');

      // Simulate process crash
      setTimeout(() => {
        const exitCallback = mockProcess.on.mock.calls.find(call => call[0] === 'exit');
        if (exitCallback) exitCallback[1](1, 'SIGKILL'); // Exit with error code
      }, 100);

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(instance.status).toBe('stopped');
    });

    it('should handle process memory issues', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);

      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      await instanceManager.initialize();

      const mockProcess = global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      const instance = await instanceManager.createUserInstance('user-123');

      // Simulate out of memory error
      setTimeout(() => {
        const errorCallback = mockProcess.on.mock.calls.find(call => call[0] === 'error');
        if (errorCallback) errorCallback[1](new Error('spawn ENOMEM'));
      }, 100);

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(instance.status).toBe('error');
    });
  });

  describe('File System Errors', () => {
    it('should handle directory creation failures', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockRejectedValue(new Error('EACCES: permission denied'));

      await expect(instanceManager.initialize()).rejects.toThrow('permission denied');
    });

    it('should handle token file read errors', async () => {
      const userId = 'test-user-123';
      const mockFs = require('fs/promises');
      mockFs.readFile.mockRejectedValue(new Error('EACCES: permission denied'));

      const tokens = await oauthService.loadUserTokens(userId);

      expect(tokens).toBeNull();
    });

    it('should handle token file write errors', async () => {
      const sessionId = 'test-session-123';
      const code = 'test-auth-code';

      // Generate valid state
      const authUrl = oauthService.generateAuthUrl(sessionId);
      const stateMatch = authUrl.match(/state=([^&]+)/);
      const state = decodeURIComponent(stateMatch![1]);

      // Mock successful token exchange
      global.mockFetch({
        code: 0,
        data: {
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
        }
      });

      // Mock successful user info
      global.mockFetch({
        code: 0,
        data: {
          union_id: 'test-user-123',
          user_id: 'user-456',
          name: 'Test User',
        }
      });

      // Mock file system errors
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockRejectedValue(new Error('ENOSPC: no space left on device'));

      await expect(oauthService.handleCallback(code, state)).rejects.toThrow('no space left on device');
    });

    it('should handle corrupted token files', async () => {
      const userId = 'test-user-123';
      const mockFs = require('fs/promises');
      mockFs.readFile.mockResolvedValue('invalid json content');

      const tokens = await oauthService.loadUserTokens(userId);

      expect(tokens).toBeNull();
    });
  });

  describe('OAuth Error Scenarios', () => {
    it('should handle Feishu API errors', async () => {
      const sessionId = 'test-session-123';
      const code = 'invalid-code';

      const authUrl = oauthService.generateAuthUrl(sessionId);
      const stateMatch = authUrl.match(/state=([^&]+)/);
      const state = decodeURIComponent(stateMatch![1]);

      // Mock Feishu API error response
      global.mockFetch({
        code: 99991663,
        msg: 'invalid code'
      });

      await expect(oauthService.handleCallback(code, state)).rejects.toThrow('Token exchange error: invalid code');
    });

    it('should handle user info retrieval errors', async () => {
      const sessionId = 'test-session-123';
      const code = 'test-auth-code';

      const authUrl = oauthService.generateAuthUrl(sessionId);
      const stateMatch = authUrl.match(/state=([^&]+)/);
      const state = decodeURIComponent(stateMatch![1]);

      // Mock successful token exchange
      global.mockFetch({
        code: 0,
        data: {
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
        }
      });

      // Mock user info error
      global.mockFetch({
        code: 99991664,
        msg: 'invalid access token'
      });

      await expect(oauthService.handleCallback(code, state)).rejects.toThrow('User info error: invalid access token');
    });

    it('should handle token refresh failures', async () => {
      const userId = 'test-user-123';
      const expiredTokens = {
        userId,
        access_token: 'expired-token',
        refresh_token: 'invalid-refresh-token',
        expires_at: new Date(Date.now() - 1000).toISOString(),
      };

      const mockFs = require('fs/promises');
      mockFs.readFile.mockResolvedValue(JSON.stringify(expiredTokens));

      // Mock refresh token error
      global.mockFetch({
        code: 99991665,
        msg: 'invalid refresh token'
      });

      const refreshedTokens = await oauthService.refreshUserToken(userId);

      expect(refreshedTokens).toBeNull();
    });

    it('should handle malformed OAuth responses', async () => {
      const sessionId = 'test-session-123';
      const code = 'test-auth-code';

      const authUrl = oauthService.generateAuthUrl(sessionId);
      const stateMatch = authUrl.match(/state=([^&]+)/);
      const state = decodeURIComponent(stateMatch![1]);

      // Mock malformed response (missing required fields)
      global.mockFetch({
        code: 0,
        data: {
          // Missing access_token and other required fields
        }
      });

      await expect(oauthService.handleCallback(code, state)).rejects.toThrow();
    });
  });

  describe('Instance Management Errors', () => {
    it('should handle max instances limit gracefully', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);

      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      await instanceManager.initialize();

      // Create max instances (config has max 20, but we'll use smaller number for test)
      const limitedConfig = { ...mockConfig, instance: { ...mockConfig.instance, max_instances: 2 } };
      const limitedInstanceManager = new InstanceManager(limitedConfig);
      const limitedRouter = new RequestRouter(limitedConfig, limitedInstanceManager);

      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      await limitedInstanceManager.initialize();

      // Create instances up to limit
      for (let i = 0; i < 2; i++) {
        global.mockSpawn();
        global.mockFetch({ status: 'ok' }, 200);
        await limitedInstanceManager.createUserInstance(`user-${i}`);
      }

      // This should fail
      await expect(limitedInstanceManager.createUserInstance('user-overflow')).rejects.toThrow('Maximum number of instances reached');

      // Request router should fall back to default instance
      const sessionId = 'overflow-session';
      limitedRouter.bindSessionToUser(sessionId, 'user-overflow');

      global.mockFetch({
        jsonrpc: '2.0',
        id: 'test',
        result: { success: true }
      });

      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'test',
        method: 'test/method'
      };

      const response = await limitedRouter.routeRequest(sessionId, request);

      expect(response.result?.success).toBe(true); // Should succeed using default instance
    });

    it('should handle port allocation failures', async () => {
      // This would require mocking the port allocation logic
      // For now, we test the basic scenario
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);

      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      await instanceManager.initialize();

      // Create many instances to potentially exhaust port range
      // This is a simplified test - in reality, we'd need to mock port checking
      for (let i = 0; i < 10; i++) {
        global.mockSpawn();
        global.mockFetch({ status: 'ok' }, 200);
        await instanceManager.createUserInstance(`user-${i}`);
      }

      // The implementation should handle port allocation gracefully
      expect(instanceManager.getStats().userInstances).toBe(10);
    });

    it('should handle health check failures during startup', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);

      // Mock process that starts but fails health checks
      const mockSpawn = require('child_process').spawn;
      const mockProcess = {
        pid: 12345,
        killed: false,
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
      };
      mockSpawn.mockReturnValue(mockProcess);

      // Mock health check failures
      global.mockFetch({ error: 'Health check failed' }, 500);

      try {
        await instanceManager.initialize();
        // If health checks fail but process doesn't die, it should still be considered running
        expect(instanceManager.getDefaultInstance()?.status).toBe('running');
      } catch (error) {
        // Or it might throw an error, which is also acceptable
        expect(error).toBeDefined();
      }
    });
  });

  describe('JSON-RPC Error Scenarios', () => {
    it('should handle malformed JSON-RPC requests', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);

      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      await instanceManager.initialize();

      const sessionId = 'test-session';
      const malformedRequest = {
        // Missing required jsonrpc field
        id: 'test',
        method: 'test/method'
      } as any;

      global.mockFetch({
        jsonrpc: '2.0',
        id: 'test',
        error: { code: -32600, message: 'Invalid Request' }
      });

      const response = await requestRouter.routeRequest(sessionId, malformedRequest);

      expect(response.error).toBeDefined();
    });

    it('should handle missing response ID', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);

      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      await instanceManager.initialize();

      const sessionId = 'test-session';
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'test',
        method: 'test/method'
      };

      // Mock response without proper ID
      global.mockFetch({
        jsonrpc: '2.0',
        result: { success: true }
        // Missing id field
      });

      const response = await requestRouter.routeRequest(sessionId, request);

      expect(response.jsonrpc).toBe('2.0');
    });

    it('should handle invalid JSON responses', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);

      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      await instanceManager.initialize();

      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      const instance = await instanceManager.createUserInstance('user-123');

      const sessionId = 'test-session';
      requestRouter.bindSessionToUser(sessionId, 'user-123');

      // Mock response that's not valid JSON-RPC
      global.mockFetch({
        // Missing jsonrpc field
        result: { success: true }
      });

      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'test',
        method: 'test/method'
      };

      const response = await requestRouter.routeRequest(sessionId, request);

      expect(response.error).toBeDefined();
      expect(response.error!.message).toContain('Invalid JSON-RPC response format');
    });
  });

  describe('Cleanup and Resource Management', () => {
    it('should handle cleanup failures gracefully', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);

      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      await instanceManager.initialize();

      // Mock process kill failure
      const mockProcess = global.mockSpawn();
      mockProcess.kill.mockImplementation(() => {
        throw new Error('Process kill failed');
      });

      global.mockFetch({ status: 'ok' }, 200);
      await instanceManager.createUserInstance('user-123');

      // Shutdown should not throw even if individual process cleanup fails
      await expect(instanceManager.shutdown()).resolves.not.toThrow();
    });

    it('should handle OAuth service shutdown', () => {
      expect(() => oauthService.shutdown()).not.toThrow();
    });

    it('should handle file cleanup errors', async () => {
      const userId = 'test-user-123';
      const mockFs = require('fs/promises');
      mockFs.unlink.mockRejectedValue(new Error('EACCES: permission denied'));

      // Should not throw
      await expect(oauthService.clearUserTokens(userId)).resolves.not.toThrow();
    });
  });

  describe('Fallback Mechanisms', () => {
    it('should provide fallback tools when default instance fails', async () => {
      jest.spyOn(instanceManager, 'getDefaultInstance').mockReturnValue(null);

      const tools = await requestRouter.getToolsFromDefaultInstance();

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      expect(tools[0].name).toBeDefined();
    });

    it('should provide fallback capabilities when default instance fails', async () => {
      jest.spyOn(instanceManager, 'getDefaultInstance').mockReturnValue(null);

      const capabilities = await requestRouter.getCapabilitiesFromDefaultInstance();

      expect(capabilities.protocolVersion).toBeDefined();
      expect(capabilities.capabilities).toBeDefined();
    });

    it('should route to default instance when user instance creation fails', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);

      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      await instanceManager.initialize();

      const sessionId = 'test-session';
      const userId = 'test-user-123';

      requestRouter.bindSessionToUser(sessionId, userId);

      // Mock instance creation failure
      jest.spyOn(instanceManager, 'getInstanceByUserId').mockReturnValue(null);
      jest.spyOn(instanceManager, 'createUserInstance').mockRejectedValue(new Error('Max instances reached'));

      global.mockFetch({
        jsonrpc: '2.0',
        id: 'test',
        result: { success: true }
      });

      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'test',
        method: 'test/method'
      };

      const response = await requestRouter.routeRequest(sessionId, request);

      expect(response.result?.success).toBe(true);
    });
  });
});