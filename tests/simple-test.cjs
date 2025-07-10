#!/usr/bin/env node

/**
 * Simple Test Script for LarkGate (without dependencies)
 * Test basic functionality without Jest
 */

const http = require('http');
const { URL } = require('url');

const BASE_URL = 'http://localhost:3000';

function log(message, color = '') {
  const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
  };
  console.log(`${colors[color] || ''}${message}${colors.reset}`);
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      ...options
    };

    const req = http.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: jsonData, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    
    req.end();
  });
}

async function testHealth() {
  log('\n🔍 Testing Health Endpoint...', 'blue');
  try {
    const response = await makeRequest(`${BASE_URL}/health`);
    if (response.status === 200 && response.data.status === 'healthy') {
      log('✅ Health check passed', 'green');
      log(`   Version: ${response.data.version}`);
      log(`   Instances: ${response.data.instances?.totalInstances || 0}`);
      return true;
    } else {
      log('❌ Health check failed', 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Health check error: ${error.message}`, 'red');
    return false;
  }
}

async function testTools() {
  log('\n🛠️ Testing Tools Endpoint...', 'blue');
  try {
    const response = await makeRequest(`${BASE_URL}/tools`);
    if (response.status === 200 && Array.isArray(response.data.tools)) {
      log(`✅ Tools endpoint working - found ${response.data.tools.length} tools`, 'green');
      response.data.tools.slice(0, 3).forEach((tool, i) => {
        log(`   ${i + 1}. ${tool.name}: ${tool.description}`);
      });
      return true;
    } else {
      log('❌ Tools endpoint failed', 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Tools error: ${error.message}`, 'red');
    return false;
  }
}

async function testSSE() {
  log('\n📡 Testing SSE Endpoint...', 'blue');
  try {
    const response = await makeRequest(`${BASE_URL}/sse`);
    if (response.status === 200 && response.data.type === 'metadata') {
      log('✅ SSE endpoint working', 'green');
      log(`   Session ID: ${response.data.data.session_id}`);
      log(`   Authenticated: ${response.data.data.authenticated}`);
      log(`   Tools available: ${response.data.data.tools?.length || 0}`);
      return { success: true, sessionId: response.data.data.session_id };
    } else {
      log('❌ SSE endpoint failed', 'red');
      return { success: false };
    }
  } catch (error) {
    log(`❌ SSE error: ${error.message}`, 'red');
    return { success: false };
  }
}

async function testMessages(sessionId) {
  log('\n🔌 Testing Messages Endpoint...', 'blue');
  try {
    const request = {
      jsonrpc: '2.0',
      id: 'test-1',
      method: 'tools/list'
    };

    const response = await makeRequest(`${BASE_URL}/messages?sessionId=${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });

    if (response.status === 200 && response.data.jsonrpc === '2.0') {
      log('✅ Messages endpoint working', 'green');
      log(`   Request ID: ${response.data.id}`);
      log(`   Has result: ${!!response.data.result}`);
      return true;
    } else {
      log('❌ Messages endpoint failed', 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Messages error: ${error.message}`, 'red');
    return false;
  }
}

async function main() {
  log('🚀 LarkGate Simple Test Suite', 'blue');
  log('='.repeat(40));

  // Check if server is running
  try {
    await makeRequest(`${BASE_URL}/health`);
  } catch (error) {
    log('❌ Server is not running!', 'red');
    log('Please start with: npm run dev', 'yellow');
    process.exit(1);
  }

  const tests = [];
  
  // Run tests
  tests.push({ name: 'Health', result: await testHealth() });
  tests.push({ name: 'Tools', result: await testTools() });
  
  const sseResult = await testSSE();
  tests.push({ name: 'SSE', result: sseResult.success });
  
  if (sseResult.success) {
    tests.push({ name: 'Messages', result: await testMessages(sseResult.sessionId) });
  }

  // Summary
  log('\n📊 Test Results:', 'blue');
  log('='.repeat(40));
  
  const passed = tests.filter(t => t.result).length;
  const total = tests.length;
  
  tests.forEach(test => {
    const status = test.result ? '✅' : '❌';
    const color = test.result ? 'green' : 'red';
    log(`${status} ${test.name}`, color);
  });
  
  log(`\n🎯 Result: ${passed}/${total} tests passed`, passed === total ? 'green' : 'red');
  
  if (passed === total) {
    log('🎉 All basic tests passed!', 'green');
    process.exit(0);
  } else {
    log('⚠️ Some tests failed', 'yellow');
    process.exit(1);
  }
}

main().catch(error => {
  log(`Test error: ${error.message}`, 'red');
  process.exit(1);
});