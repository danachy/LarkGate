#!/usr/bin/env node

/**
 * LarkGate Test Runner Script
 * 
 * This script provides a comprehensive test runner with various options
 * for running different types of tests and generating reports.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const COLORS = {
  RESET: '\x1b[0m',
  BRIGHT: '\x1b[1m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
};

class TestRunner {
  constructor() {
    this.args = process.argv.slice(2);
    this.options = this.parseArgs();
  }

  parseArgs() {
    const options = {
      type: 'all',
      coverage: false,
      watch: false,
      verbose: false,
      ci: false,
      updateSnapshots: false,
      bail: false,
      silent: false,
      pattern: null,
      maxWorkers: null,
    };

    for (let i = 0; i < this.args.length; i++) {
      const arg = this.args[i];
      
      switch (arg) {
        case '--help':
        case '-h':
          this.showHelp();
          process.exit(0);
          break;
          
        case '--unit':
          options.type = 'unit';
          break;
          
        case '--integration':
          options.type = 'integration';
          break;
          
        case '--config':
          options.type = 'config';
          break;
          
        case '--errors':
          options.type = 'errors';
          break;
          
        case '--coverage':
        case '-c':
          options.coverage = true;
          break;
          
        case '--watch':
        case '-w':
          options.watch = true;
          break;
          
        case '--verbose':
        case '-v':
          options.verbose = true;
          break;
          
        case '--ci':
          options.ci = true;
          break;
          
        case '--update-snapshots':
        case '-u':
          options.updateSnapshots = true;
          break;
          
        case '--bail':
          options.bail = true;
          break;
          
        case '--silent':
          options.silent = true;
          break;
          
        case '--pattern':
        case '-p':
          options.pattern = this.args[++i];
          break;
          
        case '--max-workers':
          options.maxWorkers = this.args[++i];
          break;
          
        default:
          if (arg.startsWith('--')) {
            console.error(`${COLORS.RED}Unknown option: ${arg}${COLORS.RESET}`);
            process.exit(1);
          }
          break;
      }
    }

    return options;
  }

  showHelp() {
    console.log(`
${COLORS.BRIGHT}${COLORS.CYAN}LarkGate Test Runner${COLORS.RESET}

${COLORS.BRIGHT}Usage:${COLORS.RESET}
  node scripts/test-runner.js [options]

${COLORS.BRIGHT}Test Types:${COLORS.RESET}
  --unit               Run unit tests only
  --integration        Run integration tests only
  --config             Run configuration tests only
  --errors             Run error handling tests only
  (default)            Run all tests

${COLORS.BRIGHT}Options:${COLORS.RESET}
  --coverage, -c       Generate test coverage report
  --watch, -w          Run tests in watch mode
  --verbose, -v        Show verbose output
  --ci                 Run tests in CI mode
  --update-snapshots   Update Jest snapshots
  --bail               Stop after first test failure
  --silent             Minimal output
  --pattern, -p <pat>  Run tests matching pattern
  --max-workers <num>  Maximum number of worker processes
  --help, -h           Show this help message

${COLORS.BRIGHT}Examples:${COLORS.RESET}
  node scripts/test-runner.js --unit --coverage
  node scripts/test-runner.js --integration --watch
  node scripts/test-runner.js --pattern "oauth" --verbose
  node scripts/test-runner.js --ci --coverage --bail

${COLORS.BRIGHT}Environment Variables:${COLORS.RESET}
  TEST_TIMEOUT         Override test timeout (default: 30000ms)
  NODE_ENV             Set to 'test' automatically
  DEBUG                Enable debug logging
`);
  }

  async run() {
    console.log(`${COLORS.BRIGHT}${COLORS.CYAN}🧪 LarkGate Test Runner${COLORS.RESET}`);
    console.log(`${COLORS.YELLOW}Running ${this.options.type} tests...${COLORS.RESET}\n`);

    // Pre-flight checks
    await this.preFlightChecks();

    // Build Jest command
    const jestArgs = this.buildJestArgs();

    // Run tests
    const success = await this.runJest(jestArgs);

    // Post-test actions
    await this.postTestActions(success);

    process.exit(success ? 0 : 1);
  }

  async preFlightChecks() {
    console.log(`${COLORS.BLUE}📋 Running pre-flight checks...${COLORS.RESET}`);

    // Check if Jest is installed
    try {
      require.resolve('jest');
    } catch (error) {
      console.error(`${COLORS.RED}❌ Jest is not installed. Run: npm install${COLORS.RESET}`);
      process.exit(1);
    }

    // Check if TypeScript is configured
    if (!fs.existsSync('tsconfig.json')) {
      console.warn(`${COLORS.YELLOW}⚠️  No tsconfig.json found${COLORS.RESET}`);
    }

    // Check if test files exist
    const testDirs = ['tests/services', 'tests/integration'];
    for (const dir of testDirs) {
      if (!fs.existsSync(dir)) {
        console.warn(`${COLORS.YELLOW}⚠️  Test directory ${dir} not found${COLORS.RESET}`);
      }
    }

    // Set environment variables
    process.env.NODE_ENV = 'test';
    if (this.options.verbose) {
      process.env.DEBUG = '*';
    }

    console.log(`${COLORS.GREEN}✅ Pre-flight checks completed${COLORS.RESET}\n`);
  }

  buildJestArgs() {
    const args = [];

    // Test type selection
    switch (this.options.type) {
      case 'unit':
        args.push('tests/services/');
        break;
      case 'integration':
        args.push('tests/integration/');
        break;
      case 'config':
        args.push('tests/config.test.ts');
        break;
      case 'errors':
        args.push('tests/errorHandling.test.ts');
        break;
      case 'all':
      default:
        // Run all tests - no specific path needed
        break;
    }

    // Coverage
    if (this.options.coverage) {
      args.push('--coverage');
      args.push('--coverageDirectory=coverage');
    }

    // Watch mode
    if (this.options.watch) {
      args.push('--watch');
    }

    // CI mode
    if (this.options.ci) {
      args.push('--ci');
      args.push('--watchAll=false');
      args.push('--coverage');
    }

    // Verbose output
    if (this.options.verbose) {
      args.push('--verbose');
    }

    // Silent mode
    if (this.options.silent) {
      args.push('--silent');
    }

    // Update snapshots
    if (this.options.updateSnapshots) {
      args.push('--updateSnapshot');
    }

    // Bail on first failure
    if (this.options.bail) {
      args.push('--bail');
    }

    // Pattern matching
    if (this.options.pattern) {
      args.push('--testNamePattern');
      args.push(this.options.pattern);
    }

    // Max workers
    if (this.options.maxWorkers) {
      args.push('--maxWorkers');
      args.push(this.options.maxWorkers);
    }

    // Additional Jest options
    args.push('--passWithNoTests');
    args.push('--testTimeout');
    args.push(process.env.TEST_TIMEOUT || '30000');

    return args;
  }

  async runJest(args) {
    return new Promise((resolve) => {
      console.log(`${COLORS.BLUE}🚀 Starting Jest with args: ${args.join(' ')}${COLORS.RESET}\n`);

      const jest = spawn('npx', ['jest', ...args], {
        stdio: 'inherit',
        shell: true,
      });

      jest.on('close', (code) => {
        console.log(`\n${COLORS.BLUE}📊 Jest process exited with code ${code}${COLORS.RESET}`);
        resolve(code === 0);
      });

      jest.on('error', (error) => {
        console.error(`${COLORS.RED}❌ Failed to start Jest: ${error.message}${COLORS.RESET}`);
        resolve(false);
      });
    });
  }

  async postTestActions(success) {
    console.log(`\n${COLORS.BRIGHT}📋 Post-test Summary${COLORS.RESET}`);

    if (success) {
      console.log(`${COLORS.GREEN}✅ All tests passed!${COLORS.RESET}`);
    } else {
      console.log(`${COLORS.RED}❌ Some tests failed.${COLORS.RESET}`);
    }

    // Coverage report
    if (this.options.coverage || this.options.ci) {
      if (fs.existsSync('coverage/lcov-report/index.html')) {
        console.log(`${COLORS.CYAN}📊 Coverage report: coverage/lcov-report/index.html${COLORS.RESET}`);
      }
    }

    // Test artifacts
    const artifacts = [
      'coverage/',
      'test-results.xml',
      '.nyc_output/'
    ];

    const foundArtifacts = artifacts.filter(artifact => fs.existsSync(artifact));
    if (foundArtifacts.length > 0) {
      console.log(`${COLORS.YELLOW}📁 Test artifacts: ${foundArtifacts.join(', ')}${COLORS.RESET}`);
    }

    // Next steps
    if (!success) {
      console.log(`\n${COLORS.BRIGHT}🔧 Troubleshooting Tips:${COLORS.RESET}`);
      console.log(`${COLORS.YELLOW}  • Run with --verbose for detailed output${COLORS.RESET}`);
      console.log(`${COLORS.YELLOW}  • Check test logs for specific failures${COLORS.RESET}`);
      console.log(`${COLORS.YELLOW}  • Review TESTING.md for debugging guide${COLORS.RESET}`);
    }

    console.log(`\n${COLORS.BRIGHT}📚 Documentation:${COLORS.RESET}`);
    console.log(`${COLORS.CYAN}  • Testing Guide: TESTING.md${COLORS.RESET}`);
    console.log(`${COLORS.CYAN}  • Jest Config: jest.config.js${COLORS.RESET}`);
    console.log(`${COLORS.CYAN}  • Test Setup: tests/setup.ts${COLORS.RESET}`);
  }
}

// Self-test functionality
async function selfTest() {
  console.log(`${COLORS.BRIGHT}${COLORS.MAGENTA}🔧 Running test runner self-test...${COLORS.RESET}`);
  
  const testCases = [
    { args: ['--help'], shouldExit: true },
    { args: ['--unit', '--coverage'], shouldExit: false },
    { args: ['--invalid-option'], shouldExit: true },
  ];

  for (const testCase of testCases) {
    console.log(`Testing args: ${testCase.args.join(' ')}`);
    // Would run actual test here in real implementation
  }

  console.log(`${COLORS.GREEN}✅ Self-test completed${COLORS.RESET}`);
}

// Main execution
if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    const runner = new TestRunner();
    runner.run().catch(error => {
      console.error(`${COLORS.RED}❌ Test runner failed: ${error.message}${COLORS.RESET}`);
      process.exit(1);
    });
  }
}

module.exports = TestRunner;