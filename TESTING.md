# LarkGate Testing Guide

This document provides comprehensive testing guidance for the LarkGate project.

## 🧪 Test Structure

### Test Organization
```
tests/
├── setup.ts                     # Global test setup and mocks
├── services/                    # Unit tests for services
│   ├── instanceManager.test.ts  # Instance management tests
│   ├── oauthService.test.ts     # OAuth service tests
│   └── requestRouter.test.ts    # Request routing tests
├── integration/                 # Integration tests
│   └── api.test.ts             # API endpoint tests
├── config.test.ts              # Configuration validation tests
└── errorHandling.test.ts       # Error scenario tests
```

### Test Categories

1. **Unit Tests** - Test individual components in isolation
2. **Integration Tests** - Test API endpoints and service interactions
3. **Configuration Tests** - Validate configuration parsing and validation
4. **Error Handling Tests** - Test error scenarios and recovery mechanisms

## 🚀 Running Tests

### Prerequisites
```bash
# Install dependencies
npm install

# Install test dependencies (if not already included)
npm install --save-dev jest @types/jest ts-jest
```

### Basic Test Commands
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- instanceManager.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="OAuth"
```

### Test Scripts in package.json
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --watchAll=false",
    "test:unit": "jest tests/services/",
    "test:integration": "jest tests/integration/",
    "test:config": "jest tests/config.test.ts",
    "test:errors": "jest tests/errorHandling.test.ts"
  }
}
```

## 📋 Test Coverage

### Current Coverage Areas

#### ✅ Instance Manager Service
- ✅ Instance creation and lifecycle management
- ✅ Port allocation and management
- ✅ Health checking and monitoring
- ✅ HTTP request forwarding
- ✅ Process management (spawn, kill, cleanup)
- ✅ Error handling and recovery

#### ✅ OAuth Service
- ✅ OAuth URL generation
- ✅ Authorization code flow
- ✅ Token management (save, load, refresh)
- ✅ User information retrieval
- ✅ Error handling for API failures
- ✅ Token validation and caching

#### ✅ Request Router
- ✅ Session management
- ✅ Request routing logic
- ✅ User instance resolution
- ✅ Fallback mechanisms
- ✅ Health checking
- ✅ Error propagation

#### ✅ API Endpoints
- ✅ SSE endpoint (/sse)
- ✅ Messages endpoint (/messages)
- ✅ Tools endpoint (/tools)
- ✅ OAuth endpoints (/oauth/start, /oauth/callback)
- ✅ Health endpoint (/health)
- ✅ CORS and rate limiting

#### ✅ Configuration
- ✅ Environment variable parsing
- ✅ Configuration validation
- ✅ Default value handling
- ✅ Production/development configurations

#### ✅ Error Handling
- ✅ Network errors (connection refused, timeouts)
- ✅ Process management errors
- ✅ File system errors
- ✅ OAuth API errors
- ✅ JSON-RPC protocol errors
- ✅ Resource cleanup failures

### Coverage Goals
- **Unit Tests**: >90% line coverage
- **Integration Tests**: All API endpoints covered
- **Error Scenarios**: Critical error paths tested
- **Configuration**: All configuration options validated

## 🔧 Mock Strategy

### Global Mocks (setup.ts)
- `node-fetch`: HTTP requests
- `child_process`: Process spawning
- `fs/promises`: File system operations

### Helper Functions
```typescript
// Mock successful HTTP response
global.mockFetch(responseData, statusCode);

// Mock process spawn
global.mockSpawn(exitCode);
```

### Mock Patterns
```typescript
// Mock successful API response
global.mockFetch({
  jsonrpc: '2.0',
  id: 'test',
  result: { success: true }
});

// Mock error response
global.mockFetch({
  jsonrpc: '2.0',
  id: 'test',
  error: { code: -32603, message: 'Internal error' }
}, 500);

// Mock process spawn
const mockProcess = global.mockSpawn();
expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
```

## 🧩 Test Scenarios

### Typical Test Flow
1. **Setup**: Configure environment and mocks
2. **Execute**: Call the function under test
3. **Verify**: Assert expected behavior
4. **Cleanup**: Reset mocks and state

