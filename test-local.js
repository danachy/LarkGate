#!/usr/bin/env node

// Simple local testing script for LarkGate
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';
const SESSION_ID = 'test-' + Date.now();

async function testHealth() {
  console.log('🔍 Testing health endpoint...');
  try {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();
    console.log('✅ Health check passed:', data);
    return true;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

async function testSSE() {
  console.log('🔍 Testing SSE endpoint...');
  try {
    const response = await fetch(`${BASE_URL}/sse?sessionId=${SESSION_ID}`);
    
    if (response.ok) {
      console.log('✅ SSE endpoint accessible');
      console.log('📋 Headers:', Object.fromEntries(response.headers.entries()));
      
      // Read first few chunks
      const reader = response.body.getReader();
      let chunks = 0;
      while (chunks < 3) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const text = new TextDecoder().decode(value);
        console.log(`📦 Chunk ${chunks + 1}:`, text.trim());
        chunks++;
      }
      reader.releaseLock();
      return true;
    } else {
      console.error('❌ SSE endpoint failed:', response.status, response.statusText);
      return false;
    }
  } catch (error) {
    console.error('❌ SSE test failed:', error.message);
    return false;
  }
}

async function testMCPProxy() {
  console.log('🔍 Testing MCP proxy...');
  try {
    const mcpRequest = {
      jsonrpc: '2.0',
      id: 'test-1',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'larkgate-test',
          version: '0.2.0',
        },
      },
    };

    const response = await fetch(`${BASE_URL}/messages?sessionId=${SESSION_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mcpRequest),
    });

    const data = await response.json();
    
    if (response.ok && data.result) {
      console.log('✅ MCP proxy working');
      console.log('📋 MCP capabilities:', JSON.stringify(data.result, null, 2));
      return true;
    } else {
      console.log('⚠️  MCP proxy response:', data);
      return false;
    }
  } catch (error) {
    console.error('❌ MCP proxy test failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting LarkGate local tests...\n');
  
  const healthOk = await testHealth();
  console.log('');
  
  if (!healthOk) {
    console.log('❌ Server not running. Start with: npm run dev');
    process.exit(1);
  }
  
  const sseOk = await testSSE();
  console.log('');
  
  const mcpOk = await testMCPProxy();
  console.log('');
  
  console.log('📊 Test Results:');
  console.log(`Health: ${healthOk ? '✅' : '❌'}`);
  console.log(`SSE: ${sseOk ? '✅' : '❌'}`);
  console.log(`MCP Proxy: ${mcpOk ? '✅' : '❌'}`);
  
  if (healthOk && sseOk) {
    console.log('\n🎉 Basic functionality working!');
    console.log(`🔗 OAuth test: ${BASE_URL}/oauth/start?sessionId=${SESSION_ID}`);
  } else {
    console.log('\n❌ Some tests failed. Check the logs above.');
  }
}

main().catch(console.error);