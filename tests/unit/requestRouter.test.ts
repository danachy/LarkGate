import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { RequestRouter } from '../../src/services/requestRouter.js';
import { InstanceManager } from '../../src/services/instanceManager.js';
import type { Config, MCPRequest } from '../../src/types/index.js';

describe('RequestRouter', () => {
  let requestRouter: RequestRouter;
  let instanceManager: InstanceManager;
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

    instanceManager = new InstanceManager(mockConfig);
    requestRouter = new RequestRouter(mockConfig, instanceManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('session management', () => {
    it('should bind session to user', () => {
      const sessionId = 'test-session-123';
      const userId = 'test-user-456';
      
      requestRouter.bindSessionToUser(sessionId, userId);
      
      const retrievedUserId = requestRouter.getUserIdBySession(sessionId);
      expect(retrievedUserId).toBe(userId);
    });

    it('should return null for non-existent session', () => {
      const userId = requestRouter.getUserIdBySession('non-existent-session');
      expect(userId).toBeNull();
    });

    it('should check if session is authenticated', () => {
      const sessionId = 'test-session-123';
      const userId = 'test-user-456';
      
      expect(requestRouter.isSessionAuthenticated(sessionId)).toBe(false);
      
      requestRouter.bindSessionToUser(sessionId, userId);
      expect(requestRouter.isSessionAuthenticated(sessionId)).toBe(true);
    });

    it('should remove session', () => {
      const sessionId = 'test-session-123';
      const userId = 'test-user-456';
      
      requestRouter.bindSessionToUser(sessionId, userId);
      expect(requestRouter.isSessionAuthenticated(sessionId)).toBe(true);
      
      requestRouter.removeSession(sessionId);
      expect(requestRouter.isSessionAuthenticated(sessionId)).toBe(false);
    });
  });

  describe('request routing', () => {
    beforeEach(async () => {
      await instanceManager.initialize();
    });

    it('should route request to default instance for unauthenticated user', async () => {
      const sessionId = 'unauthenticated-session';
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'test-1',
        method: 'tools/list'
      };

      const response = await requestRouter.routeRequest(sessionId, request);
      
      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe('test-1');
      expect(response.result).toBeDefined();
    });

    it('should route request to user instance for authenticated user', async () => {
      const sessionId = 'authenticated-session';
      const userId = 'test-user-123';
      
      // Bind session to user
      requestRouter.bindSessionToUser(sessionId, userId);
      
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'test-2',
        method: 'tools/list'
      };

      const response = await requestRouter.routeRequest(sessionId, request);
      
      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe('test-2');
      expect(response.result).toBeDefined();
    });

    it('should handle initialize method correctly', async () => {
      const sessionId = 'test-session';
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'init-1',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      };

      const response = await requestRouter.routeRequest(sessionId, request);
      
      expect(response.result?.protocolVersion).toBe('2024-11-05');
      expect(response.result?.serverInfo?.name).toBe('lark-mcp');
    });
  });

  describe('tools management', () => {
    beforeEach(async () => {
      await instanceManager.initialize();
    });

    it('should get tools from default instance', async () => {
      const tools = await requestRouter.getToolsFromDefaultInstance();
      
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      expect(tools[0]).toHaveProperty('name');
      expect(tools[0]).toHaveProperty('description');
    });

    it('should get capabilities from default instance', async () => {
      const capabilities = await requestRouter.getCapabilitiesFromDefaultInstance();
      
      expect(capabilities).toHaveProperty('protocolVersion');
      expect(capabilities).toHaveProperty('capabilities');
      expect(capabilities).toHaveProperty('serverInfo');
    });
  });

  describe('health check', () => {
    beforeEach(async () => {
      await instanceManager.initialize();
    });

    it('should return health status', async () => {
      const health = await requestRouter.healthCheck();
      
      expect(health).toHaveProperty('defaultInstance');
      expect(health).toHaveProperty('userInstances');
      expect(health).toHaveProperty('sessions');
      expect(typeof health.defaultInstance).toBe('boolean');
      expect(typeof health.userInstances).toBe('number');
      expect(typeof health.sessions).toBe('number');
    });
  });

  describe('session stats', () => {
    it('should return session statistics', () => {
      const sessionId1 = 'session-1';
      const sessionId2 = 'session-2';
      const userId1 = 'user-1';
      const userId2 = 'user-2';
      
      requestRouter.bindSessionToUser(sessionId1, userId1);
      requestRouter.bindSessionToUser(sessionId2, userId2);
      
      const stats = requestRouter.getSessionStats();
      
      expect(stats.totalSessions).toBe(2);
      expect(stats.authenticatedSessions).toBe(2);
      expect(typeof stats.recentSessions).toBe('number');
    });
  });
});