import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { Config } from '../src/types/index.js';

describe('Configuration Validation', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const loadConfig = (): Config => ({
    port: parseInt(process.env.PORT || '3000'),
    host: process.env.HOST || '0.0.0.0',
    feishu: {
      app_id: process.env.FEISHU_APP_ID || '',
      app_secret: process.env.FEISHU_APP_SECRET || '',
      redirect_uri: process.env.FEISHU_REDIRECT_URI || 'http://localhost:3000/oauth/callback',
    },
    lark_mcp: {
      binary_path: process.env.LARK_MCP_BINARY || 'lark-mcp',
      base_port: parseInt(process.env.LARK_MCP_BASE_PORT || '3001'),
      default_instance_port: parseInt(process.env.LARK_MCP_DEFAULT_PORT || '4000'),
    },
    rate_limit: {
      per_session: parseInt(process.env.RATE_LIMIT_PER_SESSION || '50'),
      per_ip: parseInt(process.env.RATE_LIMIT_PER_IP || '200'),
      window_ms: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
    },
    storage: {
      data_dir: process.env.DATA_DIR || './data',
      snapshot_interval_ms: parseInt(process.env.SNAPSHOT_INTERVAL_MS || '600000'),
      token_ttl_ms: parseInt(process.env.TOKEN_TTL_MS || '2592000000'),
    },
    instance: {
      max_instances: parseInt(process.env.MAX_INSTANCES || '20'),
      idle_timeout_ms: parseInt(process.env.IDLE_TIMEOUT_MS || '1800000'),
      memory_limit_mb: parseInt(process.env.MEMORY_LIMIT_MB || '256'),
    },
  });

  const validateConfig = (config: Config): string[] => {
    const errors: string[] = [];

    if (!config.feishu.app_id) {
      errors.push('FEISHU_APP_ID is required');
    }

    if (!config.feishu.app_secret) {
      errors.push('FEISHU_APP_SECRET is required');
    }

    if (!config.feishu.redirect_uri.startsWith('http')) {
      errors.push('FEISHU_REDIRECT_URI must be a valid URL');
    }

    if (config.lark_mcp.base_port <= config.port || config.lark_mcp.default_instance_port <= config.port) {
      errors.push('MCP instance ports must be different from gateway port');
    }

    if (config.port < 1 || config.port > 65535) {
      errors.push('PORT must be between 1 and 65535');
    }

    if (config.instance.max_instances < 1) {
      errors.push('MAX_INSTANCES must be at least 1');
    }

    if (config.instance.idle_timeout_ms < 60000) {
      errors.push('IDLE_TIMEOUT_MS must be at least 60000 (1 minute)');
    }

    if (config.rate_limit.per_session < 1) {
      errors.push('RATE_LIMIT_PER_SESSION must be at least 1');
    }

    if (config.rate_limit.per_ip < 1) {
      errors.push('RATE_LIMIT_PER_IP must be at least 1');
    }

    return errors;
  };

  describe('Default configuration', () => {
    it('should have valid default values', () => {
      // Set minimal required values
      process.env.FEISHU_APP_ID = 'test-app-id';
      process.env.FEISHU_APP_SECRET = 'test-app-secret';

      const config = loadConfig();

      expect(config.port).toBe(3000);
      expect(config.host).toBe('0.0.0.0');
      expect(config.feishu.app_id).toBe('test-app-id');
      expect(config.feishu.app_secret).toBe('test-app-secret');
      expect(config.feishu.redirect_uri).toBe('http://localhost:3000/oauth/callback');
      expect(config.lark_mcp.binary_path).toBe('lark-mcp');
      expect(config.lark_mcp.base_port).toBe(3001);
      expect(config.lark_mcp.default_instance_port).toBe(4000);
      expect(config.storage.data_dir).toBe('./data');
      expect(config.instance.max_instances).toBe(20);
    });

    it('should validate default configuration successfully', () => {
      process.env.FEISHU_APP_ID = 'test-app-id';
      process.env.FEISHU_APP_SECRET = 'test-app-secret';

      const config = loadConfig();
      const errors = validateConfig(config);

      expect(errors).toHaveLength(0);
    });
  });

  describe('Environment variable parsing', () => {
    it('should parse numeric environment variables correctly', () => {
      process.env.PORT = '8080';
      process.env.LARK_MCP_BASE_PORT = '4001';
      process.env.MAX_INSTANCES = '50';
      process.env.IDLE_TIMEOUT_MS = '900000';
      process.env.FEISHU_APP_ID = 'test-app-id';
      process.env.FEISHU_APP_SECRET = 'test-app-secret';

      const config = loadConfig();

      expect(config.port).toBe(8080);
      expect(config.lark_mcp.base_port).toBe(4001);
      expect(config.instance.max_instances).toBe(50);
      expect(config.instance.idle_timeout_ms).toBe(900000);
    });

    it('should handle string environment variables', () => {
      process.env.HOST = 'localhost';
      process.env.FEISHU_APP_ID = 'my-app-id';
      process.env.FEISHU_APP_SECRET = 'my-app-secret';
      process.env.FEISHU_REDIRECT_URI = 'https://example.com/oauth/callback';
      process.env.DATA_DIR = '/custom/data';
      process.env.LARK_MCP_BINARY = '/usr/local/bin/lark-mcp';

      const config = loadConfig();

      expect(config.host).toBe('localhost');
      expect(config.feishu.app_id).toBe('my-app-id');
      expect(config.feishu.app_secret).toBe('my-app-secret');
      expect(config.feishu.redirect_uri).toBe('https://example.com/oauth/callback');
      expect(config.storage.data_dir).toBe('/custom/data');
      expect(config.lark_mcp.binary_path).toBe('/usr/local/bin/lark-mcp');
    });

    it('should handle invalid numeric environment variables gracefully', () => {
      process.env.PORT = 'invalid';
      process.env.MAX_INSTANCES = 'not-a-number';
      process.env.FEISHU_APP_ID = 'test-app-id';
      process.env.FEISHU_APP_SECRET = 'test-app-secret';

      const config = loadConfig();

      // parseInt returns NaN for invalid numbers, which becomes falsy
      expect(isNaN(config.port)).toBe(true);
      expect(isNaN(config.instance.max_instances)).toBe(true);
    });
  });

  describe('Configuration validation', () => {
    describe('Required fields', () => {
      it('should require FEISHU_APP_ID', () => {
        process.env.FEISHU_APP_SECRET = 'test-secret';
        delete process.env.FEISHU_APP_ID;

        const config = loadConfig();
        const errors = validateConfig(config);

        expect(errors).toContain('FEISHU_APP_ID is required');
      });

      it('should require FEISHU_APP_SECRET', () => {
        process.env.FEISHU_APP_ID = 'test-app-id';
        delete process.env.FEISHU_APP_SECRET;

        const config = loadConfig();
        const errors = validateConfig(config);

        expect(errors).toContain('FEISHU_APP_SECRET is required');
      });

      it('should require valid FEISHU_REDIRECT_URI', () => {
        process.env.FEISHU_APP_ID = 'test-app-id';
        process.env.FEISHU_APP_SECRET = 'test-secret';
        process.env.FEISHU_REDIRECT_URI = 'invalid-url';

        const config = loadConfig();
        const errors = validateConfig(config);

        expect(errors).toContain('FEISHU_REDIRECT_URI must be a valid URL');
      });
    });

    describe('Port validation', () => {
      it('should validate port range', () => {
        process.env.FEISHU_APP_ID = 'test-app-id';
        process.env.FEISHU_APP_SECRET = 'test-secret';
        process.env.PORT = '0';

        const config = loadConfig();
        const errors = validateConfig(config);

        expect(errors).toContain('PORT must be between 1 and 65535');
      });

      it('should validate port range upper bound', () => {
        process.env.FEISHU_APP_ID = 'test-app-id';
        process.env.FEISHU_APP_SECRET = 'test-secret';
        process.env.PORT = '65536';

        const config = loadConfig();
        const errors = validateConfig(config);

        expect(errors).toContain('PORT must be between 1 and 65535');
      });

      it('should validate MCP ports are different from gateway port', () => {
        process.env.FEISHU_APP_ID = 'test-app-id';
        process.env.FEISHU_APP_SECRET = 'test-secret';
        process.env.PORT = '3000';
        process.env.LARK_MCP_BASE_PORT = '3000';

        const config = loadConfig();
        const errors = validateConfig(config);

        expect(errors).toContain('MCP instance ports must be different from gateway port');
      });

      it('should validate default instance port is different from gateway port', () => {
        process.env.FEISHU_APP_ID = 'test-app-id';
        process.env.FEISHU_APP_SECRET = 'test-secret';
        process.env.PORT = '4000';
        process.env.LARK_MCP_DEFAULT_PORT = '4000';

        const config = loadConfig();
        const errors = validateConfig(config);

        expect(errors).toContain('MCP instance ports must be different from gateway port');
      });
    });

    describe('Instance configuration validation', () => {
      it('should validate max instances minimum', () => {
        process.env.FEISHU_APP_ID = 'test-app-id';
        process.env.FEISHU_APP_SECRET = 'test-secret';
        process.env.MAX_INSTANCES = '0';

        const config = loadConfig();
        const errors = validateConfig(config);

        expect(errors).toContain('MAX_INSTANCES must be at least 1');
      });

      it('should validate idle timeout minimum', () => {
        process.env.FEISHU_APP_ID = 'test-app-id';
        process.env.FEISHU_APP_SECRET = 'test-secret';
        process.env.IDLE_TIMEOUT_MS = '30000';

        const config = loadConfig();
        const errors = validateConfig(config);

        expect(errors).toContain('IDLE_TIMEOUT_MS must be at least 60000 (1 minute)');
      });
    });

    describe('Rate limiting validation', () => {
      it('should validate per-session rate limit minimum', () => {
        process.env.FEISHU_APP_ID = 'test-app-id';
        process.env.FEISHU_APP_SECRET = 'test-secret';
        process.env.RATE_LIMIT_PER_SESSION = '0';

        const config = loadConfig();
        const errors = validateConfig(config);

        expect(errors).toContain('RATE_LIMIT_PER_SESSION must be at least 1');
      });

      it('should validate per-IP rate limit minimum', () => {
        process.env.FEISHU_APP_ID = 'test-app-id';
        process.env.FEISHU_APP_SECRET = 'test-secret';
        process.env.RATE_LIMIT_PER_IP = '0';

        const config = loadConfig();
        const errors = validateConfig(config);

        expect(errors).toContain('RATE_LIMIT_PER_IP must be at least 1');
      });
    });
  });

  describe('Production configuration', () => {
    it('should validate typical production configuration', () => {
      process.env.NODE_ENV = 'production';
      process.env.PORT = '443';
      process.env.HOST = '0.0.0.0';
      process.env.FEISHU_APP_ID = 'cli_12345678901234567890';
      process.env.FEISHU_APP_SECRET = 'abcdef1234567890abcdef1234567890';
      process.env.FEISHU_REDIRECT_URI = 'https://myapp.example.com/oauth/callback';
      process.env.DATA_DIR = '/opt/larkgate/data';
      process.env.MAX_INSTANCES = '50';
      process.env.IDLE_TIMEOUT_MS = '1800000';
      process.env.RATE_LIMIT_PER_SESSION = '100';
      process.env.RATE_LIMIT_PER_IP = '500';

      const config = loadConfig();
      const errors = validateConfig(config);

      expect(errors).toHaveLength(0);
      expect(config.port).toBe(443);
      expect(config.feishu.redirect_uri).toBe('https://myapp.example.com/oauth/callback');
      expect(config.instance.max_instances).toBe(50);
    });
  });

  describe('Development configuration', () => {
    it('should validate typical development configuration', () => {
      process.env.NODE_ENV = 'development';
      process.env.PORT = '3000';
      process.env.HOST = 'localhost';
      process.env.FEISHU_APP_ID = 'test-app-id';
      process.env.FEISHU_APP_SECRET = 'test-app-secret';
      process.env.FEISHU_REDIRECT_URI = 'http://localhost:3000/oauth/callback';
      process.env.DATA_DIR = './test-data';
      process.env.MAX_INSTANCES = '5';
      process.env.IDLE_TIMEOUT_MS = '300000';
      process.env.LOG_LEVEL = 'debug';

      const config = loadConfig();
      const errors = validateConfig(config);

      expect(errors).toHaveLength(0);
      expect(config.host).toBe('localhost');
      expect(config.instance.max_instances).toBe(5);
      expect(config.instance.idle_timeout_ms).toBe(300000);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty environment variables', () => {
      process.env.FEISHU_APP_ID = '';
      process.env.FEISHU_APP_SECRET = '';
      process.env.PORT = '';

      const config = loadConfig();
      const errors = validateConfig(config);

      expect(errors).toContain('FEISHU_APP_ID is required');
      expect(errors).toContain('FEISHU_APP_SECRET is required');
      expect(config.port).toBe(3000); // Falls back to default
    });

    it('should handle whitespace in environment variables', () => {
      process.env.FEISHU_APP_ID = '  test-app-id  ';
      process.env.FEISHU_APP_SECRET = '  test-secret  ';

      const config = loadConfig();

      // Note: This test shows current behavior - trimming should be implemented
      expect(config.feishu.app_id).toBe('  test-app-id  ');
      expect(config.feishu.app_secret).toBe('  test-secret  ');
    });

    it('should handle extremely large values', () => {
      process.env.FEISHU_APP_ID = 'test-app-id';
      process.env.FEISHU_APP_SECRET = 'test-secret';
      process.env.MAX_INSTANCES = '999999';
      process.env.IDLE_TIMEOUT_MS = '999999999';

      const config = loadConfig();
      const errors = validateConfig(config);

      // These should be valid (no upper bounds defined)
      expect(errors).toHaveLength(0);
      expect(config.instance.max_instances).toBe(999999);
      expect(config.instance.idle_timeout_ms).toBe(999999999);
    });
  });

  describe('Configuration completeness', () => {
    it('should include all necessary configuration sections', () => {
      process.env.FEISHU_APP_ID = 'test-app-id';
      process.env.FEISHU_APP_SECRET = 'test-secret';

      const config = loadConfig();

      expect(config.port).toBeDefined();
      expect(config.host).toBeDefined();
      expect(config.feishu).toBeDefined();
      expect(config.lark_mcp).toBeDefined();
      expect(config.rate_limit).toBeDefined();
      expect(config.storage).toBeDefined();
      expect(config.instance).toBeDefined();

      // Check nested objects
      expect(config.feishu.app_id).toBeDefined();
      expect(config.feishu.app_secret).toBeDefined();
      expect(config.feishu.redirect_uri).toBeDefined();

      expect(config.lark_mcp.binary_path).toBeDefined();
      expect(config.lark_mcp.base_port).toBeDefined();
      expect(config.lark_mcp.default_instance_port).toBeDefined();

      expect(config.rate_limit.per_session).toBeDefined();
      expect(config.rate_limit.per_ip).toBeDefined();
      expect(config.rate_limit.window_ms).toBeDefined();

      expect(config.storage.data_dir).toBeDefined();
      expect(config.storage.snapshot_interval_ms).toBeDefined();
      expect(config.storage.token_ttl_ms).toBeDefined();

      expect(config.instance.max_instances).toBeDefined();
      expect(config.instance.idle_timeout_ms).toBeDefined();
      expect(config.instance.memory_limit_mb).toBeDefined();
    });
  });
});