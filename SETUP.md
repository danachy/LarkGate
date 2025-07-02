# LarkGate Setup Guide

## Prerequisites

- Node.js 20 or higher
- npm, yarn, or pnpm

## Installation

### Option 1: Standard npm install

```bash
npm install
```

### Option 2: If npm has cache issues

```bash
# Clear npm cache and fix permissions (may need sudo)
sudo chown -R $(whoami) ~/.npm
npm cache clean --force
npm install --legacy-peer-deps
```

### Option 3: Use alternative package managers

```bash
# Using pnpm (recommended)
npm install -g pnpm
pnpm install

# Using yarn
npm install -g yarn
yarn install
```

## Configuration

1. Copy environment file:
```bash
cp .env.example .env
```

2. Edit `.env` with your Feishu app credentials:
```env
FEISHU_APP_ID=your_app_id_here
FEISHU_APP_SECRET=your_app_secret_here
```

3. Set up your Feishu app at https://open.feishu.cn/app:
   - Add redirect URI: `http://localhost:3000/oauth/callback`
   - Add permission: `contact:user.id:readonly`

## Starting the Services

### 1. Start MCP Server (Terminal 1)
```bash
# Install lark-openapi-mcp if not already installed
npm install -g @larksuiteoapi/mcp-server

# Start MCP server on port 3001
npx @larksuiteoapi/mcp-server --port 3001
```

### 2. Start LarkGate (Terminal 2)
```bash
# Development mode with hot reload
npm run dev

# Or run directly with tsx
npx tsx src/index.ts
```

## Testing

### Basic Health Check
```bash
curl http://localhost:3000/health
```

### SSE Connection Test
```bash
curl -N http://localhost:3000/sse?sessionId=test123
```

### Run Test Script
```bash
node test-local.js
```

### OAuth Flow Test
1. Visit: `http://localhost:3000/oauth/start?sessionId=test123`
2. Complete Feishu OAuth
3. Check SSE connection for updated metadata

## Troubleshooting

### NPM Cache Issues
If you encounter npm cache permission errors:
```bash
sudo chown -R $(whoami) ~/.npm
npm cache clean --force
```

### Missing Dependencies
If packages are missing, install them individually:
```bash
npm install fastify @fastify/cors @fastify/rate-limit lru-cache node-fetch
npm install -D @types/node tsx typescript
```

### Port Conflicts
If port 3000 or 3001 is in use:
```bash
# Change PORT in .env file
PORT=3002

# Or set via environment
PORT=3002 npm run dev
```

### MCP Connection Failed
Ensure lark-openapi-mcp is running:
```bash
# Check if MCP server is running
curl http://localhost:3001/health

# Or check the process
ps aux | grep mcp
```

## Project Structure

```
LarkGate/
├── src/
│   ├── index.ts          # Main server entry
│   ├── types/            # TypeScript definitions
│   ├── services/         # Core services
│   │   ├── tokenStorage.ts
│   │   ├── oauthService.ts
│   │   └── mcpProxy.ts
│   └── routes/           # API routes
│       ├── oauth.ts
│       ├── sse.ts
│       └── messages.ts
├── data/                 # Token snapshots
├── .env                  # Configuration
└── test-local.js         # Test script
```