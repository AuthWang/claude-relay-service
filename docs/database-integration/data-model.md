# PostgreSQL 数据模型设计

## 📋 概述

本文档定义了从 Redis Hash 结构到 PostgreSQL 关系型数据库的数据模型映射方案。

### 🎯 设计原则

- **数据完整性**：利用 PostgreSQL 的约束和外键保证数据一致性
- **查询优化**：设计合理的索引策略提升查询性能
- **向后兼容**：保持与现有 Redis 数据结构的兼容性
- **扩展性**：为未来功能扩展预留空间

## 🗄️ 核心数据模型

### 1. API Keys 表结构

#### **表定义：api_keys**
```sql
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    api_key_hash VARCHAR(255) UNIQUE NOT NULL,

    -- 限制和配额
    token_limit BIGINT DEFAULT 0,
    concurrency_limit INTEGER DEFAULT 0,
    daily_cost_limit DECIMAL(10,2) DEFAULT 0,
    weekly_opus_cost_limit DECIMAL(10,2) DEFAULT 0,

    -- 速率限制
    rate_limit_window INTEGER, -- 秒
    rate_limit_requests INTEGER,
    rate_limit_cost DECIMAL(10,2),

    -- 权限控制
    permissions VARCHAR(50) DEFAULT 'all' CHECK (permissions IN ('claude', 'gemini', 'openai', 'all')),
    is_active BOOLEAN DEFAULT true,

    -- 模型限制
    enable_model_restriction BOOLEAN DEFAULT false,
    restricted_models JSONB DEFAULT '[]',

    -- 客户端限制
    enable_client_restriction BOOLEAN DEFAULT false,
    allowed_clients JSONB DEFAULT '[]',

    -- 账户关联
    claude_account_id UUID REFERENCES claude_accounts(id),
    claude_console_account_id UUID REFERENCES claude_console_accounts(id),
    gemini_account_id UUID REFERENCES gemini_accounts(id),
    openai_account_id UUID REFERENCES openai_accounts(id),
    azure_openai_account_id UUID REFERENCES azure_openai_accounts(id),
    bedrock_account_id UUID REFERENCES bedrock_accounts(id),

    -- 过期设置
    expires_at TIMESTAMP,
    expiration_mode VARCHAR(20) DEFAULT 'fixed' CHECK (expiration_mode IN ('fixed', 'activation')),
    activation_days INTEGER DEFAULT 0,
    activated_at TIMESTAMP,

    -- 标签和元数据
    tags JSONB DEFAULT '[]',
    icon TEXT, -- base64 编码

    -- 时间戳
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP
);

-- 索引策略
CREATE INDEX idx_api_keys_hash ON api_keys(api_key_hash);
CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;
CREATE INDEX idx_api_keys_expires_at ON api_keys(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_api_keys_created_at ON api_keys(created_at);
CREATE INDEX idx_api_keys_permissions ON api_keys(permissions);
```

#### **Redis 到 PostgreSQL 映射**
```javascript
// Redis 结构：apikey:{id}
const redisApiKey = {
  id: "uuid-string",
  name: "My API Key",
  description: "Test key",
  tokenLimit: "1000",
  // ... 其他字段
}

// PostgreSQL 映射函数
function mapApiKeyFromRedis(redisData) {
  return {
    id: redisData.id,
    name: redisData.name,
    description: redisData.description || '',
    api_key_hash: redisData.hashedKey,
    token_limit: parseInt(redisData.tokenLimit) || 0,
    concurrency_limit: parseInt(redisData.concurrencyLimit) || 0,
    daily_cost_limit: parseFloat(redisData.dailyCostLimit) || 0,
    permissions: redisData.permissions || 'all',
    is_active: redisData.isActive !== 'false',
    restricted_models: JSON.parse(redisData.restrictedModels || '[]'),
    allowed_clients: JSON.parse(redisData.allowedClients || '[]'),
    tags: JSON.parse(redisData.tags || '[]'),
    expires_at: redisData.expiresAt ? new Date(redisData.expiresAt) : null,
    created_at: new Date(redisData.createdAt),
    last_used_at: redisData.lastUsedAt ? new Date(redisData.lastUsedAt) : null
  }
}
```

