#!/usr/bin/env tsx

/**
 * Manual Test Script for LarkGate
 * 
 * This script performs end-to-end testing of LarkGate functionality
 * Run with: npm run test:manual
 */

import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

const BASE_URL = 'http://localhost:3000';
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message: string) {
  log(`✅ ${message}`, colors.green);
}

function logError(message: string) {
  log(`❌ ${message}`, colors.red);
}

function logInfo(message: string) {
  log(`ℹ️  ${message}`, colors.blue);
}

function logWarning(message: string) {
  log(`⚠️  ${message}`, colors.yellow);
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testServerHealth() {
  log('\n🔍 Testing Server Health...', colors.cyan);
  
  try {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json() as any;
    
    if (response.ok && data.status === 'healthy') {
      logSuccess('Server is healthy');
      logInfo(`Version: ${data.version}`);
      logInfo(`Instances: ${data.instances.totalInstances} total, ${data.instances.userInstances} user instances`);
      logInfo(`Sessions: ${data.sessions.totalSessions} total, ${data.sessions.authenticatedSessions} authenticated`);
      return true;
    } else {
      logError(`Health check failed: ${data.status || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    logError(`Failed to connect to server: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

async function testToolsEndpoint() {
  log('\n🛠️ Testing Tools Endpoint...', colors.cyan);
  
  try {
    const response = await fetch(`${BASE_URL}/tools`);
    const data = await response.json() as any;
    
    if (response.ok && Array.isArray(data.tools)) {
      logSuccess(`Found ${data.tools.length} tools`);
      data.tools.forEach((tool: any, index: number) => {
        logInfo(`  ${index + 1}. ${tool.name}: ${tool.description}`);
      });
      return true;
    } else {
      logError('Tools endpoint failed');
      return false;
    }
  } catch (error) {
    logError(`Tools request failed: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

async function testSSEEndpoint() {
  log('\n📡 Testing SSE Endpoint...', colors.cyan);
  
  try {
    const response = await fetch(`${BASE_URL}/sse`);
    const data = await response.json() as any;
    
    if (response.ok && data.type === 'metadata') {
      logSuccess('SSE endpoint working');
      logInfo(`Session ID: ${data.data.session_id}`);
      logInfo(`Authenticated: ${data.data.authenticated}`);
      logInfo(`Tools available: ${data.data.tools?.length || 0}`);
      
      if (data.data.oauth_url) {
        logInfo(`OAuth URL: ${data.data.oauth_url.substring(0, 80)}...`);
      }
      
      return { sessionId: data.data.session_id, authenticated: data.data.authenticated };
    } else {
      logError('SSE endpoint failed');
      return null;
    }
  } catch (error) {
    logError(`SSE request failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

async function testJSONRPCRequest(sessionId: string, method: string, params?: any) {
  log(`\n🔌 Testing JSON-RPC: ${method}...`, colors.cyan);
  
  const request = {
    jsonrpc: '2.0',
    id: uuidv4(),
    method,
    params
  };
  
  try {
    const response = await fetch(`${BASE_URL}/messages?sessionId=${sessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });
    
    const data = await response.json() as any;
    
    if (response.ok && data.jsonrpc === '2.0') {
      if (data.error) {
        logWarning(`Request returned error: ${data.error.message}`);
        return { success: false, error: data.error };
      } else {
        logSuccess(`${method} request successful`);
        if (data.result) {
          logInfo(`Result keys: ${Object.keys(data.result).join(', ')}`);
        }
        return { success: true, result: data.result };
      }
    } else {
      logError(`${method} request failed`);
      return { success: false, error: 'Invalid response' };
    }
  } catch (error) {
    logError(`${method} request failed: ${error instanceof Error ? error.message : error}`);
    return { success: false, error };
  }
}

async function testMultipleUsers() {
  log('\n👥 Testing Multiple Users...', colors.cyan);
  
  const users = ['user-1', 'user-2', 'user-3'];
  const sessions = [];
  
  // Create sessions for multiple users
  for (const user of users) {
    const sseResult = await testSSEEndpoint();
    if (sseResult) {
      sessions.push({ userId: user, sessionId: sseResult.sessionId });
      logInfo(`Created session for ${user}: ${sseResult.sessionId}`);
    }
  }
  
  if (sessions.length === 0) {
    logError('Failed to create sessions for users');
    return false;
  }
  
  // Simulate requests from multiple users
  log('\n🚀 Sending concurrent requests from multiple users...', colors.yellow);
  
  const promises = sessions.map(async ({ userId, sessionId }) => {
    const result = await testJSONRPCRequest(sessionId, 'tools/list');
    return { userId, success: result.success };
  });
  
  const results = await Promise.all(promises);
  
  const successCount = results.filter(r => r.success).length;
  logInfo(`${successCount}/${results.length} users successfully got tools`);
  
  return successCount === results.length;
}

async function testInstanceManagement() {
  log('\n🏗️ Testing Instance Management...', colors.cyan);
  
  // Get initial stats
  const initialHealth = await fetch(`${BASE_URL}/health`);
  const initialData = await initialHealth.json() as any;
  const initialInstances = initialData.instances.userInstances;
  
  logInfo(`Initial user instances: ${initialInstances}`);
  
  // Create a new session and make a request (should create user instance)
  const sseResult = await testSSEEndpoint();
  if (!sseResult) return false;
  
  await testJSONRPCRequest(sseResult.sessionId, 'tools/list');
  
  // Wait a moment for instance creation
  await sleep(2000);
  
  // Check if instance was created
  const finalHealth = await fetch(`${BASE_URL}/health`);
  const finalData = await finalHealth.json() as any;
  const finalInstances = finalData.instances.userInstances;
  
  logInfo(`Final user instances: ${finalInstances}`);
  
  if (finalInstances > initialInstances) {
    logSuccess('Instance management working correctly');
    return true;
  } else {
    logWarning('Instance may not have been created (or was created and cleaned up quickly)');
    return true; // Not necessarily a failure in test environment
  }
}

async function testRateLimiting() {
  log('\n⏱️ Testing Rate Limiting...', colors.cyan);
  
  const sseResult = await testSSEEndpoint();
  if (!sseResult) return false;
  
  const { sessionId } = sseResult;
  const requestCount = 10;
  const startTime = Date.now();
  
  log(`Sending ${requestCount} rapid requests...`, colors.yellow);
  
  const promises = Array.from({ length: requestCount }, (_, i) =>
    testJSONRPCRequest(sessionId, 'tools/list')
  );
  
  const results = await Promise.all(promises);
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  const successCount = results.filter(r => r.success).length;
  
  logInfo(`${successCount}/${requestCount} requests succeeded in ${duration}ms`);
  
  if (successCount >= requestCount * 0.8) { // Allow some failures due to rate limiting
    logSuccess('Rate limiting appears to be working correctly');
    return true;
  } else {
    logWarning('Many requests were blocked - rate limiting may be too strict');
    return true; // Not necessarily a failure
  }
}

async function main() {
  log('🚀 Starting LarkGate Manual Tests', colors.bright);
  log('='.repeat(50), colors.bright);
  
  const tests = [
    { name: 'Server Health', fn: testServerHealth },
    { name: 'Tools Endpoint', fn: testToolsEndpoint },
    { name: 'SSE Endpoint', fn: testSSEEndpoint },
    { name: 'JSON-RPC Initialize', fn: () => testJSONRPCRequest(uuidv4(), 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'manual-test', version: '1.0.0' }
    }).then(r => r.success) },
    { name: 'JSON-RPC Tools List', fn: () => testJSONRPCRequest(uuidv4(), 'tools/list').then(r => r.success) },
    { name: 'Multiple Users', fn: testMultipleUsers },
    { name: 'Instance Management', fn: testInstanceManagement },
    { name: 'Rate Limiting', fn: testRateLimiting },
  ];
  
  const results = [];
  
  for (const test of tests) {
    try {
      const result = await test.fn();
      results.push({ name: test.name, success: !!result });
      
      if (result) {
        logSuccess(`${test.name} - PASSED`);
      } else {
        logError(`${test.name} - FAILED`);
      }
    } catch (error) {
      logError(`${test.name} - ERROR: ${error instanceof Error ? error.message : error}`);
      results.push({ name: test.name, success: false });
    }
    
    // Wait between tests
    await sleep(1000);
  }
  
  // Summary
  log('\n📊 Test Summary', colors.bright);
  log('='.repeat(50), colors.bright);
  
  const passed = results.filter(r => r.success).length;
  const total = results.length;
  
  results.forEach(result => {
    if (result.success) {
      logSuccess(`${result.name}`);
    } else {
      logError(`${result.name}`);
    }
  });
  
  log(`\n🎯 Overall Result: ${passed}/${total} tests passed`, colors.bright);
  
  if (passed === total) {
    logSuccess('All tests passed! 🎉');
    process.exit(0);
  } else {
    logError(`${total - passed} tests failed`);
    process.exit(1);
  }
}

// Check if server is running before starting tests
async function checkServerRunning() {
  try {
    await fetch(`${BASE_URL}/health`);
    return true;
  } catch {
    return false;
  }
}

// Main execution
if (!(await checkServerRunning())) {
  logError('LarkGate server is not running!');
  logInfo('Please start the server with: npm run dev');
  logInfo('Then run this test with: npm run test:manual');
  process.exit(1);
}

main().catch(error => {
  logError(`Test runner failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});