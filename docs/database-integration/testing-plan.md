# PostgreSQL 整合测试计划

## 📋 概述

本文档详细描述 PostgreSQL 数据库整合的全面测试策略，确保系统稳定性、性能达标和数据完整性。

### 🎯 测试目标

- **功能完整性**：验证所有功能在新架构下正常运行
- **性能基准**：确保性能不低于现有 Redis 架构
- **数据一致性**：保证迁移过程中数据完整且一致
- **故障恢复**：验证异常情况下的自动恢复能力

## 🧪 测试策略概览

### 测试金字塔
```
    ┌─────────────────┐
    │   E2E Tests     │  ← 10% (关键用户场景)
    │   (End-to-End)  │
    ├─────────────────┤
    │ Integration     │  ← 20% (API 集成测试)
    │   Tests         │
    ├─────────────────┤
    │   Unit Tests    │  ← 70% (数据访问层)
    │                 │
    └─────────────────┘
```

### 测试分类

1. **单元测试** - 数据访问层、服务层逻辑
2. **集成测试** - 数据库交互、API 端点
3. **性能测试** - 负载测试、压力测试、基准测试
4. **数据迁移测试** - 迁移正确性、数据完整性
5. **兼容性测试** - 向后兼容性验证
6. **故障测试** - 错误处理、恢复机制

## 🔬 单元测试计划

### 1. 数据访问层测试

#### **PostgreSQL 客户端测试**

**测试文件：`tests/unit/models/postgres.test.js`**

```javascript
describe('PostgresClient', () => {
  let client;
  let mockPool;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
      connect: jest.fn(),
      release: jest.fn()
    };
    client = new PostgresClient({ pool: mockPool });
  });

  describe('API Key Operations', () => {
    it('应该正确创建 API Key', async () => {
      const keyData = {
        name: 'Test Key',
        permissions: 'all',
        isActive: true
      };

      mockPool.query.mockResolvedValue({
        rows: [{ id: 'test-id', ...keyData }],
        rowCount: 1
      });

      const result = await client.createApiKey(keyData);

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('test-id');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO api_keys'),
        expect.arrayContaining([keyData.name, keyData.permissions])
      );
    });

    it('应该处理重复键错误', async () => {
      mockPool.query.mockRejectedValue(
        new Error('duplicate key value violates unique constraint')
      );

      const result = await client.createApiKey({ name: 'Duplicate' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('duplicate key');
    });

    it('应该正确验证 API Key', async () => {
      const hashedKey = 'hashed-key-value';
      mockPool.query.mockResolvedValue({
        rows: [{
          id: 'test-id',
          permissions: 'all',
          is_active: true,
          expires_at: null
        }],
        rowCount: 1
      });

      const result = await client.validateApiKey(hashedKey);

      expect(result.success).toBe(true);
      expect(result.data.permissions).toBe('all');
      expect(result.data.isActive).toBe(true);
    });
  });

  describe('Connection Management', () => {
    it('应该正确管理连接池', async () => {
      mockPool.connect.mockResolvedValue({ query: jest.fn() });

      const connection = await client.getConnection();

      expect(mockPool.connect).toHaveBeenCalled();
      expect(connection).toBeDefined();
    });

    it('应该处理连接超时', async () => {
      mockPool.connect.mockRejectedValue(new Error('connection timeout'));

      await expect(client.getConnection()).rejects.toThrow('connection timeout');
    });
  });

  describe('Transaction Management', () => {
    it('应该正确执行事务', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn()
      };
      mockPool.connect.mockResolvedValue(mockClient);

      await client.executeTransaction(async (tx) => {
        await tx.query('SELECT 1');
        await tx.query('SELECT 2');
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('SELECT 1');
      expect(mockClient.query).toHaveBeenCalledWith('SELECT 2');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('应该在错误时回滚事务', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockRejectedValueOnce(new Error('Query failed')), // 失败的查询
        release: jest.fn()
      };
      mockPool.connect.mockResolvedValue(mockClient);

      await expect(
        client.executeTransaction(async (tx) => {
          await tx.query('INVALID QUERY');
        })
      ).rejects.toThrow('Query failed');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });
});
```

#### **混合存储策略测试**

**测试文件：`tests/unit/models/database.test.js`**

