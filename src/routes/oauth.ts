import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { OAuthService } from '../services/oauthService.js';
import type { TokenStorage } from '../services/tokenStorage.js';

interface OAuthStartQuery {
  sessionId?: string;
}

interface OAuthCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
}

export async function oauthRoutes(
  fastify: FastifyInstance,
  { oauthService, tokenStorage }: { oauthService: OAuthService; tokenStorage: TokenStorage }
) {
  // Start OAuth flow
  fastify.get<{ Querystring: OAuthStartQuery }>('/oauth/start', async (request, reply) => {
    const { sessionId } = request.query;
    
    if (!sessionId) {
      return reply.code(400).send({ error: 'sessionId parameter is required' });
    }

    try {
      const authUrl = oauthService.generateAuthUrl(sessionId);
      return reply.redirect(authUrl);
    } catch (error) {
      console.error('OAuth start error:', error);
      return reply.code(500).send({ error: 'Failed to start OAuth flow' });
    }
  });

  // Handle OAuth callback
  fastify.get<{ Querystring: OAuthCallbackQuery }>('/oauth/callback', async (request, reply) => {
    const { code, state, error } = request.query;
    
    if (error) {
      return reply.code(400).type('text/html').send(`
        <html>
          <head><title>LarkGate - Authorization Failed</title></head>
          <body>
            <h1>Authorization Failed</h1>
            <p>Error: ${error}</p>
            <p>Please close this window and try again.</p>
          </body>
        </html>
      `);
    }
    
    if (!code || !state) {
      return reply.code(400).type('text/html').send(`
        <html>
          <head><title>LarkGate - Invalid Request</title></head>
          <body>
            <h1>Invalid Request</h1>
            <p>Missing required parameters.</p>
            <p>Please close this window and try again.</p>
          </body>
        </html>
      `);
    }

    try {
      const { sessionId, tokenData, unionId } = await oauthService.handleCallback(code, state);
      
      // Store the token
      tokenStorage.setSessionToken(sessionId, unionId, tokenData);
      
      console.log(`OAuth successful for session ${sessionId}, union_id: ${unionId}`);
      
      return reply.type('text/html').send(`
        <html>
          <head><title>LarkGate - Authorization Successful</title></head>
          <body>
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center;">
              <h1 style="color: #00b96b;">✅ Authorization Successful</h1>
              <p>You have successfully authorized LarkGate to access your Feishu account.</p>
              <p>You can now close this window and return to Claude/Cherry Studio.</p>
              <hr style="margin: 30px 0;">
              <p style="color: #666; font-size: 14px;">
                Session ID: <code>${sessionId}</code><br>
                Token expires in: ${Math.floor(tokenData.expires_in / 60)} minutes
              </p>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('OAuth callback error:', error);
      return reply.code(500).type('text/html').send(`
        <html>
          <head><title>LarkGate - Authorization Error</title></head>
          <body>
            <h1>Authorization Error</h1>
            <p>An error occurred during authorization: ${error instanceof Error ? error.message : 'Unknown error'}</p>
            <p>Please close this window and try again.</p>
          </body>
        </html>
      `);
    }
  });
}