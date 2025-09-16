/**
 * 数据库初始化和连接管理
 *
 * 负责：
 * - 初始化 Redis + PostgreSQL 混合存储
 * - 数据库连接健康检查
 * - 数据同步和迁移
 * - 降级策略处理
 */

const database = require('../models/database')
const config = require('../../config/config')
const logger = require('./logger')

class DatabaseInitializer {
  constructor() {
    this.isInitialized = false
    this.syncInterval = null
  }

  async initialize() {
    if (this.isInitialized) {
      logger.debug('🔄 Database already initialized')
      return true
    }

    try {
      logger.info('🚀 Initializing Database Manager...')

      // 初始化数据库管理器
      await database.initialize()

      // 健康检查
      const health = await database.healthCheck()
      this.logHealthStatus(health)

      // 如果配置了启动时同步
      if (config.database?.sync?.onStartup) {
        await this.performStartupSync()
      }

      // 启动定期同步 (如果启用)
      if (config.database?.sync?.enabled) {
        this.startSyncInterval()
      }

      this.isInitialized = true
      logger.success('✅ Database Manager initialized successfully')

      return true
    } catch (error) {
      logger.error('💥 Failed to initialize Database Manager:', error)
      throw error
    }
  }

  async performStartupSync() {
    try {
      logger.info('🔄 Performing startup data sync...')

      // 根据当前策略决定同步方向
      const { strategy } = database

      if (strategy === 'dual_write' || strategy === 'database_first') {
        // 主要使用 PostgreSQL，从Redis同步到PostgreSQL
        await this.syncRedisToPostgres()
      } else if (strategy === 'cache_first' || strategy === 'redis_only') {
        // 主要使用 Redis，从PostgreSQL同步到Redis
        await this.syncPostgresToRedis()
      }

      logger.success('✅ Startup sync completed')
    } catch (error) {
      logger.warn('⚠️ Startup sync failed, continuing without sync:', error.message)
    }
  }

  startSyncInterval() {
    const interval = config.database?.sync?.interval || 3600000 // 默认 1 小时

    this.syncInterval = setInterval(async () => {
      try {
        logger.debug('🔄 Running periodic data sync...')

        // 执行双向同步检查
        await this.performPeriodicSync()

        logger.debug('✅ Periodic sync completed')
      } catch (error) {
        logger.warn('⚠️ Periodic sync failed:', error.message)
      }
    }, interval)

    logger.info(`🕐 Periodic sync enabled (interval: ${interval / 1000}s)`)
  }

  async performPeriodicSync() {
    try {
      logger.info('🔄 Running periodic data sync...')

      // 直接执行，不使用setTimeout来避免错误隐藏
      // 获取健康状态
      const health = await database.healthCheck()
      logger.info(
        `📊 Database health check: Redis=${health.redis?.responsive}, PostgreSQL=${health.postgres?.responsive}`
      )

      // 如果两个数据库都可用，执行一致性检查
      if (health.redis.responsive && health.postgres.responsive) {
        logger.info('🔍 Both databases available, starting consistency check...')
        await this.performConsistencyCheck()
      } else {
        logger.warn('⚠️ Skipping consistency check - one or both databases not responsive')
      }

      logger.info('✅ Periodic sync completed')
    } catch (error) {
      logger.error('❌ Periodic sync failed:', error.message)
      // 实现重试机制
      this.scheduleRetry('performPeriodicSync', 60000) // 1分钟后重试
    }
  }

  /**
   * 错误重试机制
   */
  scheduleRetry(operation, delay = 60000, maxRetries = 3) {
    if (!this.retryCount) {
      this.retryCount = {}
    }

    const currentRetries = this.retryCount[operation] || 0
    if (currentRetries >= maxRetries) {
      logger.error(`❌ ${operation} failed after ${maxRetries} retries, giving up`)
      this.retryCount[operation] = 0
      return
    }

    this.retryCount[operation] = currentRetries + 1
    logger.info(
      `🔄 Scheduling retry ${currentRetries + 1}/${maxRetries} for ${operation} in ${delay}ms`
    )

    setTimeout(async () => {
      try {
        if (operation === 'performPeriodicSync') {
          await this.performPeriodicSync()
          this.retryCount[operation] = 0 // 成功后重置计数
        }
      } catch (error) {
        logger.warn(`⚠️ Retry ${currentRetries + 1} failed for ${operation}:`, error.message)
      }
    }, delay)
  }

