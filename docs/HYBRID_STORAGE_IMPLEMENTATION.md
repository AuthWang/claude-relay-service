# Claude Relay Service - 混合存储架构实现

## 📋 项目概述

本次实现为 Claude Relay Service 添加了 Redis + PostgreSQL 混合存储架构，提供了高性能缓存和持久化存储的最佳组合。该架构支持多种存储策略，具备完整的降级机制和数据同步功能。

## 🎯 核心特性

### ✅ 已实现功能

1. **统一数据访问层** (`src/models/database.js`)
   - 完全兼容现有 Redis 接口
   - 支持多种存储策略
   - 智能缓存和降级机制
   - 100% 向后兼容

2. **混合存储策略**
   - `dual_write`: 双写模式 (默认)
   - `cache_first`: 缓存优先读取
   - `database_first`: 数据库优先
   - `redis_only`: 仅 Redis (降级模式)
   - `postgres_only`: 仅 PostgreSQL

3. **智能缓存管理**
   - 可配置的 TTL 策略
   - 自动缓存预热
   - 缓存失效和更新机制
   - 性能监控和指标

4. **数据库初始化器** (`src/utils/databaseInit.js`)
   - 自动连接和健康检查
   - 数据同步和一致性检查
   - 降级策略处理
   - 性能监控

5. **管理工具和 API**
   - 管理员 API (`/admin/database/*`)
   - 命令行管理工具 (`scripts/database-manager.js`)
   - 健康检查和监控端点
   - 数据同步操作

6. **服务层重构**
   - `apiKeyService.js` 已重构使用统一数据层
   - 保持原有接口不变
   - 支持混合存储操作

7. **配置系统扩展**
   - PostgreSQL 连接配置
   - 混合存储策略配置
   - 缓存和同步参数
   - 环境变量支持

8. **部署和运维**
   - Docker Compose 混合架构配置
   - 监控工具集成
   - 环境变量模板
   - 部署文档

## 🏗️ 架构设计

### 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Relay Service                     │
├─────────────────────────────────────────────────────────────┤
│                   Application Layer                         │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │  API Services   │    │   Admin APIs    │                │
│  │  (apiKeyService)│    │  (databaseAdmin)│                │
│  └─────────────────┘    └─────────────────┘                │
├─────────────────────────────────────────────────────────────┤
│                  Unified Data Access Layer                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │               Database Client                           ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    ││
│  │  │   Dual      │  │   Cache     │  │  Database   │    ││
│  │  │   Write     │  │   First     │  │   First     │    ││
│  │  └─────────────┘  └─────────────┘  └─────────────┘    ││
│  └─────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│                    Storage Backends                         │
│  ┌─────────────────┐              ┌─────────────────┐       │
│  │      Redis      │              │   PostgreSQL    │       │
│  │   (Cache Layer) │◄────────────►│ (Primary Store) │       │
│  │                 │              │                 │       │
│  │  • Fast Access │              │  • ACID Compliance │    │
│  │  • TTL Support │              │  • Rich Queries    │    │
│  │  • Pub/Sub     │              │  • Backup/Recovery │    │
│  └─────────────────┘              └─────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### 数据流设计

#### 写入流程 (双写模式)
```
API Request → Validate → Database.setApiKey()
                            ├─→ PostgreSQL.setApiKey() (主存储)
                            └─→ Redis.setApiKey()      (缓存)
```

#### 读取流程 (缓存优先)
```
API Request → Database.getApiKey()
                ├─→ Redis.getApiKey()
                │   ├─ Hit  → Return Data
                │   └─ Miss ↓
                └─→ PostgreSQL.getApiKey()
                    ├─→ Cache Result in Redis
                    └─→ Return Data
```

## 📁 文件结构

### 新增文件

```
src/
├── models/
│   ├── database.js              # 统一数据访问层
│   └── postgres.js              # PostgreSQL 客户端 (已存在)
├── utils/
│   └── databaseInit.js          # 数据库初始化器
└── routes/
    └── databaseAdmin.js         # 数据库管理 API

scripts/
└── database-manager.js         # 命令行管理工具

config/
└── config.js                   # 扩展配置 (已更新)

docker-compose.hybrid.yml       # 混合存储部署配置
.env.example                     # 环境变量模板 (已更新)
```

### 修改文件

```
src/
├── app.js                       # 应用初始化 (已更新)
├── services/
│   └── apiKeyService.js         # 服务层重构 (已更新)
└── routes/
    └── admin.js                 # 管理路由集成 (已更新)
```

## ⚙️ 配置说明

### 环境变量配置

```bash
# PostgreSQL 配置
POSTGRES_ENABLED=true
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=claude_relay
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password

# 存储策略配置
DATABASE_STRATEGY=dual_write

# 缓存配置
CACHE_API_KEY_TTL=86400
CACHE_SESSION_TTL=1800
CACHE_USAGE_STATS_TTL=300

# 同步配置
DATABASE_SYNC_ENABLED=true
DATABASE_SYNC_INTERVAL=3600000
DATABASE_SYNC_ON_STARTUP=true
```

### 存储策略说明

| 策略 | 描述 | 适用场景 |
|------|------|----------|
| `dual_write` | 同时写入两个数据库，缓存优先读取 | 生产环境 (推荐) |
| `cache_first` | Redis 优先，PostgreSQL 备用 | 高性能场景 |
| `database_first` | PostgreSQL 优先，Redis 缓存 | 数据一致性优先 |
| `redis_only` | 仅使用 Redis | 降级模式 |
| `postgres_only` | 仅使用 PostgreSQL | 纯持久化场景 |

