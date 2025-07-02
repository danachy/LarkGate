import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { TokenStorage } from './services/tokenStorage.js';
import { OAuthService } from './services/oauthService.js';
import { MCPProxy } from './services/mcpProxy.js';
import { oauthRoutes } from './routes/oauth.js';
import { sseRoutes } from './routes/sse.js';
import { messageRoutes } from './routes/messages.js';
import type { Config } from './types/index.js';

// Load configuration
const config: Config = {
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  feishu: {
    app_id: process.env.FEISHU_APP_ID || '',
    app_secret: process.env.FEISHU_APP_SECRET || '',
    redirect_uri: process.env.FEISHU_REDIRECT_URI || 'http://localhost:3000/oauth/callback',
  },
  mcp: {
    host: process.env.MCP_HOST || 'localhost',
    port: parseInt(process.env.MCP_PORT || '3001'),
  },
  rate_limit: {
    per_session: parseInt(process.env.RATE_LIMIT_PER_SESSION || '50'),
    per_ip: parseInt(process.env.RATE_LIMIT_PER_IP || '200'),
    window_ms: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  },
  storage: {
    snapshot_interval_ms: parseInt(process.env.SNAPSHOT_INTERVAL_MS || '600000'),
    token_ttl_ms: parseInt(process.env.TOKEN_TTL_MS || '2592000000'), // 30 days
  },
};

// Validate required config
if (!config.feishu.app_id || !config.feishu.app_secret) {
  console.error('Missing required Feishu configuration: FEISHU_APP_ID and FEISHU_APP_SECRET must be set');
  process.exit(1);
}

async function start() {
  // Create Fastify instance
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // Initialize services
  const tokenStorage = new TokenStorage(
    1000, // max sessions
    config.storage.token_ttl_ms,
    config.storage.snapshot_interval_ms
  );

  const oauthService = new OAuthService(config);
  const mcpProxy = new MCPProxy(config);

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
      // Use sessionId for session-based limiting, fall back to IP
      const query = request.query as { sessionId?: string };
      const sessionId = query?.sessionId;
      return sessionId || request.ip;
    },
    skipOnError: true,
  });

  // Custom rate limiting for session-based endpoints
  fastify.addHook('preHandler', async (request, reply) => {
    const query = request.query as { sessionId?: string };
    const sessionId = query?.sessionId;
    if (sessionId && request.url.includes('/messages')) {
      // Implement custom session-based rate limiting here if needed
      // For now, rely on the global rate limiter
    }
  });

  // Register routes
  await fastify.register(oauthRoutes, { oauthService, tokenStorage });
  await fastify.register(sseRoutes, { tokenStorage, config });
  await fastify.register(messageRoutes, { tokenStorage, oauthService, mcpProxy });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down gracefully...');
    tokenStorage.shutdown();
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
    
    console.log(`🚀 LarkGate started on ${config.host}:${config.port}`);
    console.log(`📋 Health check: http://${config.host}:${config.port}/health`);
    console.log(`🔗 OAuth callback: ${config.feishu.redirect_uri}`);
    console.log(`🎯 MCP target: ${config.mcp.host}:${config.mcp.port}`);
    
    // Test MCP connection
    try {
      const capabilities = await mcpProxy.getCapabilities();
      if (capabilities) {
        console.log('✅ MCP server connection successful');
      } else {
        console.warn('⚠️  MCP server connection failed - check if lark-openapi-mcp is running');
      }
    } catch (error) {
      console.warn('⚠️  Could not connect to MCP server:', error instanceof Error ? error.message : error);
    }
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();