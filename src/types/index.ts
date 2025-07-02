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

export interface SSEMetadata {
  endpoint: string;
  oauth_url?: string;
  session_id: string;
  authenticated: boolean;
}

export interface MCPRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: string;
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface Config {
  port: number;
  host: string;
  feishu: {
    app_id: string;
    app_secret: string;
    redirect_uri: string;
  };
  mcp: {
    host: string;
    port: number;
  };
  rate_limit: {
    per_session: number;
    per_ip: number;
    window_ms: number;
  };
  storage: {
    snapshot_interval_ms: number;
    token_ttl_ms: number;
  };
}