### 2. Claude 账户表结构

#### **表定义：claude_accounts**
```sql
CREATE TABLE claude_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- OAuth 认证信息 (加密存储)
    encrypted_oauth_data TEXT NOT NULL, -- 包含 accessToken, refreshToken 等
    oauth_scopes JSONB DEFAULT '[]',

    -- 代理配置
    proxy_type VARCHAR(20) CHECK (proxy_type IN ('http', 'socks5')),
    proxy_host VARCHAR(255),
    proxy_port INTEGER,
    proxy_username VARCHAR(255),
    encrypted_proxy_password TEXT,

    -- 状态管理
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'rate_limited', 'error')),
    last_token_refresh TIMESTAMP,
    token_expires_at TIMESTAMP,

    -- 限流状态
    rate_limit_reset_at TIMESTAMP,
    rate_limit_remaining INTEGER DEFAULT 0,

    -- 使用统计
    total_requests BIGINT DEFAULT 0,
    total_tokens BIGINT DEFAULT 0,
    total_cost DECIMAL(10,2) DEFAULT 0,

    -- 时间戳
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP
);

-- 索引策略
CREATE INDEX idx_claude_accounts_status ON claude_accounts(status);
CREATE INDEX idx_claude_accounts_token_expires ON claude_accounts(token_expires_at);
CREATE INDEX idx_claude_accounts_last_used ON claude_accounts(last_used_at);
```

### 3. 使用统计表结构

#### **表定义：usage_statistics**
```sql
CREATE TABLE usage_statistics (
    id BIGSERIAL PRIMARY KEY,

    -- 关联信息
    api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
    account_id UUID, -- 可能关联不同类型的账户
    account_type VARCHAR(50), -- 'claude', 'gemini', 'openai' 等

    -- 使用数据
    model_name VARCHAR(100),
    requests_count INTEGER DEFAULT 0,
    input_tokens BIGINT DEFAULT 0,
    output_tokens BIGINT DEFAULT 0,
    total_tokens BIGINT DEFAULT 0,
    cost DECIMAL(10,4) DEFAULT 0,

    -- 时间维度
    usage_date DATE NOT NULL,
    usage_hour INTEGER, -- 0-23，用于小时级统计

    -- 索引和约束
    CONSTRAINT usage_statistics_hour_check CHECK (usage_hour >= 0 AND usage_hour <= 23),
    UNIQUE(api_key_id, account_id, model_name, usage_date, usage_hour)
);

-- 分区表策略（按月分区）
CREATE TABLE usage_statistics_y2025m09 PARTITION OF usage_statistics
    FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');

-- 索引策略
CREATE INDEX idx_usage_statistics_date ON usage_statistics(usage_date DESC);
CREATE INDEX idx_usage_statistics_api_key_date ON usage_statistics(api_key_id, usage_date DESC);
CREATE INDEX idx_usage_statistics_model ON usage_statistics(model_name, usage_date DESC);
CREATE INDEX idx_usage_statistics_account ON usage_statistics(account_id, usage_date DESC);
```

#### **Redis 到 PostgreSQL 统计数据映射**
```javascript
// Redis 结构：usage:daily:{keyId}:{date}
// Redis 结构：usage:model:daily:{model}:{date}
function mapUsageFromRedis(redisUsageData, keyId, date) {
  return {
    api_key_id: keyId,
    usage_date: new Date(date),
    requests_count: parseInt(redisUsageData.requests) || 0,
    input_tokens: parseInt(redisUsageData.input_tokens) || 0,
    output_tokens: parseInt(redisUsageData.output_tokens) || 0,
    total_tokens: parseInt(redisUsageData.total_tokens) || 0,
    cost: parseFloat(redisUsageData.cost) || 0,
    model_name: redisUsageData.model || 'unknown'
  }
}
```

### 4. 会话管理表结构

