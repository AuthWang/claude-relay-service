const { Pool } = require('pg')
const config = require('../../config/config')
const logger = require('../utils/logger')

// 时区辅助函数（与 Redis 客户端保持一致）
function getDateInTimezone(date = new Date()) {
  const offset = config.system.timezoneOffset || 8 // 默认UTC+8

  // 方法：创建一个偏移后的Date对象，使其getUTCXXX方法返回目标时区的值
  const offsetMs = offset * 3600000 // 时区偏移的毫秒数
  const adjustedTime = new Date(date.getTime() + offsetMs)

  return adjustedTime
}

// 获取配置时区的日期字符串 (YYYY-MM-DD)
function getDateStringInTimezone(date = new Date()) {
  const tzDate = getDateInTimezone(date)
  return `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}-${String(tzDate.getUTCDate()).padStart(2, '0')}`
}

// 获取配置时区的小时 (0-23)
function getHourInTimezone(date = new Date()) {
  const tzDate = getDateInTimezone(date)
  return tzDate.getUTCHours()
}

// 获取配置时区的 ISO 周（YYYY-Wxx 格式，周一到周日）
function getWeekStringInTimezone(date = new Date()) {
  const tzDate = getDateInTimezone(date)

  const year = tzDate.getUTCFullYear()
  const dateObj = new Date(tzDate)
  const dayOfWeek = dateObj.getUTCDay() || 7 // 将周日(0)转换为7
  const firstThursday = new Date(dateObj)
  firstThursday.setUTCDate(dateObj.getUTCDate() + 4 - dayOfWeek) // 找到这周的周四

  const yearStart = new Date(firstThursday.getUTCFullYear(), 0, 1)
  const weekNumber = Math.ceil(((firstThursday - yearStart) / 86400000 + 1) / 7)

  return `${year}-W${String(weekNumber).padStart(2, '0')}`
}

class PostgresClient {
  constructor() {
    this.pool = null
    this.isConnected = false
    this.retryCount = 0
    this.maxRetries = 5
    this.retryInterval = 5000 // 5秒
  }

  async connect() {
    try {
      // 构建数据库连接配置
      const poolConfig = {
        host: config.postgres?.host || 'localhost',
        port: config.postgres?.port || 5432,
        database: config.postgres?.database || 'claude_relay',
        user: config.postgres?.user || 'postgres',
        password: config.postgres?.password || '',

        // 连接池配置
        max: config.postgres?.pool?.max || 20, // 最大连接数
        min: config.postgres?.pool?.min || 5, // 最小连接数
        idleTimeoutMillis: config.postgres?.pool?.idleTimeoutMillis || 30000,
        connectionTimeoutMillis: config.postgres?.pool?.connectionTimeoutMillis || 60000,

        // SSL 配置
        ssl: config.postgres?.ssl?.enabled
          ? {
              rejectUnauthorized: config.postgres.ssl.rejectUnauthorized !== false
            }
          : false,

        // 应用名称
        application_name: 'claude-relay-service',

        // 查询超时
        query_timeout: config.postgres?.queryTimeout || 30000,

        // 连接验证
        statement_timeout: 30000
      }

      this.pool = new Pool(poolConfig)

      // 连接事件监听
      this.pool.on('connect', (_client) => {
        this.isConnected = true
        logger.info('🔗 PostgreSQL connected successfully')
        logger.debug(
          `📊 Pool stats: total=${this.pool.totalCount}, idle=${this.pool.idleCount}, waiting=${this.pool.waitingCount}`
        )
      })

      this.pool.on('error', (err, _client) => {
        this.isConnected = false
        logger.error('❌ PostgreSQL connection error:', err)
        this.handleConnectionError(err)
      })

      this.pool.on('acquire', (_client) => {
        logger.debug('🔄 PostgreSQL client acquired')
      })

      this.pool.on('release', (_client) => {
        logger.debug('🔄 PostgreSQL client released')
      })

      // 测试连接
      const client = await this.pool.connect()
      const result = await client.query('SELECT NOW() as current_time, version() as pg_version')
      logger.info(`🗄️ PostgreSQL connected: ${result.rows[0].pg_version}`)
      logger.info(`⏰ Database time: ${result.rows[0].current_time}`)
      client.release()

      this.isConnected = true
      this.retryCount = 0

      return this.pool
    } catch (error) {
      this.isConnected = false
      logger.error('💥 Failed to connect to PostgreSQL:', error)
      await this.handleConnectionError(error)
      throw error
    }
  }