```javascript
describe('DatabaseClient (Hybrid Storage)', () => {
  let database;
  let mockPostgres;
  let mockRedis;

  beforeEach(() => {
    mockPostgres = {
      getApiKey: jest.fn(),
      setApiKey: jest.fn(),
      deleteApiKey: jest.fn()
    };

    mockRedis = {
      getApiKey: jest.fn(),
      setApiKey: jest.fn(),
      deleteApiKey: jest.fn()
    };

    database = new DatabaseClient({
      postgres: mockPostgres,
      redis: mockRedis
    });
  });

  describe('Read Strategy - Cache First', () => {
    it('应该优先从缓存读取数据', async () => {
      const cachedData = { id: 'test-id', name: 'Cached Key' };
      mockRedis.getApiKey.mockResolvedValue(cachedData);

      const result = await database.getApiKey('test-id');

      expect(result).toEqual(cachedData);
      expect(mockRedis.getApiKey).toHaveBeenCalledWith('test-id');
      expect(mockPostgres.getApiKey).not.toHaveBeenCalled();
    });

    it('缓存未命中时应该从主存储读取', async () => {
      const dbData = { id: 'test-id', name: 'DB Key' };
      mockRedis.getApiKey.mockResolvedValue(null);
      mockPostgres.getApiKey.mockResolvedValue(dbData);

      const result = await database.getApiKey('test-id');

      expect(result).toEqual(dbData);
      expect(mockRedis.getApiKey).toHaveBeenCalledWith('test-id');
      expect(mockPostgres.getApiKey).toHaveBeenCalledWith('test-id');
      expect(mockRedis.setApiKey).toHaveBeenCalledWith('test-id', dbData, 3600);
    });
  });

  describe('Write Strategy - Write Through', () => {
    it('应该同时写入主存储和缓存', async () => {
      const keyData = { name: 'New Key', permissions: 'all' };
      mockPostgres.setApiKey.mockResolvedValue({ success: true });
      mockRedis.setApiKey.mockResolvedValue(true);

      await database.setApiKey('test-id', keyData);

      expect(mockPostgres.setApiKey).toHaveBeenCalledWith('test-id', keyData);
      expect(mockRedis.setApiKey).toHaveBeenCalledWith('test-id', keyData, 3600);
    });

    it('主存储失败时应该抛出错误', async () => {
      mockPostgres.setApiKey.mockRejectedValue(new Error('DB Error'));

      await expect(
        database.setApiKey('test-id', { name: 'Key' })
      ).rejects.toThrow('DB Error');

      expect(mockRedis.setApiKey).not.toHaveBeenCalled();
    });
  });
});
```

### 2. 服务层测试

#### **API Key 服务测试**

**测试文件：`tests/unit/services/apiKeyService.test.js`**

```javascript
describe('ApiKeyService', () => {
  let service;
  let mockDatabase;

  beforeEach(() => {
    mockDatabase = {
      getApiKey: jest.fn(),
      setApiKey: jest.fn(),
      validateApiKey: jest.fn()
    };

    service = new ApiKeyService({ database: mockDatabase });
  });

  describe('generateApiKey', () => {
    it('应该生成有效的 API Key', async () => {
      mockDatabase.setApiKey.mockResolvedValue({ success: true });

      const result = await service.generateApiKey({
        name: 'Test Key',
        permissions: 'claude'
      });

      expect(result.success).toBe(true);
      expect(result.data.apiKey).toMatch(/^cr_[a-zA-Z0-9]{32}$/);
      expect(result.data.hashedKey).toHaveLength(64); // SHA256 hex
    });

    it('应该设置正确的过期时间', async () => {
      const expiresAt = new Date(Date.now() + 86400000); // 24小时后
      mockDatabase.setApiKey.mockResolvedValue({ success: true });

      await service.generateApiKey({
        name: 'Test Key',
        expiresAt
      });

      expect(mockDatabase.setApiKey).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          expiresAt: expiresAt.toISOString()
        })
      );
    });
  });

  describe('validateApiKey', () => {
    it('应该正确验证有效的 API Key', async () => {
      mockDatabase.validateApiKey.mockResolvedValue({
        success: true,
        data: {
          id: 'test-id',
          permissions: 'all',
          isActive: true,
          expiresAt: null
        }
      });

      const result = await service.validateApiKey('valid-key');

      expect(result.isValid).toBe(true);
      expect(result.permissions).toBe('all');
    });

    it('应该拒绝过期的 API Key', async () => {
      const expiredDate = new Date(Date.now() - 86400000); // 24小时前
      mockDatabase.validateApiKey.mockResolvedValue({
        success: true,
        data: {
          id: 'test-id',
          permissions: 'all',
          isActive: true,
          expiresAt: expiredDate
        }
      });

      const result = await service.validateApiKey('expired-key');

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('expired');
    });
  });
});
```

