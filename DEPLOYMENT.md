# LarkGate 生产部署指南

## 🚀 服务器部署配置

### 1. 域名和SSL配置

**生产域名**: `your-domain.com` (替换为你的实际域名)

### 2. 环境变量配置

复制生产环境配置：
```bash
cp .env.production .env
```

**关键配置变更**：
- **FEISHU_REDIRECT_URI**: `https://your-domain.com/oauth/callback`
- **FEISHU_APP_ID**: 你的生产环境飞书应用ID
- **FEISHU_APP_SECRET**: 你的生产环境飞书应用密钥
- **PORT**: 3000 (或根据服务器配置调整)
- **HOST**: 0.0.0.0 (允许外部访问)

### 3. 飞书应用配置更新

登录 [飞书开放平台](https://open.feishu.cn/app)，更新你的应用设置：

1. **重定向URI**: 添加 `https://your-domain.com/oauth/callback`
2. **域名白名单**: 添加 `your-domain.com`
3. **权限范围**: 确保包含 `contact:user.id:readonly`

### 4. 服务器要求

- **Node.js**: 20.x 或更高版本
- **内存**: 最少 512MB，推荐 1GB+
- **CPU**: 1 核心最少，推荐 2 核心+
- **存储**: 最少 1GB 可用空间
- **网络**: 80/443 端口开放

### 5. 部署步骤

#### A. 使用 PM2 部署（推荐）

```bash
# 1. 克隆仓库
git clone https://github.com/danachy/LarkGate.git
cd LarkGate

# 2. 安装依赖
npm install --production

# 3. 配置环境变量
cp .env.production .env
# 编辑 .env 文件，填入真实的凭据

# 4. 构建项目
npm run build

# 5. 安装 PM2
npm install -g pm2

# 6. 启动服务
pm2 start ecosystem.config.js

# 7. 保存 PM2 配置
pm2 save
pm2 startup
```

#### B. 使用 Docker 部署

```bash
# 1. 构建镜像
docker build -t larkgate .

# 2. 运行容器
docker run -d \
  --name larkgate \
  -p 3000:3000 \
  --env-file .env.production \
  larkgate
```

#### C. 使用 systemd 部署

```bash
# 1. 创建服务文件
sudo nano /etc/systemd/system/larkgate.service

# 2. 服务内容见下方配置
# 3. 启动服务
sudo systemctl enable larkgate
sudo systemctl start larkgate
```

### 6. Nginx 反向代理配置

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # SSE 特殊配置
    location /sse {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
        proxy_connect_timeout 75s;
    }
}
```

### 7. systemd 服务配置

创建 `/etc/systemd/system/larkgate.service`：

```ini
[Unit]
Description=LarkGate - Feishu OpenAPI Gateway
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/LarkGate
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 8. PM2 生态系统配置

创建 `ecosystem.config.js`：

```javascript
module.exports = {
  apps: [{
    name: 'larkgate',
    script: 'dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    log_file: 'logs/combined.log',
    time: true
  }]
};
```

### 9. 健康检查

部署完成后，验证服务：

```bash
# 健康检查
curl https://your-domain.com/health

# SSE 连接测试
curl -N https://your-domain.com/sse?sessionId=test

# OAuth 流程测试
curl -I https://your-domain.com/oauth/start?sessionId=test
```

### 10. 监控和日志

- **日志位置**: `logs/` 目录
- **健康检查**: `GET /health`
- **监控指标**: 可集成 Prometheus + Grafana

### 11. 安全建议

- 使用 HTTPS (SSL/TLS)
- 配置防火墙，只开放必要端口
- 定期更新依赖包
- 配置日志轮转
- 监控系统资源使用

### 12. 故障排除

常见问题：
- **端口占用**: `netstat -tulpn | grep :3000`
- **权限问题**: 确保文件权限正确
- **内存不足**: 检查系统资源
- **SSL 证书**: 验证证书配置