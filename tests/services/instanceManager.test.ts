import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { InstanceManager } from '../../src/services/instanceManager.js';
import type { Config } from '../../src/types/index.js';

// Mock dependencies
jest.mock('child_process');
jest.mock('fs/promises');
jest.mock('node-fetch');

describe('InstanceManager', () => {
  let instanceManager: InstanceManager;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      port: 3000,
      host: 'localhost',
      feishu: {
        app_id: 'test-app-id',
        app_secret: 'test-app-secret',
        redirect_uri: 'http://localhost:3000/oauth/callback',
      },
      lark_mcp: {
        binary_path: 'mock-lark-mcp',
        base_port: 3001,
        default_instance_port: 4000,
      },
      rate_limit: {
        per_session: 50,
        per_ip: 200,
        window_ms: 60000,
      },
      storage: {
        data_dir: './test-data',
        snapshot_interval_ms: 600000,
        token_ttl_ms: 2592000000,
      },
      instance: {
        max_instances: 5,
        idle_timeout_ms: 300000,
        memory_limit_mb: 256,
      },
    };

    instanceManager = new InstanceManager(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create instance manager with correct config', () => {
      expect(instanceManager).toBeDefined();
    });

    it('should initialize data directory and start default instance', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);
      
      // Mock spawn for default instance
      const mockProcess = global.mockSpawn();
      
      // Mock health check
      global.mockFetch({ status: 'ok' }, 200);
      
      await instanceManager.initialize();
      
      expect(mockFs.mkdir).toHaveBeenCalledWith('./test-data', { recursive: true });
      expect(mockFs.mkdir).toHaveBeenCalledWith('./test-data/default', { recursive: true });
    });
  });

  describe('user instance management', () => {
    beforeEach(async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);
      
      // Mock spawn for default instance
      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      
      await instanceManager.initialize();
    });

    it('should create user instance successfully', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);
      
      const mockProcess = global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      
      const instance = await instanceManager.createUserInstance('user-123');
      
      expect(instance).toBeDefined();
      expect(instance.userId).toBe('user-123');
      expect(instance.port).toBe(3001);
      expect(instance.status).toBe('running');
    });

    it('should reuse existing running instance', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);
      
      const mockProcess = global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      
      const instance1 = await instanceManager.createUserInstance('user-123');
      const instance2 = await instanceManager.createUserInstance('user-123');
      
      expect(instance1.id).toBe(instance2.id);
    });

    it('should allocate different ports for different users', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);
      
      global.mockSpawn();
      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      global.mockFetch({ status: 'ok' }, 200);
      
      const instance1 = await instanceManager.createUserInstance('user-123');
      const instance2 = await instanceManager.createUserInstance('user-456');
      
      expect(instance1.port).not.toBe(instance2.port);
      expect(instance1.port).toBe(3001);
      expect(instance2.port).toBe(3002);
    });

    it('should respect max instances limit', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);
      
      // Create max instances
      for (let i = 0; i < 5; i++) {
        global.mockSpawn();
        global.mockFetch({ status: 'ok' }, 200);
        await instanceManager.createUserInstance(`user-${i}`);
      }
      
      // This should fail
      await expect(instanceManager.createUserInstance('user-overflow')).rejects.toThrow('Maximum number of instances reached');
    });
  });

  describe('instance lifecycle', () => {
    it('should get instance by user ID', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);
      
      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      
      await instanceManager.initialize();
      const instance = await instanceManager.createUserInstance('user-123');
      
      const foundInstance = instanceManager.getInstanceByUserId('user-123');
      expect(foundInstance).toBeDefined();
      expect(foundInstance!.userId).toBe('user-123');
    });

    it('should return null for non-existent user', () => {
      const instance = instanceManager.getInstanceByUserId('non-existent');
      expect(instance).toBeNull();
    });

    it('should get default instance', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);
      
      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      
      await instanceManager.initialize();
      
      const defaultInstance = instanceManager.getDefaultInstance();
      expect(defaultInstance).toBeDefined();
      expect(defaultInstance!.userId).toBe('default');
    });

    it('should stop instance gracefully', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);
      
      const mockProcess = global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      
      await instanceManager.initialize();
      const instance = await instanceManager.createUserInstance('user-123');
      
      await instanceManager.stopInstance(instance.id);
      
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });

  describe('health checks', () => {
    it('should perform health check on instance', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);
      
      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      
      await instanceManager.initialize();
      const instance = await instanceManager.createUserInstance('user-123');
      
      global.mockFetch({ status: 'ok' }, 200);
      const isHealthy = await instanceManager.isInstanceHealthy(instance.id);
      
      expect(isHealthy).toBe(true);
    });

    it('should return false for unhealthy instance', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);
      
      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      
      await instanceManager.initialize();
      const instance = await instanceManager.createUserInstance('user-123');
      
      global.mockFetch({ error: 'Connection refused' }, 500);
      const isHealthy = await instanceManager.isInstanceHealthy(instance.id);
      
      expect(isHealthy).toBe(false);
    });
  });

  describe('HTTP forwarding', () => {
    it('should forward HTTP request to instance', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);
      
      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      
      await instanceManager.initialize();
      const instance = await instanceManager.createUserInstance('user-123');
      
      const responseData = { result: 'success' };
      global.mockFetch(responseData, 200);
      
      const result = await instanceManager.forwardHttpRequest(instance, '/test', 'GET');
      
      expect(result).toEqual(responseData);
    });

    it('should handle HTTP errors', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);
      
      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      
      await instanceManager.initialize();
      const instance = await instanceManager.createUserInstance('user-123');
      
      global.mockFetch({ error: 'Not found' }, 404);
      
      await expect(instanceManager.forwardHttpRequest(instance, '/test', 'GET')).rejects.toThrow('HTTP 404');
    });
  });

  describe('statistics', () => {
    it('should return correct stats', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);
      
      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      
      await instanceManager.initialize();
      
      const stats = instanceManager.getStats();
      
      expect(stats.totalInstances).toBe(1); // default instance
      expect(stats.userInstances).toBe(0);
      expect(stats.defaultInstanceStatus).toBe('running');
    });

    it('should update stats when instances are created', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);
      
      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      
      await instanceManager.initialize();
      
      global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      await instanceManager.createUserInstance('user-123');
      
      const stats = instanceManager.getStats();
      
      expect(stats.totalInstances).toBe(2);
      expect(stats.userInstances).toBe(1);
      expect(stats.runningInstances).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('should shutdown all instances', async () => {
      const mockFs = require('fs/promises');
      mockFs.mkdir.mockResolvedValue(undefined);
      
      const mockProcess1 = global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      
      await instanceManager.initialize();
      
      const mockProcess2 = global.mockSpawn();
      global.mockFetch({ status: 'ok' }, 200);
      await instanceManager.createUserInstance('user-123');
      
      await instanceManager.shutdown();
      
      expect(mockProcess1.kill).toHaveBeenCalledWith('SIGTERM');
      expect(mockProcess2.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });
});