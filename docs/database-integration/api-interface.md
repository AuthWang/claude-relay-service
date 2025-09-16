# 数据访问层 API 接口文档

## 📋 概述

本文档定义了 PostgreSQL 整合后的数据访问层统一接口，确保业务逻辑层的无感知迁移。

### 🎯 设计目标

- **接口一致性**：保持与现有 Redis 接口的兼容性
- **透明切换**：业务层代码无需修改
- **性能优化**：利用缓存策略提升访问性能
- **错误处理**：统一的错误处理和重试机制

## 🏗️ 核心接口架构

### 接口层次结构
```
DatabaseClient (统一入口)
├── PostgresClient (主存储)
├── RedisClient (缓存层)
├── HybridStorageStrategy (存储策略)
└── ErrorHandler (错误处理)
```

## 📚 API 接口定义

### 1. API Key 管理接口

#### **接口类：ApiKeyInterface**

```javascript
class ApiKeyInterface {
  // 创建 API Key
  async createApiKey(keyData) {
    /*
    参数：
      keyData: {
        id?: string,              // 可选，自动生成 UUID
        name: string,             // 必需，API Key 名称
        description?: string,     // 可选，描述信息
        permissions?: string,     // 可选，权限范围 'all' | 'claude' | 'gemini' | 'openai'
        tokenLimit?: number,      // 可选，token 限制
        concurrencyLimit?: number,// 可选，并发限制
        dailyCostLimit?: number,  // 可选，每日费用限制
        expiresAt?: Date,         // 可选，过期时间
        tags?: string[],          // 可选，标签数组
        ...                       // 其他可选参数
      }

    返回：
      {
        success: boolean,
        data: {
          id: string,
          apiKey: string,         // 明文 API Key
          hashedKey: string,      // 哈希后的 Key
          createdAt: Date
        },
        error?: string
      }
    */
  }

  // 验证 API Key
  async validateApiKey(hashedKey) {
    /*
    参数：
      hashedKey: string         // 哈希后的 API Key

    返回：
      {
        success: boolean,
        data?: {
          id: string,
          permissions: string,
          isActive: boolean,
          expiresAt?: Date,
          rateLimits: {
            concurrency: number,
            daily: number,
            requests: number
          }
        },
        error?: string
      }
    */
  }

  // 获取 API Key 详情
  async getApiKey(keyId) {
    /*
    参数：
      keyId: string             // API Key ID

    返回：
      {
        success: boolean,
        data?: ApiKeyData,
        error?: string
      }
    */
  }

  // 更新 API Key
  async updateApiKey(keyId, updateData) {
    /*
    参数：
      keyId: string             // API Key ID
      updateData: Partial<ApiKeyData>

    返回：
      {
        success: boolean,
        data?: ApiKeyData,
        error?: string
      }
    */
  }

  // 删除 API Key
  async deleteApiKey(keyId) {
    /*
    参数：
      keyId: string             // API Key ID

    返回：
      {
        success: boolean,
        error?: string
      }
    */
  }

  // 获取所有 API Keys
  async getAllApiKeys(filters = {}) {
    /*
    参数：
      filters: {
        isActive?: boolean,       // 筛选活跃状态
        permissions?: string,     // 筛选权限类型
        tags?: string[],          // 标签筛选
        limit?: number,           // 分页大小
        offset?: number,          // 偏移量
        sortBy?: string,          // 排序字段
        sortOrder?: 'ASC' | 'DESC'// 排序方向
      }

    返回：
      {
        success: boolean,
        data?: {
          keys: ApiKeyData[],
          total: number,
          page: number,
          totalPages: number
        },
        error?: string
      }
    */
  }

  // 记录 API Key 使用
  async recordApiKeyUsage(keyId, usageData) {
    /*
    参数：
      keyId: string
      usageData: {
        model: string,
        inputTokens: number,
        outputTokens: number,
        cost: number,
        requestCount: number,
        timestamp?: Date
      }

    返回：
      {
        success: boolean,
        error?: string
      }
    */
  }
}
```

### 2. 账户管理接口

#### **Claude 账户接口：ClaudeAccountInterface**