  /**
   * 从PostgreSQL同步数据到Redis (cache_first策略)
   */
  async syncPostgresToRedis() {
    if (!database.isPostgresConnected || !database.isRedisConnected) {
      logger.warn('⚠️ Cannot sync: one or both databases not connected')
      return
    }

    try {
      logger.info('📥 Starting PostgreSQL → Redis sync...')

      // 获取PostgreSQL中的所有API Keys
      const pgKeys = await database.postgres.getAllApiKeys()
      const syncedCount = pgKeys.length

      if (syncedCount === 0) {
        logger.info('📥 No data to sync from PostgreSQL')
        return
      }

      logger.info(`📥 Found ${syncedCount} API Keys in PostgreSQL, syncing to Redis...`)

      // 逐个同步到Redis
      let successCount = 0
      let errorCount = 0

      for (const keyData of pgKeys) {
        try {
          // 转换PostgreSQL格式到Redis格式
          const redisData = this.convertPgToRedisFormat(keyData)
          await database.redis.setApiKey(keyData.id, redisData, keyData.apiKey)
          successCount++
          logger.debug(`✅ Synced API Key: ${keyData.name}`)
        } catch (error) {
          errorCount++
          logger.warn(`⚠️ Failed to sync API Key ${keyData.name}:`, error.message)
        }
      }

      logger.info(
        `📥 PostgreSQL → Redis sync completed: ${successCount} success, ${errorCount} errors`
      )
    } catch (error) {
      logger.error('❌ PostgreSQL → Redis sync failed:', error.message)
      throw error
    }
  }

  /**
   * 从Redis同步数据到PostgreSQL (dual_write策略)
   */
  async syncRedisToPostgres() {
    if (!database.isPostgresConnected || !database.isRedisConnected) {
      logger.warn('⚠️ Cannot sync: one or both databases not connected')
      return
    }

    try {
      logger.info('📤 Starting Redis → PostgreSQL sync...')

      // 获取Redis中的所有API Keys
      const redisKeys = await database.redis.getAllApiKeys()
      const syncedCount = redisKeys.length

      if (syncedCount === 0) {
        logger.info('📤 No data to sync from Redis')
        return
      }

      logger.info(`📤 Found ${syncedCount} API Keys in Redis, syncing to PostgreSQL...`)

      // 逐个同步到PostgreSQL
      let successCount = 0
      let errorCount = 0

      for (const keyData of redisKeys) {
        try {
          await database.postgres.setApiKey(keyData.id, keyData, keyData.apiKey)
          successCount++
          logger.debug(`✅ Synced API Key: ${keyData.name}`)
        } catch (error) {
          errorCount++
          logger.warn(`⚠️ Failed to sync API Key ${keyData.name}:`, error.message)
        }
      }

      logger.info(
        `📤 Redis → PostgreSQL sync completed: ${successCount} success, ${errorCount} errors`
      )
    } catch (error) {
      logger.error('❌ Redis → PostgreSQL sync failed:', error.message)
      throw error
    }
  }

  /**
   * 转换PostgreSQL数据格式为Redis格式
   */
  convertPgToRedisFormat(pgData) {
    return {
      id: pgData.id,
      name: pgData.name,
      description: pgData.description,
      apiKey: pgData.apiKey,
      tokenLimit: pgData.tokenLimit,
      concurrencyLimit: pgData.concurrencyLimit,
      dailyCostLimit: pgData.dailyCostLimit,
      weeklyOpusCostLimit: pgData.weeklyOpusCostLimit,
      permissions: pgData.permissions,
      isActive: pgData.isActive,
      enableModelRestriction: pgData.enableModelRestriction,
      restrictedModels: pgData.restrictedModels,
      enableClientRestriction: pgData.enableClientRestriction,
      allowedClients: pgData.allowedClients,
      expiresAt: pgData.expiresAt,
      expirationMode: pgData.expirationMode,
      activationDays: pgData.activationDays,
      tags: pgData.tags,
      icon: pgData.icon,
      createdAt: pgData.createdAt,
      lastUsedAt: pgData.lastUsedAt
    }
  }

  async performConsistencyCheck() {
    try {
      logger.info('🔍 Starting consistency check...')

      // 获取两个数据库的数据
      logger.info(
        `📊 Getting data from databases: Redis connected=${database.isRedisConnected}, PostgreSQL connected=${database.isPostgresConnected}`
      )

      const redisKeys = database.isRedisConnected ? await database.redis.getAllApiKeys() : []
      const pgKeys = database.isPostgresConnected ? await database.postgres.getAllApiKeys() : []

      const redisCount = redisKeys.length
      const pgCount = pgKeys.length

      logger.info(`📊 Data counts: Redis=${redisCount}, PostgreSQL=${pgCount}`)

      if (Math.abs(redisCount - pgCount) > 0) {
        logger.warn(`⚠️ Data inconsistency detected: Redis=${redisCount}, PostgreSQL=${pgCount}`)

        // 执行详细的数据差异分析和同步
        await this.detectAndFixInconsistencies(redisKeys, pgKeys)
      } else {
        logger.info(`✅ Data counts match (${redisCount}), checking content consistency...`)
        // 即使数量相同，也要检查数据内容是否一致
        const hasContentDifference = await this.compareDataContent(redisKeys, pgKeys)
        if (hasContentDifference) {
          logger.warn('⚠️ Data content inconsistency detected, fixing...')
          await this.detectAndFixInconsistencies(redisKeys, pgKeys)
        } else {
          logger.info(`✅ Data consistency check passed: ${redisCount} records are consistent`)
        }
      }
    } catch (error) {
      logger.warn('⚠️ Consistency check failed:', error.message)
    }
  }

