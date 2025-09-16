# PostgreSQL 整合部署指南

## 📋 概述

本文档详细说明 Claude Relay Service PostgreSQL 数据库整合的部署流程，包括环境准备、配置更新、数据迁移和监控设置。

### 🎯 部署目标

- **零宕机部署**：保证服务连续性
- **数据完整性**：确保数据迁移过程无丢失
- **性能保证**：部署后性能不低于现有水平
- **快速回滚**：5分钟内回滚到原架构的能力

## 🏗️ 部署架构

### 部署拓扑图
```
┌─────────────────────────────────────┐
│           Load Balancer             │
└─────────────────┬───────────────────┘
                  │
    ┌─────────────┴─────────────┐
    │                           │
┌───▼────┐                 ┌───▼────┐
│ App v1 │                 │ App v2 │
│(Redis) │                 │(Hybrid)│
└────────┘                 └───┬────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
    ┌───▼────┐            ┌───▼────┐            ┌───▼────┐
    │ Redis  │            │Postgres│            │Monitor │
    │Primary │            │Primary │            │        │
    └────────┘            └────────┘            └────────┘
```

## 🚀 分阶段部署计划

### Phase 1: 环境准备 (30分钟)

#### 1.1 Docker 环境更新

**更新 docker-compose.yml**
```yaml
version: '3.8'

services:
  # PostgreSQL 服务
  postgres:
    image: postgres:15-alpine
    container_name: claude_relay_postgres
    environment:
      POSTGRES_DB: claude_relay
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/postgres/init.sql:/docker-entrypoint-initdb.d/01-init.sql
      - ./scripts/postgres/extensions.sql:/docker-entrypoint-initdb.d/02-extensions.sql
      - ./config/postgres/postgresql.conf:/etc/postgresql/postgresql.conf
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    command: >
      postgres
      -c config_file=/etc/postgresql/postgresql.conf
      -c log_statement=all
      -c log_min_duration_statement=1000
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres} -d claude_relay"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - claude_network

  # Redis 服务 (保持现有配置)
  redis:
    image: redis:7-alpine
    container_name: claude_relay_redis
    command: >
      redis-server
      --appendonly yes
      --requirepass ${REDIS_PASSWORD}
      --maxmemory 2gb
      --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    ports:
      - "${REDIS_PORT:-6379}:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "--no-auth-warning", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3
    restart: unless-stopped
    networks:
      - claude_network

  # 应用服务
  app:
    build: .
    container_name: claude_relay_app
    environment:
      - NODE_ENV=production
      - POSTGRES_HOST=postgres
      - POSTGRES_PORT=5432
      - POSTGRES_DB=claude_relay
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - ENABLE_POSTGRES=${ENABLE_POSTGRES:-false}
      - MIGRATION_MODE=${MIGRATION_MODE:-hybrid}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "${APP_PORT:-3000}:3000"
    volumes:
      - ./logs:/app/logs
      - ./config:/app/config
    networks:
      - claude_network
    restart: unless-stopped

  # 监控服务 (可选)
  postgres_exporter:
    image: prometheuscommunity/postgres-exporter:latest
    container_name: postgres_exporter
    environment:
      DATA_SOURCE_NAME: "postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/claude_relay?sslmode=disable"
    ports:
      - "9187:9187"
    depends_on:
      - postgres
    networks:
      - claude_network

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local

networks:
  claude_network:
    driver: bridge
```

#### 1.2 环境变量配置

**更新 .env 文件**
```bash
# PostgreSQL 配置
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=claude_relay
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_strong_password_here

# 连接池配置
POSTGRES_POOL_MIN=5
POSTGRES_POOL_MAX=20
POSTGRES_IDLE_TIMEOUT=30000
POSTGRES_CONNECTION_TIMEOUT=60000

# SSL 配置（生产环境推荐）
POSTGRES_SSL=false
POSTGRES_SSL_CA_PATH=
POSTGRES_SSL_CERT_PATH=
POSTGRES_SSL_KEY_PATH=

# 整合配置
ENABLE_POSTGRES=false          # 初始为 false，后续逐步开启
MIGRATION_MODE=preparation     # preparation -> hybrid -> postgres_primary
ENABLE_DUAL_WRITE=false        # 双写模式开关
CACHE_TTL_SECONDS=3600         # 缓存 TTL

# 监控配置
ENABLE_POSTGRES_MONITORING=true
SLOW_QUERY_THRESHOLD=1000      # 慢查询阈值（毫秒）
LOG_ALL_QUERIES=false          # 是否记录所有查询
```