### Example Test Structure
```typescript
describe('FeatureName', () => {
  beforeEach(() => {
    // Setup mocks and test data
  });

  afterEach(() => {
    // Clean up mocks
    jest.clearAllMocks();
  });

  describe('happy path scenarios', () => {
    it('should handle normal case', async () => {
      // Arrange
      const input = 'test-input';
      global.mockFetch({ result: 'success' });

      // Act
      const result = await serviceMethod(input);

      // Assert
      expect(result).toBe('success');
    });
  });

  describe('error scenarios', () => {
    it('should handle network errors', async () => {
      // Arrange
      const mockFetch = require('node-fetch').default;
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Act & Assert
      await expect(serviceMethod('input')).rejects.toThrow('Network error');
    });
  });
});
```

## 🐛 Debugging Tests

### Debug Commands
```bash
# Run tests with debug output
DEBUG=* npm test

# Run single test with detailed output
npm test -- --verbose instanceManager.test.ts

# Run tests and keep them running for debugging
npm test -- --runInBand --detectOpenHandles
```

### Common Issues

#### Mock Not Working
```typescript
// Ensure mocks are in setup.ts or at top of test file
jest.mock('node-fetch', () => ({
  default: jest.fn(),
}));
```

#### Async Test Issues
```typescript
// Always await async operations
await expect(asyncFunction()).rejects.toThrow();

// Use proper async test setup
beforeEach(async () => {
  await setupAsyncMocks();
});
```

#### File System Mock Issues
```typescript
// Reset file system mocks between tests
beforeEach(() => {
  const mockFs = require('fs/promises');
  mockFs.mkdir.mockResolvedValue(undefined);
  mockFs.writeFile.mockResolvedValue(undefined);
});
```

## 📊 Test Reports

### Coverage Report
```bash
# Generate HTML coverage report
npm run test:coverage

# View coverage report
open coverage/lcov-report/index.html
```

### CI/CD Integration
```yaml
# GitHub Actions example
- name: Run tests
  run: npm run test:ci

- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage/lcov.info
```

## 🎯 Testing Best Practices

### Writing Good Tests
1. **Clear Test Names**: Describe what the test does
2. **Arrange-Act-Assert**: Structure tests clearly
3. **One Assertion Per Test**: Keep tests focused
4. **Mock External Dependencies**: Isolate units under test
5. **Test Error Cases**: Don't just test happy paths

### Mock Best Practices
1. **Reset Mocks**: Clear mocks between tests
2. **Verify Mock Calls**: Assert that mocks were called correctly
3. **Realistic Mocks**: Make mocks behave like real dependencies
4. **Minimal Mocking**: Only mock what's necessary

### Performance Considerations
1. **Parallel Execution**: Tests run in parallel by default
2. **Fast Tests**: Keep tests under 100ms when possible
3. **Shared Setup**: Use beforeAll for expensive setup
4. **Cleanup**: Always clean up resources

## 🔄 Continuous Testing

### Watch Mode
```bash
# Run tests in watch mode during development
npm run test:watch

# Watch specific files
npm test -- --watch --testPathPattern=instanceManager
```

### Pre-commit Testing
```bash
# Run tests before commits
npm run test:ci

# Run specific test suites
npm run test:unit && npm run test:integration
```

## 📚 Additional Resources

### Jest Documentation
- [Jest Testing Framework](https://jestjs.io/docs/getting-started)
- [Testing Asynchronous Code](https://jestjs.io/docs/asynchronous)
- [Mock Functions](https://jestjs.io/docs/mock-functions)

### TypeScript Testing
- [ts-jest Configuration](https://kulshekhar.github.io/ts-jest/)
- [TypeScript Testing Best Practices](https://typescript-eslint.io/docs/linting/troubleshooting/#testing)

### Project-Specific
- See individual test files for component-specific testing patterns
- Check setup.ts for available global test utilities
- Review CI configuration for automated testing setup

---

## 🚨 Troubleshooting

### Common Test Failures

#### "Cannot find module" errors
```bash
# Ensure correct module resolution in jest.config.js
moduleNameMapping: {
  '^(\\.{1,2}/.*)\\.js$': '$1'
}
```

#### Timeout errors
```bash
# Increase test timeout in jest.config.js
testTimeout: 30000
```

#### Mock leakage between tests
```bash
# Ensure proper cleanup in afterEach
afterEach(() => {
  jest.clearAllMocks();
});
```

For additional help, check the test output and error messages, or review similar tests for patterns.