## 🔗 集成测试计划

### 1. API 端点集成测试

#### **核心 API 测试**

**测试文件：`tests/integration/api/messages.test.js`**

```javascript
describe('Messages API Integration', () => {
  let app;
  let database;
  let testApiKey;

  beforeAll(async () => {
    // 启动测试数据库
    database = new DatabaseClient(testConfig);
    await database.connect();

    // 启动测试应用
    app = createApp({ database });

    // 创建测试 API Key
    const keyResult = await database.createApiKey({
      name: 'Integration Test Key',
      permissions: 'all'
    });
    testApiKey = keyResult.data.apiKey;
  });

  afterAll(async () => {
    await database.disconnect();
  });

  describe('POST /api/v1/messages', () => {
    it('应该成功处理 Claude 消息请求', async () => {
      const response = await request(app)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          model: 'claude-3-sonnet-20240229',
          messages: [{ role: 'user', content: 'Hello, world!' }],
          max_tokens: 100
        })
        .expect(200);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        model: 'claude-3-sonnet-20240229',
        usage: {
          input_tokens: expect.any(Number),
          output_tokens: expect.any(Number)
        }
      });

      // 验证使用统计已记录
      const usage = await database.getUsageStats({
        apiKeyId: keyResult.data.id,
        startDate: new Date(),
        endDate: new Date()
      });

      expect(usage.data.stats).toHaveLength(1);
    });

    it('应该拒绝无效的 API Key', async () => {
      await request(app)
        .post('/api/v1/messages')
        .set('Authorization', 'Bearer invalid-key')
        .send({
          model: 'claude-3-sonnet-20240229',
          messages: [{ role: 'user', content: 'Hello' }]
        })
        .expect(401);
    });

    it('应该处理流式响应', async () => {
      const response = await request(app)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          model: 'claude-3-sonnet-20240229',
          messages: [{ role: 'user', content: 'Count from 1 to 5' }],
          stream: true
        })
        .expect(200);

      expect(response.headers['content-type']).toBe('text/event-stream');

      const chunks = response.text.split('\n\n').filter(chunk =>
        chunk.startsWith('data: ') && chunk !== 'data: [DONE]'
      );

      expect(chunks.length).toBeGreaterThan(0);

      // 验证每个 chunk 都是有效的 JSON
      chunks.forEach(chunk => {
        const data = JSON.parse(chunk.replace('data: ', ''));
        expect(data).toMatchObject({
          id: expect.any(String),
          delta: expect.any(Object)
        });
      });
    });
  });

  describe('Rate Limiting', () => {
    it('应该强制执行速率限制', async () => {
      // 创建有限制的 API Key
      const limitedKeyResult = await database.createApiKey({
        name: 'Limited Key',
        rateLimitRequests: 2,
        rateLimitWindow: 60 // 1分钟
      });

      const limitedKey = limitedKeyResult.data.apiKey;

      // 前两个请求应该成功
      await request(app)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${limitedKey}`)
        .send({ model: 'claude-3-sonnet-20240229', messages: [{ role: 'user', content: '1' }] })
        .expect(200);

      await request(app)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${limitedKey}`)
        .send({ model: 'claude-3-sonnet-20240229', messages: [{ role: 'user', content: '2' }] })
        .expect(200);

      // 第三个请求应该被限制
      await request(app)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${limitedKey}`)
        .send({ model: 'claude-3-sonnet-20240229', messages: [{ role: 'user', content: '3' }] })
        .expect(429);
    });
  });
});
```

### 2. 数据库集成测试

**测试文件：`tests/integration/database/postgres.test.js`**

```javascript
describe('PostgreSQL Integration', () => {
  let client;

  beforeAll(async () => {
    client = new PostgresClient(testDbConfig);
    await client.connect();
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    // 清理测试数据
    await client.query('TRUNCATE TABLE api_keys CASCADE');
    await client.query('TRUNCATE TABLE usage_statistics CASCADE');
  });

  describe('CRUD Operations', () => {
    it('应该正确执行完整的 CRUD 流程', async () => {
      // Create
      const createResult = await client.createApiKey({
        name: 'CRUD Test Key',
        permissions: 'claude',
        tokenLimit: 1000
      });
      expect(createResult.success).toBe(true);

      const keyId = createResult.data.id;

      // Read
      const readResult = await client.getApiKey(keyId);
      expect(readResult.data.name).toBe('CRUD Test Key');
      expect(readResult.data.permissions).toBe('claude');

      // Update
      const updateResult = await client.updateApiKey(keyId, {
        name: 'Updated Key',
        tokenLimit: 2000
      });
      expect(updateResult.success).toBe(true);

      const updatedKey = await client.getApiKey(keyId);
      expect(updatedKey.data.name).toBe('Updated Key');
      expect(updatedKey.data.tokenLimit).toBe(2000);

      // Delete
      const deleteResult = await client.deleteApiKey(keyId);
      expect(deleteResult.success).toBe(true);

      const deletedKey = await client.getApiKey(keyId);
      expect(deletedKey.data).toBeNull();
    });
  });

  describe('Complex Queries', () => {
    it('应该支持复杂的统计查询', async () => {
      // 准备测试数据
      const keyId = await createTestApiKey(client);
      await createTestUsageData(client, keyId);

      const stats = await client.getUsageStats({
        apiKeyId: keyId,
        startDate: new Date('2025-09-01'),
        endDate: new Date('2025-09-30'),
        granularity: 'day'
      });

      expect(stats.success).toBe(true);
      expect(stats.data.stats).toHaveLength(30);
      expect(stats.data.summary.totalRequests).toBeGreaterThan(0);
    });
  });

  describe('Transaction Integrity', () => {
    it('应该在事务中保持数据一致性', async () => {
      await expect(
        client.executeTransaction(async (tx) => {
          // 创建 API Key
          await tx.query(`
            INSERT INTO api_keys (name, api_key_hash)
            VALUES ('Transaction Test', 'test-hash')
          `);

          // 创建使用统计
          await tx.query(`
            INSERT INTO usage_statistics (api_key_id, usage_date, requests_count)
            SELECT id, CURRENT_DATE, 100
            FROM api_keys WHERE name = 'Transaction Test'
          `);

          // 故意制造错误
          throw new Error('Rollback test');
        })
      ).rejects.toThrow('Rollback test');

      // 验证事务已回滚
      const keys = await client.query(`
        SELECT * FROM api_keys WHERE name = 'Transaction Test'
      `);
      expect(keys.rows).toHaveLength(0);
    });
  });
});
```

## 📊 性能测试计划

### 1. 基准测试

**测试文件：`tests/performance/benchmark.test.js`**

```javascript
describe('Performance Benchmarks', () => {
  let database;

  beforeAll(async () => {
    database = new DatabaseClient(perfTestConfig);
    await database.connect();
    await prepareTestData(database);
  });

  describe('Read Performance', () => {
    it('API Key 验证应该在 10ms 内完成', async () => {
      const hashedKey = 'test-hashed-key';

      const startTime = process.hrtime.bigint();
      await database.validateApiKey(hashedKey);
      const endTime = process.hrtime.bigint();

      const durationMs = Number(endTime - startTime) / 1000000;
      expect(durationMs).toBeLessThan(10);
    });

    it('缓存命中率应该大于 90%', async () => {
      const iterations = 1000;
      let cacheHits = 0;

      for (let i = 0; i < iterations; i++) {
        const startTime = process.hrtime.bigint();
        await database.getApiKey('frequently-used-key');
        const endTime = process.hrtime.bigint();

        const durationMs = Number(endTime - startTime) / 1000000;
        if (durationMs < 5) { // 缓存命中通常 < 5ms
          cacheHits++;
        }
      }

      const hitRate = cacheHits / iterations;
      expect(hitRate).toBeGreaterThan(0.9);
    });
  });

  describe('Write Performance', () => {
    it('批量插入性能测试', async () => {
      const batchSize = 1000;
      const testKeys = generateTestKeys(batchSize);

      const startTime = Date.now();
      await database.batchInsertApiKeys(testKeys);
      const endTime = Date.now();

      const duration = endTime - startTime;
      const throughput = batchSize / (duration / 1000); // keys/second

      expect(throughput).toBeGreaterThan(100); // > 100 keys/second
    });
  });

  describe('Concurrent Access', () => {
    it('并发读取性能测试', async () => {
      const concurrency = 50;
      const requestsPerWorker = 20;

      const workers = Array(concurrency).fill().map(async () => {
        for (let i = 0; i < requestsPerWorker; i++) {
          await database.getApiKey(`test-key-${Math.floor(Math.random() * 100)}`);
        }
      });

      const startTime = Date.now();
      await Promise.all(workers);
      const endTime = Date.now();

      const totalRequests = concurrency * requestsPerWorker;
      const duration = endTime - startTime;
      const throughput = totalRequests / (duration / 1000);

      expect(throughput).toBeGreaterThan(500); // > 500 req/s
    });
  });
});
```

### 2. 负载测试

**测试配置：`tests/load/artillery.yml`**

```yaml
config:
  target: 'http://localhost:3000'
  phases:
    # 预热阶段
    - duration: 60
      arrivalRate: 10
      name: "Warmup"

    # 负载测试
    - duration: 300
      arrivalRate: 50
      name: "Load Test"

    # 峰值测试
    - duration: 120
      arrivalRate: 100
      name: "Peak Load"

    # 压力测试
    - duration: 60
      arrivalRate: 200
      name: "Stress Test"

  http:
    timeout: 30
    pool: 50