#### 1.3 PostgreSQL 配置优化

**config/postgres/postgresql.conf**
```ini
# 连接配置
listen_addresses = '*'
port = 5432
max_connections = 100
shared_preload_libraries = 'pg_stat_statements'

# 内存配置
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB

# WAL 配置
wal_level = replica
max_wal_size = 1GB
min_wal_size = 80MB
checkpoint_completion_target = 0.9

# 查询优化
random_page_cost = 1.1
seq_page_cost = 1.0
effective_io_concurrency = 200

# 日志配置
logging_collector = on
log_directory = 'pg_log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_statement = 'ddl'
log_min_duration_statement = 1000
log_line_prefix = '[%t] %u@%d %p %r: '

# 监控配置
track_activities = on
track_counts = on
track_functions = on
track_io_timing = on
```

### Phase 2: 数据库初始化 (20分钟)

#### 2.1 数据库初始化脚本

**scripts/postgres/init.sql**
```sql
-- 创建扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 创建用户和数据库（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'claude_app') THEN
        CREATE USER claude_app WITH PASSWORD 'app_password';
    END IF;
END
$$;

-- 授权
GRANT CONNECT ON DATABASE claude_relay TO claude_app;
GRANT USAGE ON SCHEMA public TO claude_app;
GRANT CREATE ON SCHEMA public TO claude_app;

-- 创建应用专用 schema
CREATE SCHEMA IF NOT EXISTS claude_data AUTHORIZATION claude_app;
GRANT ALL PRIVILEGES ON SCHEMA claude_data TO claude_app;
```

**scripts/postgres/extensions.sql**
```sql
-- 创建加密函数
CREATE OR REPLACE FUNCTION encrypt_sensitive_data(data TEXT, key TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN encode(encrypt(data::BYTEA, key::BYTEA, 'aes'), 'hex');
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Encryption failed: %', SQLERRM;
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrypt_sensitive_data(encrypted_data TEXT, key TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN convert_from(decrypt(decode(encrypted_data, 'hex'), key::BYTEA, 'aes'), 'UTF8');
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Decryption failed: %', SQLERRM;
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建更新时间戳触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

#### 2.2 表结构创建脚本

**scripts/postgres/create_tables.sql**
```sql
-- 使用应用 schema
SET search_path TO claude_data, public;

-- 创建 API Keys 表
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    api_key_hash VARCHAR(255) UNIQUE NOT NULL,

    -- 配额和限制
    token_limit BIGINT DEFAULT 0,
    concurrency_limit INTEGER DEFAULT 0,
    daily_cost_limit DECIMAL(10,2) DEFAULT 0,
    weekly_opus_cost_limit DECIMAL(10,2) DEFAULT 0,

    -- 速率限制
    rate_limit_window INTEGER,
    rate_limit_requests INTEGER,
    rate_limit_cost DECIMAL(10,2),

    -- 权限和状态
    permissions VARCHAR(50) DEFAULT 'all',
    is_active BOOLEAN DEFAULT true,

    -- 限制配置
    enable_model_restriction BOOLEAN DEFAULT false,
    restricted_models JSONB DEFAULT '[]',
    enable_client_restriction BOOLEAN DEFAULT false,
    allowed_clients JSONB DEFAULT '[]',

    -- 过期配置
    expires_at TIMESTAMP,
    expiration_mode VARCHAR(20) DEFAULT 'fixed',
    activation_days INTEGER DEFAULT 0,
    activated_at TIMESTAMP,

    -- 元数据
    tags JSONB DEFAULT '[]',
    icon TEXT,

    -- 时间戳
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP,

    -- 约束
    CONSTRAINT api_keys_permissions_check
        CHECK (permissions IN ('claude', 'gemini', 'openai', 'all')),
    CONSTRAINT api_keys_expiration_mode_check
        CHECK (expiration_mode IN ('fixed', 'activation')),
    CONSTRAINT api_keys_token_limit_check
        CHECK (token_limit >= 0),
    CONSTRAINT api_keys_expires_at_check
        CHECK (expires_at IS NULL OR expires_at > created_at)
);

-- 创建更新触发器
CREATE TRIGGER update_api_keys_updated_at
    BEFORE UPDATE ON api_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 创建索引
