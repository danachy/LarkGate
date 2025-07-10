import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { RequestRouter } from '../../src/services/requestRouter.js';
import { InstanceManager } from '../../src/services/instanceManager.js';
import type { Config, MCPRequest, MCPInstance } from '../../src/types/index.js';

// Mock dependencies
jest.mock('node-fetch');
jest.mock('fs/promises');
jest.mock('child_process');

describe('RequestRouter', () => {
  let requestRouter: RequestRouter;
  let instanceManager: InstanceManager;
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockInstance = (userId: string, port: number): MCPInstance => ({
    id: `instance-${userId}`,
    userId,
    port,
    process: {} as any,
    status: 'running',
    lastActivity: new Date(),
    createdAt: new Date(),
    tokenDir: `./test-data/user-${userId}`,
  });

  describe('Session management', () => {
    it('should bind session to user', () => {
      const sessionId = 'test-session-123';
      const userId = 'test-user-456';
      
      requestRouter.bindSessionToUser(sessionId, userId);
      
      const foundUserId = requestRouter.getUserIdBySession(sessionId);
      expect(foundUserId).toBe(userId);
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

    it('should return session stats', () => {
      const sessionId1 = 'session-1';
      const sessionId2 = 'session-2';
      
      requestRouter.bindSessionToUser(sessionId1, 'user-1');
      requestRouter.bindSessionToUser(sessionId2, 'user-2');
      
      const stats = requestRouter.getSessionStats();
      
      expect(stats.totalSessions).toBe(2);
      expect(stats.authenticatedSessions).toBe(2);
    });
  });

  describe('Request routing', () => {
    it('should route request to authenticated user instance', async () => {
      const sessionId = 'test-session-123';
      const userId = 'test-user-456';
      const mockInstance = createMockInstance(userId, 3001);
      
      // Bind session to user
      requestRouter.bindSessionToUser(sessionId, userId);
      
      // Mock instance manager methods
      jest.spyOn(instanceManager, 'getInstanceByUserId').mockReturnValue(mockInstance);
      
      // Mock successful HTTP response
      global.mockFetch({
        jsonrpc: '2.0',
        id: 'test',
        result: { success: true }
      });
      
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'test',
        method: 'test/method',
        params: {}
      };
      
      const response = await requestRouter.routeRequest(sessionId, request);
      
      expect(response.result?.success).toBe(true);
      expect(instanceManager.getInstanceByUserId).toHaveBeenCalledWith(userId);
    });

    it('should route unauthenticated request to default instance', async () => {
      const sessionId = 'unauthenticated-session';
      const mockDefaultInstance = createMockInstance('default', 4000);
      
      // Mock instance manager methods
      jest.spyOn(instanceManager, 'getDefaultInstance').mockReturnValue(mockDefaultInstance);
      
      // Mock successful HTTP response
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
      expect(instanceManager.getDefaultInstance).toHaveBeenCalled();
    });

    it('should create new instance for authenticated user without instance', async () => {
      const sessionId = 'test-session-123';
      const userId = 'test-user-456';
      const mockInstance = createMockInstance(userId, 3001);
      
      // Bind session to user
      requestRouter.bindSessionToUser(sessionId, userId);
      
      // Mock instance manager methods
      jest.spyOn(instanceManager, 'getInstanceByUserId').mockReturnValue(null);
      jest.spyOn(instanceManager, 'createUserInstance').mockResolvedValue(mockInstance);
      
      // Mock successful HTTP response
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
      expect(instanceManager.createUserInstance).toHaveBeenCalledWith(userId);
    });

    it('should handle instance creation failure', async () => {
      const sessionId = 'test-session-123';
      const userId = 'test-user-456';
      const mockDefaultInstance = createMockInstance('default', 4000);
      
      // Bind session to user
      requestRouter.bindSessionToUser(sessionId, userId);
      
      // Mock instance manager methods
      jest.spyOn(instanceManager, 'getInstanceByUserId').mockReturnValue(null);
      jest.spyOn(instanceManager, 'createUserInstance').mockRejectedValue(new Error('Max instances reached'));
      jest.spyOn(instanceManager, 'getDefaultInstance').mockReturnValue(mockDefaultInstance);
      
      // Mock successful HTTP response for fallback
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
      expect(instanceManager.getDefaultInstance).toHaveBeenCalled();
    });

    it('should handle no available instances', async () => {
      const sessionId = 'test-session-123';
      
      // Mock instance manager methods
      jest.spyOn(instanceManager, 'getDefaultInstance').mockReturnValue(null);
      
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'test',
        method: 'test/method'
      };
      
      const response = await requestRouter.routeRequest(sessionId, request);
      
      expect(response.error).toBeDefined();
      expect(response.error!.message).toBe('No available MCP instance');
    });
  });

  describe('Tools and capabilities', () => {
    it('should get tools from default instance', async () => {
      const mockDefaultInstance = createMockInstance('default', 4000);
      const mockTools = [
        { name: 'test_tool', description: 'A test tool' }
      ];
      
      jest.spyOn(instanceManager, 'getDefaultInstance').mockReturnValue(mockDefaultInstance);
      
      global.mockFetch({
        jsonrpc: '2.0',
        id: 'tools',
        result: { tools: mockTools }
      });
      
      const tools = await requestRouter.getToolsFromDefaultInstance();
      
      expect(tools).toEqual(mockTools);
    });

    it('should return fallback tools on error', async () => {
      const mockDefaultInstance = createMockInstance('default', 4000);
      
      jest.spyOn(instanceManager, 'getDefaultInstance').mockReturnValue(mockDefaultInstance);
      
      global.mockFetch({
        jsonrpc: '2.0',
        id: 'tools',
        error: { code: -1, message: 'Connection failed' }
      });
      
      const tools = await requestRouter.getToolsFromDefaultInstance();
      
      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      
      // Check for fallback tools
      const toolNames = tools.map(tool => tool.name);
      expect(toolNames).toContain('feishu_get_calendar_events');
      expect(toolNames).toContain('feishu_send_message');
    });

    it('should get capabilities from default instance', async () => {
      const mockDefaultInstance = createMockInstance('default', 4000);
      const mockCapabilities = {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {}, resources: {} }
      };
      
      jest.spyOn(instanceManager, 'getDefaultInstance').mockReturnValue(mockDefaultInstance);
      
      global.mockFetch({
        jsonrpc: '2.0',
        id: 'capabilities',
        result: mockCapabilities
      });
      
      const capabilities = await requestRouter.getCapabilitiesFromDefaultInstance();
      
      expect(capabilities).toEqual(mockCapabilities);
    });

    it('should return fallback capabilities on error', async () => {
      const mockDefaultInstance = createMockInstance('default', 4000);
      
      jest.spyOn(instanceManager, 'getDefaultInstance').mockReturnValue(mockDefaultInstance);
      
      global.mockFetch({
        jsonrpc: '2.0',
        id: 'capabilities',
        error: { code: -1, message: 'Connection failed' }
      });
      
      const capabilities = await requestRouter.getCapabilitiesFromDefaultInstance();
      
      expect(capabilities).toBeDefined();
      expect(capabilities.protocolVersion).toBe('2024-11-05');
      expect(capabilities.capabilities).toBeDefined();
    });
  });

  describe('Health checks', () => {
    it('should perform health check', async () => {
      const mockDefaultInstance = createMockInstance('default', 4000);
      
      jest.spyOn(instanceManager, 'getDefaultInstance').mockReturnValue(mockDefaultInstance);
      jest.spyOn(instanceManager, 'getStats').mockReturnValue({
        totalInstances: 1,
        userInstances: 0,
        runningInstances: 1,
        defaultInstanceStatus: 'running'
      });
      jest.spyOn(instanceManager, 'isInstanceHealthy').mockResolvedValue(true);
      
      const health = await requestRouter.healthCheck();
      
      expect(health.defaultInstance).toBe(true);
      expect(health.userInstances).toBe(1);
      expect(health.sessions).toBe(0);
      expect(health.instanceHealth).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should handle HTTP request errors', async () => {
      const sessionId = 'test-session-123';
      const userId = 'test-user-456';
      const mockInstance = createMockInstance(userId, 3001);
      
      requestRouter.bindSessionToUser(sessionId, userId);
      jest.spyOn(instanceManager, 'getInstanceByUserId').mockReturnValue(mockInstance);
      
      // Mock HTTP error
      global.mockFetch({ error: 'Connection refused' }, 500);
      
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'test',
        method: 'test/method'
      };
      
      const response = await requestRouter.routeRequest(sessionId, request);
      
      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32603);
    });

    it('should mark instance as error on connection failure', async () => {
      const sessionId = 'test-session-123';
      const userId = 'test-user-456';
      const mockInstance = createMockInstance(userId, 3001);
      
      requestRouter.bindSessionToUser(sessionId, userId);
      jest.spyOn(instanceManager, 'getInstanceByUserId').mockReturnValue(mockInstance);
      
      // Mock connection refused error
      const mockFetch = require('node-fetch').default;
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
      
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'test',
        method: 'test/method'
      };
      
      await requestRouter.routeRequest(sessionId, request);
      
      expect(mockInstance.status).toBe('error');
    });

    it('should handle invalid JSON-RPC response', async () => {
      const sessionId = 'test-session-123';
      const userId = 'test-user-456';
      const mockInstance = createMockInstance(userId, 3001);
      
      requestRouter.bindSessionToUser(sessionId, userId);
      jest.spyOn(instanceManager, 'getInstanceByUserId').mockReturnValue(mockInstance);
      
      // Mock invalid response (missing jsonrpc field)
      global.mockFetch({ result: 'invalid' });
      
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

  describe('Fallback mechanisms', () => {
    it('should provide fallback tools', () => {
      const fallbackTools = (requestRouter as any).getFallbackTools();
      
      expect(Array.isArray(fallbackTools)).toBe(true);
      expect(fallbackTools.length).toBeGreaterThan(0);
      
      const toolNames = fallbackTools.map((tool: any) => tool.name);
      expect(toolNames).toContain('feishu_get_calendar_events');
      expect(toolNames).toContain('feishu_send_message');
      expect(toolNames).toContain('feishu_create_document');
    });

    it('should provide fallback capabilities', () => {
      const fallbackCapabilities = (requestRouter as any).getFallbackCapabilities();
      
      expect(fallbackCapabilities.protocolVersion).toBe('2024-11-05');
      expect(fallbackCapabilities.capabilities).toBeDefined();
      expect(fallbackCapabilities.serverInfo.name).toBe('lark-mcp');
    });
  });
});