## 🚀 部署指南

### 1. 基础部署

```bash
# 1. 更新环境变量
cp .env.example .env
# 编辑 .env 文件配置数据库连接

# 2. 启动混合存储服务
docker-compose -f docker-compose.hybrid.yml up -d

# 3. 验证服务状态
docker-compose -f docker-compose.hybrid.yml ps
```

### 2. 监控部署

```bash
# 启动包含监控工具的完整服务
docker-compose -f docker-compose.hybrid.yml --profile monitoring up -d

# 访问监控界面
# - Redis Insight: http://localhost:8001
# - pgAdmin: http://localhost:5050
# - Grafana: http://localhost:3001
```

### 3. 命令行管理

```bash
# 检查数据库健康状态
node scripts/database-manager.js health --verbose

# 执行数据同步
node scripts/database-manager.js sync --source redis --target postgres --force

# 检查数据一致性
node scripts/database-manager.js check-consistency

# 切换存储策略
node scripts/database-manager.js switch-strategy dual_write --force

# 监控性能指标
node scripts/database-manager.js metrics --watch
```

## 🔧 管理 API

### 健康检查
```bash
GET /admin/database/health
GET /admin/database/status
GET /admin/database/metrics
```

### 数据同步
```bash
POST /admin/database/sync/redis-to-postgres
POST /admin/database/sync/postgres-to-redis
```

### 策略管理
```bash
POST /admin/database/strategy/dual-write
POST /admin/database/strategy/redis-only
POST /admin/database/strategy/postgres-only
```

### 一致性检查
```bash
GET /admin/database/consistency-check
```

## 📊 性能监控

### 关键指标

- **总操作数**: 数据库操作的总次数
- **缓存命中率**: Redis 缓存的命中率
- **错误率**: 数据库操作的错误率
- **连接状态**: 各数据库的连接状态
- **响应时间**: 各操作的平均响应时间

### 监控方式

1. **管理 API**: `/admin/database/metrics`
2. **命令行工具**: `database-manager.js metrics --watch`
3. **应用日志**: 结构化日志输出
4. **Grafana 仪表板**: 可视化监控 (可选)

## 🛠️ 故障处理

### 常见问题

1. **PostgreSQL 连接失败**
   ```bash
   # 检查服务状态
   docker-compose ps postgres

   # 查看日志
   docker-compose logs postgres

   # 切换到 Redis-only 模式
   node scripts/database-manager.js switch-strategy redis-only --force
   ```

2. **数据不一致**
   ```bash
   # 检查一致性
   node scripts/database-manager.js check-consistency

   # 执行同步
   node scripts/database-manager.js sync --source postgres --target redis --force
   ```

3. **性能问题**
   ```bash
   # 监控指标
   node scripts/database-manager.js metrics --watch

   # 检查缓存命中率
   curl http://localhost:3000/admin/database/metrics
   ```

### 降级策略

系统会自动根据数据库可用性调整策略：

- 如果 PostgreSQL 不可用 → 自动切换到 `redis_only`
- 如果 Redis 不可用 → 自动切换到 `postgres_only`
- 如果两者都不可用 → 抛出错误

## 🔒 安全考虑

1. **数据加密**: PostgreSQL 支持 SSL/TLS 连接
2. **访问控制**: 数据库用户权限最小化
3. **敏感数据**: 继续使用 AES 加密存储
4. **网络隔离**: Docker 网络隔离
5. **备份策略**: PostgreSQL 定期备份

## 📈 升级路径

### 从纯 Redis 迁移

1. **部署阶段**:
   - 部署 PostgreSQL 实例
   - 配置环境变量
   - 重启应用服务

2. **数据迁移**:
   ```bash
   # 同步现有数据到 PostgreSQL
   node scripts/database-manager.js sync --source redis --target postgres --force
   ```

3. **策略切换**:
   ```bash
   # 切换到双写模式
   node scripts/database-manager.js switch-strategy dual_write --force
   ```

4. **验证阶段**:
   ```bash
   # 检查数据一致性
   node scripts/database-manager.js check-consistency

   # 监控系统状态
   node scripts/database-manager.js health --verbose
   ```

## 🚦 测试建议

### 单元测试
- 数据库连接测试
- CRUD 操作测试
- 缓存策略测试
- 降级机制测试

### 集成测试
- 数据同步测试
- 故障转移测试
- 性能压力测试
- 一致性验证测试

### 生产验证
- 灰度发布
- 监控指标验证
- 回滚准备
- 性能基准测试

## 📚 参考资料

- [PostgreSQL 官方文档](https://www.postgresql.org/docs/)
- [Redis 官方文档](https://redis.io/documentation)
- [Docker Compose 文档](https://docs.docker.com/compose/)
- [Node.js pg 客户端](https://node-postgres.com/)
- [ioredis 客户端](https://github.com/luin/ioredis)

---

**实现完成**: 2024年12月
**架构师**: Architecture-Expert
**版本**: v1.0.0

该实现提供了一个完整、可靠、高性能的混合存储解决方案，为 Claude Relay Service 的扩展性和可靠性奠定了坚实基础。