CREATE INDEX idx_api_keys_hash ON api_keys(api_key_hash);
CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;
CREATE INDEX idx_api_keys_expires_at ON api_keys(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_api_keys_permissions ON api_keys(permissions);
CREATE INDEX idx_api_keys_created_at ON api_keys(created_at DESC);

-- 其他表结构... (Claude accounts, usage statistics, sessions 等)
-- 详见 data-model.md 文档
```

### Phase 3: 应用部署 (60分钟)

#### 3.1 代码部署准备

**部署前检查清单**
```bash
#!/bin/bash
# scripts/pre-deployment-check.sh

echo "🔍 部署前检查..."

# 1. 检查 Docker 环境
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose 未安装"
    exit 1
fi

# 2. 检查环境变量
required_vars=(
    "POSTGRES_PASSWORD"
    "REDIS_PASSWORD"
    "JWT_SECRET"
    "ENCRYPTION_KEY"
)

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ 环境变量 $var 未设置"
        exit 1
    fi
done

# 3. 检查配置文件
config_files=(
    ".env"
    "config/config.js"
    "docker-compose.yml"
)

for file in "${config_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ 配置文件 $file 不存在"
        exit 1
    fi
done

# 4. 检查数据库连接
echo "🔍 测试数据库连接..."
docker run --rm --network=host postgres:15-alpine \
    pg_isready -h localhost -p ${POSTGRES_PORT:-5432} -U ${POSTGRES_USER:-postgres}

if [ $? -eq 0 ]; then
    echo "✅ PostgreSQL 连接正常"
else
    echo "❌ PostgreSQL 连接失败"
    exit 1
fi

# 5. 检查 Redis 连接
echo "🔍 测试 Redis 连接..."
docker run --rm --network=host redis:7-alpine \
    redis-cli -h localhost -p ${REDIS_PORT:-6379} -a ${REDIS_PASSWORD} ping

if [ $? -eq 0 ]; then
    echo "✅ Redis 连接正常"
else
    echo "❌ Redis 连接失败"
    exit 1
fi

echo "✅ 部署前检查通过"
```

#### 3.2 滚动部署脚本

**scripts/deploy.sh**
```bash
#!/bin/bash
set -e

DEPLOYMENT_MODE=${1:-"hybrid"}  # preparation, hybrid, postgres_primary
ROLLBACK=${2:-false}

echo "🚀 开始部署 PostgreSQL 整合 (模式: $DEPLOYMENT_MODE)"

# 备份当前配置
echo "📋 备份当前配置..."
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
cp docker-compose.yml docker-compose.yml.backup.$(date +%Y%m%d_%H%M%S)

# 设置部署模式
case $DEPLOYMENT_MODE in
    "preparation")
        export ENABLE_POSTGRES=false
        export MIGRATION_MODE=preparation
        export ENABLE_DUAL_WRITE=false
        ;;
    "hybrid")
        export ENABLE_POSTGRES=true
        export MIGRATION_MODE=hybrid
        export ENABLE_DUAL_WRITE=true
        ;;
    "postgres_primary")
        export ENABLE_POSTGRES=true
        export MIGRATION_MODE=postgres_primary
        export ENABLE_DUAL_WRITE=false
        ;;
    *)
        echo "❌ 未知部署模式: $DEPLOYMENT_MODE"
        exit 1
        ;;
esac

# 更新环境变量
echo "⚙️  更新环境配置..."
sed -i "s/ENABLE_POSTGRES=.*/ENABLE_POSTGRES=$ENABLE_POSTGRES/" .env
sed -i "s/MIGRATION_MODE=.*/MIGRATION_MODE=$MIGRATION_MODE/" .env
sed -i "s/ENABLE_DUAL_WRITE=.*/ENABLE_DUAL_WRITE=$ENABLE_DUAL_WRITE/" .env

# 构建新镜像
echo "🔨 构建应用镜像..."
docker-compose build app

