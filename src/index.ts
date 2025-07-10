import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { InstanceManager } from './services/instanceManager.js';
import { RequestRouter } from './services/requestRouter.js';
import { OAuthService } from './services/oauthService.js';
import type { Config, MCPRequest, SSEMetadata } from './types/index.js';

const VERSION = '0.2.0';
const STARTUP_BANNER = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                                  LarkGate                                   ║
║                     Multi-user Feishu OpenAPI Gateway                       ║
║                                v${VERSION}                                 ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ Architecture: PM2 + Node Router (Docker-free for MCP compatibility)        ║
║ Features: Multi-user isolation, OAuth 2.0, Auto token refresh              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`;

// Load configuration with enhanced validation
function loadConfig(): Config {
  const config: Config = {
    port: parseInt(process.env.PORT || '3000'),
    host: process.env.HOST || '0.0.0.0',
    feishu: {
      app_id: process.env.FEISHU_APP_ID || '',
      app_secret: process.env.FEISHU_APP_SECRET || '',
      redirect_uri: process.env.FEISHU_REDIRECT_URI || 'http://localhost:3000/oauth/callback',
    },
    lark_mcp: {
      binary_path: process.env.LARK_MCP_BINARY || 'lark-openapi-mcp',
      base_port: parseInt(process.env.LARK_MCP_BASE_PORT || '3001'),
      default_instance_port: parseInt(process.env.LARK_MCP_DEFAULT_PORT || '4000'),
    },
    rate_limit: {
      per_session: parseInt(process.env.RATE_LIMIT_PER_SESSION || '50'),
      per_ip: parseInt(process.env.RATE_LIMIT_PER_IP || '200'),
      window_ms: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
    },
    storage: {
      data_dir: process.env.DATA_DIR || './data',
      snapshot_interval_ms: parseInt(process.env.SNAPSHOT_INTERVAL_MS || '600000'),
      token_ttl_ms: parseInt(process.env.TOKEN_TTL_MS || '2592000000'), // 30 days
    },
    instance: {
      max_instances: parseInt(process.env.MAX_INSTANCES || '20'),
      idle_timeout_ms: parseInt(process.env.IDLE_TIMEOUT_MS || '1800000'), // 30 minutes
      memory_limit_mb: parseInt(process.env.MEMORY_LIMIT_MB || '256'),
    },
  };

  // Validate port ranges
  if (config.lark_mcp.base_port <= config.port || config.lark_mcp.default_instance_port <= config.port) {
    throw new Error('MCP instance ports must be different from gateway port');
  }

  return config;
}

const config = loadConfig();

// Validate required config
function validateConfig(config: Config): void {
  const errors: string[] = [];

  if (!config.feishu.app_id) {
    errors.push('FEISHU_APP_ID is required');
  }

  if (!config.feishu.app_secret) {
    errors.push('FEISHU_APP_SECRET is required');
  }

  if (!config.feishu.redirect_uri.startsWith('http')) {
    errors.push('FEISHU_REDIRECT_URI must be a valid URL');
  }

  if (errors.length > 0) {
    console.error('❌ Configuration validation failed:');
    errors.forEach(error => console.error(`   - ${error}`));
    console.error('\nPlease check your environment variables and try again.');
    process.exit(1);
  }
}

validateConfig(config);

async function start() {
  console.log(STARTUP_BANNER);
  console.log('🔧 Configuration:');
  console.log(`   - Gateway: ${config.host}:${config.port}`);
  console.log(`   - Default MCP instance: :${config.lark_mcp.default_instance_port}`);
  console.log(`   - User instances: ${config.lark_mcp.base_port}+`);
  console.log(`   - Max instances: ${config.instance.max_instances}`);
  console.log(`   - Data directory: ${config.storage.data_dir}`);
  console.log(`   - Feishu App ID: ${config.feishu.app_id}`);
  console.log('');

  // Create Fastify instance
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // Initialize services
  const instanceManager = new InstanceManager(config);
  const requestRouter = new RequestRouter(config, instanceManager);
  const oauthService = new OAuthService(config);

  // Initialize instance manager
  await instanceManager.initialize();

  // Register plugins
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // Rate limiting
  await fastify.register(rateLimit, {
    max: config.rate_limit.per_ip,
    timeWindow: config.rate_limit.window_ms,
    keyGenerator: (request) => {
      const query = request.query as { sessionId?: string };
      const sessionId = query?.sessionId;
      return sessionId || request.ip;
    },
    skipOnError: true,
  });

  // SSE endpoint
  fastify.get('/sse', async (request, reply) => {
    const query = request.query as { sessionId?: string };
    let sessionId = query.sessionId;
    
    if (!sessionId) {
      sessionId = uuidv4();
    }

    // Set SSE headers
    reply.type('text/event-stream');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Connection', 'keep-alive');
    reply.header('Access-Control-Allow-Origin', '*');

    try {
      // Get tools from default instance
      const tools = await requestRouter.getToolsFromDefaultInstance();
      const capabilities = await requestRouter.getCapabilitiesFromDefaultInstance();
      
      // Check if user is authenticated
      const isAuthenticated = requestRouter.isSessionAuthenticated(sessionId);
      
      const metadata: SSEMetadata = {
        endpoint: `${request.protocol}://${request.hostname}:${config.port}/messages?sessionId=${sessionId}`,
        session_id: sessionId,
        authenticated: isAuthenticated,
        tools,
      };

      if (!isAuthenticated) {
        metadata.oauth_url = oauthService.generateAuthUrl(sessionId);
      }

      // Send initial metadata
      reply.raw.write(`data: ${JSON.stringify({
        type: 'metadata',
        data: metadata
      })}\n\n`);

      // Send capabilities
      reply.raw.write(`data: ${JSON.stringify({
        type: 'capabilities',
        data: capabilities
      })}\n\n`);

      // Keep connection alive
      const keepAlive = setInterval(() => {
        reply.raw.write(': keepalive\n\n');
      }, 30000);

      request.raw.on('close', () => {
        clearInterval(keepAlive);
      });

    } catch (error) {
      console.error('SSE error:', error);
      reply.raw.write(`data: ${JSON.stringify({
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      })}\n\n`);
      reply.raw.end();
    }
  });

  // Messages endpoint (JSON-RPC)
  fastify.post('/messages', async (request, reply) => {
    const query = request.query as { sessionId?: string };
    const sessionId = query.sessionId;
    
    if (!sessionId) {
      return reply.status(400).send({ error: 'sessionId is required' });
    }

    try {
      const mcpRequest = request.body as MCPRequest;
      const response = await requestRouter.routeRequest(sessionId, mcpRequest);
      return response;
    } catch (error) {
      console.error('Message routing error:', error);
      return {
        jsonrpc: '2.0',
        id: (request.body as MCPRequest)?.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error'
        }
      };
    }
  });

  // Tools endpoint
  fastify.get('/tools', async (request, reply) => {
    try {
      const tools = await requestRouter.getToolsFromDefaultInstance();
      return { tools };
    } catch (error) {
      console.error('Tools endpoint error:', error);
      return reply.status(500).send({ 
        error: error instanceof Error ? error.message : 'Failed to get tools' 
      });
    }
  });

  // OAuth start
  fastify.get('/oauth/start', async (request, reply) => {
    const query = request.query as { sessionId?: string };
    const sessionId = query.sessionId;
    
    if (!sessionId) {
      return reply.status(400).send({ error: 'sessionId is required' });
    }

    try {
      const authUrl = oauthService.generateAuthUrl(sessionId);
      return reply.redirect(authUrl);
    } catch (error) {
      console.error('OAuth start error:', error);
      return reply.status(500).send({ 
        error: error instanceof Error ? error.message : 'OAuth start failed' 
      });
    }
  });

  // OAuth callback
  fastify.get('/oauth/callback', async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string };
    
    if (query.error) {
      return reply.status(400).send(`
        <html>
          <body>
            <h2>❌ Authorization Failed</h2>
            <p>Error: ${query.error}</p>
            <p>Please close this window and try again.</p>
          </body>
        </html>
      `);
    }

    if (!query.code || !query.state) {
      return reply.status(400).send(`
        <html>
          <body>
            <h2>❌ Invalid Request</h2>
            <p>Missing authorization code or state parameter.</p>
          </body>
        </html>
      `);
    }

    try {
      const { sessionId, userId } = await oauthService.handleCallback(query.code, query.state);
      
      // Bind session to user
      requestRouter.bindSessionToUser(sessionId, userId);
      
      return reply.type('text/html').send(`
        <html>
          <body>
            <h2>✅ Authorization Successful</h2>
            <p>Your Feishu account has been successfully connected!</p>
            <p>Session ID: <code>${sessionId}</code></p>
            <p>You can now close this window and return to Claude.</p>
            <script>
              // Auto-close after 3 seconds
              setTimeout(() => window.close(), 3000);
            </script>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('OAuth callback error:', error);
      return reply.status(500).send(`
        <html>
          <body>
            <h2>❌ Authorization Error</h2>
            <p>Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
            <p>Please close this window and try again.</p>
          </body>
        </html>
      `);
    }
  });

  // Health check
  fastify.get('/health', async (request, reply) => {
    try {
      const health = await requestRouter.healthCheck();
      const instanceStats = instanceManager.getStats();
      const sessionStats = requestRouter.getSessionStats();
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: VERSION,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        instances: instanceStats,
        sessions: sessionStats,
        health,
        architecture: 'PM2 + Node Router',
        docker_free: true,
      };
    } catch (error) {
      return reply.status(503).send({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('🛑 Shutting down gracefully...');
    await instanceManager.shutdown();
    await fastify.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start server
  try {
    await fastify.listen({ 
      port: config.port, 
      host: config.host 
    });
    
    console.log('✅ LarkGate Gateway started successfully!');
    console.log('');
    console.log('🌐 Endpoints:');
    console.log(`   - Gateway: http://${config.host}:${config.port}`);
    console.log(`   - Health check: http://${config.host}:${config.port}/health`);
    console.log(`   - Tools list: http://${config.host}:${config.port}/tools`);
    console.log(`   - OAuth callback: ${config.feishu.redirect_uri}`);
    console.log('');
    console.log('📊 Instance Status:');
    const stats = instanceManager.getStats();
    console.log(`   - Total instances: ${stats.totalInstances}`);
    console.log(`   - Running instances: ${stats.runningInstances}`);
    console.log(`   - Default instance: ${stats.defaultInstanceStatus}`);
    console.log('');
    console.log('🎯 Ready to handle requests!');
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();