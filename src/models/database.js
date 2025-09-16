const config = require('../../config/config')
const redisClient = require('./redis')
const postgresClient = require('./postgres')
const logger = require('../utils/logger')

/**
 * 统一数据访问层 - Redis + PostgreSQL 混合存储架构
 *
 * 支持以下存储策略：
 * - dual_write: 双写模式（默认）- 写入时同时写入 Redis 和 PostgreSQL
 * - cache_first: 缓存优先 - 读取时优先从 Redis，未命中时从 PostgreSQL 读取并缓存
 * - database_first: 数据库优先 - 优先从 PostgreSQL 读取，Redis 作为缓存
 * - redis_only: 仅 Redis
 * - postgres_only: 仅 PostgreSQL
 */
class DatabaseManager {
  constructor() {
    this.redis = redisClient
    this.postgres = postgresClient
    this.strategy = config.database?.strategy || 'dual_write'
    this.cacheConfig = config.database?.cache || {}
    this.fallbackConfig = config.database?.fallback || {}
    this.isRedisConnected = false
    this.isPostgresConnected = false

    // 性能统计
    this.stats = {
      redisHits: 0,
      redisMisses: 0,
      postgresQueries: 0,
      cacheSets: 0,
      errors: 0
    }
  }

  /**
   * 初始化数据库连接
   */
  async initialize() {
    try {
      // 根据策略初始化对应的数据库
      if (this.strategy !== 'postgres_only') {
        try {
          await this.redis.connect()
          this.isRedisConnected = true
          logger.info('🔗 Database Manager: Redis connected')
        } catch (error) {
          logger.error('❌ Database Manager: Redis connection failed:', error)
          if (this.strategy === 'redis_only') {
            throw error
          }
        }
      }

      if (this.strategy !== 'redis_only' && config.postgres?.enabled) {
        try {
          await this.postgres.connect()
          this.isPostgresConnected = true
          logger.info('🔗 Database Manager: PostgreSQL connected')
        } catch (error) {
          logger.error('❌ Database Manager: PostgreSQL connection failed:', error)
          if (this.strategy === 'postgres_only') {
            throw error
          }
        }
      }

      // 验证至少一个数据库连接成功
      if (!this.isRedisConnected && !this.isPostgresConnected) {
        throw new Error('Neither Redis nor PostgreSQL connection available')
      }

      logger.info(`🎯 Database Manager initialized with strategy: ${this.strategy}`)
      return true
    } catch (error) {
      logger.error('💥 Database Manager initialization failed:', error)
      throw error
    }
  }

  /**
   * 断开数据库连接
   */
  async disconnect() {
    try {
      if (this.isRedisConnected) {
        await this.redis.disconnect()
        this.isRedisConnected = false
      }
      if (this.isPostgresConnected) {
        await this.postgres.disconnect()
        this.isPostgresConnected = false
      }
      logger.info('👋 Database Manager disconnected')
    } catch (error) {
      logger.error('❌ Database Manager disconnect error:', error)
    }
  }

  /**
   * 获取缓存键名
   */
  _getCacheKey(type, id) {
    return `cache:${type}:${id}`
  }

  /**
   * 获取TTL配置
   */
  _getTTL(type) {
    const ttlMap = {
      apikey: this.cacheConfig.apiKeyTTL || 86400,
      session: this.cacheConfig.sessionTTL || 1800,
      usage: this.cacheConfig.usageStatsTTL || 300,
      account: this.cacheConfig.accountTTL || 3600
    }
    return ttlMap[type] || this.cacheConfig.defaultTTL || 3600
  }

