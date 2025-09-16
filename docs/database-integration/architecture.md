# PostgreSQL 数据库整合架构设计

## 📋 项目概述

本文档描述了 Claude Relay Service 从纯 Redis 架构向 Redis + PostgreSQL 混合架构的整合方案。

### 🎯 设计目标

- **零宕机迁移**：保证服务连续性，无感知切换
- **性能优化**：利用 PostgreSQL 的关系查询优势，Redis 作为缓存层
- **架构升级**：支持复杂数据关系和高级查询功能
- **向前兼容**：现有 API 接口保持不变

### 🏗️ 架构概览

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Application   │    │   Service Layer │    │   Data Layer    │
│     Layer       │    │                 │    │                 │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│  Express.js     │───▶│  ApiKeyService  │───▶│ Database Client │
│  Routes         │    │  AccountService │    │                 │
│  Middleware     │    │  etc...         │    │  ┌─────────────┤
└─────────────────┘    └─────────────────┘    │  │PostgreSQL   │
                                              │  │(主存储)     │
                                              │  ├─────────────┤
                                              │  │Redis        │
                                              │  │(缓存层)     │
                                              │  └─────────────┤
                                              └─────────────────┘
```

## 🎯 核心架构决策

### 1. 混合存储策略

#### **数据分层存储**
- **PostgreSQL (主存储)**：
  - 持久化数据存储
  - 复杂关系查询
  - 数据完整性保证
  - ACID 事务支持

- **Redis (缓存层)**：
  - 高频访问数据缓存
  - 会话管理
  - 实时计数器
  - 临时数据存储

#### **读写策略**
```javascript
// 写入策略：双写模式
async setData(key, data) {
  await this.postgres.set(key, data)     // 主存储
  await this.redis.set(key, data, 3600)  // 缓存 1 小时
}

// 读取策略：缓存优先
async getData(key) {
  // 1. 尝试从缓存读取
  let data = await this.redis.get(key)
  if (data) return data

  // 2. 从主存储读取并缓存
  data = await this.postgres.get(key)
  if (data) {
    await this.redis.set(key, data, 3600)
  }
  return data
}
```

### 2. 数据访问抽象层设计

#### **统一接口模式**
```javascript
// src/models/database.js
class DatabaseClient {
  constructor() {
    this.postgres = new PostgresClient()
    this.redis = new RedisClient()
    this.strategy = new HybridStorageStrategy()
  }

  // 统一的数据访问接口
  async setApiKey(keyId, keyData) {
    return await this.strategy.write('apikey', keyId, keyData)
  }

  async getApiKey(keyId) {
    return await this.strategy.read('apikey', keyId)
  }
}
```

#### **策略模式实现**
```javascript
class HybridStorageStrategy {
  async write(type, id, data) {
    const config = this.getStorageConfig(type)

    if (config.primaryStorage === 'postgres') {
      await this.postgres.write(type, id, data)
      if (config.enableCache) {
        await this.redis.write(type, id, data, config.cacheTTL)
      }
    }
  }

  async read(type, id) {
    const config = this.getStorageConfig(type)

    // 缓存优先策略
    if (config.enableCache) {
      const cached = await this.redis.read(type, id)
      if (cached) return cached
    }

    // 主存储读取
    const data = await this.postgres.read(type, id)
    if (data && config.enableCache) {
      await this.redis.write(type, id, data, config.cacheTTL)
    }
    return data
  }
}
```

### 3. 服务层适配策略

#### **最小化修改原则**
- 保持现有 Service 类的公共接口不变
- 仅修改内部数据访问调用
- 使用依赖注入替换 Redis 客户端

#### **批量替换策略**
```javascript
// 现有代码
const redis = require('../models/redis')