```javascript
class ClaudeAccountInterface {
  // 创建 Claude 账户
  async createClaudeAccount(accountData) {
    /*
    参数：
      accountData: {
        name: string,
        description?: string,
        oauthData: {
          accessToken: string,
          refreshToken: string,
          scopes: string[],
          expiresAt: Date
        },
        proxyConfig?: {
          type: 'http' | 'socks5',
          host: string,
          port: number,
          username?: string,
          password?: string
        }
      }

    返回：
      {
        success: boolean,
        data?: {
          id: string,
          name: string,
          status: string,
          createdAt: Date
        },
        error?: string
      }
    */
  }

  // 获取 Claude 账户
  async getClaudeAccount(accountId) {
    /*
    参数：
      accountId: string

    返回：
      {
        success: boolean,
        data?: {
          id: string,
          name: string,
          description: string,
          status: string,
          tokenExpiresAt?: Date,
          lastUsedAt?: Date,
          rateLimitStatus: {
            remaining: number,
            resetAt?: Date
          },
          usageStats: {
            totalRequests: number,
            totalTokens: number,
            totalCost: number
          }
        },
        error?: string
      }
    */
  }

  // 更新 OAuth Token
  async refreshOAuthToken(accountId) {
    /*
    参数：
      accountId: string

    返回：
      {
        success: boolean,
        data?: {
          accessToken: string,      // 新的访问令牌
          expiresAt: Date,          // 过期时间
          refreshedAt: Date         // 刷新时间
        },
        error?: string
      }
    */
  }

  // 更新账户状态
  async updateAccountStatus(accountId, status, metadata = {}) {
    /*
    参数：
      accountId: string
      status: 'active' | 'inactive' | 'rate_limited' | 'error'
      metadata: {
        rateLimitResetAt?: Date,
        errorMessage?: string,
        lastRequestAt?: Date
      }

    返回：
      {
        success: boolean,
        error?: string
      }
    */
  }

  // 获取可用账户
  async getAvailableAccounts(filters = {}) {
    /*
    参数：
      filters: {
        status?: string,          // 账户状态筛选
        rateLimitAvailable?: boolean, // 是否有剩余限额
        minTokensRemaining?: number   // 最小剩余 tokens
      }

    返回：
      {
        success: boolean,
        data?: ClaudeAccountData[],
        error?: string
      }
    */
  }
}
```

### 3. 使用统计接口

#### **统计接口：UsageStatsInterface**

```javascript
class UsageStatsInterface {
  // 记录使用数据
  async recordUsage(usageData) {
    /*
    参数：
      usageData: {
        apiKeyId: string,
        accountId?: string,
        accountType: 'claude' | 'gemini' | 'openai',
        model: string,
        inputTokens: number,
        outputTokens: number,
        totalTokens: number,
        cost: number,
        requestCount: number,
        timestamp?: Date
      }

    返回：
      {
        success: boolean,
        error?: string
      }
    */
  }

  // 获取使用统计
  async getUsageStats(query) {
    /*
    参数：
      query: {
        apiKeyId?: string,
        accountId?: string,
        model?: string,
        startDate: Date,
        endDate: Date,
        granularity: 'hour' | 'day' | 'month',
        groupBy?: 'model' | 'account' | 'apikey'
      }

    返回：
      {
        success: boolean,
        data?: {
          stats: Array<{
            date: string,
            requests: number,
            inputTokens: number,
            outputTokens: number,
            totalTokens: number,
            cost: number,
            models?: { [model: string]: UsageData }
          }>,
          summary: {
            totalRequests: number,
            totalTokens: number,
            totalCost: number,
            averageCostPerToken: number
          }
        },
        error?: string
      }
    */
  }

  // 获取成本分析
  async getCostAnalysis(query) {
    /*
    参数：
      query: {
        apiKeyId?: string,
        startDate: Date,
        endDate: Date,
        groupBy: 'day' | 'model' | 'account'
      }

    返回：
      {
        success: boolean,
        data?: {
          costBreakdown: Array<{
            category: string,
            cost: number,
            percentage: number
          }>,
          trends: Array<{
            date: string,
            cost: number,
            change: number
          }>,
          topModels: Array<{
            model: string,
            cost: number,
            requests: number
          }>
        },
        error?: string
      }
    */
  }

  // 清理过期统计数据
  async cleanupOldStats(retentionDays = 90) {
    /*
    参数：
      retentionDays: number     // 保留天数

    返回：
      {
        success: boolean,
        data?: {
          deletedRecords: number,
          remainingRecords: number
        },
        error?: string
      }
    */
  }
}
```

### 4. 会话管理接口