#### **表定义：user_sessions**
```sql
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token VARCHAR(255) UNIQUE NOT NULL,

    -- 用户信息
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    user_type VARCHAR(20) DEFAULT 'admin', -- 'admin', 'user'

    -- 会话数据
    session_data JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,

    -- 时间管理
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引策略
CREATE INDEX idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);

-- 自动清理过期会话
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM user_sessions WHERE expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;
```

## 🔄 数据迁移映射

### 1. Redis Key 模式映射

#### **现有 Redis Key 模式**
```
apikey:{id}                    → api_keys 表
claude:account:{id}            → claude_accounts 表
session:{token}                → user_sessions 表
usage:daily:{keyId}:{date}     → usage_statistics 表
admin:{id}                     → users 表（管理员）
oauth:{sessionId}              → oauth_sessions 表（临时）
```

#### **数据类型转换规则**
```javascript
const typeConversions = {
  // 字符串数字转换
  stringToInt: (value) => value ? parseInt(value) : 0,
  stringToFloat: (value) => value ? parseFloat(value) : 0,

  // 布尔值转换
  stringToBoolean: (value) => value !== 'false' && value !== '0' && value !== '',

  // JSON 字符串转换
  stringToJson: (value) => {
    try {
      return value ? JSON.parse(value) : null
    } catch {
      return null
    }
  },

  // 时间戳转换
  stringToTimestamp: (value) => value ? new Date(value) : null
}
```

### 2. 批量迁移策略

#### **分批处理机制**
```sql
-- 创建迁移状态表
CREATE TABLE migration_status (
    table_name VARCHAR(100) PRIMARY KEY,
    total_records BIGINT DEFAULT 0,
    migrated_records BIGINT DEFAULT 0,
    failed_records BIGINT DEFAULT 0,
    migration_start TIMESTAMP,
    migration_end TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending' -- 'pending', 'running', 'completed', 'failed'
);

-- 创建迁移日志表
CREATE TABLE migration_logs (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(100),
    redis_key VARCHAR(500),
    operation VARCHAR(50), -- 'migrate', 'validate', 'rollback'
    status VARCHAR(20), -- 'success', 'error'
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 📊 性能优化策略

### 1. 索引设计原则

#### **主要查询模式分析**
```sql
-- 1. API Key 验证（高频）
SELECT id, permissions, is_active FROM api_keys WHERE api_key_hash = ?;
-- 索引：idx_api_keys_hash (UNIQUE)

-- 2. 使用统计查询（中频）
SELECT * FROM usage_statistics
WHERE api_key_id = ? AND usage_date BETWEEN ? AND ?
ORDER BY usage_date DESC;
-- 索引：idx_usage_statistics_api_key_date

-- 3. 账户状态检查（中频）
SELECT status, token_expires_at FROM claude_accounts WHERE id = ?;
-- 索引：主键 + idx_claude_accounts_status

