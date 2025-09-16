#!/usr/bin/env node

/**
 * 🗄️ Claude Relay Service - 数据库初始化脚本
 *
 * 自动创建PostgreSQL表结构和索引
 * Created by DevOps-Expert with SMART-6 optimization
 */

const { Pool } = require('pg')
const winston = require('winston')
const path = require('path')

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
      filename: path.join(__dirname, '../logs/database-init.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 3
    })
  ]
})

class DatabaseInitializer {
  constructor() {
    this.pool = null
    this.tables = this.getTableDefinitions()
  }

  async initialize() {
    logger.info('🗄️ 初始化数据库连接...')

    this.pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: process.env.POSTGRES_PORT || 5432,
      database: process.env.POSTGRES_DATABASE || 'claude_relay',
      user: process.env.POSTGRES_USER || 'postgres',
      password: String(process.env.POSTGRES_PASSWORD || ''),
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl:
        process.env.POSTGRES_SSL_ENABLED === 'true'
          ? {
              rejectUnauthorized: process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED !== 'false'
            }
          : false
    })

    // 测试连接
    const client = await this.pool.connect()
    await client.query('SELECT NOW()')
    client.release()

    logger.info('✅ 数据库连接成功')
  }

  getTableDefinitions() {
    return {
      // API Keys表
      api_keys: {
        schema: `
          CREATE TABLE IF NOT EXISTS api_keys (
            id VARCHAR(64) PRIMARY KEY,
            api_key_hash VARCHAR(128) UNIQUE NOT NULL,
            name VARCHAR(255) NOT NULL DEFAULT 'API Key',
            token_limit BIGINT NOT NULL DEFAULT 1000000,
            token_used BIGINT NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            expires_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `,
        indexes: [
          'CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(api_key_hash)',
          'CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active) WHERE is_active = true',
          'CREATE INDEX IF NOT EXISTS idx_api_keys_expires ON api_keys(expires_at) WHERE expires_at IS NOT NULL'
        ],
        description: 'API密钥管理表'
      },

      // Claude账户表
      claude_accounts: {
        schema: `
          CREATE TABLE IF NOT EXISTS claude_accounts (
            id VARCHAR(64) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT DEFAULT '',
            claude_ai_oauth TEXT, -- 加密存储的OAuth数据
            proxy_config JSONB,
            is_active BOOLEAN NOT NULL DEFAULT true,
            is_rate_limited BOOLEAN NOT NULL DEFAULT false,
            rate_limit_until TIMESTAMP,
            request_count BIGINT NOT NULL DEFAULT 0,
            last_used_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `,
        indexes: [
          'CREATE INDEX IF NOT EXISTS idx_claude_accounts_active ON claude_accounts(is_active) WHERE is_active = true',
          'CREATE INDEX IF NOT EXISTS idx_claude_accounts_rate_limited ON claude_accounts(is_rate_limited, rate_limit_until) WHERE is_rate_limited = true',
          'CREATE INDEX IF NOT EXISTS idx_claude_accounts_last_used ON claude_accounts(last_used_at)',
          'CREATE INDEX IF NOT EXISTS idx_claude_accounts_proxy ON claude_accounts USING GIN(proxy_config) WHERE proxy_config IS NOT NULL'
        ],
        description: 'Claude账户管理表'
      },

      // Gemini账户表
      gemini_accounts: {
        schema: `
          CREATE TABLE IF NOT EXISTS gemini_accounts (
            id VARCHAR(64) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT DEFAULT '',
            google_oauth TEXT, -- 加密存储的OAuth数据
            proxy_config JSONB,
            is_active BOOLEAN NOT NULL DEFAULT true,
            is_rate_limited BOOLEAN NOT NULL DEFAULT false,
            rate_limit_until TIMESTAMP,
            request_count BIGINT NOT NULL DEFAULT 0,
            last_used_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `,
        indexes: [
          'CREATE INDEX IF NOT EXISTS idx_gemini_accounts_active ON gemini_accounts(is_active) WHERE is_active = true',
          'CREATE INDEX IF NOT EXISTS idx_gemini_accounts_rate_limited ON gemini_accounts(is_rate_limited, rate_limit_until) WHERE is_rate_limited = true',
          'CREATE INDEX IF NOT EXISTS idx_gemini_accounts_last_used ON gemini_accounts(last_used_at)'
        ],
        description: 'Gemini账户管理表'
      },

      // 管理员表
      admins: {
        schema: `
          CREATE TABLE IF NOT EXISTS admins (
            id VARCHAR(64) PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT true,
            last_login_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `,
        indexes: [
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_username ON admins(username)',
          'CREATE INDEX IF NOT EXISTS idx_admins_active ON admins(is_active) WHERE is_active = true'
        ],
        description: '管理员账户表'
      },

      // 使用统计表
      usage_statistics: {
        schema: `
          CREATE TABLE IF NOT EXISTS usage_statistics (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            date DATE NOT NULL,
            api_key_id VARCHAR(64) NOT NULL,
            model VARCHAR(100) NOT NULL,
            request_count BIGINT NOT NULL DEFAULT 0,
            token_count BIGINT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_usage_api_key FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
          )
        `,
        indexes: [
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_unique ON usage_statistics(date, api_key_id, model)',
          'CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_statistics(date)',
          'CREATE INDEX IF NOT EXISTS idx_usage_api_key ON usage_statistics(api_key_id)',
          'CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_statistics(model)',
          'CREATE INDEX IF NOT EXISTS idx_usage_date_model ON usage_statistics(date, model)'
        ],
        description: '使用统计表'
      },

      // 会话表
      sessions: {
        schema: `
          CREATE TABLE IF NOT EXISTS sessions (
            id VARCHAR(128) PRIMARY KEY,
            admin_id VARCHAR(64) NOT NULL,
            data JSONB,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_sessions_admin FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
          )
        `,
        indexes: [
          'CREATE INDEX IF NOT EXISTS idx_sessions_admin ON sessions(admin_id)',
          'CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)',
          'CREATE INDEX IF NOT EXISTS idx_sessions_data ON sessions USING GIN(data) WHERE data IS NOT NULL'
        ],
        description: '会话管理表'
      },

      // 系统日志表
      system_logs: {
        schema: `
          CREATE TABLE IF NOT EXISTS system_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            level VARCHAR(20) NOT NULL,
            message TEXT NOT NULL,
            metadata JSONB,
            component VARCHAR(100),
            api_key_id VARCHAR(64),
            account_id VARCHAR(64),
            ip_address INET,
            user_agent TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `,
        indexes: [
          'CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level)',
          'CREATE INDEX IF NOT EXISTS idx_logs_component ON system_logs(component)',
          'CREATE INDEX IF NOT EXISTS idx_logs_created_at ON system_logs(created_at)',
          'CREATE INDEX IF NOT EXISTS idx_logs_api_key ON system_logs(api_key_id) WHERE api_key_id IS NOT NULL',
          'CREATE INDEX IF NOT EXISTS idx_logs_account ON system_logs(account_id) WHERE account_id IS NOT NULL',
          'CREATE INDEX IF NOT EXISTS idx_logs_metadata ON system_logs USING GIN(metadata) WHERE metadata IS NOT NULL'
        ],
        description: '系统日志表'
      },

      // 系统配置表
      system_configs: {
        schema: `
          CREATE TABLE IF NOT EXISTS system_configs (
            key VARCHAR(255) PRIMARY KEY,
            value JSONB NOT NULL,
            description TEXT,
            is_encrypted BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `,
        indexes: [
          'CREATE INDEX IF NOT EXISTS idx_configs_encrypted ON system_configs(is_encrypted) WHERE is_encrypted = true'
        ],
        description: '系统配置表'
      }
    }
  }

  async createDatabase() {
    logger.info('🏗️ 开始创建数据库表结构...')

    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      // 确保UUID扩展存在
      await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
      await client.query('CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"')

      logger.info('✅ 数据库扩展已启用')

      // 创建表
      for (const [tableName, tableConfig] of Object.entries(this.tables)) {
        logger.info(`📋 创建表: ${tableName}`)

        // 创建表结构
        await client.query(tableConfig.schema)
        logger.info(`  ✅ 表结构创建完成: ${tableName}`)

        // 创建索引
        for (const indexQuery of tableConfig.indexes) {
          await client.query(indexQuery)
        }
        logger.info(`  ✅ 索引创建完成: ${tableName} (${tableConfig.indexes.length}个)`)
      }

      // 创建触发器函数
      await this.createTriggers(client)

      // 插入初始数据
      await this.insertInitialData(client)

      await client.query('COMMIT')
      logger.info('🎉 数据库结构创建完成！')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async createTriggers(client) {
    logger.info('⚡ 创建触发器...')

    // 自动更新 updated_at 字段的触发器函数
    const updateTimestampFunction = `
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `

    await client.query(updateTimestampFunction)

    // 为需要的表添加触发器
    const tablesWithUpdateTrigger = [
      'api_keys',
      'claude_accounts',
      'gemini_accounts',
      'admins',
      'usage_statistics',
      'sessions',
      'system_configs'
    ]

    for (const tableName of tablesWithUpdateTrigger) {
      const triggerQuery = `
        DROP TRIGGER IF EXISTS update_${tableName}_updated_at ON ${tableName};
        CREATE TRIGGER update_${tableName}_updated_at
          BEFORE UPDATE ON ${tableName}
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
      `

      await client.query(triggerQuery)
      logger.info(`  ✅ 触发器创建完成: ${tableName}`)
    }

    logger.info('✅ 所有触发器创建完成')
  }

  async insertInitialData(client) {
    logger.info('📝 插入初始数据...')

    // 插入系统配置
    const systemConfigs = [
      {
        key: 'database_version',
        value: JSON.stringify({ version: '1.0.0', created_at: new Date().toISOString() }),
        description: '数据库版本信息'
      },
      {
        key: 'migration_status',
        value: JSON.stringify({ completed: false, last_migration: null }),
        description: '数据迁移状态'
      },
      {
        key: 'system_stats',
        value: JSON.stringify({ initialized_at: new Date().toISOString() }),
        description: '系统统计信息'
      }
    ]

    for (const config of systemConfigs) {
      const insertQuery = `
        INSERT INTO system_configs (key, value, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = CURRENT_TIMESTAMP
      `

      await client.query(insertQuery, [config.key, config.value, config.description])
    }

    logger.info('✅ 初始数据插入完成')
  }

  async checkTableExists(tableName) {
    const client = await this.pool.connect()

    try {
      const result = await client.query(
        `
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        )
      `,
        [tableName]
      )

      return result.rows[0].exists
    } finally {
      client.release()
    }
  }

  async getTableInfo() {
    const client = await this.pool.connect()

    try {
      const result = await client.query(`
        SELECT
          t.table_name,
          t.table_type,
          c.column_count,
          i.index_count
        FROM information_schema.tables t
        LEFT JOIN (
          SELECT
            table_name,
            COUNT(*) as column_count
          FROM information_schema.columns
          WHERE table_schema = 'public'
          GROUP BY table_name
        ) c ON t.table_name = c.table_name
        LEFT JOIN (
          SELECT
            tablename,
            COUNT(*) as index_count
          FROM pg_indexes
          WHERE schemaname = 'public'
          GROUP BY tablename
        ) i ON t.table_name = i.tablename
        WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name
      `)

      return result.rows
    } finally {
      client.release()
    }
  }

  async generateReport() {
    logger.info('📊 生成数据库报告...')

    const tableInfo = await this.getTableInfo()
    const client = await this.pool.connect()

    try {
      const report = {
        summary: {
          totalTables: tableInfo.length,
          totalColumns: tableInfo.reduce((sum, table) => sum + (table.column_count || 0), 0),
          totalIndexes: tableInfo.reduce((sum, table) => sum + (table.index_count || 0), 0),
          createdAt: new Date().toISOString()
        },
        tables: {}
      }

      // 获取每个表的详细信息
      for (const table of tableInfo) {
        const tableName = table.table_name

        // 获取行数
        const countResult = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`)
        const rowCount = parseInt(countResult.rows[0].count)

        report.tables[tableName] = {
          columns: table.column_count || 0,
          indexes: table.index_count || 0,
          rows: rowCount,
          description: this.tables[tableName]?.description || '未知表'
        }
      }

      // 保存报告
      const reportPath = path.join(__dirname, '../logs/database-report.json')
      require('fs').writeFileSync(reportPath, JSON.stringify(report, null, 2))

      logger.info('📋 数据库初始化报告:')
      logger.info(`   表数量: ${report.summary.totalTables}`)
      logger.info(`   字段数量: ${report.summary.totalColumns}`)
      logger.info(`   索引数量: ${report.summary.totalIndexes}`)
      logger.info(`   详细报告: ${reportPath}`)

      return report
    } finally {
      client.release()
    }
  }

  async cleanup() {
    if (this.pool) {
      await this.pool.end()
      logger.info('✅ 数据库连接已关闭')
    }
  }
}

// CLI入口
async function main() {
  const initializer = new DatabaseInitializer()

  try {
    await initializer.initialize()

    // 检查是否强制重新创建
    const forceRecreate = process.argv.includes('--force')

    if (forceRecreate) {
      logger.warn('⚠️ 强制重新创建模式，将删除现有表')
      // 这里可以添加删除现有表的逻辑
    }

    // 创建数据库结构
    await initializer.createDatabase()

    // 生成报告
    await initializer.generateReport()

    logger.info('🎉 数据库初始化成功完成！')
  } catch (error) {
    logger.error(`❌ 数据库初始化失败: ${error.message}`)
    console.error('详细错误:', error)
    process.exit(1)
  } finally {
    await initializer.cleanup()
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(console.error)
}

module.exports = DatabaseInitializer