# 数据库准备
if [ "$DEPLOYMENT_MODE" != "preparation" ]; then
    echo "🗄️  准备 PostgreSQL..."

    # 启动 PostgreSQL（如果未运行）
    docker-compose up -d postgres

    # 等待 PostgreSQL 就绪
    echo "⏳ 等待 PostgreSQL 就绪..."
    timeout 60s bash -c 'until docker-compose exec postgres pg_isready -U ${POSTGRES_USER:-postgres}; do sleep 2; done'

    # 执行数据库初始化
    echo "📊 初始化数据库表结构..."
    docker-compose exec postgres psql -U ${POSTGRES_USER:-postgres} -d claude_relay -f /docker-entrypoint-initdb.d/01-init.sql
    docker-compose exec -T postgres psql -U ${POSTGRES_USER:-postgres} -d claude_relay < scripts/postgres/create_tables.sql
fi

# 应用部署
echo "🚀 部署应用..."

# 滚动更新（蓝绿部署）
if [ "$ROLLBACK" = "false" ]; then
    # 启动新版本
    docker-compose up -d app

    # 健康检查
    echo "🔍 健康检查..."
    timeout 120s bash -c 'until curl -f http://localhost:${APP_PORT:-3000}/health; do sleep 5; done'

    if [ $? -eq 0 ]; then
        echo "✅ 新版本部署成功"

        # 运行数据迁移（如果需要）
        if [ "$DEPLOYMENT_MODE" = "hybrid" ]; then
            echo "🔄 开始数据迁移..."
            docker-compose exec app npm run migrate:start
        fi
    else
        echo "❌ 健康检查失败，开始回滚..."
        docker-compose down app
        docker-compose up -d app
        exit 1
    fi
else
    # 回滚操作
    echo "🔙 执行回滚..."
    cp .env.backup.* .env 2>/dev/null || true
    cp docker-compose.yml.backup.* docker-compose.yml 2>/dev/null || true
    docker-compose up -d app
fi

# 清理旧镜像
echo "🧹 清理旧镜像..."
docker image prune -f

echo "✅ 部署完成！"
echo "📊 部署状态:"
echo "   模式: $DEPLOYMENT_MODE"
echo "   PostgreSQL: $([ "$ENABLE_POSTGRES" = "true" ] && echo "启用" || echo "禁用")"
echo "   双写模式: $([ "$ENABLE_DUAL_WRITE" = "true" ] && echo "启用" || echo "禁用")"
```

### Phase 4: 数据迁移 (90分钟)

#### 4.1 迁移脚本

**scripts/migrate/migrate.js**
```javascript
const { migrateApiKeys } = require('./migrate-api-keys')
const { migrateAccounts } = require('./migrate-accounts')
const { migrateUsageStats } = require('./migrate-usage-stats')
const { migrateSessions } = require('./migrate-sessions')
const logger = require('../../src/utils/logger')

async function runMigration() {
  const startTime = Date.now()
  logger.info('🚀 开始数据迁移...')

  try {
    // Phase 1: 迁移核心数据
    await migrateApiKeys()
    await migrateAccounts()

    // Phase 2: 迁移使用统计
    await migrateUsageStats()

    // Phase 3: 迁移会话数据
    await migrateSessions()

    const duration = Date.now() - startTime
    logger.info(`✅ 数据迁移完成，耗时: ${Math.round(duration / 1000)}秒`)

  } catch (error) {
    logger.error('❌ 数据迁移失败:', error)
    throw error
  }
}

if (require.main === module) {
  runMigration().catch(console.error)
}

module.exports = { runMigration }
```

#### 4.2 监控和回滚

**监控部署状态脚本**
```bash
#!/bin/bash
# scripts/monitor-deployment.sh

echo "📊 监控部署状态..."

while true; do
    # 检查服务状态
    APP_STATUS=$(docker-compose ps app --format=json | jq -r '.[0].State')
    POSTGRES_STATUS=$(docker-compose ps postgres --format=json | jq -r '.[0].State')
    REDIS_STATUS=$(docker-compose ps redis --format=json | jq -r '.[0].State')

    # 检查健康状况
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health || echo "000")

    # 检查错误率
    ERROR_COUNT=$(docker-compose logs app --since=5m | grep -c "ERROR" || echo "0")

    echo "$(date '+%Y-%m-%d %H:%M:%S') - App:$APP_STATUS DB:$POSTGRES_STATUS Redis:$REDIS_STATUS HTTP:$HTTP_STATUS Errors:$ERROR_COUNT"

    # 告警条件
    if [ "$HTTP_STATUS" != "200" ] || [ "$ERROR_COUNT" -gt "10" ]; then
        echo "⚠️  检测到异常，可能需要回滚"

        # 自动回滚条件
        if [ "$ERROR_COUNT" -gt "50" ]; then
            echo "🚨 错误率过高，自动触发回滚"
            ./scripts/deploy.sh hybrid true
            break
        fi
    fi

    sleep 30