-- 4. 会话验证（高频）
SELECT user_id, expires_at FROM user_sessions WHERE session_token = ?;
-- 索引：idx_user_sessions_token (UNIQUE)
```

### 2. 查询优化

#### **预编译语句**
```javascript
// 准备高频查询的预编译语句
const preparedStatements = {
  getApiKeyByHash: 'SELECT id, permissions, is_active, expires_at FROM api_keys WHERE api_key_hash = $1',
  getAccountStatus: 'SELECT status, token_expires_at FROM claude_accounts WHERE id = $1',
  getSessionData: 'SELECT user_id, session_data, expires_at FROM user_sessions WHERE session_token = $1',
  insertUsageRecord: `
    INSERT INTO usage_statistics (api_key_id, usage_date, requests_count, input_tokens, output_tokens, cost, model_name)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (api_key_id, model_name, usage_date, usage_hour)
    DO UPDATE SET
      requests_count = usage_statistics.requests_count + EXCLUDED.requests_count,
      input_tokens = usage_statistics.input_tokens + EXCLUDED.input_tokens,
      output_tokens = usage_statistics.output_tokens + EXCLUDED.output_tokens,
      cost = usage_statistics.cost + EXCLUDED.cost
  `
}
```

### 3. 连接池配置

#### **连接池参数优化**
```javascript
const poolConfig = {
  // 连接池大小
  max: 20,               // 最大连接数
  min: 5,                // 最小连接数

  // 超时配置
  acquireTimeoutMillis: 60000,   // 获取连接超时
  createTimeoutMillis: 30000,    // 创建连接超时
  destroyTimeoutMillis: 5000,    // 销毁连接超时
  idleTimeoutMillis: 30000,      // 空闲连接超时
  reapIntervalMillis: 1000,      // 清理间隔
  createRetryIntervalMillis: 200, // 重试间隔

  // 连接验证
  validate: (client) => client.query('SELECT 1'),

  // 监控配置
  log: (message, logLevel) => {
    logger[logLevel](`[DB Pool] ${message}`)
  }
}
```

## 🛡️ 数据安全和完整性

### 1. 敏感数据加密

#### **加密字段策略**
```sql
-- OAuth 数据加密存储
CREATE OR REPLACE FUNCTION encrypt_oauth_data(data JSONB, key TEXT)
RETURNS TEXT AS $$
BEGIN
    -- 使用 pgcrypto 扩展进行 AES 加密
    RETURN encode(encrypt(data::TEXT::BYTEA, key::BYTEA, 'aes'), 'hex');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrypt_oauth_data(encrypted_data TEXT, key TEXT)
RETURNS JSONB AS $$
BEGIN
    RETURN decrypt(decode(encrypted_data, 'hex'), key::BYTEA, 'aes')::TEXT::JSONB;
END;
$$ LANGUAGE plpgsql;
```

### 2. 数据完整性约束

#### **业务规则约束**
```sql
-- API Key 业务约束
ALTER TABLE api_keys ADD CONSTRAINT check_token_limit_non_negative
    CHECK (token_limit >= 0);

ALTER TABLE api_keys ADD CONSTRAINT check_expires_at_future
    CHECK (expires_at IS NULL OR expires_at > created_at);

-- 使用统计约束
ALTER TABLE usage_statistics ADD CONSTRAINT check_tokens_non_negative
    CHECK (input_tokens >= 0 AND output_tokens >= 0 AND total_tokens >= 0);

ALTER TABLE usage_statistics ADD CONSTRAINT check_cost_non_negative
    CHECK (cost >= 0);

-- 会话约束
ALTER TABLE user_sessions ADD CONSTRAINT check_expires_after_created
    CHECK (expires_at > created_at);
```

## 📈 监控和维护

### 1. 表统计信息

#### **自动统计更新**
```sql
-- 创建统计信息更新函数
CREATE OR REPLACE FUNCTION update_table_statistics()
RETURNS void AS $$
BEGIN
    -- 更新表统计信息
    ANALYZE api_keys;
    ANALYZE claude_accounts;
    ANALYZE usage_statistics;
    ANALYZE user_sessions;
END;
$$ LANGUAGE plpgsql;

-- 定时任务：每小时更新统计信息
-- 通过 pg_cron 扩展实现（需要安装）
-- SELECT cron.schedule('update-stats', '0 * * * *', 'SELECT update_table_statistics();');
```

### 2. 数据清理策略

#### **自动清理过期数据**
```sql
-- 清理过期会话
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS TABLE(cleaned_sessions BIGINT, cleaned_usage_old BIGINT) AS $$
DECLARE
    session_count BIGINT;
    usage_count BIGINT;
BEGIN
    -- 清理过期会话
    DELETE FROM user_sessions WHERE expires_at < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS session_count = ROW_COUNT;

    -- 清理 90 天前的详细使用统计（保留日汇总）
    DELETE FROM usage_statistics
    WHERE usage_date < CURRENT_DATE - INTERVAL '90 days'
    AND usage_hour IS NOT NULL;
    GET DIAGNOSTICS usage_count = ROW_COUNT;

    RETURN QUERY SELECT session_count, usage_count;
END;
$$ LANGUAGE plpgsql;
```

---

**文档版本**: v1.0
**创建时间**: 2025-09-16
**负责团队**: Database-Expert + Architecture-Expert
**审核状态**: 待审核