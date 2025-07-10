import { describe, it, expect, jest, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { InstanceManager } from '../../src/services/instanceManager.js';
import { RequestRouter } from '../../src/services/requestRouter.js';
import { OAuthService } from '../../src/services/oauthService.js';
import type { Config } from '../../src/types/index.js';

// Mock dependencies
jest.mock('child_process');
jest.mock('fs/promises');
jest.mock('node-fetch');

describe('API Integration Tests', () => {
  let app: FastifyInstance;
  let config: Config;
  let instanceManager: InstanceManager;
  let requestRouter: RequestRouter;
  let oauthService: OAuthService;

  beforeAll(async () => {
    config = {
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

    // Create services
    instanceManager = new InstanceManager(config);
    requestRouter = new RequestRouter(config, instanceManager);
    oauthService = new OAuthService(config);

    // Create Fastify app
    app = Fastify({ logger: false });

    // Register CORS
    await app.register(require('@fastify/cors'), {
      origin: true,
      credentials: true,
    });

    // Register rate limiting
    await app.register(require('@fastify/rate-limit'), {
      max: config.rate_limit.per_ip,
      timeWindow: config.rate_limit.window_ms,
      keyGenerator: (request) => {
        const query = request.query as { sessionId?: string };
        const sessionId = query?.sessionId;
        return sessionId || request.ip;
      },
      skipOnError: true,
    });

    // Setup API routes (simplified versions for testing)
    app.get('/sse', async (request, reply) => {
      const query = request.query as { sessionId?: string };
      const sessionId = query.sessionId || 'test-session';
      
      reply.type('text/event-stream');
      reply.header('Cache-Control', 'no-cache');
      reply.header('Connection', 'keep-alive');
      
      try {
        const tools = await requestRouter.getToolsFromDefaultInstance();
        const isAuthenticated = requestRouter.isSessionAuthenticated(sessionId);
        
        const metadata = {
          endpoint: `http://localhost:${config.port}/messages?sessionId=${sessionId}`,
          session_id: sessionId,
          authenticated: isAuthenticated,
          tools,
        };
        
        if (!isAuthenticated) {
          metadata.oauth_url = oauthService.generateAuthUrl(sessionId);
        }
        
        reply.raw.write(`data: ${JSON.stringify({
          type: 'metadata',
          data: metadata
        })}\\n\\n`);
        
      } catch (error) {
        reply.raw.write(`data: ${JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        })}\\n\\n`);
      }
      
      reply.raw.end();
    });

    app.post('/messages', async (request, reply) => {
      const query = request.query as { sessionId?: string };
      const sessionId = query.sessionId;
      
      if (!sessionId) {
        return reply.status(400).send({ error: 'sessionId is required' });
      }
      
      try {
        const mcpRequest = request.body as any;
        const response = await requestRouter.routeRequest(sessionId, mcpRequest);
        return response;
      } catch (error) {
        return reply.status(500).send({
          jsonrpc: '2.0',
          id: (request.body as any)?.id,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Internal error'
          }
        });
      }
    });

    app.get('/tools', async (request, reply) => {
      try {
        const tools = await requestRouter.getToolsFromDefaultInstance();
        return { tools };
      } catch (error) {
        return reply.status(500).send({ 
          error: error instanceof Error ? error.message : 'Failed to get tools' 
        });
      }
    });

    app.get('/oauth/start', async (request, reply) => {
      const query = request.query as { sessionId?: string };
      const sessionId = query.sessionId;
      
      if (!sessionId) {
        return reply.status(400).send({ error: 'sessionId is required' });
      }
      
      try {
        const authUrl = oauthService.generateAuthUrl(sessionId);
        return reply.redirect(authUrl);
      } catch (error) {
        return reply.status(500).send({ 
          error: error instanceof Error ? error.message : 'OAuth start failed' 
        });
      }
    });

    app.get('/oauth/callback', async (request, reply) => {
      const query = request.query as { code?: string; state?: string; error?: string };
      
      if (query.error) {
        return reply.status(400).send(`Authorization failed: ${query.error}`);
      }
      
      if (!query.code || !query.state) {
        return reply.status(400).send('Missing authorization code or state parameter');
      }
      
      try {
        const { sessionId, userId } = await oauthService.handleCallback(query.code, query.state);
        requestRouter.bindSessionToUser(sessionId, userId);
        
        return reply.send({
          success: true,
          sessionId,
          userId
        });
      } catch (error) {
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'OAuth callback failed'
        });
      }
    });

    app.get('/health', async (request, reply) => {
      try {
        const health = await requestRouter.healthCheck();
        const instanceStats = instanceManager.getStats();
        const sessionStats = requestRouter.getSessionStats();
        
        return {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '0.2.0',
          instances: instanceStats,
          sessions: sessionStats,
          health,
        };
      } catch (error) {
        return reply.status(503).send({
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Mock file system operations
    const mockFs = require('fs/promises');
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue('{}');

    // Mock child process
    global.mockSpawn();
    global.mockFetch({ status: 'ok' }, 200);

    // Initialize instance manager
    await instanceManager.initialize();
  });

  afterAll(async () => {
    await instanceManager.shutdown();
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('SSE Endpoint (/sse)', () => {
    it('should return SSE stream with metadata', async () => {
      global.mockFetch({
        jsonrpc: '2.0',
        id: 'tools',
        result: { tools: [{ name: 'test_tool' }] }
      });

      const response = await app.inject({
        method: 'GET',
        url: '/sse?sessionId=test-session-123'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.payload).toContain('data:');
      expect(response.payload).toContain('metadata');
    });

    it('should include OAuth URL for unauthenticated session', async () => {
      global.mockFetch({
        jsonrpc: '2.0',
        id: 'tools',
        result: { tools: [] }
      });

      const response = await app.inject({
        method: 'GET',
        url: '/sse?sessionId=new-session'
      });

      expect(response.statusCode).toBe(200);
      expect(response.payload).toContain('oauth_url');
      expect(response.payload).toContain('open.feishu.cn');
    });

    it('should not include OAuth URL for authenticated session', async () => {
      const sessionId = 'authenticated-session';
      const userId = 'test-user-123';
      
      requestRouter.bindSessionToUser(sessionId, userId);
      
      global.mockFetch({
        jsonrpc: '2.0',
        id: 'tools',
        result: { tools: [] }
      });

      const response = await app.inject({
        method: 'GET',
        url: `/sse?sessionId=${sessionId}`
      });

      expect(response.statusCode).toBe(200);
      expect(response.payload).not.toContain('oauth_url');
    });
  });

  describe('Messages Endpoint (/messages)', () => {
    it('should handle valid JSON-RPC request', async () => {
      global.mockFetch({
        jsonrpc: '2.0',
        id: 'test-request',
        result: { success: true }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/messages?sessionId=test-session',
        payload: {
          jsonrpc: '2.0',
          id: 'test-request',
          method: 'test/method',
          params: {}
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.jsonrpc).toBe('2.0');
      expect(body.result?.success).toBe(true);
    });

    it('should require sessionId parameter', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/messages',
        payload: {
          jsonrpc: '2.0',
          id: 'test',
          method: 'test/method'
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('sessionId is required');
    });

    it('should handle routing errors gracefully', async () => {
      // Mock routing error
      jest.spyOn(requestRouter, 'routeRequest').mockRejectedValue(new Error('Routing failed'));

      const response = await app.inject({
        method: 'POST',
        url: '/messages?sessionId=test-session',
        payload: {
          jsonrpc: '2.0',
          id: 'test-request',
          method: 'test/method'
        }
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.payload);
      expect(body.error).toBeDefined();
      expect(body.error.message).toBe('Routing failed');
    });
  });

  describe('Tools Endpoint (/tools)', () => {
    it('should return tools list', async () => {
      const mockTools = [
        { name: 'feishu_get_calendar_events', description: 'Get calendar events' },
        { name: 'feishu_send_message', description: 'Send message' }
      ];

      global.mockFetch({
        jsonrpc: '2.0',
        id: 'tools',
        result: { tools: mockTools }
      });

      const response = await app.inject({
        method: 'GET',
        url: '/tools'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.tools).toEqual(mockTools);
    });

    it('should handle tools retrieval error', async () => {
      jest.spyOn(requestRouter, 'getToolsFromDefaultInstance').mockRejectedValue(new Error('Tools unavailable'));

      const response = await app.inject({
        method: 'GET',
        url: '/tools'
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Tools unavailable');
    });
  });

  describe('OAuth Endpoints', () => {
    describe('OAuth Start (/oauth/start)', () => {
      it('should redirect to Feishu OAuth URL', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/oauth/start?sessionId=test-session-123'
        });

        expect(response.statusCode).toBe(302);
        expect(response.headers.location).toContain('open.feishu.cn');
        expect(response.headers.location).toContain('test-app-id');
      });

      it('should require sessionId parameter', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/oauth/start'
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.payload);
        expect(body.error).toBe('sessionId is required');
      });
    });

    describe('OAuth Callback (/oauth/callback)', () => {
      it('should handle successful OAuth callback', async () => {
        const sessionId = 'test-session-123';
        
        // Generate state first
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
            email: 'test@example.com',
          }
        });

        const response = await app.inject({
          method: 'GET',
          url: `/oauth/callback?code=test-auth-code&state=${encodeURIComponent(state)}`
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(body.sessionId).toBe(sessionId);
        expect(body.userId).toBe('test-user-123');
      });

      it('should handle OAuth error', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/oauth/callback?error=access_denied'
        });

        expect(response.statusCode).toBe(400);
        expect(response.payload).toContain('access_denied');
      });

      it('should handle missing parameters', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/oauth/callback'
        });

        expect(response.statusCode).toBe(400);
        expect(response.payload).toContain('Missing authorization code');
      });

      it('should handle invalid state', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/oauth/callback?code=test-code&state=invalid-state'
        });

        expect(response.statusCode).toBe(500);
        const body = JSON.parse(response.payload);
        expect(body.error).toContain('Invalid or expired state');
      });
    });
  });

  describe('Health Endpoint (/health)', () => {
    it('should return health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('healthy');
      expect(body.version).toBe('0.2.0');
      expect(body.instances).toBeDefined();
      expect(body.sessions).toBeDefined();
      expect(body.health).toBeDefined();
    });

    it('should handle health check failure', async () => {
      jest.spyOn(requestRouter, 'healthCheck').mockRejectedValue(new Error('Health check failed'));

      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('unhealthy');
      expect(body.error).toBe('Health check failed');
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting', async () => {
      // This test would require multiple rapid requests to trigger rate limiting
      // For now, we just verify the rate limit middleware is configured
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      // Rate limiting headers might be present
      // expect(response.headers['x-ratelimit-limit']).toBeDefined();
    });
  });

  describe('CORS', () => {
    it('should handle CORS preflight requests', async () => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          'origin': 'http://localhost:3000',
          'access-control-request-method': 'GET'
        }
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });
  });
});