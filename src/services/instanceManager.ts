import { spawn, type ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import type { Config, MCPInstance } from '../types/index.js';

export class InstanceManager {
  private instances = new Map<string, MCPInstance>();
  private userInstances = new Map<string, string>(); // userId -> instanceId
  private defaultInstance: MCPInstance | null = null;
  private cleanupInterval: NodeJS.Timeout;
  private healthCheckInterval: NodeJS.Timeout;

  constructor(private config: Config) {
    // 启动定期清理任务
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleInstances();
    }, 60000); // 每分钟检查一次

    // 启动健康检查任务
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, 30000); // 每30秒检查一次
  }

  async initialize(): Promise<void> {
    // 确保数据目录存在
    await fs.mkdir(this.config.storage.data_dir, { recursive: true });
    
    // 启动默认实例
    await this.startDefaultInstance();
  }

  private async startDefaultInstance(): Promise<void> {
    const instanceId = 'default';
    const port = this.config.lark_mcp.default_instance_port;
    const tokenDir = path.join(this.config.storage.data_dir, 'default');
    
    await fs.mkdir(tokenDir, { recursive: true });

    console.log(`🚀 Starting default lark-mcp instance on port ${port}...`);

    const childProcess = spawn(this.config.lark_mcp.binary_path, [
      'mcp',
      '--oauth',
      '--mode', 'sse',
      '--port', port.toString(),
      '--app-id', this.config.feishu.app_id,
      '--app-secret', this.config.feishu.app_secret
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.defaultInstance = {
      id: instanceId,
      userId: 'default',
      port,
      process: childProcess,
      status: 'starting',
      lastActivity: new Date(),
      createdAt: new Date(),
      tokenDir
    };

    // 监听进程事件
    this.setupProcessHandlers(this.defaultInstance);

    // 等待启动完成
    await this.waitForInstanceReady(this.defaultInstance);
    console.log(`✅ Default lark-mcp instance ready on port ${port}`);
  }

  async createUserInstance(userId: string): Promise<MCPInstance> {
    // 检查是否已存在
    const existingInstanceId = this.userInstances.get(userId);
    if (existingInstanceId) {
      const instance = this.instances.get(existingInstanceId);
      if (instance && instance.status === 'running') {
        instance.lastActivity = new Date();
        return instance;
      }
    }

    // 检查实例数量限制
    if (this.instances.size >= this.config.instance.max_instances) {
      throw new Error('Maximum number of instances reached');
    }

    // 分配端口
    const port = this.allocatePort();
    const instanceId = uuidv4();
    const tokenDir = path.join(this.config.storage.data_dir, `user-${userId}`);
    
    await fs.mkdir(tokenDir, { recursive: true });

    console.log(`🚀 Starting lark-mcp instance for user ${userId} on port ${port}...`);

    const childProcess = spawn(this.config.lark_mcp.binary_path, [
      'mcp',
      '--oauth',
      '--mode', 'sse',
      '--port', port.toString(),
      '--app-id', this.config.feishu.app_id,
      '--app-secret', this.config.feishu.app_secret
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const instance: MCPInstance = {
      id: instanceId,
      userId,
      port,
      process: childProcess,
      status: 'starting',
      lastActivity: new Date(),
      createdAt: new Date(),
      tokenDir
    };

    this.instances.set(instanceId, instance);
    this.userInstances.set(userId, instanceId);

    // 监听进程事件
    this.setupProcessHandlers(instance);

    // 等待启动完成
    await this.waitForInstanceReady(instance);
    console.log(`✅ User instance ready for ${userId} on port ${port}`);

    return instance;
  }

  getInstanceByUserId(userId: string): MCPInstance | null {
    const instanceId = this.userInstances.get(userId);
    if (!instanceId) return null;
    
    const instance = this.instances.get(instanceId);
    if (instance && instance.status === 'running') {
      instance.lastActivity = new Date();
      return instance;
    }
    
    return null;
  }

  getDefaultInstance(): MCPInstance | null {
    return this.defaultInstance;
  }

  async stopInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    if (instance.status === 'running') {
      instance.status = 'stopping';
      console.log(`🛑 Stopping instance ${instanceId} for user ${instance.userId}...`);
      
      // 优雅关闭
      instance.process.kill('SIGTERM');
      
      // 等待关闭或强制杀死
      setTimeout(() => {
        if (instance.status === 'stopping') {
          instance.process.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  private setupProcessHandlers(instance: MCPInstance): void {
    instance.process.on('spawn', () => {
      console.log(`📍 Process spawned for instance ${instance.id}`);
    });

    instance.process.on('error', (error: Error) => {
      console.error(`❌ Instance ${instance.id} error:`, error);
      instance.status = 'error';
    });

    instance.process.on('exit', (code: number | null, signal: string | null) => {
      console.log(`🔚 Instance ${instance.id} exited with code ${code}, signal ${signal}`);
      instance.status = 'stopped';
      
      // 清理映射
      this.instances.delete(instance.id);
      if (instance.userId !== 'default') {
        this.userInstances.delete(instance.userId);
      }
    });

    // 重定向日志
    instance.process.stdout?.on('data', (data: Buffer) => {
      console.log(`[${instance.id}] ${data.toString().trim()}`);
    });

    instance.process.stderr?.on('data', (data: Buffer) => {
      console.error(`[${instance.id}] ${data.toString().trim()}`);
    });
  }

  private async waitForInstanceReady(instance: MCPInstance, timeout = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        // 检查进程是否仍在运行
        if (instance.process.killed) {
          throw new Error(`Instance process was killed`);
        }
        
        // 尝试健康检查 HTTP 请求
        const healthUrl = `http://localhost:${instance.port}/health`;
        const response = await fetch(healthUrl, {
          method: 'GET',
          timeout: 2000,
        });
        
        if (response.ok) {
          instance.status = 'running';
          console.log(`✅ Instance ${instance.id} health check passed`);
          return;
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('killed')) {
          throw error;
        }
        // 继续等待，MCP 实例可能还在启动中
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // 如果健康检查失败，但进程仍在运行，则假设启动成功
    if (!instance.process.killed) {
      console.log(`⚠️  Instance ${instance.id} started but health check failed, assuming ready`);
      instance.status = 'running';
      return;
    }
    
    throw new Error(`Instance ${instance.id} failed to start within ${timeout}ms`);
  }

  private allocatePort(): number {
    const usedPorts = new Set<number>();
    this.instances.forEach(instance => usedPorts.add(instance.port));
    if (this.defaultInstance) usedPorts.add(this.defaultInstance.port);

    for (let port = this.config.lark_mcp.base_port; port < this.config.lark_mcp.base_port + 1000; port++) {
      if (!usedPorts.has(port)) {
        return port;
      }
    }
    
    throw new Error('No available ports');
  }

  private cleanupIdleInstances(): void {
    const now = new Date();
    const idleTimeout = this.config.instance.idle_timeout_ms;

    for (const [instanceId, instance] of this.instances) {
      if (instance.userId === 'default') continue; // 不清理默认实例
      
      const idleTime = now.getTime() - instance.lastActivity.getTime();
      if (idleTime > idleTimeout) {
        console.log(`🧹 Cleaning up idle instance ${instanceId} for user ${instance.userId} (idle for ${Math.round(idleTime / 1000)}s)`);
        this.stopInstance(instanceId);
      }
    }
  }

  private async performHealthChecks(): Promise<void> {
    const instances = [this.defaultInstance, ...this.instances.values()].filter(Boolean) as MCPInstance[];
    
    for (const instance of instances) {
      if (instance.status !== 'running') continue;
      
      try {
        const healthUrl = `http://localhost:${instance.port}/health`;
        const response = await fetch(healthUrl, {
          method: 'GET',
          timeout: 5000,
        });
        
        if (!response.ok) {
          console.log(`⚠️  Instance ${instance.id} health check failed: ${response.status}`);
          instance.status = 'error';
        }
      } catch (error) {
        console.log(`⚠️  Instance ${instance.id} health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        instance.status = 'error';
      }
    }
  }

  async isInstanceHealthy(instanceId: string): Promise<boolean> {
    const instance = this.instances.get(instanceId) || (this.defaultInstance?.id === instanceId ? this.defaultInstance : null);
    if (!instance || instance.status !== 'running') {
      return false;
    }
    
    try {
      const healthUrl = `http://localhost:${instance.port}/health`;
      const response = await fetch(healthUrl, {
        method: 'GET',
        timeout: 3000,
      });
      
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  getStats() {
    return {
      totalInstances: this.instances.size + (this.defaultInstance ? 1 : 0),
      userInstances: this.instances.size,
      runningInstances: Array.from(this.instances.values()).filter(i => i.status === 'running').length,
      defaultInstanceStatus: this.defaultInstance?.status || 'none'
    };
  }

  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down InstanceManager...');
    
    clearInterval(this.cleanupInterval);
    clearInterval(this.healthCheckInterval);
    
    // 停止所有实例
    const stopPromises: Promise<void>[] = [];
    
    for (const instanceId of this.instances.keys()) {
      stopPromises.push(this.stopInstance(instanceId));
    }
    
    if (this.defaultInstance) {
      stopPromises.push(this.stopInstance(this.defaultInstance.id));
    }
    
    await Promise.all(stopPromises);
    console.log('🔚 All instances stopped');
  }

  async forwardHttpRequest(instance: MCPInstance, path: string, method: string, body?: any): Promise<any> {
    const url = `http://localhost:${instance.port}${path}`;
    
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        timeout: 30000,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    } catch (error) {
      console.error(`HTTP request failed for instance ${instance.id}:${instance.port}${path}:`, error);
      throw error;
    }
  }
}