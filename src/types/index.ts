import type { ChildProcess } from 'child_process';

export interface Config {
  port: number;
  host: string;
  feishu: {
    app_id: string;
    app_secret: string;
    redirect_uri: string;
  };
  lark_mcp: {
    binary_path: string;
    base_port: number;
    default_instance_port: number;
  };
  rate_limit: {
    per_session: number;
    per_ip: number;
    window_ms: number;
  };
  storage: {
    data_dir: string;
    snapshot_interval_ms: number;
    token_ttl_ms: number;
  };
  instance: {
    max_instances: number;
    idle_timeout_ms: number;
    memory_limit_mb: number;
  };
}

export interface RuntimeStats {
  uptime: number;
  memory: NodeJS.MemoryUsage;
  totalInstances: number;
  runningInstances: number;
  errorInstances: number;
  activeSessions: number;
  recentRequests: number;
}

export interface MCPInstance {
  id: string;
  userId: string;
  port: number;
  process: ChildProcess;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  lastActivity: Date;
  createdAt: Date;
  tokenDir: string;
  healthCheckCount?: number;
  errorCount?: number;
  requestCount?: number;
  lastHealthCheck?: Date;
}

export interface SessionMapping {
  sessionId: string;
  userId: string;
  createdAt: Date;
  lastActivity: Date;
}

export interface UserTokens {
  userId: string;
  access_token: string;
  refresh_token: string;
  expires_at: Date;
  tenant_access_token?: string;
  scopes?: string[];
  created_at?: Date;
  updated_at?: Date;
}

export interface MCPRequest {
  jsonrpc: string;
  id?: string | number;
  method: string;
  params?: any;
  meta?: {
    sessionId?: string;
    userId?: string;
    timestamp?: number;
  };
}

export interface MCPResponse {
  jsonrpc: string;
  id?: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  meta?: {
    processingTime?: number;
    instanceId?: string;
    userId?: string;
    timestamp?: number;
  };
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface FeishuUserInfo {
  union_id: string;
  user_id: string;
  name: string;
  en_name?: string;
  avatar_url?: string;
  email?: string;
  mobile?: string;
  tenant_key?: string;
  employee_id?: string;
}

export interface SSEMetadata {
  endpoint: string;
  oauth_url?: string;
  session_id: string;
  authenticated: boolean;
  tools?: any[];
  capabilities?: any;
  gateway_info?: {
    version: string;
    architecture: string;
    instance_count: number;
    uptime: number;
  };
}

// Enhanced interfaces for better monitoring and error handling
export interface InstanceStats {
  totalInstances: number;
  userInstances: number;
  runningInstances: number;
  errorInstances: number;
  defaultInstanceStatus: string;
  averageResponseTime?: number;
  totalRequests?: number;
  errorRate?: number;
}

export interface SessionStats {
  totalSessions: number;
  authenticatedSessions: number;
  recentSessions: number;
  oldestSession: number | null;
  averageSessionDuration?: number;
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  memory: NodeJS.MemoryUsage;
  instances: InstanceStats;
  sessions: SessionStats;
  health: {
    defaultInstance: boolean;
    userInstances: number;
    sessions: number;
    instanceHealth: Record<string, boolean>;
  };
  architecture: string;
  docker_free: boolean;
}

export interface ErrorInfo {
  code: string;
  message: string;
  timestamp: Date;
  instanceId?: string;
  userId?: string;
  sessionId?: string;
  stack?: string;
}

// Legacy interfaces for compatibility
export interface TokenData {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  created_at: number;
}

export interface UserSession {
  sessionId: string;
  unionId?: string;
  tokenData?: TokenData;
  lastActivity: number;
}

export interface OAuthState {
  sessionId: string;
  redirect_uri?: string;
  state: string;
  created_at: number;
}