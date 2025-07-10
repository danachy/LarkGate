# LarkGate

A multi-user security gateway for Feishu (Lark) OpenAPI integration that provides OAuth 2.0 authentication and per-user instance isolation when using Claude/AI tools.

## Features

- **Multi-User Architecture**: One lark-mcp instance per user for complete isolation
- **OAuth 2.0 Flow**: Automatic token acquisition and refresh
- **Instance Management**: Dynamic creation and lifecycle management of user instances  
- **Smart Routing**: Request routing based on sessionId to appropriate user instances
- **SSE Communication**: Server-sent events for AI tools integration
- **Resource Management**: Automatic cleanup of idle instances
- **Rate Limiting**: Per-session and per-IP protection
- **Security**: Request logging with data masking

## Quick Start

### 1. Prerequisites

- Docker and Docker Compose
- Feishu (Lark) application credentials

### 2. Get Feishu App Credentials

1. Go to [Feishu Open Platform](https://open.feishu.cn/app)
2. Create a new app or use existing one
3. Note your `App ID` and `App Secret`
4. In app settings:
   - Add redirect URI: `https://your-domain.com/oauth/callback`
   - Add permission: `contact:user.id:readonly`

### 3. Configure Environment

```bash
# Clone the repository
git clone https://github.com/danachy/LarkGate.git
cd LarkGate

# Copy environment template
cp .env.example .env

# Edit configuration
nano .env
```

Update these values in `.env`:
```env
FEISHU_APP_ID=your_app_id_here
FEISHU_APP_SECRET=your_app_secret_here
FEISHU_REDIRECT_URI=https://your-domain.com/oauth/callback
NODE_ENV=production
```

### 4. Deploy with Docker

```bash
# Start all services
npm run docker:up

# View logs
npm run docker:logs

# Stop services
npm run docker:down
```

This starts:
- **LarkGate Gateway** on port 3000
- **Lark MCP Server** on port 3001

## API Endpoints

- `GET /health` - Health check and system status
- `GET /sse?sessionId=<id>` - SSE connection with OAuth metadata
- `POST /messages?sessionId=<id>` - JSON-RPC proxy to MCP
- `GET /oauth/start?sessionId=<id>` - Start OAuth authorization
- `GET /oauth/callback` - OAuth callback handler

## Usage with Claude

### Method 1: Direct SSE Connection
Configure your AI tool to connect to:
```
https://your-domain.com/sse
```

### Method 2: Manual Testing
```bash
# Health check
curl https://your-domain.com/health

# Start OAuth flow
curl https://your-domain.com/oauth/start?sessionId=test123

# SSE connection
curl -N https://your-domain.com/sse?sessionId=test123
```

## Architecture

```
AI Tool → LarkGate Gateway → Lark MCP Server → Feishu API
              ↓
        OAuth 2.0 Flow ←→ Feishu OAuth
```

## Development

For local development without Docker:

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with localhost URLs

# Start development server (LarkGate only)
npm run dev

# In another terminal, start MCP server
npx @larksuiteoapi/lark-mcp mcp --mode sse --port 3001 \
  --app-id YOUR_APP_ID --app-secret YOUR_APP_SECRET
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | LarkGate server port | `3000` |
| `HOST` | Server bind address | `0.0.0.0` |
| `FEISHU_APP_ID` | Feishu application ID | Required |
| `FEISHU_APP_SECRET` | Feishu application secret | Required |
| `FEISHU_REDIRECT_URI` | OAuth callback URL | Required |
| `MCP_HOST` | MCP server hostname | `localhost` (Docker: `lark-mcp`) |
| `MCP_PORT` | MCP server port | `3001` |
| `RATE_LIMIT_PER_SESSION` | Requests per session/minute | `50` |
| `RATE_LIMIT_PER_IP` | Requests per IP/minute | `200` |

### Docker Services

- **lark-mcp**: Official Lark OpenAPI MCP server
- **larkgate**: OAuth gateway and proxy service  
- **larkgate-network**: Internal Docker network

### Important: MCP_HOST Configuration

| Environment | MCP_HOST Value | Explanation |
|-------------|----------------|-------------|
| **Docker Compose** | `lark-mcp` | Container name (auto-configured) |
| **Local Development** | `localhost` | Run MCP server manually |

⚠️ **Note**: When using Docker Compose, the `MCP_HOST` value in your `.env` file is automatically overridden to `lark-mcp` (the container name). You don't need to change it manually.

## Security

- Environment variables are never committed to the repository
- OAuth tokens are encrypted and stored securely
- Request parameters are hashed in logs for privacy
- Rate limiting prevents abuse
- HTTPS required for production OAuth callbacks

## License

MIT License - see LICENSE file for details