done
```

## 📊 监控和告警

### 监控指标配置

**config/monitoring/postgres_metrics.yml**
```yaml
# PostgreSQL 监控指标
postgres_metrics:
  connection_pool:
    - metric: "active_connections"
      threshold: 80
      alert: "warning"
    - metric: "waiting_connections"
      threshold: 5
      alert: "critical"

  performance:
    - metric: "avg_query_time"
      threshold: 1000  # ms
      alert: "warning"
    - metric: "slow_queries_per_minute"
      threshold: 10
      alert: "warning"

  replication:
    - metric: "lag_seconds"
      threshold: 30
      alert: "critical"

  storage:
    - metric: "disk_usage_percent"
      threshold: 80
      alert: "warning"
    - metric: "table_bloat_percent"
      threshold: 20
      alert: "warning"
```

### 告警通知配置

**scripts/alerts/webhook-notifier.js**
```javascript
const axios = require('axios')
const config = require('../../config/config')

class AlertManager {
  async sendAlert(alert) {
    const message = {
      text: `🚨 Claude Relay Alert`,
      attachments: [{
        color: this.getAlertColor(alert.level),
        title: alert.title,
        text: alert.message,
        fields: [
          { title: "Service", value: alert.service, short: true },
          { title: "Metric", value: alert.metric, short: true },
          { title: "Value", value: alert.value, short: true },
          { title: "Threshold", value: alert.threshold, short: true },
          { title: "Time", value: new Date().toISOString(), short: false }
        ]
      }]
    }

    if (config.alerts.webhookUrl) {
      await axios.post(config.alerts.webhookUrl, message)
    }

    // 写入日志
    logger.error('Alert triggered:', alert)
  }

  getAlertColor(level) {
    switch (level) {
      case 'critical': return '#ff0000'
      case 'warning': return '#ffaa00'
      case 'info': return '#0099ff'
      default: return '#808080'
    }
  }
}
```

## 🔙 回滚计划

### 快速回滚步骤

1. **停止当前服务**
   ```bash
   docker-compose down app
   ```

2. **恢复配置文件**
   ```bash
   cp .env.backup.* .env
   cp docker-compose.yml.backup.* docker-compose.yml
   ```

3. **重启纯 Redis 模式**
   ```bash
   export ENABLE_POSTGRES=false
   docker-compose up -d app
   ```

4. **验证回滚成功**
   ```bash
   curl http://localhost:3000/health
   ```

### 数据回滚策略

- **Redis 数据保留**：迁移过程中 Redis 数据始终保留
- **PostgreSQL 数据备份**：每次迁移前自动备份
- **分阶段回滚**：支持部分功能回滚到 Redis

## 📈 性能基准和验证

### 部署后验证清单

- [ ] API 响应时间 < 200ms (95th percentile)
- [ ] 数据库连接池利用率 < 80%
- [ ] 缓存命中率 > 90%
- [ ] 错误率 < 0.1%
- [ ] 内存使用量 < 2GB
- [ ] CPU 使用率 < 60%

### 性能测试脚本

**scripts/performance/load-test.js**
```javascript
const autocannon = require('autocannon')

async function runLoadTest() {
  console.log('🚀 开始性能测试...')

  const result = await autocannon({
    url: 'http://localhost:3000',
    connections: 100,
    duration: 60,
    requests: [
      {
        method: 'POST',
        path: '/api/v1/messages',
        headers: {
          'Authorization': 'Bearer test-key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-3-sonnet-20240229',
          messages: [{ role: 'user', content: 'Hello' }]
        })
      }
    ]
  })

  console.log('📊 性能测试结果:')
  console.log(`请求总数: ${result.requests.total}`)
  console.log(`平均延迟: ${result.latency.mean}ms`)
  console.log(`95% 延迟: ${result.latency.p95}ms`)
  console.log(`错误率: ${(result.errors / result.requests.total * 100).toFixed(2)}%`)

  return result
}

if (require.main === module) {
  runLoadTest().catch(console.error)
}
```

---

**文档版本**: v1.0
**创建时间**: 2025-09-16
**负责团队**: DevOps-Expert + Database-Expert
**审核状态**: 待审核