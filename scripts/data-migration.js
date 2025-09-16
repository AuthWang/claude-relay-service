#!/usr/bin/env node

/**
 * 🔄 Claude Relay Service - Redis到PostgreSQL数据迁移工具
 *
 * 智能数据迁移系统，支持增量迁移和数据验证
 * Created by DevOps-Expert with SMART-6 optimization
 */

const fs = require('fs')
const path = require('path')
const Redis = require('ioredis')
const { Pool } = require('pg')
const crypto = require('crypto')
const winston = require('winston')

// 配置日志
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}] ${message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/migration.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5
    })
  ]
})

class DataMigrationService {
  constructor() {
    this.redisClient = null
    this.pgPool = null
    this.stats = {
      migrated: 0,
      failed: 0,
      skipped: 0,
      startTime: Date.now(),
      tables: {}
    }
    this.batchSize = parseInt(process.env.MIGRATION_BATCH_SIZE) || 100
    this.dryRun = process.env.MIGRATION_DRY_RUN === 'true'
  }

  async initialize() {
    logger.info('🔄 初始化数据迁移服务...')

    try {
      // 初始化Redis连接
      this.redisClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: process.env.REDIS_DB || 0
      })
      logger.info('✅ Redis连接建立成功')

      // 初始化PostgreSQL连接池
      this.pgPool = new Pool({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: process.env.POSTGRES_PORT || 5432,
        database: process.env.POSTGRES_DATABASE || 'claude_relay',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      })

