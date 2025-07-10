#!/usr/bin/env node

/**
 * Mock lark-mcp server for local testing
 * This simulates the behavior of the real lark-mcp binary
 */

const http = require('http');
const url = require('url');

// Parse command line arguments
const args = process.argv.slice(2);
let port = 4000;
let mode = 'sse';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    port = parseInt(args[i + 1]);
    i++;
  } else if (args[i] === '--mode' && args[i + 1]) {
    mode = args[i + 1];
    i++;
  }
}

console.log(`🎭 Mock lark-mcp starting on port ${port} in ${mode} mode`);

// Mock tools data
const mockTools = [
  {
    name: 'feishu_get_calendar_events',
    description: 'Get calendar events from Feishu',
    inputSchema: {
      type: 'object',
      properties: {
        start_time: { type: 'string', description: 'Start time in ISO format' },
        end_time: { type: 'string', description: 'End time in ISO format' }
      },
      required: ['start_time', 'end_time']
    }
  },
  {
    name: 'feishu_send_message',
    description: 'Send message to Feishu chat',
    inputSchema: {
      type: 'object',
      properties: {
        chat_id: { type: 'string', description: 'Chat ID or user ID' },
        message: { type: 'string', description: 'Message content' }
      },
      required: ['chat_id', 'message']
    }
  },
  {
    name: 'feishu_create_document',
    description: 'Create a new document in Feishu',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Document title' },
        content: { type: 'string', description: 'Document content' }
      },
      required: ['title']
    }
  }
];

// Create HTTP server
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Health check endpoint
  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      port: port,
      mode: mode,
      timestamp: new Date().toISOString() 
    }));
    return;
  }
  
  // SSE endpoint for tools/capabilities
  if (path === '/sse') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    res.write(`data: ${JSON.stringify({
      type: 'tools',
      tools: mockTools
    })}\n\n`);
    
    res.write(`data: ${JSON.stringify({
      type: 'capabilities',
      capabilities: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: { listChanged: true },
          resources: { listChanged: true }
        },
        serverInfo: {
          name: 'mock-lark-mcp',
          version: '0.1.0'
        }
      }
    })}\n\n`);
    
    // Keep connection alive
    const keepAlive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 30000);
    
    req.on('close', () => {
      clearInterval(keepAlive);
    });
    
    return;
  }
  
  // JSON-RPC messages endpoint
  if (path === '/messages' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const request = JSON.parse(body);
        let response;
        
        if (request.method === 'tools/list') {
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: { tools: mockTools }
          };
        } else if (request.method === 'initialize') {
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: { listChanged: true },
                resources: { listChanged: true }
              },
              serverInfo: {
                name: 'mock-lark-mcp',
                version: '0.1.0'
              }
            }
          };
        } else if (request.method === 'tools/call') {
          // Mock tool execution
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Mock response for ${request.params?.name || 'unknown tool'}`
                }
              ]
            }
          };
        } else {
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: { 
              success: true, 
              method: request.method,
              message: 'Mock response from mock-lark-mcp'
            }
          };
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error',
            data: error.message
          }
        }));
      }
    });
    
    return;
  }
  
  // Default 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Start server
server.listen(port, () => {
  console.log(`✅ Mock lark-mcp server running on http://localhost:${port}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   - GET  /health    - Health check`);
  console.log(`   - GET  /sse       - Server-Sent Events`);
  console.log(`   - POST /messages  - JSON-RPC messages`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Mock server stopped');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Mock server stopped');
    process.exit(0);
  });
});