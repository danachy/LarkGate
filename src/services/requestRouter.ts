import { LRUCache } from 'lru-cache';
import fetch from 'node-fetch';
import type { Config, MCPInstance, SessionMapping, MCPRequest, MCPResponse } from '../types/index.js';
import { InstanceManager } from './instanceManager.js';

export class RequestRouter {
  private sessionMappings = new LRUCache<string, SessionMapping>({
    max: 1000,
    ttl: 24 * 60 * 60 * 1000, // 24小时
  });
  private instances = new Map<string, MCPInstance>(); // 本地引用以便快速访问

  constructor(
    private config: Config,
    private instanceManager: InstanceManager
  ) {}

  async routeRequest(sessionId: string, request: MCPRequest): Promise<MCPResponse> {
    // 查找用户实例
    const userId = this.getUserIdBySession(sessionId);
    let targetInstance: MCPInstance | null = null;

    if (userId) {
      // 已认证用户，路由到专属实例
      targetInstance = this.instanceManager.getInstanceByUserId(userId);
      
      if (!targetInstance) {
        // 实例不存在，创建新实例
        try {
          targetInstance = await this.instanceManager.createUserInstance(userId);
        } catch (error) {
          console.error(`Failed to create instance for user ${userId}:`, error);
          // 回退到默认实例
          targetInstance = this.instanceManager.getDefaultInstance();
        }
      }
    } else {
      // 未认证用户，使用默认实例
      targetInstance = this.instanceManager.getDefaultInstance();
    }

    if (!targetInstance) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: 'No available MCP instance'
        }
      };
    }

    // 转发请求到目标实例
    return this.forwardRequest(targetInstance, request);
  }

  async getToolsFromDefaultInstance(): Promise<any[]> {
    const defaultInstance = this.instanceManager.getDefaultInstance();
    if (!defaultInstance) {
      throw new Error('Default instance not available');
    }

    try {
      const response = await this.forwardRequest(defaultInstance, {
        jsonrpc: '2.0',
        id: 'tools',
        method: 'tools/list'
      });

      if (response.error) {
        throw new Error(`Failed to get tools: ${response.error.message}`);
      }

      return response.result?.tools || [];
    } catch (error) {
      console.error('Failed to get tools from default instance:', error);
      
      // 返回默认工具列表作为后备
      return this.getFallbackTools();
    }
  }

  async getCapabilitiesFromDefaultInstance(): Promise<any> {
    const defaultInstance = this.instanceManager.getDefaultInstance();
    if (!defaultInstance) {
      throw new Error('Default instance not available');
    }

    try {
      const response = await this.forwardRequest(defaultInstance, {
        jsonrpc: '2.0',
        id: 'capabilities',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'LarkGate',
            version: '0.2.0'
          }
        }
      });

      if (response.error) {
        throw new Error(`Failed to get capabilities: ${response.error.message}`);
      }

      return response.result;
    } catch (error) {
      console.error('Failed to get capabilities from default instance:', error);
      
      // 返回默认能力作为后备
      return this.getFallbackCapabilities();
    }
  }

  private async forwardRequest(instance: MCPInstance, request: MCPRequest): Promise<MCPResponse> {
    try {
      console.log(`📤 Forwarding request to instance ${instance.id}:${instance.port} - ${request.method}`);
      
      // 更新实例活动时间
      instance.lastActivity = new Date();
      
      // 检查实例状态
      if (instance.status !== 'running') {
        throw new Error(`Instance ${instance.id} is not running (status: ${instance.status})`);
      }
      
      // 向 MCP 实例发送 HTTP 请求
      const url = `http://localhost:${instance.port}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'LarkGate/0.2.0',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(30000),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const mcpResponse = await response.json() as MCPResponse;
      
      // 验证响应格式
      if (!mcpResponse.jsonrpc) {
        throw new Error('Invalid JSON-RPC response format');
      }
      
      console.log(`✅ Response received from instance ${instance.id}`);
      return mcpResponse;
      
    } catch (error) {
      console.error(`Request forwarding failed for instance ${instance.id}:`, error);
      
      // 如果是网络错误，尝试标记实例为错误状态
      if (error instanceof Error && (error.message.includes('ECONNREFUSED') || error.message.includes('timeout'))) {
        console.log(`⚠️  Marking instance ${instance.id} as error due to connection failure`);
        instance.status = 'error';
      }
      
      // 返回错误响应
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
          data: {
            instanceId: instance.id,
            userId: instance.userId,
            port: instance.port
          }
        }
      };
    }
  }

  bindSessionToUser(sessionId: string, userId: string): void {
    const mapping: SessionMapping = {
      sessionId,
      userId,
      createdAt: new Date(),
      lastActivity: new Date()
    };
    
    this.sessionMappings.set(sessionId, mapping);
    console.log(`🔗 Bound session ${sessionId} to user ${userId}`);
  }

  getUserIdBySession(sessionId: string): string | null {
    const mapping = this.sessionMappings.get(sessionId);
    if (mapping) {
      mapping.lastActivity = new Date();
      this.sessionMappings.set(sessionId, mapping); // Update LRU order
      return mapping.userId;
    }
    return null;
  }

  isSessionAuthenticated(sessionId: string): boolean {
    return this.getUserIdBySession(sessionId) !== null;
  }

  removeSession(sessionId: string): void {
    this.sessionMappings.delete(sessionId);
    console.log(`🗑️ Removed session ${sessionId}`);
  }

  getSessionStats() {
    const sessions = Array.from(this.sessionMappings.values());
    const now = new Date();
    
    return {
      totalSessions: sessions.length,
      authenticatedSessions: sessions.length,
      recentSessions: sessions.filter(s => 
        now.getTime() - s.lastActivity.getTime() < 60 * 60 * 1000 // 1小时内活跃
      ).length,
      oldestSession: sessions.length > 0 ? 
        Math.min(...sessions.map(s => s.createdAt.getTime())) : null,
    };
  }

  // 健康检查方法
  async healthCheck(): Promise<{
    defaultInstance: boolean;
    userInstances: number;
    sessions: number;
    instanceHealth: Record<string, boolean>;
  }> {
    const defaultInstance = this.instanceManager.getDefaultInstance();
    const stats = this.instanceManager.getStats();
    
    // 检查所有实例的健康状态
    const instanceHealth: Record<string, boolean> = {};
    
    if (defaultInstance) {
      instanceHealth[defaultInstance.id] = await this.instanceManager.isInstanceHealthy(defaultInstance.id);
    }
    
    for (const [instanceId] of this.instances) {
      instanceHealth[instanceId] = await this.instanceManager.isInstanceHealthy(instanceId);
    }
    
    return {
      defaultInstance: defaultInstance?.status === 'running',
      userInstances: stats.runningInstances,
      sessions: this.sessionMappings.size,
      instanceHealth,
    };
  }

  // 后备工具列表
  private getFallbackTools(): any[] {
    return [
      {
        name: 'feishu_get_calendar_events',
        description: 'Get calendar events from Feishu',
        inputSchema: {
          type: 'object',
          properties: {
            start_time: { 
              type: 'string', 
              description: 'Start time in ISO format' 
            },
            end_time: { 
              type: 'string', 
              description: 'End time in ISO format' 
            }
          },
          required: ['start_time', 'end_time']
        }
      },
      {
        name: 'feishu_send_message',
        description: 'Send message to Feishu chat',
        inputSchema: {
          type: 'object',
          properties: {
            chat_id: { 
              type: 'string', 
              description: 'Chat ID or user ID' 
            },
            message: { 
              type: 'string', 
              description: 'Message content' 
            }
          },
          required: ['chat_id', 'message']
        }
      },
      {
        name: 'feishu_create_document',
        description: 'Create a new document in Feishu',
        inputSchema: {
          type: 'object',
          properties: {
            title: { 
              type: 'string', 
              description: 'Document title' 
            },
            content: { 
              type: 'string', 
              description: 'Document content' 
            }
          },
          required: ['title']
        }
      }
    ];
  }

  // 后备能力配置
  private getFallbackCapabilities(): any {
    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {
          listChanged: true
        },
        resources: {
          listChanged: true
        }
      },
      serverInfo: {
        name: 'lark-openapi-mcp',
        version: '0.4.0'
      }
    };
  }
}