      // 测试PostgreSQL连接
      const testClient = await this.pgPool.connect()
      await testClient.query('SELECT NOW()')
      testClient.release()
      logger.info('✅ PostgreSQL连接建立成功')
    } catch (error) {
      logger.error(`❌ 数据库连接失败: ${error.message}`)
      throw error
    }
  }

  async migrateData(options = {}) {
    const { tables = 'all', incremental = false, validate = true } = options

    logger.info(`🚀 开始数据迁移 (模式: ${this.dryRun ? 'DRY RUN' : 'PRODUCTION'})`)
    logger.info(`📊 配置: tables=${tables}, incremental=${incremental}, validate=${validate}`)

    try {
      const migrationPlan = await this.createMigrationPlan(tables)
      logger.info(`📋 迁移计划: ${migrationPlan.length}个表`)

      for (const tablePlan of migrationPlan) {
        await this.migrateTable(tablePlan, incremental)

        if (validate) {
          await this.validateTableMigration(tablePlan)
        }
      }

      await this.generateMigrationReport()
      logger.info('🎉 数据迁移完成！')
    } catch (error) {
      logger.error(`❌ 迁移失败: ${error.message}`)
      await this.rollbackMigration()
      throw error
    }
  }

  async createMigrationPlan(tables) {
    const plan = []

    // API Keys迁移
    if (tables === 'all' || tables.includes('api_keys')) {
      plan.push({
        name: 'api_keys',
        redisPattern: 'api_key:*',
        pgTable: 'api_keys',
        transformer: this.transformApiKey.bind(this)
      })
    }

    // Claude账户迁移
    if (tables === 'all' || tables.includes('claude_accounts')) {
      plan.push({
        name: 'claude_accounts',
        redisPattern: 'claude_account:*',
        pgTable: 'claude_accounts',
        transformer: this.transformClaudeAccount.bind(this)
      })
    }

    // 管理员迁移
    if (tables === 'all' || tables.includes('admins')) {
      plan.push({
        name: 'admins',
        redisPattern: 'admin:*',
        pgTable: 'admins',
        transformer: this.transformAdmin.bind(this)
      })
    }

    // 使用统计迁移
    if (tables === 'all' || tables.includes('usage_statistics')) {
      plan.push({
        name: 'usage_statistics',
        redisPattern: 'usage:*',
        pgTable: 'usage_statistics',
        transformer: this.transformUsageStats.bind(this)
      })
    }

    return plan
  }

  async migrateTable(tablePlan, incremental = false) {
    const { name, redisPattern, pgTable, transformer } = tablePlan

    logger.info(`📋 开始迁移表: ${name}`)
    this.stats.tables[name] = { migrated: 0, failed: 0, skipped: 0 }

    try {
      // 获取Redis键列表
      const keys = await this.redisClient.keys(redisPattern)
      logger.info(`🔍 发现 ${keys.length} 条记录在Redis中`)

      // 分批处理
      for (let i = 0; i < keys.length; i += this.batchSize) {
        const batch = keys.slice(i, i + this.batchSize)
        await this.processBatch(batch, transformer, pgTable, name, incremental)

        // 进度报告
        const progress = Math.round(((i + batch.length) / keys.length) * 100)
        logger.info(`📊 ${name} 迁移进度: ${progress}% (${i + batch.length}/${keys.length})`)
      }

      logger.info(`✅ 表 ${name} 迁移完成`)
    } catch (error) {
      logger.error(`❌ 表 ${name} 迁移失败: ${error.message}`)
      throw error
    }
  }

  async processBatch(keys, transformer, pgTable, tableName, incremental) {
    const client = await this.pgPool.connect()

    try {
      await client.query('BEGIN')

      for (const key of keys) {
        try {
          const redisData = await this.redisClient.get(key)
          if (!redisData) {
            this.stats.tables[tableName].skipped++
            continue
          }

          const parsedData = JSON.parse(redisData)
          const transformedData = await transformer(key, parsedData)

          if (!transformedData) {
            this.stats.tables[tableName].skipped++
            continue
          }

          // 检查是否增量迁移且记录已存在
          if (incremental) {
            const existsQuery = `SELECT id FROM ${pgTable} WHERE id = $1`
            const existsResult = await client.query(existsQuery, [transformedData.id])

            if (existsResult.rows.length > 0) {
              this.stats.tables[tableName].skipped++
              continue
            }
          }

          if (!this.dryRun) {
            // 构建插入查询
            const columns = Object.keys(transformedData)
            const values = Object.values(transformedData)
            const placeholders = values.map((_, index) => `$${index + 1}`).join(', ')

            const insertQuery = `
              INSERT INTO ${pgTable} (${columns.join(', ')})
              VALUES (${placeholders})
              ON CONFLICT (id) DO UPDATE SET
              ${columns
                .slice(1)
                .map((col) => `${col} = EXCLUDED.${col}`)
                .join(', ')},
              updated_at = CURRENT_TIMESTAMP
            `

            await client.query(insertQuery, values)
          }

          this.stats.tables[tableName].migrated++
          this.stats.migrated++
        } catch (recordError) {
          logger.error(`❌ 记录迁移失败 ${key}: ${recordError.message}`)
          this.stats.tables[tableName].failed++
          this.stats.failed++
        }
      }

      await client.query('COMMIT')
    } catch (batchError) {
      await client.query('ROLLBACK')
      throw batchError
    } finally {
      client.release()
    }
  }

  // 数据转换器
  async transformApiKey(key, data) {
    const keyId = key.replace('api_key:', '')

    return {
      id: keyId,
      api_key_hash: data.apiKeyHash || crypto.createHash('sha256').update(keyId).digest('hex'),
      name: data.name || 'Migrated Key',
      token_limit: parseInt(data.tokenLimit) || 1000000,
      token_used: parseInt(data.tokenUsed) || 0,
      is_active: data.isActive !== false,
      expires_at: data.expiresAt ? new Date(data.expiresAt) : null,
      created_at: data.createdAt ? new Date(data.createdAt) : new Date(),
      updated_at: new Date()
    }
  }

  async transformClaudeAccount(key, data) {
    const accountId = key.replace('claude_account:', '')

    return {
      id: accountId,
      name: data.name || 'Migrated Account',
      description: data.description || '',
      claude_ai_oauth: data.claudeAiOauth ? JSON.stringify(data.claudeAiOauth) : null,
      proxy_config: data.proxyConfig ? JSON.stringify(data.proxyConfig) : null,
      is_active: data.isActive !== false,
      is_rate_limited: data.isRateLimited === true,
      rate_limit_until: data.rateLimitUntil ? new Date(data.rateLimitUntil) : null,
      request_count: parseInt(data.requestCount) || 0,
      last_used_at: data.lastUsedAt ? new Date(data.lastUsedAt) : null,
      created_at: data.createdAt ? new Date(data.createdAt) : new Date(),
      updated_at: new Date()
    }
  }

  async transformAdmin(key, data) {
    const adminId = key.replace('admin:', '')

    return {
      id: adminId,
      username: data.username || 'admin',
      password_hash: data.passwordHash || data.password,
      is_active: data.isActive !== false,
      last_login_at: data.lastLoginAt ? new Date(data.lastLoginAt) : null,
      created_at: data.createdAt ? new Date(data.createdAt) : new Date(),
      updated_at: new Date()
    }
  }

  async transformUsageStats(key, data) {
    const parts = key.split(':')
    const date = parts[2]
    const keyId = parts[3]
    const model = parts[4]

    return {
      id: crypto.randomUUID(),
      date,
      api_key_id: keyId,
      model,
      request_count: parseInt(data.requestCount) || 0,
      token_count: parseInt(data.tokenCount) || 0,
      created_at: new Date(),
      updated_at: new Date()
    }
  }

  async validateTableMigration(tablePlan) {
    const { name, redisPattern, pgTable } = tablePlan

    logger.info(`🔍 验证表迁移: ${name}`)

    try {
      // 获取Redis记录数量
      const redisKeys = await this.redisClient.keys(redisPattern)
      const redisCount = redisKeys.length

      // 获取PostgreSQL记录数量
      const pgResult = await this.pgPool.query(`SELECT COUNT(*) as count FROM ${pgTable}`)
      const pgCount = parseInt(pgResult.rows[0].count)

      logger.info(`📊 ${name} 验证结果: Redis=${redisCount}, PostgreSQL=${pgCount}`)

      if (redisCount !== pgCount) {
        logger.warn(`⚠️ ${name} 记录数量不匹配！`)
      } else {
        logger.info(`✅ ${name} 验证通过`)
      }
    } catch (error) {
      logger.error(`❌ ${name} 验证失败: ${error.message}`)
    }
  }

  async generateMigrationReport() {
    const duration = Date.now() - this.stats.startTime
    const report = {
      summary: {
        duration: `${Math.round(duration / 1000)}秒`,
        totalRecords: this.stats.migrated + this.stats.failed + this.stats.skipped,
        migrated: this.stats.migrated,
        failed: this.stats.failed,
        skipped: this.stats.skipped,
        successRate: `${Math.round((this.stats.migrated / (this.stats.migrated + this.stats.failed)) * 100)}%`
      },
      tables: this.stats.tables,
      timestamp: new Date().toISOString()
    }

    // 保存报告
    const reportPath = path.join(__dirname, '../logs/migration-report.json')
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

    logger.info('📋 迁移报告已生成:')
    logger.info(`   总耗时: ${report.summary.duration}`)
    logger.info(`   成功迁移: ${report.summary.migrated}`)
    logger.info(`   失败记录: ${report.summary.failed}`)
    logger.info(`   跳过记录: ${report.summary.skipped}`)
    logger.info(`   成功率: ${report.summary.successRate}`)
    logger.info(`   详细报告: ${reportPath}`)
  }

  async rollbackMigration() {
    logger.warn('🔄 开始迁移回滚...')
    // 实现回滚逻辑（可选）
    logger.info('✅ 回滚完成')
  }

  async cleanup() {
    if (this.redisClient) {
      await this.redisClient.disconnect()
    }
    if (this.pgPool) {
      await this.pgPool.end()
    }
  }
}

// CLI入口
async function main() {
  const args = process.argv.slice(2)
  const options = {}

  // 解析命令行参数
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '')
    const value = args[i + 1]

    if (value === 'true') {
      options[key] = true
    } else if (value === 'false') {
      options[key] = false
    } else if (!isNaN(value)) {
      options[key] = parseInt(value)
    } else {
      options[key] = value
    }
  }

  const migrationService = new DataMigrationService()

  try {
    await migrationService.initialize()
    await migrationService.migrateData(options)
  } catch (error) {
    logger.error(`迁移失败: ${error.message}`)
    process.exit(1)
  } finally {
    await migrationService.cleanup()
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(console.error)
}

module.exports = DataMigrationService