// 替换为
const database = require('../models/database')
```

#### **渐进式迁移**
1. **Phase 1**: 新数据使用混合存储
2. **Phase 2**: 历史数据批量迁移
3. **Phase 3**: 完全切换到混合架构

## 🔄 数据迁移策略

### 1. 迁移阶段设计

#### **阶段 1：双写模式 (1-2 天)**
- 新数据同时写入 PostgreSQL 和 Redis
- 读取仍然优先从 Redis
- 验证双写数据一致性

#### **阶段 2：历史数据迁移 (1-2 天)**
- 批量迁移现有 Redis 数据到 PostgreSQL
- 增量同步确保数据完整性
- 数据校验和修复

#### **阶段 3：读取策略切换 (1 天)**
- 切换到缓存优先读取模式
- 监控性能和错误率
- 必要时回滚到纯 Redis 模式

### 2. 数据一致性保证

#### **事务安全**
```javascript
async migrateApiKey(keyId) {
  const transaction = await this.postgres.beginTransaction()
  try {
    const redisData = await this.redis.getApiKey(keyId)
    await this.postgres.setApiKey(keyId, redisData, { transaction })
    await transaction.commit()

    // 验证迁移结果
    const pgData = await this.postgres.getApiKey(keyId)
    this.validateDataIntegrity(redisData, pgData)

  } catch (error) {
    await transaction.rollback()
    throw error
  }
}
```

#### **数据校验机制**
```javascript
async validateMigration() {
  const redisKeys = await this.redis.getAllApiKeys()
  const pgKeys = await this.postgres.getAllApiKeys()

  const report = {
    totalRedis: redisKeys.length,
    totalPostgres: pgKeys.length,
    missingInPostgres: [],
    dataInconsistencies: []
  }

  for (const redisKey of redisKeys) {
    const pgKey = pgKeys.find(k => k.id === redisKey.id)
    if (!pgKey) {
      report.missingInPostgres.push(redisKey.id)
    } else if (!this.deepEqual(redisKey, pgKey)) {
      report.dataInconsistencies.push({
        id: redisKey.id,
        redis: redisKey,
        postgres: pgKey
      })
    }
  }

  return report
}
```

## 🚀 部署和运维

### 1. 环境配置

#### **Docker Compose 配置**
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: claude_relay
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"

  redis:
    image: redis:7
    # 现有配置保持不变

  app:
    # 现有配置，添加 PostgreSQL 依赖
    depends_on:
      - postgres
      - redis
```

#### **环境变量配置**
```bash
# PostgreSQL 配置
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=claude_relay
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_POOL_SIZE=10
POSTGRES_IDLE_TIMEOUT=30000

# 混合存储策略配置
ENABLE_POSTGRES=true
CACHE_TTL_SECONDS=3600
ENABLE_WRITE_THROUGH_CACHE=true
```

### 2. 监控和告警

#### **关键指标监控**
- PostgreSQL 连接池状态
- 查询响应时间对比
- 缓存命中率
- 数据同步延迟
- 错误率和异常

#### **健康检查**
```javascript
async healthCheck() {
  const checks = {
    postgres: await this.postgres.ping(),
    redis: await this.redis.ping(),
    dataConsistency: await this.validateSampleData()
  }

  return {
    status: Object.values(checks).every(Boolean) ? 'healthy' : 'unhealthy',
    checks
  }
}
```

## 🔧 技术选型说明

### PostgreSQL 选择理由
1. **ACID 事务**：数据一致性保证
2. **丰富查询**：SQL 支持复杂查询
3. **JSON 支持**：兼容现有数据结构
4. **性能优异**：经过优化的查询性能
5. **生态完善**：工具和监控支持

### 实现技术栈
- **PostgreSQL Client**: `pg` + `pg-pool`
- **连接管理**: 连接池 + 连接监控
- **迁移工具**: 自定义迁移脚本
- **监控**: 集成到现有日志系统

## 📈 性能预期

### 预期性能改善
- **复杂查询**: 性能提升 50-80%
- **数据一致性**: 100% ACID 保证
- **缓存命中率**: 保持 90%+ 缓存命中
- **系统可用性**: 99.9%+ 可用性目标

### 风险控制
- **回滚机制**: 5分钟内回滚到 Redis 模式
- **性能监控**: 实时性能对比
- **数据备份**: 自动化备份和恢复
- **分阶段发布**: 金丝雀发布策略

---

**文档版本**: v1.0
**创建时间**: 2025-09-16
**负责团队**: Database-Expert + Architecture-Expert
**审核状态**: 待审核