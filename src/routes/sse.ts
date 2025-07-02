import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes } from 'crypto';
import type { TokenStorage } from '../services/tokenStorage.js';
import type { Config, SSEMetadata } from '../types/index.js';

interface SSEQuery {
  sessionId?: string;
}

export async function sseRoutes(
  fastify: FastifyInstance,
  { tokenStorage, config }: { tokenStorage: TokenStorage; config: Config }
) {
  // SSE endpoint
  fastify.get<{ Querystring: SSEQuery }>('/sse', async (request, reply) => {
    let { sessionId } = request.query;
    
    // Generate sessionId if not provided
    if (!sessionId) {
      sessionId = randomBytes(16).toString('hex');
    }

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Create or get session
    let session = tokenStorage.getSession(sessionId);
    if (!session) {
      session = tokenStorage.createSession(sessionId);
    }

    const isAuthenticated = !!session.tokenData;
    
    // Prepare metadata
    const metadata: SSEMetadata = {
      endpoint: `${request.protocol}://${request.hostname}:${config.port}/messages?sessionId=${sessionId}`,
      session_id: sessionId,
      authenticated: isAuthenticated,
    };

    // Add OAuth URL if not authenticated
    if (!isAuthenticated) {
      metadata.oauth_url = `${request.protocol}://${request.hostname}:${config.port}/oauth/start?sessionId=${sessionId}`;
    }

    // Send initial metadata
    const sendEvent = (event: string, data: any) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent('metadata', metadata);
    
    // Send periodic heartbeat to keep connection alive
    const heartbeatInterval = setInterval(() => {
      try {
        sendEvent('heartbeat', { timestamp: Date.now() });
      } catch (error) {
        clearInterval(heartbeatInterval);
      }
    }, 30000); // 30 seconds

    // Handle client disconnect
    request.raw.on('close', () => {
      clearInterval(heartbeatInterval);
      console.log(`SSE connection closed for session ${sessionId}`);
    });

    request.raw.on('error', (error) => {
      clearInterval(heartbeatInterval);
      console.error(`SSE connection error for session ${sessionId}:`, error);
    });

    // Keep the connection open
    return reply;
  });

  // Health check endpoint
  fastify.get('/health', async (request, reply) => {
    const stats = tokenStorage.getStats();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      sessions: stats.sessions,
      tokens: stats.tokens,
    };
  });
}