#### **会话接口：SessionInterface**

```javascript
class SessionInterface {
  // 创建会话
  async createSession(sessionData) {
    /*
    参数：
      sessionData: {
        userId: string,
        userType: 'admin' | 'user',
        sessionData: object,
        ttlSeconds?: number,      // 会话有效期，默认 24 小时
        ipAddress?: string,
        userAgent?: string
      }

    返回：
      {
        success: boolean,
        data?: {
          sessionToken: string,
          expiresAt: Date
        },
        error?: string
      }
    */
  }

  // 验证会话
  async validateSession(sessionToken) {
    /*
    参数：
      sessionToken: string

    返回：
      {
        success: boolean,
        data?: {
          userId: string,
          userType: string,
          sessionData: object,
          expiresAt: Date,
          isValid: boolean
        },
        error?: string
      }
    */
  }

  // 更新会话数据
  async updateSession(sessionToken, updateData) {
    /*
    参数：
      sessionToken: string
      updateData: {
        sessionData?: object,
        extendTTL?: number        // 延长有效期（秒）
      }

    返回：
      {
        success: boolean,
        data?: {
          expiresAt: Date
        },
        error?: string
      }
    */
  }

  // 删除会话
  async deleteSession(sessionToken) {
    /*
    参数：
      sessionToken: string

    返回：
      {
        success: boolean,
        error?: string
      }
    */
  }

  // 清理过期会话
  async cleanupExpiredSessions() {
    /*
    返回：
      {
        success: boolean,
        data?: {
          deletedSessions: number
        },
        error?: string
      }
    */
  }
}
```

## 🔄 数据访问策略接口

### **存储策略接口：StorageStrategyInterface**

```javascript
class StorageStrategyInterface {
  // 读取策略配置
  getStorageConfig(dataType) {
    /*
    参数：
      dataType: string          // 'apikey' | 'account' | 'usage' | 'session'

    返回：
      {
        primaryStorage: 'postgres' | 'redis',
        enableCache: boolean,
        cacheTTL: number,
        readStrategy: 'cache_first' | 'database_first' | 'cache_only',
        writeStrategy: 'write_through' | 'write_behind' | 'write_around'
      }
    */
  }

  // 切换存储策略
  async switchStorageStrategy(dataType, newStrategy) {
    /*
    参数：
      dataType: string
      newStrategy: StorageConfig

    返回：
      {
        success: boolean,
        previousStrategy: StorageConfig,
        error?: string
      }
    */
  }

  // 获取存储状态
  async getStorageHealth() {
    /*
    返回：
      {
        postgres: {
          connected: boolean,
          latency: number,
          poolStatus: {
            total: number,
            idle: number,
            waiting: number
          }
        },
        redis: {
          connected: boolean,
          latency: number,
          memory: {
            used: number,
            max: number
          }
        }
      }
    */
  }
}
```

## 🛠️ 错误处理和重试机制

### **错误类型定义**

```javascript
// 自定义错误类型
class DatabaseError extends Error {
  constructor(message, code, details = {}) {
    super(message)
    this.name = 'DatabaseError'
    this.code = code
    this.details = details
  }
}

// 错误代码常量
const ERROR_CODES = {
  // 连接错误
  CONNECTION_FAILED: 'DB_CONNECTION_FAILED',
  CONNECTION_TIMEOUT: 'DB_CONNECTION_TIMEOUT',
  POOL_EXHAUSTED: 'DB_POOL_EXHAUSTED',

  // 数据错误
  RECORD_NOT_FOUND: 'DB_RECORD_NOT_FOUND',
  DUPLICATE_KEY: 'DB_DUPLICATE_KEY',
  CONSTRAINT_VIOLATION: 'DB_CONSTRAINT_VIOLATION',

  // 查询错误
  INVALID_QUERY: 'DB_INVALID_QUERY',
  QUERY_TIMEOUT: 'DB_QUERY_TIMEOUT',

  // 缓存错误
  CACHE_MISS: 'CACHE_MISS',
  CACHE_ERROR: 'CACHE_ERROR'
}
```

### **重试策略配置**

