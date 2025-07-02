# LarkGate – 项目需求说明书

> **版本**：v0.2  **最后更新**：2025‑07‑01

---

## 1. 项目背景

### 1.1 业务痛点（当前最突出）

* **官方 `lark-openapi-mcp` 已支持 App Access Token 与 User Access Token，但 UAT 需要人工粘贴且仅 2 小时有效**：

  * 每位用户必须手动获取并输入 `user_access_token`，体验差。
  * 令牌过期后需再次粘贴，无法在长对话或后台任务中持续调用飞书 API。
* **公网直接暴露 MCP 端口**：如果 `APP_SECRET` 或 UAT 泄漏，外部可绕过身份校验直接调用飞书 OpenAPI，存在高风险。

### 1.2 解决思路 解决思路

* 在官方 MCP 前新增 **LarkGate Gateway**：

  * 提供 OAuth 2.0 授权，安全获取并管理 `user_access_token / refresh_token`。
  * 通过 SSE / Streamable HTTP 与 Claude 等 LLM 工具通信。
  * 注入用户令牌后再代理到内部 MCP，最小化外网暴露面。

---

## 2. 目标与范围

* **目标**

  * 让 Claude / Cherry Studio 在无需粘贴 Token 的情况下安全调用飞书 API。
  * 支持多用户并发、权限隔离与日志合规。

* **MVP 范围**

  * OAuth Authorize Code Flow（自动刷新）
  * SSE 双通道（`/sse` + `/messages`）
  * 内存 LRU 缓存 + 本地文件快照
  * JSON 日志脱敏

* **不在当前范围**\*\*

  * 多实例粘滞会话（计划 v0.2）。
  * Streamable HTTP 支持（计划 v0.3）。

---

## 3. 高层架构

```mermaid
flowchart LR
    subgraph Public
        Claude[Claude / Cherry Studio]
    end
    Claude -- HTTPS SSE --> Gateway((LarkGate))
    Gateway -- HTTP JSON--> MCP[lark-openapi-mcp]
    MCP -- Feishu OpenAPI --> Feishu[(Feishu API)]
    Gateway <-- OAuth 2.0 -- Feishu
    Gateway <---> Redis[(Redis)]
```

---

## 4. 功能需求

### 4.1 API 端点

* **GET `/sse`**：建立 SSE 下行通道，首帧返回 `endpoint` 与 `metadata`（含 OAuth 链接）。
* **POST `/messages?sessionId=...`**：上行 JSON‑RPC；网关注入 Access Token 后转发至 MCP。
* **GET `/oauth/start`**：重定向到飞书官方授权页。
* **GET `/oauth/callback`**：换取 `user_access_token`、`refresh_token` 并保存；完成后展示“授权成功”提示。

### 4.2 身份认证模式

* **手动模式**：

  * 用户在 Claude 弹窗粘贴 `user_access_token`（UAT）。
  * 适用于内部调试；无 `refresh_token`，2 小时需重新粘贴。

* **OAuth 模式（推荐生产）**：

  * Gateway 引导用户完成 OAuth 2.0，获取 `UAT + refresh_token`。
  * 后台使用 `offline_access` 刷新，用户 30 天内无需再次授权。

* **注入方式**：代理到 MCP 时附加 `Authorization: Bearer <UAT>`。

### 4.3 安全与限流

* 单 `sessionId` 限 50 req/min；单 IP 限 200 req/min。
* `refresh_token` AES‑256‑GCM 加密后存 Redis；密钥置于 KMS。
* 日志默认脱敏（`arguments` 字段仅存 SHA‑256 摘要）。

---

## 5. 非功能需求

* **可靠性**：SSE 长连接 95% 1 h 存活；断链 ≤ 3 s 自动重连。
* **安全性**：仅开放 443；TLS 1.2+；HSTS。
* **性能**：Cloud Run 并发 80 时，P99 延迟 < 300 ms。
* **监控**：Prometheus 指标—活跃连接数、限流命中、MCP 4xx/5xx；Grafana 报警。

---

## 6. 技术选型

* **运行时**：Node 20 + TypeScript (ESM)

* **框架**：Fastify 4（内置 HTTP/2）

* **存储层**

  * **内存 LRU Cache**：使用 `lru-cache`（或同类库）在进程内保存 `sessionId ↔ union_id` 与 `union_id ↔ refresh_token`。
  * **文件快照**：每 10 分钟把缓存序列化成 JSON 保存到 `./data/token-snapshot.json`，启动时自动加载，重启不中断。
  * **无外部依赖**：部署零附加服务，适合单实例场景。

* **内部 MCP**：`lark-openapi-mcp` 子模块\*\*：`lark-openapi-mcp` 子模块

* **部署**

  * **开发环境**：直接 `node 20` 在 macOS 运行 `pnpm dev`；无需 Docker。
  * **小规模上线**：macOS/Linux 服务器通过 `pm2 / systemd` 启动 Gateway 和 MCP；
  * **可选**：Docker Compose 方案仅在需要一键打包或迁移至云主机时使用。

* **CI/CD**：GitHub Actions → 拉取代码 → PM2 Reload（或手动脚本）\*\*：GitHub Actions → Cloud Build → CVM Rolling

> **说明**：
>
> * 若只跑单实例，`LRU Map` 内存存储即可满足 30 天 token 保留（刷新周期写入磁盘快照或利用 `node-cache` TTL）。
> * 当需要水平扩容或保障宕机恢复时，启用 Redis；Docker 镜像 20 MB，Compose 一行即可，不会显著增加运维复杂度。

---

## 7. 任务分解与里程碑 任务分解与里程碑

* **M0 基础 PoC**（@Dev1，2025‑07‑02）

  * Gateway `/sse` 连通 MCP，成功返回工具列表。
* **M1 OAuth Flow**（@Dev1，07‑02）

  * 完成授权跳转、Token 存储与刷新。

---

## 8. 开放问题

1. 是否需要同时支持 Streamable HTTP？

---

## 9. 参考资料

* Anthropic Custom Integration 指南 [https://support.anthropic.com/](https://support.anthropic.com/)
* lark‑openapi‑mcp GitHub [https://github.com/larksuite/lark-openapi-mcp](https://github.com/larksuite/lark-openapi-mcp)
* 飞书 OAuth 2.0 文档 [https://open.feishu.cn/document/](https://open.feishu.cn/document/)

---