  /**
   * 比较数据内容是否一致
   */
  async compareDataContent(redisKeys, pgKeys) {
    try {
      logger.info('🔍 Starting content comparison...')

      // 创建ID到数据的映射
      const redisMap = new Map(redisKeys.map((key) => [key.id, key]))
      const pgMap = new Map(pgKeys.map((key) => [key.id, key]))

      logger.info(`📊 Redis IDs: [${[...redisMap.keys()].join(', ')}]`)
      logger.info(`📊 PostgreSQL IDs: [${[...pgMap.keys()].join(', ')}]`)

      // 检查每个记录是否在两边都存在且内容一致
      const allIds = new Set([...redisMap.keys(), ...pgMap.keys()])
      logger.info(`📊 All unique IDs: [${[...allIds].join(', ')}]`)

      for (const id of allIds) {
        const redisData = redisMap.get(id)
        const pgData = pgMap.get(id)

        logger.info(`🔍 Checking ID: ${id}`)
        logger.info(`  Redis data exists: ${!!redisData}`)
        logger.info(`  PostgreSQL data exists: ${!!pgData}`)

        // 如果某一边缺失记录
        if (!redisData || !pgData) {
          logger.warn(`⚠️ Missing data detected for ID: ${id}`)
          logger.warn(`  Missing in Redis: ${!redisData}`)
          logger.warn(`  Missing in PostgreSQL: ${!pgData}`)
          return true
        }

        // 比较关键字段是否一致
        if (
          redisData.name !== pgData.name ||
          redisData.isActive !== pgData.isActive ||
          redisData.tokenLimit !== pgData.tokenLimit ||
          redisData.description !== pgData.description
        ) {
          logger.warn(`📝 Content difference found in API Key: ${id}`)
          logger.warn(`  Redis: name=${redisData.name}, active=${redisData.isActive}`)
          logger.warn(`  PostgreSQL: name=${pgData.name}, active=${pgData.isActive}`)
          return true
        }

        logger.info(`✅ Content matches for ID: ${id}`)
      }

      logger.info('✅ All content comparison passed')
      return false
    } catch (error) {
      logger.warn('⚠️ Content comparison failed:', error.message)
      return true // 出错时假设有差异，触发同步
    }
  }

  /**
   * 检测并修复数据不一致性
   */
  async detectAndFixInconsistencies(_redisKeys, _pgKeys) {
    try {
      const { strategy } = database

      // 根据策略决定同步方向
      if (strategy === 'cache_first') {
        // cache_first: Redis作为缓存，数据应该备份到PostgreSQL
        logger.info('🔧 Fixing inconsistencies (cache_first): Redis → PostgreSQL')
        await this.syncRedisToPostgres()
      } else if (
        strategy === 'database_first' ||
        strategy === 'dual_write' ||
        strategy === 'postgres_only'
      ) {
        // PostgreSQL为主，Redis数据向PostgreSQL同步
        logger.info('🔧 Fixing inconsistencies: Redis → PostgreSQL')
        await this.syncRedisToPostgres()
      } else if (strategy === 'redis_only') {
        // 仅Redis时，不需要同步（但这种情况不应该有不一致）
        logger.warn('🔧 Redis-only mode should not have inconsistencies, skipping sync')
      }

      // 再次检查修复结果
      const newRedisCount = database.isRedisConnected
        ? (await database.redis.getAllApiKeys()).length
        : 0
      const newPgCount = database.isPostgresConnected
        ? (await database.postgres.getAllApiKeys()).length
        : 0

      if (Math.abs(newRedisCount - newPgCount) === 0) {
        logger.info(
          `✅ Data inconsistencies fixed: Both databases now have ${newRedisCount} records`
        )
      } else {
        logger.warn(
          `⚠️ Inconsistencies still exist after fix: Redis=${newRedisCount}, PostgreSQL=${newPgCount}`
        )
      }
    } catch (error) {
      logger.error('❌ Failed to fix data inconsistencies:', error.message)
    }
  }

