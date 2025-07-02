import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { TokenStorage } from '../services/tokenStorage.js';
import type { OAuthService } from '../services/oauthService.js';
import type { MCPProxy } from '../services/mcpProxy.js';
import type { MCPRequest, MCPResponse } from '../types/index.js';

interface MessageQuery {
  sessionId: string;
}

interface MessageBody extends MCPRequest {}

export async function messageRoutes(
  fastify: FastifyInstance,
  { 
    tokenStorage, 
    oauthService, 
    mcpProxy 
  }: { 
    tokenStorage: TokenStorage; 
    oauthService: OAuthService; 
    mcpProxy: MCPProxy;
  }
) {
  // Message proxy endpoint
  fastify.post<{ 
    Querystring: MessageQuery, 
    Body: MessageBody 
  }>('/messages', async (request, reply) => {
    const { sessionId } = request.query;
    const mcpRequest = request.body;

    if (!sessionId) {
      return reply.code(400).send({
        jsonrpc: mcpRequest.jsonrpc || '2.0',
        id: mcpRequest.id || null,
        error: {
          code: -32602,
          message: 'sessionId parameter is required',
        },
      } as MCPResponse);
    }

    // Validate JSON-RPC request
    if (!mcpRequest.jsonrpc || !mcpRequest.method) {
      return reply.code(400).send({
        jsonrpc: '2.0',
        id: mcpRequest.id || null,
        error: {
          code: -32600,
          message: 'Invalid JSON-RPC request',
        },
      } as MCPResponse);
    }

    try {
      // Get session and token data
      const session = tokenStorage.getSession(sessionId);
      let tokenData = session?.tokenData;

      // If we have token data, ensure it's still valid
      if (tokenData) {
        try {
          tokenData = await oauthService.ensureValidToken(tokenData);
          
          // Update token if it was refreshed
          if (session.unionId && tokenData !== session.tokenData) {
            tokenStorage.setSessionToken(sessionId, session.unionId, tokenData);
          }
        } catch (error) {
          console.warn(`Failed to refresh token for session ${sessionId}:`, error);
          // Continue without token - some MCP methods might work without auth
          tokenData = undefined;
        }
      }

      // Log request (with sensitive data masked)
      const maskedRequest = await mcpProxy.maskSensitiveData(mcpRequest);
      console.log(`MCP Request [${sessionId}]:`, JSON.stringify(maskedRequest));

      // Proxy request to MCP server
      const response = await mcpProxy.proxyRequest(mcpRequest, tokenData);
      
      // Log response status
      if (response.error) {
        console.warn(`MCP Error [${sessionId}]:`, response.error);
      } else {
        console.log(`MCP Success [${sessionId}]: ${mcpRequest.method}`);
      }

      return response;
    } catch (error) {
      console.error(`Message proxy error for session ${sessionId}:`, error);
      
      return {
        jsonrpc: mcpRequest.jsonrpc,
        id: mcpRequest.id,
        error: {
          code: -32603,
          message: `Internal error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      } as MCPResponse;
    }
  });

  // Manual token endpoint (for debugging/fallback)
  fastify.post<{
    Querystring: MessageQuery,
    Body: { access_token: string }
  }>('/manual-token', async (request, reply) => {
    const { sessionId } = request.query;
    const { access_token } = request.body;

    if (!sessionId || !access_token) {
      return reply.code(400).send({ 
        error: 'sessionId and access_token are required' 
      });
    }

    try {
      // Create manual token data (no refresh token, 2 hour expiry)
      const tokenData = {
        access_token,
        expires_in: 7200, // 2 hours
        token_type: 'Bearer',
        created_at: Date.now(),
      };

      // Use access_token as pseudo union_id for manual mode
      const pseudoUnionId = `manual_${access_token.slice(-8)}`;
      tokenStorage.setSessionToken(sessionId, pseudoUnionId, tokenData);

      console.log(`Manual token set for session ${sessionId}`);
      
      return { 
        success: true, 
        expires_in: tokenData.expires_in,
        message: 'Token set successfully'
      };
    } catch (error) {
      console.error(`Manual token error for session ${sessionId}:`, error);
      return reply.code(500).send({ 
        error: 'Failed to set manual token' 
      });
    }
  });
}