  /**
   * 统一错误处理和降级策略
   */
  async _executeWithFallback(operation, fallbackOperation = null) {
    const timeout = this.fallbackConfig.timeout || 5000
    const maxRetries = this.fallbackConfig.maxRetries || 3

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Operation timeout')), timeout)
        })

        const result = await Promise.race([operation(), timeoutPromise])
        return result
      } catch (error) {
        this.stats.errors++
        logger.warn(`⚠️ Database operation failed (attempt ${attempt}/${maxRetries}):`, error)

        if (attempt === maxRetries) {
          if (fallbackOperation) {
            logger.info('🔄 Executing fallback operation')
            try {
              return await fallbackOperation()
            } catch (fallbackError) {
              logger.error('❌ Fallback operation also failed:', fallbackError)
              throw fallbackError
            }
          }
          throw error
        }

        // 指数退避重试
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000))
      }
    }
  }

  // =====================================
  // API Key 相关操作（与 Redis 兼容的接口）
  // =====================================

  /**
   * 设置 API Key
   * @param {string} keyId - API Key ID
   * @param {Object} keyData - API Key 数据
   * @param {string} hashedKey - 哈希后的 Key（用于索引）
   */
  async setApiKey(keyId, keyData, hashedKey = null) {
    switch (this.strategy) {
      case 'dual_write':
        return this._dualWriteApiKey(keyId, keyData, hashedKey)
      case 'cache_first':
      case 'redis_only':
        return this._setApiKeyRedis(keyId, keyData, hashedKey)
      case 'database_first':
      case 'postgres_only':
        return this._setApiKeyPostgres(keyId, keyData, hashedKey)
      default:
        throw new Error(`Unknown strategy: ${this.strategy}`)
    }
  }

  async _dualWriteApiKey(keyId, keyData, hashedKey) {
    const operations = []

    // Redis 写入
    if (this.isRedisConnected) {
      operations.push(
        this._executeWithFallback(() => this.redis.setApiKey(keyId, keyData, hashedKey))
      )
    }

    // PostgreSQL 写入
    if (this.isPostgresConnected) {
      operations.push(
        this._executeWithFallback(() => this.postgres.setApiKey(keyId, keyData, hashedKey))
      )
    }

    const results = await Promise.allSettled(operations)

    // 检查是否至少一个写入成功
    const successCount = results.filter((r) => r.status === 'fulfilled').length
    if (successCount === 0) {
      throw new Error('All write operations failed')
    }

    if (successCount < operations.length) {
      logger.warn(
        `⚠️ Partial write success: ${successCount}/${operations.length} operations succeeded`
      )
    }

    return true
  }

  async _setApiKeyRedis(keyId, keyData, hashedKey) {
    if (!this.isRedisConnected) {
      throw new Error('Redis not connected')
    }
    return this._executeWithFallback(() => this.redis.setApiKey(keyId, keyData, hashedKey))
  }

  async _setApiKeyPostgres(keyId, keyData, hashedKey) {
    if (!this.isPostgresConnected) {
      throw new Error('PostgreSQL not connected')
    }
    return this._executeWithFallback(() => this.postgres.setApiKey(keyId, keyData, hashedKey))
  }

  /**
   * 获取 API Key
   * @param {string} keyId - API Key ID
   */
  async getApiKey(keyId) {
    switch (this.strategy) {
      case 'cache_first':
        return this._getApiKeyCacheFirst(keyId)
      case 'database_first':
        return this._getApiKeyDatabaseFirst(keyId)
      case 'dual_write':
        return this._getApiKeyDualRead(keyId)
      case 'redis_only':
        return this._getApiKeyRedis(keyId)
      case 'postgres_only':
        return this._getApiKeyPostgres(keyId)
      default:
        throw new Error(`Unknown strategy: ${this.strategy}`)
    }
  }

  async _getApiKeyCacheFirst(keyId) {
    // 优先从 Redis 读取
    if (this.isRedisConnected) {
      try {
        const result = await this._executeWithFallback(() => this.redis.getApiKey(keyId))
        if (result && Object.keys(result).length > 0) {
          this.stats.redisHits++
          return result
        }
      } catch (error) {
        logger.warn('⚠️ Redis read failed, falling back to PostgreSQL:', error)
      }
    }

    this.stats.redisMisses++

    // Redis 未命中，从 PostgreSQL 读取
    if (this.isPostgresConnected) {
      try {
        const result = await this._executeWithFallback(() => this.postgres.getApiKey(keyId))

        // 如果找到数据，异步缓存到 Redis
        if (result && Object.keys(result).length > 0 && this.isRedisConnected) {
          this._cacheToRedis('apikey', keyId, result).catch((error) => {
            logger.warn('⚠️ Failed to cache to Redis:', error)
          })
        }

        return result
      } catch (error) {
        logger.error('❌ PostgreSQL read also failed:', error)
        throw error
      }
    }

    return {}
  }

  async _getApiKeyDatabaseFirst(keyId) {
    // 优先从 PostgreSQL 读取
    if (this.isPostgresConnected) {
      try {
        const result = await this._executeWithFallback(() => this.postgres.getApiKey(keyId))
        if (result && Object.keys(result).length > 0) {
          this.stats.postgresQueries++

          // 异步缓存到 Redis
          if (this.isRedisConnected) {
            this._cacheToRedis('apikey', keyId, result).catch((error) => {
              logger.warn('⚠️ Failed to cache to Redis:', error)
            })
          }

          return result
        }
      } catch (error) {
        logger.warn('⚠️ PostgreSQL read failed, falling back to Redis:', error)
      }
    }

    // PostgreSQL 未命中或失败，从 Redis 读取
    if (this.isRedisConnected) {
      try {
        const result = await this._executeWithFallback(() => this.redis.getApiKey(keyId))
        if (result && Object.keys(result).length > 0) {
          this.stats.redisHits++
        } else {
          this.stats.redisMisses++
        }
        return result
      } catch (error) {
        logger.error('❌ Redis read also failed:', error)
        throw error
      }
    }

    return {}
  }

  async _getApiKeyDualRead(keyId) {
    // 双读模式：优先 Redis，失败则 PostgreSQL
    return this._getApiKeyCacheFirst(keyId)
  }

  async _getApiKeyRedis(keyId) {
    if (!this.isRedisConnected) {
      throw new Error('Redis not connected')
    }
    const result = await this._executeWithFallback(() => this.redis.getApiKey(keyId))
    if (result && Object.keys(result).length > 0) {
      this.stats.redisHits++
    } else {
      this.stats.redisMisses++
    }
    return result
  }

  async _getApiKeyPostgres(keyId) {
    if (!this.isPostgresConnected) {
      throw new Error('PostgreSQL not connected')
    }
    this.stats.postgresQueries++
    return this._executeWithFallback(() => this.postgres.getApiKey(keyId))
  }

  /**
   * 删除 API Key
   * @param {string} keyId - API Key ID
   */
  async deleteApiKey(keyId) {
    switch (this.strategy) {
      case 'dual_write':
        return this._dualDeleteApiKey(keyId)
      case 'redis_only':
      case 'cache_first':
        return this._deleteApiKeyRedis(keyId)
      case 'postgres_only':
      case 'database_first':
        return this._deleteApiKeyPostgres(keyId)
      default:
        throw new Error(`Unknown strategy: ${this.strategy}`)
    }
  }

  async _dualDeleteApiKey(keyId) {
    const operations = []

    if (this.isRedisConnected) {
      operations.push(this._executeWithFallback(() => this.redis.deleteApiKey(keyId)))
    }

    if (this.isPostgresConnected) {
      operations.push(this._executeWithFallback(() => this.postgres.deleteApiKey(keyId)))
    }

    const results = await Promise.allSettled(operations)
    const successCount = results.filter((r) => r.status === 'fulfilled').length

    return successCount > 0
  }

  async _deleteApiKeyRedis(keyId) {
    if (!this.isRedisConnected) {
      throw new Error('Redis not connected')
    }
    return this._executeWithFallback(() => this.redis.deleteApiKey(keyId))
  }

  async _deleteApiKeyPostgres(keyId) {
    if (!this.isPostgresConnected) {
      throw new Error('PostgreSQL not connected')
    }
    return this._executeWithFallback(() => this.postgres.deleteApiKey(keyId))
  }

  /**
   * 获取所有 API Keys
   */
  async getAllApiKeys() {
    switch (this.strategy) {
      case 'cache_first':
      case 'redis_only':
        return this._getAllApiKeysRedis()
      case 'database_first':
      case 'postgres_only':
      case 'dual_write':
        return this._getAllApiKeysPostgres()
      default:
        throw new Error(`Unknown strategy: ${this.strategy}`)
    }
  }

  async _getAllApiKeysRedis() {
    if (!this.isRedisConnected) {
      throw new Error('Redis not connected')
    }
    return this._executeWithFallback(() => this.redis.getAllApiKeys())
  }

  async _getAllApiKeysPostgres() {
    if (!this.isPostgresConnected) {
      throw new Error('PostgreSQL not connected')
    }
    this.stats.postgresQueries++
    return this._executeWithFallback(() => this.postgres.getAllApiKeys())
  }

  /**
   * 通过哈希值查找 API Key
   * @param {string} hashedKey - 哈希后的 Key
   */
  async findApiKeyByHash(hashedKey) {
    switch (this.strategy) {
      case 'cache_first':
      case 'redis_only':
        return this._findApiKeyByHashRedis(hashedKey)
      case 'database_first':
      case 'postgres_only':
        return this._findApiKeyByHashPostgres(hashedKey)
      case 'dual_write':
        return this._findApiKeyByHashDual(hashedKey)
      default:
        throw new Error(`Unknown strategy: ${this.strategy}`)
    }
  }

  async _findApiKeyByHashRedis(hashedKey) {
    if (!this.isRedisConnected) {
      throw new Error('Redis not connected')
    }
    const result = await this._executeWithFallback(() => this.redis.findApiKeyByHash(hashedKey))
    if (result) {
      this.stats.redisHits++
    } else {
      this.stats.redisMisses++
    }
    return result
  }

  async _findApiKeyByHashPostgres(hashedKey) {
    if (!this.isPostgresConnected) {
      throw new Error('PostgreSQL not connected')
    }
    this.stats.postgresQueries++
    return this._executeWithFallback(() => this.postgres.findApiKeyByHash(hashedKey))
  }

  async _findApiKeyByHashDual(hashedKey) {
    // 优先从 Redis 查找
    if (this.isRedisConnected) {
      try {
        const result = await this._executeWithFallback(() => this.redis.findApiKeyByHash(hashedKey))
        if (result) {
          this.stats.redisHits++
          return result
        }
      } catch (error) {
        logger.warn('⚠️ Redis hash lookup failed, falling back to PostgreSQL:', error)
      }
    }

    this.stats.redisMisses++

    // Redis 未命中，从 PostgreSQL 查找
    if (this.isPostgresConnected) {
      this.stats.postgresQueries++
      return this._executeWithFallback(() => this.postgres.findApiKeyByHash(hashedKey))
    }

    return null
  }

  // =====================================
  // 使用统计相关操作
  // =====================================

  /**
   * 增加 Token 使用量统计
   */
  async incrementTokenUsage(
    keyId,
    tokens,
    inputTokens = 0,
    outputTokens = 0,
    cacheCreateTokens = 0,
    cacheReadTokens = 0,
    model = 'unknown',
    ephemeral5mTokens = 0,
    ephemeral1hTokens = 0,
    isLongContextRequest = false
  ) {
    switch (this.strategy) {
      case 'dual_write':
        return this._dualIncrementTokenUsage(
          keyId,
          tokens,
          inputTokens,
          outputTokens,
          cacheCreateTokens,
          cacheReadTokens,
          model,
          ephemeral5mTokens,
          ephemeral1hTokens,
          isLongContextRequest
        )
      case 'redis_only':
      case 'cache_first':
        return this._incrementTokenUsageRedis(
          keyId,
          tokens,
          inputTokens,
          outputTokens,
          cacheCreateTokens,
          cacheReadTokens,
          model,
          ephemeral5mTokens,
          ephemeral1hTokens,
          isLongContextRequest
        )
      case 'postgres_only':
      case 'database_first':
        return this._incrementTokenUsagePostgres(
          keyId,
          tokens,
          inputTokens,
          outputTokens,
          cacheCreateTokens,
          cacheReadTokens,
          model,
          ephemeral5mTokens,
          ephemeral1hTokens,
          isLongContextRequest
        )
      default:
        throw new Error(`Unknown strategy: ${this.strategy}`)
    }
  }

  async _dualIncrementTokenUsage(
    keyId,
    tokens,
    inputTokens,
    outputTokens,
    cacheCreateTokens,
    cacheReadTokens,
    model,
    ephemeral5mTokens,
    ephemeral1hTokens,
    isLongContextRequest
  ) {
    const operations = []

    if (this.isRedisConnected) {
      operations.push(
        this._executeWithFallback(() =>
          this.redis.incrementTokenUsage(
            keyId,
            tokens,
            inputTokens,
            outputTokens,
            cacheCreateTokens,
            cacheReadTokens,
            model,
            ephemeral5mTokens,
            ephemeral1hTokens,
            isLongContextRequest
          )
        )
      )
    }

    if (this.isPostgresConnected) {
      operations.push(
        this._executeWithFallback(() =>
          this.postgres.incrementTokenUsage(
            keyId,
            tokens,
            inputTokens,
            outputTokens,
            cacheCreateTokens,
            cacheReadTokens,
            model,
            ephemeral5mTokens,
            ephemeral1hTokens,
            isLongContextRequest
          )
        )
      )
    }

    const results = await Promise.allSettled(operations)
    const successCount = results.filter((r) => r.status === 'fulfilled').length

    if (successCount === 0) {
      throw new Error('All usage increment operations failed')
    }

    return true
  }

  async _incrementTokenUsageRedis(
    keyId,
    tokens,
    inputTokens,
    outputTokens,
    cacheCreateTokens,
    cacheReadTokens,
    model,
    ephemeral5mTokens,
    ephemeral1hTokens,
    isLongContextRequest
  ) {
    if (!this.isRedisConnected) {
      throw new Error('Redis not connected')
    }
    return this._executeWithFallback(() =>
      this.redis.incrementTokenUsage(
        keyId,
        tokens,
        inputTokens,
        outputTokens,
        cacheCreateTokens,
        cacheReadTokens,
        model,
        ephemeral5mTokens,
        ephemeral1hTokens,
        isLongContextRequest
      )
    )
  }

  async _incrementTokenUsagePostgres(
    keyId,
    tokens,
    inputTokens,
    outputTokens,
    cacheCreateTokens,
    cacheReadTokens,
    model,
    ephemeral5mTokens,
    ephemeral1hTokens,
    isLongContextRequest
  ) {
    if (!this.isPostgresConnected) {
      throw new Error('PostgreSQL not connected')
    }
    return this._executeWithFallback(() =>
      this.postgres.incrementTokenUsage(
        keyId,
        tokens,
        inputTokens,
        outputTokens,
        cacheCreateTokens,
        cacheReadTokens,
        model,
        ephemeral5mTokens,
        ephemeral1hTokens,
        isLongContextRequest
      )
    )
  }

  /**
   * 获取使用统计
   */
  async getUsageStats(keyId) {
    switch (this.strategy) {
      case 'cache_first':
        return this._getUsageStatsCacheFirst(keyId)
      case 'database_first':
        return this._getUsageStatsDatabaseFirst(keyId)
      case 'redis_only':
        return this._getUsageStatsRedis(keyId)
      case 'postgres_only':
        return this._getUsageStatsPostgres(keyId)
      case 'dual_write':
        return this._getUsageStatsDual(keyId)
      default:
        throw new Error(`Unknown strategy: ${this.strategy}`)
    }
  }

  async _getUsageStatsCacheFirst(keyId) {
    const cacheKey = this._getCacheKey('usage', keyId)

    if (this.isRedisConnected) {
      try {
        const cached = await this._executeWithFallback(() => this.redis.get(cacheKey))
        if (cached) {
          this.stats.redisHits++
          return JSON.parse(cached)
        }
      } catch (error) {
        logger.warn('⚠️ Usage stats cache read failed:', error)
      }
    }

    this.stats.redisMisses++

    if (this.isPostgresConnected) {
      try {
        this.stats.postgresQueries++
        const result = await this._executeWithFallback(() => this.postgres.getUsageStats(keyId))

        // 缓存结果
        if (result && this.isRedisConnected) {
          const ttl = this._getTTL('usage')
          this._cacheToRedis('usage', keyId, result, ttl).catch((error) => {
            logger.warn('⚠️ Failed to cache usage stats:', error)
          })
        }

        return result
      } catch (error) {
        logger.error('❌ PostgreSQL usage stats read failed:', error)
        throw error
      }
    }

    throw new Error('No database available for usage stats')
  }

  async _getUsageStatsDatabaseFirst(keyId) {
    if (this.isPostgresConnected) {
      try {
        this.stats.postgresQueries++
        return await this._executeWithFallback(() => this.postgres.getUsageStats(keyId))
      } catch (error) {
        logger.warn('⚠️ PostgreSQL usage stats read failed, falling back to Redis:', error)
      }
    }

    if (this.isRedisConnected) {
      const result = await this._executeWithFallback(() => this.redis.getUsageStats(keyId))
      if (result) {
        this.stats.redisHits++
      } else {
        this.stats.redisMisses++
      }
      return result
    }

    throw new Error('No database available for usage stats')
  }

  async _getUsageStatsRedis(keyId) {
    if (!this.isRedisConnected) {
      throw new Error('Redis not connected')
    }
    const result = await this._executeWithFallback(() => this.redis.getUsageStats(keyId))
    if (result) {
      this.stats.redisHits++
    } else {
      this.stats.redisMisses++
    }
    return result
  }

  async _getUsageStatsPostgres(keyId) {
    if (!this.isPostgresConnected) {
      throw new Error('PostgreSQL not connected')
    }
    this.stats.postgresQueries++
    return this._executeWithFallback(() => this.postgres.getUsageStats(keyId))
  }

  async _getUsageStatsDual(keyId) {
    // 双读模式：优先 PostgreSQL（数据最准确）
    return this._getUsageStatsDatabaseFirst(keyId)
  }

  // =====================================
  // 费用统计相关操作
  // =====================================

  /**
   * 增加每日费用
   */
  async incrementDailyCost(keyId, amount) {
    // 费用统计主要使用 Redis，PostgreSQL 作为备份
    if (this.isRedisConnected) {
      return this._executeWithFallback(() => this.redis.incrementDailyCost(keyId, amount))
    }

    if (this.isPostgresConnected) {
      // PostgreSQL 暂不支持费用统计，返回成功
      logger.warn('⚠️ PostgreSQL cost tracking not implemented, using Redis fallback')
      return true
    }

    throw new Error('No database available for cost tracking')
  }

  /**
   * 获取每日费用
   */
  async getDailyCost(keyId) {
    if (this.isRedisConnected) {
      try {
        return await this._executeWithFallback(() => this.redis.getDailyCost(keyId))
      } catch (error) {
        logger.warn('⚠️ Redis daily cost read failed:', error)
      }
    }

    return 0 // 默认返回 0
  }

  /**
   * 获取费用统计
   */
  async getCostStats(keyId) {
    if (this.isRedisConnected) {
      try {
        return await this._executeWithFallback(() => this.redis.getCostStats(keyId))
      } catch (error) {
        logger.warn('⚠️ Redis cost stats read failed:', error)
      }
    }

    return { daily: 0, monthly: 0, hourly: 0, total: 0 }
  }

  /**
   * 增加每周 Opus 费用
   */
  async incrementWeeklyOpusCost(keyId, amount) {
    if (this.isRedisConnected) {
      return this._executeWithFallback(() => this.redis.incrementWeeklyOpusCost(keyId, amount))
    }

    return true // 如果 Redis 不可用，返回成功
  }

  /**
   * 获取每周 Opus 费用
   */
  async getWeeklyOpusCost(keyId) {
    if (this.isRedisConnected) {
      try {
        return await this._executeWithFallback(() => this.redis.getWeeklyOpusCost(keyId))
      } catch (error) {
        logger.warn('⚠️ Redis weekly Opus cost read failed:', error)
      }
    }

    return 0
  }

  // =====================================
  // 会话管理相关操作
  // =====================================

  /**
   * 设置会话
   */
  async setSession(sessionId, sessionData, ttl = 86400) {
    switch (this.strategy) {
      case 'dual_write':
        return this._dualSetSession(sessionId, sessionData, ttl)
      case 'redis_only':
      case 'cache_first':
        return this._setSessionRedis(sessionId, sessionData, ttl)
      case 'postgres_only':
      case 'database_first':
        return this._setSessionPostgres(sessionId, sessionData, ttl)
      default:
        throw new Error(`Unknown strategy: ${this.strategy}`)
    }
  }

  async _dualSetSession(sessionId, sessionData, ttl) {
    const operations = []

    if (this.isRedisConnected) {
      operations.push(
        this._executeWithFallback(() => this.redis.setSession(sessionId, sessionData, ttl))
      )
    }

    if (this.isPostgresConnected) {
      operations.push(
        this._executeWithFallback(() => this.postgres.setSession(sessionId, sessionData, ttl))
      )
    }

    const results = await Promise.allSettled(operations)
    const successCount = results.filter((r) => r.status === 'fulfilled').length

    return successCount > 0
  }

  async _setSessionRedis(sessionId, sessionData, ttl) {
    if (!this.isRedisConnected) {
      throw new Error('Redis not connected')
    }
    return this._executeWithFallback(() => this.redis.setSession(sessionId, sessionData, ttl))
  }

  async _setSessionPostgres(sessionId, sessionData, ttl) {
    if (!this.isPostgresConnected) {
      throw new Error('PostgreSQL not connected')
    }
    return this._executeWithFallback(() => this.postgres.setSession(sessionId, sessionData, ttl))
  }

  /**
   * 获取会话
   */
  async getSession(sessionId) {
    switch (this.strategy) {
      case 'cache_first':
      case 'redis_only':
        return this._getSessionRedis(sessionId)
      case 'database_first':
      case 'postgres_only':
        return this._getSessionPostgres(sessionId)
      case 'dual_write':
        return this._getSessionDual(sessionId)
      default:
        throw new Error(`Unknown strategy: ${this.strategy}`)
    }
  }

  async _getSessionRedis(sessionId) {
    if (!this.isRedisConnected) {
      throw new Error('Redis not connected')
    }
    return this._executeWithFallback(() => this.redis.getSession(sessionId))
  }

  async _getSessionPostgres(sessionId) {
    if (!this.isPostgresConnected) {
      throw new Error('PostgreSQL not connected')
    }
    return this._executeWithFallback(() => this.postgres.getSession(sessionId))
  }

  async _getSessionDual(sessionId) {
    // 会话优先从 Redis 读取（性能更好）
    if (this.isRedisConnected) {
      try {
        return await this._executeWithFallback(() => this.redis.getSession(sessionId))
      } catch (error) {
        logger.warn('⚠️ Redis session read failed, falling back to PostgreSQL:', error)
      }
    }

    if (this.isPostgresConnected) {
      return this._executeWithFallback(() => this.postgres.getSession(sessionId))
    }

    return {}
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId) {
    switch (this.strategy) {
      case 'dual_write':
        return this._dualDeleteSession(sessionId)
      case 'redis_only':
      case 'cache_first':
        return this._deleteSessionRedis(sessionId)
      case 'postgres_only':
      case 'database_first':
        return this._deleteSessionPostgres(sessionId)
      default:
        throw new Error(`Unknown strategy: ${this.strategy}`)
    }
  }

  async _dualDeleteSession(sessionId) {
    const operations = []

    if (this.isRedisConnected) {
      operations.push(this._executeWithFallback(() => this.redis.deleteSession(sessionId)))
    }

    if (this.isPostgresConnected) {
      operations.push(this._executeWithFallback(() => this.postgres.deleteSession(sessionId)))
    }

    const results = await Promise.allSettled(operations)
    const successCount = results.filter((r) => r.status === 'fulfilled').length

    return successCount > 0
  }

  async _deleteSessionRedis(sessionId) {
    if (!this.isRedisConnected) {
      throw new Error('Redis not connected')
    }
    return this._executeWithFallback(() => this.redis.deleteSession(sessionId))
  }

  async _deleteSessionPostgres(sessionId) {
    if (!this.isPostgresConnected) {
      throw new Error('PostgreSQL not connected')
    }
    return this._executeWithFallback(() => this.postgres.deleteSession(sessionId))
  }

  // =====================================
  // 并发控制相关操作
  // =====================================

  /**
   * 增加并发计数（主要使用 Redis）
   */
  async incrConcurrency(apiKeyId) {
    if (this.isRedisConnected) {
      return this._executeWithFallback(() => this.redis.incrConcurrency(apiKeyId))
    }

    // PostgreSQL 不支持并发计数，返回 1
    return 1
  }

  /**
   * 减少并发计数（主要使用 Redis）
   */
  async decrConcurrency(apiKeyId) {
    if (this.isRedisConnected) {
      return this._executeWithFallback(() => this.redis.decrConcurrency(apiKeyId))
    }

    return 0
  }

  /**
   * 获取当前并发数（主要使用 Redis）
   */
  async getConcurrency(apiKeyId) {
    if (this.isRedisConnected) {
      return this._executeWithFallback(() => this.redis.getConcurrency(apiKeyId))
    }

    return 0
  }

  // =====================================
  // 账户使用统计相关操作
  // =====================================

  /**
   * 增加账户使用统计
   */
  async incrementAccountUsage(
    accountId,
    totalTokens,
    inputTokens = 0,
    outputTokens = 0,
    cacheCreateTokens = 0,
    cacheReadTokens = 0,
    model = 'unknown',
    isLongContextRequest = false
  ) {
    // 账户统计主要使用 Redis
    if (this.isRedisConnected) {
      return this._executeWithFallback(() =>
        this.redis.incrementAccountUsage(
          accountId,
          totalTokens,
          inputTokens,
          outputTokens,
          cacheCreateTokens,
          cacheReadTokens,
          model,
          isLongContextRequest
        )
      )
    }

    return true
  }

  /**
   * 获取账户使用统计
   */
  async getAccountUsageStats(accountId, accountType = null) {
    if (this.isRedisConnected) {
      return this._executeWithFallback(() =>
        this.redis.getAccountUsageStats(accountId, accountType)
      )
    }

    // 返回空统计
    return {
      accountId,
      total: { tokens: 0, inputTokens: 0, outputTokens: 0, requests: 0 },
      daily: { tokens: 0, inputTokens: 0, outputTokens: 0, requests: 0, cost: 0 },
      monthly: { tokens: 0, inputTokens: 0, outputTokens: 0, requests: 0 },
      averages: { rpm: 0, tpm: 0, dailyRequests: 0, dailyTokens: 0 }
    }
  }

  /**
   * 获取所有账户使用统计
   */
  async getAllAccountsUsageStats() {
    if (this.isRedisConnected) {
      return this._executeWithFallback(() => this.redis.getAllAccountsUsageStats())
    }

    return []
  }

  // =====================================
  // 系统统计相关操作
  // =====================================

  /**
   * 获取系统统计
   */
  async getSystemStats() {
    switch (this.strategy) {
      case 'postgres_only':
      case 'database_first':
        if (this.isPostgresConnected) {
          return this._executeWithFallback(() => this.postgres.getSystemStats())
        }
        break
      case 'redis_only':
      case 'cache_first':
        if (this.isRedisConnected) {
          return this._executeWithFallback(() => this.redis.getSystemStats())
        }
        break
      case 'dual_write':
        // 优先使用 PostgreSQL 的系统统计（更准确）
        if (this.isPostgresConnected) {
          try {
            return await this._executeWithFallback(() => this.postgres.getSystemStats())
          } catch (error) {
            logger.warn('⚠️ PostgreSQL system stats failed, falling back to Redis:', error)
          }
        }
        if (this.isRedisConnected) {
          return this._executeWithFallback(() => this.redis.getSystemStats())
        }
        break
    }

    return { totalApiKeys: 0, totalClaudeAccounts: 0, totalUsageRecords: 0 }
  }

  /**
   * 获取今日系统统计
   */
  async getTodayStats() {
    switch (this.strategy) {
      case 'postgres_only':
      case 'database_first':
        if (this.isPostgresConnected) {
          return this._executeWithFallback(() => this.postgres.getTodayStats())
        }
        break
      case 'redis_only':
      case 'cache_first':
        if (this.isRedisConnected) {
          return this._executeWithFallback(() => this.redis.getTodayStats())
        }
        break
      case 'dual_write':
        // 优先使用 PostgreSQL 的今日统计
        if (this.isPostgresConnected) {
          try {
            return await this._executeWithFallback(() => this.postgres.getTodayStats())
          } catch (error) {
            logger.warn('⚠️ PostgreSQL today stats failed, falling back to Redis:', error)
          }
        }
        if (this.isRedisConnected) {
          return this._executeWithFallback(() => this.redis.getTodayStats())
        }
        break
    }

    return {
      requestsToday: 0,
      tokensToday: 0,
      inputTokensToday: 0,
      outputTokensToday: 0,
      cacheCreateTokensToday: 0,
      cacheReadTokensToday: 0,
      apiKeysCreatedToday: 0
    }
  }

  // =====================================
  // 缓存管理相关方法
  // =====================================

  /**
   * 异步缓存数据到 Redis
   */
  async _cacheToRedis(type, id, data, customTTL = null) {
    if (!this.isRedisConnected) {
      return false
    }

    try {
      const cacheKey = this._getCacheKey(type, id)
      const ttl = customTTL || this._getTTL(type)
      const serializedData = JSON.stringify(data)

      await this.redis.setex(cacheKey, ttl, serializedData)
      this.stats.cacheSets++

      logger.debug(`📝 Cached ${type}:${id} for ${ttl}s`)
      return true
    } catch (error) {
      logger.warn(`⚠️ Failed to cache ${type}:${id}:`, error)
      return false
    }
  }

  /**
   * 清理过期数据
   */
  async cleanup() {
    const operations = []

    if (this.isRedisConnected) {
      operations.push(this._executeWithFallback(() => this.redis.cleanup()))
    }

    if (this.isPostgresConnected) {
      operations.push(this._executeWithFallback(() => this.postgres.cleanup()))
    }

    const results = await Promise.allSettled(operations)
    const successCount = results.filter((r) => r.status === 'fulfilled').length

    logger.info(`🧹 Cleanup completed: ${successCount}/${operations.length} operations succeeded`)
    return successCount > 0
  }

  // =====================================
  // 基础 Redis 操作代理
  // =====================================

  /**
   * 基础 Redis 操作（保持向后兼容）
   */
  async get(key) {
    if (this.isRedisConnected) {
      return this._executeWithFallback(() => this.redis.get(key))
    }
    return null
  }

  async set(key, value, ...args) {
    if (this.isRedisConnected) {
      return this._executeWithFallback(() => this.redis.set(key, value, ...args))
    }
    return false
  }

  async setex(key, ttl, value) {
    if (this.isRedisConnected) {
      return this._executeWithFallback(() => this.redis.setex(key, ttl, value))
    }
    return false
  }

  async del(...keys) {
    if (this.isRedisConnected) {
      return this._executeWithFallback(() => this.redis.del(...keys))
    }
    return 0
  }

  async keys(pattern) {
    if (this.isRedisConnected) {
      return this._executeWithFallback(() => this.redis.keys(pattern))
    }
    return []
  }

  // =====================================
  // 健康检查和统计
  // =====================================

  /**
   * 健康检查
   */
  async healthCheck() {
    const health = {
      redis: false,
      postgres: false,
      strategy: this.strategy,
      overall: false
    }

    if (this.isRedisConnected) {
      try {
        await this.redis.get('health_check')
        health.redis = true
      } catch (error) {
        logger.warn('⚠️ Redis health check failed:', error)
      }
    }

    if (this.isPostgresConnected) {
      try {
        health.postgres = await this.postgres.healthCheck()
      } catch (error) {
        logger.warn('⚠️ PostgreSQL health check failed:', error)
      }
    }

    // 至少一个数据库健康就认为整体健康
    health.overall = health.redis || health.postgres

    return health
  }

  /**
   * 获取性能统计
   */
  getStats() {
    return {
      ...this.stats,
      strategy: this.strategy,
      connections: {
        redis: this.isRedisConnected,
        postgres: this.isPostgresConnected
      }
    }
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      redisHits: 0,
      redisMisses: 0,
      postgresQueries: 0,
      cacheSets: 0,
      errors: 0
    }
  }

  // =====================================
  // 时区辅助函数（与 Redis 兼容）
  // =====================================

  get getDateInTimezone() {
    return this.redis.getDateInTimezone
  }

  get getDateStringInTimezone() {
    return this.redis.getDateStringInTimezone
  }

  get getHourInTimezone() {
    return this.redis.getHourInTimezone
  }

  get getWeekStringInTimezone() {
    return this.redis.getWeekStringInTimezone
  }
}

// 创建单例实例
const databaseManager = new DatabaseManager()

module.exports = databaseManager
