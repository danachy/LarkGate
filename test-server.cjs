#!/usr/bin/env node

/**
 * Simple HTTP server to serve the test client
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Serve the test client
  if (req.url === '/' || req.url === '/index.html') {
    try {
      const html = fs.readFileSync(path.join(__dirname, 'test-client.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Test client not found');
    }
    return;
  }
  
  // Serve the CORS test page
  if (req.url === '/cors-test') {
    try {
      const html = fs.readFileSync(path.join(__dirname, 'test-cors.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('CORS test not found');
    }
    return;
  }
  
  // Serve the SSE debug page
  if (req.url === '/debug-sse') {
    try {
      const html = fs.readFileSync(path.join(__dirname, 'debug-sse.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Debug SSE not found');
    }
    return;
  }
  
  // Serve the final test page
  if (req.url === '/final-test') {
    try {
      const html = fs.readFileSync(path.join(__dirname, 'final-test.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Final test not found');
    }
    return;
  }
  
  // Serve the OAuth test page
  if (req.url === '/oauth-test') {
    try {
      const html = fs.readFileSync(path.join(__dirname, 'oauth-test.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('OAuth test not found');
    }
    return;
  }
  
  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      message: 'Test server is running'
    }));
    return;
  }
  
  // Default 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                            LarkGate Test Server                             ║
║                        Simple HTTP Server for Testing                       ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ Test Client: http://localhost:${PORT}                                        ║
║ Health Check: http://localhost:${PORT}/health                                ║
║                                                                              ║
║ Usage:                                                                       ║
║ 1. Make sure LarkGate is running on http://localhost:3000                   ║
║ 2. Open http://localhost:${PORT} in your browser                             ║
║ 3. Test the Claude-like interface with LarkGate                             ║
╚══════════════════════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Test server stopped');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Test server stopped');
    process.exit(0);
  });
});