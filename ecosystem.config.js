module.exports = {
  apps: [
    {
      name: 'larkgate',
      script: './dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      
      // Resource limits
      max_memory_restart: '1G',
      max_restarts: 10,
      min_uptime: '10s',
      
      // Environment variables
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOST: '0.0.0.0',
        LOG_LEVEL: 'info',
        
        // MCP Configuration
        LARK_MCP_BINARY: 'lark-openapi-mcp',
        LARK_MCP_BASE_PORT: 3001,
        LARK_MCP_DEFAULT_PORT: 4000,
        
        // Instance Management
        MAX_INSTANCES: 20,
        IDLE_TIMEOUT_MS: 1800000, // 30 minutes
        MEMORY_LIMIT_MB: 256,
        
        // Rate Limiting
        RATE_LIMIT_PER_SESSION: 50,
        RATE_LIMIT_PER_IP: 200,
        RATE_LIMIT_WINDOW_MS: 60000,
        
        // Storage
        DATA_DIR: './data',
        SNAPSHOT_INTERVAL_MS: 600000, // 10 minutes
        TOKEN_TTL_MS: 2592000000, // 30 days
        
        // Feishu OAuth (set these in your environment or PM2 config)
        // FEISHU_APP_ID: 'your_app_id',
        // FEISHU_APP_SECRET: 'your_app_secret',
        // FEISHU_REDIRECT_URI: 'https://your-domain.com/oauth/callback',
      },
      
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
        HOST: 'localhost',
        LOG_LEVEL: 'debug',
        
        // Development-specific settings
        LARK_MCP_BINARY: 'lark-openapi-mcp',
        LARK_MCP_BASE_PORT: 3001,
        LARK_MCP_DEFAULT_PORT: 4000,
        
        MAX_INSTANCES: 5,
        IDLE_TIMEOUT_MS: 300000, // 5 minutes for faster cleanup in dev
        
        DATA_DIR: './data',
        FEISHU_REDIRECT_URI: 'http://localhost:3000/oauth/callback',
      },
      
      // Logging
      log_file: './logs/larkgate.log',
      error_file: './logs/larkgate-error.log',
      out_file: './logs/larkgate-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Advanced PM2 settings
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'data'],
      
      // Graceful shutdown
      kill_timeout: 30000,
      listen_timeout: 10000,
      
      // Auto-restart on file changes (development only)
      watch_options: {
        followSymlinks: false,
        usePolling: false,
      },
      
      // Merge logs
      merge_logs: true,
      
      // Time zone
      time: true,
      
      // Source map support
      source_map_support: true,
      
      // Instance variables
      instance_var: 'INSTANCE_ID',
      
      // Cron restart (optional - restart every day at 3 AM)
      cron_restart: '0 3 * * *',
      
      // Autorestart
      autorestart: true,
      
      // Exponential backoff restart delay
      exp_backoff_restart_delay: 100,
    }
  ],
  
  // PM2 deploy configuration (optional)
  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'https://github.com/your-org/larkgate.git',
      path: '/opt/larkgate',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'mkdir -p /opt/larkgate/logs && mkdir -p /opt/larkgate/data',
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};