scenarios:
  - name: "API Key Validation"
    weight: 40
    flow:
      - post:
          url: "/api/v1/messages"
          headers:
            Authorization: "Bearer {{ testApiKey }}"
            Content-Type: "application/json"
          json:
            model: "claude-3-sonnet-20240229"
            messages:
              - role: "user"
                content: "Hello"
            max_tokens: 50

  - name: "Usage Statistics Query"
    weight: 20
    flow:
      - get:
          url: "/admin/api/usage/{{ keyId }}"
          headers:
            Authorization: "Bearer {{ adminToken }}"

  - name: "Account Management"
    weight: 30
    flow:
      - get:
          url: "/admin/api/accounts"
          headers:
            Authorization: "Bearer {{ adminToken }}"

  - name: "Health Check"
    weight: 10
    flow:
      - get:
          url: "/health"
```

## 🔄 数据迁移测试

### 1. 数据完整性测试

**测试文件：`tests/migration/data-integrity.test.js`**

```javascript
describe('Data Migration Integrity', () => {
  let redis;
  let postgres;
  let migrator;

  beforeAll(async () => {
    redis = new RedisClient(testConfig);
    postgres = new PostgresClient(testConfig);
    migrator = new DataMigrator({ redis, postgres });

    await redis.connect();
    await postgres.connect();
  });

  beforeEach(async () => {
    // 准备 Redis 测试数据
    await prepareRedisTestData(redis);
  });

  describe('API Keys Migration', () => {
    it('应该完整迁移所有 API Keys', async () => {
      const redisKeys = await redis.getAllApiKeys();

      await migrator.migrateApiKeys();

      const postgresKeys = await postgres.getAllApiKeys();

      expect(postgresKeys.length).toBe(redisKeys.length);

      // 验证每个 key 的数据完整性
      for (const redisKey of redisKeys) {
        const pgKey = postgresKeys.find(k => k.id === redisKey.id);
        expect(pgKey).toBeDefined();

        // 验证关键字段
        expect(pgKey.name).toBe(redisKey.name);
        expect(pgKey.permissions).toBe(redisKey.permissions);
        expect(pgKey.isActive).toBe(redisKey.isActive === 'true');
        expect(new Date(pgKey.createdAt)).toEqual(new Date(redisKey.createdAt));
      }
    });

    it('应该正确处理特殊字符和 JSON 数据', async () => {
      // 创建包含特殊字符的测试数据
      await redis.setApiKey('special-test', {
        name: 'Test "Special" Characters & Symbols',
        description: `Multi-line
        description with\ttabs and 'quotes'`,
        tags: JSON.stringify(['tag1', 'tag with spaces', 'tag-with-dashes']),
        restrictedModels: JSON.stringify(['model1', 'model2'])
      });

      await migrator.migrateApiKeys();

      const migratedKey = await postgres.getApiKey('special-test');
      expect(migratedKey.data.name).toBe('Test "Special" Characters & Symbols');
      expect(migratedKey.data.tags).toEqual(['tag1', 'tag with spaces', 'tag-with-dashes']);
    });
  });

  describe('Usage Statistics Migration', () => {
    it('应该保持统计数据的数值精度', async () => {
      const usageKey = 'usage:daily:test-key:2025-09-15';
      await redis.hset(usageKey, {
        requests: '1234',
        input_tokens: '56789',
        output_tokens: '98765',
        cost: '123.456789'
      });

      await migrator.migrateUsageStatistics();

      const migratedUsage = await postgres.getUsageStats({
        apiKeyId: 'test-key',
        startDate: new Date('2025-09-15'),
        endDate: new Date('2025-09-15')
      });

      const dayStats = migratedUsage.data.stats[0];
      expect(dayStats.requests).toBe(1234);
      expect(dayStats.inputTokens).toBe(56789);
      expect(dayStats.outputTokens).toBe(98765);
      expect(dayStats.cost).toBeCloseTo(123.456789, 6);
    });
  });

  describe('Migration Rollback', () => {
    it('应该能够回滚已迁移的数据', async () => {
      // 执行迁移
      await migrator.migrateApiKeys();

      const beforeRollback = await postgres.getAllApiKeys();
      expect(beforeRollback.length).toBeGreaterThan(0);

      // 执行回滚
      await migrator.rollbackApiKeys();

      const afterRollback = await postgres.getAllApiKeys();
      expect(afterRollback.length).toBe(0);

      // 验证 Redis 数据仍然存在
      const redisKeys = await redis.getAllApiKeys();
      expect(redisKeys.length).toBeGreaterThan(0);
    });
  });
});
```

### 2. 迁移性能测试

**测试文件：`tests/migration/performance.test.js`**

```javascript
describe('Migration Performance', () => {
  it('应该在合理时间内完成大量数据迁移', async () => {
    const keyCount = 10000;
    const usageRecordCount = 100000;

    // 准备大量测试数据
    await prepareLargeDataset(redis, keyCount, usageRecordCount);

    const startTime = Date.now();
    await migrator.migrateAll();
    const endTime = Date.now();

    const duration = endTime - startTime;
    const throughput = (keyCount + usageRecordCount) / (duration / 1000);

    expect(throughput).toBeGreaterThan(1000); // > 1000 records/second
    expect(duration).toBeLessThan(300000); // < 5 minutes
  });

  it('应该支持断点续传', async () => {
    await prepareLargeDataset(redis, 5000, 0);

    // 开始迁移但中途停止
    const migrationPromise = migrator.migrateApiKeys();
    setTimeout(() => migrator.stop(), 5000);

    await migrationPromise.catch(() => {}); // 忽略停止错误

    const partialCount = await postgres.query('SELECT COUNT(*) FROM api_keys');
    const initialMigrated = parseInt(partialCount.rows[0].count);

    // 恢复迁移
    await migrator.resumeMigration();

    const finalCount = await postgres.query('SELECT COUNT(*) FROM api_keys');
    const totalMigrated = parseInt(finalCount.rows[0].count);

    expect(totalMigrated).toBe(5000);
    expect(totalMigrated).toBeGreaterThan(initialMigrated);
  });
});
```

## 🚨 故障恢复测试

### 1. 错误处理测试

**测试文件：`tests/resilience/error-handling.test.js`**

```javascript
describe('Error Handling and Resilience', () => {
  let database;

  beforeAll(async () => {
    database = new DatabaseClient(testConfig);
    await database.connect();
  });

  describe('Database Connection Failures', () => {
    it('应该正确处理 PostgreSQL 连接断开', async () => {
      // 模拟连接断开
      await database.postgres.disconnect();

      // 应该自动回退到 Redis
      const result = await database.getApiKey('test-key');
      expect(result).toBeDefined();

      // 验证错误被记录
      const errors = await getRecentLogs('error');
      expect(errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('PostgreSQL connection failed')
        })
      );
    });

    it('应该在连接恢复后自动重连', async () => {
      // 重新启动 PostgreSQL
      await database.postgres.connect();

      // 验证写入操作恢复
      const result = await database.setApiKey('recovery-test', {
        name: 'Recovery Test'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Data Consistency Under Failures', () => {
    it('应该在 Redis 故障时保证数据完整性', async () => {
      // 创建数据
      await database.setApiKey('consistency-test', {
        name: 'Consistency Test'
      });

      // 模拟 Redis 故障
      await database.redis.disconnect();

      // PostgreSQL 应该仍然可用
      const result = await database.getApiKey('consistency-test');
      expect(result.name).toBe('Consistency Test');

      // 恢复 Redis
      await database.redis.connect();
    });
  });

  describe('Rate Limiting Under Load', () => {
    it('应该在高负载下正确执行速率限制', async () => {
      const limitedKey = await createRateLimitedKey(database, {
        requests: 10,
        window: 60
      });

      // 并发发送大量请求
      const promises = Array(50).fill().map(() =>
        database.validateApiKey(limitedKey.hashedKey)
      );

      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const rateLimited = results.filter(r =>
        r.status === 'rejected' && r.reason.code === 'RATE_LIMITED'
      ).length;

      expect(successful).toBeLessThanOrEqual(10);
      expect(rateLimited).toBeGreaterThan(0);
    });
  });
});
```

## 📋 测试执行计划

### 测试阶段安排

#### **Phase 1: 开发测试 (持续)**
- 单元测试：每次代码提交时自动运行
- 集成测试：每日构建时运行
- 覆盖率要求：> 80%

#### **Phase 2: 系统测试 (部署前)**
- 功能测试：完整的端到端测试
- 性能测试：基准测试和负载测试
- 安全测试：认证和授权验证

#### **Phase 3: 验收测试 (部署后)**
- 生产环境冒烟测试
- 监控和告警验证
- 回滚流程验证

### 测试环境配置

#### **单元测试环境**
```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/unit/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup/unit.js']
};
```

#### **集成测试环境**
```yaml
# docker-compose.test.yml
version: '3.8'
services:
  postgres-test:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: claude_relay_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    tmpfs:
      - /var/lib/postgresql/data

  redis-test:
    image: redis:7-alpine
    command: redis-server --maxmemory 128mb

  test-runner:
    build: .
    environment:
      NODE_ENV: test
      POSTGRES_HOST: postgres-test
      REDIS_HOST: redis-test
    depends_on:
      - postgres-test
      - redis-test
    command: npm run test:integration
```

### 持续集成配置

#### **GitHub Actions 工作流**
```yaml
name: PostgreSQL Integration Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: claude_relay_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - run: npm ci

      - run: npm run test:unit
        env:
          CI: true

      - run: npm run test:integration
        env:
          CI: true
          POSTGRES_HOST: localhost
          POSTGRES_PASSWORD: test
          REDIS_HOST: localhost

      - run: npm run test:migration
        env:
          CI: true
          POSTGRES_HOST: localhost
          REDIS_HOST: localhost

      - name: Upload coverage reports
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
```

## 📊 质量网关

### 部署前检查清单

- [ ] 单元测试通过率 100%
- [ ] 集成测试通过率 100%
- [ ] 代码覆盖率 > 80%
- [ ] 性能测试达到基准要求
- [ ] 安全测试无关键漏洞
- [ ] 迁移测试数据一致性 100%
- [ ] 故障恢复测试通过
- [ ] 文档完整性检查通过

### 生产监控指标

- **服务可用性**: > 99.9%
- **平均响应时间**: < 200ms
- **95%响应时间**: < 500ms
- **错误率**: < 0.1%
- **数据库连接池利用率**: < 80%
- **缓存命中率**: > 90%

---

**文档版本**: v1.0
**创建时间**: 2025-09-16
**负责团队**: 全栈测试团队
**审核状态**: 待审核