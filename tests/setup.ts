import { jest } from '@jest/globals';

// Mock node-fetch for all tests
jest.mock('node-fetch', () => ({
  default: jest.fn(),
}));

// Mock child_process for all tests
jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

// Mock fs/promises for all tests
jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
  unlink: jest.fn(),
}));

// Setup global test environment
process.env.NODE_ENV = 'test';
process.env.FEISHU_APP_ID = 'test-app-id';
process.env.FEISHU_APP_SECRET = 'test-app-secret';
process.env.FEISHU_REDIRECT_URI = 'http://localhost:3000/oauth/callback';
process.env.DATA_DIR = './test-data';
process.env.LARK_MCP_BINARY = 'mock-lark-mcp';

// Global test utilities
global.mockFetch = (response: any, status = 200) => {
  const mockFetch = require('node-fetch').default;
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => response,
    text: async () => JSON.stringify(response),
    headers: new Map([['content-type', 'application/json']]),
  });
};

global.mockSpawn = (exitCode = 0) => {
  const mockSpawn = require('child_process').spawn;
  const mockProcess = {
    pid: 12345,
    killed: false,
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn(),
    kill: jest.fn(),
  };
  
  mockSpawn.mockReturnValueOnce(mockProcess);
  
  // Simulate process events
  setTimeout(() => {
    const onCallback = mockProcess.on.mock.calls.find(call => call[0] === 'spawn');
    if (onCallback) onCallback[1]();
  }, 100);
  
  return mockProcess;
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});