/**
 * 数据库管理 API 路由
 *
 * 提供混合存储系统的管理和监控功能：
 * - 健康检查和状态监控
 * - 数据同步操作
 * - 存储策略切换
 * - 性能指标查看
 * - 数据一致性检查
 */

const express = require('express')
const databaseInit = require('../utils/databaseInit')
const database = require('../models/database')
const logger = require('../utils/logger')

const router = express.Router()

// === 健康检查和状态监控 ===

/**
 * GET /admin/database/health
 * 获取数据库健康状态
 */
router.get('/health', async (req, res) => {
  try {
    const healthStatus = await databaseInit.getHealthStatus()

    res.json({
      success: true,
      data: healthStatus,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('❌ Database health check failed:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get database health status',
      message: error.message
    })
  }
})

/**
 * GET /admin/database/metrics
 * 获取性能指标
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = database.getPerformanceMetrics()

    res.json({
      success: true,
      data: {
        metrics,
        strategy: database.currentStrategy,
        connections: {
          redis: database.isRedisAvailable,
          postgres: database.isPostgresAvailable
        }
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('❌ Failed to get database metrics:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get database metrics',
      message: error.message
    })
  }
})

/**
 * GET /admin/database/status
 * 获取详细状态信息
 */
router.get('/status', async (req, res) => {
  try {
    const [health, redisStats, pgStats] = await Promise.allSettled([
      databaseInit.getHealthStatus(),
      database.redis?.getPoolStats ? database.redis.getPoolStats() : {},
      database.postgres?.getPoolStats ? database.postgres.getPoolStats() : {}
    ])

    res.json({
      success: true,
      data: {
        health: health.status === 'fulfilled' ? health.value : { error: health.reason?.message },
        connectionPools: {
          redis:
            redisStats.status === 'fulfilled'
              ? redisStats.value
              : { error: redisStats.reason?.message },
          postgres:
            pgStats.status === 'fulfilled' ? pgStats.value : { error: pgStats.reason?.message }
        },
        strategy: database.currentStrategy,
        initialized: databaseInit.isInitialized
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('❌ Failed to get database status:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get database status',
      message: error.message
    })
  }
})

// === 数据同步操作 ===

/**
 * POST /admin/database/sync/redis-to-postgres
 * 强制同步 Redis 数据到 PostgreSQL
 */
router.post('/sync/redis-to-postgres', async (req, res) => {
  try {
    logger.info('🔄 Admin requested Redis to PostgreSQL sync')

    const result = await databaseInit.forceSyncRedisToPostgres()

    res.json({
      success: true,
      data: {
        synced: result.synced,
        errors: result.errors,
        total: result.total,
        message: `Synced ${result.synced}/${result.total} records from Redis to PostgreSQL`
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('❌ Redis to PostgreSQL sync failed:', error)
    res.status(500).json({
      success: false,
      error: 'Sync operation failed',
      message: error.message
    })
  }
})

/**
 * POST /admin/database/sync/postgres-to-redis
 * 强制同步 PostgreSQL 数据到 Redis
 */
router.post('/sync/postgres-to-redis', async (req, res) => {
  try {
    logger.info('🔄 Admin requested PostgreSQL to Redis sync')

    const result = await databaseInit.forceSyncPostgresToRedis()

    res.json({
      success: true,
      data: {
        synced: result.synced,
        errors: result.errors,
        total: result.total,
        message: `Synced ${result.synced}/${result.total} records from PostgreSQL to Redis`
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('❌ PostgreSQL to Redis sync failed:', error)
    res.status(500).json({
      success: false,
      error: 'Sync operation failed',
      message: error.message
    })
  }
})

// === 存储策略管理 ===

/**
 * POST /admin/database/strategy/redis-only
 * 切换到 Redis-only 模式
 */
router.post('/strategy/redis-only', async (req, res) => {
  try {
    logger.warn('⚠️ Admin requested switch to Redis-only mode')

    await databaseInit.switchToRedisOnly()

    res.json({
      success: true,
      message: 'Switched to Redis-only mode',
      newStrategy: database.currentStrategy,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('❌ Failed to switch to Redis-only mode:', error)
    res.status(500).json({
      success: false,
      error: 'Strategy switch failed',
      message: error.message
    })
  }
})

/**
 * POST /admin/database/strategy/postgres-only
 * 切换到 PostgreSQL-only 模式
 */
router.post('/strategy/postgres-only', async (req, res) => {
  try {
    logger.warn('⚠️ Admin requested switch to PostgreSQL-only mode')

    await databaseInit.switchToPostgresOnly()

    res.json({
      success: true,
      message: 'Switched to PostgreSQL-only mode',
      newStrategy: database.currentStrategy,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('❌ Failed to switch to PostgreSQL-only mode:', error)
    res.status(500).json({
      success: false,
      error: 'Strategy switch failed',
      message: error.message
    })
  }
})

/**
 * POST /admin/database/strategy/dual-write
 * 尝试恢复双写模式
 */
router.post('/strategy/dual-write', async (req, res) => {
  try {
    logger.info('🔄 Admin requested restore dual-write mode')

    const success = await databaseInit.restoreDualMode()

    if (success) {
      res.json({
        success: true,
        message: 'Successfully restored dual-write mode',
        newStrategy: database.currentStrategy,
        timestamp: new Date().toISOString()
      })
    } else {
      res.status(503).json({
        success: false,
        error: 'Cannot restore dual-write mode',
        message: 'One or more databases are not available',
        currentStrategy: database.currentStrategy
      })
    }
  } catch (error) {
    logger.error('❌ Failed to restore dual-write mode:', error)
    res.status(500).json({
      success: false,
      error: 'Strategy switch failed',
      message: error.message
    })
  }
})

// === 数据一致性检查和修复 ===

/**
 * GET /admin/database/consistency-check
 * 执行数据一致性检查
 */
router.get('/consistency-check', async (req, res) => {
  try {
    logger.info('🔍 Admin requested consistency check')

    // 执行一致性检查
    const [redisKeys, pgKeys] = await Promise.allSettled([
      database.redis.getAllApiKeys(),
      database.postgres.getAllApiKeys()
    ])

    const redisCount = redisKeys.status === 'fulfilled' ? redisKeys.value.length : 0
    const pgCount = pgKeys.status === 'fulfilled' ? pgKeys.value.length : 0

    const isConsistent = Math.abs(redisCount - pgCount) === 0
    const difference = Math.abs(redisCount - pgCount)

    res.json({
      success: true,
      data: {
        consistent: isConsistent,
        counts: {
          redis: redisCount,
          postgres: pgCount,
          difference
        },
        status: isConsistent
          ? 'Data is consistent'
          : `Inconsistency detected: ${difference} records differ`,
        recommendations: isConsistent
          ? []
          : [
              'Consider running a sync operation',
              'Check for recent write failures',
              'Review error logs for database issues'
            ]
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('❌ Consistency check failed:', error)
    res.status(500).json({
      success: false,
      error: 'Consistency check failed',
      message: error.message
    })
  }
})

/**
 * POST /admin/database/consistency-fix
 * 执行数据一致性检查并自动修复
 */
router.post('/consistency-fix', async (req, res) => {
  try {
    logger.info('🔧 Admin requested consistency check with auto-fix')

    // 执行完整的一致性检查
    await databaseInit.performConsistencyCheck()

    // 获取修复后的状态
    const [redisKeys, pgKeys] = await Promise.allSettled([
      database.redis.getAllApiKeys(),
      database.postgres.getAllApiKeys()
    ])

    const redisCount = redisKeys.status === 'fulfilled' ? redisKeys.value.length : 0
    const pgCount = pgKeys.status === 'fulfilled' ? pgKeys.value.length : 0
    const isConsistent = Math.abs(redisCount - pgCount) === 0

    res.json({
      success: true,
      data: {
        consistent: isConsistent,
        counts: {
          redis: redisCount,
          postgres: pgCount,
          difference: Math.abs(redisCount - pgCount)
        },
        message: isConsistent
          ? 'Data consistency verified - no issues found'
          : 'Attempted auto-fix, but inconsistencies may remain',
        action: 'Performed full consistency check with automatic repair'
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('❌ Consistency check with auto-fix failed:', error)
    res.status(500).json({
      success: false,
      error: 'Consistency check and fix failed',
      message: error.message
    })
  }
})

// === 缓存管理 ===

/**
 * POST /admin/database/cache/clear
 * 清空 Redis 缓存
 */
router.post('/cache/clear', async (req, res) => {
  try {
    const { pattern } = req.body

    logger.warn(`⚠️ Admin requested cache clear with pattern: ${pattern || 'all'}`)

    if (pattern) {
      // 清除特定模式的缓存
      const keys = await database.redis.keys(pattern)
      if (keys.length > 0) {
        await database.redis.del(...keys)
      }

      res.json({
        success: true,
        message: `Cleared ${keys.length} cache entries matching pattern: ${pattern}`,
        clearedKeys: keys.length
      })
    } else {
      // 清空所有缓存 (危险操作)
      await database.redis.client.flushdb()

      res.json({
        success: true,
        message: 'All cache cleared (WARNING: This affects all cached data)',
        clearedKeys: 'all'
      })
    }
  } catch (error) {
    logger.error('❌ Cache clear failed:', error)
    res.status(500).json({
      success: false,
      error: 'Cache clear failed',
      message: error.message
    })
  }
})

// === 连接管理 ===

/**
 * POST /admin/database/reconnect
 * 重新连接数据库
 */
router.post('/reconnect', async (req, res) => {
  try {
    logger.info('🔄 Admin requested database reconnection')

    // 重新初始化数据库连接
    await databaseInit.shutdown()
    await databaseInit.initialize()

    const health = await databaseInit.getHealthStatus()

    res.json({
      success: true,
      message: 'Database reconnection completed',
      health,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('❌ Database reconnection failed:', error)
    res.status(500).json({
      success: false,
      error: 'Reconnection failed',
      message: error.message
    })
  }
})

module.exports = router
