# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LarkGate is a security gateway for Feishu (Lark) OpenAPI integration that sits between Claude/AI tools and the official `lark-openapi-mcp` server. It provides OAuth 2.0 authentication and token management to eliminate the need for manual user access token pasting.

## Architecture

- **Gateway Layer**: Fastify-based HTTP/SSE server handling OAuth flow and API proxying
- **Authentication**: OAuth 2.0 Authorization Code Flow with automatic token refresh
- **Storage**: In-memory LRU cache with periodic file snapshots (no external dependencies)
- **Communication**: SSE bidirectional channels with Claude/Cherry Studio
- **Security**: Rate limiting, token encryption, and request logging with data masking

## Development Status

This is a new project (v0.2) currently in MVP development phase. The codebase structure indicates:
- No package.json or build configuration files yet
- Documentation-driven development approach
- Target: Node.js 20 + TypeScript (ESM) + Fastify 4
- Planned deployment: PM2/systemd for small scale, Docker Compose optional

## Key Implementation Points

### API Endpoints
- `GET /sse` - SSE downstream channel with OAuth links in metadata
- `POST /messages?sessionId=...` - Upstream JSON-RPC with token injection  
- `GET /oauth/start` - Feishu OAuth authorization redirect
- `GET /oauth/callback` - Token exchange and storage

### Token Management
- Manual mode: Direct UAT pasting (2hr expiry)
- OAuth mode: UAT + refresh_token with 30-day validity
- Storage: AES-256-GCM encrypted refresh tokens
- Injection: `Authorization: Bearer <UAT>` header to MCP

### Rate Limiting
- 50 req/min per sessionId
- 200 req/min per IP

## Documentation References

See `docs/REQUIREMENTS.md` for detailed technical specifications, Mermaid architecture diagrams, and milestone breakdown.