  logHealthStatus(health) {
    logger.info('📊 Database Health Status:')
    logger.info(`   Overall: ${health.overall ? 'Healthy' : 'Unhealthy'}`)
    logger.info(`   Strategy: ${health.strategy}`)
    logger.info(`   Redis: ${health.redis ? '🟢 Connected' : '🔴 Disconnected'}`)
    logger.info(`   PostgreSQL: ${health.postgres ? '🟢 Connected' : '🔴 Disconnected'}`)

    if (!health.overall) {
      logger.error('❌ Database health check failed')
    } else if (!health.redis || !health.postgres) {
      logger.warn('⚠️ Database running in degraded mode')
    }
  }

  async getHealthStatus() {
    if (!this.isInitialized) {
      return {
        status: 'not_initialized',
        message: 'Database not initialized'
      }
    }

    try {
      const health = await database.healthCheck()
      const stats = database.getStats()

      return {
        status: health.overall ? 'healthy' : 'unhealthy',
        databases: {
          redis: health.redis,
          postgres: health.postgres
        },
        strategy: health.strategy,
        stats,
        initialized: this.isInitialized,
        syncEnabled: config.database?.sync?.enabled || false
      }
    } catch (error) {
      return {
        status: 'error',
        message: error.message,
        initialized: this.isInitialized
      }
    }
  }

  async shutdown() {
    try {
      logger.info('🔄 Shutting down Database Client...')

      // 停止定期同步
      if (this.syncInterval) {
        clearInterval(this.syncInterval)
        this.syncInterval = null
      }

      // 断开数据库连接
      await database.disconnect()

      this.isInitialized = false
      logger.info('👋 Database Client shutdown completed')
    } catch (error) {
      logger.error('❌ Error during database shutdown:', error)
    }
  }

  // 强制同步方法 (供管理接口使用)
  async forceSyncRedisToPostgres() {
    if (!this.isInitialized) {
      throw new Error('Database not initialized')
    }

    logger.info('🔄 Force syncing Redis to PostgreSQL...')

    try {
      // 直接调用实际的同步方法
      await this.syncRedisToPostgres()

      // 获取同步后的统计
      const redisCount = database.isRedisConnected
        ? (await database.redis.getAllApiKeys()).length
        : 0
      const pgCount = database.isPostgresConnected
        ? (await database.postgres.getAllApiKeys()).length
        : 0

      const result = {
        synced: pgCount,
        total: redisCount,
        errors: 0,
        message: `Successfully synced Redis data to PostgreSQL`
      }

      logger.info(`✅ Force sync completed: ${result.message}`)
      return result
    } catch (error) {
      logger.error('❌ Force sync Redis to PostgreSQL failed:', error)
      return {
        synced: 0,
        total: 0,
        errors: 1,
        message: `Sync failed: ${error.message}`
      }
    }
  }

  async forceSyncPostgresToRedis() {
    if (!this.isInitialized) {
      throw new Error('Database not initialized')
    }

    logger.info('🔄 Force syncing PostgreSQL to Redis...')

    try {
      // 直接调用实际的同步方法
      await this.syncPostgresToRedis()

      // 获取同步后的统计
      const pgCount = database.isPostgresConnected
        ? (await database.postgres.getAllApiKeys()).length
        : 0
      const redisCount = database.isRedisConnected
        ? (await database.redis.getAllApiKeys()).length
        : 0

      const result = {
        synced: redisCount,
        total: pgCount,
        errors: 0,
        message: `Successfully synced PostgreSQL data to Redis`
      }

      logger.info(`✅ Force sync completed: ${result.message}`)
      return result
    } catch (error) {
      logger.error('❌ Force sync PostgreSQL to Redis failed:', error)
      return {
        synced: 0,
        total: 0,
        errors: 1,
        message: `Sync failed: ${error.message}`
      }
    }
  }

  // 数据库切换方法 (紧急情况使用)
  async switchToRedisOnly() {
    logger.warn('⚠️ Switching to Redis-only mode...')
    database.strategy = 'redis_only'
    database.isPostgresConnected = false
    logger.warn('⚠️ Now running in Redis-only mode')
  }

  async switchToPostgresOnly() {
    logger.warn('⚠️ Switching to PostgreSQL-only mode...')
    database.strategy = 'postgres_only'
    database.isRedisConnected = false
    logger.warn('⚠️ Now running in PostgreSQL-only mode')
  }

  async restoreDualMode() {
    logger.info('🔄 Attempting to restore dual-write mode...')

    try {
      await database.initialize()
      const health = await database.healthCheck()

      if (health.redis && health.postgres) {
        database.strategy = 'dual_write'
        database.isRedisConnected = true
        database.isPostgresConnected = true
        logger.success('✅ Restored to dual-write mode')
        return true
      } else {
        logger.warn('⚠️ Cannot restore dual-write mode - health check failed')
        return false
      }
    } catch (error) {
      logger.error('❌ Failed to restore dual-write mode:', error)
      return false
    }
  }
}

// 创建单例实例
const databaseInitializer = new DatabaseInitializer()

module.exports = databaseInitializer
