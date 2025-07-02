import fetch from 'node-fetch';
import type { Config, MCPRequest, MCPResponse, TokenData } from '../types/index.js';

export class MCPProxy {
  private config: Config;
  private mcpBaseUrl: string;

  constructor(config: Config) {
    this.config = config;
    this.mcpBaseUrl = `http://${config.mcp.host}:${config.mcp.port}`;
  }

  async proxyRequest(request: MCPRequest, tokenData?: TokenData): Promise<MCPResponse> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Inject user access token if available
      if (tokenData) {
        headers['Authorization'] = `Bearer ${tokenData.access_token}`;
      }

      const response = await fetch(`${this.mcpBaseUrl}/mcp`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        return {
          jsonrpc: request.jsonrpc,
          id: request.id,
          error: {
            code: response.status,
            message: `MCP server error: ${response.statusText}`,
          },
        };
      }

      const result = await response.json() as MCPResponse;
      return result;
    } catch (error) {
      console.error('MCP proxy error:', error);
      return {
        jsonrpc: request.jsonrpc,
        id: request.id,
        error: {
          code: -32603,
          message: `Internal error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      };
    }
  }

  async getCapabilities(): Promise<any> {
    try {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'capabilities',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'larkgate',
            version: '0.2.0',
          },
        },
      };

      const response = await this.proxyRequest(request);
      return response.result;
    } catch (error) {
      console.error('Failed to get MCP capabilities:', error);
      return null;
    }
  }

  async maskSensitiveData(request: MCPRequest): Promise<MCPRequest> {
    // Create a copy for logging with sensitive data masked
    const masked = { ...request };
    
    if (masked.params) {
      // Create SHA-256 hash of params for logging
      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256');
      hash.update(JSON.stringify(masked.params));
      masked.params = {
        _hash: hash.digest('hex'),
        _masked: true,
      };
    }
    
    return masked;
  }
}