  async handleConnectionError(_error) {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++
      logger.warn(
        `⚠️ PostgreSQL connection failed, retrying (${this.retryCount}/${this.maxRetries}) in ${this.retryInterval}ms...`
      )

      setTimeout(async () => {
        try {
          await this.connect()
        } catch (retryError) {
          logger.error(`❌ Retry ${this.retryCount} failed:`, retryError)
        }
      }, this.retryInterval)
    } else {
      logger.error('💥 PostgreSQL connection failed after maximum retries')
    }
  }

  async disconnect() {
    if (this.pool) {
      await this.pool.end()
      this.isConnected = false
      logger.info('👋 PostgreSQL disconnected')
    }
  }

  getPool() {
    if (!this.pool || !this.isConnected) {
      logger.warn('⚠️ PostgreSQL pool is not connected')
      return null
    }
    return this.pool
  }

  // 安全获取连接池（用于关键操作）
  getPoolSafe() {
    if (!this.pool || !this.isConnected) {
      throw new Error('PostgreSQL pool is not connected')
    }
    return this.pool
  }

  // 执行查询的通用方法
  async query(text, params = []) {
    const pool = this.getPoolSafe()
    const start = Date.now()

    try {
      const result = await pool.query(text, params)
      const duration = Date.now() - start

      logger.debug(
        `🔍 Query executed in ${duration}ms: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`
      )

      return result
    } catch (error) {
      const duration = Date.now() - start
      logger.error(`❌ Query failed after ${duration}ms:`, error)
      logger.error(`   Query: ${text}`)
      logger.error(`   Params: ${JSON.stringify(params)}`)
      throw error
    }
  }

  // 事务支持
  async withTransaction(callback) {
    const pool = this.getPoolSafe()
    const client = await pool.connect()

    try {
      await client.query('BEGIN')
      logger.debug('🔄 Transaction started')

      const result = await callback(client)

      await client.query('COMMIT')
      logger.debug('✅ Transaction committed')

      return result
    } catch (error) {
      await client.query('ROLLBACK')
      logger.debug('🔄 Transaction rolled back')
      logger.error('❌ Transaction failed:', error)
      throw error
    } finally {
      client.release()
    }
  }

  // 🔑 API Key 相关操作
  async setApiKey(keyId, keyData, hashedKey = null) {
    const insertSQL = `
      INSERT INTO api_keys (
        id, name, description, api_key_hash, token_limit, concurrency_limit,
        daily_cost_limit, weekly_opus_cost_limit, permissions, is_active,
        enable_model_restriction, restricted_models, enable_client_restriction, allowed_clients,
        expires_at, expiration_mode, activation_days, tags, icon, created_at, updated_at, last_used_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        api_key_hash = EXCLUDED.api_key_hash,
        token_limit = EXCLUDED.token_limit,
        concurrency_limit = EXCLUDED.concurrency_limit,
        daily_cost_limit = EXCLUDED.daily_cost_limit,
        weekly_opus_cost_limit = EXCLUDED.weekly_opus_cost_limit,
        permissions = EXCLUDED.permissions,
        is_active = EXCLUDED.is_active,
        enable_model_restriction = EXCLUDED.enable_model_restriction,
        restricted_models = EXCLUDED.restricted_models,
        enable_client_restriction = EXCLUDED.enable_client_restriction,
        allowed_clients = EXCLUDED.allowed_clients,
        expires_at = EXCLUDED.expires_at,
        expiration_mode = EXCLUDED.expiration_mode,
        activation_days = EXCLUDED.activation_days,
        tags = EXCLUDED.tags,
        icon = EXCLUDED.icon,
        updated_at = EXCLUDED.updated_at,
        last_used_at = EXCLUDED.last_used_at
    `

    const params = [
      keyId,
      keyData.name || '',
      keyData.description || '',
      hashedKey || keyData.apiKey,
      parseInt(keyData.tokenLimit) || 0,
      parseInt(keyData.concurrencyLimit) || 0,
      parseFloat(keyData.dailyCostLimit) || 0,
      parseFloat(keyData.weeklyOpusCostLimit) || 0,
      keyData.permissions || 'all',
      keyData.isActive !== 'false',
      keyData.enableModelRestriction === 'true',
      JSON.stringify(JSON.parse(keyData.restrictedModels || '[]')),
      keyData.enableClientRestriction === 'true',
      JSON.stringify(JSON.parse(keyData.allowedClients || '[]')),
      keyData.expiresAt ? new Date(keyData.expiresAt) : null,
      keyData.expirationMode || 'fixed',
      parseInt(keyData.activationDays) || 0,
      JSON.stringify(JSON.parse(keyData.tags || '[]')),
      keyData.icon || null,
      new Date(keyData.createdAt || Date.now()),
      new Date(),
      keyData.lastUsedAt ? new Date(keyData.lastUsedAt) : null
    ]

    await this.query(insertSQL, params)
  }

  async getApiKey(keyId) {
    const selectSQL = 'SELECT * FROM api_keys WHERE id = $1'
    const result = await this.query(selectSQL, [keyId])

    if (result.rows.length === 0) {
      return {}
    }

    const row = result.rows[0]

    // 转换为 Redis 兼容的格式
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      apiKey: row.api_key_hash,
      tokenLimit: row.token_limit.toString(),
      concurrencyLimit: row.concurrency_limit.toString(),
      dailyCostLimit: row.daily_cost_limit.toString(),
      weeklyOpusCostLimit: row.weekly_opus_cost_limit.toString(),
      permissions: row.permissions,
      isActive: row.is_active.toString(),
      enableModelRestriction: row.enable_model_restriction.toString(),
      restrictedModels: JSON.stringify(row.restricted_models),
      enableClientRestriction: row.enable_client_restriction.toString(),
      allowedClients: JSON.stringify(row.allowed_clients),
      expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
      expirationMode: row.expiration_mode,
      activationDays: row.activation_days.toString(),
      tags: JSON.stringify(row.tags),
      icon: row.icon,
      createdAt: row.created_at.toISOString(),
      lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null
    }
  }

  async deleteApiKey(keyId) {
    const deleteSQL = 'DELETE FROM api_keys WHERE id = $1'
    const result = await this.query(deleteSQL, [keyId])
    return result.rowCount
  }

  async getAllApiKeys() {
    const selectSQL = 'SELECT * FROM api_keys ORDER BY created_at DESC'
    const result = await this.query(selectSQL)

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      apiKey: row.api_key_hash,
      tokenLimit: row.token_limit.toString(),
      concurrencyLimit: row.concurrency_limit.toString(),
      dailyCostLimit: row.daily_cost_limit.toString(),
      weeklyOpusCostLimit: row.weekly_opus_cost_limit.toString(),
      permissions: row.permissions,
      isActive: row.is_active.toString(),
      enableModelRestriction: row.enable_model_restriction.toString(),
      restrictedModels: JSON.stringify(row.restricted_models),
      enableClientRestriction: row.enable_client_restriction.toString(),
      allowedClients: JSON.stringify(row.allowed_clients),
      expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
      expirationMode: row.expiration_mode,
      activationDays: row.activation_days.toString(),
      tags: JSON.stringify(row.tags),
      icon: row.icon,
      createdAt: row.created_at.toISOString(),
      lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null
    }))
  }

  // 🔍 通过哈希值查找API Key（性能优化）
  async findApiKeyByHash(hashedKey) {
    const selectSQL = 'SELECT * FROM api_keys WHERE api_key_hash = $1'
    const result = await this.query(selectSQL, [hashedKey])

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      apiKey: row.api_key_hash,
      tokenLimit: row.token_limit.toString(),
      concurrencyLimit: row.concurrency_limit.toString(),
      dailyCostLimit: row.daily_cost_limit.toString(),
      permissions: row.permissions,
      isActive: row.is_active.toString(),
      expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null
    }
  }

  // 📊 使用统计相关操作
  _normalizeModelName(model) {
    if (!model || model === 'unknown') {
      return model
    }

    // 对于Bedrock模型，去掉区域前缀进行统一
    if (model.includes('.anthropic.') || model.includes('.claude')) {
      let normalized = model.replace(/^[a-z0-9-]+\./, '') // 去掉任何区域前缀
      normalized = normalized.replace('anthropic.', '') // 去掉anthropic前缀
      normalized = normalized.replace(/-v\d+:\d+$/, '') // 去掉版本后缀
      return normalized
    }

    // 对于其他模型，去掉常见的版本后缀
    return model.replace(/-v\d+:\d+$|:latest$/, '')
  }

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
    const now = new Date()
    const today = getDateStringInTimezone(now)
    const currentHour = getHourInTimezone(now)
    const normalizedModel = this._normalizeModelName(model)

    // 智能处理输入输出token分配
    const finalInputTokens = inputTokens || 0
    const finalOutputTokens = outputTokens || (finalInputTokens > 0 ? 0 : tokens)
    const finalCacheCreateTokens = cacheCreateTokens || 0
    const finalCacheReadTokens = cacheReadTokens || 0

    const totalTokens =
      finalInputTokens + finalOutputTokens + finalCacheCreateTokens + finalCacheReadTokens
    // const coreTokens = finalInputTokens + finalOutputTokens

    await this.withTransaction(async (client) => {
      // 更新 API Key 总统计
      const updateApiKeySQL = `
        UPDATE api_keys SET
          last_used_at = $2
        WHERE id = $1
      `
      await client.query(updateApiKeySQL, [keyId, now])

      // 插入或更新使用统计 - 每日
      const upsertDailySQL = `
        INSERT INTO usage_statistics (
          api_key_id, usage_date, usage_hour, model_name,
          requests_count, input_tokens, output_tokens, total_tokens,
          cache_create_tokens, cache_read_tokens,
          ephemeral_5m_tokens, ephemeral_1h_tokens,
          long_context_input_tokens, long_context_output_tokens, long_context_requests
        ) VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (api_key_id, usage_date, usage_hour, model_name) DO UPDATE SET
          requests_count = usage_statistics.requests_count + EXCLUDED.requests_count,
          input_tokens = usage_statistics.input_tokens + EXCLUDED.input_tokens,
          output_tokens = usage_statistics.output_tokens + EXCLUDED.output_tokens,
          total_tokens = usage_statistics.total_tokens + EXCLUDED.total_tokens,
          cache_create_tokens = usage_statistics.cache_create_tokens + EXCLUDED.cache_create_tokens,
          cache_read_tokens = usage_statistics.cache_read_tokens + EXCLUDED.cache_read_tokens,
          ephemeral_5m_tokens = usage_statistics.ephemeral_5m_tokens + EXCLUDED.ephemeral_5m_tokens,
          ephemeral_1h_tokens = usage_statistics.ephemeral_1h_tokens + EXCLUDED.ephemeral_1h_tokens,
          long_context_input_tokens = usage_statistics.long_context_input_tokens + EXCLUDED.long_context_input_tokens,
          long_context_output_tokens = usage_statistics.long_context_output_tokens + EXCLUDED.long_context_output_tokens,
          long_context_requests = usage_statistics.long_context_requests + EXCLUDED.long_context_requests
      `

      const dailyParams = [
        keyId,
        today,
        normalizedModel,
        1, // requests_count
        finalInputTokens,
        finalOutputTokens,
        totalTokens,
        finalCacheCreateTokens,
        finalCacheReadTokens,
        ephemeral5mTokens,
        ephemeral1hTokens,
        isLongContextRequest ? finalInputTokens : 0,
        isLongContextRequest ? finalOutputTokens : 0,
        isLongContextRequest ? 1 : 0
      ]

      await client.query(upsertDailySQL, dailyParams)

      // 插入或更新使用统计 - 每小时
      const upsertHourlySQL = `
        INSERT INTO usage_statistics (
          api_key_id, usage_date, usage_hour, model_name,
          requests_count, input_tokens, output_tokens, total_tokens,
          cache_create_tokens, cache_read_tokens
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (api_key_id, usage_date, usage_hour, model_name) DO UPDATE SET
          requests_count = usage_statistics.requests_count + EXCLUDED.requests_count,
          input_tokens = usage_statistics.input_tokens + EXCLUDED.input_tokens,
          output_tokens = usage_statistics.output_tokens + EXCLUDED.output_tokens,
          total_tokens = usage_statistics.total_tokens + EXCLUDED.total_tokens,
          cache_create_tokens = usage_statistics.cache_create_tokens + EXCLUDED.cache_create_tokens,
          cache_read_tokens = usage_statistics.cache_read_tokens + EXCLUDED.cache_read_tokens
      `

      const hourlyParams = [
        keyId,
        today,
        currentHour,
        normalizedModel,
        1, // requests_count
        finalInputTokens,
        finalOutputTokens,
        totalTokens,
        finalCacheCreateTokens,
        finalCacheReadTokens
      ]

      await client.query(upsertHourlySQL, hourlyParams)
    })
  }

  // 📊 获取使用统计
  async getUsageStats(keyId) {
    const today = getDateStringInTimezone()
    const tzDate = getDateInTimezone()
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}`

    // 获取总统计
    const totalSQL = `
      SELECT
        COALESCE(SUM(requests_count), 0) as total_requests,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(SUM(cache_create_tokens), 0) as total_cache_create_tokens,
        COALESCE(SUM(cache_read_tokens), 0) as total_cache_read_tokens
      FROM usage_statistics
      WHERE api_key_id = $1 AND usage_hour IS NULL
    `

    // 获取今日统计
    const dailySQL = `
      SELECT
        COALESCE(SUM(requests_count), 0) as requests,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(total_tokens), 0) as tokens,
        COALESCE(SUM(cache_create_tokens), 0) as cache_create_tokens,
        COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens
      FROM usage_statistics
      WHERE api_key_id = $1 AND usage_date = $2 AND usage_hour IS NULL
    `

    // 获取本月统计
    const monthlySQL = `
      SELECT
        COALESCE(SUM(requests_count), 0) as requests,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(total_tokens), 0) as tokens,
        COALESCE(SUM(cache_create_tokens), 0) as cache_create_tokens,
        COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens
      FROM usage_statistics
      WHERE api_key_id = $1 AND usage_date >= $2 AND usage_hour IS NULL
    `

    const [totalResult, dailyResult, monthlyResult] = await Promise.all([
      this.query(totalSQL, [keyId]),
      this.query(dailySQL, [keyId, today]),
      this.query(monthlySQL, [keyId, `${currentMonth}-01`])
    ])

    // 获取API Key创建时间用于计算平均值
    const keyData = await this.getApiKey(keyId)
    const createdAt = keyData.createdAt ? new Date(keyData.createdAt) : new Date()
    const now = new Date()
    const daysSinceCreated = Math.max(1, Math.ceil((now - createdAt) / (1000 * 60 * 60 * 24)))

    const totalTokens = parseInt(totalResult.rows[0].total_tokens) || 0
    const totalRequests = parseInt(totalResult.rows[0].total_requests) || 0

    // 计算平均RPM和TPM
    const totalMinutes = Math.max(1, daysSinceCreated * 24 * 60)
    const avgRPM = totalRequests / totalMinutes
    const avgTPM = totalTokens / totalMinutes

    const handlePostgresData = (row) => {
      const tokens = parseInt(row.tokens || row.total_tokens) || 0
      const inputTokens = parseInt(row.input_tokens) || 0
      const outputTokens = parseInt(row.output_tokens) || 0
      const requests = parseInt(row.requests || row.total_requests) || 0
      const cacheCreateTokens = parseInt(row.cache_create_tokens) || 0
      const cacheReadTokens = parseInt(row.cache_read_tokens) || 0
      const allTokens = inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens

      return {
        tokens: allTokens || tokens,
        inputTokens,
        outputTokens,
        cacheCreateTokens,
        cacheReadTokens,
        allTokens: allTokens || tokens,
        requests
      }
    }

    return {
      total: handlePostgresData(totalResult.rows[0]),
      daily: handlePostgresData(dailyResult.rows[0]),
      monthly: handlePostgresData(monthlyResult.rows[0]),
      averages: {
        rpm: Math.round(avgRPM * 100) / 100,
        tpm: Math.round(avgTPM * 100) / 100,
        dailyRequests: Math.round((totalRequests / daysSinceCreated) * 100) / 100,
        dailyTokens: Math.round((totalTokens / daysSinceCreated) * 100) / 100
      }
    }
  }

  // 🔐 会话管理
  async setSession(sessionId, sessionData, ttl = 86400) {
    const expiresAt = new Date(Date.now() + ttl * 1000)

    const insertSQL = `
      INSERT INTO user_sessions (id, session_token, session_data, expires_at, created_at, last_activity)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (session_token) DO UPDATE SET
        session_data = EXCLUDED.session_data,
        expires_at = EXCLUDED.expires_at,
        last_activity = EXCLUDED.last_activity
    `

    const params = [
      sessionId,
      sessionId, // 使用 sessionId 作为 token
      JSON.stringify(sessionData),
      expiresAt,
      new Date(),
      new Date()
    ]

    await this.query(insertSQL, params)
  }

  async getSession(sessionId) {
    const selectSQL = `
      SELECT session_data, expires_at
      FROM user_sessions
      WHERE session_token = $1 AND expires_at > NOW()
    `

    const result = await this.query(selectSQL, [sessionId])

    if (result.rows.length === 0) {
      return {}
    }

    return result.rows[0].session_data || {}
  }

  async deleteSession(sessionId) {
    const deleteSQL = 'DELETE FROM user_sessions WHERE session_token = $1'
    const result = await this.query(deleteSQL, [sessionId])
    return result.rowCount
  }

  // 🧹 清理过期数据
  async cleanup() {
    try {
      const cleanupSQL = `
        DELETE FROM user_sessions WHERE expires_at < NOW();

        DELETE FROM usage_statistics
        WHERE usage_date < CURRENT_DATE - INTERVAL '90 days'
        AND usage_hour IS NOT NULL;
      `

      await this.query(cleanupSQL)
      logger.info('🧹 PostgreSQL cleanup completed')
    } catch (error) {
      logger.error('❌ PostgreSQL cleanup failed:', error)
    }
  }

  // 📈 系统统计
  async getSystemStats() {
    const statsSQL = `
      SELECT
        (SELECT COUNT(*) FROM api_keys) as total_api_keys,
        (SELECT COUNT(*) FROM claude_accounts) as total_claude_accounts,
        (SELECT COUNT(*) FROM usage_statistics) as total_usage_records
    `

    const result = await this.query(statsSQL)
    const stats = result.rows[0]

    return {
      totalApiKeys: parseInt(stats.total_api_keys) || 0,
      totalClaudeAccounts: parseInt(stats.total_claude_accounts) || 0,
      totalUsageRecords: parseInt(stats.total_usage_records) || 0
    }
  }

  // 📊 获取今日系统统计
  async getTodayStats() {
    try {
      const today = getDateStringInTimezone()

      const todayStatsSQL = `
        SELECT
          COALESCE(SUM(requests_count), 0) as requests_today,
          COALESCE(SUM(input_tokens), 0) as input_tokens_today,
          COALESCE(SUM(output_tokens), 0) as output_tokens_today,
          COALESCE(SUM(total_tokens), 0) as tokens_today,
          COALESCE(SUM(cache_create_tokens), 0) as cache_create_tokens_today,
          COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens_today
        FROM usage_statistics
        WHERE usage_date = $1 AND usage_hour IS NULL
      `

      const apiKeysCreatedSQL = `
        SELECT COUNT(*) as api_keys_created_today
        FROM api_keys
        WHERE created_at::date = $1
      `

      const [statsResult, keysResult] = await Promise.all([
        this.query(todayStatsSQL, [today]),
        this.query(apiKeysCreatedSQL, [today])
      ])

      const stats = statsResult.rows[0]
      const keyCount = keysResult.rows[0]

      return {
        requestsToday: parseInt(stats.requests_today) || 0,
        tokensToday: parseInt(stats.tokens_today) || 0,
        inputTokensToday: parseInt(stats.input_tokens_today) || 0,
        outputTokensToday: parseInt(stats.output_tokens_today) || 0,
        cacheCreateTokensToday: parseInt(stats.cache_create_tokens_today) || 0,
        cacheReadTokensToday: parseInt(stats.cache_read_tokens_today) || 0,
        apiKeysCreatedToday: parseInt(keyCount.api_keys_created_today) || 0
      }
    } catch (error) {
      logger.error('Error getting today stats from PostgreSQL:', error)
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
  }

  // 健康检查
  async healthCheck() {
    try {
      const result = await this.query('SELECT 1 as health')
      return result.rows[0].health === 1
    } catch (error) {
      logger.error('PostgreSQL health check failed:', error)
      return false
    }
  }

  // 获取连接池状态
  getPoolStats() {
    if (!this.pool) {
      return { connected: false }
    }

    return {
      connected: this.isConnected,
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount
    }
  }
}

const postgresClient = new PostgresClient()

// 导出时区辅助函数（与Redis客户端保持一致）
postgresClient.getDateInTimezone = getDateInTimezone
postgresClient.getDateStringInTimezone = getDateStringInTimezone
postgresClient.getHourInTimezone = getHourInTimezone
postgresClient.getWeekStringInTimezone = getWeekStringInTimezone

module.exports = postgresClient
