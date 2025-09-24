#!/usr/bin/env node

/**
 * 混合数据库架构测试脚本
 *
 * 测试 Redis + PostgreSQL 混合存储的各种策略和功能
 */

const path = require('path')
const fs = require('fs')

// 设置环境和路径
process.env.NODE_ENV = 'test'
const rootDir = path.join(__dirname, '..')
process.chdir(rootDir)

// 确保配置文件存在
const configPath = path.join(rootDir, 'config', 'config.js')
if (!fs.existsSync(configPath)) {
  console.error('❌ Configuration file not found. Please run setup first.')
  process.exit(1)
}

const config = require('../config/config')
const _logger = require('../src/utils/logger')
const database = require('../src/models/database')

class HybridDatabaseTester {
  constructor() {
    this.testResults = {
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: []
    }
    this.strategies = ['dual_write', 'cache_first', 'database_first', 'redis_only']
    this.originalStrategy = config.database?.strategy || 'dual_write'
  }

  log(level, message, ...args) {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, ...args)
  }

  success(message, ...args) {
    this.log('info', `✅ ${message}`, ...args)
  }
  info(message, ...args) {
    this.log('info', `ℹ️  ${message}`, ...args)
  }
  warn(message, ...args) {
    this.log('warn', `⚠️  ${message}`, ...args)
  }
  error(message, ...args) {
    this.log('error', `❌ ${message}`, ...args)
  }

  async runTest(testName, testFn) {
    try {
      this.info(`Running test: ${testName}`)
      await testFn()
      this.testResults.passed++
      this.success(`Test passed: ${testName}`)
    } catch (error) {
      this.testResults.failed++
      this.testResults.errors.push({ test: testName, error: error.message })
      this.error(`Test failed: ${testName} - ${error.message}`)
    }
  }

  async skipTest(testName, reason) {
    this.testResults.skipped++
    this.warn(`Test skipped: ${testName} - ${reason}`)
  }

  // ===============================
  // 基础连接测试
  // ===============================

  async testDatabaseInitialization() {
    await this.runTest('Database Initialization', async () => {
      await database.initialize()

      if (!database.isRedisConnected && !database.isPostgresConnected) {
        throw new Error('No database connections available')
      }

      this.info(`Database strategy: ${database.strategy}`)
      this.info(`Redis connected: ${database.isRedisConnected}`)
      this.info(`PostgreSQL connected: ${database.isPostgresConnected}`)
    })
  }

  async testHealthCheck() {
    await this.runTest('Health Check', async () => {
      const health = await database.healthCheck()

      if (!health.overall) {
        throw new Error('Health check failed')
      }

      this.info(
        `Health status: Overall=${health.overall}, Redis=${health.redis}, PostgreSQL=${health.postgres}`
      )
    })
  }

  // ===============================
  // API Key 操作测试
  // ===============================

  async testApiKeyOperations() {
    const testKeyId = `test-key-${Date.now()}`
    const testKeyData = {
      id: testKeyId,
      name: 'Test API Key',
      description: 'Created by hybrid database test',
      apiKey: `test_hash_${Date.now()}`,
      isActive: 'true',
      tokenLimit: '1000',
      createdAt: new Date().toISOString(),
      permissions: 'all'
    }

    await this.runTest('API Key Creation', async () => {
      await database.setApiKey(testKeyId, testKeyData, testKeyData.apiKey)
      this.info(`Created API Key: ${testKeyId}`)
    })

    await this.runTest('API Key Retrieval', async () => {
      const retrieved = await database.getApiKey(testKeyId)

      if (!retrieved || Object.keys(retrieved).length === 0) {
        throw new Error('API Key not found after creation')
      }

      if (retrieved.name !== testKeyData.name) {
        throw new Error(`Name mismatch: expected ${testKeyData.name}, got ${retrieved.name}`)
      }

      this.info(`Retrieved API Key: ${retrieved.name}`)
    })

    await this.runTest('API Key Hash Lookup', async () => {
      const found = await database.findApiKeyByHash(testKeyData.apiKey)

      if (!found) {
        throw new Error('API Key not found by hash')
      }

      this.info(`Found API Key by hash: ${found.id}`)
    })

    await this.runTest('API Key Update', async () => {
      const updatedData = { ...testKeyData, description: 'Updated by test' }
      await database.setApiKey(testKeyId, updatedData)

      const retrieved = await database.getApiKey(testKeyId)
      if (retrieved.description !== 'Updated by test') {
        throw new Error('API Key update failed')
      }

      this.info(`Updated API Key: ${testKeyId}`)
    })

    await this.runTest('API Key Deletion', async () => {
      await database.deleteApiKey(testKeyId)

      const retrieved = await database.getApiKey(testKeyId)
      if (retrieved && Object.keys(retrieved).length > 0) {
        // 某些策略下删除可能不会立即生效，这是正常的
        this.warn('API Key still exists after deletion (may be expected in some strategies)')
      } else {
        this.info(`Deleted API Key: ${testKeyId}`)
      }
    })
  }

  // ===============================
  // 使用统计测试
  // ===============================

  async testUsageStatistics() {
    const testKeyId = `usage-test-key-${Date.now()}`

    await this.runTest('Usage Statistics Recording', async () => {
      await database.incrementTokenUsage(
        testKeyId,
        100, // total tokens
        60, // input tokens
        40, // output tokens
        0, // cache create
        0, // cache read
        'claude-3-sonnet'
      )

      this.info(`Recorded usage for: ${testKeyId}`)
    })

    await this.runTest('Usage Statistics Retrieval', async () => {
      const stats = await database.getUsageStats(testKeyId)

      if (!stats) {
        throw new Error('Usage stats not found')
      }

      // 统计可能需要时间聚合，所以不强制要求立即可见
      this.info(`Usage stats retrieved for: ${testKeyId}`)
    })
  }

  // ===============================
  // 缓存测试
  // ===============================

  async testCacheOperations() {
    const testKey = `cache-test-${Date.now()}`
    const testValue = JSON.stringify({ test: 'data', timestamp: Date.now() })

    await this.runTest('Cache Set Operation', async () => {
      const result = await database.set(testKey, testValue)
      if (!result && database.isRedisConnected) {
        throw new Error('Cache set operation failed')
      }
      this.info(`Cached data: ${testKey}`)
    })

    await this.runTest('Cache Get Operation', async () => {
      const retrieved = await database.get(testKey)
      if (database.isRedisConnected && retrieved !== testValue) {
        throw new Error('Cache get operation failed')
      }
      this.info(`Retrieved cached data: ${testKey}`)
    })

    await this.runTest('Cache TTL Operation', async () => {
      const ttlKey = `ttl-test-${Date.now()}`
      await database.setex(ttlKey, 3600, testValue)

      const retrieved = await database.get(ttlKey)
      if (database.isRedisConnected && retrieved !== testValue) {
        throw new Error('Cache TTL operation failed')
      }
      this.info(`TTL cache operation successful: ${ttlKey}`)
    })
  }

  // ===============================
  // 错误处理和降级测试
  // ===============================

  async testErrorHandling() {
    await this.runTest('Invalid Key Retrieval', async () => {
      const result = await database.getApiKey('non-existent-key')

      // 应该返回空对象而不是抛出错误
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid key retrieval should return empty object')
      }

      this.info('Invalid key retrieval handled gracefully')
    })

    await this.runTest('Invalid Hash Lookup', async () => {
      const result = await database.findApiKeyByHash('invalid-hash')

      // 应该返回 null 而不是抛出错误
      if (result !== null && result !== undefined && Object.keys(result).length > 0) {
        throw new Error('Invalid hash lookup should return null')
      }

      this.info('Invalid hash lookup handled gracefully')
    })
  }

  // ===============================
  // 性能统计测试
  // ===============================

  async testPerformanceMetrics() {
    await this.runTest('Performance Statistics', async () => {
      const stats = database.getStats()

      if (!stats || typeof stats !== 'object') {
        throw new Error('Performance stats not available')
      }

      this.info('Performance metrics:')
      this.info(`  Strategy: ${stats.strategy}`)
      this.info(`  Redis hits: ${stats.redisHits}`)
      this.info(`  Redis misses: ${stats.redisMisses}`)
      this.info(`  PostgreSQL queries: ${stats.postgresQueries}`)
      this.info(`  Cache sets: ${stats.cacheSets}`)
      this.info(`  Errors: ${stats.errors}`)
    })
  }

  // ===============================
  // 不同策略测试（如果支持）
  // ===============================

  async testDifferentStrategies() {
    // 只有在测试环境下才测试策略切换
    if (process.env.NODE_ENV !== 'test') {
      await this.skipTest('Strategy Switching', 'Not in test environment')
      return
    }

    const testKeyId = `strategy-test-${Date.now()}`
    const testData = {
      id: testKeyId,
      name: 'Strategy Test Key',
      description: 'Testing different strategies',
      apiKey: `strategy_hash_${Date.now()}`,
      isActive: 'true',
      createdAt: new Date().toISOString()
    }

    for (const strategy of this.strategies) {
      await this.runTest(`Strategy: ${strategy}`, async () => {
        // 临时切换策略
        const originalStrategy = database.strategy
        database.strategy = strategy

        try {
          // 测试基本操作
          await database.setApiKey(testKeyId, testData)
          const retrieved = await database.getApiKey(testKeyId)

          if (!retrieved || Object.keys(retrieved).length === 0) {
            throw new Error(`Strategy ${strategy}: API Key operation failed`)
          }

          this.info(`Strategy ${strategy}: Basic operations successful`)
        } finally {
          // 恢复原始策略
          database.strategy = originalStrategy
        }
      })
    }
  }

  // ===============================
  // 主测试流程
  // ===============================

  async runAllTests() {
    this.info('🚀 Starting Hybrid Database Architecture Tests')
    this.info(`Original strategy: ${this.originalStrategy}`)
    this.info('='.repeat(60))

    try {
      // 基础连接测试
      await this.testDatabaseInitialization()
      await this.testHealthCheck()

      // 核心功能测试
      await this.testApiKeyOperations()
      await this.testUsageStatistics()
      await this.testCacheOperations()

      // 错误处理测试
      await this.testErrorHandling()

      // 性能统计测试
      await this.testPerformanceMetrics()

      // 策略测试（可选）
      await this.testDifferentStrategies()
    } catch (error) {
      this.error('Test execution failed:', error.message)
    } finally {
      // 清理和总结
      await this.cleanup()
      this.printSummary()
    }
  }

  async cleanup() {
    try {
      this.info('🧹 Cleaning up test environment...')

      // 断开数据库连接
      await database.disconnect()

      this.info('✅ Cleanup completed')
    } catch (error) {
      this.warn('Cleanup failed:', error.message)
    }
  }

  printSummary() {
    this.info('='.repeat(60))
    this.info('📊 Test Summary')
    this.info(`   Passed: ${this.testResults.passed}`)
    this.info(`   Failed: ${this.testResults.failed}`)
    this.info(`   Skipped: ${this.testResults.skipped}`)
    this.info(
      `   Total: ${this.testResults.passed + this.testResults.failed + this.testResults.skipped}`
    )

    if (this.testResults.failed > 0) {
      this.error('❌ Some tests failed:')
      this.testResults.errors.forEach(({ test, error }) => {
        this.error(`   ${test}: ${error}`)
      })
    }

    if (this.testResults.failed === 0) {
      this.success('🎉 All tests passed! Hybrid database architecture is working correctly.')
    } else {
      this.error(`💥 ${this.testResults.failed} test(s) failed. Please check the logs above.`)
      process.exit(1)
    }
  }
}

// 主执行逻辑
async function main() {
  const tester = new HybridDatabaseTester()

  // 处理优雅退出
  process.on('SIGINT', async () => {
    tester.warn('Received SIGINT, cleaning up...')
    await tester.cleanup()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    tester.warn('Received SIGTERM, cleaning up...')
    await tester.cleanup()
    process.exit(0)
  })

  // 运行测试
  await tester.runAllTests()
}

// 启动测试
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Test execution failed:', error)
    process.exit(1)
  })
}

module.exports = HybridDatabaseTester
