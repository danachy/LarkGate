# LarkGate

A security gateway for Feishu (Lark) OpenAPI integration that provides OAuth 2.0 authentication and eliminates the need for manual user access token management when using Claude/AI tools.

## Quick Start

### 1. Install Dependencies

```bash
npm install
# or
pnpm install
```

### 2. Configure Environment

Copy the example environment file and configure your Feishu app credentials:

```bash
cp .env.example .env
```

Edit `.env` and set:
- `FEISHU_APP_ID`: Your Feishu app ID
- `FEISHU_APP_SECRET`: Your Feishu app secret  
- `FEISHU_REDIRECT_URI`: OAuth callback URL (default: `http://localhost:3000/oauth/callback`)

### 3. Set up Feishu App

1. Go to [Feishu Open Platform](https://open.feishu.cn/app)
2. Create a new app or use existing one
3. In app settings, add redirect URI: `http://localhost:3000/oauth/callback`
4. Add required permissions: `contact:user.id:readonly`

### 4. Start MCP Server

Make sure `lark-openapi-mcp` is running on port 3001:

```bash
# In a separate terminal
npx @larksuiteoapi/mcp-server
```

### 5. Start LarkGate

```bash
npm run dev
```

LarkGate will start on `http://localhost:3000`

## Usage

### With Claude Desktop

Add this to your Claude Desktop MCP settings:

```json
{
  "mcpServers": {
    "larkgate": {
      "command": "npx",
      "args": ["sse-client", "http://localhost:3000/sse"]
    }
  }
}
```

### Manual Testing

1. **Health Check**: `GET http://localhost:3000/health`
2. **Start OAuth**: `GET http://localhost:3000/oauth/start?sessionId=test123`
3. **SSE Connection**: `GET http://localhost:3000/sse?sessionId=test123`
4. **Send Message**: `POST http://localhost:3000/messages?sessionId=test123`

## API Endpoints

- `GET /sse?sessionId=<id>` - SSE connection with metadata
- `POST /messages?sessionId=<id>` - JSON-RPC proxy to MCP
- `GET /oauth/start?sessionId=<id>` - Start OAuth flow
- `GET /oauth/callback` - OAuth callback handler
- `POST /manual-token?sessionId=<id>` - Set manual token (debug)
- `GET /health` - Health check

## Architecture

```
Claude/AI Tool → SSE → LarkGate → OAuth → Feishu API
                         ↓
                   lark-openapi-mcp
```

## Development

```bash
# Development with hot reload
npm run dev

# Build
npm run build

# Run built version
npm start

# Lint
npm run lint

# Type check
npm run typecheck
```

## Token Management

- **OAuth Mode**: Secure 30-day tokens with automatic refresh
- **Manual Mode**: 2-hour tokens via direct paste (fallback)
- **Storage**: In-memory LRU cache with periodic file snapshots
- **Security**: Rate limiting, request logging with data masking

## Environment Variables

See `.env.example` for all available configuration options.