```javascript
const retryConfig = {
  // 重试策略
  maxRetries: 3,
  baseDelay: 1000,              // 基础延迟（毫秒）
  maxDelay: 10000,              // 最大延迟
  exponentialBackoff: true,      // 指数退避

  // 可重试的错误类型
  retryableErrors: [
    'CONNECTION_TIMEOUT',
    'POOL_EXHAUSTED',
    'QUERY_TIMEOUT'
  ],

  // 不可重试的错误类型
  nonRetryableErrors: [
    'CONSTRAINT_VIOLATION',
    'DUPLICATE_KEY',
    'INVALID_QUERY'
  ]
}
```

## 📊 性能监控接口

### **监控接口：MonitoringInterface**

```javascript
class MonitoringInterface {
  // 获取性能指标
  async getPerformanceMetrics(timeRange = '1h') {
    /*
    参数：
      timeRange: string         // '5m' | '1h' | '24h' | '7d'

    返回：
      {
        database: {
          avgQueryTime: number,
          slowQueries: number,
          connectionPool: {
            utilization: number,
            waitTime: number
          }
        },
        cache: {
          hitRate: number,
          missRate: number,
          evictionRate: number
        },
        errors: {
          rate: number,
          types: { [errorCode: string]: number }
        }
      }
    */
  }

  // 获取查询统计
  async getQueryStats(limit = 10) {
    /*
    参数：
      limit: number             // 返回记录数量

    返回：
      {
        slowQueries: Array<{
          query: string,
          avgDuration: number,
          callCount: number,
          lastExecuted: Date
        }>,
        frequentQueries: Array<{
          query: string,
          callCount: number,
          totalDuration: number
        }>
      }
    */
  }

  // 设置性能告警
  async setPerformanceAlert(alertConfig) {
    /*
    参数：
      alertConfig: {
        metric: string,           // 监控指标
        threshold: number,        // 告警阈值
        operator: '>' | '<' | '>=', // 比较操作符
        duration: number,         // 持续时间（秒）
        webhook?: string          // 告警回调
      }
    */
  }
}
```

## 🔐 事务和一致性接口

### **事务接口：TransactionInterface**

```javascript
class TransactionInterface {
  // 开始事务
  async beginTransaction(options = {}) {
    /*
    参数：
      options: {
        isolationLevel?: 'READ_COMMITTED' | 'SERIALIZABLE',
        readOnly?: boolean,
        timeout?: number
      }

    返回：
      {
        transactionId: string,
        client: DatabaseClient
      }
    */
  }

  // 提交事务
  async commitTransaction(transactionId) {
    /*
    参数：
      transactionId: string

    返回：
      {
        success: boolean,
        error?: string
      }
    */
  }

  // 回滚事务
  async rollbackTransaction(transactionId) {
    /*
    参数：
      transactionId: string

    返回：
      {
        success: boolean,
        error?: string
      }
    */
  }

  // 批量操作（事务）
  async batchOperation(operations, transactionOptions = {}) {
    /*
    参数：
      operations: Array<{
        type: 'create' | 'update' | 'delete',
        table: string,
        data: object,
        where?: object
      }>
      transactionOptions: TransactionOptions

    返回：
      {
        success: boolean,
        results: Array<any>,
        error?: string
      }
    */
  }
}
```

---

**文档版本**: v1.0
**创建时间**: 2025-09-16
**负责团队**: Architecture-Expert + Database-Expert
**审核状态**: 待审核

## 📝 接口使用示例

### 示例 1：API Key 验证流程

```javascript
const database = require('../models/database')

async function validateApiKeyMiddleware(req, res, next) {
  try {
    const apiKey = req.headers['authorization']?.replace('Bearer ', '')
    if (!apiKey) {
      return res.status(401).json({ error: 'Missing API key' })
    }

    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex')
    const result = await database.apiKeys.validateApiKey(hashedKey)

    if (!result.success || !result.data.isActive) {
      return res.status(401).json({ error: 'Invalid API key' })
    }

    req.apiKeyData = result.data
    next()
  } catch (error) {
    logger.error('API key validation failed:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
```

### 示例 2：使用统计记录

```javascript
async function recordApiUsage(apiKeyId, accountId, usageData) {
  try {
    await database.usage.recordUsage({
      apiKeyId,
      accountId,
      accountType: 'claude',
      model: usageData.model,
      inputTokens: usageData.input_tokens,
      outputTokens: usageData.output_tokens,
      totalTokens: usageData.total_tokens,
      cost: usageData.cost,
      requestCount: 1
    })
  } catch (error) {
    logger.error('Failed to record usage:', error)
    // 非关键错误，不阻塞主流程
  }
}
```