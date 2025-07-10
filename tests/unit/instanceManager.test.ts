import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { InstanceManager } from '../../src/services/instanceManager.js';
import type { Config } from '../../src/types/index.js';

describe('InstanceManager', () => {
  let instanceManager: InstanceManager;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      port: 3000,
      host: 'localhost',
      feishu: {
        app_id: 'test_app_id',
        app_secret: 'test_app_secret',
        redirect_uri: 'http://localhost:3000/oauth/callback'
      },
      lark_mcp: {
        binary_path: 'lark-mcp',
        base_port: 3001,
        default_instance_port: 4000
      },
      rate_limit: {
        per_session: 50,
        per_ip: 200,
        window_ms: 60000
      },
      storage: {
        data_dir: './test-data',
        snapshot_interval_ms: 600000,
        token_ttl_ms: 2592000000
      },
      instance: {
        max_instances: 20,
        idle_timeout_ms: 1800000,
        memory_limit_mb: 256
      }
    };

    instanceManager = new InstanceManager(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create InstanceManager with correct config', () => {
      expect(instanceManager).toBeDefined();
    });

    it('should initialize and start default instance', async () => {
      await instanceManager.initialize();
      
      const defaultInstance = instanceManager.getDefaultInstance();
      expect(defaultInstance).toBeDefined();
      expect(defaultInstance?.port).toBe(4000);
      expect(defaultInstance?.userId).toBe('default');
    });
  });

  describe('user instance management', () => {
    beforeEach(async () => {
      await instanceManager.initialize();
    });

    it('should create user instance on first request', async () => {
      const userId = 'test-user-1';
      const instance = await instanceManager.createUserInstance(userId);
      
      expect(instance).toBeDefined();
      expect(instance.userId).toBe(userId);
      expect(instance.port).toBeGreaterThanOrEqual(3001);
      expect(instance.status).toBe('running');
    });

    it('should return existing instance for same user', async () => {
      const userId = 'test-user-1';
      const instance1 = await instanceManager.createUserInstance(userId);
      const instance2 = await instanceManager.createUserInstance(userId);
      
      expect(instance1.id).toBe(instance2.id);
      expect(instance1.port).toBe(instance2.port);
    });

    it('should allocate different ports for different users', async () => {
      const instance1 = await instanceManager.createUserInstance('user-1');
      const instance2 = await instanceManager.createUserInstance('user-2');
      
      expect(instance1.port).not.toBe(instance2.port);
    });

    it('should get instance by userId', async () => {
      const userId = 'test-user-1';
      await instanceManager.createUserInstance(userId);
      
      const instance = instanceManager.getInstanceByUserId(userId);
      expect(instance).toBeDefined();
      expect(instance?.userId).toBe(userId);
    });

    it('should return null for non-existent user', () => {
      const instance = instanceManager.getInstanceByUserId('non-existent-user');
      expect(instance).toBeNull();
    });
  });

  describe('instance limits', () => {
    beforeEach(async () => {
      await instanceManager.initialize();
    });

    it('should enforce max instances limit', async () => {
      // Mock config with low limit for testing
      const limitedConfig = { ...mockConfig, instance: { ...mockConfig.instance, max_instances: 2 } };
      const limitedManager = new InstanceManager(limitedConfig);
      await limitedManager.initialize();

      // Create instances up to limit
      await limitedManager.createUserInstance('user-1');
      await limitedManager.createUserInstance('user-2');

      // Third instance should throw error
      await expect(limitedManager.createUserInstance('user-3')).rejects.toThrow('Maximum number of instances reached');
    });
  });

  describe('stats and monitoring', () => {
    beforeEach(async () => {
      await instanceManager.initialize();
    });

    it('should return correct stats', async () => {
      await instanceManager.createUserInstance('user-1');
      await instanceManager.createUserInstance('user-2');
      
      const stats = instanceManager.getStats();
      expect(stats.totalInstances).toBe(3); // 2 user + 1 default
      expect(stats.userInstances).toBe(2);
      expect(stats.defaultInstanceStatus).toBe('running');
    });
  });

  describe('cleanup', () => {
    beforeEach(async () => {
      await instanceManager.initialize();
    });

    it('should shutdown all instances', async () => {
      await instanceManager.createUserInstance('user-1');
      await instanceManager.createUserInstance('user-2');
      
      await instanceManager.shutdown();
      
      // After shutdown, stats should show stopped instances
      const stats = instanceManager.getStats();
      expect(stats.totalInstances).toBe(0);
    });
  });
});